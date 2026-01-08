import { 
  getPendingInterviews, 
  updateInterviewStatus, 
  deletePendingInterview,
  type PendingInterview 
} from './offlineStorage';

const MAX_RETRIES = 5;
const BASE_DELAY = 1000;
const AUTO_SYNC_INTERVAL = 120000; // 2 minutes

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

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes('fetch')) return true;
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('network') || 
           msg.includes('failed to fetch') || 
           msg.includes('timeout') ||
           msg.includes('aborted') ||
           msg.includes('connection');
  }
  return false;
}

function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes('401') || 
           msg.includes('not authenticated') || 
           msg.includes('unauthorized') ||
           msg.includes('403') ||
           msg.includes('forbidden');
  }
  return false;
}

async function syncInterview(interview: PendingInterview): Promise<boolean> {
  console.log('[SyncQueue] Sincronizando entrevista:', interview.id);
  
  if (!navigator.onLine) {
    console.log('[SyncQueue] Sem conexão, mantendo offline:', interview.id);
    await updateInterviewStatus(interview.id, 'pending');
    return false;
  }
  
  try {
    await updateInterviewStatus(interview.id, 'syncing');
    
    // Check if audio is present (non-empty buffer)
    const hasAudio = interview.data.response.audioBlob && 
                     interview.data.response.audioBlob.byteLength > 0 &&
                     !interview.data.response.audioFileName.includes('no-audio');
    
    let audioUrl = '';
    let audioHash = 'no-audio';
    
    if (hasAudio) {
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
      audioUrl = uploadRes.objectPath;
      audioHash = 'synced-offline';
    } else {
      console.log('[SyncQueue] Entrevista sem áudio, pulando upload');
    }
    
    console.log('[SyncQueue] Enviando dados da entrevista ao servidor com clientId:', interview.clientId);
    
    // Use fetch directly to have more control over error handling
    const saveResponse = await fetch(`/api/surveys/${interview.surveyId}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        clientId: interview.clientId,
        response: {
          latitude: interview.data.response.latitude,
          longitude: interview.data.response.longitude,
          accuracy: interview.data.response.accuracy,
          gpsTimestamp: interview.data.response.gpsTimestamp,
          audioUrl,
          audioHash,
          audioDuration: 0,
          deviceInfo: interview.data.response.deviceInfo,
          startTime: interview.data.response.startTime,
          endTime: interview.data.response.endTime,
          duration: interview.data.response.duration
        },
        answers: interview.data.answers
      })
    });
    
    if (!saveResponse.ok) {
      const errorData = await saveResponse.json().catch(() => ({}));
      console.error('[SyncQueue] Servidor rejeitou:', saveResponse.status, errorData);
      
      // Handle specific error codes
      if (saveResponse.status === 401 || saveResponse.status === 403) {
        throw new Error(`Erro de autenticação: ${saveResponse.status}. Por favor, faça login novamente.`);
      }
      
      throw new Error(`Servidor retornou erro ${saveResponse.status}: ${JSON.stringify(errorData)}`);
    }
    
    const savedData = await saveResponse.json();
    console.log('[SyncQueue] Confirmação do servidor recebida:', savedData.id || 'OK', savedData.deduplicated ? '(duplicata ignorada)' : '');
    
    // Only delete after confirmed success
    console.log('[SyncQueue] Entrevista confirmada no banco, deletando local:', interview.id);
    await deletePendingInterview(interview.id);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[SyncQueue] Erro ao sincronizar:', interview.id, errorMessage);
    
    // Always keep interview, but mark appropriately
    if (isNetworkError(error) || !navigator.onLine) {
      console.log('[SyncQueue] Erro de rede detectado, mantendo para retry:', interview.id);
      await updateInterviewStatus(interview.id, 'pending');
    } else if (isAuthError(error)) {
      console.log('[SyncQueue] Erro de autenticação detectado, mantendo para retry após login:', interview.id);
      await updateInterviewStatus(interview.id, 'failed', 'Erro de autenticação. Faça login e tente novamente.');
    } else {
      await updateInterviewStatus(interview.id, 'failed', errorMessage);
    }
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
let pollInterval: ReturnType<typeof setInterval> | null = null;

async function attemptSync() {
  if (!navigator.onLine) return;
  
  try {
    const pending = await getPendingInterviews();
    const syncable = pending.filter(i => 
      (i.status === 'pending' || i.status === 'failed') && 
      i.retryCount < MAX_RETRIES
    );
    
    if (syncable.length > 0) {
      console.log('[SyncQueue] Sincronizando', syncable.length, 'entrevistas pendentes...');
      const result = await syncAllPending();
      console.log('[SyncQueue] Resultado:', result);
    }
  } catch (error) {
    console.error('[SyncQueue] Erro na sincronização:', error);
  }
}

export function setupAutoSync() {
  if (autoSyncInitialized) return;
  autoSyncInitialized = true;
  
  console.log('[SyncQueue] Auto-sync inicializado');
  
  window.addEventListener('online', async () => {
    console.log('[SyncQueue] Conexão restaurada. Aguardando estabilidade...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (navigator.onLine) {
      console.log('[SyncQueue] Iniciando sincronização automática...');
      await attemptSync();
    }
  });
  
  window.addEventListener('offline', () => {
    console.log('[SyncQueue] Conexão perdida. Entrevistas serão mantidas localmente.');
  });
  
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      console.log('[SyncQueue] App voltou ao foco, verificando pendentes...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await attemptSync();
    }
  });
  
  // Periodic sync every 2 minutes when there are pending interviews
  pollInterval = setInterval(async () => {
    if (navigator.onLine) {
      console.log('[SyncQueue] Verificação periódica de entrevistas pendentes...');
      await attemptSync();
    }
  }, AUTO_SYNC_INTERVAL);
  
  // Initial sync after 3 seconds
  if (navigator.onLine) {
    setTimeout(attemptSync, 3000);
  }
  
  console.log(`[SyncQueue] Auto-sync configurado: verificação a cada ${AUTO_SYNC_INTERVAL / 1000} segundos`);
}
