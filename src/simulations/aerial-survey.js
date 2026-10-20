import { project, cameraRay, solveLinear } from "./photogrammetry-model.js";

export function surveyRandom(seed = 61) {
  let s = seed >>> 0;
  const uniform = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
  return () =>
    Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}
export function terrainHeight(x, y) {
  return (
    0.06 * x +
    0.03 * y +
    (Math.abs(y) < 3 ? 0 : 3 * Math.sin(x / 24) * Math.sin(y / 20))
  );
}
export const SURVEY_BUILDINGS = [
  { x: -16, y: 7, w: 12, d: 12, h: 9 },
  { x: 17, y: -22, w: 11, d: 9, h: 6 },
];
export function surfaceHeight(x, y) {
  let z = terrainHeight(x, y);
  for (const b of SURVEY_BUILDINGS)
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.d)
      z = Math.max(z, terrainHeight(b.x + b.w / 2, b.y + b.d / 2) + b.h);
  return z;
}
export function surveyVisible(camera, point, f = 1500, k1 = 0) {
  const uv = project(camera, point, f, k1);
  if (!uv || uv[0] < 15 || uv[0] > 1585 || uv[1] < 15 || uv[1] > 1185)
    return false;
  for (let i = 1; i < 64; i++) {
    const t = i / 64,
      p = camera.c.map((v, j) => v + (point[j] - v) * t);
    if (p[2] < surfaceHeight(p[0], p[1]) - 0.15) return false;
  }
  return true;
}

export function createAerialSurvey({
  altitude = 120,
  baseline = 32,
  stripSpacing = 38,
  noise = 0.5,
  control = "distributed",
  controlSigma = 0.03,
  navigation = "standard",
  outliers = false,
  calibrate = false,
  seed = 61,
} = {}) {
  const normal = surveyRandom(seed),
    truth = { f: 1500, k1: -0.06, cameras: [], points: [] };
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 3; col++)
      truth.cameras.push({
        c: [
          (col - 1) * baseline,
          (row - 0.5) * stripSpacing,
          altitude + 0.6 * Math.sin(col + row),
        ],
        a: [0.008 * (row ? 1 : -1), 0.01 * (col - 1), 0.012 * (row ? 1 : -1)],
      });
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 6; col++) {
      const x = (col - 2.5) * 16,
        y = (row - 2.5) * 13;
      truth.points.push([x, y, surfaceHeight(x, y)]);
    }
  for (const x of [-24, 0, 24]) truth.points.push([x, 0, terrainHeight(x, 0)]);
  const b = SURVEY_BUILDINGS[0];
  for (const [x, y] of [
    [b.x + 0.2, b.y + 0.2],
    [b.x + b.w - 0.2, b.y + 0.2],
    [b.x + b.w - 0.2, b.y + b.d - 0.2],
    [b.x + 0.2, b.y + b.d - 0.2],
  ])
    truth.points.push([x, y, surfaceHeight(x, y)]);
  const gcps =
    control === "none"
      ? []
      : control === "collinear"
        ? [36, 37, 38]
        : control === "five"
          ? [0, 5, 30, 35, 14]
          : [0, 5, 35];
  const checkpoints = [7, 10, 25, 28],
    observations = [];
  truth.cameras.forEach((cam, ci) =>
    truth.points.forEach((p, pi) => {
      if (!surveyVisible(cam, p, truth.f, truth.k1)) return;
      const uv = project(cam, p, truth.f, truth.k1),
        bad =
          outliers &&
          !checkpoints.includes(pi) &&
          (ci * truth.points.length + pi) % 23 === 9;
      observations.push({
        ci,
        pi,
        u: uv[0] + noise * normal() + (bad ? 24 : 0),
        v: uv[1] + noise * normal() - (bad ? 17 : 0),
        bad,
        checkpoint: checkpoints.includes(pi),
      });
    }),
  );
  const controlObservations = gcps.map((pi) => ({
    pi,
    xyz: truth.points[pi].map(
      (x, j) => x + controlSigma * (j === 2 ? 1.5 : 1) * normal(),
    ),
    sigma: [controlSigma, controlSigma, controlSigma * 1.5],
  }));
  const navSigma = navigation === "rtk" ? [0.04, 0.04, 0.07] : [1.5, 1.5, 2.5];
  const cameraPriors =
    navigation === "off"
      ? []
      : truth.cameras.map((cam, ci) => ({
          ci,
          xyz: cam.c.map((x, j) => x + navSigma[j] * normal()),
          sigma: navSigma,
        }));
  const initial = {
    f: calibrate ? 1545 : truth.f,
    k1: calibrate ? 0 : truth.k1,
    cameras: truth.cameras.map((c, ci) => ({
      c: cameraPriors[ci]?.xyz.slice() ?? c.c.map((x) => x + 2 * normal()),
      a: c.a.map((x) => x + 0.012 * normal()),
    })),
    points: truth.points.map(
      (p, pi) =>
        controlObservations.find((o) => o.pi === pi)?.xyz.slice() ??
        p.map((x) => x + 1.1 * normal()),
    ),
  };
  const relative = gcps.length === 0 && cameraPriors.length === 0,
    parameters = [];
  initial.cameras.forEach((_, i) => {
    for (const type of ["c", "a"])
      for (let j = 0; j < 3; j++)
        if (!(relative && (i === 0 || (i === 1 && type === "c" && j === 0))))
          parameters.push({ type, i, j, scale: type === "c" ? 1 : 0.02 });
  });
  const reconstructable = truth.points.map(
    (_, pi) => observations.filter((o) => o.pi === pi).length >= 2,
  );
  truth.points.forEach((_, i) => {
    if (!checkpoints.includes(i) && reconstructable[i])
      for (let j = 0; j < 3; j++)
        parameters.push({ type: "p", i, j, scale: 1 });
  });
  // Single-view features are not silently supported by synthetic XYZ.
  const validObservations = observations.filter((o) => reconstructable[o.pi]);
  if (calibrate)
    parameters.push({ type: "f", scale: 100 }, { type: "k1", scale: 0.1 });
  return {
    truth,
    initial,
    gcps,
    checkpoints,
    observations: validObservations,
    parameters,
    control,
    noise,
    controlObservations: controlObservations.filter(
      (o) => reconstructable[o.pi],
    ),
    cameraPriors,
    relative,
    altitude,
    baseline,
    stripSpacing,
    controlSigma,
    navigation,
    reconstructable,
  };
}

export function intersectObservations(state, observations) {
  if (observations.length < 2) return null;
  const n = Array.from({ length: 3 }, () => [0, 0, 0]),
    b = [0, 0, 0],
    rays = [];
  for (const o of observations) {
    const cam = state.cameras[o.ci],
      d = cameraRay(cam, o.u, o.v, state.f, state.k1);
    rays.push({ c: cam.c, d });
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const p = (i === j ? 1 : 0) - d[i] * d[j];
        n[i][j] += p;
        b[i] += p * cam.c[j];
      }
  }
  const xyz = solveLinear(n, b);
  if (!xyz) return null;
  if (
    rays.some((r) => r.d.reduce((s, x, j) => s + x * (xyz[j] - r.c[j]), 0) <= 0)
  )
    return null;
  let angle = 0;
  for (let i = 0; i < rays.length; i++)
    for (let j = 0; j < i; j++)
      angle = Math.max(
        angle,
        (Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              rays[i].d.reduce((s, x, k) => s + x * rays[j].d[k], 0),
            ),
          ),
        ) *
          180) /
          Math.PI,
      );
  return {
    xyz,
    angle,
    rayRms: Math.sqrt(
      rays.reduce((s, r) => {
        const v = xyz.map((x, j) => x - r.c[j]),
          t = v.reduce((a, x, j) => a + x * r.d[j], 0);
        return s + v.reduce((a, x, j) => a + (x - t * r.d[j]) ** 2, 0);
      }, 0) / rays.length,
    ),
  };
}
export function surveyDiagnostics(data, state) {
  const checks = data.checkpoints.map((pi) => {
    const hit = intersectObservations(
      state,
      data.observations.filter((o) => o.pi === pi),
    );
    if (!hit) return { pi, valid: false };
    const delta = hit.xyz.map((x, j) => x - data.truth.points[pi][j]);
    return { pi, valid: true, ...hit, delta };
  });
  const valid = checks.filter((p) => p.valid),
    rms = (j) =>
      valid.length
        ? Math.sqrt(
            valid.reduce((s, p) => s + p.delta[j] ** 2, 0) / valid.length,
          )
        : null;
  const tracks = data.truth.points
    .map((_, pi) => ({
      pi,
      count: data.observations.filter((o) => o.pi === pi && !o.checkpoint)
        .length,
    }))
    .filter((p) => p.count >= 2);
  const selected = [];
  for (let i = 0; i < state.cameras.length; i++)
    for (let j = 0; j < i; j++) {
      const common = tracks.filter(
        (t) =>
          data.observations.some((o) => o.pi === t.pi && o.ci === i) &&
          data.observations.some((o) => o.pi === t.pi && o.ci === j),
      ).length;
      if (common) selected.push({ i, j, count: common });
    }
  const footprintW = (1600 / state.f) * data.altitude,
    footprintH = (1200 / state.f) * data.altitude;
  return {
    checks,
    rmseX: rms(0),
    rmseY: rms(1),
    rmseZ: rms(2),
    tracks,
    connections: selected,
    gsd: data.altitude / state.f,
    forwardOverlap: Math.max(0, 1 - data.baseline / footprintW),
    sideOverlap: Math.max(0, 1 - data.stripSpacing / footprintH),
    constraintEquations:
      3 * (data.controlObservations.length + data.cameraPriors.length),
  };
}
