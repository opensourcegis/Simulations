import test from "node:test";
import assert from "node:assert/strict";
import { boresightLessonPreset } from "../src/simulations/boresight-lesson.js";
import {
  directGeoreference,
  scannerDirection,
} from "../src/simulations/georeferencing-model.js";
import {
  boresightComparison,
  evaluateTinCandidate,
} from "../games/shared/lidar-physics.js";
import {
  generateSceneData,
  computeAdaptiveTINHistory,
  delaunay2D,
  tinFacetLimits,
} from "../src/simulations/tin-model.js";
import { tinTeachingTimeline } from "../src/simulations/tin-teaching.js";
const close = (a, b, t = 1e-9) => assert(Math.abs(a - b) < t, `${a} != ${b}`);
test("all teaching presets isolate their stated effect and reset advanced residuals", () => {
  for (const id of [
    "lever",
    "boresight",
    "attitude",
    "combined",
    "zero",
    "yaw-nadir",
    "yaw-scan",
  ]) {
    const s = boresightLessonPreset(id);
    assert.equal(s.latencyMs, 0);
    assert.equal(s.rangeBias, 0);
    assert.deepEqual(s.leverError, [0, 0, 0]);
    assert.deepEqual(s.boreError, [0, 0, 0]);
    assert.deepEqual(s.angularRate, [0, 0, 0]);
    const shot = directGeoreference(s);
    assert(shot);
    if (["combined", "zero", "yaw-nadir"].includes(id)) close(shot.total, 0);
    else assert(shot.total > 0);
  }
});
test("applying each exact correction repairs reconstruction without moving the observed hit or recorded range", () => {
  for (const [id, key] of [
    ["lever", "useLever"],
    ["boresight", "useBore"],
    ["attitude", "useAttitude"],
  ]) {
    const s = boresightLessonPreset(id),
      wrong = directGeoreference(s),
      fixed = directGeoreference({ ...s, [key]: true });
    assert(wrong.total > 0);
    close(fixed.total, 0);
    assert.deepEqual(fixed.actual, wrong.actual);
    assert.deepEqual(fixed.origin, wrong.origin);
    assert.equal(fixed.range, wrong.range);
    assert.deepEqual(fixed.direction, wrong.direction);
  }
});
test("lever residual magnitude is independent of range while angular residual grows with recorded range", () => {
  const s = {
    ...boresightLessonPreset("combined"),
    attitude: [0, 0, 0],
    boresight: [0, 0, 0],
    scanAngle: 0,
  };
  for (const height of [50, 200])
    close(
      directGeoreference({ ...s, height, leverError: [0.02, 0, 0] }).total,
      0.02,
    );
  const a = directGeoreference({ ...s, height: 50, boreError: [0.1, 0, 0] }),
    b = directGeoreference({ ...s, height: 200, boreError: [0.1, 0, 0] });
  close(a.total / a.range, b.total / b.range);
});
test("legacy boresight comparison and field rendering use the same cross-track ray, range and endpoint errors", () => {
  for (const scanAngle of [-30, 0, 30])
    for (const attitude of [
      [0, 0, 0],
      [12, -6, 15],
    ]) {
      const s = {
          ...boresightLessonPreset("boresight"),
          height: 6,
          attitude,
          scanAngle,
        },
        actual = directGeoreference(s),
        legacy = boresightComparison(
          s.height,
          s.scannerArm,
          attitude,
          s.boresight,
          scanAngle,
        );
      close(actual.range, legacy.range);
      close(actual.horizontal, legacy.horizontalError);
      close(actual.vertical, legacy.verticalError);
      assert.deepEqual(
        actual.direction,
        scannerDirection(attitude, s.boresight, scanAngle),
      );
    }
});
const data = generateSceneData("hills", 180),
  options = { removeLow: true, adaptive: true, maxEdge: 55, noiseSigma: 0.06 },
  history = computeAdaptiveTINHistory(data.points, 25, 12, 1.2, options),
  byId = new Map(data.points.map((p) => [p.id, p]));
test("seed construction records the actual lowest eligible point in every displayed cell", () => {
  assert.equal(history[0].seedCells.length, 16);
  for (const c of history[0].seedCells) {
    const eligible = data.points.filter(
      (p) =>
        !history[0].excludedSet.has(p.id) &&
        p.x >= c.x0 &&
        p.x < c.x1 &&
        p.y >= c.y0 &&
        p.y < c.y1,
    );
    assert.equal(
      c.seedId,
      eligible.length
        ? eligible.reduce((a, b) => (a.z <= b.z ? a : b)).id
        : null,
    );
  }
});
test("each TIN event records an exact test on its displayed immediate pre-insertion facet", () => {
  for (const snapshot of history.slice(1))
    for (const e of snapshot.insertionEvents) {
      assert(!e.beforeGroundIds.includes(e.id));
      assert(e.test.facetIds.every((id) => e.beforeGroundIds.includes(id)));
      const v = e.test.facetIds.map((id) => byId.get(id)),
        expected = evaluateTinCandidate(
          byId.get(e.id),
          v,
          e.test.distanceLimit,
          12,
        );
      close(expected.d, e.test.d);
      close(expected.angle, e.test.angle);
      assert.deepEqual(e.test.projection, expected.projection);
      assert.equal(e.inserted, expected.accepted && (e.test.supported ?? true));
      assert.equal(e.afterGroundIds.includes(e.id), e.inserted);
      if (e.inserted)
        assert.equal(e.afterGroundIds.length, e.beforeGroundIds.length + 1);
      else assert.deepEqual(e.afterGroundIds, e.beforeGroundIds);
      for (const id of e.test.facetIds) {
        const vertex = byId.get(id);
        close(
          expected.normal.reduce(
            (sum, n, i) =>
              sum +
              n * (expected.projection[i] - [vertex.x, vertex.y, vertex.z][i]),
            0,
          ),
          0,
        );
      }
    }
});
test("inserted-event mesh is the actual supported Delaunay mesh and events account for every inserted point", () => {
  for (const snapshot of history.slice(1)) {
    assert.deepEqual(
      snapshot.insertionEvents.filter((e) => e.inserted).map((e) => e.id),
      snapshot.newlyAdded,
    );
    for (const e of snapshot.insertionEvents.filter((e) => e.inserted)) {
      const p = data.points.filter((p) => e.afterGroundIds.includes(p.id)),
        expected = delaunay2D(p)
          .filter(
            (t) =>
              tinFacetLimits(
                t.map((i) => p[i]),
                1.2,
                options,
              ).supported,
          )
          .map((t) => t.map((i) => p[i].id));
      assert.deepEqual(e.afterTriangles, expected);
    }
  }
});
test("teaching timeline reveals cells, seeds and initial facets before testing and never inserts on a test frame", () => {
  const frames = tinTeachingTimeline(data.points, history);
  assert.deepEqual(
    frames.slice(0, 3).map((f) => f.phase),
    ["cloud", "cells", "seeds"],
  );
  assert.equal(frames[0].snapshot.triangles.length, 0);
  assert.equal(frames[0].snapshot.groundSet.size, 0);
  assert.equal(frames[2].snapshot.triangles.length, 0);
  assert.equal(frames[3].snapshot.triangles.length, 1);
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    if (f.phase === "test") {
      assert(!f.snapshot.groundSet.has(f.event.id));
      assert.deepEqual(f.snapshot.triangles, f.event.beforeTriangles);
      assert.equal(frames[i + 1].phase, "decision");
    }
    if (f.phase === "retriangulate") {
      assert(f.snapshot.groundSet.has(f.event.id));
      assert.deepEqual(f.snapshot.triangles, f.event.afterTriangles);
      assert.equal(frames[i - 1].phase, "decision");
    }
  }
  assert.deepEqual(frames.at(-1).snapshot.groundSet, history.at(-1).groundSet);
  assert.deepEqual(frames.at(-1).snapshot.triangles, history.at(-1).triangles);
  assert.deepEqual(frames.at(-1).snapshot.candidateEvaluations, []);
});
