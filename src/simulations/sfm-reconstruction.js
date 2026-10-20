// Calibrated two-view geometry. No synthetic camera poses or XYZ enter these
// functions: input is pixel correspondences and known interior calibration.
import { project, bundleStep } from "./photogrammetry-model.js";
import { intersectObservations } from "./aerial-survey.js";
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a) => {
  const n = Math.hypot(...a);
  return a.map((x) => x / (n || 1));
};
const transpose = (a) => a[0].map((_, j) => a.map((row) => row[j]));
const multiply = (a, b) =>
  a.map((row) => transpose(b).map((col) => dot(row, col)));
const mv = (a, b) => a.map((row) => dot(row, b));
const det = (a) => dot(a[0], cross(a[1], a[2]));
const identity = (n) =>
  Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => +(i === j)),
  );

export function symmetricEigen(matrix) {
  const a = matrix.map((r) => r.slice()),
    v = identity(a.length),
    n = a.length;
  for (let step = 0; step < 120 * n * n; step++) {
    let p = 0,
      q = 1,
      big = 0;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        if (Math.abs(a[i][j]) > big) {
          big = Math.abs(a[i][j]);
          p = i;
          q = j;
        }
    if (big < 1e-12) break;
    const theta = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]),
      c = Math.cos(theta),
      s = Math.sin(theta),
      app = a[p][p],
      aqq = a[q][q],
      apq = a[p][q];
    for (let i = 0; i < n; i++)
      if (i !== p && i !== q) {
        const x = a[i][p],
          y = a[i][q];
        a[i][p] = a[p][i] = c * x - s * y;
        a[i][q] = a[q][i] = s * x + c * y;
      }
    a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
    a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
    a[p][q] = a[q][p] = 0;
    for (let i = 0; i < n; i++) {
      const x = v[i][p],
        y = v[i][q];
      v[i][p] = c * x - s * y;
      v[i][q] = s * x + c * y;
    }
  }
  return a
    .map((r, i) => ({ value: r[i], vector: v.map((row) => row[i]) }))
    .sort((a, b) => a.value - b.value);
}
function svd3(a) {
  const eigen = symmetricEigen(multiply(transpose(a), a)).reverse();
  const v = transpose(eigen.map((e) => e.vector));
  if (det(v) < 0) for (let i = 0; i < 3; i++) v[i][2] *= -1;
  const u0 = unit(
      mv(
        a,
        v.map((r) => r[0]),
      ),
    ),
    raw = mv(
      a,
      v.map((r) => r[1]),
    ),
    u1 = unit(raw.map((x, i) => x - dot(raw, u0) * u0[i]));
  return { u: transpose([u0, u1, cross(u0, u1)]), v };
}
export function normalisedPixel(u, v, f = 1500, k1 = 0) {
  const xd = (u - 800) / f,
    yd = (v - 600) / f;
  let x = xd,
    y = yd;
  for (let i = 0; i < 12; i++) {
    const g = 1 + k1 * (x * x + y * y);
    x = xd / g;
    y = yd / g;
  }
  return [x, y, 1];
}
function essential(matches) {
  // Hartley normalisation before the homogeneous eight-point solve.
  const norm = (side) => {
    const pts = matches.map((m) => m[side]),
      cx = pts.reduce((s, p) => s + p[0], 0) / pts.length,
      cy = pts.reduce((s, p) => s + p[1], 0) / pts.length,
      scale =
        Math.SQRT2 /
        (pts.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) /
          pts.length || 1);
    return [
      [scale, 0, -scale * cx],
      [0, scale, -scale * cy],
      [0, 0, 1],
    ];
  };
  const ta = norm("a"),
    tb = norm("b"),
    ata = Array.from({ length: 9 }, () => Array(9).fill(0));
  for (const m of matches) {
    const [x, y] = mv(ta, m.a),
      [u, v] = mv(tb, m.b),
      row = [u * x, u * y, u, v * x, v * y, v, x, y, 1];
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 9; j++) ata[i][j] += row[i] * row[j];
  }
  const e = symmetricEigen(ata)[0].vector,
    raw = multiply(
      multiply(transpose(tb), [e.slice(0, 3), e.slice(3, 6), e.slice(6, 9)]),
      ta,
    ),
    { u, v } = svd3(raw);
  return multiply(
    multiply(u, [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]),
    transpose(v),
  );
}
export function sampsonError(e, a, b) {
  const ea = mv(e, a),
    etb = mv(transpose(e), b),
    d = dot(b, ea);
  return (
    (d * d) / (ea[0] ** 2 + ea[1] ** 2 + etb[0] ** 2 + etb[1] ** 2 || 1e-20)
  );
}
export function estimateEssential(
  matches,
  { thresholdPx = 1.5, f = 1500, trials = 160, seed = 17 } = {},
) {
  if (matches.length < 8) return null;
  let s = seed >>> 0,
    best = [],
    bestE = null;
  for (let t = 0; t < trials; t++) {
    const indices = new Set();
    while (indices.size < 8) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      indices.add(s % matches.length);
    }
    const e = essential([...indices].map((i) => matches[i]));
    const inliers = matches
      .map((m, i) =>
        sampsonError(e, m.a, m.b) < (thresholdPx / f) ** 2 ? i : -1,
      )
      .filter((i) => i >= 0);
    if (inliers.length > best.length) {
      best = inliers;
      bestE = e;
    }
  }
  if (best.length < 8) return null;
  const e = essential(best.map((i) => matches[i]));
  const inliers = matches
    .map((m, i) =>
      sampsonError(e, m.a, m.b) < (thresholdPx / f) ** 2 ? i : -1,
    )
    .filter((i) => i >= 0);
  return inliers.length >= best.length
    ? { e, inliers, trials }
    : { e: bestE, inliers: best, trials };
}
const D = [
  [1, 0, 0],
  [0, -1, 0],
  [0, 0, -1],
];
function cameraFromMatrix(b, c) {
  const r = multiply(D, transpose(b));
  return {
    c,
    a: [
      Math.atan2(r[2][1], r[2][2]),
      Math.asin(Math.max(-1, Math.min(1, -r[2][0]))),
      Math.atan2(r[1][0], r[0][0]),
    ],
  };
}
export function recoverPair(matches, estimate, f = 1500, k1 = 0) {
  const { u, v } = svd3(estimate.e),
    w = [
      [0, -1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ],
    candidates = [];
  for (const wm of [w, transpose(w)])
    for (const sign of [-1, 1]) {
      let r = multiply(multiply(u, wm), transpose(v));
      if (det(r) < 0) r = r.map((row) => row.map((x) => -x));
      const t = u.map((row) => sign * row[2]),
        b = multiply(r, D),
        c = mv(transpose(b), t).map((x) => -x);
      const cameras = [{ c: [0, 0, 0], a: [0, 0, 0] }, cameraFromMatrix(b, c)],
        state = { f, k1, cameras },
        points = [];
      for (const i of estimate.inliers) {
        const m = matches[i],
          hit = intersectObservations(state, [
            { ci: 0, u: m.uvA[0], v: m.uvA[1] },
            { ci: 1, u: m.uvB[0], v: m.uvB[1] },
          ]);
        if (hit && hit.angle > 0.5) points.push({ pi: m.pi, ...hit });
      }
      candidates.push({ cameras, points });
    }
  return candidates.sort((a, b) => b.points.length - a.points.length)[0];
}

export function makePairMatches(observations, first, second, f, k1) {
  return observations
    .filter((o) => o.ci === first && !o.checkpoint)
    .flatMap((a) => {
      const b = observations.find(
        (o) => o.ci === second && o.pi === a.pi && !o.checkpoint,
      );
      return b
        ? [
            {
              pi: a.pi,
              uvA: [a.u, a.v],
              uvB: [b.u, b.v],
              a: normalisedPixel(a.u, a.v, f, k1),
              b: normalisedPixel(b.u, b.v, f, k1),
            },
          ]
        : [];
    });
}
export function initialiseSfm(
  observations,
  {
    cameraCount = 6,
    pointCount = Math.max(0, ...observations.map(o => o.pi + 1)),
    f = 1500,
    k1 = -0.06,
    pair = [0, 2],
  } = {},
) {
  const matches = makePairMatches(observations, ...pair, f, k1),
    estimate = estimateEssential(matches, { f, thresholdPx: 2 });
  if (!estimate)
    return {
      error:
        "Fewer than eight geometrically consistent seed matches. Increase overlap or lower matching errors.",
    };
  const recovered = recoverPair(matches, estimate, f, k1);
  if (recovered.points.length < 8)
    return {
      error:
        "Insufficient positive-depth points or parallax. The seed pair is degenerate.",
    };
  const cameras = Array.from({ length: cameraCount }, () => null),
    points = Array.from({ length: pointCount }, () => null);
  pair.forEach((ci, i) => {
    cameras[ci] = recovered.cameras[i];
  });
  recovered.points.forEach((p) => {
    points[p.pi] = p.xyz;
  });
  return {
    f,
    k1,
    cameras,
    points,
    pair,
    registered: [...pair],
    matches: matches.length,
    inliers: estimate.inliers.length,
    rejected: matches.length - estimate.inliers.length,
    log: [
      `Eight-point RANSAC: ${estimate.inliers.length}/${matches.length} inliers; positive depth in ${recovered.points.length} tracks.`,
    ],
  };
}

// Calibrated DLT resection + pose-only nonlinear reprojection refinement.
// No navigation or truth pose is used even as the initial guess.
export function resectFromPoints(correspondences, f = 1500, k1 = -0.06) {
  if (correspondences.length < 6) return null;
  const mean = [0, 1, 2].map(
      (j) =>
        correspondences.reduce((s, o) => s + o.xyz[j], 0) /
        correspondences.length,
    ),
    scale =
      Math.sqrt(
        correspondences.reduce(
          (s, o) => s + o.xyz.reduce((a, x, j) => a + (x - mean[j]) ** 2, 0),
          0,
        ) / correspondences.length,
      ) || 1;
  const ata = Array.from({ length: 12 }, () => Array(12).fill(0));
  for (const o of correspondences) {
    const p = [...o.xyz.map((x, j) => (x - mean[j]) / scale), 1],
      [u, v] = normalisedPixel(o.u, o.v, f, k1);
    for (const row of [
      [...p, 0, 0, 0, 0, ...p.map((x) => -u * x)],
      [0, 0, 0, 0, ...p, ...p.map((x) => -v * x)],
    ])
      for (let i = 0; i < 12; i++)
        for (let j = 0; j < 12; j++) ata[i][j] += row[i] * row[j];
  }
  const raw = symmetricEigen(ata)[0].vector;
  let p = [raw.slice(0, 4), raw.slice(4, 8), raw.slice(8, 12)];
  let m = p.map((row) => row.slice(0, 3));
  if (det(m) < 0) {
    p = p.map((r) => r.map((x) => -x));
    m = p.map((row) => row.slice(0, 3));
  }
  const s = m.reduce((sum, row) => sum + Math.hypot(...row), 0) / 3,
    b0 = unit(m[0]),
    b1 = unit(m[1].map((x, j) => x - dot(m[1], b0) * b0[j])),
    b = [b0, b1, cross(b0, b1)],
    tn = p.map((row) => row[3] / s),
    c = mv(transpose(b), tn).map((x, j) => mean[j] - scale * x);
  let camera = cameraFromMatrix(b, c);
  const data = {
    noise: 0.5,
    observations: correspondences.map((o, pi) => ({
      ci: 0,
      pi,
      u: o.u,
      v: o.v,
    })),
    parameters: ["c", "a"].flatMap((type) =>
      [0, 1, 2].map((j) => ({ type, i: 0, j, scale: type === "c" ? 1 : 0.05 })),
    ),
  };
  let state = {
      f,
      k1,
      cameras: [camera],
      points: correspondences.map((o) => o.xyz),
    },
    lambda = 0.01;
  for (let i = 0; i < 12; i++) {
    const r = bundleStep(data, state, { lambda });
    state = r.state;
    lambda = r.lambda;
  }
  camera = state.cameras[0];
  const residuals = correspondences.map((o) => {
    const q = project(camera, o.xyz, f, k1);
    return q ? Math.hypot(q[0] - o.u, q[1] - o.v) : Infinity;
  });
  const inliers = residuals.filter((x) => x < 4).length;
  return inliers >= 6
    ? {
        camera,
        inliers,
        rms: Math.sqrt(
          residuals.filter((x) => x < 4).reduce((s, x) => s + x * x, 0) /
            (2 * inliers),
        ),
      }
    : null;
}
export function growSfm(model, observations) {
  const candidates = model.cameras
    .map((c, ci) => ({
      c,
      ci,
      corr: observations
        .filter((o) => o.ci === ci && !o.checkpoint && model.points[o.pi])
        .map((o) => ({ ...o, xyz: model.points[o.pi] })),
    }))
    .filter((c) => !c.c)
    .sort((a, b) => b.corr.length - a.corr.length);
  let success;
  for (const candidate of candidates) {
    const fit = resectFromPoints(candidate.corr, model.f, model.k1);
    if (fit) {
      success = { ...candidate, ...fit };
      break;
    }
  }
  if (!success)
    return {
      ...model,
      blocked: true,
      log: [
        ...model.log,
        "No additional camera has six consistent 2D–3D correspondences.",
      ],
    };
  const cameras = model.cameras.slice(),
    points = model.points.slice();
  cameras[success.ci] = success.camera;
  for (let pi = 0; pi < points.length; pi++) {
    const obs = observations.filter(
        (o) => o.pi === pi && !o.checkpoint && cameras[o.ci],
      ),
      hit = intersectObservations({ ...model, cameras }, obs);
    if (hit && hit.angle > 0.5) {
      const errors = obs.map((o) => {
        const p = project(cameras[o.ci], hit.xyz, model.f, model.k1);
        return p ? Math.hypot(p[0] - o.u, p[1] - o.v) : Infinity;
      });
      const good = obs.filter((_, i) => errors[i] < 4);
      const filtered = intersectObservations({ ...model, cameras }, good);
      if (filtered) points[pi] = filtered.xyz;
    }
  }
  return {
    ...model,
    cameras,
    points,
    registered: [...model.registered, success.ci],
    log: [
      ...model.log,
      `C${success.ci + 1}: DLT + robust resection, ${success.inliers} inliers; ${success.rms.toFixed(2)} px RMS.`,
    ],
  };
}
export function refineSfm(model, observations, iterations = 1) {
  const ids = model.registered,
    pointIds = model.points.map((p, i) => (p ? i : -1)).filter((i) => i >= 0),
    cameraMap = new Map(ids.map((ci, i) => [ci, i])),
    pointMap = new Map(pointIds.map((pi, i) => [pi, i]));
  const obs = observations
    .filter((o) => !o.checkpoint && cameraMap.has(o.ci) && pointMap.has(o.pi))
    .map((o) => ({ ...o, ci: cameraMap.get(o.ci), pi: pointMap.get(o.pi) }));
  const parameters = [];
  ids.forEach((_, i) => {
    for (const type of ["c", "a"])
      for (let j = 0; j < 3; j++)
        if (i !== 0 && !(i === 1 && type === "c" && j === 0))
          parameters.push({ type, i, j, scale: type === "c" ? 1 : 0.03 });
  });
  pointIds.forEach((_, i) => {
    for (let j = 0; j < 3; j++) parameters.push({ type: "p", i, j, scale: 1 });
  });
  const data = { observations: obs, parameters, noise: 0.5 };
  let state = {
      f: model.f,
      k1: model.k1,
      cameras: ids.map((ci) => model.cameras[ci]),
      points: pointIds.map((pi) => model.points[pi]),
    },
    lambda = model.lambda ?? 0.01;
  for (let i = 0; i < iterations; i++) {
    const r = bundleStep(data, state, { lambda });
    state = r.state;
    lambda = r.lambda;
  }
  const cameras = model.cameras.slice(),
    points = model.points.slice();
  ids.forEach((ci, i) => {
    cameras[ci] = state.cameras[i];
  });
  pointIds.forEach((pi, i) => {
    points[pi] = state.points[i];
  });
  // Report residuals directly, without requiring reference object coordinates.
  const residuals = obs.flatMap((o) => {
    const p = project(
      state.cameras[o.ci],
      state.points[o.pi],
      state.f,
      state.k1,
    );
    return p ? [p[0] - o.u, p[1] - o.v] : [1e5, 1e5];
  });
  return {
    ...model,
    cameras,
    points,
    lambda,
    rms: Math.sqrt(residuals.reduce((s, x) => s + x * x, 0) / residuals.length),
    iterations: (model.iterations ?? 0) + iterations,
  };
}
