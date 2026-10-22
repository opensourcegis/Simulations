import test from "node:test";
import assert from "node:assert/strict";
import {
  makeGnssObservations,
  solveCode,
  doubleDifferences,
  solveFixedBaseline,
  L1_WAVELENGTH,
} from "../src/simulations/gnss-model.js";
import {
  pMercator,
  pEquirect,
  pMollweide,
  pAlbers,
  pAzimuthal,
  pLambert,
  pUTM,
  areaScale,
  clipLongitude,
} from "../src/simulations/projection-model.js";
import {
  radarVelocity,
  radarTwoWayTime,
  refract,
  criticalAngle,
  thinLensFocalLength,
  sarResolutions,
} from "../src/simulations/principles-model.js";
import {
  seededRandom,
  stepMachine,
  advanceClock,
} from "../src/simulations/iot-model.js";
const close = (actual, expected, tolerance = 1e-6) =>
  assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test("noiseless code solves independent east and clock unknowns, not synthetic truth substitution", () => {
  for (const east of [-15, 0, 6, 15]) {
    const answer = solveCode(
      makeGnssObservations({ east, codeSigma: 0, roverClock: 123456 }),
    );
    close(answer.east, east);
    close(answer.clock, 123456);
    assert(answer.residuals.every((v) => Math.abs(v) < 1e-6));
  }
});
test("GNSS receiver clock changes code clock, not fitted position", () => {
  const a = solveCode(makeGnssObservations({ roverClock: 0 })),
    b = solveCode(makeGnssObservations({ roverClock: 299792.458 }));
  close(a.east, b.east);
  close(b.clock - a.clock, 299792.458);
});
test("double differencing actually cancels both receiver clocks", () => {
  const a = doubleDifferences(
    makeGnssObservations({ roverClock: 0, baseClock: 0 }),
  );
  const b = doubleDifferences(
    makeGnssObservations({ roverClock: 299792.458, baseClock: -100000 }),
  );
  a.forEach((row, i) => close(row.measured, b[i].measured));
});
test("noiseless DD contains geometry plus wavelength times integer, with no double-counted clock", () => {
  const rows = doubleDifferences(makeGnssObservations({ phaseSigma: 0 }));
  rows.forEach((row) =>
    close(row.measured, row.geometry(6) + row.integer * L1_WAVELENGTH),
  );
  close(solveFixedBaseline(rows).east, 6);
});
test("carrier DD Jacobian agrees with finite differences", () => {
  for (const row of doubleDifferences(makeGnssObservations()))
    close(
      row.derivative(6),
      (row.geometry(6.1) - row.geometry(5.9)) / 0.2,
      1e-7,
    );
});
test("correlated DD solution is invariant to reference satellite", () => {
  const sats = makeGnssObservations();
  const answers = sats.map((_, i) =>
    solveFixedBaseline(doubleDifferences(sats, i)),
  );
  for (const answer of answers) {
    close(answer.east, answers[0].east);
    close(answer.sigmaEast, answers[0].sigmaEast, 1e-10);
    close(answer.statistic, answers[0].statistic, 1e-4);
  }
});
test("a wrong DD integer changes computed position and fit without changing formal covariance", () => {
  const rows = doubleDifferences(makeGnssObservations());
  const a = solveFixedBaseline(rows),
    b = solveFixedBaseline(rows, 1);
  assert(Math.abs(a.east - b.east) > 0.01);
  assert(b.statistic > a.statistic * 20);
  close(a.sigmaEast, b.sigmaEast, 1e-9);
});
test("GNSS observation noise is reproducible and nonzero, with no claimed exact centimetre result", () => {
  const a = makeGnssObservations(),
    b = makeGnssObservations();
  assert.deepEqual(a, b);
  assert(Math.abs(solveFixedBaseline(doubleDifferences(a)).east - 6) > 1e-5);
  assert.notEqual(a[0].roverRange, a[1].roverRange);
});
test("degenerate code geometry returns no fabricated solution", () => {
  const sat = makeGnssObservations()[0];
  assert.equal(solveCode([sat, sat, sat, sat]), null);
});
test("GPR apex time is two-way and hyperbola increases away from target", () => {
  const object = { x0: 1.6, depth: 0.8 },
    v = radarVelocity(9);
  close(radarTwoWayTime(1.6, object, v), 1.6 / v);
  close(radarTwoWayTime(0.6, object, v), radarTwoWayTime(2.6, object, v));
  assert(radarTwoWayTime(0.6, object, v) > radarTwoWayTime(1.6, object, v));
});
test("GPR dielectric velocity and depth inference have the correct square-root relation", () => {
  close(radarVelocity(4), 2 * radarVelocity(16));
  const t = radarTwoWayTime(0, { x0: 0, depth: 1 }, radarVelocity(16));
  close((t * radarVelocity(16)) / 2, 1);
  close((t * radarVelocity(4)) / 2, 2);
});
test("Snell refraction obeys sine law and is reciprocal", () => {
  const a = refract(1, 1.52, 40),
    b = refract(1.52, 1, a.t2);
  assert.equal(a.tir, false);
  close(b.t2, 40);
  close(refract(1, 1, 70).t2, 70);
  close(refract(1, 1.52, 0).t2, 0);
});
test("critical-angle equality is grazing transmission; TIR only above it", () => {
  const critical = criticalAngle(1.52, 1);
  close(refract(1.52, 1, critical).t2, 90);
  assert.equal(refract(1.52, 1, critical + 0.001).tir, true);
  assert.equal(criticalAngle(1, 1.52), null);
});
test("fixed-curvature lensmaker produces correct focal length, not a clamped visual proxy", () => {
  close(thinLensFocalLength(1.5), 80);
  close(thinLensFocalLength(1.8), 50);
  close(thinLensFocalLength(1.3) / thinLensFocalLength(1.9), 3);
});
test("SAR bandwidth, incidence and stripmap antenna length act on the appropriate resolution", () => {
  const a = sarResolutions(300, 30, 10),
    b = sarResolutions(600, 30, 10),
    c = sarResolutions(300, 60, 4);
  close(a.slant, 0.49965409666666666);
  close(a.ground, 2 * a.slant);
  close(b.slant, a.slant / 2);
  close(c.slant, a.slant);
  close(c.azimuth, 2);
});
test("Mercator local area scale is secant squared, not an arbitrary map-panel scale", () => {
  close(areaScale(pMercator, 0), 1);
  close(areaScale(pMercator, 60), 4);
});
test("equal-area projections preserve absolute area at multiple latitudes and longitudes", () => {
  for (const fn of [pMollweide, pAlbers])
    for (const lat of [-70, -20, 0, 35, 70])
      for (const lon of [-120, 0, 90]) close(areaScale(fn, lat, lon), 1);
});
test("azimuthal equidistant area is not normalized to falsely show equatorial area preservation", () => {
  close(areaScale(pAzimuthal, 0), Math.PI / 2);
  close(areaScale(pAzimuthal, 60), Math.PI / 3);
});
test("equirectangular and transverse Mercator have their declared scale behavior", () => {
  close(areaScale(pEquirect, 60), 2);
  close(areaScale(pUTM, 45, 0), 1);
  assert(areaScale(pUTM, 0, 18) > 1.1);
});
test("Mollweide is finite at both poles and near-polar limits", () => {
  for (const phi of [-Math.PI / 2, -1.57079, 1.57079, Math.PI / 2])
    assert(pMollweide(phi, Math.PI).every(Number.isFinite));
  close(pMollweide(Math.PI / 2, 1)[0], 0);
  close(pMollweide(Math.PI / 2, 1)[1], Math.SQRT2);
});
test("Lambert standard-parallel local area is one", () => {
  close(areaScale(pLambert, 20), 1);
  close(areaScale(pLambert, 50), 1);
});
test("transverse-strip clipping never invents a polygon from a fully outside polygon", () => {
  assert.deepEqual(
    clipLongitude(
      [
        [0, 30],
        [10, 30],
        [10, 40],
      ],
      18,
    ),
    [],
  );
  const clipped = clipLongitude(
    [
      [0, -30],
      [0, 30],
      [10, 30],
      [10, -30],
    ],
    18,
  );
  assert.equal(clipped.length, 4);
  assert(clipped.every((p) => Math.abs(p[1]) === 18));
  assert(clipped.some((p) => p[0] === 0));
  assert(clipped.some((p) => p[0] === 10));
});
test("seeded IoT machines are frame-rate independent on a fixed simulation step", () => {
  const run = (fps) => {
    const random = seededRandom(),
      machine = {
        temp: 46,
        vib: 2.4,
        load: 62,
        wear: 4,
        cooling: false,
        faults: { heat: true, bearing: false, surge: 0 },
      };
    let accumulator = 0,
      steps = 0;
    for (let frame = 0; frame < fps * 8; frame++)
      accumulator = advanceClock(accumulator, 1 / fps, 1, (dt) => {
        stepMachine(machine, dt, random);
        steps++;
      });
    return { machine, steps };
  };
  assert.deepEqual(run(30), run(60));
  assert.deepEqual(run(60), run(144));
  assert.equal(run(60).steps, 800);
});
test("IoT reset seed reproduces disturbances and paused clock performs no physics", () => {
  const a = seededRandom(),
    b = seededRandom();
  for (let i = 0; i < 50; i++) close(a(), b(), 0);
  let calls = 0;
  advanceClock(0, 20, 0, () => calls++);
  assert.equal(calls, 0);
});
test("IoT time acceleration scales physical time, not noise draws per rendered frame", () => {
  let steps = 0;
  advanceClock(0, 1, 4, () => steps++);
  assert.equal(steps, 400);
});
