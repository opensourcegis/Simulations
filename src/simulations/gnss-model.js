// Single-epoch, short-baseline teaching model: only local east and clock are
// unknown. North/up are held fixed. This is not a 3D receiver or RTK engine.
export const LIGHT_SPEED = 299792458;
export const L1_WAVELENGTH = LIGHT_SPEED / 1575.42e6;
const SATELLITES = [
  { prn: 12, el: 78, side: 1 },
  { prn: 24, el: 41, side: -1 },
  { prn: 5, el: 60, side: -1 },
  { prn: 19, el: 30, side: 1 },
  { prn: 2, el: 52, side: 1 },
  { prn: 15, el: 24, side: -1 },
];
function gaussian(seed) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () =>
    Math.sqrt(-2 * Math.log(Math.max(uniform(), 1e-12))) *
    Math.cos(2 * Math.PI * uniform());
}
export function solveCode(sats) {
  let east = 0,
    clock = 0;
  for (let iteration = 0; iteration < 10; iteration++) {
    let aa = 0,
      ab = 0,
      ae = 0,
      be = 0;
    for (const s of sats) {
      const r = Math.hypot(s.x - east, s.z),
        h = (east - s.x) / r;
      const w = s.code - r - clock;
      aa += h * h;
      ab += h;
      ae += h * w;
      be += w;
    }
    const determinant = aa * sats.length - ab * ab;
    if (determinant < 1e-12) return null;
    const dx = (sats.length * ae - ab * be) / determinant;
    const db = (aa * be - ab * ae) / determinant;
    east += dx;
    clock += db;
    if (Math.hypot(dx, db) < 1e-7) break;
  }
  return {
    east,
    clock,
    residuals: sats.map((s) => s.code - Math.hypot(s.x - east, s.z) - clock),
  };
}
export function makeGnssObservations({
  east = 6,
  count = 5,
  codeSigma = 2.5,
  phaseSigma = 0.002,
  roverClock = 150000,
  baseClock = 70000,
} = {}) {
  const noise = gaussian(99),
    earthRadius = 6371000,
    orbitRadius = earthRadius + 20200000;
  return SATELLITES.slice(0, count).map((s) => {
    const el = (s.el * Math.PI) / 180;
    const slant =
      -earthRadius * Math.sin(el) +
      Math.sqrt(orbitRadius ** 2 - (earthRadius * Math.cos(el)) ** 2);
    const x = s.side * Math.cos(el) * slant,
      z = Math.sin(el) * slant;
    const roverRange = Math.hypot(x - east, z),
      baseRange = Math.hypot(x, z);
    const roverN = 13000 + s.prn * 111,
      baseN = 9000 + s.prn * 73;
    const code = roverRange + roverClock + codeSigma * noise();
    const roverPhase =
      (roverRange + roverClock) / L1_WAVELENGTH +
      roverN +
      (phaseSigma * noise()) / L1_WAVELENGTH;
    const basePhase =
      (baseRange + baseClock) / L1_WAVELENGTH +
      baseN +
      (phaseSigma * noise()) / L1_WAVELENGTH;
    return {
      ...s,
      x,
      z,
      roverRange,
      baseRange,
      code,
      roverPhase,
      basePhase,
      phaseFraction: ((roverPhase % 1) + 1) % 1,
      singleN: roverN - baseN,
    };
  });
}
// DD = (rover-base)_sat - (rover-base)_reference. Independent per-receiver
// noise sigma yields Cov(DD) = 2 sigma² (I + 11ᵀ), not diagonal covariance.
export function doubleDifferences(sats, reference = 0) {
  const ref = sats[reference],
    singlePhase = (s) => s.roverPhase - s.basePhase;
  return sats
    .filter((_, i) => i !== reference)
    .map((s) => ({
      prn: s.prn,
      reference: ref.prn,
      measured: L1_WAVELENGTH * (singlePhase(s) - singlePhase(ref)),
      integer: s.singleN - ref.singleN,
      geometry: (east) =>
        Math.hypot(s.x - east, s.z) -
        s.baseRange -
        Math.hypot(ref.x - east, ref.z) +
        ref.baseRange,
      derivative: (east) =>
        (east - s.x) / Math.hypot(s.x - east, s.z) -
        (east - ref.x) / Math.hypot(ref.x - east, ref.z),
    }));
}
export function solveFixedBaseline(rows, integerOffset = 0, sigma = 0.002) {
  if (!rows.length) return null;
  const integers = rows.map(
    (r, i) => r.integer + (i === 0 ? integerOffset : 0),
  );
  const observations = rows.map(
    (r, i) => r.measured - integers[i] * L1_WAVELENGTH,
  );
  // (I + 11ᵀ)^-1 = I - 11ᵀ/(m+1); the common factor cancels in dx.
  const product = (a, b) =>
    a.reduce((sum, value, i) => sum + value * b[i], 0) -
    (a.reduce((s, v) => s + v, 0) * b.reduce((s, v) => s + v, 0)) /
      (rows.length + 1);
  let east = 0;
  for (let iteration = 0; iteration < 8; iteration++) {
    const a = rows.map((r) => r.derivative(east)),
      w = rows.map((r, i) => observations[i] - r.geometry(east));
    const information = product(a, a);
    if (information < 1e-12) return null;
    const dx = product(a, w) / information;
    east += dx;
    if (Math.abs(dx) < 1e-7) break;
  }
  const residuals = rows.map((r, i) => observations[i] - r.geometry(east));
  const a = rows.map((r) => r.derivative(east));
  return {
    east,
    residuals,
    integers,
    observations,
    sigmaEast: Math.sqrt((2 * sigma ** 2) / product(a, a)),
    statistic: product(residuals, residuals) / (2 * sigma ** 2),
    dof: rows.length - 1,
  };
}
