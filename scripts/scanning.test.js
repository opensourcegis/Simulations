import test from "node:test";
import assert from "node:assert/strict";
import {
  SCAN_MECHANISMS,
  SCAN_BUILDINGS,
  SCAN_CANOPIES,
  scanDirections,
  scanOrigin,
  scanIntersection,
  scanReference,
  buildScanLine,
  scanVisibleCount,
} from "../src/simulations/scanning-model.js";
import { SURVEY_MOUNTS } from "../src/simulations/survey-mounts.js";
const close = (a, b, eps = 1e-8) =>
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
test("all six scan laws produce normalized downward sightlines", () => {
  for (const m of SCAN_MECHANISMS)
    for (let i = 0; i < 100; i++)
      for (const d of scanDirections(m.id, i * 0.0137)) {
        close(Math.hypot(...d), 1);
        assert(d[2] < 0);
      }
});
test("single-axis flat-plane swath and line advance follow H tan(theta) and v/f", () => {
  const c = { mechanism: "osc", height: 80, speed: 10 },
    ref = scanReference(c),
    m = SCAN_MECHANISMS[0];
  const plus = scanDirections("osc", 1 / (4 * m.hz))[0],
    minus = scanDirections("osc", 3 / (4 * m.hz))[0];
  const a = scanIntersection([0, 0, 80], plus, { objects: false }),
    b = scanIntersection([0, 0, 80], minus, { objects: false });
  close(a.position[1] - b.position[1], ref.width);
  close(ref.advance, 10 / 11);
  close(scanReference({ ...c, height: 160 }).width, ref.width * 2);
  close(scanReference({ ...c, height: 160 }).density, ref.density / 2);
  close(scanReference({ ...c, speed: 20 }).density, ref.density / 2);
});
test("roofs and canopy block a ground ray at their actual first intersection", () => {
  const b = SCAN_BUILDINGS[0],
    o = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, 80],
    roof = scanIntersection(o, [0, 0, -1]);
  assert.equal(roof.kind, "building");
  close(roof.position[2], b.roofZ);
  close(roof.range, 80 - b.roofZ);
  close(scanIntersection(o, [0, 0, -1], { objects: false }).position[2], 0);
  const canopy = SCAN_CANOPIES[0],
    c = scanIntersection([canopy.center[0], canopy.center[1], 80], [0, 0, -1]);
  assert.equal(c.kind, "canopy");
  close(c.position[2], canopy.center[2] + canopy.radii[2]);
  const d = [0.6, 0, -0.8],
    wall = scanIntersection([b.x0 - 10, (b.y0 + b.y1) / 2, 18], d);
  assert.equal(wall.kind, "building");
  close(wall.position[0], b.x0);
  assert(wall.position[2] > 0 && wall.position[2] < b.roofZ);
  assert.equal(scanIntersection([0, 0, 80], [0, 0, 1]), null);
});
test("polygon facet transition has real blanking, not an invented connecting scan line", () => {
  const m = SCAN_MECHANISMS.find((m) => m.id === "poly");
  assert.equal(scanDirections("poly", 0.96 / m.hz).length, 0);
  const line = buildScanLine({
    mechanism: "poly",
    height: 80,
    speed: 20,
    objects: false,
  });
  assert(line.records.length < line.reference.duration * m.rate * 0.94);
  assert(line.records.length > line.reference.duration * m.rate * 0.9);
});
test("Risley and multi-channel models have their declared repeat and channel geometry", () => {
  const a = scanDirections("risley", 0.017),
    b = scanDirections("risley", 0.517);
  a[0].forEach((v, i) => close(v, b[0][i]));
  const multi = scanDirections("multi", 0.031);
  assert.equal(multi.length, 8);
  close((Math.acos(-multi[0][2]) * 180) / Math.PI, 4);
  close((Math.acos(-multi[7][2]) * 180) / Math.PI, 20);
});
test("pulse timestamps, prefixes and scanner origins do not depend on render frame rate", () => {
  const s = { mechanism: "osc", height: 80, speed: 20, objects: true },
    a = buildScanLine(s),
    b = buildScanLine(s),
    m = SCAN_MECHANISMS[0];
  assert.deepEqual(a, b);
  assert.equal(a.records.length, Math.floor(a.reference.duration * m.rate));
  assert.equal(scanVisibleCount(a.records, 0), 0);
  assert.equal(
    scanVisibleCount(a.records, a.reference.duration),
    a.records.length,
  );
  for (const t of [0.1, 1, 2.31, 5])
    assert.equal(
      scanVisibleCount(a.records, t),
      a.records.filter((r) => r.t <= t).length,
    );
  for (const r of a.records.filter((_, i) => i % 137 === 0)) {
    assert.deepEqual(r.origin, scanOrigin(r.t, s));
    close(r.origin[2], s.height);
    const aircraftX = -90 + s.speed * r.t;
    close(r.origin[0] - aircraftX, SURVEY_MOUNTS.scanner[0]);
    const hit = scanIntersection(r.origin, r.direction, s);
    assert.deepEqual(hit.position, r.position);
    r.position.forEach((v, i) =>
      close(v, r.origin[i] + r.range * r.direction[i]),
    );
  }
});
