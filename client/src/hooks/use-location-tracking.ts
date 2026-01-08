import { useEffect, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPositionRef = useRef<GeolocationCoordinates | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const sessionIdRef = useRef<string>(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  const sendLocation = useCallback(async (coords: GeolocationCoordinates, force: boolean = false) => {
    const now = Date.now();
    const timeSinceLastSent = now - lastSentTimeRef.current;
    
    if (!force && timeSinceLastSent < 30000) {
      return;
    }
    
    try {
      await apiRequest('POST', `/api/organizations/${orgId}/tracking/location`, {
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        speed: coords.speed,
        heading: coords.heading,
        surveyId,
        sessionId: sessionIdRef.current
      });
      lastPositionRef.current = coords;
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
    if (!enabled || !navigator.geolocation) return;

    const handlePosition = (position: GeolocationPosition) => {
      sendLocation(position.coords, true);
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn('[LocationTracking] GPS error:', error.message);
    };

    navigator.geolocation.getCurrentPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });

    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        handleError,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }, intervalMs);

    const handleBeforeUnload = () => {
      sendOfflineStatus();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      sendOfflineStatus();
    };
  }, [enabled, intervalMs, sendLocation, sendOfflineStatus]);

  return {
    lastPosition: lastPositionRef.current,
    sessionId: sessionIdRef.current
  };
}
