// Structure-from-Motion teaching solver.
//
// Everything here is plain, deterministic maths so it can be unit-tested with
// Node and reused by the React view. The pipeline mirrors a real incremental
// SfM refinement: triangulate 3D feature points from cameras that are already
// localised, then resection (pose-estimate) the remaining cameras from those
// points, and alternate. Two "reference" cameras are held at ground truth to
// fix the coordinate frame (gauge), exactly as a real reconstruction is anchored
// to known control.

export const INTRINSICS = { f: 190, cx: 100, cy: 75, width: 200, height: 150 };
export const NUM_CAMERAS = 10;
export const ANCHOR_COUNT = 2; // first two cameras act as the fixed reference pair

// ---------------------------------------------------------------------------
// Small linear-algebra helpers (vec3 + mat3, plus a 6x6 solve for resection).
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

// Row-major 3x3 stored as [r0, r1, r2] where each r is a length-3 array.
const matVec = (R, v) => [dot(R[0], v), dot(R[1], v), dot(R[2], v)];
const matTVec = (R, v) => [
  R[0][0] * v[0] + R[1][0] * v[1] + R[2][0] * v[2],
  R[0][1] * v[0] + R[1][1] * v[1] + R[2][1] * v[2],
  R[0][2] * v[0] + R[1][2] * v[1] + R[2][2] * v[2],
];
const matMul = (A, B) => {
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) out[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
  return out;
};

// Rodrigues: rotation matrix from an axis-angle vector w (world-space increment).
function rodrigues(w) {
  const theta = norm(w);
  if (theta < 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const k = scale(w, 1 / theta);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  const KK = matMul(K, K);
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) out[i][j] = (i === j ? 1 : 0) + s * K[i][j] + (1 - c) * KK[i][j];
  return out;
}

// Look-at rotation (world -> camera). Rows are the camera right/down/forward axes.
function lookAt(position, target, up = [0, 0, 1]) {
  const forward = normalize(sub(target, position));
  let right = cross(forward, up);
  if (norm(right) < 1e-6) right = cross(forward, [0, 1, 0]);
  right = normalize(right);
  const down = cross(forward, right);
  return [right, down, forward];
}

// Solve a symmetric-ish 3x3 system A x = b via cofactor inverse.
function solve3(A, b) {
  const [a, d, g] = [A[0][0], A[1][0], A[2][0]];
  const [bb, e, h] = [A[0][1], A[1][1], A[2][1]];
  const [c, ff, i] = [A[0][2], A[1][2], A[2][2]];
  const det = a * (e * i - ff * h) - bb * (d * i - ff * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-9) return null;
  const inv = [
    [(e * i - ff * h), (c * h - bb * i), (bb * ff - c * e)],
    [(ff * g - d * i), (a * i - c * g), (c * d - a * ff)],
    [(d * h - e * g), (bb * g - a * h), (a * e - bb * d)],
  ].map((row) => row.map((v) => v / det));
  return matVec(inv, b);
}

// Solve a small dense system via Gaussian elimination with partial pivoting.
function solveDense(Ain, bin) {
  const n = bin.length;
  const A = Ain.map((row) => row.slice());
  const b = bin.slice();
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    if (Math.abs(A[pivot][col]) < 1e-12) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    [b[col], b[pivot]] = [b[pivot], b[col]];
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = A[r][col] / A[col][col];
      for (let c = col; c < n; c += 1) A[r][c] -= factor * A[col][c];
      b[r] -= factor * b[col];
    }
  }
  return b.map((v, idx) => v / A[idx][idx]);
}

// ---------------------------------------------------------------------------
// Deterministic RNG so scene + noise are reproducible.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Projection / back-projection.
// ---------------------------------------------------------------------------
export function project(camera, X) {
  const Xc = matVec(camera.R, sub(X, camera.t));
  if (Xc[2] <= 0.05) return null;
  return [INTRINSICS.f * Xc[0] / Xc[2] + INTRINSICS.cx, INTRINSICS.f * Xc[1] / Xc[2] + INTRINSICS.cy, Xc[2]];
}

// World-space unit ray for an image observation of a camera.
function backproject(camera, uv) {
  const dirCam = normalize([(uv[0] - INTRINSICS.cx) / INTRINSICS.f, (uv[1] - INTRINSICS.cy) / INTRINSICS.f, 1]);
  return normalize(matTVec(camera.R, dirCam));
}

// ---------------------------------------------------------------------------
// Ground-truth scene: a stylised monument (base ring + roof) plus loose markers.
// Each point doubles as a candidate feature the learner can select.
// ---------------------------------------------------------------------------
const PALETTE = ['#e6463b', '#f5a623', '#f8e71c', '#7ed321', '#2ec6a8', '#39a0ff', '#5b6bff', '#b06bff', '#ff5fa2', '#ff8f4d', '#39d0d8', '#9bd531', '#c98bff', '#ff6f6f'];

export function buildScene(seed = 7, noisePx = 0.5) {
  const rng = mulberry32(seed);
  const points = [];
  const push = (id, pos, quality, label) => points.push({ id, pos, quality, label, color: PALETTE[id % PALETTE.length] });

  // Building footprint (square, side 5) with two heights -> gives real parallax.
  const s = 2.6;
  push(0, [-s, -s, 0], 'strong', 'NW base');
  push(1, [s, -s, 0], 'strong', 'NE base');
  push(2, [s, s, 0], 'strong', 'SE base');
  push(3, [-s, s, 0], 'strong', 'SW base');
  push(4, [-s, -s, 3.2], 'strong', 'NW eave');
  push(5, [s, -s, 3.2], 'strong', 'NE eave');
  push(6, [s, s, 3.2], 'strong', 'SE eave');
  push(7, [-s, s, 3.2], 'strong', 'SW eave');
  push(8, [0, 0, 5.4], 'strong', 'Roof apex');
  // Ground control markers spread out -> distinctive, wide baseline.
  push(9, [-6.5, -1.5, 0.2], 'strong', 'Marker A');
  push(10, [6.2, 2.0, 0.2], 'strong', 'Marker B');
  // Weak features: low, near the scene edge, seen by few cameras.
  push(11, [1.2, -6.6, 0.15], 'weak', 'Edge post');
  // Ambiguous features: repeated texture -> mismatched in some views (outliers).
  push(12, [-1.4, 1.1, 1.5], 'ambiguous', 'Repeated tile');
  push(13, [1.6, -0.7, 1.9], 'ambiguous', 'Repeated tile');

  // Ground-truth cameras on an elevated arc looking at the scene centre.
  const target = [0, 0, 1.6];
  const cameras = [];
  for (let i = 0; i < NUM_CAMERAS; i += 1) {
    const az = (-72 + (144 * i) / (NUM_CAMERAS - 1)) * Math.PI / 180;
    const radius = 15 + rng() * 1.2;
    const height = 7.5 + rng() * 2.5;
    const t = [Math.sin(az) * radius, -Math.cos(az) * radius, height];
    cameras.push({ id: i, t, R: lookAt(t, target) });
  }

  // Observations: project every point into every camera it is visible in.
  // Ambiguous points get a deliberate mismatch (outlier) in a couple of views.
  const observations = cameras.map((cam) => {
    const perCam = {};
    points.forEach((pt) => {
      const p = project(cam, pt.pos);
      if (!p) return;
      let [u, v] = p;
      if (u < 2 || u > INTRINSICS.width - 2 || v < 2 || v > INTRINSICS.height - 2) return;
      if (pt.quality === 'ambiguous' && (cam.id % 3 === 0)) {
        // Mismatched onto the wrong tile: a realistic bad correspondence.
        u += (rng() - 0.5) * 34;
        v += (rng() - 0.5) * 26;
      } else {
        // Sub-pixel detector noise: redundant good features average it out.
        u += (rng() - 0.5) * 2 * noisePx;
        v += (rng() - 0.5) * 2 * noisePx;
      }
      perCam[pt.id] = [u, v];
    });
    return perCam;
  });

  return { points, cameras, observations, target };
}

// Noisy initial guess for the non-anchored cameras (what SfM starts from).
export function initialCameras(scene, seed = 42) {
  const rng = mulberry32(seed);
  return scene.cameras.map((cam, i) => {
    if (i < ANCHOR_COUNT) return { t: cam.t.slice(), R: cam.R.map((r) => r.slice()), anchored: true };
    const tNoise = [(rng() - 0.5) * 6, (rng() - 0.5) * 6, (rng() - 0.5) * 3];
    const wNoise = [(rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5, (rng() - 0.5) * 0.5];
    return { t: add(cam.t, tNoise), R: matMul(rodrigues(wNoise), cam.R), anchored: false };
  });
}

// ---------------------------------------------------------------------------
// Triangulate a point from every reliable camera that observes it, using the
// mid-point-of-rays least squares:  (Σ (I - dd^T)) X = Σ (I - dd^T) c
// ---------------------------------------------------------------------------
function triangulate(cams, rays) {
  if (rays.length < 2) return null;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const b = [0, 0, 0];
  rays.forEach(({ c, d }) => {
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const m = (i === j ? 1 : 0) - d[i] * d[j];
        A[i][j] += m;
        b[i] += m * c[j];
      }
    }
  });
  return solve3(A, b);
}

// Gauss-Newton camera resection (6 DOF) from 3D->2D correspondences.
function resection(camera, correspondences) {
  if (correspondences.length < 4) return null;
  let t = camera.t.slice();
  let R = camera.R.map((r) => r.slice());
  let lambda = 1e-3;
  const cost = (tt, RR) => {
    let sum = 0;
    for (const { X, uv } of correspondences) {
      const p = project({ t: tt, R: RR }, X);
      if (!p) return Infinity;
      sum += (p[0] - uv[0]) ** 2 + (p[1] - uv[1]) ** 2;
    }
    return sum;
  };
  const eps = 1e-4;
  for (let iter = 0; iter < 14; iter += 1) {
    const JtJ = Array.from({ length: 6 }, () => new Array(6).fill(0));
    const Jtr = new Array(6).fill(0);
    let bad = false;
    for (const { X, uv } of correspondences) {
      const base = project({ t, R }, X);
      if (!base) { bad = true; break; }
      const r = [base[0] - uv[0], base[1] - uv[1]];
      const J = [];
      for (let k = 0; k < 6; k += 1) {
        let tt = t; let RR = R;
        if (k < 3) { const dt = t.slice(); dt[k] += eps; tt = dt; }
        else { const w = [0, 0, 0]; w[k - 3] = eps; RR = matMul(rodrigues(w), R); }
        const p = project({ t: tt, R: RR }, X);
        if (!p) { bad = true; break; }
        J.push([(p[0] - base[0]) / eps, (p[1] - base[1]) / eps]);
      }
      if (bad) break;
      for (let a = 0; a < 6; a += 1) {
        Jtr[a] += J[a][0] * r[0] + J[a][1] * r[1];
        for (let bcol = 0; bcol < 6; bcol += 1) JtJ[a][bcol] += J[a][0] * J[bcol][0] + J[a][1] * J[bcol][1];
      }
    }
    if (bad) break;
    const before = cost(t, R);
    const damped = JtJ.map((row, idx) => row.map((v, jdx) => v + (idx === jdx ? lambda * v + 1e-9 : 0)));
    const delta = solveDense(damped, Jtr.map((v) => -v));
    if (!delta) break;
    const tNew = [t[0] + delta[0], t[1] + delta[1], t[2] + delta[2]];
    const RNew = matMul(rodrigues([delta[3], delta[4], delta[5]]), R);
    const after = cost(tNew, RNew);
    if (after < before) { t = tNew; R = RNew; lambda = Math.max(lambda * 0.5, 1e-6); if (before - after < 1e-6) break; }
    else { lambda = Math.min(lambda * 4, 1e3); }
  }
  return { t, R };
}

// ---------------------------------------------------------------------------
// Incremental reconstruction given the learner's selected feature ids.
// ---------------------------------------------------------------------------
export function solve(scene, selectedIds, initCams) {
  const selected = new Set(selectedIds);
  const cams = initCams.map((c) => ({ t: c.t.slice(), R: c.R.map((r) => r.slice()), anchored: c.anchored }));
  const reliable = cams.map((c) => !!c.anchored);
  const estPoints = {}; // id -> [x,y,z]

  for (let round = 0; round < 12; round += 1) {
    // Triangulate every selected point from reliable cameras that see it.
    scene.points.forEach((pt) => {
      if (!selected.has(pt.id)) return;
      const rays = [];
      cams.forEach((cam, ci) => {
        if (!reliable[ci]) return;
        const uv = scene.observations[ci][pt.id];
        if (!uv) return;
        rays.push({ c: cam.t, d: backproject(cam, uv) });
      });
      const X = triangulate(cams, rays);
      if (X) estPoints[pt.id] = X;
    });

    // Resection every non-reliable camera from currently solved points.
    cams.forEach((cam, ci) => {
      if (cam.anchored || reliable[ci]) return;
      const corr = [];
      Object.keys(estPoints).forEach((idStr) => {
        const id = Number(idStr);
        if (!selected.has(id)) return;
        const uv = scene.observations[ci][id];
        if (!uv) return;
        corr.push({ X: estPoints[id], uv });
      });
      const pose = resection(cam, corr);
      if (pose) {
        cam.t = pose.t; cam.R = pose.R;
        // Accept as reliable only once the pose reprojects tightly.
        let err = 0; let count = 0;
        corr.forEach(({ X, uv }) => { const p = project(cam, X); if (p) { err += Math.hypot(p[0] - uv[0], p[1] - uv[1]); count += 1; } });
        if (count >= 4 && err / count < 4) reliable[ci] = true;
      }
    });
  }

  // Metrics -----------------------------------------------------------------
  let poseErrSum = 0; let localised = 0;
  cams.forEach((cam, ci) => {
    if (cam.anchored) return;
    if (reliable[ci]) { poseErrSum += norm(sub(cam.t, scene.cameras[ci].t)); localised += 1; }
  });

  let reproSum = 0; let reproCount = 0;
  scene.points.forEach((pt) => {
    if (!selected.has(pt.id) || !estPoints[pt.id]) return;
    cams.forEach((cam, ci) => {
      if (!reliable[ci]) return;
      const uv = scene.observations[ci][pt.id];
      if (!uv) return;
      const p = project(cam, estPoints[pt.id]);
      if (p) { reproSum += Math.hypot(p[0] - uv[0], p[1] - uv[1]); reproCount += 1; }
    });
  });

  let pointErrSum = 0; let pointCount = 0;
  scene.points.forEach((pt) => {
    if (!estPoints[pt.id]) return;
    pointErrSum += norm(sub(estPoints[pt.id], pt.pos)); pointCount += 1;
  });

  return {
    cameras: cams.map((c, ci) => ({ ...c, reliable: reliable[ci] })),
    points: estPoints,
    metrics: {
      localised,
      totalToLocalise: NUM_CAMERAS - ANCHOR_COUNT,
      poseError: localised ? poseErrSum / localised : null,
      reproError: reproCount ? reproSum / reproCount : null,
      pointError: pointCount ? pointErrSum / pointCount : null,
      pointsReconstructed: pointCount,
    },
  };
}

export const helpers = { sub, add, scale, dot, cross, norm, normalize, matVec, matTVec, lookAt, rodrigues, project, backproject };
