import { useEffect, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface PresenceHeartbeatOptions {
  orgId: number;
  intervalMs?: number;
  enabled?: boolean;
}

export function usePresenceHeartbeat({ 
  orgId, 
  intervalMs = 60000,
  enabled = true 
}: PresenceHeartbeatOptions) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const sendHeartbeat = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      await apiRequest('POST', `/api/organizations/${orgId}/tracking/heartbeat`, {});
    } catch (error) {
      console.error('[PresenceHeartbeat] Failed to send heartbeat:', error);
    }
  }, [orgId]);

  const sendOfflineStatus = useCallback(() => {
    try {
      fetch(`/api/organizations/${orgId}/tracking/offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        keepalive: true,
        body: JSON.stringify({})
      });
    } catch (error) {
      console.error('[PresenceHeartbeat] Failed to send offline status:', error);
    }
  }, [orgId]);

  useEffect(() => {
    if (!enabled || !orgId) return;

    isMountedRef.current = true;

    sendHeartbeat();

    intervalRef.current = setInterval(sendHeartbeat, intervalMs);

    const handleBeforeUnload = () => {
      sendOfflineStatus();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, intervalMs, orgId, sendHeartbeat, sendOfflineStatus]);
}
