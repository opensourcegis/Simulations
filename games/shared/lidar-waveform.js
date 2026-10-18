import { LIGHT_SPEED } from './lidar-physics.js';

// Gaussian amplitude profile: FWHM is specified in round-trip time.
// Fixed gain and threshold keep different canopy experiments comparable.
export const RETURN_THRESHOLD = 0.02;
export function canopyWaveform(returns, pulseWidthNs = 10) {
  const N = 640, hMax = 11, hMin = -3;
  const sigma = LIGHT_SPEED * pulseWidthNs * 1e-9 / (4 * Math.sqrt(Math.log(2)));
  const hAt = i => hMax - (hMax - hMin) * i / (N - 1);
  const w = Float64Array.from({ length: N }, (_, i) => returns.reduce((sum, r) =>
    sum + r.amp * Math.exp(-(((hAt(i) - r.h) / sigma) ** 2)), 0));
  return { w, N, hMax, hMin, hAt };
}

export function detectCanopyPeaks({ w, N, hAt }, threshold = RETURN_THRESHOLD) {
  const peaks = [];
  for (let i = 1; i < N - 1; i++) {
    if (w[i] >= threshold && w[i] >= w[i - 1] && w[i] > w[i + 1]) {
      peaks.push({ h: hAt(i), amp: w[i] });
    }
  }
  return peaks;
}
