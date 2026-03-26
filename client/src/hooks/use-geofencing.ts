import { useState, useEffect, useRef, useCallback } from 'react';
import { isPointInsideGeofence } from '@/lib/geofences';

interface GeofencingOptions {
  neighborhoodName: string | null | undefined;
  enabled?: boolean;
}

interface GeofencingState {
  isInsideZone: boolean;
  neighborhoodName: string;
  hasPosition: boolean;
}

function playBeepAlert() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.8);

    setTimeout(() => ctx.close(), 1000);
  } catch {
    // Web Audio API not available — silent fallback
  }
}

export function useGeofencing({ neighborhoodName, enabled = true }: GeofencingOptions): GeofencingState {
  const [state, setState] = useState<GeofencingState>({
    isInsideZone: true,
    neighborhoodName: neighborhoodName || '',
    hasPosition: false,
  });

  const wasInsideRef = useRef<boolean>(true);
  const watchIdRef = useRef<number | null>(null);

  const checkPosition = useCallback((coords: GeolocationCoordinates) => {
    if (!neighborhoodName) return;

    const inside = isPointInsideGeofence(coords.longitude, coords.latitude, neighborhoodName);

    setState(prev => ({
      ...prev,
      isInsideZone: inside,
      neighborhoodName: neighborhoodName,
      hasPosition: true,
    }));

    if (!inside && wasInsideRef.current) {
      playBeepAlert();
    }
    wasInsideRef.current = inside;
  }, [neighborhoodName]);

  useEffect(() => {
    const active = enabled && !!neighborhoodName && !!navigator.geolocation;
    if (!active) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => checkPosition(position.coords),
      (err) => console.warn('[Geofencing] GPS error:', err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, neighborhoodName, checkPosition]);

  return state;
}
