// Illustrative sensor, not a particular manufacturer's specification.
export const SENSOR_MODEL = {
  fullWell: 20000,
  readNoise: 3,
  adcMax: 4095,
  referenceElectrons: 14000,
};
export const SENSOR_X = -0.58;
export function cameraFocusGeometry(optics) {
  return { sensorX: SENSOR_X, lensX: SENSOR_X + optics.sensorDistance / 100 };
}
export function sensorExposure(optics, lightEV = 12) {
  // ISO is deliberately absent: it changes gain, not collected electrons.
  return (
    (1 / optics.effectiveFNumber ** 2) *
    16 *
    (optics.pitch / 0.006) ** 2 *
    2 ** (lightEV - 12)
  );
}
export function expectedElectrons(
  linearRadiance,
  optics,
  shutter,
  lightEV = 12,
) {
  return (
    Math.max(0, linearRadiance) *
    SENSOR_MODEL.referenceElectrons *
    sensorExposure(optics, lightEV) *
    shutter *
    125
  );
}
export function sensorGain(electrons, iso) {
  const charge = Math.min(SENSOR_MODEL.fullWell, Math.max(0, electrons));
  return Math.round(
    Math.min(1, ((charge / SENSOR_MODEL.fullWell) * iso) / 100) *
      SENSOR_MODEL.adcMax,
  );
}
export function rollingTime(row, readoutMs) {
  return ((row - 0.5) * readoutMs) / 1000;
}
export function sensorShiftPx(speed, depthM, optics, time) {
  return ((-speed * optics.sensorDistance) / depthM / optics.pitch) * time;
}
export function blurSigmaDisplay(optics, width = 600) {
  // A uniform defocus disc has sigma = diameter/4 along either coordinate.
  // Airy central-lobe Gaussian approximation; this is not an exact wave PSF.
  return (Math.hypot(optics.blurPx / 4, optics.airyPx * 0.18) * width) / 6000;
}
export function cameraScene(objectM) {
  return [
    {
      id: "background",
      depth: objectM * 1.7,
      y: 0,
      z: 0,
      width: 4.5,
      height: 2.8,
    },
    { id: "board", depth: objectM, y: 0, z: 0.03, width: 0.9, height: 0.6 },
    {
      id: "ball",
      depth: objectM * 0.65,
      y: -0.35,
      z: 0.15,
      width: 0.3,
      height: 0.3,
    },
  ];
}
export function inverseRadial(xd, yd, k1, maxRadius) {
  const rd = Math.hypot(xd, yd);
  if (rd === 0 || k1 === 0) return [xd, yd];
  if (
    1 + 3 * k1 * maxRadius ** 2 <= 0 ||
    rd > maxRadius * (1 + k1 * maxRadius ** 2)
  )
    return null;
  let lo = 0,
    hi = maxRadius;
  for (let i = 0; i < 20; i++) {
    const r = (lo + hi) / 2;
    if (r * (1 + k1 * r * r) < rd) lo = r;
    else hi = r;
  }
  const scale = (lo + hi) / 2 / rd;
  return [xd * scale, yd * scale];
}
