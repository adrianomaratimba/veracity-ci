import { useEffect, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { GpsEngine, SmoothedPosition } from '@/lib/gps-engine';

interface LocationTrackingOptions {
  orgId: number;
  surveyId?: number;
  intervalMs?: number;
  enabled?: boolean;
}

export function useLocationTracking({ 
  orgId, 
  surveyId, 
  intervalMs = 60000,
  enabled = true 
}: LocationTrackingOptions) {
  const engineRef = useRef<GpsEngine | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const sessionIdRef = useRef<string>(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const pendingPositionRef = useRef<SmoothedPosition | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendLocation = useCallback(async (pos: SmoothedPosition, force: boolean = false) => {
    const now = Date.now();
    if (!force && now - lastSentTimeRef.current < 30000) return;

    try {
      await apiRequest('POST', `/api/organizations/${orgId}/tracking/location`, {
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracy: pos.accuracy,
        speed: null,
        heading: null,
        surveyId,
        sessionId: sessionIdRef.current
      });
      lastSentTimeRef.current = now;
    } catch (error) {
      console.error('[LocationTracking] Failed to send location:', error);
    }
  }, [orgId, surveyId]);

  const sendOfflineStatus = useCallback(async () => {
    try {
      await apiRequest('POST', `/api/organizations/${orgId}/tracking/offline`, {});
    } catch (error) {
      console.error('[LocationTracking] Failed to send offline status:', error);
    }
  }, [orgId]);

  useEffect(() => {
    if (!enabled) return;

    // Use GpsEngine with watchPosition for continuous tracking
    engineRef.current?.stop();
    engineRef.current = new GpsEngine({
      targetAccuracyMeters: 50,
      maxSamples: 6,
      onPosition: (pos) => {
        pendingPositionRef.current = pos;
        // Send immediately on first position
        if (lastSentTimeRef.current === 0) {
          sendLocation(pos, true);
        }
      },
    });
    engineRef.current.start();

    // Periodic send based on intervalMs
    intervalRef.current = setInterval(() => {
      if (pendingPositionRef.current) {
        sendLocation(pendingPositionRef.current, true);
      }
    }, intervalMs);

    const handleBeforeUnload = () => { sendOfflineStatus(); };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      engineRef.current?.stop();
      engineRef.current = null;
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      sendOfflineStatus();
    };
  }, [enabled, intervalMs, sendLocation, sendOfflineStatus]);

  return { sessionId: sessionIdRef.current };
}
