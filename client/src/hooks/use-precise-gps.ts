/**
 * usePreciseGps — React hook wrapping GpsEngine.
 *
 * Returns a stable SmoothedPosition that updates as GPS accuracy improves,
 * plus helpers for displaying acquisition progress to the user.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { GpsEngine, SmoothedPosition } from '@/lib/gps-engine';

export interface PreciseGpsState {
  /** Best smoothed position so far (null until first reading). */
  position: SmoothedPosition | null;
  /** Raw accuracy of the latest reading (for progress UI). */
  rawAccuracy: number | null;
  /** True once position.accuracy <= targetAccuracyMeters. */
  isAccurate: boolean;
  /** True if a GPS hardware/permission error occurred. */
  hasError: boolean;
  errorMessage: string | null;
  /** True if we got at least one reading (even if imprecise). */
  hasPosition: boolean;
}

interface UsePreciseGpsOptions {
  enabled?: boolean;
  /** Target accuracy in metres — default 50 m. */
  targetAccuracyMeters?: number;
  /** Max samples to smooth over — default 8. */
  maxSamples?: number;
}

export function usePreciseGps({
  enabled = true,
  targetAccuracyMeters = 50,
  maxSamples = 8,
}: UsePreciseGpsOptions = {}): PreciseGpsState {
  const [position, setPosition] = useState<SmoothedPosition | null>(null);
  const [rawAccuracy, setRawAccuracy] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const engineRef = useRef<GpsEngine | null>(null);

  const handlePosition = useCallback((pos: SmoothedPosition) => {
    setPosition(pos);
    setHasError(false);
  }, []);

  const handleRawAccuracy = useCallback((acc: number) => {
    setRawAccuracy(acc);
  }, []);

  const handleError = useCallback((err: GeolocationPositionError | Error) => {
    const msg = 'message' in err ? err.message : 'Erro de localização';
    setErrorMessage(msg);
    setHasError(true);
    console.warn('[PreciseGps] error:', msg);
  }, []);

  useEffect(() => {
    if (!enabled) {
      engineRef.current?.stop();
      return;
    }

    // Re-create engine if key options changed
    engineRef.current?.stop();
    engineRef.current = new GpsEngine({
      targetAccuracyMeters,
      maxSamples,
      onPosition: handlePosition,
      onRawAccuracy: handleRawAccuracy,
      onError: handleError,
    });
    engineRef.current.start();

    return () => {
      engineRef.current?.stop();
    };
  }, [enabled, targetAccuracyMeters, maxSamples, handlePosition, handleRawAccuracy, handleError]);

  const isAccurate = position !== null && position.accuracy <= targetAccuracyMeters;
  const hasPosition = position !== null;

  return { position, rawAccuracy, isAccurate, hasError, errorMessage, hasPosition };
}
