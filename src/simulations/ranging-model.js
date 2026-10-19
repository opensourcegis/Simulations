import { LIGHT_SPEED } from "../../games/shared/lidar-physics.js";

// Illustrative 905 nm direct-detection instrument, not a calibrated product.
export const RANGING_INSTRUMENT = Object.freeze({
  wavelengthNm: 905,
  pulseEnergyNj: 100,
  opticalEfficiency: 0.45,
  quantumEfficiency: 0.55,
  electronicsRms: 8,
  receiverFwhmNs: 2,
  clockJitterNs: 0.08,
  tdcBinNs: 0.1,
  systemDelayNs: 12,
  minimumSnr: 6,
});

export function rangingBudget({
  distance,
  pulseWidth = 10,
  reflectivity = 35,
  aperture = 30,
  ambient = 25,
  extinction = 0.15,
  airIndex = 1.00027,
}) {
  const i = RANGING_INSTRUMENT;
  const area = Math.PI * (aperture / 2000) ** 2;
  const transmission = Math.exp((-2 * extinction * distance) / 1000);
  // Large, normal-incidence Lambertian target fully intercepts the beam.
  // E_rx = E_tx rho A / (pi R²) eta exp(-2 alpha R).
  const receivedEnergyJ =
    ((((i.pulseEnergyNj * 1e-9 * reflectivity) / 100) * area) /
      (Math.PI * distance ** 2)) *
    i.opticalEfficiency *
    transmission;
  const photonEnergyJ =
    (6.62607015e-34 * LIGHT_SPEED) / (i.wavelengthNm * 1e-9);
  const electrons = (receivedEnergyJ / photonEnergyJ) * i.quantumEfficiency;
  const echoFwhmNs = Math.hypot(pulseWidth, i.receiverFwhmNs);
  // User-selected background is an illustrative photon/electron rate after
  // spatial/spectral filtering; it increases with receiver collecting area.
  const backgroundElectrons = ambient * echoFwhmNs * (aperture / 30) ** 2;
  const noiseElectrons = Math.sqrt(
    electrons + backgroundElectrons + i.electronicsRms ** 2,
  );
  const snr = electrons / noiseElectrons;
  const flightNs = ((2 * distance * airIndex) / LIGHT_SPEED) * 1e9;
  // Approximate Gaussian matched-filter timing precision, NOT echo separation.
  const timingSigmaNs = Math.hypot(
    echoFwhmNs / (2.355 * Math.max(snr, 1e-12)),
    i.clockJitterNs,
    i.tdcBinNs / Math.sqrt(12),
  );
  return {
    area,
    transmission,
    receivedEnergyJ,
    electrons,
    backgroundElectrons,
    noiseElectrons,
    snr,
    flightNs,
    echoFwhmNs,
    timingSigmaNs,
    rangeSigmaM: ((LIGHT_SPEED / airIndex) * timingSigmaNs * 1e-9) / 2,
    detected: snr >= i.minimumSnr,
  };
}

export function shotNormal(seed) {
  let state = seed >>> 0 || 1;
  const uniform = () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
  return (
    Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform())
  );
}

export function simulateRangingShot(settings, seed = 1) {
  const budget = rangingBudget(settings),
    i = RANGING_INSTRUMENT;
  if (!budget.detected)
    return {
      ...budget,
      seed,
      range: null,
      rawDelayNs: null,
      correctedDelayNs: null,
    };
  // Bin uncertainty is already included in sigma: draw analogue jitter without
  // that term, then quantise once instead of counting TDC quantisation twice.
  const analogSigma = Math.sqrt(
    Math.max(0, budget.timingSigmaNs ** 2 - i.tdcBinNs ** 2 / 12),
  );
  const rawDelayNs =
    Math.round(
      (budget.flightNs + i.systemDelayNs + shotNormal(seed) * analogSigma) /
        i.tdcBinNs,
    ) * i.tdcBinNs;
  const correctedDelayNs = rawDelayNs - i.systemDelayNs;
  return {
    ...budget,
    seed,
    rawDelayNs,
    correctedDelayNs,
    range:
      ((LIGHT_SPEED / (settings.airIndex ?? 1.00027)) *
        correctedDelayNs *
        1e-9) /
      2,
  };
}
