// Unit sphere, radians in, natural dimensionless map coordinates out.
const rad = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const pEquirect = (phi, lam) => [lam, phi];
export const pMercator = (phi, lam) => [
  lam,
  Math.log(Math.tan(Math.PI / 4 + clamp(phi, -89.9 * rad, 89.9 * rad) / 2)),
];
export function pUTM(phi, lam) {
  // Spherical transverse Mercator, k0=1; not ellipsoidal UTM coordinates.
  const b = clamp(Math.cos(phi) * Math.sin(lam), -0.999999, 0.999999);
  return [Math.atanh(b), Math.atan2(Math.tan(phi), Math.cos(lam))];
}
export function pMollweide(phi, lam) {
  if (Math.abs(Math.abs(phi) - Math.PI / 2) < 1e-10)
    return [0, Math.sign(phi) * Math.SQRT2];
  // Monotone bracket avoids Newton divergence close to the poles.
  let lo = -Math.PI / 2,
    hi = Math.PI / 2;
  for (let i = 0; i < 52; i++) {
    const mid = (lo + hi) / 2;
    if (2 * mid + Math.sin(2 * mid) < Math.PI * Math.sin(phi)) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  return [
    ((2 * Math.SQRT2) / Math.PI) * lam * Math.cos(t),
    Math.SQRT2 * Math.sin(t),
  ];
}
const p1 = 20 * rad,
  p2 = 50 * rad,
  an = (Math.sin(p1) + Math.sin(p2)) / 2;
const ac = Math.cos(p1) ** 2 + 2 * an * Math.sin(p1),
  ar0 = Math.sqrt(ac) / an;
export function pAlbers(phi, lam) {
  const rho = Math.sqrt(ac - 2 * an * Math.sin(phi)) / an;
  return [rho * Math.sin(an * lam), ar0 - rho * Math.cos(an * lam)];
}
const ln =
  Math.log(Math.cos(p1) / Math.cos(p2)) /
  Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
const lf = (Math.cos(p1) * Math.tan(Math.PI / 4 + p1 / 2) ** ln) / ln;
export function pLambert(phi, lam) {
  const rho = lf / Math.tan(Math.PI / 4 + phi / 2) ** ln;
  return [rho * Math.sin(ln * lam), lf - rho * Math.cos(ln * lam)];
}
export function pAzimuthal(phi, lam) {
  const rho = Math.PI / 2 - phi;
  return [rho * Math.sin(lam), -rho * Math.cos(lam)];
}
export function areaScale(fn, latitudeDegrees, longitudeDegrees = 0) {
  const d = 1e-6,
    phi = latitudeDegrees * rad,
    lam = longitudeDegrees * rad;
  const xp = fn(phi, lam + d),
    xm = fn(phi, lam - d),
    yp = fn(phi + d, lam),
    ym = fn(phi - d, lam);
  return (
    Math.abs(
      (xp[0] - xm[0]) * (yp[1] - ym[1]) - (yp[0] - ym[0]) * (xp[1] - xm[1]),
    ) /
    (4 * d * d * Math.cos(phi))
  );
}
// Clip linear latitude/longitude edges to the visible transverse strip.
// Do not move vertices onto the boundary, which would change the polygon.
export function clipLongitude(poly, band) {
  if (!band) return poly;
  let result = poly;
  for (const [boundary, sign] of [
    [-band, 1],
    [band, -1],
  ]) {
    const input = result;
    result = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i],
        b = input[(i + 1) % input.length];
      const insideA = sign * (a[1] - boundary) >= 0,
        insideB = sign * (b[1] - boundary) >= 0;
      if (insideA) result.push(a);
      if (insideA !== insideB) {
        const t = (boundary - a[1]) / (b[1] - a[1]);
        result.push([a[0] + t * (b[0] - a[0]), boundary]);
      }
    }
  }
  return result;
}
