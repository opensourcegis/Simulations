import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { caption, segment } from "./PhotoLabScene.jsx";
import { G, norm, scale } from "./navigation-math.js";

const material = (color, metalness = 0, roughness = 0.55) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
function block(g, size, p, m) {
  const o = new THREE.Mesh(new RoundedBoxGeometry(...size, 3, 0.025), m);
  o.position.set(...p);
  g.add(o);
  return o;
}
function spring(g, a, b, follow, offset, color = 0xd7ad66) {
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const u = i / 32;
    pts.push([
      a[0] + (b[0] - a[0]) * u,
      a[1] + (b[1] - a[1]) * u + Math.sin(u * Math.PI * 12) * 0.04,
      a[2] + (b[2] - a[2]) * u,
    ]);
  }
  const coil = segment(g, pts, color);
  coil.userData.follow = follow;
  coil.userData.offset = offset;
  coil.userData.anchor = b;
}
export function buildImuBench() {
  const root = new THREE.Group(),
    board = new THREE.Group();
  board.name = "imu-body";
  root.add(board);
  const metal = material(0x9ba8ac, 0.75, 0.3),
    chip = material(0x263d46, 0.3),
    pcb = material(0x28564c, 0.15),
    gold = material(0xdfb86d, 0.65, 0.3);
  block(board, [4.7, 2.8, 0.15], [0, 0, 0], pcb);
  for (const x of [-2.1, 2.1])
    for (const y of [-1.1, 1.1]) {
      const screw = new THREE.Mesh(
        new THREE.TorusGeometry(0.09, 0.023, 8, 24),
        metal,
      );
      screw.position.set(x, y, 0.1);
      board.add(screw);
    }
  for (let i = 0; i < 13; i++) {
    const y = -1.05 + i * 0.17;
    segment(
      board,
      [
        [-2.1, y, 0.09],
        [-1.7, y, 0.09],
        [-1.4, y * 0.6, 0.09],
        [0.4, y * 0.6, 0.09],
      ],
      0xb39c64,
      0.65,
    );
  }
  for (let i = 0; i < 16; i++)
    block(board, [0.16, 0.065, 0.05], [-2.35, -1.1 + i * 0.145, 0.09], gold);
  const sensor = new THREE.Group();
  sensor.position.set(-0.8, 0, 0.25);
  board.add(sensor);
  block(sensor, [1.75, 1.7, 0.14], [0, 0, 0], metal);
  for (const y of [-0.8, 0.8])
    block(sensor, [1.75, 0.08, 0.65], [0, y, 0.33], metal);
  for (const x of [-0.85, 0.85])
    block(sensor, [0.08, 1.7, 0.65], [x, 0, 0.33], metal);
  const mass = block(sensor, [0.58, 0.55, 0.24], [0, 0, 0.35], gold);
  mass.name = "accel-proof-mass";
  for (const sign of [-1, 1]) {
    spring(sensor, [sign * 0.3, 0, 0.35], [sign * 0.78, 0, 0.35], mass, [
      sign * 0.3,
      0,
      0,
    ]);
    for (let i = 0; i < 5; i++)
      block(mass, [0.15, 0.03, 0.14], [sign * 0.34, -0.25 + i * 0.12, 0], gold);
    for (let i = 0; i < 6; i++)
      block(
        sensor,
        [0.13, 0.035, 0.2],
        [sign * 0.48, -0.3 + i * 0.12, 0.25],
        metal,
      );
  }
  const gyro = new THREE.Group();
  gyro.position.set(1.3, 0, 0.3);
  board.add(gyro);
  block(gyro, [1.45, 1.6, 0.13], [0, 0, 0], metal);
  for (const sign of [-1, 1]) {
    const mass = block(gyro, [0.35, 0.65, 0.23], [sign * 0.4, 0, 0.3], chip);
    mass.name = sign === 1 ? "gyro-drive-positive" : "gyro-drive-negative";
    spring(
      gyro,
      [sign * 0.4, -0.33, 0.3],
      [sign * 0.4, -0.7, 0.3],
      mass,
      [0, -0.33, 0],
    );
    spring(
      gyro,
      [sign * 0.4, 0.33, 0.3],
      [sign * 0.4, 0.7, 0.3],
      mass,
      [0, 0.33, 0],
    );
  }
  block(board, [0.6, 0.4, 0.16], [0.25, -0.95, 0.16], chip);
  for (let i = 0; i < 5; i++)
    block(board, [0.14, 0.075, 0.07], [0.1 + i * 0.2, 0.98, 0.13], gold);
  caption(board, "ACCELEROMETER", [-0.8, 0.95, 0.9], "#dfbd7c", 0.27);
  caption(board, "VIBRATING GYRO", [1.2, 0.95, 0.9], "#82ccde", 0.27);
  const force = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-0.8, 0, 0.8),
    1.2,
    0x79d1d5,
    0.18,
    0.1,
  );
  force.name = "specific-force-arrow";
  board.add(force);
  for (const [i, color] of [
    [0, 0xe5a88e],
    [1, 0x9dcfa8],
    [2, 0x89c7df],
  ]) {
    const end = [0, 0, 0];
    end[i] = 1.5;
    segment(
      board,
      [[0, -1.6, -0.1], end.map((v, j) => v + [0, -1.6, -0.1][j])],
      color,
    );
    caption(
      board,
      ["X forward", "Y left", "Z up"][i],
      end.map((v, j) => v + [0, -1.6, -0.1][j]),
      "#dce5e5",
      0.21,
    );
  }
  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(4.9, 3, 0.3)),
    new THREE.LineBasicMaterial({
      color: 0xf5c681,
      transparent: true,
      opacity: 0.65,
    }),
  );
  outline.name = "estimated-imu-frame";
  root.add(outline);
  const gravity = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(-3.3, 0, 1.3),
    2,
    0xe4ad75,
    0.18,
    0.1,
  );
  root.add(gravity);
  caption(root, "GRAVITY · WORLD DOWN", [-3.2, 0, -1], "#e5b381", 0.25);
  const grid = new THREE.GridHelper(12, 24, 0x345663, 0x233b47);
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -2;
  root.add(grid);
  return root;
}
export function updateImuBench(
  root,
  row,
  { aided = false, showEstimate = true } = {},
) {
  if (!root.getObjectByName("imu-body")) return;
  const setQ = (o, q) => o.quaternion.set(q[1], q[2], q[3], q[0]);
  setQ(root.getObjectByName("imu-body"), row.q);
  const estimate = root.getObjectByName("estimated-imu-frame");
  setQ(estimate, aided ? row.aidedQ : row.gyroQ);
  estimate.visible = showEstimate;
  const mass = root.getObjectByName("accel-proof-mass");
  mass.position.set(
    ...row.idealForce.map(
      (v, i) =>
        (i === 2 ? 0.35 : 0) - Math.max(-0.22, Math.min(0.22, v * 0.016)),
    ),
  );
  const phase = 2 * Math.PI * 2 * row.t,
    drive = 0.09 * Math.sin(phase),
    sense = -0.3 * row.idealOmega[2] * Math.cos(phase);
  for (const sign of [-1, 1])
    root
      .getObjectByName(
        sign === 1 ? "gyro-drive-positive" : "gyro-drive-negative",
      )
      .position.set(sign * (0.4 + drive), sign * sense, 0.3);
  root.traverse((o) => {
    if (!o.userData.follow) return;
    const a = o.userData.follow.position
        .toArray()
        .map((v, i) => v + o.userData.offset[i]),
      b = o.userData.anchor,
      positions = o.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const u = i / (positions.count - 1);
      positions.setXYZ(
        i,
        a[0] + (b[0] - a[0]) * u,
        a[1] + (b[1] - a[1]) * u + Math.sin(u * Math.PI * 12) * 0.04,
        a[2] + (b[2] - a[2]) * u,
      );
    }
    positions.needsUpdate = true;
    o.frustumCulled = false;
  });
  const force = root.getObjectByName("specific-force-arrow"),
    magnitude = norm(row.idealForce);
  force.visible = magnitude > 0.15 * G;
  if (force.visible) {
    force.setDirection(
      new THREE.Vector3(...scale(row.idealForce, 1 / magnitude)),
    );
    force.setLength(Math.min(2, (magnitude / G) * 1.3), 0.18, 0.1);
  }
}
