import { LIGHT_SPEED } from './lidar-physics.js';

// Gaussian amplitude profile: FWHM is specified in round-trip time.
// Fixed gain; noise-adaptive threshold. Filtering also applies to noise-free
// samples so changing noise does not silently change receiver bandwidth.
export const RETURN_THRESHOLD = 0.02;
export function canopyWaveform(returns, pulseWidthNs = 10, { noiseRms = 0, seed = 17, fixedEnergy = false } = {}) {
  const N = 640, hMax = 11, hMin = -3;
  const sigma = LIGHT_SPEED * pulseWidthNs * 1e-9 / (4 * Math.sqrt(Math.log(2)));
  const hAt = i => hMax - (hMax - hMin) * i / (N - 1);
  const gain = fixedEnergy ? 10 / pulseWidthNs : 1;
  let randomState = seed >>> 0;
  const random = () => { randomState = (1664525 * randomState + 1013904223) >>> 0; return (randomState+0.5)/4294967296; };
  const w = Float64Array.from({ length: N }, (_, i) => {
    const signal = returns.reduce((sum, r) => sum + gain*r.amp * Math.exp(-(((hAt(i) - r.h) / sigma) ** 2)), 0);
    return signal + noiseRms * Math.sqrt(-2*Math.log(random())) * Math.cos(2*Math.PI*random());
  });
  const radius = Math.max(1, Math.round(sigma / ((hMax-hMin)/(N-1)) / 6));
  const detection = Float64Array.from(w, (_,i) => {
    let sum=0, count=0;
    for (let j=Math.max(0,i-radius); j<=Math.min(N-1,i+radius); j++) { sum+=w[j]; count++; }
    return sum/count;
  });
  return { w, detection, N, hMax, hMin, hAt, noiseRms, threshold:Math.max(RETURN_THRESHOLD, 5*noiseRms), minSeparation:LIGHT_SPEED*pulseWidthNs*1e-9/4 };
}

export function detectCanopyPeaks(waveform, threshold = waveform.threshold ?? RETURN_THRESHOLD) {
  const { N, hAt, minSeparation = 0 } = waveform;
  const w = waveform.detection ?? waveform.w;
  const peaks = [];
  for (let i = 1; i < N - 1; i++) {
    if (w[i] >= threshold && w[i] >= w[i - 1] && w[i] > w[i + 1]) {
      peaks.push({ h: hAt(i), amp: w[i] });
    }
  }
  // Keep the strongest candidate in each half-FWHM neighbourhood to avoid
  // labelling tiny noise ripples as separate returns. This is a detector choice.
  const selected = [];
  for (const p of peaks.sort((a,b) => b.amp-a.amp)) if (selected.every(q => Math.abs(q.h-p.h) >= minSeparation)) selected.push(p);
  return selected.sort((a,b) => b.h-a.h);
}
