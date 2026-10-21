import { eulerAxes } from "../../games/shared/lidar-physics.js";
import { SURVEY_MOUNTS } from "./survey-mounts.js";
const DEG = Math.PI / 180;
const add = (a, b) => a.map((x, i) => x + b[i]);
const toScene = (v) => [v[0], -v[1], -v[2]];
const transform = (axes, v) =>
  [0, 1, 2].map((i) => axes.reduce((s, col, j) => s + col[i] * v[j], 0));
export function rotateBody(vector, attitude) {
  return toScene(transform(eulerAxes(...attitude), toScene(vector)));
}
export function scannerDirection(attitude, boresight, scanAngle) {
  return toScene(
    transform(
      eulerAxes(...attitude),
      transform(eulerAxes(...boresight), [
        0,
        Math.sin(scanAngle * DEG),
        Math.cos(scanAngle * DEG),
      ]),
    ),
  );
}
// World/scene: X north, Y west/left, Z up. Mounts use forward/left/up;
// attitude/boresight are right-handed NED Rz(yaw) Ry(pitch) Rx(roll), degrees.
export function directGeoreference({
  height = 100,
  antennaArm = SURVEY_MOUNTS.gps,
  scannerArm = SURVEY_MOUNTS.scanner,
  attitude = [0, 0, 0],
  boresight = [0, 0, 0],
  scanAngle = 20,
  position = [0, 0],
  slope = 0,
  speed = 45,
  latencyMs = 0,
  angularRate = [0, 0, 0],
  leverError = [0, 0, 0],
  boreError = [0, 0, 0],
  rangeBias = 0,
  useLever = true,
  useBore = true,
  useAttitude = true,
} = {}) {
  const imu = [position[0], position[1], height],
    antenna = add(imu, rotateBody(antennaArm, attitude)),
    origin = add(imu, rotateBody(scannerArm, attitude));
  const direction = scannerDirection(attitude, boresight, scanAngle),
    gradient = Math.tan(slope * DEG),
    denom = direction[2] - gradient * direction[0];
  if (denom >= -1e-10) return null;
  const range = (gradient * origin[0] - origin[2]) / denom;
  if (range <= 0) return null;
  const actual = add(
      origin,
      direction.map((x) => x * range),
    ),
    dt = latencyMs / 1000;
  const usedAttitude = attitude.map((x, i) =>
    useAttitude ? x + angularRate[i] * dt : 0,
  );
  const velocity = rotateBody([speed, 0, 0], attitude),
    usedAntenna = add(
      antenna,
      velocity.map((x) => x * dt),
    );
  const lever = scannerArm.map((x, i) =>
    useLever ? x - antennaArm[i] + leverError[i] : 0,
  );
  const assumedBore = boresight.map((x, i) => (useBore ? x + boreError[i] : 0));
  const reconstructedOrigin = add(usedAntenna, rotateBody(lever, usedAttitude));
  const reconstructedDirection = scannerDirection(
    usedAttitude,
    assumedBore,
    scanAngle,
  );
  // Same recorded range. Never intersect the erroneous ray with terrain again.
  const estimated = add(
    reconstructedOrigin,
    reconstructedDirection.map((x) => x * (range + rangeBias)),
  );
  const error = estimated.map((x, i) => x - actual[i]);
  return {
    imu,
    antenna,
    origin,
    actual,
    estimated,
    error,
    range,
    direction,
    reconstructedOrigin,
    horizontal: Math.hypot(error[0], error[1]),
    vertical: error[2],
    total: Math.hypot(...error),
    velocity,
    lever,
  };
}
export function errorContributions(settings) {
  const zero = {
    ...settings,
    leverError: [0, 0, 0],
    boreError: [0, 0, 0],
    latencyMs: 0,
    rangeBias: 0,
    useLever: true,
    useBore: true,
    useAttitude: true,
  };
  return [
    [
      "Lever arm",
      directGeoreference({
        ...zero,
        leverError: settings.leverError,
        useLever: settings.useLever,
      }),
    ],
    [
      "Boresight",
      directGeoreference({
        ...zero,
        boreError: settings.boreError,
        useBore: settings.useBore,
      }),
    ],
    ...(settings.useAttitude === false
      ? [["Attitude", directGeoreference({ ...zero, useAttitude: false })]]
      : []),
    [
      "Timestamp",
      directGeoreference({ ...zero, latencyMs: settings.latencyMs }),
    ],
    [
      "Range bias",
      directGeoreference({ ...zero, rangeBias: settings.rangeBias }),
    ],
  ];
}
export function opposingSwaths(settings) {
  const shots = [];
  for (const heading of [0, 180])
    for (let along = -30; along <= 30; along += 15)
      for (const angle of [-25, 0, 25]) {
        const result = directGeoreference({
          ...settings,
          position: [along, heading === 0 ? -6 : 6],
          attitude: [settings.attitude[0], settings.attitude[1], heading],
          scanAngle: angle,
        });
        if (result) shots.push({ heading, along, angle, ...result });
      }
  return shots;
}
