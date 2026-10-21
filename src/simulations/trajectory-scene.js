import * as THREE from "three";
import { terrain, surveyUas } from "./survey-field-assets.js";
import { segment, caption } from "./PhotoLabScene.jsx";
import { trajectoryAt, lidarEndpoint } from "./trajectory-model.js";
import { SURVEY_MOUNTS } from "./survey-mounts.js";
import { add, rotate } from "./navigation-math.js";
const S = 0.08;
const scaled = (p) => p.map((v) => v * S);
function marker(root, p, color, radius) {
  const point = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({ color }),
  );
  point.position.set(...p);
  root.add(point);
  return point;
}
export const NAV_COLORS = {
  raw: 0xe9aa6c,
  filtered: 0x70cbe6,
  smoothed: 0x95d7a9,
  truth: 0xc3c9c4,
};
export function buildTrajectoryScene(
  result,
  { mode = "smoothed", lever = true, offset = 0, showTruth = true } = {},
) {
  const root = new THREE.Group(),
    world = new THREE.Group();
  world.scale.setScalar(S);
  root.add(world);
  terrain(world, () => 0, { bounds: [-40, 560, -100, 100], step: 12 });
  const sampled = result.records.filter((_, i) => i % 5 === 0);
  for (const key of [
    "raw",
    "filtered",
    "smoothed",
    ...(showTruth ? ["truth"] : []),
  ])
    segment(
      root,
      sampled.map((r) => scaled(r[key].p)),
      NAV_COLORS[key],
      key === "truth" ? 0.45 : 0.9,
    );
  const acquired = [];
  for (const row of result.records) {
    const state = trajectoryAt(result.records, row.t + offset, mode);
    if (state)
      acquired.push(...scaled(lidarEndpoint(state, row.shot, { lever })));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(acquired, 3));
  root.add(
    new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: NAV_COLORS[mode],
        size: 2.7,
        sizeAttenuation: false,
      }),
    ),
  );
  const uas = surveyUas();
  uas.scale.setScalar(S);
  uas.name = "trajectory-aircraft";
  root.add(uas);
  const ray = segment(
    root,
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    NAV_COLORS[mode],
    0.9,
  );
  ray.name = "trajectory-ray";
  ray.frustumCulled = false;
  const truthRay = segment(
    root,
    [
      [0, 0, 0],
      [0, 0, 0],
    ],
    NAV_COLORS.truth,
    0.6,
  );
  truthRay.name = "trajectory-truth-ray";
  truthRay.frustumCulled = false;
  truthRay.visible = showTruth;
  const hit = marker(root, [0, 0, 0], NAV_COLORS[mode], 0.1);
  hit.name = "trajectory-hit";
  const trueHit = marker(root, [0, 0, 0], 0xf6cf7f, 0.08);
  trueHit.name = "trajectory-true-hit";
  trueHit.visible = showTruth;
  const uncertainty = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshBasicMaterial({
      color: NAV_COLORS[mode],
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    }),
  );
  uncertainty.name = "trajectory-uncertainty";
  root.add(uncertainty);
  for (const x of [0, 100, 200, 300, 400, 500])
    caption(root, `${x} m E`, scaled([x, -70, 1]), "#c4cbb8", 0.7);
  caption(root, "North ↑ · local ENU", scaled([250, 85, 1]), "#c4cbb8", 0.85);
  return root;
}
export function updateTrajectoryScene(
  root,
  result,
  row,
  { mode, lever, offset, showTruth },
) {
  const state = trajectoryAt(result.records, row.t + offset, mode),
    uas = root.getObjectByName("trajectory-aircraft"),
    ray = root.getObjectByName("trajectory-ray"),
    hit = root.getObjectByName("trajectory-hit"),
    uncertainty = root.getObjectByName("trajectory-uncertainty");
  if (!uas || !ray || !hit || !uncertainty) return;
  uas.visible = ray.visible = hit.visible = uncertainty.visible = !!state;
  const setRay = (object, a, b) => {
    object.geometry.attributes.position.setXYZ(0, ...scaled(a));
    object.geometry.attributes.position.setXYZ(1, ...scaled(b));
    object.geometry.attributes.position.needsUpdate = true;
  };
  if (state) {
    uas.position.set(...scaled(state.p));
    uas.quaternion.set(state.q[1], state.q[2], state.q[3], state.q[0]);
    const origin = add(
        state.p,
        rotate(state.q, lever ? SURVEY_MOUNTS.scanner : [0, 0, 0]),
      ),
      endpoint = lidarEndpoint(state, row.shot, { lever });
    setRay(ray, origin, endpoint);
    hit.position.set(...scaled(endpoint));
    uncertainty.visible = mode !== "raw";
    uncertainty.position.copy(uas.position);
    const query = row.t + offset,
      dt = result.config.dt,
      index = Math.min(result.records.length - 2, Math.floor(query / dt)),
      fraction = (query - result.records[index].t) / dt;
    const a =
        mode === "smoothed"
          ? result.records[index].smoothP
          : result.records[index].P,
      b =
        mode === "smoothed"
          ? result.records[index + 1].smoothP
          : result.records[index + 1].P;
    uncertainty.scale.set(
      ...[0, 1, 2].map(
        (i) =>
          2 *
          Math.sqrt(a[i * 15 + i] * (1 - fraction) + b[i * 15 + i] * fraction) *
          S,
      ),
    );
  }
  root.getObjectByName("trajectory-truth-ray").visible = showTruth;
  root.getObjectByName("trajectory-true-hit").visible = showTruth;
  setRay(
    root.getObjectByName("trajectory-truth-ray"),
    add(row.truth.p, rotate(row.truth.q, SURVEY_MOUNTS.scanner)),
    row.shot.truth,
  );
  root
    .getObjectByName("trajectory-true-hit")
    .position.set(...scaled(row.shot.truth));
}
