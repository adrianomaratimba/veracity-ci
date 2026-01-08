const DB_NAME = 'veracity-offline';
const DB_VERSION = 1;

export interface PendingInterview {
  id: string;
  surveyId: number;
  clientId: string;
  createdAt: Date;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  lastRetryAt?: Date;
  errorMessage?: string;
  data: {
    response: {
      latitude: number;
      longitude: number;
      accuracy: number;
      gpsTimestamp: Date;
      audioBlob: ArrayBuffer;
      audioMimeType: string;
      audioFileName: string;
      deviceInfo: { userAgent: string };
      startTime: Date;
      endTime: Date;
      duration: number;
    };
    answers: Array<{ questionId: number; value: any }>;
  };
}

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      if (!db.objectStoreNames.contains('pendingInterviews')) {
        const store = db.createObjectStore('pendingInterviews', { keyPath: 'id' });
        store.createIndex('surveyId', 'surveyId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

export async function savePendingInterview(interview: PendingInterview): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingInterviews', 'readwrite');
    const store = transaction.objectStore('pendingInterviews');
    const request = store.put(interview);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingInterviews(): Promise<PendingInterview[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingInterviews', 'readonly');
    const store = transaction.objectStore('pendingInterviews');
    const request = store.getAll();
    
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getPendingInterviewById(id: string): Promise<PendingInterview | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingInterviews', 'readonly');
    const store = transaction.objectStore('pendingInterviews');
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function updateInterviewStatus(
  id: string, 
  status: PendingInterview['status'], 
  errorMessage?: string
): Promise<void> {
  const interview = await getPendingInterviewById(id);
  if (!interview) return;

  interview.status = status;
  if (status === 'failed') {
    interview.retryCount = (interview.retryCount || 0) + 1;
    interview.lastRetryAt = new Date();
    interview.errorMessage = errorMessage;
  }

  await savePendingInterview(interview);
}

export async function deletePendingInterview(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pendingInterviews', 'readwrite');
    const store = transaction.objectStore('pendingInterviews');
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function resetInterviewRetries(id: string): Promise<void> {
  const interview = await getPendingInterviewById(id);
  if (!interview) return;

  interview.status = 'pending';
  interview.retryCount = 0;
  interview.lastRetryAt = undefined;
  interview.errorMessage = undefined;

  await savePendingInterview(interview);
}

export async function resetAllRetries(): Promise<void> {
  const interviews = await getPendingInterviews();
  for (const interview of interviews) {
    if (interview.status === 'failed') {
      interview.status = 'pending';
      interview.retryCount = 0;
      interview.lastRetryAt = undefined;
      interview.errorMessage = undefined;
      await savePendingInterview(interview);
    }
  }
}

export async function getPendingCount(): Promise<number> {
  const interviews = await getPendingInterviews();
  return interviews.filter(i => i.status === 'pending' || i.status === 'failed').length;
}

export function generateInterviewId(): string {
  return `interview-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateClientId(): string {
  return `client-${Date.now()}-${Math.random().toString(36).substr(2, 12)}-${crypto.randomUUID().slice(0, 8)}`;
}
