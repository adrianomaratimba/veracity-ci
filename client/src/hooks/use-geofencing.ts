import { useState, useEffect, useRef, useCallback } from 'react';
import { isPointInsideGeofence, isPointInsidePolygon } from '@/lib/geofences';

interface GeofencingOptions {
  neighborhoodName?: string | null;
  polygon?: [number, number][] | null;
  polygons?: [number, number][][] | null;
  enabled?: boolean;
  /**
   * When true, initial isInsideZone = false (secure default — blocked until GPS confirms inside).
   * When false (default), initial isInsideZone = true (warn-only, non-blocking behaviour).
   */
  blockingMode?: boolean;
}

interface GeofencingState {
  isInsideZone: boolean;
  neighborhoodName: string;
  hasPosition: boolean;
}

interface WindowWithWebkit extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function playBeepAlert() {
  try {
    const AudioCtx = window.AudioContext || (window as WindowWithWebkit).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
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
  }
}

export function useGeofencing({
  neighborhoodName,
  polygon,
  polygons,
  enabled = true,
  blockingMode = false,
}: GeofencingOptions): GeofencingState {
  const hasMultiPolygons = !!(polygons && polygons.length > 0);
  const hasSinglePolygon = !!(polygon && polygon.length >= 3);
  const hasNeighborhood = !!neighborhoodName;
  const hasGeofence = hasMultiPolygons || hasSinglePolygon || hasNeighborhood;

  // In blocking mode the safe default is "outside" (false) — GPS must confirm inside.
  // In warn-only mode the default is "inside" (true) so there's no false alarm before position arrives.
  const safeDefault = blockingMode ? false : true;

  const [state, setState] = useState<GeofencingState>({
    isInsideZone: safeDefault,
    neighborhoodName: neighborhoodName || '',
    hasPosition: false,
  });

  const wasInsideRef = useRef<boolean>(safeDefault);
  const watchIdRef = useRef<number | null>(null);

  // Reset state whenever blocking mode or fence data changes (e.g. zones loaded async)
  useEffect(() => {
    setState({
      isInsideZone: safeDefault,
      neighborhoodName: neighborhoodName || '',
      hasPosition: false,
    });
    wasInsideRef.current = safeDefault;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockingMode, hasGeofence]);

  const checkPosition = useCallback((coords: GeolocationCoordinates) => {
    if (!hasGeofence) return;

    let inside = false;
    if (hasMultiPolygons && polygons) {
      inside = polygons.some(poly => isPointInsidePolygon(coords.longitude, coords.latitude, poly));
    } else if (hasSinglePolygon && polygon) {
      inside = isPointInsidePolygon(coords.longitude, coords.latitude, polygon);
    } else if (hasNeighborhood && neighborhoodName) {
      inside = isPointInsideGeofence(coords.longitude, coords.latitude, neighborhoodName);
    }

    setState(prev => ({
      ...prev,
      isInsideZone: inside,
      neighborhoodName: neighborhoodName || '',
      hasPosition: true,
    }));

    if (!inside && wasInsideRef.current) {
      playBeepAlert();
    }
    wasInsideRef.current = inside;
  }, [neighborhoodName, polygon, polygons, hasGeofence, hasMultiPolygons, hasSinglePolygon, hasNeighborhood]);

  useEffect(() => {
    const active = enabled && hasGeofence && !!navigator.geolocation;
    if (!active) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => checkPosition(position.coords),
      (err) => console.warn('[Geofencing] GPS error:', err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
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
