const RAD = Math.PI / 180;
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
export const CAMERA_SENSORS = [
  { name: "Full frame", width: 36, aspect: 1.5 },
  { name: "APS-C", width: 23.5, aspect: 1.5 },
  { name: "Four Thirds", width: 17.3, aspect: 4 / 3 },
  { name: "1-inch type", width: 13.2, aspect: 1.5 },
];
export function gsdCamera({
  sensor = 0,
  megapixels = 24,
  f = 50,
  height = 100,
  elevation = 0,
  tilt = 0,
  slope = 0,
  ...rest
} = {}) {
  const spec = CAMERA_SENSORS[sensor],
    width = Math.round(Math.sqrt(megapixels * 1e6 * spec.aspect)),
    imageHeight = Math.round(width / spec.aspect),
    pitchMm = spec.width / width;
  return {
    ...rest,
    sensor,
    megapixels,
    f,
    height,
    elevation,
    tilt,
    slope,
    width,
    imageHeight,
    pitchMm,
    sensorW: spec.width,
    nominal: (pitchMm * (height - elevation)) / f,
  };
}
export function groundPixelRay(camera, u, v) {
  const th = camera.tilt * RAD,
    x = ((u - camera.width / 2) * camera.pitchMm) / camera.f,
    y = ((v - camera.imageHeight / 2) * camera.pitchMm) / camera.f;
  const direction = [
      Math.sin(th) + x * Math.cos(th),
      -y,
      -Math.cos(th) + x * Math.sin(th),
    ],
    gradient = Math.tan(camera.slope * RAD),
    denominator = direction[2] - gradient * direction[0];
  if (denominator >= -1e-10 || camera.height <= camera.elevation) return null;
  const t = (camera.elevation - camera.height) / denominator;
  if (t <= 0) return null;
  return [direction[0] * t, direction[1] * t, camera.height + direction[2] * t];
}
function triangleArea(a, b, c) {
  const u = b.map((x, i) => x - a[i]),
    v = c.map((x, i) => x - a[i]);
  return (
    Math.hypot(
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ) / 2
  );
}
export function localGsd(
  camera,
  u = camera.width / 2,
  v = camera.imageHeight / 2,
) {
  const corners = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([x, y]) => groundPixelRay(camera, u + x, v + y)),
    center = groundPixelRay(camera, u, v);
  if (corners.some((p) => !p) || !center) return null;
  return {
    u,
    v,
    center,
    corners,
    gx:
      (distance(corners[0], corners[1]) + distance(corners[2], corners[3])) / 2,
    gy:
      (distance(corners[1], corners[2]) + distance(corners[0], corners[3])) / 2,
    area:
      triangleArea(...corners.slice(0, 3)) +
      triangleArea(corners[0], corners[2], corners[3]),
    range: distance(center, [0, 0, camera.height]),
  };
}
export function imageFootprint(camera) {
  const corners = [
    [0, 0],
    [camera.width, 0],
    [camera.width, camera.imageHeight],
    [0, camera.imageHeight],
  ].map(([u, v]) => groundPixelRay(camera, u, v));
  return corners.some((p) => !p) ? null : corners;
}
export function imageBlur(
  camera,
  footprint,
  { fNumber = 5.6, exposure = 1 / 1000, speed = 15 } = {},
) {
  const airyPx = (2.44 * 0.55 * fNumber) / (camera.pitchMm * 1000),
    motionPx = footprint ? (speed * exposure) / footprint.gx : Infinity;
  return {
    airyPx,
    motionPx,
    sigmaX: Math.hypot(0.18 * airyPx, motionPx / Math.sqrt(12)),
    sigmaY: 0.18 * airyPx,
  };
}
function normalRandom(seed) {
  let state = seed >>> 0;
  const u = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
export function sampleGroundTarget(
  camera,
  footprint,
  {
    size = 0.5,
    pattern = "check",
    phase = 0,
    seed = 7,
    noise = true,
    fNumber = 5.6,
    exposure = 1 / 1000,
    speed = 15,
    dimension = 48,
  } = {},
) {
  if (!footprint) return null;
  const blur = imageBlur(camera, footprint, { fNumber, exposure, speed }),
    normal = normalRandom(seed),
    slope = camera.slope * RAD,
    tangent = [Math.cos(slope), 0, Math.sin(slope)],
    center = footprint.center.map(
      (x, j) => x + phase * footprint.gx * tangent[j],
    );
  const kernel = [
      [0, 0, 0.5],
      [2 * blur.sigmaX, 0, 0.125],
      [-2 * blur.sigmaX, 0, 0.125],
      [0, 2 * blur.sigmaY, 0.125],
      [0, -2 * blur.sigmaY, 0.125],
    ],
    pixels = [];
  // Fixed-exposure illustrative charge budget; noise is independent of GSD
  // geometry. No claim that pitch alone determines real sensor SNR.
  const unitCharge =
    10000 *
    ((camera.pitchMm * 1000) / 6) ** 2 *
    (4 / fNumber) ** 2 *
    (exposure / (1 / 1000));
  for (let row = 0; row < dimension; row++)
    for (let col = 0; col < dimension; col++) {
      let radiance = 0;
      for (let a = 0; a < 3; a++)
        for (let b = 0; b < 3; b++)
          for (const [du, dv, weight] of kernel) {
            const hit = groundPixelRay(
              camera,
              footprint.u + col - dimension / 2 + (a + 0.5) / 3 + du,
              footprint.v + row - dimension / 2 + (b + 0.5) / 3 + dv,
            );
            if (!hit) continue;
            const delta = hit.map((x, j) => x - center[j]),
              x = delta.reduce((s, v, j) => s + v * tangent[j], 0),
              y = delta[1];
            const inside = Math.abs(x) <= size / 2 && Math.abs(y) <= size / 2;
            const white =
              pattern === "bowtie"
                ? Math.abs(x) < Math.abs(y)
                : x < 0 !== y < 0;
            radiance += ((inside ? (white ? 0.8 : 0.03) : 0.18) * weight) / 9;
          }
      const electrons = radiance * unitCharge,
        measured =
          electrons + (noise ? normal() * Math.sqrt(electrons + 9) : 0);
      pixels.push(Math.max(0, Math.min(1, Math.min(20000, measured) / 10000)));
    }
  return { pixels, dimension, ...blur, unitCharge };
}
