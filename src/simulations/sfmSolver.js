// Structure-from-Motion teaching solver.
//
// Everything here is plain, deterministic maths so it can be unit-tested with
// Node and reused by the React view. The scene is an actual 3D object (a little
// house mesh); its corners are the detectable feature keypoints. The learner
// matches the same physical corner across several photographs, and this module
// turns those pixel correspondences into 3D structure and adjusted camera poses
// exactly the way a real incremental SfM pipeline does: triangulate 3D points
// from matched rays, then resection (pose-estimate) each remaining camera from
// those points, and alternate. Two "reference" cameras are held at ground truth
// to fix the coordinate frame (gauge), like a reconstruction anchored to known
// control.

export const INTRINSICS = { f: 210, cx: 110, cy: 82, width: 220, height: 165 };
export const NUM_CAMERAS = 8;
export const ANCHOR_COUNT = 2; // first two cameras are the fixed reference pair

// ---------------------------------------------------------------------------
// vec3 + mat3 helpers, plus a small dense solve for resection.
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };

// Row-major 3x3 stored as [r0, r1, r2].
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

// Rodrigues: rotation matrix from an axis-angle vector w.
function rodrigues(w) {
  const theta = norm(w);
  if (theta < 1e-9) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const k = scale(w, 1 / theta);
  const c = Math.cos(theta); const s = Math.sin(theta);
  const K = [[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]];
  const KK = matMul(K, K);
  const out = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) out[i][j] = (i === j ? 1 : 0) + s * K[i][j] + (1 - c) * KK[i][j];
  return out;
}

// Look-at rotation (world -> camera). Rows are the right/down/forward axes.
function lookAt(position, target, up = [0, 0, 1]) {
  const forward = normalize(sub(target, position));
  let right = cross(forward, up);
  if (norm(right) < 1e-6) right = cross(forward, [0, 1, 0]);
  right = normalize(right);
  const down = cross(forward, right);
  return [right, down, forward];
}

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

// Deterministic RNG so scene + noise are reproducible.
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

function backproject(camera, uv) {
  const dirCam = normalize([(uv[0] - INTRINSICS.cx) / INTRINSICS.f, (uv[1] - INTRINSICS.cy) / INTRINSICS.f, 1]);
  return normalize(matTVec(camera.R, dirCam));
}

// Möller–Trumbore ray/triangle intersection; returns t along dir or null.
function rayTriangle(orig, dir, a, b, c) {
  const e1 = sub(b, a); const e2 = sub(c, a);
  const p = cross(dir, e2);
  const det = dot(e1, p);
  if (Math.abs(det) < 1e-8) return null;
  const inv = 1 / det;
  const tvec = sub(orig, a);
  const u = dot(tvec, p) * inv;
  if (u < -1e-4 || u > 1 + 1e-4) return null;
  const q = cross(tvec, e1);
  const v = dot(dir, q) * inv;
  if (v < -1e-4 || u + v > 1 + 1e-4) return null;
  return dot(e2, q) * inv;
}

// ---------------------------------------------------------------------------
// The 3D object: a little gabled house. Its 10 corners are the feature
// keypoints the learner matches across photographs.
// ---------------------------------------------------------------------------
export const MESH = (() => {
  const x = 3; const y = 3.7; const h = 3; const ridge = 5.2;
  const vertices = [
    [-x, -y, 0], [x, -y, 0], [x, y, 0], [-x, y, 0], // 0-3 base
    [-x, -y, h], [x, -y, h], [x, y, h], [-x, y, h], // 4-7 eave
    [0, -y, ridge], [0, y, ridge], // 8-9 ridge
  ];
  const wallA = '#c8a678'; const wallB = '#b58f60'; const roof = '#a8493b'; const floor = '#6c7076';
  const faces = [
    { idx: [0, 1, 5, 4], color: wallA }, // front wall
    { idx: [1, 2, 6, 5], color: wallB }, // right wall
    { idx: [2, 3, 7, 6], color: wallA }, // back wall
    { idx: [3, 0, 4, 7], color: wallB }, // left wall
    { idx: [5, 6, 9, 8], color: roof }, // east roof slope
    { idx: [4, 8, 9, 7], color: roof }, // west roof slope
    { idx: [4, 5, 8], color: '#933f33' }, // front gable
    { idx: [7, 9, 6], color: '#933f33' }, // back gable
    { idx: [0, 3, 2, 1], color: floor }, // floor
  ];
  const center = [0, 0, (h + ridge) / 3];
  // Structural faces (used for keypoints + occlusion): store outward normal,
  // centroid and world-space corner points.
  faces.forEach((f) => {
    const a = vertices[f.idx[0]]; const b = vertices[f.idx[1]]; const c = vertices[f.idx[2]];
    let n = normalize(cross(sub(b, a), sub(c, a)));
    const centroid = scale(f.idx.reduce((acc, i) => add(acc, vertices[i]), [0, 0, 0]), 1 / f.idx.length);
    if (dot(n, sub(centroid, center)) < 0) n = scale(n, -1);
    f.normal = n; f.centroid = centroid;
    f.pts = f.idx.map((i) => vertices[i]);
  });

  // Painted-on details (door, windows) so each face is easy to tell apart.
  // Each is a small quad lifted a hair off its wall along the outward normal.
  const door = '#4a3324'; const glass = '#8fb9d6'; const frame = '#33261a'; const sill = '#9aa0a6';
  const off = 0.03;
  const rect = (pts, color) => ({ pts, color, decor: true });
  const decorSpecs = [
    // front wall (outward -Y): door + two windows
    rect([[-0.85, -y - off, 0], [0.85, -y - off, 0], [0.85, -y - off, 2.05], [-0.85, -y - off, 2.05]], door),
    rect([[-0.95, -y - off, 2.05], [0.95, -y - off, 2.05], [0.95, -y - off, 2.25], [-0.95, -y - off, 2.25]], frame),
    rect([[-2.45, -y - off, 1.5], [-1.4, -y - off, 1.5], [-1.4, -y - off, 2.55], [-2.45, -y - off, 2.55]], glass),
    rect([[1.4, -y - off, 1.5], [2.45, -y - off, 1.5], [2.45, -y - off, 2.55], [1.4, -y - off, 2.55]], glass),
    // right wall (outward +X)
    rect([[x + off, -1.7, 1.2], [x + off, -0.45, 1.2], [x + off, -0.45, 2.35], [x + off, -1.7, 2.35]], glass),
    rect([[x + off, 0.45, 1.2], [x + off, 1.7, 1.2], [x + off, 1.7, 2.35], [x + off, 0.45, 2.35]], glass),
    // left wall (outward -X)
    rect([[-x - off, -1.7, 1.2], [-x - off, -0.45, 1.2], [-x - off, -0.45, 2.35], [-x - off, -1.7, 2.35]], glass),
    rect([[-x - off, 0.45, 1.2], [-x - off, 1.7, 1.2], [-x - off, 1.7, 2.35], [-x - off, 0.45, 2.35]], glass),
    // back wall (outward +Y): a wide window
    rect([[-1.9, y + off, 1.1], [1.9, y + off, 1.1], [1.9, y + off, 2.4], [-1.9, y + off, 2.4]], glass),
    rect([[-2.0, y + off, 1.0], [2.0, y + off, 1.0], [2.0, y + off, 1.1], [-2.0, y + off, 1.1]], sill),
  ];
  decorSpecs.forEach((f) => {
    const [a, b, c] = f.pts;
    let n = normalize(cross(sub(b, a), sub(c, a)));
    const centroid = scale(f.pts.reduce((acc, p) => add(acc, p), [0, 0, 0]), 1 / f.pts.length);
    if (dot(n, sub(centroid, center)) < 0) n = scale(n, -1);
    f.normal = n; f.centroid = centroid;
  });

  const labels = ['front-L base', 'front-R base', 'back-R base', 'back-L base', 'front-L eave', 'front-R eave', 'back-R eave', 'back-L eave', 'front ridge', 'back ridge'];
  const palette = ['#e6463b', '#f5a623', '#f8e71c', '#7ed321', '#2ec6a8', '#39a0ff', '#5b6bff', '#b06bff', '#ff5fa2', '#39d0d8'];
  const keypoints = vertices.map((pos, id) => ({ id, pos, label: labels[id], color: palette[id] }));
  // drawFaces = structural + decorations, all with pts/normal/centroid for the renderer.
  const drawFaces = [...faces, ...decorSpecs];
  return { vertices, faces, drawFaces, keypoints, center };
})();

// Triangles for occlusion tests (quads split into two triangles).
const TRIANGLES = MESH.faces.flatMap((f) => {
  const [a, b, c, d] = f.idx;
  return d === undefined ? [[a, b, c]] : [[a, b, c], [a, c, d]];
});

// Is a keypoint visible (unoccluded, in front, in frame) from a camera?
export function keypointVisible(camera, vertexId) {
  const X = MESH.vertices[vertexId];
  const p = project(camera, X);
  if (!p) return false;
  if (p[0] < 3 || p[0] > INTRINSICS.width - 3 || p[1] < 3 || p[1] > INTRINSICS.height - 3) return false;
  const dir = sub(X, camera.t);
  const dist = norm(dir);
  const d = scale(dir, 1 / dist);
  for (const tri of TRIANGLES) {
    if (tri.includes(vertexId)) continue;
    const t = rayTriangle(camera.t, d, MESH.vertices[tri[0]], MESH.vertices[tri[1]], MESH.vertices[tri[2]]);
    if (t !== null && t > 0.05 && t < dist - 0.05) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Ground-truth cameras on an elevated arc, plus the noisy keypoint pixels the
// learner actually clicks (sub-pixel detector noise baked in, per camera).
// ---------------------------------------------------------------------------
export function buildScene(seed = 7, noisePx = 0.5) {
  const rng = mulberry32(seed);
  const target = MESH.center;
  const cameras = [];
  for (let i = 0; i < NUM_CAMERAS; i += 1) {
    const az = (-78 + (156 * i) / (NUM_CAMERAS - 1)) * Math.PI / 180;
    const radius = 19 + rng() * 1.5;
    const height = 6.5 + rng() * 4;
    const t = [Math.sin(az) * radius, -Math.cos(az) * radius, height];
    cameras.push({ id: i, t, R: lookAt(t, target) });
  }
  // keypointPixels[camIndex] = { vertexId: [u, v] } for every visible corner.
  const keypointPixels = cameras.map((cam) => {
    const seen = {};
    MESH.keypoints.forEach((kp) => {
      if (!keypointVisible(cam, kp.id)) return;
      const p = project(cam, kp.pos);
      seen[kp.id] = [p[0] + (rng() - 0.5) * 2 * noisePx, p[1] + (rng() - 0.5) * 2 * noisePx];
    });
    return seen;
  });
  return { mesh: MESH, keypoints: MESH.keypoints, cameras, keypointPixels, target };
}

// Noisy initial guess for the non-anchored cameras (what SfM starts from).
export function initialCameras(scene, seed = 42) {
  const rng = mulberry32(seed);
  return scene.cameras.map((cam, i) => {
    if (i < ANCHOR_COUNT) return { t: cam.t.slice(), R: cam.R.map((r) => r.slice()), anchored: true };
    const tNoise = [(rng() - 0.5) * 8, (rng() - 0.5) * 8, (rng() - 0.5) * 4];
    const wNoise = [(rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6, (rng() - 0.5) * 0.6];
    return { t: add(cam.t, tNoise), R: matMul(rodrigues(wNoise), cam.R), anchored: false };
  });
}

// Triangulate from every reliable camera that observes a track:
//   (Σ (I - dd^T)) X = Σ (I - dd^T) c
function triangulate(rays) {
  if (rays.length < 2) return null;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const b = [0, 0, 0];
  rays.forEach(({ c, d }) => {
    for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) {
      const m = (i === j ? 1 : 0) - d[i] * d[j];
      A[i][j] += m; b[i] += m * c[j];
    }
  });
  return solve3(A, b);
}

// Gauss-Newton / LM camera resection (6 DOF) from 3D->2D correspondences.
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
  const iterates = [t.slice()]; // camera-centre path, for visualising the adjustment
  for (let iter = 0; iter < 16; iter += 1) {
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
    if (after < before) { t = tNew; R = RNew; iterates.push(t.slice()); lambda = Math.max(lambda * 0.5, 1e-6); if (before - after < 1e-6) break; }
    else { lambda = Math.min(lambda * 4, 1e3); }
  }
  return { t, R, iterates };
}

// ---------------------------------------------------------------------------
// Incremental reconstruction from the learner's matched tracks.
// tracks: [{ featureId, obs: { [camIndex]: [u, v] } }]
// ---------------------------------------------------------------------------
export function solve(scene, tracks, initCams) {
  const cams = initCams.map((c) => ({ t: c.t.slice(), R: c.R.map((r) => r.slice()), anchored: c.anchored }));
  const reliable = cams.map((c) => !!c.anchored);
  const estPoints = {}; // featureId -> [x,y,z]
  // Per-camera resection record: adjustment path + final correspondence count.
  const trails = cams.map(() => null);
  const corrUsed = cams.map(() => 0);

  for (let round = 0; round < 12; round += 1) {
    // Triangulate every track from reliable cameras that observe it.
    tracks.forEach((track) => {
      const rays = [];
      Object.keys(track.obs).forEach((ci) => {
        const idx = Number(ci);
        if (!reliable[idx]) return;
        rays.push({ c: cams[idx].t, d: backproject(cams[idx], track.obs[ci]) });
      });
      const X = triangulate(rays);
      if (X) estPoints[track.featureId] = X;
    });

    // Resection every non-reliable camera from currently solved points.
    cams.forEach((cam, ci) => {
      if (cam.anchored || reliable[ci]) return;
      const corr = [];
      tracks.forEach((track) => {
        const uv = track.obs[ci];
        if (!uv || !estPoints[track.featureId]) return;
        corr.push({ X: estPoints[track.featureId], uv });
      });
      const pose = resection(cam, corr);
      if (pose) {
        cam.t = pose.t; cam.R = pose.R;
        corrUsed[ci] = corr.length;
        // Record the camera-centre path: first solve seeds it (initial guess ->
        // solution), later refinement rounds append their end point.
        if (!trails[ci]) trails[ci] = pose.iterates.slice();
        else if (pose.iterates.length) trails[ci].push(pose.iterates[pose.iterates.length - 1]);
        let err = 0; let count = 0;
        corr.forEach(({ X, uv }) => { const p = project(cam, X); if (p) { err += Math.hypot(p[0] - uv[0], p[1] - uv[1]); count += 1; } });
        if (count >= 4 && err / count < 5) reliable[ci] = true;
      }
    });
  }

  // Metrics ----------------------------------------------------------------
  let poseErrSum = 0; let localised = 0;
  cams.forEach((cam, ci) => {
    if (cam.anchored) return;
    if (reliable[ci]) { poseErrSum += norm(sub(cam.t, scene.cameras[ci].t)); localised += 1; }
  });

  let reproSum = 0; let reproCount = 0;
  tracks.forEach((track) => {
    if (!estPoints[track.featureId]) return;
    Object.keys(track.obs).forEach((ci) => {
      const idx = Number(ci);
      if (!reliable[idx]) return;
      const p = project(cams[idx], estPoints[track.featureId]);
      if (p) { reproSum += Math.hypot(p[0] - track.obs[ci][0], p[1] - track.obs[ci][1]); reproCount += 1; }
    });
  });

  return {
    cameras: cams.map((c, ci) => {
      const trail = trails[ci];
      const gt = scene.cameras[ci].t;
      return {
        ...c,
        reliable: reliable[ci],
        trail,
        iterations: trail ? trail.length - 1 : 0,
        corrUsed: corrUsed[ci],
        initialOffset: trail ? norm(sub(trail[0], gt)) : null,
        finalOffset: reliable[ci] && !c.anchored ? norm(sub(c.t, gt)) : null,
      };
    }),
    points: estPoints,
    metrics: {
      localised,
      totalToLocalise: NUM_CAMERAS - ANCHOR_COUNT,
      poseError: localised ? poseErrSum / localised : null,
      reproError: reproCount ? reproSum / reproCount : null,
      pointsReconstructed: Object.keys(estPoints).length,
    },
  };
}

export const helpers = { sub, add, scale, dot, cross, norm, normalize, matVec, matTVec, lookAt, rodrigues, project, backproject };
