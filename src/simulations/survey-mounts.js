// Representative survey-UAS reference points in IMU forward / left / up metres.
// GNSS uses an effective phase centre inside the radome, not its plastic surface.
export const SURVEY_MOUNTS = Object.freeze({
  gps: Object.freeze([-0.18, 0, 0.62]),
  scanner: Object.freeze([0.2, 0, -0.36]),
});
