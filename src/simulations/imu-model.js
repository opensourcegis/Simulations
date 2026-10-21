import {
  DEG,
  G,
  add,
  sub,
  scale,
  norm,
  cross,
  qmul,
  qunit,
  qexp,
  qEuler,
  eulerQ,
  rotate,
  unrotate,
  noiseSource,
  wrap,
} from "./navigation-math.js";
export const IMU_PRESETS = {
  rest: {
    name: "Rest on the bench",
    roll: 0,
    pitch: 0,
    yaw: 0,
    acceleration: 0,
    rate: 0,
    freefall: false,
  },
  tilt: {
    name: "Tilt, without translating",
    roll: 30,
    pitch: 15,
    yaw: 0,
    acceleration: 0,
    rate: 0,
    freefall: false,
  },
  cruise: {
    name: "Constant velocity",
    initialVelocity: 5,
    roll: 0,
    pitch: 0,
    yaw: 0,
    acceleration: 0,
    rate: 0,
    freefall: false,
  },
  accelerate: {
    name: "Accelerate horizontally",
    roll: 0,
    pitch: 0,
    yaw: 0,
    acceleration: 2,
    rate: 0,
    freefall: false,
  },
  turn: {
    name: "Rotate about vertical",
    roll: 15,
    pitch: 0,
    yaw: 0,
    acceleration: 0,
    rate: 15,
    freefall: false,
  },
  freefall: {
    name: "Free fall · idealized",
    roll: 0,
    pitch: 0,
    yaw: 0,
    acceleration: 0,
    rate: 0,
    freefall: true,
  },
};
export function imuReading({
  q,
  acceleration = [0, 0, 0],
  omega = [0, 0, 0],
  accelBias = [0, 0, 0],
  gyroBias = [0, 0, 0],
}) {
  return {
    specificForce: add(unrotate(q, sub(acceleration, [0, 0, -G])), accelBias),
    angularRate: add(omega, gyroBias),
  };
}
export function makeImuExperiment(options = {}) {
  const c = {
    ...IMU_PRESETS.rest,
    gyroBias: 0.08,
    accelBias: 3,
    noise: 1,
    calibrate: false,
    duration: 20,
    dt: 0.01,
    initialTilt: 5,
    initialVelocity: 0,
    ...options,
  };
  const rand = noiseSource(238),
    gyroOffset = [0.2, -0.15, 1].map((v) => v * c.gyroBias * DEG),
    accelOffset = [1, -0.5, 0.3].map((v) => v * c.accelBias * 0.001 * G);
  // A real zero-rate calibration estimate from held-still samples, not truth subtraction.
  const calibration = new Array(3).fill(0);
  for (let i = 0; i < 200; i++)
    for (let j = 0; j < 3; j++)
      calibration[j] += (gyroOffset[j] + rand() * 0.015 * DEG * c.noise) / 200;
  const initial = eulerQ(c.roll * DEG, c.pitch * DEG, c.yaw * DEG);
  let gyroQ = qmul(initial, qexp([c.initialTilt * DEG, 0, 0])),
    aidedQ = gyroQ.slice();
  const records = [];
  for (let i = 0; i <= Math.round(c.duration / c.dt); i++) {
    const t = i * c.dt,
      q = eulerQ(c.roll * DEG, c.pitch * DEG, (c.yaw + c.rate * t) * DEG);
    const omega = [
      -Math.sin(c.pitch * DEG),
      Math.sin(c.roll * DEG) * Math.cos(c.pitch * DEG),
      Math.cos(c.roll * DEG) * Math.cos(c.pitch * DEG),
    ].map((v) => v * c.rate * DEG);
    const acceleration = c.freefall ? [0, 0, -G] : [c.acceleration, 0, 0];
    const ideal = imuReading({ q, acceleration, omega });
    const force = ideal.specificForce.map(
      (v, j) => v + accelOffset[j] + rand() * 0.002 * G * c.noise,
    );
    const measuredOmega = omega.map(
      (v, j) => v + gyroOffset[j] + rand() * 0.015 * DEG * c.noise,
    );
    records.push({
      t,
      q,
      gyroQ,
      aidedQ,
      force,
      omega: measuredOmega,
      idealForce: ideal.specificForce,
      idealOmega: omega,
      acceleration,
      velocity: [
        c.initialVelocity + acceleration[0] * t,
        acceleration[1] * t,
        acceleration[2] * t,
      ],
      yawError: wrap(qEuler(gyroQ)[2] - qEuler(q)[2]) / DEG,
      aidedYawError: wrap(qEuler(aidedQ)[2] - qEuler(q)[2]) / DEG,
      tiltError:
        Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              rotate(aidedQ, [0, 0, 1]).reduce(
                (s, v, j) => s + v * rotate(q, [0, 0, 1])[j],
                0,
              ),
            ),
          ),
        ) / DEG,
    });
    const corrected = measuredOmega.map(
      (v, j) => v - (c.calibrate ? calibration[j] : 0),
    );
    gyroQ = qunit(qmul(gyroQ, qexp(scale(corrected, c.dt))));
    const magnitude = norm(force),
      predicted = unrotate(aidedQ, [0, 0, 1]);
    // Norm gating rejects free fall but cannot distinguish horizontal acceleration
    // from gravity when the magnitude still happens to be near one g.
    const usable = magnitude > 0.7 * G && magnitude < 1.3 * G;
    const correction = usable
      ? scale(cross(scale(force, 1 / magnitude), predicted), 1.7)
      : [0, 0, 0];
    aidedQ = qunit(qmul(aidedQ, qexp(scale(add(corrected, correction), c.dt))));
  }
  return { config: c, records, calibration, gyroOffset, accelOffset };
}
