// Idealised teaching models. SI units unless a parameter explicitly says otherwise.
export const LIGHT_SPEED = 299792458;
const RAD = Math.PI / 180;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const roundTripNs = range => 2 * range / LIGHT_SPEED * 1e9;

export function pulseAmbiguity(range, prfKHz) {
  const limit = LIGHT_SPEED / (2 * prfKHz * 1000);
  return { limit, ambiguous: range >= limit, apparentRange: range % limit };
}

export function phaseMeasurement(range, frequencyMHz) {
  const wavelength = LIGHT_SPEED / (frequencyMHz * 1e6);
  const interval = wavelength / 2;
  const cycles = Math.floor(range / interval);
  const fraction = range / interval - cycles;
  return { wavelength, interval, cycles, phaseDegrees: fraction * 360, remainder: fraction * interval, metresPerDegree: interval / 360 };
}

// Small full-angle divergence, top-hat diameter convention, locally horizontal ground.
export function beamFootprint(height, divergenceMrad, incidenceDeg, exitDiameterMm) {
  const th = incidenceDeg * RAD;
  const R = height / Math.cos(th);
  const d = exitDiameterMm / 1000 + R * divergenceMrad / 1000;
  const minor = d;
  const major = d / Math.cos(th);
  return { R, d, minor, major, area: Math.PI * minor * major / 4, elong: 1 / Math.cos(th), th };
}

// Distance perpendicular to the facet, and insertion angle relative to that
// facet, not to the horizontal datum. A point on a steep plane has angle zero.
export function evaluateTinCandidate(point, vertices, maxDistance, maxAngleDeg) {
  const [a, b, c] = vertices;
  const u = [b.x - a.x, b.y - a.y, b.z - a.z];
  const v = [c.x - a.x, c.y - a.y, c.z - a.z];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const length = Math.hypot(...n);
  if (length < 1e-10 || Math.abs(n[2]) < 1e-10) return null;
  if (n[2] < 0) n = n.map(x => -x);
  const normal = n.map(x => x / length);
  const signedDistance = (point.x - a.x) * normal[0] + (point.y - a.y) * normal[1] + (point.z - a.z) * normal[2];
  const d = Math.abs(signedDistance);
  const angle = Math.max(...vertices.map(vertex => {
    const lineLength = Math.hypot(point.x - vertex.x, point.y - vertex.y, point.z - vertex.z);
    return lineLength < 1e-10 ? 0 : Math.asin(clamp(d / lineLength, 0, 1)) / RAD;
  }));
  const passesDist = d <= maxDistance;
  const passesAngle = angle <= maxAngleDeg;
  const zPlane = a.z - (n[0] * (point.x - a.x) + n[1] * (point.y - a.y)) / n[2];
  const projection = [point.x, point.y, point.z].map((v,i)=>v-signedDistance*normal[i]);
  return { d, signedDistance, normal, projection, angle, zPlane, passesDist, passesAngle, accepted: passesDist && passesAngle };
}

export function eulerAxes(roll, pitch, yaw) {
  const cr = Math.cos(roll * RAD), sr = Math.sin(roll * RAD);
  const cp = Math.cos(pitch * RAD), sp = Math.sin(pitch * RAD);
  const cy = Math.cos(yaw * RAD), sy = Math.sin(yaw * RAD);
  return [[cy * cp, sy * cp, -sp], [cy * sp * sr - sy * cr, sy * sp * sr + cy * cr, cp * sr], [cy * sp * cr + sy * sr, sy * sp * cr - cy * sr, cp * cr]];
}

// Intersection of a TIN facet with a constant-Y profile. Perpendicular-distance
// offset planes appear as vertical offsets d / |normal.z| in that profile.
export function tinProfileSegment(vertices, sliceY, maxDistance) {
  const hits = [];
  for (let i = 0; i < 3; i++) {
    const a = vertices[i], b = vertices[(i + 1) % 3];
    if (Math.abs(a.y - sliceY) < 1e-8) hits.push({ x: a.x, z: a.z });
    if ((a.y < sliceY && b.y > sliceY) || (a.y > sliceY && b.y < sliceY)) {
      const t = (sliceY - a.y) / (b.y - a.y);
      hits.push({ x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) });
    }
  }
  hits.sort((a, b) => a.x - b.x);
  if (hits.length < 2 || hits.at(-1).x - hits[0].x < 1e-8) return null;
  const [a, b, c] = vertices;
  const nx = (b.y - a.y) * (c.z - a.z) - (b.z - a.z) * (c.y - a.y);
  const ny = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
  const nz = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(nz) < 1e-10) return null;
  return { start: hits[0], end: hits.at(-1), verticalTolerance: maxDistance * Math.hypot(nx, ny, nz) / Math.abs(nz) };
}

const toScene = v => [v[0], -v[1], -v[2]];
const transform = (axes, v) => [0, 1, 2].map(i => axes[0][i] * v[0] + axes[1][i] * v[1] + axes[2][i] * v[2]);
const addScaled = (origin, direction, length) => origin.map((x, i) => x + length * direction[i]);

// Apply the SAME measured slant range to calibrated and uncalibrated rays.
// Editing mount offsets uses the scene's forward / left / up convention;
// attitude and scanner rotations use right-handed NED, Rz(yaw) Ry(pitch) Rx(roll).
export function boresightComparison(height, scannerArm, attitude, boresight, scanAngleDeg = 0) {
  const attitudeAxes = eulerAxes(...attitude);
  const rotate = sceneVector => toScene(transform(attitudeAxes, toScene(sceneVector)));
  const scanVector = [0, Math.sin(scanAngleDeg * RAD), Math.cos(scanAngleDeg * RAD)];
  const actualDirection = toScene(transform(attitudeAxes, transform(eulerAxes(...boresight), scanVector)));
  const nominalDirection = toScene(transform(attitudeAxes, scanVector));
  const origin = rotate(scannerArm);
  const sensorHeight = height + origin[2];
  if (sensorHeight <= 0 || actualDirection[2] >= -1e-8) return null;
  const range = -sensorHeight / actualDirection[2];
  const actualHit = addScaled(origin, actualDirection, range);
  const uncalibratedHit = addScaled(origin, nominalDirection, range);
  const error = uncalibratedHit.map((x, i) => x - actualHit[i]);
  const beta = Math.acos(clamp(actualDirection.reduce((s, x, i) => s + x * nominalDirection[i], 0), -1, 1)) / RAD;
  return { origin, actualDirection, nominalDirection, range, sensorHeight, actualHit, uncalibratedHit, horizontalError: Math.hypot(error[0], error[1]), verticalError: error[2], beta };
}

export function energyShares(material, incidenceDeg) {
  const cosine = Math.cos(incidenceDeg * RAD);
  const refl = material.spec + (1 - material.spec) * (1 - cosine) ** 5;
  const rest = material.rho + material.abs + material.trans;
  const k = rest ? (1 - refl) / rest : 0;
  return { refl, scat: material.rho * k, abs: material.abs * k, trans: material.trans * k };
}

// Energy-normalised cosine-power directional lobe (sr^-1), not a calibrated
// reciprocal microfacet BRDF. sig is its 1/e angular width about the mirror ray.
const lobeCache = new Map();
export function specularDensity(incidenceDeg, widthDeg, separationDeg = 2 * incidenceDeg) {
  const theta = incidenceDeg * RAD;
  const n = -1 / Math.log(Math.cos(clamp(widthDeg, 0.1, 89) * RAD));
  const key = `${incidenceDeg}:${widthDeg}`;
  let fraction = lobeCache.get(key);
  if (fraction === undefined) {
    fraction = 0;
    // q = cos(alpha)^(n+1) removes the sharply peaked radial weight.
    for (let i = 0; i < 256; i++) {
      const ca = ((i + 0.5) / 256) ** (1 / (n + 1));
      const denominator = Math.sin(theta) * Math.sqrt(1 - ca * ca);
      const boundary = denominator > 1e-12 ? -Math.cos(theta) * ca / denominator : -1;
      fraction += Math.acos(clamp(boundary, -1, 1)) / Math.PI / 256;
    }
    lobeCache.set(key, fraction);
  }
  return (n + 1) / (2 * Math.PI * fraction) * Math.max(0, Math.cos(separationDeg * RAD)) ** n;
}

export function relativeBackscatter(material, incidenceDeg, range, apertureMm, reference) {
  const s = energyShares(material, incidenceDeg);
  // In a monostatic sensor RX is 2 theta away from the mirror direction.
  const reflTerm = Math.PI * s.refl * specularDensity(incidenceDeg, material.sig);
  const scatTerm = s.scat * Math.cos(incidenceDeg * RAD);
  const f = reflTerm + scatTerm;
  const refF = reference.rho + Math.PI * reference.spec * specularDensity(0, reference.sig);
  const Ar = Math.PI * (apertureMm / 2000) ** 2;
  // Reference includes the same two-way atmospheric attenuation at 100 m.
  const rel = f / refF * (apertureMm / 100) ** 2 * (100 / range) ** 2 * Math.exp(-2 * 0.00002 * (range - 100));
  return { f, reflTerm, scatTerm, rel, capture: Ar / (Math.PI * range ** 2), s };
}
