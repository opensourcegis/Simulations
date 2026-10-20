import test from "node:test";
import assert from "node:assert/strict";
import {
  createAerialSurvey,
  surveyDiagnostics,
  intersectObservations,
  surveyVisible,
} from "../src/simulations/aerial-survey.js";
import {
  project,
  cameraRay,
  bundleStep,
  bundleMetrics,
  bundleConstraints,
  bundleObjective,
  bundleResiduals,
  cameraVector,
} from "../src/simulations/photogrammetry-model.js";
import {
  initialiseSfm,
  refineSfm,
  growSfm,
  makePairMatches,
  estimateEssential,
  normalisedPixel,
  symmetricEigen,
} from "../src/simulations/sfm-reconstruction.js";
const close = (a, b, t = 1e-7) => assert(Math.abs(a - b) < t, `${a} ≠ ${b}`);
const fit = (data, n = 16, robust = true) => {
  let state = data.initial,
    lambda = 0.01;
  for (let i = 0; i < n; i++) {
    const r = bundleStep(data, state, { lambda, robust });
    if (r.accepted) assert(r.cost <= bundleObjective(data, state, robust));
    state = r.state;
    lambda = r.lambda;
  }
  return state;
};
test("distorted projection and undistorted camera ray are mutual inverses", () => {
  const c = { c: [2, -3, 120], a: [0.01, -0.03, 0.02] },
    p = [26, 17, 8],
    uv = project(c, p, 1500, -0.06),
    ray = cameraRay(c, ...uv, 1500, -0.06),
    length = Math.hypot(...p.map((x, j) => x - c.c[j]));
  ray.forEach((x, j) => close(x, (p[j] - c.c[j]) / length));
});
test("aerial observations, survey control and navigation are repeatable but not perfect truth", () => {
  const d = createAerialSurvey();
  assert.deepEqual(d, createAerialSurvey());
  assert.notDeepEqual(d.controlObservations[0].xyz, d.truth.points[d.gcps[0]]);
  assert.notDeepEqual(d.cameraPriors[0].xyz, d.truth.cameras[0].c);
  assert(d.controlObservations.every((o) => o.sigma[2] > o.sigma[0]));
});
test("terrain/building visibility rejects a ray to ground underneath an opaque roof", () => {
  const cam = { c: [-10, 12, 120], a: [0, 0, 0] };
  assert.equal(surveyVisible(cam, [-10, 12, 0]), false);
  assert.equal(surveyVisible(cam, [-10, 12, 12]), true);
});
test("every fitted aerial point has multi-image support and no hidden single-ray XYZ unknown", () => {
  const d = createAerialSurvey({
    altitude: 90,
    baseline: 65,
    stripSpacing: 70,
  });
  for (const p of d.parameters.filter((p) => p.type === "p"))
    assert(d.observations.filter((o) => o.pi === p.i).length >= 2);
});
test("survey constraints have declared dimensions and GCP coordinates are adjustable unknowns", () => {
  const d = createAerialSurvey(),
    state = fit(d, 3);
  assert.equal(
    bundleConstraints(d, state).length,
    3 * (d.controlObservations.length + d.cameraPriors.length),
  );
  for (const pi of d.gcps)
    assert(d.parameters.some((p) => p.type === "p" && p.i === pi));
  assert.notDeepEqual(state.points[d.gcps[0]], d.initial.points[d.gcps[0]]);
});
test("checkpoint pixels and XYZ are excluded from objective and parameters", () => {
  const d = createAerialSurvey(),
    before = bundleObjective(d, d.initial);
  const changed = {
    ...d,
    observations: d.observations.map((o) =>
      o.checkpoint ? { ...o, u: o.u + 100, v: o.v - 200 } : o,
    ),
  };
  close(bundleObjective(changed, d.initial), before);
  assert(
    !d.parameters.some((p) => p.type === "p" && d.checkpoints.includes(p.i)),
  );
  assert.notDeepEqual(
    surveyDiagnostics(changed, d.initial).checks,
    surveyDiagnostics(d, d.initial).checks,
  );
});
test("weighted aerial bundle converges and independently intersects check XYZ", () => {
  const d = createAerialSurvey(),
    state = fit(d),
    m = bundleMetrics(d, state),
    q = surveyDiagnostics(d, state);
  assert(m.rms < 0.6);
  assert(q.rmseZ < 0.25);
  assert(q.rmseX < 0.15);
  assert(q.rmseY < 0.15);
  assert(q.checks.every((p) => p.valid && p.angle > 1));
});
test("robust aerial adjustment improves independent height under gross image errors", () => {
  const d = createAerialSurvey({ outliers: true }),
    a = surveyDiagnostics(d, fit(d, 18, true)),
    b = surveyDiagnostics(d, fit(d, 18, false));
  assert(a.rmseZ < b.rmseZ, `${a.rmseZ} vs ${b.rmseZ}`);
});
test("a free aerial block fixes seven estimated gauge values, not surveyed camera truth", () => {
  const d = createAerialSurvey({ control: "none", navigation: "off" }),
    state = fit(d, 2);
  assert.equal(
    d.parameters.filter((p) => p.type === "c" || p.type === "a").length,
    29,
  );
  assert.deepEqual(state.cameras[0], d.initial.cameras[0]);
  assert.notDeepEqual(state.cameras[0], d.truth.cameras[0]);
  close(state.cameras[1].c[0], d.initial.cameras[1].c[0]);
});
test("focal length and radial distortion are actually estimated from strong noiseless survey control", () => {
  const d = createAerialSurvey({
      calibrate: true,
      noise: 0,
      controlSigma: 0.000001,
      navigation: "off",
    }),
    state = fit(d, 25);
  assert(d.parameters.some((p) => p.type === "f"));
  assert(d.parameters.some((p) => p.type === "k1"));
  close(state.f, d.truth.f, 0.02);
  close(state.k1, d.truth.k1, 0.0001);
});
test("larger ray intersection angle responds to actual baseline geometry", () => {
  const angle = (baseline) => {
    const d = createAerialSurvey({ baseline, noise: 0 });
    return intersectObservations(
      d.truth,
      d.observations.filter((o) => o.pi === 14 && o.ci < 2),
    ).angle;
  };
  assert(angle(40) > angle(12) * 2);
});
test("symmetric eigensolver recovers an exact known eigenpair", () => {
  const e = symmetricEigen([
    [2, 1],
    [1, 2],
  ]);
  close(e[0].value, 1);
  close(e[1].value, 3);
});
test("essential initialization has no truth-pose fallback and needs enough pixel matches", () => {
  assert(initialiseSfm([]).error);
  const d = createAerialSurvey({ noise: 0 }),
    matches = makePairMatches(d.observations, 0, 1, 1500, -0.06);
  assert.equal(estimateEssential(matches.slice(0, 7)), null);
  const m = initialiseSfm(d.observations, {
    pair: [0, 1],
    pointCount: d.truth.points.length,
  });
  assert(!m.error);
  assert.deepEqual(m.cameras[0], { c: [0, 0, 0], a: [0, 0, 0] });
  assert.notDeepEqual(m.cameras[1], d.truth.cameras[1]);
  assert(m.points.filter(Boolean).length >= 20);
});
test("SfM recovers noiseless structure up to the unobservable similarity gauge", () => {
  const d = createAerialSurvey({ noise: 0 }),
    baseline = Math.hypot(
      ...d.truth.cameras[1].c.map((x, j) => x - d.truth.cameras[0].c[j]),
    );
  let m = initialiseSfm(d.observations, {
    pair: [0, 1],
    pointCount: d.truth.points.length,
  });
  m = refineSfm(m, d.observations, 5);
  for (let i = 0; i < 4; i++) {
    m = growSfm(m, d.observations);
    m = refineSfm(m, d.observations, 3);
  }
  assert.equal(m.registered.length, 6);
  assert(m.rms < 1e-5);
  for (const [pi, p] of m.points.entries())
    if (p) {
      const q = cameraVector(d.truth.cameras[0], d.truth.points[pi]).map(
        (x, j) => (x * (j === 0 ? 1 : -1)) / baseline,
      );
      p.forEach((x, j) => close(x, q[j], 1e-5));
    }
});
test("noisy incremental SfM registers all cameras using pixel evidence only", () => {
  const d = createAerialSurvey();
  let m = initialiseSfm(d.observations, {
    pair: [0, 1],
    pointCount: d.truth.points.length,
  });
  assert(!m.error);
  m = refineSfm(m, d.observations, 8);
  for (let i = 0; i < 4; i++) {
    m = growSfm(m, d.observations);
    assert(!m.blocked);
    m = refineSfm(m, d.observations, 5);
  }
  assert.equal(m.registered.length, 6);
  assert(m.rms < 0.6);
  assert(m.points.filter(Boolean).length > 30);
});
test("essential RANSAC rejects inconsistent seed correspondences without oracle bad flags", () => {
  const d = createAerialSurvey({ outliers: true }),
    obs = d.observations.map(({ bad, ...o }) => o),
    m = initialiseSfm(obs, { pair: [0, 1], pointCount: d.truth.points.length });
  assert(!m.error);
  assert(m.rejected > 0);
  assert(m.inliers >= 8);
});
