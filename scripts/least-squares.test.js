import test from "node:test";
import assert from "node:assert/strict";
import {
  makeLeastSquaresExample,
  solveLeastSquaresExample,
  levelClosures,
  adjustmentCsv,
  ecefFromGeodetic,
  geodeticFromEcef,
} from "../src/simulations/least-squares-model.js";
import {
  weightedLeastSquares,
  qrSolve,
  identity,
  mm,
  mv,
  transpose,
  norm,
  chiSquareCdf,
  chiSquareQuantile,
  ellipse95,
} from "../src/simulations/least-squares-math.js";
const near = (a, b, tol = 1e-8) => assert(Math.abs(a - b) < tol, `${a} ≠ ${b}`),
  vector = (a, b, tol = 1e-8) => a.forEach((v, i) => near(v, b[i], tol));
const solve = (kind, options = {}) =>
  solveLeastSquaresExample(makeLeastSquaresExample(kind), options);
test("weighted mean equals the independent closed-form solution", () => {
  const d = makeLeastSquaresExample("mean"),
    r = solveLeastSquaresExample(d),
    p = d.observations.map((o) => 1 / o.sigma ** 2),
    expected =
      d.observations.reduce((s, o, i) => s + p[i] * o.value, 0) /
      p.reduce((a, b) => a + b);
  near(r.final.after[0], expected, 1e-11);
  near(r.final.fit.Cx[0][0], 1 / p.reduce((a, b) => a + b), 1e-15);
});
test("equal weighting is an arithmetic mean, not the same weighted answer", () => {
  const d = makeLeastSquaresExample("mean"),
    r = solveLeastSquaresExample(d, { weightMode: "equal" });
  near(
    r.final.after[0],
    d.observations.reduce((s, o) => s + o.value, 0) / 4,
    1e-11,
  );
  assert(Math.abs(r.final.after[0] - solve("mean").final.after[0]) > 0.0005);
});
test("the computed least-squares objective is a true minimum", () => {
  const r = solve("level").final,
    f = r.fit,
    objective = (x) => {
      const v = mv(f.A, x).map((v, i) => v - f.w[i]);
      return v.reduce((s, z, i) => s + z * mv(f.P, v)[i], 0);
    };
  near(objective(f.dx), f.objective, 1e-9);
  for (let j = 0; j < f.n; j++)
    for (const sign of [-1, 1]) {
      const x = f.dx.slice();
      x[j] += sign * 0.001;
      assert(objective(x) > f.objective);
    }
});
test("the common residual sign convention and adjusted observations are respected", () => {
  for (const kind of ["mean", "level", "baseline", "code"]) {
    const r = solve(kind),
      s = r.final;
    for (let i = 0; i < s.model.rows.length; i++)
      near(
        s.model.rows[i].value + s.exactResidual[i],
        s.model.predicted[i] + mv(s.model.A, s.fit.dx)[i],
        kind === "code" ? 2e-7 : 1e-10,
      );
  }
});
test("actual whitened matrix products reproduce the displayed normal equations", () => {
  for (const kind of ["level", "baseline", "code"]) {
    const f = solve(kind).final.fit,
      N = mm(mm(transpose(f.A), f.P), f.A),
      u = mv(mm(transpose(f.A), f.P), f.w);
    N.forEach((r, i) => vector(r, f.N[i], 1e-7));
    vector(u, f.u, 1e-7);
    vector(mv(f.N, f.dx), f.u, 1e-7);
    assert(norm(f.gradient) < 1e-7);
  }
});
test("the full precision matrix is the inverse covariance, including off-diagonals", () => {
  const f = solve("baseline").final.fit;
  mm(f.P, f.Sigma).forEach((r, i) => vector(r, identity(f.m)[i], 1e-10));
  assert(f.P[0][1] !== 0);
  assert(Math.abs(f.P[0][0] - 1 / f.Sigma[0][0]) > 100);
});
test("levelling precision follows the square-root-of-route-length law", () => {
  const d = makeLeastSquaresExample("level"),
    f = solveLeastSquaresExample(d).final.fit;
  d.observations.forEach((o, i) => {
    near(o.sigma, 0.002 * Math.sqrt(o.length), 1e-14);
    near(f.P[i][i], 1 / (0.002 ** 2 * o.length), 1e-7);
  });
});
test("measured loop misclosures are removed by one coherent height solution", () => {
  const d = makeLeastSquaresExample("level"),
    r = solveLeastSquaresExample(d),
    loops = levelClosures(d, r);
  assert(loops.some((l) => Math.abs(l.raw) > 0.001));
  loops.forEach((l) => near(l.after, 0, 1e-12));
  near(r.stations[0].adjustedHeight, 100);
  assert.equal(r.final.fit.dof, 3);
});
test("an open loop is reported as unavailable, not a zero misclosure", () => {
  const d = makeLeastSquaresExample("level");
  d.observations[2].active = false;
  const loops = levelClosures(d, solveLeastSquaresExample(d));
  assert.equal(loops[0].raw, null);
  assert.equal(loops[0].after, null);
});
test("unconstrained height and baseline networks report the correct datum rank defects", () => {
  const a = solve("level", { datum: "free" }),
    b = solve("baseline", { datum: "free" });
  assert(a.error);
  assert.equal(a.rank, 3);
  assert.equal(a.parameters.length, 4);
  assert(b.error);
  assert.equal(b.rank, 9);
  assert.equal(b.parameters.length, 12);
  assert.equal(a.final, undefined);
  assert.equal(b.final, undefined);
});
test("a weighted benchmark propagates its uncertainty instead of behaving as exact control", () => {
  const fixed = solve("level"),
    weighted = solve("level", { datum: "weighted" });
  assert.equal(weighted.parameters.length, 4);
  assert.equal(weighted.final.fit.m, 7);
  near(weighted.final.after[0], 100, 1e-11);
  for (let i = 0; i < 3; i++) {
    near(weighted.final.after[i + 1], fixed.final.after[i], 1e-10);
    near(
      weighted.final.fit.Cx[i + 1][i + 1] - fixed.final.fit.Cx[i][i],
      0.003 ** 2,
      1e-12,
    );
  }
});
test("excluding a disconnected station cannot create a unique solution", () => {
  const d = makeLeastSquaresExample("level");
  d.observations.forEach((o) => {
    if (o.from === "B" || o.to === "B") o.active = false;
  });
  assert(solveLeastSquaresExample(d).error);
});
test("a tree can be fitted exactly but has no redundancy for a statistical quality test", () => {
  const d = makeLeastSquaresExample("level");
  d.observations.forEach((o, i) => (o.active = [0, 1, 5].includes(i)));
  const f = solveLeastSquaresExample(d).final.fit;
  assert.equal(f.dof, 0);
  assert.equal(f.limits, null);
  assert.equal(f.sigma0, null);
  assert.equal(f.globalStatus, "no redundancy");
  assert(f.normalized.every((x) => x === null));
});
test("uniform sigma scaling leaves coordinates fixed but scales covariance and test statistic", () => {
  for (const kind of ["mean", "level", "baseline"]) {
    const a = solve(kind),
      b = solve(kind, { sigmaScale: 2 });
    vector(a.final.after, b.final.after, 1e-9);
    near(b.final.fit.objective, a.final.fit.objective / 4, 1e-8);
    a.final.fit.Cx.forEach((r, i) =>
      r.forEach((v, j) => near(b.final.fit.Cx[i][j], 4 * v, 1e-10)),
    );
  }
});
test("correlated GNSS components alter both the solution and uncertainty with heterogeneous baseline precision", () => {
  const a = solve("baseline"),
    b = solve("baseline", { correlated: false });
  assert(norm(a.final.after.map((v, i) => v - b.final.after[i])) > 0.001);
  vector(
    [a.stations[1].e, a.stations[1].n, a.stations[1].h],
    a.final.after.slice(0, 3),
  );
  assert(
    Math.abs(a.stations[1].ellipse.major - b.stations[1].ellipse.major) >
      0.00001,
  );
});
test("different baselines remain independent and advertised correlation endpoints remain positive definite", () => {
  for (const correlation of [-0.8, 0.8]) {
    const r = solve("baseline", { correlation });
    assert(!r.error);
    near(r.final.fit.Sigma[0][4], 0);
    near(r.final.fit.Sigma[0][1], correlation * 0.005 * 0.006, 1e-15);
  }
});
test("a gross observation error changes residual evidence without automatic truth-based rejection", () => {
  const d = makeLeastSquaresExample("level");
  d.observations[2].value += 0.02;
  const r = solveLeastSquaresExample(d);
  assert.equal(r.final.fit.m, 6);
  assert.equal(r.final.fit.globalStatus, "above interval");
  assert(r.final.fit.normalized.some((v) => Math.abs(v) > 3));
});
test("residual covariance is Sigma minus A Cx A transpose, not the original observation variance", () => {
  const f = solve("level").final.fit,
    ACAT = mm(mm(f.A, f.Cx), transpose(f.A));
  f.Cv.forEach((r, i) =>
    r.forEach((v, j) => near(v, f.Sigma[i][j] - ACAT[i][j], 1e-15)),
  );
  near(f.normalized[0], f.v[0] / Math.sqrt(f.Cv[0][0]));
  assert(Math.abs(f.normalized[0] - f.v[0] / Math.sqrt(f.Sigma[0][0])) > 0.001);
  near(
    f.redundancy.reduce((a, b) => a + b),
    f.dof,
    1e-10,
  );
});
test("pivoted QR solves a weakly separated problem without squaring its conditioning", () => {
  const A = [
      [1, 1],
      [1, 1 + 1e-7],
      [1, 1 - 1e-7],
    ],
    truth = [2, -1],
    r = qrSolve(A, mv(A, truth));
  assert(!r.error);
  vector(r.x, truth, 1e-7);
});
test("chi-square limits agree with reference quantiles and CDF inversion", () => {
  near(chiSquareQuantile(0.95, 1), 3.841458820694, 1e-10);
  near(chiSquareQuantile(0.975, 3), 9.348403604496, 1e-10);
  near(chiSquareQuantile(0.025, 3), 0.215795282624, 1e-10);
  for (const n of [1, 3, 4, 9, 17])
    for (const p of [0.025, 0.5, 0.975])
      near(chiSquareCdf(chiSquareQuantile(p, n), n), p, 1e-10);
});
test("95 percent ellipse semi-axes and orientation follow the full 2D covariance", () => {
  const e = ellipse95([
    [4, 0],
    [0, 1],
  ]);
  near(e.major / e.minor, 2);
  near(e.angle, 0);
  const r = ellipse95([
    [2.5, 1.5],
    [1.5, 2.5],
  ]);
  near(r.angle, Math.PI / 4);
  near(r.major, e.major);
});
test("GNSS code Jacobian matches finite differences in ECEF and clock range", () => {
  const r = solve("code"),
    s = r.iterations[0],
    sat = s.model.rows[0],
    prediction = (x) => norm(sat.position.map((v, i) => v - x[i])) + x[3];
  for (let j = 0; j < 4; j++) {
    const a = s.before.slice(),
      b = s.before.slice();
    a[j] += 0.1;
    b[j] -= 0.1;
    near((prediction(a) - prediction(b)) / 0.2, s.model.A[0][j], 1e-7);
  }
});
test("GNSS processing genuinely relinearizes and converges to a noisy position and clock estimate", () => {
  const r = solve("code");
  assert(r.converged);
  assert(r.iterations.length >= 3);
  assert(norm(r.iterations[0].fit.dx.slice(0, 3)) > 2000);
  assert(norm(r.final.fit.dx) < 1e-5);
  for (let i = 1; i < r.iterations.length; i++)
    assert(
      r.iterations[i].afterObjective <=
        r.iterations[i - 1].afterObjective + 1e-5,
    );
  assert(Math.abs(r.gnss.geodetic.h - 850) < 3);
  assert(Math.abs(r.final.after[3] - 75) < 3);
  assert(r.final.fit.objective > 1);
  assert.equal(r.final.fit.dof, 4);
});
test("different starting coordinates converge to the same GNSS estimate, not to the original approximation", () => {
  const a = solve("code"),
    b = solveLeastSquaresExample(
      makeLeastSquaresExample("code", { initialOffset: 10 }),
    );
  vector(a.final.after, b.final.after, 1e-6);
  assert(
    norm(b.final.after.slice(0, 3).map((v, i) => v - b.data.initial[i])) >
      20000,
  );
});
test("weak satellite geometry degrades geometric precision without requiring large residuals", () => {
  const good = solve("code"),
    bad = solveLeastSquaresExample(
      makeLeastSquaresExample("code", { geometry: "cluster" }),
    );
  assert(bad.converged);
  assert(bad.gnss.pdop > good.gnss.pdop * 10);
  assert(bad.gnss.ellipse.major > good.gnss.ellipse.major * 5);
});
test("PDOP is an unweighted geometry quantity, independent of a common sigma scale", () => {
  near(
    solve("code").gnss.pdop,
    solve("code", { sigmaScale: 2 }).gnss.pdop,
    1e-8,
  );
});
test("fewer than four code observations cannot solve receiver position plus clock", () => {
  const d = makeLeastSquaresExample("code");
  d.observations.forEach((o, i) => (o.active = i < 3));
  const r = solveLeastSquaresExample(d);
  assert(r.error);
  assert.equal(r.rank, 3);
});
test("four code observations give zero redundancy, not a validated perfect position", () => {
  const d = makeLeastSquaresExample("code");
  d.observations.forEach((o, i) => (o.active = i < 4));
  const r = solveLeastSquaresExample(d);
  assert(r.converged);
  assert.equal(r.final.fit.dof, 0);
  assert.equal(r.final.fit.sigma0, null);
});
test("solver position does not use the map reference coordinates as truth constraints", () => {
  const d = makeLeastSquaresExample("code"),
    a = solveLeastSquaresExample(d);
  d.reference = { lat: 0.5, lon: 0.6, h: 12345 };
  const b = solveLeastSquaresExample(d);
  vector(a.final.after, b.final.after, 1e-10);
});
test("ECEF conversion round-trips geodetic coordinates", () => {
  const r = geodeticFromEcef(ecefFromGeodetic(0.3, 1.4, 850));
  near(r.lat, 0.3, 1e-12);
  near(r.lon, 1.4, 1e-12);
  near(r.h, 850, 1e-6);
});
test("empty examples report a readable failure, and invalid covariance is never silently accepted", () => {
  const d = makeLeastSquaresExample("mean");
  d.observations.forEach((o) => (o.active = false));
  assert(solveLeastSquaresExample(d).error);
  assert.throws(
    () =>
      weightedLeastSquares(
        [[1], [1]],
        [0, 1],
        [
          [1, 2],
          [2, 1],
        ],
      ),
    /positive definite/,
  );
});
test("downloaded residual worksheet contains actual converged observations and corrections", () => {
  const r = solve("level"),
    rows = adjustmentCsv(r).split("\n");
  assert.equal(rows.length, 7);
  assert.equal(rows[0].split(",").length, 8);
  const cells = rows[1].split(",");
  near(+cells[2] - +cells[1], +cells[3], 1e-10);
});
