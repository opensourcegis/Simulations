export const radarVelocity = (epsr) => 0.299792458 / Math.sqrt(epsr); // m/ns
export const radarTwoWayTime = (x, object, velocity) =>
  (2 * Math.hypot(x - object.x0, object.depth)) / velocity;
export function refract(n1, n2, incidenceDegrees) {
  const sine = (n1 / n2) * Math.sin((incidenceDegrees * Math.PI) / 180);
  if (sine > 1 + 1e-12) return { tir: true, t2: null };
  return { tir: false, t2: (Math.asin(Math.min(1, sine)) * 180) / Math.PI };
}
export const criticalAngle = (n1, n2) =>
  n1 > n2 ? (Math.asin(n2 / n1) * 180) / Math.PI : null;
// Symmetric thin lens, R1 = +R and R2 = -R, in air; distances in mm.
export const thinLensFocalLength = (index, radius = 80) =>
  radius / (2 * (index - 1));
export const sarResolutions = (
  bandwidthMHz,
  incidenceDegrees,
  antennaLength,
) => {
  const slant = 299792458 / (2 * bandwidthMHz * 1e6);
  return {
    slant,
    ground: slant / Math.sin((incidenceDegrees * Math.PI) / 180),
    azimuth: antennaLength / 2,
  };
};
