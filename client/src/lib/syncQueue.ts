import { 
  getPendingInterviews, 
  updateInterviewStatus, 
  deletePendingInterview,
  type PendingInterview 
} from './offlineStorage';
import { apiRequest } from './queryClient';

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

let isSyncing = false;
let syncListeners: Array<(status: SyncStatus) => void> = [];

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt?: Date;
  currentItem?: string;
}

export function addSyncListener(listener: (status: SyncStatus) => void): () => void {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(l => l !== listener);
  };
}

function notifyListeners(status: SyncStatus) {
  syncListeners.forEach(listener => listener(status));
}

function calculateBackoff(retryCount: number): number {
  return Math.min(BASE_DELAY * Math.pow(2, retryCount), 30000);
}

async function uploadAudioBlob(
  audioBuffer: ArrayBuffer, 
  mimeType: string, 
  fileName: string
): Promise<{ objectPath: string } | null> {
  try {
    const blob = new Blob([audioBuffer], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });
    
    console.log('[SyncQueue] Solicitando URL de upload para:', fileName);
    
    const response = await fetch('/api/uploads/request-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type || 'audio/webm'
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('[SyncQueue] Erro ao obter URL:', response.status, errorData);
      throw new Error(`Falha ao obter URL de upload: ${response.status}`);
    }
    
    const { uploadURL, objectPath } = await response.json();
    console.log('[SyncQueue] URL obtida, fazendo upload para:', objectPath);
    
    const uploadResponse = await fetch(uploadURL, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'audio/webm' }
    });
    
    if (!uploadResponse.ok) {
      console.error('[SyncQueue] Erro no upload para storage:', uploadResponse.status);
      throw new Error(`Falha no upload para storage: ${uploadResponse.status}`);
    }
    
    console.log('[SyncQueue] Upload concluído com sucesso');
    return { objectPath };
  } catch (error) {
    console.error('[SyncQueue] Erro no upload de áudio:', error);
    return null;
  }
}

async function syncInterview(interview: PendingInterview): Promise<boolean> {
  console.log('[SyncQueue] Sincronizando entrevista:', interview.id);
  try {
    await updateInterviewStatus(interview.id, 'syncing');
    
    console.log('[SyncQueue] Fazendo upload do áudio...');
    const uploadRes = await uploadAudioBlob(
      interview.data.response.audioBlob,
      interview.data.response.audioMimeType,
      interview.data.response.audioFileName
    );
    
    if (!uploadRes) {
      throw new Error('Falha ao enviar áudio');
    }
    console.log('[SyncQueue] Áudio enviado:', uploadRes.objectPath);
    
    console.log('[SyncQueue] Enviando dados da entrevista...');
    await apiRequest('POST', `/api/surveys/${interview.surveyId}/responses`, {
      response: {
        latitude: interview.data.response.latitude,
        longitude: interview.data.response.longitude,
        accuracy: interview.data.response.accuracy,
        gpsTimestamp: interview.data.response.gpsTimestamp,
        audioUrl: uploadRes.objectPath,
        audioHash: 'synced-offline',
        audioDuration: 0,
        deviceInfo: interview.data.response.deviceInfo,
        startTime: interview.data.response.startTime,
        endTime: interview.data.response.endTime,
        duration: interview.data.response.duration
      },
      answers: interview.data.answers
    });
    
    console.log('[SyncQueue] Entrevista sincronizada com sucesso:', interview.id);
    await deletePendingInterview(interview.id);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[SyncQueue] Erro ao sincronizar:', interview.id, errorMessage);
    await updateInterviewStatus(interview.id, 'failed', errorMessage);
    return false;
  }
}

export async function syncAllPending(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };
  if (!navigator.onLine) return { synced: 0, failed: 0 };
  
  isSyncing = true;
  let synced = 0;
  let failed = 0;
  
  try {
    const pending = await getPendingInterviews();
    const toSync = pending.filter(i => 
      (i.status === 'pending' || i.status === 'failed') && 
      i.retryCount < MAX_RETRIES
    );
    
    notifyListeners({ 
      isSyncing: true, 
      pendingCount: toSync.length 
    });
    
    for (const interview of toSync) {
      if (!navigator.onLine) break;
      
      if (interview.status === 'failed' && interview.lastRetryAt) {
        const delay = calculateBackoff(interview.retryCount);
        const elapsed = Date.now() - new Date(interview.lastRetryAt).getTime();
        if (elapsed < delay) continue;
      }
      
      notifyListeners({
        isSyncing: true,
        pendingCount: toSync.length - synced,
        currentItem: interview.id
      });
      
      const success = await syncInterview(interview);
      if (success) {
        synced++;
      } else {
        failed++;
      }
    }
    
    const remaining = await getPendingInterviews();
    notifyListeners({
      isSyncing: false,
      pendingCount: remaining.filter(i => i.status !== 'syncing').length,
      lastSyncAt: new Date()
    });
    
    return { synced, failed };
  } finally {
    isSyncing = false;
  }
}

let autoSyncInitialized = false;

export function setupAutoSync() {
  if (autoSyncInitialized) return;
  autoSyncInitialized = true;
  
  console.log('[SyncQueue] Auto-sync inicializado');
  
  window.addEventListener('online', async () => {
    console.log('[SyncQueue] Conexão restaurada. Aguardando estabilidade...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('[SyncQueue] Iniciando sincronização automática...');
    try {
      const result = await syncAllPending();
      console.log('[SyncQueue] Resultado:', result);
    } catch (error) {
      console.error('[SyncQueue] Erro na sincronização:', error);
    }
  });
  
  setInterval(async () => {
    if (navigator.onLine) {
      try {
        const pending = await getPendingInterviews();
        if (pending.length > 0) {
          console.log('[SyncQueue] Polling: encontradas', pending.length, 'entrevistas pendentes');
          await syncAllPending();
        }
      } catch (error) {
        console.error('[SyncQueue] Erro no polling:', error);
      }
    }
  }, 30000);
  
  if (navigator.onLine) {
    setTimeout(async () => {
      console.log('[SyncQueue] Verificando pendentes ao iniciar...');
      try {
        const pending = await getPendingInterviews();
        if (pending.length > 0) {
          console.log('[SyncQueue] Sincronizando', pending.length, 'entrevistas pendentes...');
          await syncAllPending();
        }
      } catch (error) {
        console.error('[SyncQueue] Erro na sincronização inicial:', error);
      }
    }, 3000);
  }
}
