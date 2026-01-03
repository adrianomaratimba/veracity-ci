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
    
    const response = await apiRequest('POST', '/api/upload/presign', {
      fileName: file.name,
      contentType: file.type,
      directory: '.private/audio'
    });
    const presignRes = await response.json() as { signedUrl: string; objectPath: string };
    
    const { signedUrl, objectPath } = presignRes;
    
    await fetch(signedUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type }
    });
    
    return { objectPath };
  } catch (error) {
    console.error('Failed to upload audio:', error);
    return null;
  }
}

async function syncInterview(interview: PendingInterview): Promise<boolean> {
  try {
    await updateInterviewStatus(interview.id, 'syncing');
    
    const uploadRes = await uploadAudioBlob(
      interview.data.response.audioBlob,
      interview.data.response.audioMimeType,
      interview.data.response.audioFileName
    );
    
    if (!uploadRes) {
      throw new Error('Falha ao enviar áudio');
    }
    
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
    
    await deletePendingInterview(interview.id);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
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

export function setupAutoSync() {
  window.addEventListener('online', () => {
    console.log('Conexão restaurada. Iniciando sincronização...');
    syncAllPending();
  });
  
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then(registration => {
      (registration as any).sync?.register('sync-interviews');
    });
  }
  
  setInterval(() => {
    if (navigator.onLine) {
      syncAllPending();
    }
  }, 60000);
}
