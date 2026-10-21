import { SURVEY_MOUNTS } from "./survey-mounts.js";
export const BORESIGHT_STAGES = [
  {
    id: "lever",
    title: "1 · Lever arm = translation",
    objective:
      "Locate the laser origin from the GNSS antenna, without introducing any angular error.",
    predict:
      "If flying height doubles, does omitting the same lever arm double the 3D error?",
    explain:
      "No. A fixed body-frame translation is rotated into the map frame, but its 3D magnitude does not grow with laser range. Omitting the entire lever arm displaces the reconstructed origin by the rotated antenna-to-scanner vector.",
  },
  {
    id: "boresight",
    title: "2 · Boresight = rotation",
    objective:
      "Distinguish the scanner coordinate frame from the IMU body frame.",
    predict:
      "What happens to the error from a fixed angular residual when range increases?",
    explain:
      "The endpoint separation grows approximately as slant range × angular error in radians. Calibration applies a coordinate rotation; it does not physically turn the scanner. True mounting angles and residual calibration errors are different quantities.",
  },
  {
    id: "attitude",
    title: "3 · Attitude = platform orientation",
    objective:
      "Use the IMU orientation to rotate the entire calibrated instrument into the mapping frame.",
    predict:
      "Does a tilted aircraft cause calibration error when its measured attitude is applied correctly?",
    explain:
      "Not by itself. The real ground hit may move, but reconstruction still matches it when attitude, lever arm and boresight are correct. Attitude changes during flight; rigid mounting calibration remains fixed.",
  },
  {
    id: "combined",
    title: "4 · Compose the transformations",
    objective:
      "Apply translation, scanner-to-body alignment and body-to-map attitude to the same recorded range.",
    predict:
      "Can calibration, timing and range errors be diagnosed by changing all of them together?",
    explain:
      "Isolate one effect first. Systematic error vectors may cancel or reinforce; they are not automatically independent noise terms. Reconstruction reuses the recorded range and is never forced back onto the terrain.",
  },
];
export function boresightLessonPreset(id) {
  const s = {
    height: 100,
    antennaArm: [...SURVEY_MOUNTS.gps],
    scannerArm: [...SURVEY_MOUNTS.scanner],
    attitude: [0, 0, 0],
    boresight: [0, 0, 0],
    scanAngle: 0,
    slope: 0,
    speed: 45,
    latencyMs: 0,
    angularRate: [0, 0, 0],
    leverError: [0, 0, 0],
    boreError: [0, 0, 0],
    rangeBias: 0,
    useLever: true,
    useBore: true,
    useAttitude: true,
  };
  if (id === "lever") s.useLever = false;
  if (id === "boresight") {
    s.boresight = [4, -3, 5];
    s.scanAngle = 25;
    s.useBore = false;
  }
  if (id === "attitude") {
    s.attitude = [12, -6, 15];
    s.useAttitude = false;
  }
  if (id === "combined") {
    s.attitude = [12, -6, 15];
    s.boresight = [4, -3, 5];
    s.scanAngle = 25;
  }
  if (id === "zero") s.attitude = [12, -6, 15];
  if (id === "yaw-nadir" || id === "yaw-scan") {
    s.boresight = [0, 0, 10];
    s.useBore = false;
    s.scanAngle = id === "yaw-scan" ? 30 : 0;
  }
  return s;
}
