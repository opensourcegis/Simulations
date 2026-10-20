import * as THREE from "three";
import { caption, marker, segment } from "./PhotoLabScene.jsx";
import { cameraRay } from "./photogrammetry-model.js";
import {
  terrainHeight,
  SURVEY_BUILDINGS,
  surfaceHeight,
} from "./aerial-survey.js";

export function aerialTerrain() {
  const group = new THREE.Group(),
    positions = [],
    colors = [];
  for (let y = -64; y < 64; y += 4)
    for (let x = -80; x < 80; x += 4) {
      const corners = [
          [x, y],
          [x + 4, y],
          [x + 4, y + 4],
          [x, y + 4],
        ],
        color = new THREE.Color(
          Math.abs(y) < 4
            ? 0x8b8e82
            : (Math.floor((x + 80) / 24) + Math.floor((y + 64) / 20)) % 2
              ? 0x587858
              : 0x7d8b58,
        );
      for (const index of [0, 1, 2, 0, 2, 3]) {
        const [px, py] = corners[index];
        positions.push(px, py, terrainHeight(px, py));
        colors.push(color.r, color.g, color.b);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  group.add(
    new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        roughness: 1,
      }),
    ),
  );
  for (const b of SURVEY_BUILDINGS) {
    const z = terrainHeight(b.x + b.w / 2, b.y + b.d / 2),
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(b.w, b.d, b.h),
        new THREE.MeshStandardMaterial({ color: 0xa29b84, roughness: 0.9 }),
      );
    mesh.position.set(b.x + b.w / 2, b.y + b.d / 2, z + b.h / 2);
    group.add(mesh);
    const roof = new THREE.Mesh(
      new THREE.PlaneGeometry(b.w + 0.5, b.d + 0.5),
      new THREE.MeshStandardMaterial({
        color: 0xa75d48,
        side: THREE.DoubleSide,
      }),
    );
    roof.position.set(b.x + b.w / 2, b.y + b.d / 2, z + b.h + 0.02);
    group.add(roof);
  }
  return group;
}
export function buildSurveyScene({
  data,
  state,
  camera = 0,
  point = 14,
  rays = true,
  reference = false,
  relative = false,
  connections = false,
}) {
  const group = new THREE.Group(),
    size = relative ? 0.035 : 0.5;
  if (!relative) group.add(aerialTerrain());
  state.points.forEach((p, pi) => {
    if (!p || data.checkpoints.includes(pi)) return;
    if (
      !relative &&
      data.observations.filter((o) => o.pi === pi && !o.checkpoint).length < 2
    )
      return;
    if (data.reconstructable && !data.reconstructable[pi]) return;
    const gcp = data.gcps.includes(pi);
    marker(
      group,
      p,
      gcp ? 0x6de4a6 : pi === point ? 0xffd56e : 0x77d6ec,
      pi === point ? size * 1.8 : size,
    );
    if (!relative && reference)
      segment(group, [p, data.truth.points[pi]], 0xff7270, 0.7);
    if (gcp && !relative)
      caption(group, "GCP " + (pi + 1), [p[0], p[1], p[2] + 3], "#8ee6b5", 5);
  });
  if (!relative)
    data.checkpoints.forEach((pi) => {
      marker(group, data.truth.points[pi], 0xc192ff, 0.8);
    });
  state.cameras.forEach((cam, ci) => {
    if (!cam) return;
    const color = ci === camera ? 0xffd56e : 0xf6a36a,
      length = relative ? 0.22 : 9;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(size * 2.2, size * 1.7, size),
      new THREE.MeshStandardMaterial({ color }),
    );
    body.position.set(...cam.c);
    body.userData.part = "camera-" + ci;
    group.add(body);
    const corners = [
      [0, 0],
      [1600, 0],
      [1600, 1200],
      [0, 1200],
    ].map(([u, v]) => {
      const d = cameraRay(cam, u, v, state.f, state.k1);
      return cam.c.map((x, j) => x + d[j] * length);
    });
    corners.forEach((p, i) => {
      segment(group, [cam.c, p], color, 0.7);
      segment(group, [p, corners[(i + 1) % 4]], color, 0.8);
    });
    caption(
      group,
      "C" + (ci + 1),
      [cam.c[0], cam.c[1], cam.c[2] + (relative ? 0.2 : 5)],
      "#ffd4a3",
      relative ? 0.26 : 6,
    );
    if (!relative && ci === camera) {
      const footprint = [
        [0, 0],
        [1600, 0],
        [1600, 1200],
        [0, 1200],
      ].map(([u, v]) => {
        const d = cameraRay(cam, u, v, state.f, state.k1);
        let t = -cam.c[2] / d[2];
        for (let i = 0; i < 8; i++) {
          const x = cam.c[0] + d[0] * t,
            y = cam.c[1] + d[1] * t;
          t = (surfaceHeight(x, y) - cam.c[2]) / d[2];
        }
        return cam.c.map((x, j) => x + d[j] * t + (j === 2 ? 0.15 : 0));
      });
      segment(group, [...footprint, footprint[0]], 0xffd56e, 0.85);
    }
    if (rays)
      data.observations
        .filter(
          (o) =>
            o.ci === ci &&
            !o.checkpoint &&
            state.points[o.pi] &&
            (o.pi === point || ci === camera),
        )
        .forEach((o) =>
          segment(
            group,
            [cam.c, state.points[o.pi]],
            o.pi === point ? 0xffd56e : 0x76c5dd,
            o.pi === point ? 0.9 : 0.12,
          ),
        );
  });
  if (connections)
    for (let i = 0; i < state.cameras.length; i++)
      for (let j = 0; j < i; j++)
        if (state.cameras[i] && state.cameras[j]) {
          const common = data.observations.some(
            (a) =>
              a.ci === i &&
              !a.checkpoint &&
              data.observations.some((b) => b.pi === a.pi && b.ci === j),
          );
          if (common)
            segment(
              group,
              [state.cameras[i].c, state.cameras[j].c],
              0x6de4a6,
              0.3,
            );
        }
  if (!relative) {
    for (const row of [
      [0, 1, 2],
      [3, 4, 5],
    ])
      segment(
        group,
        row.map((i) => state.cameras[i].c),
        0xeaa666,
        0.35,
      );
    caption(
      group,
      "LOCAL SURVEY GRID · metres · Z up",
      [-35, -57, 1],
      "#a7bec5",
      2.6,
    );
  }
  return group;
}
