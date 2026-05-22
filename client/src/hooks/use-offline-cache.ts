/**
 * useOfflineCache — proactively warms the SW API cache so the interviewer
 * can work fully offline without having to visit each page manually.
 *
 * Call `prepareOffline(surveyId, orgId)` to cache everything needed for
 * a specific survey's interview flow. It fires plain `fetch()` requests;
 * the service worker's network-first handler intercepts them and stores the
 * responses in votoaudit-api-v4 automatically.
 */
import { useState, useCallback } from 'react';

export interface OfflineCacheStatus {
  isReady: boolean;
  isPreparing: boolean;
  lastPreparedAt?: Date;
  error?: string;
}

const PREPARED_KEY = 'offline-cache-prepared';

function loadStatus(): OfflineCacheStatus {
  try {
    const raw = localStorage.getItem(PREPARED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { isReady: true, isPreparing: false, lastPreparedAt: new Date(parsed.at) };
    }
  } catch {}
  return { isReady: false, isPreparing: false };
}

async function warmCache(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      console.warn('[OfflineCache] Falha ao cachear:', url, e);
    }
  }
}

export function useOfflineCache() {
  const [status, setStatus] = useState<OfflineCacheStatus>(loadStatus);

  const prepareOffline = useCallback(async (surveyId: number, orgId: number) => {
    if (!navigator.onLine) return;
    setStatus(s => ({ ...s, isPreparing: true, error: undefined }));

    const urls = [
      '/api/auth/user',
      `/api/organizations/${orgId}`,
      `/api/organizations/${orgId}/members`,
      `/api/surveys?organizationId=${orgId}`,
      `/api/surveys/${surveyId}`,
      `/api/surveys/${surveyId}/questions`,
      `/api/surveys/${surveyId}/my-zones`,
    ];

    try {
      await warmCache(urls);
      const now = new Date();
      localStorage.setItem(PREPARED_KEY, JSON.stringify({ at: now.toISOString(), surveyId, orgId }));
      setStatus({ isReady: true, isPreparing: false, lastPreparedAt: now });
    } catch (e) {
      setStatus(s => ({ ...s, isPreparing: false, error: 'Falha ao preparar cache offline' }));
    }
  }, []);

  const prepareBasic = useCallback(async (orgId: number) => {
    if (!navigator.onLine) return;
    const urls = [
      '/api/auth/user',
      `/api/organizations/${orgId}`,
      `/api/surveys?organizationId=${orgId}`,
    ];
    await warmCache(urls).catch(() => {});
  }, []);

  return { status, prepareOffline, prepareBasic };
}
