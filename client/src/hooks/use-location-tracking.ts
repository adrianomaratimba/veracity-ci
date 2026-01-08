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
  intervalMs = 30000,
  enabled = true 
}: LocationTrackingOptions) {
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPositionRef = useRef<GeolocationCoordinates | null>(null);
  const sessionIdRef = useRef<string>(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  const sendLocation = useCallback(async (coords: GeolocationCoordinates) => {
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
      sendLocation(position.coords);
    };

    const handleError = (error: GeolocationPositionError) => {
      console.warn('[LocationTracking] GPS error:', error.message);
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000
      }
    );

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
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
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
