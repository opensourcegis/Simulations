// Teaching models: world distances in metres; image coordinates and focal
// length in pixels. Right-handed world Z up; camera X right, Y down, Z forward.
export function rotation([w, p, k]) {
  const cw = Math.cos(w),
    sw = Math.sin(w),
    cp = Math.cos(p),
    sp = Math.sin(p),
    ck = Math.cos(k),
    sk = Math.sin(k);
  return [
    [ck * cp, ck * sp * sw - sk * cw, ck * sp * cw + sk * sw],
    [sk * cp, sk * sp * sw + ck * cw, sk * sp * cw - ck * sw],
    [-sp, cp * sw, cp * cw],
  ];
}
export function cameraVector(camera, point) {
  const q = [
      point[0] - camera.c[0],
      -(point[1] - camera.c[1]),
      camera.c[2] - point[2],
    ],
    r = rotation(camera.a);
  return [0, 1, 2].map((i) => r[0][i] * q[0] + r[1][i] * q[1] + r[2][i] * q[2]);
}
export function cameraRay(camera, u, v, f) {
  const r = rotation(camera.a),
    q = [(u - 800) / f, (v - 600) / f, 1];
  const d = r.map((row) => row.reduce((sum, x, i) => sum + x * q[i], 0));
  const world = [d[0], -d[1], -d[2]],
    n = Math.hypot(...world);
  return world.map((x) => x / n);
}
export function project(camera, point, f = 1500) {
  const q = cameraVector(camera, point);
  if (q[2] <= 0.01) return null;
  return [800 + (f * q[0]) / q[2], 600 + (f * q[1]) / q[2]];
}
function randomGenerator(seed) {
  let s = seed >>> 0;
  const uniform = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
  return () =>
    Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}
export function solveLinear(matrix, vector, tolerance = 1e-12) {
  const a = matrix.map((row, i) => [...row, vector[i]]),
    n = vector.length;
  for (let k = 0; k < n; k++) {
    let pivot = k;
    for (let i = k + 1; i < n; i++)
      if (Math.abs(a[i][k]) > Math.abs(a[pivot][k])) pivot = i;
    if (Math.abs(a[pivot][k]) < tolerance) return null;
    [a[k], a[pivot]] = [a[pivot], a[k]];
    const d = a[k][k];
    for (let j = k; j <= n; j++) a[k][j] /= d;
    for (let i = k + 1; i < n; i++) {
      const m = a[i][k];
      for (let j = k; j <= n; j++) a[i][j] -= m * a[k][j];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--)
    x[i] =
      a[i][n] - x.slice(i + 1).reduce((s, v, j) => s + a[i][i + 1 + j] * v, 0);
  return x;
}
export function createBundle({
  baseline = 7,
  stripSpacing = 7,
  noise = 0.5,
  control = "distributed",
  outliers = false,
  calibrate = false,
  seed = 34,
} = {}) {
  const normal = randomGenerator(seed);
  const truth = { f: 1500, cameras: [], points: [] };
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 3; col++)
      truth.cameras.push({
        c: [(col - 1) * baseline, (row - 0.5) * stripSpacing, 25],
        a: [0.007 * (row ? 1 : -1), 0.008 * (col - 1), 0.015 * (row ? 1 : -1)],
      });
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 5; col++) {
      const x = (col - 2) * 4,
        y = (row - 2) * 3;
      truth.points.push([x, y, 0.6 * Math.sin(x * 0.2) * Math.sin(y * 0.3)]);
    }
  const gcps =
    control === "none"
      ? []
      : control === "collinear"
        ? [10, 12, 14]
        : control === "five"
          ? [0, 4, 20, 24, 12]
          : [0, 4, 24];
  const checkpoints = [6, 8, 18];
  const observations = [];
  truth.cameras.forEach((camera, ci) =>
    truth.points.forEach((point, pi) => {
      const q = project(camera, point, truth.f);
      if (q && q[0] > 20 && q[0] < 1580 && q[1] > 20 && q[1] < 1180) {
        const bad = outliers && observations.length % 19 === 8;
        observations.push({
          ci,
          pi,
          u: q[0] + noise * normal() + (bad ? 25 : 0),
          v: q[1] + noise * normal() - (bad ? 18 : 0),
          bad,
          checkpoint: checkpoints.includes(pi),
        });
      }
    }),
  );
  const initial = {
    f: calibrate ? 1560 : 1500,
    cameras: truth.cameras.map((cam) => ({
      c: cam.c.map((x) => x + 0.6 * normal()),
      a: cam.a.map((x) => x + 0.018 * normal()),
    })),
    points: truth.points.map((p, i) =>
      gcps.includes(i) ? [...p] : p.map((x) => x + 0.4 * normal()),
    ),
  };
  // Explicit seven-parameter free-network datum: one camera pose (6) and
  // one additional baseline coordinate (1), not secretly known ground points.
  const parameters = [];
  initial.cameras.forEach((_, ci) => {
    for (let j = 0; j < 3; j++)
      if (!(control === "none" && (ci === 0 || (ci === 1 && j === 0))))
        parameters.push({ type: "c", i: ci, j, scale: 1 });
    for (let j = 0; j < 3; j++)
      if (!(control === "none" && ci === 0))
        parameters.push({ type: "a", i: ci, j, scale: 0.05 });
  });
  truth.points.forEach((_, pi) => {
    if (!gcps.includes(pi) && !checkpoints.includes(pi))
      for (let j = 0; j < 3; j++)
        parameters.push({ type: "p", i: pi, j, scale: 1 });
  });
  if (calibrate) parameters.push({ type: "f", scale: 100 });
  return {
    truth,
    initial,
    gcps,
    checkpoints,
    observations,
    parameters,
    control,
    noise,
  };
}
const copyState = (s) => ({
  f: s.f,
  cameras: s.cameras.map((c) => ({ c: [...c.c], a: [...c.a] })),
  points: s.points.map((p) => [...p]),
});
function change(s, p, delta) {
  if (p.type === "f") s.f += delta;
  else if (p.type === "p") s.points[p.i][p.j] += delta;
  else s.cameras[p.i][p.type][p.j] += delta;
}
export function bundleResiduals(data, state) {
  return data.observations
    .filter((o) => !o.checkpoint)
    .flatMap((o) => {
      const q = project(state.cameras[o.ci], state.points[o.pi], state.f);
      return q ? [q[0] - o.u, q[1] - o.v] : [1e5, 1e5];
    });
}
export function bundleMetrics(data, state) {
  const r = bundleResiduals(data, state);
  const points = data.truth.points
    .map((p, i) => Math.hypot(...p.map((x, j) => x - state.points[i][j])))
    .filter((_, i) => !data.checkpoints.includes(i) && !data.gcps.includes(i));
  const checkpointErrors = data.checkpoints.map((pi) => {
    const obs = data.observations.filter((o) => o.pi === pi),
      n = Array.from({ length: 3 }, () => [0, 0, 0]),
      b = [0, 0, 0];
    for (const o of obs) {
      const cam = state.cameras[o.ci],
        d = cameraRay(cam, o.u, o.v, state.f);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const p = (i === j ? 1 : 0) - d[i] * d[j];
          n[i][j] += p;
          b[i] += p * cam.c[j];
        }
    }
    const hit = solveLinear(n, b);
    return hit
      ? Math.hypot(...hit.map((x, j) => x - data.truth.points[pi][j]))
      : NaN;
  });
  return {
    rms: Math.sqrt(r.reduce((s, x) => s + x * x, 0) / r.length),
    pointRmse: Math.sqrt(points.reduce((s, x) => s + x * x, 0) / points.length),
    checkpointRmse: Math.sqrt(
      checkpointErrors.reduce((s, x) => s + x * x, 0) / checkpointErrors.length,
    ),
    observations: r.length,
    unknowns: data.parameters.length,
  };
}
function objective(r, threshold) {
  let cost = 0;
  for (let i = 0; i < r.length; i += 2) {
    const n = Math.hypot(r[i], r[i + 1]);
    cost += n <= threshold ? 0.5 * n * n : threshold * (n - 0.5 * threshold);
  }
  return cost;
}
export function bundleStep(data, state, { robust = true, lambda = 0.01 } = {}) {
  const r = bundleResiduals(data, state),
    n = data.parameters.length,
    threshold = robust ? Math.max(1.5, 3 * data.noise) : Infinity;
  const columns = data.parameters.map((p) => {
    const shifted = copyState(state),
      h = 1e-4;
    change(shifted, p, h * p.scale);
    const rr = bundleResiduals(data, shifted);
    return rr.map((x, i) => (x - r[i]) / h);
  });
  const normal = Array.from({ length: n }, () => Array(n).fill(0)),
    rhs = Array(n).fill(0);
  for (let k = 0; k < r.length; k++) {
    const pair = k - (k % 2),
      mag = Math.hypot(r[pair], r[pair + 1]),
      weight = Math.min(1, threshold / (mag || 1));
    for (let i = 0; i < n; i++) {
      rhs[i] -= weight * columns[i][k] * r[k];
      for (let j = 0; j <= i; j++)
        normal[i][j] += weight * columns[i][k] * columns[j][k];
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++) normal[j][i] = normal[i][j];
  const before = objective(r, threshold);
  for (let trial = 0; trial < 8; trial++) {
    const damped = normal.map((row, i) =>
      row.map(
        (x, j) => x + (i === j ? lambda * Math.max(normal[i][i], 1e-8) : 0),
      ),
    );
    const delta = solveLinear(damped, rhs);
    if (!delta)
      return { state, lambda: lambda * 10, accepted: false, cost: before };
    const next = copyState(state);
    delta.forEach((x, i) =>
      change(next, data.parameters[i], x * data.parameters[i].scale),
    );
    const cost = objective(bundleResiduals(data, next), threshold);
    if (next.f > 200 && cost < before)
      return {
        state: next,
        lambda: Math.max(lambda / 3, 1e-9),
        accepted: true,
        cost,
        stepNorm: Math.hypot(...delta),
      };
    lambda *= 10;
  }
  return { state, lambda, accepted: false, cost: before, stepNorm: 0 };
}

// Paraxial thin lens. Optical distances and dimensions are millimetres.
export function cameraOptics({
  f = 50,
  objectM = 2,
  focusM = 2,
  fNumber = 4,
  sensorW = 36,
  sensorH = 24,
  pixels = 6000,
  shutter = 1 / 125,
  iso = 100,
  speed = 1,
  readoutMs = 20,
} = {}) {
  const u = objectM * 1000,
    focus = focusM * 1000;
  if (u <= f || focus <= f) return null;
  const v = (f * u) / (u - f),
    sensorDistance = (f * focus) / (focus - f),
    diameter = f / fNumber,
    pitch = sensorW / pixels;
  const blur = (diameter * Math.abs(sensorDistance - v)) / v,
    effectiveFNumber = sensorDistance / diameter;
  return {
    u,
    v,
    sensorDistance,
    diameter,
    pitch,
    effectiveFNumber,
    magnification: -v / u,
    fov: (2 * Math.atan(sensorW / (2 * sensorDistance)) * 180) / Math.PI,
    verticalFov:
      (2 * Math.atan(sensorH / (2 * sensorDistance)) * 180) / Math.PI,
    blurMm: blur,
    blurPx: blur / pitch,
    airyMm: 2.44 * 0.00055 * effectiveFNumber,
    airyPx: (2.44 * 0.00055 * effectiveFNumber) / pitch,
    exposure: ((shutter / (fNumber * fNumber)) * iso) / 100 / (1 / 125 / 16),
    motionPx: (((speed * 1000 * sensorDistance) / u) * shutter) / pitch,
    rollingPx:
      (((speed * 1000 * sensorDistance) / u) * readoutMs) / 1000 / pitch,
  };
}
export function lensRayAtSensor(optics, objectHeight, lensHeight) {
  const imageHeight = (-optics.v / optics.u) * objectHeight;
  return (
    lensHeight + ((imageHeight - lensHeight) * optics.sensorDistance) / optics.v
  );
}
export function distort(x, y, k1, k2 = 0) {
  const r2 = x * x + y * y,
    factor = 1 + k1 * r2 + k2 * r2 * r2;
  return [x * factor, y * factor];
}
