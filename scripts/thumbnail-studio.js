// Offline editorial previews, not quantitative outputs of the simulations.
// Only the exported WebP files ship to the catalogue; no WebGL runs on cards.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  seeded,
  surveyUas,
  building,
  tree,
  terrain,
} from "../src/simulations/survey-field-assets.js";
import { buildScanLine } from "../src/simulations/scanning-model.js";
import { createAerialSurvey } from "../src/simulations/aerial-survey.js";
import {
  initialiseSfm,
  growSfm,
  refineSfm,
} from "../src/simulations/sfm-reconstruction.js";
import earthUrl from "../src/assets/earth.jpg";
import { buildImuBench } from "../src/simulations/imu-scene.js";
import { makeTrajectory } from "../src/simulations/trajectory-model.js";
import {
  makeLeastSquaresExample,
  solveLeastSquaresExample,
} from "../src/simulations/least-squares-model.js";

const W = 960,
  H = 540;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
document.body.append(renderer.domElement);
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room).texture;
room.dispose();
const earth = await new THREE.TextureLoader().loadAsync(earthUrl);
earth.colorSpace = THREE.SRGBColorSpace;
const colors = {
  metal: 0xc5d0cf,
  dark: 0x28383e,
  gold: 0xf3bd63,
  cyan: 0x6acdd3,
  green: 0x899575,
  soil: 0x827361,
};
const mat = (color, metalness = 0, roughness = 0.65) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
const metal = mat(colors.metal, 0.75, 0.27),
  dark = mat(colors.dark, 0.35, 0.45),
  gold = mat(colors.gold, 0.45, 0.32);
function mesh(g, geo, material, p = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...p);
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
const box = (g, size, p, material = metal, radius = 0.06) =>
  mesh(
    g,
    new RoundedBoxGeometry(
      ...size,
      3,
      Math.min(radius, ...size.map((v) => v / 4)),
    ),
    material,
    p,
  );
function rod(g, a, b, radius = 0.02, material = metal) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    d = end.clone().sub(start);
  const m = mesh(
    g,
    new THREE.CylinderGeometry(radius, radius, d.length(), 12),
    material,
    start.clone().add(end).multiplyScalar(0.5).toArray(),
  );
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}
function line(g, pts, color = colors.gold, opacity = 0.8) {
  // A world-space hairline survives card-size downsampling; WebGL's native
  // one-pixel lines otherwise disappear when the 960px render is reduced.
  const path = new THREE.CurvePath();
  for (let i = 1; i < pts.length; i++) {
    if (
      new THREE.Vector3(...pts[i - 1]).distanceToSquared(
        new THREE.Vector3(...pts[i]),
      ) < 1e-12
    )
      continue;
    path.add(
      new THREE.LineCurve3(
        new THREE.Vector3(...pts[i - 1]),
        new THREE.Vector3(...pts[i]),
      ),
    );
  }
  const o = new THREE.Mesh(
    new THREE.TubeGeometry(
      path,
      Math.max(1, pts.length - 1) * 3,
      0.016,
      6,
      false,
    ),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  g.add(o);
  return o;
}
function dot(g, p, radius = 0.06, color = colors.gold) {
  return mesh(
    g,
    new THREE.SphereGeometry(radius, 16, 10),
    mat(color, 0.25, 0.3),
    p,
  );
}
function cylinder(g, r, depth, p, material = metal) {
  const m = mesh(g, new THREE.CylinderGeometry(r, r, depth, 64), material, p);
  m.rotation.x = Math.PI / 2;
  return m;
}
function points(g, pts, color, size = 2.3) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
  const m = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color, size, sizeAttenuation: false }),
  );
  g.add(m);
  return m;
}
function platform(g, w = 11, d = 7, material = mat(0x7b8778)) {
  box(g, [w, d, 0.38], [0, 0, -0.22], material, 0.12);
}
function site(g, { trees = true, houses = true } = {}) {
  const s = new THREE.Group();
  terrain(s, () => 0, { bounds: [-50, 50, -32, 32], step: 4 });
  if (houses) {
    building(s, { x0: -28, x1: -11, y0: 2, y1: 17, baseZ: 0, roofZ: 10 });
    building(s, { x0: 16, x1: 30, y0: 7, y1: 22, baseZ: 0, roofZ: 7 });
  }
  if (trees)
    for (const [cx, cy, r, h] of [
      [-32, -13, 4, 12],
      [27, -12, 5, 15],
      [3, 20, 4, 11],
    ])
      tree(s, { cx, cy, r, baseZ: 0, height: h }, cx + 40);
  s.scale.setScalar(0.105);
  g.add(s);
  platform(g, 10.5, 6.72, mat(0x777d66));
  return s;
}
function drone(g, p, scale = 0.7) {
  const d = surveyUas();
  d.scale.setScalar(scale);
  d.position.set(...p);
  g.add(d);
  return d;
}
function camera(g, p, scale = 1) {
  const c = new THREE.Group();
  box(c, [1.45, 0.75, 0.94], [0, 0, 0], dark, 0.12);
  box(c, [0.3, 0.95, 1.03], [-0.61, -0.03, -0.01], mat(0x17272d), 0.1);
  box(c, [0.5, 0.38, 0.2], [0.15, 0, 0.56], dark);
  box(c, [0.15, 0.2, 0.07], [-0.45, -0.16, 0.52], metal);
  for (const [y, r, h] of [
    [-0.55, 0.42, 0.45],
    [-0.82, 0.46, 0.12],
    [-0.93, 0.44, 0.1],
  ]) {
    const m = cylinder(c, r, h, [0.16, y, 0], dark);
    m.rotation.set(0, 0, 0);
  }
  for (let i = 0; i < 8; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.425, 0.015, 8, 56),
      metal,
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0.16, -0.45 - i * 0.045, 0);
    c.add(ring);
  }
  const lens = cylinder(
    c,
    0.36,
    0.025,
    [0.16, -0.992, 0],
    mat(0x173b4c, 0.85, 0.12),
  );
  lens.rotation.set(0, 0, 0);
  const iris = cylinder(
    c,
    0.17,
    0.027,
    [0.16, -1.012, 0],
    mat(0x0b1c24, 0.55, 0.12),
  );
  iris.rotation.set(0, 0, 0);
  box(c, [0.93, 0.025, 0.58], [0.15, 0.39, 0], mat(0x1c363f, 0.5, 0.25));
  c.scale.setScalar(scale);
  c.position.set(...p);
  g.add(c);
  return c;
}
function frustum(g, p, target, width = 1.5, color = colors.gold) {
  const corners = [
    [-width, -width * 0.65, 0],
    [width, -width * 0.65, 0],
    [width, width * 0.65, 0],
    [-width, width * 0.65, 0],
  ].map((q) => q.map((v, i) => v + target[i]));
  for (const c of corners) line(g, [p, c], color, 0.38);
  line(g, [...corners, corners[0]], color, 0.7);
}
function scanHead(g, p, scale = 1) {
  const s = new THREE.Group();
  box(s, [1.3, 1, 0.75], [0, 0, 0], metal, 0.1);
  for (let i = 0; i < 9; i++)
    box(s, [1.36, 0.035, 0.04], [0, -0.4 + i * 0.1, 0.26], dark, 0.01);
  const lens = cylinder(
    s,
    0.32,
    0.07,
    [0.2, 0, -0.43],
    mat(0x143c45, 0.75, 0.13),
  );
  cylinder(s, 0.37, 0.09, [0.2, 0, -0.4], dark);
  lens.position.z = -0.48;
  for (const x of [-0.5, 0.5])
    for (const y of [-0.36, 0.36]) cylinder(s, 0.025, 0.02, [x, y, 0.39], dark);
  s.position.set(...p);
  s.scale.setScalar(scale);
  g.add(s);
  return s;
}
function ring(g, p, r, color = colors.gold, tilt = 0) {
  const pts = Array.from({ length: 97 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return [
      p[0] + r * Math.cos(a),
      p[1] + r * Math.sin(a) * Math.cos(tilt),
      p[2] + r * Math.sin(a) * Math.sin(tilt),
    ];
  });
  return line(g, pts, color, 0.75);
}
function target(g, p, size = 0.55) {
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++)
      box(
        g,
        [size / 2, size / 2, 0.012],
        [p[0] + ((i - 0.5) * size) / 2, p[1] + ((j - 0.5) * size) / 2, p[2]],
        mat((i + j) % 2 ? 0xeee6ce : 0x283533),
        0.001,
      );
}
function satellite(g, p, scale = 1) {
  const s = new THREE.Group();
  box(s, [0.9, 0.8, 1], [0, 0, 0], gold, 0.04);
  box(s, [0.96, 0.82, 0.1], [0, 0, 0.58], metal);
  for (const sign of [-1, 1]) {
    rod(s, [sign * 0.4, 0, 0], [sign * 1.4, 0, 0], 0.045);
    box(
      s,
      [1.9, 1.25, 0.06],
      [sign * 1.8, 0, 0],
      mat(0x17374f, 0.5, 0.27),
      0.01,
    );
    for (let i = 0; i < 7; i++)
      box(
        s,
        [0.008, 1.22, 0.007],
        [sign * 1.8 - 0.84 + i * 0.28, 0, 0.037],
        metal,
        0.001,
      );
    for (let i = 0; i < 4; i++)
      box(
        s,
        [1.85, 0.008, 0.007],
        [sign * 1.8, -0.55 + i * 0.36, 0.037],
        metal,
        0.001,
      );
  }
  const dish = mesh(
    s,
    new THREE.SphereGeometry(0.42, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
    metal,
    [0, -0.4, -0.1],
  );
  dish.rotation.x = Math.PI / 2;
  s.position.set(...p);
  s.scale.setScalar(scale);
  g.add(s);
  return s;
}
function globe(g, p, r) {
  const o = mesh(
    g,
    new THREE.SphereGeometry(r, 96, 64),
    new THREE.MeshStandardMaterial({ map: earth, roughness: 0.86 }),
    p,
  );
  o.rotation.x = Math.PI / 2;
  o.rotation.y = -0.35;
  return o;
}
function imagePlane(g, p, w, h, texture) {
  const m = mesh(
    g,
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.75,
    }),
    p,
  );
  return m;
}
function canvasTexture(draw, w = 1024, h = 512) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ranging(g) {
  platform(g, 11, 7, mat(0x637c79));
  const head = scanHead(g, [-3.5, 0.1, 2.9], 1.5);
  head.rotation.y = -Math.PI / 2 + 0.22;
  head.updateMatrixWorld(true);
  for (const x of [-4.1, -3.2])
    rod(g, [x, 0.5, 2.4], [x, 0.5, 0.1], 0.07, dark);
  box(g, [0.28, 2.6, 3], [3, 0.1, 1.5], mat(0xb4b4a1));
  const origin = head.localToWorld(new THREE.Vector3(0.2, 0, -0.49)).toArray();
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
    head.quaternion,
  );
  const distance = (2.84 - origin[0]) / direction.x;
  const hit = origin.map((v, i) => v + direction.getComponent(i) * distance);
  line(g, [origin, hit], colors.gold, 1);
  line(
    g,
    [
      origin.map((v, i) => v + (i === 1 ? 0.12 : 0)),
      hit.map((v, i) => v + (i === 1 ? 0.12 : 0)),
    ],
    colors.cyan,
    0.8,
  );
  dot(g, hit, 0.11);
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.17;
    rod(
      g,
      origin.map((v, j) => v + (hit[j] - v) * t),
      origin.map((v, j) => v + (hit[j] - v) * (t + 0.06)),
      0.035,
      gold,
    );
  }
  // Physical pulse / return waveform on an instrument-like inset screen.
  box(g, [3.6, 0.14, 1.35], [0.3, -2.1, 0.7], dark);
  line(
    g,
    Array.from({ length: 150 }, (_, i) => {
      const x = i / 149;
      return [
        -1.3 + x * 3.2,
        -2.18,
        0.35 +
          0.8 * Math.exp(-(((x - 0.22) / 0.045) ** 2)) +
          0.42 * Math.exp(-(((x - 0.77) / 0.075) ** 2)),
      ];
    }),
    colors.cyan,
  );
}
function scanning(g) {
  site(g);
  const settings = {
    mechanism: "palmer",
    height: 30,
    speed: 10,
    objects: true,
  };
  const data = buildScanLine(settings);
  const pts = data.records
    .filter((r) => r.t > 5 && r.t < 12)
    .map((r) => [
      r.position[0] * 0.105,
      r.position[1] * 0.105,
      r.position[2] * 0.105 + 0.025,
    ]);
  points(g, pts, colors.cyan, 2.6);
  drone(g, [1.5, 0, 5], 0.48);
  for (const y of [-1.4, -0.7, 0, 0.7, 1.4])
    line(
      g,
      [
        [1.6, 0, 4.8],
        [1.5, y, 0.04],
      ],
      colors.gold,
      0.55,
    );
}
function interaction(g) {
  platform(g);
  tree(g, { cx: 0.5, cy: 0.1, r: 1.6, baseZ: 0, height: 4.8 }, 12);
  scanHead(g, [-3.7, 0.3, 5], 0.65);
  const a = [-3.6, 0.3, 4.65];
  line(g, [a, [0.2, 0.25, 3.6]], colors.gold);
  line(
    g,
    [
      [0.2, 0.25, 3.6],
      [0.8, 0.2, 0.08],
    ],
    colors.gold,
    0.6,
  );
  for (const p of [
    [0.2, 0.25, 3.6],
    [0.8, 0.2, 0.08],
  ]) {
    dot(g, p, 0.1, colors.cyan);
    line(g, [p, [-3.45, 0.3, 4.65]], colors.cyan, 0.5);
  }
  points(
    g,
    Array.from({ length: 100 }, (_, i) => {
      const t = i / 100;
      return [0.2 + 1.2 * t, 0.25 + Math.sin(i) * 0.3, 3.6 - 0.6 * t];
    }),
    colors.gold,
    2,
  );
}
function survey(g) {
  site(g);
  const path = [];
  for (let i = 0; i < 5; i++) {
    const y = -2.2 + i * 1.1;
    path.push([i % 2 ? 4 : -4, y, 2.7], [i % 2 ? -4 : 4, y, 2.7]);
  }
  line(g, path, colors.gold, 0.95);
  drone(g, [-2.6, -2.2, 2.7], 0.38);
  for (const p of [
    [-4, -2, 0],
    [4, 2, 0],
    [3, -2, 0],
    [-3, 2, 0],
  ])
    target(g, p, 0.65);
}
function photogrammetry(g, kind) {
  if (kind === "sfm") {
    // Use real recovered sparse geometry rather than invented truth points.
    const data = createAerialSurvey({
      noise: 0.5,
      baseline: 32,
      control: "none",
      navigation: "off",
    });
    let state = initialiseSfm(data.observations, {
      pointCount: data.truth.points.length,
      pair: [0, 1],
    });
    if (state.error) throw new Error(state.error);
    state = refineSfm(state, data.observations, 8);
    for (let i = 0; i < 4; i++) {
      const next = growSfm(state, data.observations);
      if (next.blocked) break;
      state = refineSfm(next, data.observations, 5);
    }
    const b = new THREE.Box3();
    state.points
      .filter(Boolean)
      .forEach((p) => b.expandByPoint(new THREE.Vector3(...p)));
    const center = b.getCenter(new THREE.Vector3());
    const convert = (p) => p.map((v, i) => (v - center.getComponent(i)) * 2.5);
    points(g, state.points.filter(Boolean).map(convert), colors.cyan, 5);
    for (const ci of state.registered) {
      const p = convert(state.cameras[ci].c);
      camera(g, p, 0.35).rotation.x = Math.PI / 2;
      const ties = state.points.filter(Boolean);
      for (let i = 0; i < ties.length; i += 7)
        line(g, [p, convert(ties[i])], colors.gold, 0.2);
    }
    return;
  }
  site(g, { trees: false });
  const positions = [
    [-3, -1, 4.7],
    [0, -1, 4.7],
    [3, -1, 4.7],
    [-3, 2, 4.7],
    [0, 2, 4.7],
    [3, 2, 4.7],
  ];
  for (const [i, p] of positions.entries()) {
    const c = camera(g, p, 0.33);
    c.rotation.x = Math.PI / 2;
    frustum(
      g,
      p,
      [p[0] * 0.7, p[1] * 0.7, 0.03],
      1.6,
      i % 2 ? colors.cyan : colors.gold,
    );
  }
  for (const p of [
    [-3, -2, 0],
    [3, -2, 0],
    [3, 2, 0],
  ])
    target(g, p, 0.5);
  if (kind === "block")
    for (const p of positions) {
      const q = [p[0] * 0.65, 0, 0.08];
      dot(g, q, 0.09, colors.cyan);
      line(g, [p, q], colors.gold, 0.6);
    }
}
function cameraCutaway(g) {
  platform(g, 7.2, 4.5, mat(0x4e636a));
  const c = new THREE.Group();
  box(c, [2.3, 2.8, 0.18], [-1.35, 0, 0.2], dark, 0.06);
  box(c, [0.18, 2.8, 2], [-2.45, 0, 1.15], dark);
  box(c, [2.3, 0.18, 2], [-1.35, 1.3, 1.15], dark);
  box(c, [0.7, 0.65, 1.8], [-1.2, -1.5, 1.1], dark, 0.18);
  box(c, [0.08, 1.6, 1.18], [-2.25, 0, 1.15], mat(0x234948, 0.7, 0.3));
  box(c, [0.09, 1.2, 0.86], [-2.17, 0, 1.15], mat(0x9a70ab, 0.7, 0.2));
  for (let i = 0; i < 18; i++)
    box(c, [0.1, 0.045, 0.045], [-2.1, -0.55 + i * 0.065, 1.65], gold, 0.001);
  const shell = mesh(
    c,
    new THREE.CylinderGeometry(0.86, 0.86, 2.5, 64, 1, true, 0, Math.PI),
    dark,
    [0.45, 0, 1.15],
  );
  shell.rotation.z = Math.PI / 2;
  for (let x = -0.7; x < 1.7; x += 0.24) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.86, 0.055, 12, 72, Math.PI * 1.45),
      dark,
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(x, 0, 1.15);
    c.add(ring);
  }
  for (const x of [-0.25, 0.35, 1]) {
    const lens = mesh(
      c,
      new THREE.SphereGeometry(0.73, 48, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x8cc8d8,
        metalness: 0.1,
        roughness: 0.1,
        transparent: true,
        opacity: 0.27,
        depthWrite: false,
      }),
      [x, 0, 1.15],
    );
    lens.scale.x = 0.14;
  }
  for (const z of [0.6, 1.15, 1.7])
    line(
      c,
      [
        [3.4, 0, 2.2],
        [0.5, 0, z],
        [-2.1, 0, 0.8],
      ],
      colors.gold,
      0.8,
    );
  c.rotation.z = 0.15;
  g.add(c);
}
function ortho(g) {
  const left = new THREE.Group(),
    right = new THREE.Group();
  site(left, { trees: false });
  site(right, { trees: false });
  left.scale.setScalar(0.48);
  right.scale.setScalar(0.48);
  right.scale.z = 0.0004;
  left.position.set(-3.2, 0, 0);
  right.position.set(3.2, 0, 0);
  g.add(left, right);
  // Nadir projection/roof outlines beside the perspective urban block.
  for (const [x, y, w, d] of [
    [1.8, 0.5, 0.86, 0.75],
    [4, 0.9, 0.7, 0.8],
  ])
    line(
      g,
      [
        [x, y, 0.04],
        [x + w, y, 0.04],
        [x + w, y + d, 0.04],
        [x, y + d, 0.04],
        [x, y, 0.04],
      ],
      colors.cyan,
      1,
    );
  line(
    g,
    [
      [-0.6, 0, 0.5],
      [0.7, 0, 0.5],
    ],
    colors.gold,
  );
  line(
    g,
    [
      [0.3, -0.2, 0.5],
      [0.7, 0, 0.5],
      [0.3, 0.2, 0.5],
    ],
    colors.gold,
  );
  camera(g, [-3.5, 1.4, 4.1], 0.38);
  frustum(g, [-3.5, 1.4, 3.9], [-3.2, 0, 0], 1.9);
}
function tin(g) {
  platform(g, 11, 7, mat(0x616e64));
  const random = seeded(71),
    coords = [];
  for (let j = 0; j < 6; j++)
    for (let i = 0; i < 9; i++) {
      const x = -4.7 + i * 1.15 + (random() - 0.5) * 0.5,
        y = -2.7 + j * 1.1 + (random() - 0.5) * 0.4;
      coords.push([x, y, 0.12 + 0.3 * Math.sin(x * 0.65) + 0.17 * Math.cos(y)]);
    }
  const vertices = [];
  for (let j = 0; j < 5; j++)
    for (let i = 0; i < 8; i++) {
      const a = j * 9 + i,
        b = a + 1,
        c = a + 9,
        d = c + 1;
      for (const index of [a, b, d, a, d, c]) vertices.push(...coords[index]);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  mesh(g, geo, mat(0x7c9a85));
  const edges = new THREE.WireframeGeometry(geo);
  const wire = edges.attributes.position;
  for (let i = 0; i < wire.count; i += 2)
    line(
      g,
      [
        [wire.getX(i), wire.getY(i), wire.getZ(i) + 0.018],
        [wire.getX(i + 1), wire.getY(i + 1), wire.getZ(i + 1) + 0.018],
      ],
      0x245c58,
      0.95,
    );
  edges.dispose();
  points(
    g,
    coords.map((p) => [p[0], p[1], p[2] + 0.025]),
    0xc37541,
    6,
  );
  tree(g, { cx: 2, cy: 1.6, r: 1, baseZ: 0.3, height: 3.7 }, 7);
  points(
    g,
    Array.from({ length: 150 }, () => {
      const a = random() * Math.PI * 2,
        r = random();
      return [2 + Math.cos(a) * r, 1.6 + Math.sin(a) * r, 2.4 + random() * 1.6];
    }),
    0xd48b73,
    2.5,
  );
}
function boresight(g) {
  const d = drone(g, [0, 0, 2.8], 1.65);
  d.rotation.z = 0.2;
  // Short offset guides only: GNSS is not depicted emitting a laser.
  const a = [-0.28, 0, 3.82],
    b = [0.33, 0, 2.21];
  const guide = line(g, [a, b], colors.gold, 0.9);
  guide.material.depthTest = false;
  guide.renderOrder = 2;
  dot(g, a, 0.07);
  dot(g, b, 0.07);
  for (const [end, color] of [
    [[2, 0, 2.8], 0xe29b87],
    [[0, 2, 2.8], 0xa5ccac],
    [[0, 0, 4.7], 0x95c9dc],
  ])
    line(g, [[0, 0, 2.8], end], color, 0.8);
  ring(g, [0.33, 0, 2.2], 0.6, colors.cyan, 0.25);
}
function gnss(g) {
  platform(g, 10, 7, mat(0x758471));
  const antenna = cylinder(g, 0.4, 0.14, [0, 0, 2.8], mat(0xebe8d8));
  cylinder(g, 0.16, 0.2, [0, 0, 2.65], dark);
  rod(g, [0, 0, 0.1], [0, 0, 2.6], 0.035, metal);
  for (const a of [0, 2.1, 4.2])
    rod(
      g,
      [0, 0, 1],
      [Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0.03],
      0.035,
      gold,
    );
  for (const [i, p] of [
    [0, [-3, 1, 6]],
    [1, [3, 2, 6]],
    [2, [2, -2.5, 5.3]],
  ]) {
    satellite(g, p, 0.36);
    line(
      g,
      [p, antenna.position.toArray()],
      i === 1 ? colors.gold : colors.cyan,
      0.55,
    );
  }
}
function gpr(g) {
  box(g, [10, 6, 2.4], [0, 0, -1.2], mat(0x84705a));
  box(g, [10, 6, 0.24], [0, 0, 0.05], mat(0x7c896c));
  for (const z of [-0.5, -1, -1.6, -2.2])
    line(
      g,
      [
        [-5, -3.01, z],
        [5, -3.01, z],
      ],
      0xc2a981,
      0.4,
    );
  // Cart with a ground-coupled antenna and a realistic buried utility.
  box(g, [1.8, 1.3, 0.3], [-1, -0.1, 0.36], mat(0xe2b85b));
  for (const x of [-1.65, -0.35])
    for (const y of [-0.85, 0.65]) {
      const wheel = cylinder(g, 0.25, 0.16, [x, y, 0.26], dark);
      wheel.rotation.set(0, 0, 0);
    }
  rod(g, [-1.6, 0.5, 0.5], [-2.5, 0.5, 2], 0.055);
  rod(g, [-2.5, 0.5, 2], [-2.5, -0.5, 2], 0.055);
  box(g, [0.65, 0.12, 0.45], [-2.45, 0, 1.9], dark);
  rod(g, [1, -3.08, -1.3], [1, 2.8, -1.3], 0.32, mat(0x4e8b90, 0.6, 0.4));
  line(
    g,
    [
      [-1, -3.02, 0.15],
      [1, -3.02, -1.3],
      [2.5, -3.02, 0.15],
    ],
    colors.gold,
    0.9,
  );
  for (const x of [-1.5, -1, -0.5])
    line(
      g,
      [
        [x, -0.2, 0.18],
        [1, -0.2, -1.3],
        [x, -0.15, 0.18],
      ],
      colors.gold,
      0.7,
    );
  // A B-scan is a travel-time hyperbola, not a buried-object shape.
  const tex = canvasTexture((c, w, h) => {
    c.fillStyle = "#132b36";
    c.fillRect(0, 0, w, h);
    for (let k = 0; k < 9; k++) {
      c.strokeStyle = `rgba(110,208,216,${0.85 - k * 0.08})`;
      c.lineWidth = 3;
      c.beginPath();
      for (let x = 0; x < w; x++) {
        const y = 80 + Math.sqrt(65 ** 2 + ((x - w * 0.5) * 0.5) ** 2) + k * 7;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
  });
  const screen = imagePlane(g, [3, 2, 1.9], 3, 1.65, tex);
  screen.rotation.x = Math.PI / 2;
}
function lod(g) {
  platform(g, 11, 7, mat(0x637b7c));
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Group();
    building(s, { x0: -9, x1: 9, y0: -7, y1: 7, baseZ: 0, roofZ: 16 });
    s.scale.setScalar(0.13);
    s.position.x = -3.5 + i * 3.5;
    if (i === 0) {
      s.clear();
      box(s, [18, 14, 16], [0, 0, 8], mat(0xb4bfb5), 0.05);
    } else {
      const roofGeo = new THREE.BufferGeometry();
      roofGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            -10, -8, 16, 10, -8, 16, 0, -8, 23, -10, 8, 16, 0, 8, 23, 10, 8, 16,
            -10, -8, 16, 0, -8, 23, 0, 8, 23, -10, -8, 16, 0, 8, 23, -10, 8, 16,
            10, -8, 16, 10, 8, 16, 0, 8, 23, 10, -8, 16, 0, 8, 23, 0, -8, 23,
          ],
          3,
        ),
      );
      roofGeo.computeVertexNormals();
      mesh(s, roofGeo, mat(0x776e61));
      if (i === 2)
        for (const y of [-5, 0, 5]) {
          box(s, [2.4, 2.8, 3.5], [2, y, 21], mat(0xa6ac9f));
          box(s, [0.1, 1.5, 1.6], [3.25, y, 21], mat(0x314d58, 0.55, 0.24));
        }
    }
    g.add(s);
  }
}
function gsd(g) {
  site(g, { trees: false, houses: false });
  camera(g, [0, 0, 5], 0.85).rotation.x = Math.PI / 2;
  frustum(g, [0, 0, 4.8], [0, 0, 0.035], 3.1);
  for (let i = 0; i <= 6; i++) {
    const x = -3 + i;
    line(
      g,
      [
        [x, -2, 0.04],
        [x, 2, 0.04],
      ],
      colors.cyan,
      0.6,
    );
  }
  for (let j = 0; j <= 4; j++) {
    const y = -2 + j;
    line(
      g,
      [
        [-3, y, 0.04],
        [3, y, 0.04],
      ],
      colors.cyan,
      0.6,
    );
  }
  box(g, [1, 1, 0.015], [0.5, -0.5, 0.05], gold, 0.002);
  line(
    g,
    [
      [0, 0, 4.8],
      [0, -1, 0.07],
      [1, -1, 0.07],
      [1, 0, 0.07],
      [0, 0, 4.8],
    ],
    colors.gold,
    0.9,
  );
}
function snell(g) {
  platform(g, 11, 7, mat(0x465e68));
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x85bbca,
    metalness: 0.05,
    roughness: 0.13,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lens = mesh(g, new THREE.SphereGeometry(2, 80, 48), glass, [0, 0, 2]);
  lens.scale.set(0.22, 1, 1);
  for (const y of [-1.2, -0.6, 0, 0.6, 1.2]) {
    line(
      g,
      [
        [-4.7, y, 2],
        [-0.4, y, 2],
      ],
      colors.gold,
      0.95,
    );
    line(
      g,
      [
        [-0.4, y, 2],
        [0.4, y * 0.92, 2],
        [3.8, 0, 2],
      ],
      colors.cyan,
      0.9,
    );
  }
  rod(g, [0, 0, 0], [0, 0, 0.45], 0.2, dark);
  ring(g, [0, 0, 2], 2.05, colors.metal, Math.PI / 2).rotation.z = Math.PI / 2;
  box(g, [0.15, 2, 2], [3.85, 0, 2], mat(0xb9b4a1));
  dot(g, [3.76, 0, 2], 0.08);
}
function mapproj(g) {
  globe(g, [-2.8, 0, 2.5], 2.5);
  const map = imagePlane(g, [3, 0, 1.9], 5, 2.5, earth);
  map.rotation.x = Math.PI / 2;
  const grid = new THREE.Group();
  for (let i = 0; i <= 8; i++)
    line(
      grid,
      [
        [-2.5 + i * 0.625, -1.25, 0.015],
        [-2.5 + i * 0.625, 1.25, 0.015],
      ],
      0xddddb1,
      0.5,
    );
  for (let j = 0; j <= 4; j++)
    line(
      grid,
      [
        [-2.5, -1.25 + j * 0.625, 0.015],
        [2.5, -1.25 + j * 0.625, 0.015],
      ],
      0xddddb1,
      0.5,
    );
  grid.rotation.copy(map.rotation);
  grid.position.copy(map.position);
  g.add(grid);
}
function sar(g) {
  site(g, { trees: false });
  satellite(g, [-2, 0, 5], 0.8);
  const swath = [
    [-0.2, -2.5, 0.04],
    [4.5, -2.5, 0.04],
    [4.5, 2.5, 0.04],
    [-0.2, 2.5, 0.04],
  ];
  for (const p of swath) line(g, [[-2, 0, 4.5], p], colors.cyan, 0.55);
  line(g, [...swath, swath[0]], colors.gold);
  for (let i = 0; i < 11; i++)
    line(
      g,
      [
        [i * 0.43, -2.5, 0.05],
        [i * 0.43, 2.5, 0.05],
      ],
      colors.cyan,
      0.25,
    );
  line(
    g,
    [
      [-4.5, 0, 5],
      [-3.5, 0, 5],
      [-2.5, 0, 5],
      [-1.5, 0, 5],
      [0, 0, 5],
      [1, 0, 5],
    ],
    colors.gold,
    0.7,
  );
}
function iot(g) {
  platform(g, 11, 7, mat(0x6a7979));
  for (let i = 0; i < 3; i++) {
    const x = -3.2 + i * 3.2;
    box(g, [2, 1.9, 2.1], [x, 0.2, 1.05], mat(i === 2 ? 0x416779 : 0xa5ada4));
    box(g, [1.55, 0.08, 1.1], [x, -0.8, 1.3], mat(0x193b47, 0.5, 0.2));
    box(g, [0.3, 0.2, 0.5], [x + 0.7, -0.9, 1.3], dark);
    dot(g, [x + 0.7, -1.04, 1.45], 0.05, i === 1 ? 0xd49865 : colors.cyan);
    cylinder(g, 0.3, 0.5, [x, 0.2, 2.3], metal);
    for (let n = 0; n < 3; n++)
      line(
        g,
        [
          [x, -1, 2.9 + n * 0.25],
          [x + 0.5, -1, 3.05 + n * 0.25],
          [x + 1, -1, 2.9 + n * 0.25],
        ],
        colors.cyan,
        0.65 - n * 0.15,
      );
  }
  const tex = canvasTexture((c, w, h) => {
    c.fillStyle = "#18303c";
    c.fillRect(0, 0, w, h);
    for (let j = 0; j < 3; j++) {
      c.strokeStyle = j === 1 ? "#e4b46f" : "#76c4c9";
      c.lineWidth = 4;
      c.beginPath();
      for (let x = 0; x < w; x++) {
        const y =
          90 + j * 150 + Math.sin(x * 0.035 + j) * 18 + Math.sin(x * 0.1) * 5;
        x ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    c.strokeStyle = "#92a4aa";
    c.lineWidth = 1;
    for (let y = 30; y < h; y += 60) {
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }
  });
  imagePlane(g, [0, 2, 3.5], 6, 2.2, tex).rotation.x = Math.PI / 2;
}
function beam(g) {
  platform(g, 11, 7, mat(0x788673));
  scanHead(g, [-2, 0, 5], 1);
  const a = [-1.8, 0, 4.55],
    center = [2, 0, 0.04];
  for (let i = 0; i < 32; i++) {
    const t = (i / 32) * Math.PI * 2;
    line(
      g,
      [a, [center[0] + 1.2 * Math.cos(t), 0.72 * Math.sin(t), 0.045]],
      colors.gold,
      0.16,
    );
  }
  const pts = Array.from({ length: 97 }, (_, i) => {
    const a = (i / 96) * Math.PI * 2;
    return [2 + 1.2 * Math.cos(a), 0.72 * Math.sin(a), 0.05];
  });
  line(g, pts, colors.gold, 1);
  for (let k = 1; k <= 4; k++)
    line(
      g,
      pts.map((p) => [2 + ((p[0] - 2) * k) / 5, (p[1] * k) / 5, p[2]]),
      colors.gold,
      0.3,
    );
  line(
    g,
    [
      [-1.8, 0, 4.55],
      [-1.8, 0, 0.04],
    ],
    colors.cyan,
    0.6,
  );
}

function imu(g) {
  const bench = buildImuBench(),
    board = bench.getObjectByName("imu-body");
  board.removeFromParent();
  board.position.z = 0.25;
  board.scale.setScalar(1.6);
  g.add(board);
  platform(g, 9, 6, mat(0x49605f));
}
function sbet(g) {
  platform(g, 14, 7, mat(0x607b70));
  const result = makeTrajectory(),
    center = result.records.at(-1).truth.p[0] / 2;
  const transform = (p) => [
    (p[0] - center) * 0.025,
    p[1] * 0.025,
    p[2] * 0.025,
  ];
  for (const [key, color] of [
    ["raw", colors.gold],
    ["filtered", colors.cyan],
    ["smoothed", 0x94d7ac],
  ])
    line(
      g,
      result.records
        .filter((_, i) => i % 10 === 0)
        .map((r) => transform(r[key].p)),
      color,
      0.95,
    );
  const row = result.records[1500],
    p = transform(row.smoothed.p);
  drone(g, p, 0.36);
  for (const r of result.records.filter(
    (r) => r.gnss?.accepted && Math.round(r.t) % 4 === 0,
  ))
    dot(g, transform(r.filtered.p), 0.07, colors.cyan);
  for (const y of [-1, 0, 1])
    line(g, [p, [p[0], p[1] + y, 0.05]], colors.cyan, 0.6);
}
function adjustment(g) {
  platform(g, 12, 7, mat(0x73836d));
  const stations = [
    [-4, -1.8],
    [-1, 1.4],
    [3, 1.6],
    [3.7, -1.8],
  ];
  for (const [x, y] of stations) {
    cylinder(g, 0.3, 0.1, [x, y, 0.08], metal);
    box(g, [0.16, 0.12, 2.2], [x, y, 1.2], mat(0xe7e4d7), 0.015);
    for (let i = 0; i < 11; i++)
      box(
        g,
        [0.17, 0.025, 0.075],
        [x, y - 0.07, 0.2 + i * 0.18],
        i % 2 ? dark : mat(0xb56f46),
        0.005,
      );
  }
  for (const [a, b] of [
    [0, 1],
    [0, 2],
    [1, 2],
    [1, 3],
    [2, 3],
    [0, 3],
  ])
    line(
      g,
      [
        [...stations[a], 0.1],
        [...stations[b], 0.1],
      ],
      colors.gold,
      0.65,
    );
  for (const a of [0, 2.1, 4.2])
    rod(
      g,
      [0, -1, 1.5],
      [Math.cos(a) * 0.7, -1 + Math.sin(a) * 0.7, 0.04],
      0.045,
      gold,
    );
  cylinder(g, 0.4, 0.15, [0, -1, 1.5], dark);
  box(g, [0.9, 0.42, 0.4], [0, -1, 1.8], metal);
  rod(g, [-0.65, -1, 1.8], [0.65, -1, 1.8], 0.16, dark);
  const result = solveLeastSquaresExample(makeLeastSquaresExample("level"));
  const texture = canvasTexture((c, w, h) => {
    c.fillStyle = "#102e38";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#a8ccbf";
    c.font = "38px monospace";
    c.fillText("N delta = u", 60, 75);
    c.font = "32px monospace";
    result.final.fit.N.forEach((r, i) => {
      r.forEach((v, j) =>
        c.fillText((v / 1000).toFixed(1), 60 + j * 220, 170 + i * 85),
      );
      c.fillStyle = "#e7bd77";
      c.fillText(result.final.fit.u[i].toFixed(2), 760, 170 + i * 85);
      c.fillStyle = "#a8ccbf";
    });
  });
  imagePlane(g, [0, 2.6, 3.2], 5.8, 2.2, texture).rotation.x = Math.PI / 2;
}
function surveyingPrinciples(g) {
  site(g, {trees:true,houses:true});
  const controls=[[-4,-2.5,0.08],[4,-2.5,0.08],[4,2.5,0.08],[-4,2.5,0.08]];
  controls.forEach((p)=>{
    box(g,[0.38,0.38,0.25],[p[0],p[1],0.18],metal);
    target(g,[p[0],p[1],0.33],0.55);
  });
  line(g,[...controls,controls[0]],colors.cyan,0.8);
  const P=[0,0.5,0.15];
  for(const p of controls.slice(0,2)) {
    for(const angle of [0,2.1,4.2]) rod(g,[p[0],p[1],1.4],[p[0]+0.45*Math.cos(angle),p[1]+0.45*Math.sin(angle),0.05],0.035,gold);
    cylinder(g,0.18,0.18,[p[0],p[1],1.45],dark);
    box(g,[0.36,0.35,0.42],[p[0],p[1],1.73],metal);
    line(g,[[p[0],p[1],1.73],P],colors.gold,0.9);
  }
  target(g,P,0.65);
  rod(g,P,[P[0],P[1],1.5],0.025,metal);
  box(g,[0.45,0.02,0.28],[P[0]+0.21,P[1],1.45],mat(0xc06b3d));
}
const scenes = {
  principles: surveyingPrinciples,
  ranging,
  scanning,
  interaction,
  survey,
  triangulation: (g) => photogrammetry(g, "triangulation"),
  sfm: (g) => photogrammetry(g, "sfm"),
  block: (g) => photogrammetry(g, "block"),
  camera: cameraCutaway,
  ortho,
  tin,
  boresight,
  gnss,
  gpr,
  lod,
  gsd,
  snell,
  mapproj,
  sar,
  iot,
  beam,
  imu,
  sbet,
  adjustment,
};
window.thumbnailKinds = Object.keys(scenes);
window.renderThumbnail = async (kind, width = W) => {
  if (!scenes[kind]) throw new Error(`Unknown thumbnail: ${kind}`);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10232c);
  scene.environment = environment;
  scene.environmentIntensity = 0.65;
  const group = new THREE.Group();
  scene.add(group);
  scenes[kind](group);
  const bounds = new THREE.Box3().setFromObject(group),
    sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const center = sphere.center;
  const camera = new THREE.PerspectiveCamera(34, W / H, 0.05, 200);
  camera.up.set(0, 0, 1);
  const direction = new THREE.Vector3(
    ...(kind === "boresight"
      ? [1, -1.5, 0.8]
      : kind === "mapproj"
        ? [0.25, -1, 0.55]
        : kind === "camera"
          ? [2, -3, 1.9]
          : [1.2, -1.8, 1.45]),
  ).normalize();
  const distance =
    (sphere.radius / Math.sin(THREE.MathUtils.degToRad(17))) * 0.9;
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);
  const hemi = new THREE.HemisphereLight(0xcbdfe7, 0x3e4637, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe5c0, 2.6);
  sun.position.set(-7, -8, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.0002;
  sun.shadow.radius = 3;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x88c4e0, 1.5);
  rim.position.set(6, 4, 8);
  scene.add(rim);
  // Shadow-catching studio floor does not participate in camera fitting.
  mesh(
    scene,
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshBasicMaterial({ color: 0x10232c }),
    [0, 0, bounds.min.z - 0.04],
  );
  const shadowFloor = mesh(
    scene,
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.25 }),
    [0, 0, bounds.min.z - 0.035],
  );
  shadowFloor.castShadow = false;
  await renderer.compileAsync(scene, camera);
  renderer.render(scene, camera);
  const output = document.createElement("canvas");
  output.width = width;
  output.height = (width * H) / W;
  output
    .getContext("2d")
    .drawImage(renderer.domElement, 0, 0, output.width, output.height);
  const url = output.toDataURL("image/webp", 0.88);
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  scene.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of o.material
      ? Array.isArray(o.material)
        ? o.material
        : [o.material]
      : []) {
      if ([metal, dark, gold].includes(m)) continue;
      materials.add(m);
      for (const v of Object.values(m))
        if (v?.isTexture && v !== earth && v !== environment) textures.add(v);
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
  return url;
};
