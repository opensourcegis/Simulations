import test from 'node:test';
import assert from 'node:assert/strict';
import { LIGHT_SPEED, roundTripNs, pulseAmbiguity, phaseMeasurement, beamFootprint, evaluateTinCandidate, tinProfileSegment, boresightComparison, energyShares, relativeBackscatter } from '../games/shared/lidar-physics.js';
import { LIDAR_LESSONS } from '../games/shared/lidar-lessons.js';

const close = (actual, expected, tolerance = 1e-9) => assert(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

test('150 m ranging uses a 300 m round trip and correct ns conversion', () => {
  close(roundTripNs(150), 1000.6922855944562);
  close(LIGHT_SPEED * roundTripNs(150) * 1e-9 / 2, 150);
});
test('untagged periodic-pulse ambiguity is demonstrable at the available settings', () => {
  const result = pulseAmbiguity(220, 1000);
  close(result.limit, 149.896229);
  close(result.apparentRange, 70.103771);
  assert.equal(result.ambiguous, true);
  assert.equal(pulseAmbiguity(120, 100).ambiguous, false);
});
test('the half-open PRI interval wraps exactly at its upper boundary', () => {
  const { limit } = pulseAmbiguity(0, 1000);
  const boundary = pulseAmbiguity(limit, 1000);
  assert.equal(boundary.ambiguous, true);
  close(boundary.apparentRange, 0);
});
test('AMCW wraps while integer cycles reconstruct the original range', () => {
  for (const range of [0, 10, 120, 300]) {
    const p = phaseMeasurement(range, 10);
    assert(p.phaseDegrees >= 0 && p.phaseDegrees < 360);
    close((p.cycles + p.phaseDegrees / 360) * p.interval, range);
    close(p.wavelength, LIGHT_SPEED / 1e7);
  }
});
test('nadir full-angle divergence gives a half-metre spot at 1,000 m', () => {
  const g = beamFootprint(1000, 0.5, 0, 0);
  close(g.d, 0.5);
  close(g.area, Math.PI / 16);
});
test('60 degree incidence increases area eightfold only when d0 is negligible', () => {
  const nadir = beamFootprint(1000, 0.5, 0, 0);
  const oblique = beamFootprint(1000, 0.5, 60, 0);
  close(oblique.R, 2000);
  close(oblique.minor, 1);
  close(oblique.major, 2);
  close(oblique.area / nadir.area, 8);
  assert.notEqual(beamFootprint(30, 0.1, 60, 100).area / beamFootprint(30, 0.1, 0, 100).area, 8);
});
test('the exit diameter is included in the footprint and area model', () => {
  const g = beamFootprint(30, 0.1, 0, 100);
  close(g.d, 0.103);
  close(g.area, Math.PI * 0.103 ** 2 / 4);
});
const slope = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }, { x: 0, y: 10, z: 0 }];
test('a point on a steep TIN facet has zero insertion angle', () => {
  const result = evaluateTinCandidate({ x: 3, y: 3, z: 3 }, slope, 0.01, 1);
  close(result.d, 0);
  close(result.angle, 0);
  assert.equal(result.accepted, true);
});
test('TIN distance is perpendicular, not vertical, and vertex order does not matter', () => {
  const point = { x: 3, y: 3, z: 4 };
  const result = evaluateTinCandidate(point, slope, 0.8, 90);
  close(result.d, 1 / Math.sqrt(2));
  close(result.zPlane, 3);
  assert.equal(result.accepted, true);
  close(evaluateTinCandidate(point, [...slope].reverse(), 0.8, 90).d, result.d);
});
test('TIN tests distance and angle independently and rejects degenerate facets', () => {
  const p = { x: 3, y: 3, z: 4 };
  assert.equal(evaluateTinCandidate(p, slope, 0.1, 90).passesDist, false);
  assert.equal(evaluateTinCandidate(p, slope, 10, 1).passesAngle, false);
  assert.equal(evaluateTinCandidate(p, [slope[0], slope[0], slope[0]], 1, 1), null);
});
test('TIN profile intersects the facet plane and projects perpendicular-distance limits', () => {
  const result = tinProfileSegment(slope, 3, 1);
  close(result.start.x, 0);
  close(result.start.z, 0);
  close(result.end.x, 7);
  close(result.end.z, 7);
  close(result.verticalTolerance, Math.sqrt(2));
  assert.equal(tinProfileSegment(slope, 11, 1), null);
});
test('zero boresight produces no endpoint error with arbitrary measured attitude', () => {
  const result = boresightComparison(100, [0.7, 0, -0.8], [12, -6, 15], [0, 0, 0], 25);
  close(result.horizontalError, 0);
  close(result.verticalError, 0);
  close(result.actualHit[2], -100);
});
test('pure yaw cannot be observed from a nadir ray but shifts an off-axis ray', () => {
  close(boresightComparison(100, [0, 0, 0], [0, 0, 0], [0, 0, 10], 0).horizontalError, 0);
  const result = boresightComparison(100, [0, 0, 0], [0, 0, 0], [0, 0, 10], 30);
  close(result.horizontalError, 2 * 100 * Math.tan(Math.PI / 6) * Math.sin(Math.PI / 36));
  close(result.verticalError, 0);
});
test('boresight endpoints use one measured range, not two different ground intersections', () => {
  const result = boresightComparison(100, [0, 0, 0], [0, 0, 0], [1, 0, 0], 0);
  close(result.horizontalError, 100 * Math.tan(Math.PI / 180));
  close(result.verticalError, 100 - 100 / Math.cos(Math.PI / 180));
  assert.notEqual(result.uncalibratedHit[2], result.actualHit[2]);
});
test('a scanner below the ground has no forward ground intersection', () => {
  assert.equal(boresightComparison(2, [0, 0, -4], [0, 0, 0], [0, 0, 0]), null);
});
const white = { rho: 0.72, spec: 0.06, abs: 0.22, trans: 0, sig: 30 };
test('diffuse + specular + absorption + transmission conserve incident energy', () => {
  for (const material of [white, { rho: 0.02, spec: 0.06, abs: 0.91, trans: 0.01, sig: 2.5 }]) {
    for (const angle of [0, 20, 45, 65]) {
      const shares = energyShares(material, angle);
      close(Object.values(shares).reduce((sum, x) => sum + x, 0), 1);
      assert(Object.values(shares).every(x => x >= 0 && x <= 1));
    }
  }
});
test('the reference target is exactly 100% at the reference range and aperture', () => {
  close(relativeBackscatter(white, 0, 100, 100, white).rel, 1);
});
test('doubling range quarters the extended-target signal plus atmospheric loss', () => {
  close(relativeBackscatter(white, 0, 200, 100, white).rel, 0.25 * Math.exp(-0.004));
});
test('doubling receiver diameter quadruples collected signal, not range', () => {
  close(relativeBackscatter(white, 0, 100, 200, white).rel, 4);
});
test('all six lessons define experiments, assumptions and a valid self-check', () => {
  assert.equal(Object.keys(LIDAR_LESSONS).length, 6);
  assert.equal(new Set(Object.values(LIDAR_LESSONS).map(lesson => lesson.question.correct)).size, 3);
  for (const lesson of Object.values(LIDAR_LESSONS)) {
    assert.equal(lesson.steps.length, 3);
    assert.equal(new Set(lesson.experiments.map(e => e.id)).size, 3);
    assert(lesson.question.choices[lesson.question.correct]);
    assert(lesson.assumptions.length > 100);
  }
});
