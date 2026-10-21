import test from "node:test";
import assert from "node:assert/strict";
import {
  DEG,
  G,
  eye,
  inverse,
  mm,
  norm,
  sub,
  rotate,
  unrotate,
  eulerQ,
  qexp,
  qmul,
  qinv,
  qlog,
  qEuler,
  qslerp,
} from "../src/simulations/navigation-math.js";
import {
  imuReading,
  makeImuExperiment,
  IMU_PRESETS,
} from "../src/simulations/imu-model.js";
import {
  makeTrajectory,
  positionUpdate,
  trajectoryAt,
  lidarEndpoint,
  sbetRow,
  sbetCsv,
  SBET_FIELDS,
} from "../src/simulations/trajectory-model.js";
import { SURVEY_MOUNTS } from "../src/simulations/survey-mounts.js";

const near = (a, b, tol = 1e-9) =>
  assert(Math.abs(a - b) < tol, `${a} != ${b}`);
const vector = (a, b, tol = 1e-9) => a.forEach((v, i) => near(v, b[i], tol));
const base = makeTrajectory(),
  continuous = makeTrajectory({ outageDuration: 0 }),
  gated = makeTrajectory({ outlier: true }),
  ungated = makeTrajectory({ outlier: true, gate: false });
const at = (r, t) => r.records[Math.round(t / r.config.dt)];

test("body/navigation rotations invert and quaternion interpolation crosses heading wrap on the short arc", () => {
  const q = eulerQ(0.3, -0.25, 2.7),
    v = [1, 2, 3];
  vector(unrotate(q, rotate(q, v)), v);
  const half = qslerp(eulerQ(0, 0, 179 * DEG), eulerQ(0, 0, -179 * DEG), 0.5);
  near(Math.abs(qEuler(half)[2]), Math.PI);
  vector(
    qlog(qmul(qinv(q), qmul(q, qexp([0.02, -0.01, 0.03])))),
    [0.02, -0.01, 0.03],
  );
});
test("navigation matrix inverse handles pivoting", () => {
  vector(
    Array.from(mm([0, 2, 1, 3], inverse([0, 2, 1, 3], 2), 2)),
    Array.from(eye(2)),
  );
});
test("a stationary level accelerometer reads one g; speed is not a measurement", () => {
  vector(imuReading({ q: eulerQ(0, 0, 0) }).specificForce, [0, 0, G]);
  const rest = makeImuExperiment({
      ...IMU_PRESETS.rest,
      noise: 0,
      accelBias: 0,
    }),
    moving = makeImuExperiment({
      ...IMU_PRESETS.cruise,
      noise: 0,
      accelBias: 0,
    });
  assert.deepEqual(
    rest.records.map((r) => r.force),
    moving.records.map((r) => r.force),
  );
  near(norm(rest.records[0].velocity), 0);
  near(norm(moving.records[0].velocity), 5);
});
test("tilt redistributes gravity while preserving specific-force magnitude", () => {
  const q = eulerQ(30 * DEG, 15 * DEG, -40 * DEG),
    f = imuReading({ q }).specificForce;
  near(norm(f), G);
  vector(rotate(q, f), [0, 0, G]);
});
test("ideal free fall gives zero specific force without removing gravity", () => {
  vector(
    imuReading({ q: eulerQ(0.4, 0.3, 0.2), acceleration: [0, 0, -G] })
      .specificForce,
    [0, 0, 0],
  );
});
test("horizontal acceleration is distinct from gravity", () => {
  const q = eulerQ(0.2, -0.3, 0.4),
    r = imuReading({ q, acceleration: [2, 0, 0] });
  const a = rotate(q, r.specificForce);
  vector([a[0], a[1], a[2] - G], [2, 0, 0]);
});
test("world-vertical rotation is expressed in all tilted body gyro axes", () => {
  const r = makeImuExperiment({
    ...IMU_PRESETS.turn,
    noise: 0,
    gyroBias: 0,
    accelBias: 0,
    initialTilt: 0,
  });
  for (const row of r.records.filter((_, i) => i % 100 === 0)) {
    vector(rotate(row.q, row.idealOmega), [0, 0, 15 * DEG]);
    near(norm(qlog(qmul(qinv(row.q), row.gyroQ))), 0, 1e-7);
  }
});
test("zero-rate calibration estimates an offset from samples and reduces integrated heading drift", () => {
  const a = makeImuExperiment({
      noise: 0,
      gyroBias: 0.1,
      accelBias: 0,
      initialTilt: 0,
    }),
    b = makeImuExperiment({
      noise: 0,
      gyroBias: 0.1,
      accelBias: 0,
      initialTilt: 0,
      calibrate: true,
    });
  vector(b.calibration, b.gyroOffset, 1e-12);
  assert(Math.abs(a.records.at(-1).yawError) > 1.9);
  assert(Math.abs(b.records.at(-1).yawError) < 1e-7);
});
test("gravity aiding corrects tilt at rest but sustained acceleration produces false tilt", () => {
  const quiet = makeImuExperiment({ noise: 0, gyroBias: 0, accelBias: 0 }),
    moving = makeImuExperiment({
      ...IMU_PRESETS.accelerate,
      noise: 0,
      gyroBias: 0,
      accelBias: 0,
    });
  assert(quiet.records.at(-1).tiltError < 0.01);
  assert(moving.records.at(-1).tiltError > 10);
});
test("gravity aiding supplies no yaw reference", () => {
  const r = makeImuExperiment({
    noise: 0,
    gyroBias: 0.1,
    accelBias: 0,
    initialTilt: 0,
  });
  near(r.records.at(-1).yawError, r.records.at(-1).aidedYawError, 0.02);
});
test("experiments are seeded and repeatable", () => {
  const r = makeImuExperiment({ duration: 0.2 });
  assert.deepEqual(r, makeImuExperiment({ duration: 0.2 }));
  const a = makeTrajectory({ duration: 2 }),
    b = makeTrajectory({ duration: 2 });
  assert.deepEqual(a.rms, b.rms);
  assert.deepEqual(a.records[20].force, b.records[20].force);
});
test("GNSS outages alter availability, not IMU measurements or the reference flight", () => {
  for (let i = 0; i < base.records.length; i += 17) {
    assert.deepEqual(base.records[i].force, continuous.records[i].force);
    assert.deepEqual(base.records[i].omega, continuous.records[i].omega);
    assert.deepEqual(base.records[i].truth, continuous.records[i].truth);
  }
  assert(base.records.filter((r) => r.outage).every((r) => r.gnss === null));
  assert.equal(base.accepted, 40);
  assert.equal(continuous.accepted, 60);
});
test("the forward Kalman solution is causal; backward smoothing may use later evidence", () => {
  for (let t = 0; t < 46; t += 1)
    assert.deepEqual(at(base, t).filtered, at(ungated, t).filtered);
  assert(norm(sub(at(base, 30).smoothed.p, at(ungated, 30).smoothed.p)) > 0.01);
});
test("GNSS position residual includes the calibrated antenna lever arm", () => {
  const state = {
      p: [1, 2, 80],
      v: [0, 0, 0],
      q: eulerQ(0.2, 0.1, 0.4),
      ba: [0, 0, 0],
      bg: [0, 0, 0],
    },
    r = rotate(state.q, SURVEY_MOUNTS.gps),
    z = state.p.map((v, i) => v + r[i]);
  const update = positionUpdate(state, eye(15), z, 0.4);
  near(update.nis, 0);
  vector(update.state.p, state.p);
  vector(update.state.q, state.q);
});
test("a trusted Kalman observation reduces position covariance through a Joseph update", () => {
  const s = {
      p: [0, 0, 0],
      v: [0, 0, 0],
      q: [1, 0, 0, 0],
      ba: [0, 0, 0],
      bg: [0, 0, 0],
    },
    z = SURVEY_MOUNTS.gps.map((v, i) => v + (i === 0 ? 1 : 0));
  const r = positionUpdate(s, eye(15), z, 0.2);
  assert(r.accepted);
  assert(r.state.p[0] > 0 && r.state.p[0] < 1);
  assert(r.P[0] < 1);
  assert(r.gain > 0 && r.gain < 1);
  near(
    r.trace.eastGain.reduce((v, k, i) => v + k * r.innovation[i], 0),
    r.trace.eastCorrection,
  );
  near(r.trace.predictedEast + r.trace.eastCorrection, r.trace.correctedEast);
  assert(r.trace.sigmaAfter < r.trace.sigmaBefore);
});
test("a rejected gross observation changes neither the state nor covariance", () => {
  const s = {
      p: [0, 0, 0],
      v: [0, 0, 0],
      q: [1, 0, 0, 0],
      ba: [0, 0, 0],
      bg: [0, 0, 0],
    },
    P = eye(15),
    r = positionUpdate(s, P, [1000, 2000, 3000], 0.4);
  assert(!r.accepted);
  assert.strictEqual(r.state, s);
  assert.strictEqual(r.P, P);
});
test("the innovation gate rejects the injected fix, whereas disabling it admits the error", () => {
  assert.equal(gated.rejected, 1);
  assert(!at(gated, 46).gnss.accepted);
  assert(at(ungated, 46).gnss.accepted);
  assert(at(ungated, 46).error.filtered > at(gated, 46).error.filtered + 1);
});
test("the outage grows uncertainty; a returning GNSS observation reduces it", () => {
  assert(at(base, 39).P[0] > at(base, 19).P[0] * 100);
  assert(at(base, 40).P[0] < at(base, 39).P[0] / 100);
});
test("fusion and genuine RTS smoothing improve this seeded flight without substituting truth", () => {
  assert(base.rms.filtered < base.rms.raw / 3);
  assert(base.rms.smoothed < base.rms.filtered / 5);
  assert(at(base, 30).error.smoothed < at(base, 30).error.filtered);
  assert.deepEqual(base.records.at(-1).smoothed, base.records.at(-1).filtered);
  assert(base.rms.smoothed > 0.001, "noise is not replaced with perfect truth");
});
test("sampled full filter/smoother covariances are finite, symmetric and positive definite", () => {
  for (const row of base.records.filter((_, i) => i % 150 === 0))
    for (const P of [row.P, row.smoothP]) {
      const L = new Float64Array(225);
      for (let i = 0; i < 15; i++)
        for (let j = 0; j <= i; j++) {
          assert(Number.isFinite(P[i * 15 + j]));
          near(P[i * 15 + j], P[j * 15 + i], 1e-7);
          let value = P[i * 15 + j];
          for (let k = 0; k < j; k++) value -= L[i * 15 + k] * L[j * 15 + k];
          if (i === j) {
            assert(value > -1e-10, `non-PSD covariance at ${row.t}: ${value}`);
            L[i * 15 + j] = Math.sqrt(Math.max(value, 1e-16));
          } else L[i * 15 + j] = value / L[j * 15 + j];
        }
    }
});
test("zero-bias, noiseless and exactly aligned strapdown mechanization preserves the discrete flight", () => {
  const r = makeTrajectory({
    gyroBias: 0,
    accelBias: 0,
    noise: 0,
    initialError: 0,
    initialTilt: 0,
    gnssSigma: 0.001,
  });
  assert(r.rms.raw < 0.003);
  assert(r.records.at(-1).error.raw < 0.003);
});
test("trajectory interpolation is continuous, uses quaternion SLERP and does not extrapolate", () => {
  const row = base.records[100];
  vector(trajectoryAt(base.records, row.t).p, row.smoothed.p);
  const half = trajectoryAt(base.records, row.t + 0.01);
  vector(
    half.p,
    row.smoothed.p.map((v, i) => (v + base.records[101].smoothed.p[i]) / 2),
  );
  near(norm(half.q), 1);
  assert.equal(trajectoryAt(base.records, -0.01), null);
  assert.equal(trajectoryAt(base.records, 60.01), null);
});
test("LiDAR uses one recorded range; perfect pose and mounting recover its true endpoint", () => {
  for (const row of base.records.filter((_, i) => i % 29 === 0)) {
    vector(lidarEndpoint(row.truth, row.shot), row.shot.truth, 1e-8);
    near(row.shot.truth[2], 0, 1e-8);
  }
});
test("omitting scanner translation gives a rotated lever error, not a different measured range", () => {
  const row = at(base, 30),
    wrong = lidarEndpoint(row.truth, row.shot, { lever: false });
  near(norm(sub(wrong, row.shot.truth)), norm(SURVEY_MOUNTS.scanner), 1e-9);
  const shifted = {
    ...row.truth,
    p: row.truth.p.map((v, i) => v + (i === 2 ? 1 : 0)),
  };
  near(lidarEndpoint(shifted, row.shot)[2], 1, 1e-9);
});
test("a trajectory timestamp offset moves the laser endpoint without refitting the trajectory", () => {
  const row = at(base, 30),
    aligned = lidarEndpoint(trajectoryAt(base.records, 30), row.shot),
    shifted = lidarEndpoint(trajectoryAt(base.records, 30.1), row.shot);
  assert(norm(sub(aligned, shifted)) > 0.5);
});
test("teaching trajectory export has 17 finite fields and explicit NED / FRD conventions", () => {
  const row = base.records[0],
    values = sbetRow(row);
  assert.equal(values.length, 17);
  assert(values.every(Number.isFinite));
  vector(values.slice(4, 7), [
    row.smoothed.v[1],
    row.smoothed.v[0],
    -row.smoothed.v[2],
  ]);
  const [roll, pitch, yaw] = qEuler(row.smoothed.q);
  near(values[7], roll);
  near(values[8], -pitch);
  near(values[9], (Math.PI / 2 - yaw + Math.PI * 2) % (Math.PI * 2));
  near(values[10], 0);
  const csv = sbetCsv(base).split("\n");
  assert.equal(csv.length, 602);
  assert.deepEqual(csv[0].split(","), SBET_FIELDS);
  assert(csv.every((r) => r.split(",").length === 17));
  near(+csv[1].split(",")[0], 250000);
  near(+csv.at(-1).split(",")[0], 250060);
});
