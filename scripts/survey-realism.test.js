import test from "node:test";
import assert from "node:assert/strict";
import {
  generateSceneData,
  computeAdaptiveTINHistory,
  isolatedLowPoints,
  tinFacetLimits,
  tinTerrainQuality,
} from "../src/simulations/tin-model.js";
import {
  directGeoreference,
  rotateBody,
  errorContributions,
} from "../src/simulations/georeferencing-model.js";
import {
  gsdCamera,
  localGsd,
  groundPixelRay,
  imageFootprint,
  imageBlur,
  sampleGroundTarget,
} from "../src/simulations/gsd-model.js";
const close = (a, b, t = 1e-8) => assert(Math.abs(a - b) < t, `${a} ≠ ${b}`);
test("TIN acquisition is seeded and includes detected first/last returns on different XY", () => {
  const a = generateSceneData("hills", 320);
  assert.deepEqual(a, generateSceneData("hills", 320));
  const last = a.points.filter((p) => p.returnNumber === 2);
  assert(last.length > 0);
  assert(
    last.some((p) => !p.isTrueGround),
    "a last return can still be foliage",
  );
  for (const p of last) {
    const first = a.points.find(
      (q) => q.pulseId === p.pulseId && q.returnNumber === 1,
    );
    assert(first);
    assert.equal(first.numberOfReturns, 2);
    assert(first.z > p.z);
  }
});
test("less canopy penetration reduces actual ground evidence", () => {
  const ground = (penetration) =>
    generateSceneData("hills", 320, { penetration }).points.filter(
      (p) => p.returnNumber === 2 && p.isTrueGround,
    ).length;
  assert.equal(ground(0), 0);
  assert(ground(1) > ground(0.3));
});
test("low-noise screen works from local geometry on a slope, not truth flags", () => {
  const points = [];
  for (let y = 0; y <= 20; y += 5)
    for (let x = 0; x <= 20; x += 5)
      points.push({ id: points.length, x, y, z: 0.5 * x });
  points.push({ id: 99, x: 11, y: 11, z: -8 });
  const excluded = isolatedLowPoints(points);
  assert(excluded.has(99));
  assert(!excluded.has(12));
});
test("synthetic labels never change TIN seeds or accepted insertions", () => {
  const d = generateSceneData("hills", 180),
    a = computeAdaptiveTINHistory(d.points, 25, 12, 1.2),
    b = computeAdaptiveTINHistory(
      d.points.map((p) => ({
        ...p,
        isTrueGround: !p.isTrueGround,
        trueZ: -999,
        objectType: "unknown",
        returnNumber: 7,
      })),
      25,
      12,
      1.2,
    );
  assert.deepEqual(
    a.map((s) => [...s.groundSet]),
    b.map((s) => [...s.groundSet]),
  );
  assert.deepEqual([...a[0].seedSet], [...b[0].seedSet]);
});
test("a geometry-only low screen prevents contaminated minima from corrupting the DTM", () => {
  const d = generateSceneData("noise", 320),
    a = computeAdaptiveTINHistory(d.points, 25, 12, 1.2),
    b = computeAdaptiveTINHistory(d.points, 25, 12, 1.2, { removeLow: false });
  assert(a[0].excludedSet.size > 0);
  assert.equal(b[0].excludedSet.size, 0);
  assert(
    tinTerrainQuality(d.points, a.at(-1), "noise").rmse <
      tinTerrainQuality(d.points, b.at(-1), "noise").rmse,
  );
});
test("TIN distance tolerance tightens with local support and respects the noise floor and cap", () => {
  const facet = (s) => [
    { x: 0, y: 0, z: 0 },
    { x: s, y: 0, z: 0 },
    { x: 0, y: s, z: 0 },
  ];
  const coarse = tinFacetLimits(facet(20), 1.2),
    fine = tinFacetLimits(facet(2), 1.2);
  assert(fine.distanceLimit < coarse.distanceLimit);
  close(tinFacetLimits(facet(2), 1.2, { noiseSigma: 0.2 }).distanceLimit, 0.6);
  close(tinFacetLimits(facet(20), 0.3).distanceLimit, 0.3);
  assert(!tinFacetLimits(facet(100), 1.2).supported);
});
test("supported TIN snapshots never fill long-edge gaps and report error with coverage", () => {
  const d = generateSceneData("hills", 180),
    h = computeAdaptiveTINHistory(d.points, 25, 12, 1.2, { maxEdge: 40 }),
    byId = new Map(d.points.map((p) => [p.id, p]));
  for (const snapshot of h)
    for (const tri of snapshot.triangles)
      assert(
        tinFacetLimits(
          tri.map((id) => byId.get(id)),
          1.2,
          { maxEdge: 40 },
        ).supported,
      );
  const q = tinTerrainQuality(d.points, h.at(-1), "hills", 40);
  assert(q.coverage > 0 && q.coverage < 1);
  assert(q.rmse >= 0);
  assert.equal(
    tinTerrainQuality(d.points, { triangles: [] }, "hills").rmse,
    null,
  );
});
test("perfect direct georeferencing cancels the antenna offset and composes calibrated mount rotations", () => {
  for (const attitude of [
    [0, 0, 0],
    [12, -6, 15],
    [0, 0, 180],
  ]) {
    const a = directGeoreference({
      attitude,
      boresight: [4, -3, 5],
      slope: 12,
    });
    assert(a);
    close(a.total, 0);
    const b = directGeoreference({
      attitude,
      boresight: [4, -3, 5],
      slope: 12,
      antennaArm: [3, -2, 2],
    });
    b.estimated.forEach((x, j) => close(x, a.estimated[j]));
  }
});
test("omitting the lever arm introduces a rotated translation with the correct magnitude", () => {
  const a = directGeoreference({ attitude: [10, 5, 20], useLever: false });
  close(a.total, Math.hypot(1.6, 0, -1.85));
  const b = directGeoreference({
    attitude: [10, 5, 20],
    leverError: [0.03, -0.01, 0.02],
  });
  close(b.total, Math.hypot(0.03, 0.01, 0.02));
});
test("static-attitude timestamp error equals velocity multiplied by latency", () => {
  const a = directGeoreference({ speed: 50, latencyMs: 10 });
  close(a.error[0], 0.5);
  close(a.error[1], 0);
  close(a.error[2], 0);
  close(directGeoreference({ speed: 0, latencyMs: 10 }).total, 0);
});
test("timing error during rotation moves a same-range endpoint even with zero translation speed", () => {
  const a = directGeoreference({
    speed: 0,
    latencyMs: 20,
    angularRate: [10, 0, 0],
  });
  assert(a.total > 0.1);
  close(a.range, directGeoreference({}).range);
});
test("yaw boresight is unobservable at nadir, observable off-axis", () => {
  close(directGeoreference({ scanAngle: 0, boreError: [0, 0, 0.1] }).total, 0);
  assert(
    directGeoreference({ scanAngle: 30, boreError: [0, 0, 0.1] }).total > 0.05,
  );
});
test("range bias changes range along the recorded ray and wrong endpoints are not flattened", () => {
  const a = directGeoreference({ rangeBias: 0.05 });
  close(a.total, 0.05);
  assert(Math.abs(a.vertical) > 0.04);
  const b = directGeoreference({ boreError: [0.1, 0, 0], scanAngle: 30 });
  assert(Math.abs(b.vertical) > 0.01);
  assert.equal(directGeoreference({ height: -2 }), null);
});
test("isolated error contributions are not incorrectly summed as independent RMS noise", () => {
  const s = {
    leverError: [0.02, 0, 0],
    boreError: [0.05, 0, 0],
    latencyMs: 5,
    rangeBias: 0.02,
  };
  const p = errorContributions(s);
  assert.equal(p.length, 4);
  assert(p.every(([, x]) => x && x.total > 0));
});
test("GSD reduces to pitch times AGL over focal length for level nadir geometry", () => {
  const c = gsdCamera(),
    p = localGsd(c);
  close(p.gx, 0.012);
  close(p.gy, 0.012);
  close(p.area, 0.012 ** 2);
  close(p.gx, c.nominal);
  close(localGsd(gsdCamera({ height: 200 })).gx, 2 * p.gx);
  close(localGsd(gsdCamera({ f: 100 })).gx, p.gx / 2);
  close(localGsd(gsdCamera({ elevation: 20 })).gx, 0.8 * p.gx);
});
test("native resolution changes sampling, not the physical full-frame coverage", () => {
  const a = gsdCamera({ megapixels: 24 }),
    b = gsdCamera({ megapixels: 96 });
  close(localGsd(b).gx, localGsd(a).gx / 2);
  assert.deepEqual(imageFootprint(a), imageFootprint(b));
});
test("oblique center-pixel anisotropy follows secant squared / secant", () => {
  const c = gsdCamera({ tilt: 30 }),
    p = localGsd(c);
  close(p.gx, c.nominal / Math.cos(Math.PI / 6) ** 2, 1e-6);
  close(p.gy, c.nominal / Math.cos(Math.PI / 6), 1e-6);
  assert(
    localGsd(c, c.width * 0.9, c.imageHeight / 2).gx >
      localGsd(c, c.width * 0.1, c.imageHeight / 2).gx,
  );
});
test("surface footprints lie on the declared slope and include surface rather than horizontal distance", () => {
  const c = gsdCamera({ slope: 20 }),
    p = localGsd(c);
  for (const v of p.corners) close(v[2], Math.tan((20 * Math.PI) / 180) * v[0]);
  assert(p.gx > c.nominal);
  close(p.gy, c.nominal, 1e-6);
});
test("above-horizon or submerged camera rays return no fabricated ground footprint", () => {
  const c = gsdCamera({ tilt: 70, slope: -25, f: 16 });
  assert.equal(groundPixelRay(c, c.width - 10, c.imageHeight / 2), null);
  assert.equal(imageFootprint(c), null);
  assert.equal(localGsd(gsdCamera({ height: 20, elevation: 25 })), null);
});
test("aperture and exposure affect diffraction/motion independently from GSD", () => {
  const c = gsdCamera(),
    p = localGsd(c),
    a = imageBlur(c, p, { fNumber: 4, exposure: 0.001, speed: 10 }),
    b = imageBlur(c, p, { fNumber: 16, exposure: 0.002, speed: 10 });
  close(b.airyPx, 4 * a.airyPx);
  close(b.motionPx, 2 * a.motionPx);
  close(localGsd(c).gx, p.gx);
});
test("a fixed native crop preserves fractional sampling and does not resize to fit a target", () => {
  const c = gsdCamera({ height: 200, f: 16 }),
    p = localGsd(c),
    a = sampleGroundTarget(c, p, {
      size: 0.1,
      speed: 0,
      noise: false,
      dimension: 16,
    }),
    b = sampleGroundTarget(c, p, {
      size: 0.1,
      speed: 0,
      phase: 0.4,
      noise: false,
      dimension: 16,
    });
  assert.equal(a.pixels.length, 256);
  assert(a.pixels.some((v, i) => Math.abs(v - b.pixels[i]) > 1e-3));
  assert.equal(sampleGroundTarget(c, null), null);
});
test("sensor noise is stable for a seed, changes for a new sample, and never changes geometry", () => {
  const c = gsdCamera(),
    p = localGsd(c),
    settings = { noise: true, dimension: 12 };
  const a = sampleGroundTarget(c, p, settings);
  assert.deepEqual(a, sampleGroundTarget(c, p, settings));
  assert.notDeepEqual(
    a.pixels,
    sampleGroundTarget(c, p, { ...settings, seed: 8 }).pixels,
  );
  close(localGsd(c).gx, p.gx);
});
