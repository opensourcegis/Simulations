import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraFocusGeometry,
  expectedElectrons,
  sensorGain,
  SENSOR_MODEL,
  rollingTime,
  sensorShiftPx,
  cameraScene,
  blurSigmaDisplay,
  inverseRadial,
} from "../src/simulations/camera-sensor-model.js";
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
test("radial inverse recovers valid rays without edge folding", () => {
  for (const k of [-0.18, 0.25]) {
    const [x, y] = distort(0.35, 0.2, k),
      p = inverseRadial(x, y, k, 0.9);
    assert(p);
    assert(Math.abs(p[0] - 0.35) < 1e-6);
    assert(Math.abs(p[1] - 0.2) < 1e-6);
  }
});
test("radial inverse rejects rays outside its supported domain", () => {
  assert.equal(inverseRadial(1, 1, -0.18, 0.9), null);
  assert.equal(inverseRadial(0.3, 0.2, -1, 1), null);
});
const close = (a, b, t = 1e-9) => assert(Math.abs(a - b) < t, `${a} != ${b}`);
test("focusing moves the equivalent lens, never the fixed sensor", () => {
  const a = cameraOptics({ focusM: 1 }),
    b = cameraOptics({ focusM: 4 }),
    ga = cameraFocusGeometry(a),
    gb = cameraFocusGeometry(b);
  close(ga.sensorX, gb.sensorX);
  assert.notEqual(ga.lensX, gb.lensX);
  close((ga.lensX - ga.sensorX) * 100, a.sensorDistance);
});
test("sensor charge scales with exposure time and scene illumination, not ISO", () => {
  const o = cameraOptics(),
    e = expectedElectrons(0.18, o, 1 / 125, 12);
  close(expectedElectrons(0.18, o, 2 / 125, 12), 2 * e);
  close(expectedElectrons(0.18, o, 1 / 125, 13), 2 * e);
  close(expectedElectrons(0.18, cameraOptics({ iso: 3200 }), 1 / 125, 12), e);
});
test("sensor photon collection responds to pupil area and pixel area", () => {
  const a = cameraOptics({ fNumber: 4 }),
    b = cameraOptics({ fNumber: 8 }),
    crop = cameraOptics({ sensorW: 18 });
  close(expectedElectrons(0.18, a, 0.01) / expectedElectrons(0.18, b, 0.01), 4);
  close(
    expectedElectrons(0.18, crop, 0.01) / expectedElectrons(0.18, a, 0.01),
    0.25,
  );
});
test("full well and ADC gain clipping are distinct and bounded", () => {
  assert.equal(sensorGain(SENSOR_MODEL.fullWell * 2, 100), 4095);
  assert.equal(sensorGain(10000, 200), 4095);
  assert.equal(sensorGain(-3, 100), 0);
  assert(sensorGain(1000, 200) > sensorGain(1000, 100));
});
test("rolling readout row delay is independent of exposure duration", () => {
  close(rollingTime(1, 20) - rollingTime(0, 20), 0.02);
  close(rollingTime(0.5, 20), 0);
  close(rollingTime(1, 0), 0);
});
test("moving image displacement depends on each object depth and row time", () => {
  const o = cameraOptics();
  close(sensorShiftPx(1, 2, o, 0.02) / sensorShiftPx(1, 4, o, 0.02), 2);
  close(sensorShiftPx(0, 2, o, 0.02), 0);
  close(sensorShiftPx(2, 2, o, 0), 0);
});
test("the near subject and background blur differently from the focus target", () => {
  const layers = cameraScene(2),
    sigmas = layers.map((o) =>
      blurSigmaDisplay(cameraOptics({ objectM: o.depth, focusM: 2 })),
    );
  assert(sigmas[0] > sigmas[1]);
  assert(sigmas[2] > sigmas[1]);
});
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
