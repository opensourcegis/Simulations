import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL_ROUTE,
  controlFrameworkExample,
  rangeIntersections,
  rangeGeometry,
  referencePointExample,
  surveyHierarchyExample,
} from "../src/simulations/survey-principles-model.js";
const close = (a, b, eps = 1e-8) =>
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
const point = (a, b) => a.forEach((v, i) => close(v, b[i]));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("whole-to-part establishes local control from primary observations on the field-sketch side", () => {
  const expected = [
    [
      [62, 30],
      [54, 34],
    ],
    [
      [30, 46],
      [22, 47],
    ],
  ];
  for (const zone of [0, 1]) {
    const m = surveyHierarchyExample(zone);
    m.stations.forEach((s, i) => {
      point(s, expected[zone][i]);
      m.baselineNames.forEach((name, j) =>
        close(dist(m.controls[name], s), m.ties[i][j]),
      );
    });
    // Each working station lies inside the selected primary triangle.
    const [a, b, c] = m.names.map((n) => m.controls[n]);
    const cross = (u, v, w) =>
      (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
    for (const p of [...m.stations, ...m.building]) {
      const signs = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
      assert(signs.every((v) => v >= -1e-8) || signs.every((v) => v <= 1e-8));
    }
  }
});
test("building detail uses local coordinates, orientation and polar observations with a withheld check", () => {
  for (const zone of [0, 1])
    for (const corner of [0, 1, 2]) {
      const m = surveyHierarchyExample(zone, corner);
      point(m.point, m.building[[0, 1, 3][corner]]);
      close(dist(m.stations[0], m.point), m.range);
      close(m.checkRange, m.computedCheck);
      close(m.point[0], m.stations[0][0] + m.range * Math.sin(m.gridBearing));
      close(m.point[1], m.stations[0][1] + m.range * Math.cos(m.gridBearing));
      close(
        (m.backsightBearing + m.horizontalAngle) % (2 * Math.PI),
        m.gridBearing,
      );
      // Neither the locating ray nor the withheld check passes through the
      // building footprint: intersect the segment's open coordinate slabs.
      for (const s of m.stations) {
        let low = 0,
          high = 1;
        for (const axis of [0, 1]) {
          const min = m.building[0][axis],
            max = m.building[2][axis];
          const delta = m.point[axis] - s[axis];
          if (Math.abs(delta) < 1e-10) {
            if (s[axis] <= min || s[axis] >= max) high = -1;
          } else {
            const ts = [(min - s[axis]) / delta, (max - s[axis]) / delta];
            low = Math.max(low, Math.min(...ts));
            high = Math.min(high, Math.max(...ts));
          }
        }
        assert(
          high - low < 1e-8,
          "A survey ray must not pass through a building",
        );
      }
    }
});
test("detail and area selections never change the primary framework or establish control from details", () => {
  const base = surveyHierarchyExample();
  for (const zone of [0, 1])
    for (const corner of [0, 1, 2]) {
      const m = surveyHierarchyExample(zone, corner);
      assert.deepEqual(m.controls, base.controls);
      assert.deepEqual(m.stations, surveyHierarchyExample(zone, 0).stations);
    }
  assert.throws(() => surveyHierarchyExample(-1), RangeError);
  assert.throws(() => surveyHierarchyExample(0, 5), RangeError);
});

test("without an introduced mistake both control strategies recover the same site", () => {
  const copy = JSON.stringify(CONTROL_ROUTE),
    m = controlFrameworkExample(4, 0);
  m.local.forEach((p, i) => point(p, CONTROL_ROUTE[i]));
  m.whole.points.forEach((p, i) => point(p, CONTROL_ROUTE[i]));
  assert.equal(m.longOutside, 0);
  assert.equal(m.localOutside, 0);
  m.details.forEach((d) => {
    point(d.local, d.truth);
    point(d.long, d.truth);
  });
  assert.equal(JSON.stringify(CONTROL_ROUTE), copy);
});
test("the same leg mistake spreads through a whole-loop balance but stays within one independently controlled cell", () => {
  for (let leg = 0; leg < 12; leg++) {
    const m = controlFrameworkExample(leg, 5);
    assert(m.longOutside > 0);
    assert.equal(m.localOutside, 0);
    [0, 3, 6, 9, 12].forEach((i) => point(m.local[i], CONTROL_ROUTE[i]));
    point(m.whole.closure, [0, 5]);
    m.cells.forEach((c, i) =>
      point(c.closure, [0, i === Math.floor(leg / 3) ? 5 : 0]),
    );
    assert.equal(
      m.observations.filter(
        (o, i) =>
          dist(
            o.delta,
            CONTROL_ROUTE[i + 1].map((v, j) => v - CONTROL_ROUTE[i][j]),
          ) > 1e-8,
      ).length,
      1,
    );
  }
});
test("compass-rule corrections use observed lengths and sum to the negative measured closure", () => {
  const m = controlFrameworkExample(4, 5);
  for (const span of [m.whole, ...m.cells]) {
    const sum = span.corrections.reduce(
      (a, c) => a.map((v, j) => v + c[j]),
      [0, 0],
    );
    point(
      sum,
      span.closure.map((v) => -v),
    );
    span.corrections.forEach((c, i) =>
      point(
        c,
        span.closure.map(
          (v) => (-v * m.observations[span.first + i].length) / span.length,
        ),
      ),
    );
    point(span.points.at(-1), CONTROL_ROUTE[span.last]);
  }
});
test("detail offsets inherit their parent station error; no detail point is snapped to truth", () => {
  const m = controlFrameworkExample(1, 6);
  m.details.forEach((d) => {
    point(
      d.local.map((v, j) => v - d.truth[j]),
      m.local[d.station].map((v, j) => v - CONTROL_ROUTE[d.station][j]),
    );
    point(
      d.long.map((v, j) => v - d.truth[j]),
      m.whole.points[d.station].map((v, j) => v - CONTROL_ROUTE[d.station][j]),
    );
  });
  assert.throws(() => controlFrameworkExample(20, 5), RangeError);
  assert.throws(() => controlFrameworkExample(4, NaN), RangeError);
});
test("two independent ranges recover both intersections, not an invented unique point", () => {
  const A = [0, 0],
    B = [5, 0],
    s = rangeIntersections(A, B, 5, Math.sqrt(20));
  assert.equal(s.status, "two");
  assert.equal(s.points.length, 2);
  point(s.points[0], [3, 4]);
  point(s.points[1], [3, -4]);
  s.points.forEach((p) => {
    close(dist(A, p), 5);
    close(dist(B, p), Math.sqrt(20));
  });
});
test("circle intersection is invariant under a rigid rotation and translation of the baseline", () => {
  const transform = ([x, y]) => [
    100 + x * Math.cos(0.7) - y * Math.sin(0.7),
    -20 + x * Math.sin(0.7) + y * Math.cos(0.7),
  ];
  const s = rangeIntersections(
    transform([0, 0]),
    transform([5, 0]),
    5,
    Math.sqrt(20),
  );
  point(s.points[0], transform([3, 4]));
  point(s.points[1], transform([3, -4]));
});
test("inconsistent, invalid and tangent range geometry is explicit and never clamped into a plausible fix", () => {
  assert.equal(
    rangeIntersections([0, 0], [10, 0], 2, 2).status,
    "inconsistent",
  );
  assert.equal(
    rangeIntersections([0, 0], [10, 0], 30, 2).status,
    "inconsistent",
  );
  for (const r of [-1, NaN, Infinity])
    assert.equal(rangeIntersections([0, 0], [10, 0], r, 5).status, "invalid");
  assert.equal(rangeIntersections([0, 0], [0, 0], 5, 5).status, "invalid");
  assert.equal(rangeIntersections([NaN, 0], [10, 0], 5, 5).status, "invalid");
  const tangent = rangeIntersections([0, 0], [10, 0], 5, 5);
  assert.equal(tangent.status, "tangent");
  assert.equal(tangent.points.length, 1);
  point(tangent.points[0], [5, 0]);
  assert.equal(rangeGeometry([0, 0], [10, 0], [5, 0]).singular, true);
});
test("weak intersection geometry increases formal uncertainty without changing the noiseless position", () => {
  const weak = referencePointExample({ baseline: 20 }),
    strong = referencePointExample({ baseline: 80 });
  point(weak.P, [50, 40]);
  point(strong.P, [50, 40]);
  assert(weak.geometry.major > strong.geometry.major * 2);
  assert(weak.geometry.angle < strong.geometry.angle);
  close(strong.geometry.angle, 90);
});
test("range covariance is sigma-squared times the inverse normal matrix and ellipse scale follows sigma", () => {
  const A = [10, 0],
    B = [80, 0],
    P = [40, 35];
  const g = rangeGeometry(A, B, P, 0.5),
    g2 = rangeGeometry(A, B, P, 1);
  g.covariance.forEach((row, i) =>
    row.forEach((v, j) => close(g2.covariance[i][j], 4 * v)),
  );
  close(g2.major, 2 * g.major);
  close(g2.minor, 2 * g.minor);
  const rows = [A, B].map((a) => P.map((v, i) => (v - a[i]) / dist(P, a)));
  const N = [
    [0, 0],
    [0, 0],
  ];
  for (const r of rows)
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) N[i][j] += r[i] * r[j];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      close(
        N[i][0] * g.covariance[0][j] + N[i][1] * g.covariance[1][j],
        i === j ? 0.25 : 0,
      );
});
test("a corrupted BP can fit both locating ranges exactly while failing the independent C check", () => {
  const clean = referencePointExample(),
    bad = referencePointExample({ rangeError: 4 });
  close(clean.checkResidual, 0);
  close(clean.positionError, 0);
  close(dist(bad.A, bad.P), bad.rA);
  close(dist(bad.B, bad.P), bad.rB);
  assert(bad.positionError > 1);
  assert(Math.abs(bad.checkResidual) > 0.1);
  const impossible = referencePointExample({ target: [50, 4], rangeError: -8 });
  assert.equal(impossible.P, null);
  assert.equal(impossible.checkResidual, null);
});
test("the north-side choice is independent of reference truth and can be wrong if the field sketch is wrong", () => {
  const m = referencePointExample({ target: [50, -40] });
  point(m.P, [50, 40]);
  close(m.positionError, 80);
});
