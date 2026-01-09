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

  const sendHeartbeat = useCallback(async () => {
    try {
      await apiRequest('POST', `/api/organizations/${orgId}/tracking/heartbeat`, {});
    } catch (error) {
      console.error('[PresenceHeartbeat] Failed to send heartbeat:', error);
    }
  }, [orgId]);

  const sendOfflineStatus = useCallback(async () => {
    try {
      await apiRequest('POST', `/api/organizations/${orgId}/tracking/offline`, {});
    } catch (error) {
      console.error('[PresenceHeartbeat] Failed to send offline status:', error);
    }
  }, [orgId]);

  useEffect(() => {
    if (!enabled || !orgId) return;

    sendHeartbeat();

    intervalRef.current = setInterval(sendHeartbeat, intervalMs);

    const handleBeforeUnload = () => {
      sendOfflineStatus();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendOfflineStatus();
      } else {
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sendOfflineStatus();
    };
  }, [enabled, intervalMs, orgId, sendHeartbeat, sendOfflineStatus]);
}
