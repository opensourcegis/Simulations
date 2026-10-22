const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function seededRandom(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}
export function stepMachine(a, dt, random) {
  const f = a.faults;
  const relax = (value, target, rate) =>
    target + (value - target) * Math.exp(-rate * dt);
  a.load = relax(a.load, f.surge > 0 ? 100 : 62, f.surge > 0 ? 3 : 0.6);
  f.surge = Math.max(0, f.surge - dt);
  const target =
    24 +
    a.load * 0.34 +
    (f.heat ? 34 : 0) +
    a.wear * 0.12 -
    (a.cooling ? 30 : 0);
  // Fixed-step, seeded disturbance: rendering cannot advance machine physics.
  a.temp =
    relax(a.temp, target, 1 / 7) + (random() - 0.5) * 0.1 * Math.sqrt(dt);
  a.vib = clamp(
    1.6 +
      a.load * 0.018 +
      a.wear * 0.05 +
      (f.bearing ? 6 + a.wear * 0.12 : 0) +
      (random() - 0.5) * 0.5,
    0.3,
    30,
  );
  a.wear = clamp(
    a.wear +
      dt *
        (0.02 +
          Math.max(0, a.temp - 72) * 0.006 +
          Math.max(0, a.vib - 6) * 0.02 +
          (f.bearing ? 0.05 : 0)),
    0,
    100,
  );
}
export function advanceClock(accumulator, realSeconds, speed, step) {
  accumulator += realSeconds * speed;
  while (accumulator >= 0.01 - 1e-12) {
    step(0.01);
    accumulator -= 0.01;
  }
  return Math.max(0, accumulator);
}
