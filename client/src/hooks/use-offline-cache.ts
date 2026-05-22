/**
 * useOfflineCache — proactively warms the SW API cache so the interviewer
 * can work fully offline without having to visit each page manually.
 *
 * `prepareOffline(surveyId, orgId)` — cache one specific survey + questions.
 * `prepareBasic(orgId)`            — cache auth + org + survey list.
 * `prepareAllSurveys(orgId)`       — cache EVERY survey in the org (auto-called
 *                                    by AutoOfflineCache in App.tsx on startup).
 *
 * All cache warming is done via plain fetch(); the SW network-first strategy
 * intercepts each call and stores the response in votoaudit-api-v5.
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

async function warmUrls(urls: string[]): Promise<void> {
  for (const url of urls) {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok && res.status !== 404) console.warn('[OfflineCache] HTTP', res.status, url);
    } catch (e) {
      console.warn('[OfflineCache] Falha ao cachear:', url, e);
    }
  }
}

/** Fetch the survey list for an org and cache each individual survey.
 *  Returns the number of surveys cached.  */
export async function prepareAllSurveysOffline(orgId: number): Promise<number> {
  if (!navigator.onLine) return 0;
  try {
    // Cache the list endpoint first
    const listUrl = `/api/organizations/${orgId}/surveys`;
    const res = await fetch(listUrl, { credentials: 'include' });
    if (!res.ok) return 0;
    const surveys: { id: number }[] = await res.json();

    // Cache every survey detail (includes questions) + zones in parallel batches
    let cached = 0;
    for (const s of surveys) {
      await warmUrls([
        `/api/surveys/${s.id}`,
        `/api/surveys/${s.id}/my-zones`,
      ]);
      cached++;
    }
    console.log(`[OfflineCache] ${cached} pesquisas prontas para uso offline (org ${orgId})`);
    return cached;
  } catch (e) {
    console.warn('[OfflineCache] prepareAllSurveysOffline falhou:', e);
    return 0;
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
      `/api/organizations/${orgId}/surveys`,
      `/api/surveys/${surveyId}`,
      `/api/surveys/${surveyId}/my-zones`,
    ];

    try {
      await warmUrls(urls);
      const now = new Date();
      localStorage.setItem(PREPARED_KEY, JSON.stringify({ at: now.toISOString(), surveyId, orgId }));
      setStatus({ isReady: true, isPreparing: false, lastPreparedAt: now });
    } catch (e) {
      setStatus(s => ({ ...s, isPreparing: false, error: 'Falha ao preparar cache offline' }));
    }
  }, []);

  const prepareBasic = useCallback(async (orgId: number) => {
    if (!navigator.onLine) return;
    await warmUrls([
      '/api/auth/user',
      `/api/organizations/${orgId}`,
      `/api/organizations/${orgId}/surveys`,
    ]).catch(() => {});
  }, []);

  return { status, prepareOffline, prepareBasic };
}
