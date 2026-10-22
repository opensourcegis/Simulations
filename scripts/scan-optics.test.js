import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildScanOpticsScene } from "../src/simulations/scanning-optics-scene.js";
import {
  SCAN_MECHANISMS,
  scanDirections,
  buildScanLine,
  scanPlaybackFrame,
} from "../src/simulations/scanning-model.js";
import {
  scanOpticsState,
  reflectedDirection,
  POLYGON_APOTHEM,
  POLYGON_FACETS,
  POLYGON_RADIUS,
} from "../src/simulations/scan-optics.js";
const close = (a, b, eps = 1e-9) =>
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
const vector = (a, b) => a.forEach((v, i) => close(v, b[i]));
test("rendered mirror normals and finite polygon facets actually obey the reflected survey direction", () => {
  for (const id of ["osc", "poly", "palmer", "mems"]) {
    const optic = buildScanOpticsScene(id);
    for (const t of [0.013, 0.033, 0.121, 0.251, 0.817]) {
      const state = scanOpticsState(id, t);
      optic.update(state, true, false);
      optic.root.updateMatrixWorld(true);
      const mirror = optic.root.getObjectByName(
        id === "poly" ? `scan-optic-facet-${state.facet}` : "scan-optic-mirror",
      );
      const normal = new THREE.Vector3(0, 0, 1)
        .applyQuaternion(mirror.getWorldQuaternion(new THREE.Quaternion()))
        .toArray();
      if (state.directions.length)
        vector(reflectedDirection(state.incoming, normal), state.directions[0]);
      if (id === "poly" && state.directions.length) {
        const hit = mirror.worldToLocal(new THREE.Vector3(...state.origin));
        close(hit.z, 0);
        assert(Math.abs(hit.y) <= mirror.geometry.parameters.height / 2 + 1e-9);
      }
    }
  }
});
test("render buffers distinguish a preview, recorded single/multi pulses, and blanking", () => {
  for (const m of SCAN_MECHANISMS) {
    const optic = buildScanOpticsScene(m.id),
      s = scanOpticsState(m.id, 0.017);
    const output = optic.root.getObjectByName("scan-optic-output"),
      preview = optic.root.getObjectByName("scan-optic-preview");
    optic.update(s, false, true);
    assert.equal(output.geometry.drawRange.count, 0);
    assert(preview.geometry.drawRange.count > 0);
    optic.update(s, true, false);
    assert.equal(
      output.geometry.drawRange.count,
      m.id === "risley" ? 4 : m.channels * 2,
    );
    assert.equal(preview.geometry.drawRange.count, 0);
    optic.update(s, false, false);
    assert.equal(output.geometry.drawRange.count, 0);
    assert.equal(preview.geometry.drawRange.count, 0);
  }
});
test("every cutaway shares the survey's six scan laws, rather than a second animation", () => {
  for (const m of SCAN_MECHANISMS)
    for (const t of [0, 0.012345, 0.071, 0.189, 1.27, 5.99]) {
      const state = scanOpticsState(m.id, t);
      assert.deepEqual(state.directions, scanDirections(m.id, t));
      if (state.normal && state.directions.length) {
        close(Math.hypot(...state.normal), 1);
        vector(
          reflectedDirection(state.incoming, state.normal),
          state.directions[0],
        );
      }
    }
});
test("oscillating mirror rotates half the optical deflection about one shaft", () => {
  for (let i = 0; i < 40; i++) {
    const s = scanOpticsState("osc", i / 440);
    const theta = Math.atan2(s.directions[0][1], -s.directions[0][2]);
    close(s.normal[0], 0);
    close(Math.atan2(s.normal[2], s.normal[1]) - Math.PI / 4, theta / 2);
  }
});
test("the Palmer normal precesses at 10 degrees to produce a 20-degree sightline cone", () => {
  for (let i = 0; i < 20; i++) {
    const s = scanOpticsState("palmer", i / 180);
    close(Math.acos(s.normal[2]), (10 * Math.PI) / 180);
    close(Math.acos(-s.directions[0][2]), (20 * Math.PI) / 180);
  }
});
test("the enlarged MEMS gimbal has a normal that really reflects into the two-axis survey ray", () => {
  for (let i = 0; i < 100; i++) {
    const s = scanOpticsState("mems", i * 0.0073),
      n = s.normal;
    const roll = Math.atan2(-n[1], n[2]),
      pitch = Math.asin(n[0]);
    vector(
      [
        Math.sin(pitch),
        -Math.sin(roll) * Math.cos(pitch),
        Math.cos(roll) * Math.cos(pitch),
      ],
      n,
    );
  }
});
test("polygon input meets the displayed active facet and handover really blanks outgoing rays", () => {
  const C = POLYGON_APOTHEM / Math.sqrt(2);
  for (let cycle = 0; cycle < 20; cycle++)
    for (let phase = 0; phase < 0.92; phase += 0.031) {
      const s = scanOpticsState("poly", (cycle + phase) / 11);
      // Floating-point boundary times can lie just before a new sweep, in
      // the survey model's blanking interval. No active facet is hit then.
      if (!s.directions.length) continue;
      const n = s.normal,
        p = s.origin;
      close(p[0], 0);
      close(p[2], 0);
      close((p[1] - C) * n[1] + (p[2] - C) * n[2], -POLYGON_APOTHEM);
      const tangent = -(p[1] - C) * n[2] + (p[2] - C) * n[1];
      assert(
        Math.abs(tangent) <
          POLYGON_RADIUS * Math.sin(Math.PI / POLYGON_FACETS) + 1e-9,
      );
      vector(reflectedDirection(s.incoming, n), s.directions[0]);
    }
  const blank = scanOpticsState("poly", 0.96 / 11);
  assert.equal(blank.directions.length, 0);
  const a = scanOpticsState("poly", (1 - 1e-10) / 11),
    b = scanOpticsState("poly", (1 + 1e-10) / 11);
  close(a.rotorAngle, b.rotorAngle, 1e-8);
  assert.notEqual(a.facet, b.facet);
});
test("Risley wedges turn in opposite directions and their two refractive slopes sum to the survey ray", () => {
  for (const t of [0, 0.017, 0.043, 0.211]) {
    const s = scanOpticsState("risley", t),
      d = s.directions[0];
    close(s.prisms[0], 2 * Math.PI * 18 * t);
    close(s.prisms[1], -2 * Math.PI * 28 * t);
    close(
      d[0] / -d[2],
      s.firstSlope[0] + Math.tan((7 * Math.PI) / 180) * Math.sin(s.prisms[1]),
    );
    close(
      d[1] / -d[2],
      s.firstSlope[1] + Math.tan((7 * Math.PI) / 180) * Math.cos(s.prisms[1]),
    );
  }
});
test("the optic uses the recorded pulse timestamp used by the point cloud, including quantized ticks", () => {
  for (const m of SCAN_MECHANISMS) {
    const data = buildScanLine({
      mechanism: m.id,
      height: 80,
      speed: 10,
      objects: true,
    });
    for (const time of [0.01377, 0.0873, 1.0451, 4.7193]) {
      const frame = scanPlaybackFrame(data, time);
      const s = scanOpticsState(m.id, frame.pulseTime ?? time);
      if (frame.pulseTime !== null)
        assert.deepEqual(
          s.directions,
          data.records
            .slice(frame.pulseStart, frame.pulseEnd)
            .map((r) => r.direction),
        );
      else if (m.id === "poly") assert.equal(s.directions.length, 0);
    }
  }
});
