/**
 * GPS Engine — precision position tracking with multi-sample smoothing.
 *
 * Strategy (same as Waze / Google Maps):
 *   1. watchPosition with enableHighAccuracy + maximumAge:0 for fresh reads.
 *   2. Keep a sliding window of the N most-accurate recent samples.
 *   3. Compute a weighted-average position (weight = 1/accuracy²) to cancel
 *      GPS jitter while keeping the result physically meaningful.
 *   4. Emit the smoothed position only when it improves on the last accepted one.
 *
 * Consumer contracts:
 *   - onPosition(smoothed)  called every time we have an update.
 *   - onAccuracy(raw)       called with every raw reading so UI can show progress.
 *   - onError(err)          called on permission / hardware errors.
 */

export interface SmoothedPosition {
  latitude: number;
  longitude: number;
  /** Effective accuracy after smoothing (meters) — lower is better. */
  accuracy: number;
  /** Raw accuracy of the best single sample collected so far. */
  bestRawAccuracy: number;
  /** Number of samples averaged together. */
  sampleCount: number;
  timestamp: number;
}

export interface GpsEngineOptions {
  /** Accuracy threshold below which we consider the fix "good" (default 50 m). */
  targetAccuracyMeters?: number;
  /** Max samples to keep in the smoothing window (default 8). */
  maxSamples?: number;
  /** Only include samples with accuracy ≤ this value in the average (default 120 m). */
  sampleAccuracyCutoff?: number;
  onPosition?: (pos: SmoothedPosition) => void;
  onRawAccuracy?: (accuracyMeters: number) => void;
  onError?: (err: GeolocationPositionError | Error) => void;
}

export class GpsEngine {
  private options: Required<Omit<GpsEngineOptions, 'onPosition' | 'onRawAccuracy' | 'onError'>>
    & Pick<GpsEngineOptions, 'onPosition' | 'onRawAccuracy' | 'onError'>;

  private watchId: number | null = null;
  private samples: GeolocationCoordinates[] = [];
  private bestRaw: GeolocationCoordinates | null = null;
  private lastEmitted: SmoothedPosition | null = null;

  constructor(options: GpsEngineOptions = {}) {
    this.options = {
      targetAccuracyMeters: options.targetAccuracyMeters ?? 50,
      maxSamples: options.maxSamples ?? 15,
      sampleAccuracyCutoff: options.sampleAccuracyCutoff ?? 80,
      onPosition: options.onPosition,
      onRawAccuracy: options.onRawAccuracy,
      onError: options.onError,
    };
  }

  start() {
    if (!navigator.geolocation) {
      this.options.onError?.(new Error('Geolocalização não suportada neste dispositivo.'));
      return;
    }
    if (this.watchId !== null) return; // already running

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.handleRaw(pos.coords),
      (err) => this.options.onError?.(err),
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0, // always demand a fresh GPS fix — same as Waze
      },
    );
  }

  stop() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  reset() {
    this.stop();
    this.samples = [];
    this.bestRaw = null;
    this.lastEmitted = null;
  }

  get currentBest(): SmoothedPosition | null {
    return this.lastEmitted;
  }

  get isRunning() {
    return this.watchId !== null;
  }

  private handleRaw(coords: GeolocationCoordinates) {
    // Inform UI of raw accuracy so a progress bar can animate
    this.options.onRawAccuracy?.(coords.accuracy);

    // Track best raw reading (for fraud-score metadata)
    if (!this.bestRaw || coords.accuracy < this.bestRaw.accuracy) {
      this.bestRaw = coords;
    }

    // Add to smoothing window only if reading is good enough
    if (coords.accuracy <= this.options.sampleAccuracyCutoff) {
      this.samples.push(coords);
      // Keep the sliding window at maxSamples, always keep the best sample
      if (this.samples.length > this.options.maxSamples) {
        // Remove the worst (highest accuracy number = least precise) sample
        this.samples.sort((a, b) => a.accuracy - b.accuracy);
        this.samples = this.samples.slice(0, this.options.maxSamples);
      }
    }

    const smoothed = this.computeSmoothed();
    if (!smoothed) return;

    // Emit only when position actually improved meaningfully
    const prev = this.lastEmitted;
    const improved =
      !prev ||
      smoothed.accuracy < prev.accuracy ||
      this.hasMoved(prev, smoothed);

    if (improved) {
      this.lastEmitted = smoothed;
      this.options.onPosition?.(smoothed);
    }
  }

  private computeSmoothed(): SmoothedPosition | null {
    if (this.samples.length === 0) {
      // No samples yet in window — fall back to best raw reading
      if (!this.bestRaw) return null;
      return {
        latitude: this.bestRaw.latitude,
        longitude: this.bestRaw.longitude,
        accuracy: this.bestRaw.accuracy,
        bestRawAccuracy: this.bestRaw.accuracy,
        sampleCount: 1,
        timestamp: Date.now(),
      };
    }

    // Weighted average — weight = 1 / accuracy² (higher weight to accurate readings)
    let sumW = 0, sumLat = 0, sumLon = 0;
    for (const s of this.samples) {
      const w = 1 / (s.accuracy * s.accuracy);
      sumW += w;
      sumLat += s.latitude * w;
      sumLon += s.longitude * w;
    }

    const lat = sumLat / sumW;
    const lon = sumLon / sumW;

    // Effective accuracy after averaging N samples:
    // Statistical theory: averaging N independent measurements improves precision
    // by 1/sqrt(N). We use the best raw reading as the base accuracy estimate,
    // since it represents the chip's best single measurement.
    const bestAcc = this.bestRaw?.accuracy ?? this.samples[0].accuracy;
    const n = this.samples.length;
    const effectiveAccuracy = Math.max(1, bestAcc / Math.sqrt(n));

    return {
      latitude: lat,
      longitude: lon,
      accuracy: Math.round(effectiveAccuracy * 10) / 10,
      bestRawAccuracy: bestAcc,
      sampleCount: n,
      timestamp: Date.now(),
    };
  }

  /**
   * Returns true if the new position is far enough from the previous to consider
   * it a real movement (> 3 m), rather than GPS drift.
   */
  private hasMoved(prev: SmoothedPosition, next: SmoothedPosition): boolean {
    const R = 6371000; // Earth radius in metres
    const dLat = ((next.latitude - prev.latitude) * Math.PI) / 180;
    const dLon = ((next.longitude - prev.longitude) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((prev.latitude * Math.PI) / 180) *
        Math.cos((next.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return dist > 3;
  }
}
