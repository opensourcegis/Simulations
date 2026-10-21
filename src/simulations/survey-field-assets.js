import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SURVEY_MOUNTS } from "./survey-mounts.js";

export function seeded(seed = 19) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const material = (color, roughness = 0.8, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
export function mesh(group, geometry, mat, position = [0, 0, 0]) {
  const o = new THREE.Mesh(geometry, mat);
  o.position.set(...position);
  o.castShadow = true;
  o.receiveShadow = true;
  group.add(o);
  return o;
}
export function box(group, size, position, mat) {
  return mesh(group, new THREE.BoxGeometry(...size), mat, position);
}
function enclosure(group, size, position, mat) {
  return mesh(
    group,
    new RoundedBoxGeometry(...size, 3, Math.min(...size) * 0.22),
    mat,
    position,
  );
}
export function tube(group, a, b, r, mat) {
  const av = new THREE.Vector3(...a),
    bv = new THREE.Vector3(...b),
    d = bv.clone().sub(av);
  const o = mesh(
    group,
    new THREE.CylinderGeometry(r, r, d.length(), 10),
    mat,
    av.add(bv).multiplyScalar(0.5).toArray(),
  );
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return o;
}
export function trace(group, points, color = 0xe9d8a2, opacity = 0.6) {
  const o = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(...p)),
    ),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity }),
  );
  group.add(o);
  return o;
}
function canvasTexture(size, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  draw(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// A deterministic aerial land-cover texture, not an invented elevation model.
// Surface vertices always use the lab's actual terrain/plane function.
function fieldTexture() {
  return canvasTexture(2048, (c, n) => {
    const r = seeded(23),
      u = (x) => ((x + 300) / 600) * n,
      v = (y) => n - ((y + 300) / 600) * n;
    c.fillStyle = "#73775a";
    c.fillRect(0, 0, n, n);
    const patch = (x, y, w, h, color) => {
      c.fillStyle = color;
      c.fillRect(u(x), v(y + h), (w / 600) * n, (h / 600) * n);
    };
    for (let x = -300; x < 300; x += 65)
      for (let y = -300; y < 300; y += 80) {
        patch(
          x,
          y,
          64,
          79,
          ["#797c5c", "#8b8c68", "#6e7957", "#99916d", "#7c8261"][
            Math.floor(r() * 5)
          ],
        );
        for (let a = 0; a < 64; a += 1.6)
          patch(x + a, y, 0.24, 79, "#555f3a25");
      }
    // Local site: mown field, worn farm access, gravel apron and two-track lane.
    patch(-45, -50, 175, 185, "#818468");
    patch(-300, -31, 600, 6.2, "#666964");
    patch(-300, -32, 600, 1, "#aaa58c");
    patch(-300, -24.8, 600, 0.8, "#aaa58c");
    patch(-34, -24, 4, 190, "#a29a7e");
    patch(-33.4, -24, 0.65, 190, "#b6ad90");
    patch(-31.4, -24, 0.65, 190, "#b6ad90");
    patch(102, 5, 21, 65, "#9b9789");
    for (let x = -300; x < 300; x += 12) patch(x, -28.05, 5, 0.12, "#d1cdb5");
    // Multiscale, non-repeating soil / vegetation variation and aggregate.
    for (let i = 0; i < 155000; i++) {
      const x = r() * n,
        y = r() * n,
        s = 0.3 + r() * 2.6;
      c.fillStyle = r() > 0.5 ? "#d1c5a022" : "#23351e22";
      c.fillRect(x, y, s, s * 0.6);
    }
    for (let i = 0; i < 850; i++) {
      c.beginPath();
      c.ellipse(r() * n, r() * n, 2 + r() * 22, 1 + r() * 8, r() * 6, 0, 7);
      c.fillStyle = r() > 0.5 ? "#e5d9a606" : "#26352208";
      c.fill();
    }
  });
}
function grainTexture() {
  return canvasTexture(256, (c, n) => {
    const r = seeded(84);
    const image = c.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const a = 100 + r() * 115;
      image.data.set([a, a, a, 255], i * 4);
    }
    c.putImageData(image, 0, 0);
  });
}
export function groundMaterial() {
  const bump = grainTexture();
  bump.colorSpace = THREE.NoColorSpace;
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(1200, 1200);
  const map = fieldTexture();
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({
    map,
    bumpMap: bump,
    bumpScale: 0.002,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  // A separate half-metre detail layer remains legible at target-inspection
  // distance; the 600 m land-cover texture alone has insufficient texel density.
  const detail = canvasTexture(512, (c, n) => {
    const r = seeded(49);
    c.fillStyle = "#a4a598";
    c.fillRect(0, 0, n, n);
    for (let i = 0; i < 19000; i++) {
      const x = r() * n,
        y = r() * n,
        a = r() * Math.PI * 2,
        len = 1 + r() * 9;
      c.strokeStyle = ["#e6e1ba", "#616757", "#858b71", "#c7c7a1", "#4f5948"][
        i % 5
      ];
      c.lineWidth = 0.6 + r() * 1.2;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      c.stroke();
    }
  });
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  mat.detailMap = detail; // owned texture; disposed with the material's other maps
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.fieldDetail = { value: detail };
    shader.fragmentShader =
      "uniform sampler2D fieldDetail;\n" +
      shader.fragmentShader.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n diffuseColor.rgb *= 0.65 + texture2D(fieldDetail, vMapUv * 1200.0).rgb * 1.25;",
      );
  };
  mat.customProgramCacheKey = () => "survey-field-detail-v1";
  return mat;
}
export function terrain(
  group,
  height,
  {
    bounds = [-300, 300, -300, 300],
    step = 5,
    hole = false,
    mat = null,
    name = "",
  } = {},
) {
  const [x0, x1, y0, y1] = bounds,
    nx = Math.ceil((x1 - x0) / step),
    ny = Math.ceil((y1 - y0) / step),
    p = [],
    uv = [],
    indices = [];
  for (let j = 0; j <= ny; j++)
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx,
        y = y0 + ((y1 - y0) * j) / ny;
      p.push(x, y, height(x, y));
      uv.push((x + 300) / 600, (y + 300) / 600);
    }
  const cut = Array.isArray(hole) ? hole : [0, 100, 0, 100];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = x0 + ((i + 0.5) * (x1 - x0)) / nx,
        y = y0 + ((j + 0.5) * (y1 - y0)) / ny;
      if (hole && x >= cut[0] && x <= cut[1] && y >= cut[2] && y <= cut[3])
        continue;
      const a = j * (nx + 1) + i;
      indices.push(a, a + 1, a + nx + 2, a, a + nx + 2, a + nx + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  const o = mesh(group, g, mat || groundMaterial());
  o.name = name;
  return o;
}
export function building(group, { x0, x1, y0, y1, baseZ, roofZ }) {
  const b = new THREE.Group(),
    w = x1 - x0,
    d = y1 - y0,
    h = roofZ - baseZ,
    cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  const wall = material(0xc1b9a5),
    trim = material(0x565d5b, 0.55),
    glass = material(0x354a4c, 0.22, 0.25),
    roof = material(0x777d7a, 0.65, 0.3);
  box(b, [w, d, h], [cx, cy, baseZ + h / 2], wall);
  box(b, [w + 0.5, d + 0.5, 0.22], [cx, cy, roofZ + 0.12], roof);
  // Corrugated seam roof, edge flashings, coping and a modest utility plant.
  for (let x = x0; x < x1; x += 0.65)
    box(b, [0.055, d + 0.4, 0.06], [x, cy, roofZ + 0.26], roof);
  for (const y of [y0 - 0.04, y1 + 0.04])
    box(b, [w + 0.6, 0.13, 0.3], [cx, y, roofZ + 0.1], trim);
  for (let floorZ = baseZ + 2.6; floorZ < roofZ - 1; floorZ += 3)
    for (let x = x0 + 1.5; x < x1 - 1; x += 3) {
      box(b, [1.3, 0.035, 1.5], [x, y0 - 0.025, floorZ], glass);
      for (const z of [floorZ - 0.78, floorZ + 0.78])
        box(b, [1.45, 0.09, 0.08], [x, y0 - 0.06, z], trim);
      box(b, [0.05, 0.1, 1.5], [x, y0 - 0.06, floorZ], trim);
    }
  box(b, [2.1, 0.08, 3.2], [cx, y0 - 0.06, baseZ + 1.6], trim);
  box(
    b,
    [0.12, 0.12, 0.12],
    [cx + 0.65, y0 - 0.14, baseZ + 1.5],
    material(0xc4c7bd, 0.25, 0.8),
  );
  box(
    b,
    [1.8, 1.4, 1],
    [x1 - 2, y1 - 2, roofZ + 0.7],
    material(0x9b9c91, 0.65, 0.3),
  );
  for (let y = y1 - 2.5; y < y1 - 1.5; y += 0.12)
    box(b, [1.5, 0.035, 0.025], [x1 - 2, y, roofZ + 1.22], trim);
  group.add(b);
  return b;
}
export function tree(group, { cx, cy, r, baseZ, height }, seed = 1) {
  const random = seeded(seed),
    g = new THREE.Group(),
    bark = material(0x655d48);
  const leaves = canvasTexture(256, (c) => {
    const rand = seeded(81);
    c.strokeStyle = "#6b7251";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(128, 230);
    c.bezierCurveTo(100, 130, 165, 90, 128, 20);
    c.stroke();
    for (let i = 0; i < 220; i++) {
      const y = 20 + rand() * 205,
        x = 128 + (rand() - 0.5) * Math.sin((y / 240) * Math.PI) * 190;
      c.beginPath();
      c.ellipse(x, y, 6 + rand() * 8, 2.5 + rand() * 4, rand() * 5, 0, 7);
      c.fillStyle = ["#89916b", "#616e48", "#a1a778", "#738258"][i % 4];
      c.fill();
    }
  });
  const leaf = new THREE.MeshStandardMaterial({
    map: leaves,
    roughness: 1,
    side: THREE.DoubleSide,
    alphaTest: 0.12,
    alphaToCoverage: true,
  });
  tube(
    g,
    [cx, cy, baseZ],
    [cx + 0.15, cy, baseZ + height * 0.72],
    Math.max(0.12, r * 0.055),
    bark,
  );
  const geo = new THREE.PlaneGeometry(1, 1),
    clusters = new THREE.InstancedMesh(geo, leaf, 520),
    dummy = new THREE.Object3D();
  const center = baseZ + height * 0.68;
  for (let i = 0; i < 520; i++) {
    const a = random() * Math.PI * 2,
      z = random() * 2 - 1,
      rad = Math.cbrt(random()),
      s = 0.23 + random() * 0.19,
      rr = Math.sqrt(1 - z * z) * rad;
    dummy.position.set(
      cx + Math.cos(a) * rr * r,
      cy + Math.sin(a) * rr * r,
      center + z * rad * height * 0.31,
    );
    dummy.scale.set(r * s, r * s, 1);
    dummy.rotation.set(random() * 3, random() * 3, random() * 3);
    dummy.updateMatrix();
    clusters.setMatrixAt(i, dummy.matrix);
    clusters.setColorAt(
      i,
      new THREE.Color().setHSL(
        0.19 + random() * 0.04,
        0.12 + random() * 0.1,
        0.48 + random() * 0.23,
      ),
    );
    if (i % 65 === 0)
      tube(
        g,
        [cx, cy, baseZ + height * 0.4],
        dummy.position.toArray(),
        r * 0.027,
        bark,
      );
  }
  clusters.castShadow = true;
  clusters.receiveShadow = true;
  g.add(clusters);
  group.add(g);
  return g;
}
export function siteDetails(group, height, { trees = true } = {}) {
  terrain(group, height, {
    bounds: [-2400, 2400, -2400, 2400],
    step: 60,
    hole: [-300, 300, -300, 300],
  });
  const random = seeded(72),
    wood = material(0x817767),
    wire = material(0x777f79, 0.5, 0.4);
  for (let y = -12; y <= 145; y += 7) {
    const z = height(-36, y);
    tube(group, [-36, y, z], [-36, y, z + 1.2], 0.065, wood);
    if (y < 140)
      for (const dz of [0.45, 0.9])
        tube(
          group,
          [-36, y, z + dz],
          [-36, y + 7, height(-36, y + 7) + dz],
          0.009,
          wire,
        );
  }
  if (trees)
    for (let i = 0; i < 24; i++) {
      const x = -58 - random() * 28,
        y = -10 + i * 10;
      tree(
        group,
        {
          cx: x,
          cy: y,
          r: 3 + random() * 2,
          baseZ: height(x, y),
          height: 10 + random() * 6,
        },
        i + 26,
      );
    }
  // Fence-line grasses: blades have physical scale, not a decorative grid.
  const blade = new THREE.BufferGeometry();
  blade.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [-0.035, 0, 0, 0.035, 0, 0, 0.012, 0, 0.38],
      3,
    ),
  );
  blade.computeVertexNormals();
  const grass = new THREE.InstancedMesh(
      blade,
      new THREE.MeshStandardMaterial({
        color: 0x727855,
        roughness: 1,
        side: THREE.DoubleSide,
      }),
      1800,
    ),
    o = new THREE.Object3D();
  for (let i = 0; i < 1800; i++) {
    const x = -39 + random() * 5,
      y = -20 + random() * 190;
    o.position.set(x, y, height(x, y));
    o.rotation.set(0, 0, random() * 6);
    o.scale.setScalar(0.5 + random() * 1.1);
    o.updateMatrix();
    grass.setMatrixAt(i, o.matrix);
  }
  group.add(grass);
}

// Representative large survey multirotor, dimensions in metres. Sensor centres
// are the numerical model's mounting points; no camera or scanner is spun for effect.
export function surveyUas({
  gps = SURVEY_MOUNTS.gps,
  scanner = SURVEY_MOUNTS.scanner,
  boresight = [0, 0, 0],
  camera = false,
  tilt = 0,
} = {}) {
  const g = new THREE.Group(),
    carbon = material(0x202627, 0.48, 0.3),
    shell = material(0xc4c7bf, 0.48, 0.15),
    metal = material(0x818a89, 0.3, 0.8),
    rubber = material(0x252b2c),
    optic = material(0x122c33, 0.12, 0.65),
    red = material(0x9c4d3e, 0.5);
  const weave = canvasTexture(128, (c, n) => {
    c.fillStyle = "#363e3e";
    c.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 8)
      for (let y = 0; y < n; y += 8) {
        c.fillStyle = (x + y) % 16 ? "#4e5654" : "#262e2e";
        c.fillRect(x, y, 7, 7);
        c.fillStyle = "#858b8540";
        c.fillRect(x, y, 7, 1);
      }
  });
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(5, 5);
  carbon.map = weave;
  carbon.color.set(0x939b98);
  enclosure(g, [1.14, 0.72, 0.24], [0, 0, 0], carbon);
  enclosure(g, [0.78, 0.53, 0.19], [-0.1, 0, 0.2], shell);
  enclosure(g, [0.62, 0.37, 0.2], [-0.12, 0, 0.37], rubber);
  for (const y of [-0.25, 0.25])
    for (let x = -0.35; x <= 0.35; x += 0.1)
      box(g, [0.045, 0.018, 0.065], [x, y, 0.2], carbon);
  for (const x of [-0.46, 0.46])
    for (const y of [-0.27, 0.27]) {
      const screw = mesh(
        g,
        new THREE.CylinderGeometry(0.014, 0.014, 0.008, 10),
        metal,
        [x, y, 0.125],
      );
      screw.rotation.x = Math.PI / 2;
    }
  for (const x of [-0.25, 0.14])
    box(g, [0.025, 0.44, 0.025], [x, 0, 0.48], carbon);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1]) {
      const end = [sx * 1.65, sy * 1.3, 0.02];
      tube(g, [sx * 0.35, sy * 0.28, 0], end, 0.055, carbon);
      tube(
        g,
        [sx * 0.35, sy * 0.28, -0.1],
        [sx * 1.55, sy * 1.2, 0],
        0.022,
        metal,
      );
      const motor = mesh(
        g,
        new THREE.CylinderGeometry(0.105, 0.105, 0.17, 24),
        sx === 1 ? red : carbon,
        [...end.slice(0, 2), 0.12],
      );
      motor.rotation.x = Math.PI / 2;
      const cap = mesh(
        g,
        new THREE.CylinderGeometry(0.045, 0.045, 0.055, 18),
        metal,
        [...end.slice(0, 2), 0.235],
      );
      cap.rotation.x = Math.PI / 2;
      const blade = new THREE.Shape();
      blade.moveTo(-0.58, -0.013);
      blade.quadraticCurveTo(-0.37, -0.07, -0.1, -0.045);
      blade.lineTo(0.06, -0.025);
      blade.quadraticCurveTo(0.36, -0.012, 0.58, 0.025);
      blade.lineTo(0.55, 0.045);
      blade.quadraticCurveTo(0.27, 0.09, 0.07, 0.044);
      blade.lineTo(-0.06, 0.024);
      blade.quadraticCurveTo(-0.35, 0.02, -0.58, 0.005);
      blade.closePath();
      const prop = mesh(
        g,
        new THREE.ExtrudeGeometry(blade, {
          depth: 0.01,
          bevelEnabled: false,
          curveSegments: 10,
        }),
        carbon,
        [...end.slice(0, 2), 0.215],
      );
      prop.rotation.z = sx * sy * 0.3;
      prop.userData.rotor = true;
      tube(
        g,
        [sx * 0.38, sy * 0.27, -0.05],
        [sx * 0.56, sy * 0.5, -0.62],
        0.022,
        metal,
      );
    }
  for (const sy of [-1, 1])
    tube(g, [-0.9, sy * 0.5, -0.65], [0.9, sy * 0.5, -0.65], 0.028, carbon);
  // IMU reference at the body origin, inside the airframe enclosure.
  const imu = enclosure(
    g,
    [0.28, 0.22, 0.11],
    [0, 0, 0],
    material(0x9a8558, 0.4, 0.6),
  );
  imu.userData.part = "imu";
  for (const x of [-0.1, 0.1])
    for (const y of [-0.075, 0.075]) {
      const screw = mesh(
        g,
        new THREE.CylinderGeometry(0.012, 0.012, 0.008, 10),
        metal,
        [x, y, 0.06],
      );
      screw.rotation.x = Math.PI / 2;
    }
  // A supported mast and low-profile radome. Internal wiring is omitted;
  // no diagonal cable or optical beam should appear to leave the antenna.
  const foot = [
    Math.max(-0.42, Math.min(0.42, gps[0])),
    Math.max(-0.24, Math.min(0.24, gps[1])),
    0.38,
  ];
  enclosure(g, [0.15, 0.15, 0.025], foot, metal);
  const base = [gps[0], gps[1], gps[2] - 0.07];
  tube(g, foot, base, 0.023, carbon);
  const antenna = new THREE.Group();
  antenna.name = "GNSS radome and phase-centre reference";
  antenna.position.set(...gps);
  const profile = [
    [0, -0.055],
    [0.105, -0.055],
    [0.125, -0.035],
    [0.13, -0.005],
    [0.115, 0.025],
    [0.075, 0.047],
    [0, 0.055],
  ].map((p) => new THREE.Vector2(...p));
  const dome = mesh(antenna, new THREE.LatheGeometry(profile, 40), shell);
  dome.rotation.x = Math.PI / 2;
  const baseRing = mesh(
    antenna,
    new THREE.CylinderGeometry(0.107, 0.107, 0.018, 32),
    rubber,
    [0, 0, -0.06],
  );
  baseRing.rotation.x = Math.PI / 2;
  antenna.traverse((o) => {
    if (o.isMesh) o.userData.part = "gps";
  });
  g.add(antenna);
  tube(
    g,
    [0.25, 0, -0.1],
    [scanner[0], scanner[1], scanner[2] + 0.25],
    0.035,
    metal,
  );
  const payload = new THREE.Group();
  payload.position.set(...scanner);
  payload.rotation.set(
    (boresight[0] * Math.PI) / 180,
    (-boresight[1] * Math.PI) / 180,
    (-boresight[2] * Math.PI) / 180,
    "ZYX",
  );
  if (camera) {
    payload.rotation.y = (-tilt * Math.PI) / 180;
    box(payload, [0.24, 0.18, 0.17], [0, 0, 0.16], carbon);
    const lens = mesh(
      payload,
      new THREE.CylinderGeometry(0.063, 0.069, 0.13, 32),
      metal,
      [0, 0, 0.065],
    );
    lens.rotation.x = Math.PI / 2;
    const front = mesh(
      payload,
      new THREE.CircleGeometry(0.054, 32),
      optic,
      [0, 0, -0.003],
    );
    front.rotation.x = Math.PI;
    for (let z = 0.02; z < 0.12; z += 0.025) {
      const ring = mesh(
        payload,
        new THREE.TorusGeometry(0.069, 0.004, 6, 32),
        rubber,
        [0, 0, z],
      );
      ring.userData.part = "camera";
    }
  } else {
    const body = mesh(
      payload,
      new THREE.CylinderGeometry(0.16, 0.13, 0.32, 32),
      metal,
      [0, 0, 0.08],
    );
    body.rotation.x = Math.PI / 2;
    body.userData.part = "scanner";
    const window = mesh(
      payload,
      new THREE.CylinderGeometry(0.135, 0.135, 0.12, 32),
      optic,
      [0, 0, -0.13],
    );
    window.rotation.x = Math.PI / 2;
    window.userData.part = "scanner";
    for (let z = 0.02; z < 0.24; z += 0.035) {
      const ring = mesh(
        payload,
        new THREE.TorusGeometry(0.163, 0.007, 6, 32),
        carbon,
        [0, 0, z],
      );
      ring.userData.part = "scanner";
    }
  }
  payload.traverse((o) => {
    if (o.isMesh) o.userData.part = camera ? "camera" : "scanner";
  });
  g.add(payload);
  return g;
}
export function checkerTarget(
  group,
  center,
  size,
  slope = 0,
  pattern = "check",
) {
  const map = canvasTexture(128, (c, n) => {
    c.fillStyle = "#e4e2d7";
    c.fillRect(0, 0, n, n);
    c.fillStyle = "#252925";
    if (pattern === "bowtie") {
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(n / 2, n / 2);
      c.lineTo(0, n);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(n, 0);
      c.lineTo(n / 2, n / 2);
      c.lineTo(n, n);
      c.closePath();
      c.fill();
    } else {
      c.fillRect(0, 0, n / 2, n / 2);
      c.fillRect(n / 2, n / 2, n / 2, n / 2);
    }
  });
  // Match sampleGroundTarget's world-X/Y pattern, including quadrant signs.
  map.flipY = false;
  const target = mesh(
    group,
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      map,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    [center[0], center[1], center[2] + 0.012],
  );
  target.rotation.y = -Math.atan(slope);
  return target;
}
