import test from "node:test";
import assert from "node:assert/strict";
import {
  project,
  cameraRay,
  createBundle,
  bundleResiduals,
  bundleMetrics,
  bundleStep,
  solveLinear,
  cameraOptics,
  lensRayAtSensor,
  distort,
} from "../src/simulations/photogrammetry-model.js";
const close = (a, b, t = 1e-9) => assert(Math.abs(a - b) < t, `${a} != ${b}`);
const fit = (data, robust = true, n = 22) => {
  let state = data.initial,
    lambda = 0.01;
  for (let i = 0; i < n; i++) {
    const step = bundleStep(data, state, { robust, lambda });
    state = step.state;
    lambda = step.lambda;
  }
  return { state, ...bundleMetrics(data, state) };
};
test("nadir projection has the declared camera axis convention", () => {
  const cam = { c: [0, 0, 10], a: [0, 0, 0] };
  assert.deepEqual(project(cam, [0, 0, 0]), [800, 600]);
  assert.deepEqual(project(cam, [1, 1, 0]), [950, 450]);
  assert.equal(project(cam, [0, 0, 11]), null);
});
test("projected pixel back-rays invert arbitrary camera orientation", () => {
  const cam = { c: [2, -1, 12], a: [0.1, -0.04, 0.2] },
    p = [1, 2, 0.3],
    q = project(cam, p),
    d = cameraRay(cam, ...q, 1500),
    n = Math.hypot(...p.map((x, i) => x - cam.c[i]));
  d.forEach((x, i) => close(x, (p[i] - cam.c[i]) / n));
});
test("synthetic data and perturbations are seeded and repeatable", () =>
  assert.deepEqual(createBundle(), createBundle()));
test("withheld checkpoints supply no adjustment residuals or unknowns", () => {
  const d = createBundle();
  assert.equal(
    bundleResiduals(d, d.initial).length,
    d.observations.filter((o) => !o.checkpoint).length * 2,
  );
  assert(
    !d.parameters.some((p) => p.type === "p" && d.checkpoints.includes(p.i)),
  );
});
test("GCP coordinates remain exact, and the solver does not mutate old estimates", () => {
  const d = createBundle(),
    before = JSON.stringify(d.initial),
    r = bundleStep(d, d.initial);
  assert.equal(JSON.stringify(d.initial), before);
  d.gcps.forEach((i) => assert.deepEqual(r.state.points[i], d.truth.points[i]));
});
test("real noiseless bundle adjustment recovers ground and cameras through residual minimisation", () => {
  const d = createBundle({ noise: 0 }),
    r = fit(d);
  assert(r.rms < 1e-5);
  assert(r.pointRmse < 1e-5);
  assert(r.checkpointRmse < 1e-5);
});
test("a noisy clean block converges to the noise floor and useful checkpoints", () => {
  const d = createBundle(),
    initial = bundleMetrics(d, d.initial),
    r = fit(d);
  assert(r.rms < 0.5);
  assert(r.rms < initial.rms / 20);
  assert(r.checkpointRmse < 0.1);
});
test("robust loss improves 3D ties with gross errors despite higher raw pixel RMS", () => {
  const d = createBundle({ outliers: true }),
    robust = fit(d, true),
    ordinary = fit(d, false);
  assert(robust.pointRmse < ordinary.pointRmse / 2);
  assert(robust.rms > ordinary.rms);
});
test("free-network datum removes exactly seven camera parameters without claiming absolute accuracy", () => {
  const d = createBundle({ control: "none" }),
    s = bundleStep(d, d.initial).state;
  assert.deepEqual(s.cameras[0], d.initial.cameras[0]);
  close(s.cameras[1].c[0], d.initial.cameras[1].c[0]);
  assert.equal(
    d.parameters.filter((p) => p.type === "c" || p.type === "a").length,
    29,
  );
});
test("collinear GCPs really lie on one straight world line", () => {
  const d = createBundle({ control: "collinear" });
  d.gcps.forEach((i) => {
    close(d.truth.points[i][1], 0);
    close(d.truth.points[i][2], 0);
  });
});
test("image visibility, not a heuristic overlap formula, controls observation counts", () => {
  const wide = createBundle({ baseline: 12, stripSpacing: 14 }),
    near = createBundle({ baseline: 3, stripSpacing: 4 });
  assert(wide.observations.length < near.observations.length);
});
test("focal calibration adds exactly one shared unknown, not unmodelled distortion", () => {
  const a = createBundle(),
    b = createBundle({ calibrate: true });
  assert.equal(b.parameters.length, a.parameters.length + 1);
  assert.equal(b.initial.f, 1560);
});
test("linear solver pivots and rejects singular systems", () => {
  assert.deepEqual(
    solveLinear(
      [
        [0, 1],
        [2, 1],
      ],
      [3, 7],
    ),
    [2, 3],
  );
  assert.equal(
    solveLinear(
      [
        [1, 1],
        [1, 1],
      ],
      [2, 2],
    ),
    null,
  );
});
test("thin lens image distance and inversion use consistent millimetres", () => {
  const o = cameraOptics({ f: 50, objectM: 2, focusM: 2 });
  close(1 / o.u + 1 / o.v, 1 / 50);
  close(o.sensorDistance, o.v);
  assert(o.magnification < 0);
  close(o.blurPx, 0);
  close(o.pitch, 0.006);
});
test("all pupil rays meet on an in-focus sensor", () => {
  const o = cameraOptics();
  const ys = [-o.diameter / 2, 0, o.diameter / 2].map((h) =>
    lensRayAtSensor(o, 120, h),
  );
  ys.forEach((y) => close(y, ys[0]));
});
test("out-of-focus pupil-ray spread matches the reported geometric blur", () => {
  const o = cameraOptics({ objectM: 1, focusM: 3 });
  const spread = Math.abs(
    lensRayAtSensor(o, 120, o.diameter / 2) -
      lensRayAtSensor(o, 120, -o.diameter / 2),
  );
  close(spread, o.blurMm);
  assert(o.blurPx > 1);
});
test("stopping down trades less geometric defocus for more diffraction", () => {
  const a = cameraOptics({ focusM: 3, fNumber: 2 }),
    b = cameraOptics({ focusM: 3, fNumber: 8 });
  close(a.blurPx / b.blurPx, 4);
  close(b.airyPx / a.airyPx, 4);
  close(a.exposure / b.exposure, 16);
});
test("ISO changes output gain but not pupil, defocus or incoming exposure time", () => {
  const a = cameraOptics({ iso: 100 }),
    b = cameraOptics({ iso: 200 });
  close(b.exposure / a.exposure, 2);
  close(a.diameter, b.diameter);
  close(a.blurPx, b.blurPx);
});
test("motion blur and row-delay distortion respond independently", () => {
  const a = cameraOptics({ speed: 1, shutter: 0.01, readoutMs: 20 }),
    b = cameraOptics({ speed: 1, shutter: 0.02, readoutMs: 20 });
  close(b.motionPx / a.motionPx, 2);
  close(a.rollingPx, b.rollingPx);
  close(cameraOptics({ speed: 0 }).motionPx, 0);
});
test("focal length and crop sensor alter FOV in the expected direction", () => {
  assert(cameraOptics({ f: 85 }).fov < cameraOptics({ f: 24 }).fov);
  assert(
    cameraOptics({ sensorW: 23.5 }).fov < cameraOptics({ sensorW: 36 }).fov,
  );
});
test("radial calibration leaves the principal ray unchanged and preserves zero distortion", () => {
  assert.deepEqual(distort(0, 0, 0.4), [0, 0]);
  assert.deepEqual(distort(0.2, 0.3, 0), [0.2, 0.3]);
  assert(distort(0.5, 0.5, -0.2)[0] < 0.5);
});
test("thin-lens object points inside the focal distance are explicitly unsupported", () =>
  assert.equal(cameraOptics({ f: 50, objectM: 0.02 }), null));
