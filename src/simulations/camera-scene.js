import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { caption, marker, segment } from "./PhotoLabScene.jsx";
import { cameraOptics, lensRayAtSensor } from "./photogrammetry-model.js";
import { cameraScene, cameraFocusGeometry } from "./camera-sensor-model.js";
import { sceneTexture } from "./camera-image.js";

// Camera dimensions share 100 mm / scene unit. Object space is compressed
// separately so a metre-scale subject and a millimetre-scale pupil both fit.
export function buildCameraScene({
  optics,
  objectM,
  f,
  focusM,
  fNumber,
  sensorW,
  part,
  cutaway,
  rays,
  shutterOpen,
  progress,
  capture,
  image,
  partName,
}) {
  const g = new THREE.Group(),
    { sensorX, lensX } = cameraFocusGeometry(optics),
    halfW = sensorW / 200,
    halfH = sensorW / 300;
  const mat = (color, tag, opacity = 1) =>
    new THREE.MeshStandardMaterial({
      color,
      emissive: part === tag ? 0x332518 : 0,
      emissiveIntensity: 0.3,
      roughness: tag === "body" ? 0.72 : 0.35,
      metalness: tag === "body" ? 0.15 : 0.45,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
      side: THREE.DoubleSide,
    });
  const box = (size, pos, color, tag, r = 0.015) => {
    const mesh = new THREE.Mesh(
      new RoundedBoxGeometry(...size, 2, r),
      mat(color, tag),
    );
    mesh.position.set(...pos);
    mesh.userData.part = tag;
    g.add(mesh);
    return mesh;
  };
  const ring = (x, r, thickness, color, tag) => {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(
        r,
        thickness,
        10,
        64,
        cutaway && tag === "lens" ? Math.PI : Math.PI * 2,
      ),
      mat(color, tag),
    );
    m.rotation.y = Math.PI / 2;
    m.position.x = x;
    m.userData.part = tag;
    g.add(m);
    return m;
  };
  // A recognisable mirrorless housing: fixed sensor, rear screen, hand grip,
  // viewfinder and lens mount. Cutaway removes the near side and roof.
  box([0.67, 1.34, 0.12], [-0.55, 0, -0.43], 0x303740, "body", 0.045);
  box([0.67, 0.07, 0.78], [-0.55, 0.64, -0.01], 0x343e48, "body");
  box([0.12, 1.24, 0.8], [-0.88, 0, -0.01], 0x333c45, "body", 0.04);
  box(
    [0.75, 0.28, cutaway ? 0.38 : 0.79],
    [-0.5, -0.67, cutaway ? -0.22 : -0.01],
    0x222b34,
    "body",
    0.09,
  );
  if (!cutaway) {
    box([0.67, 1.24, 0.12], [-0.55, 0, 0.41], 0x343e48, "body", 0.035);
    box([0.67, 0.07, 0.79], [-0.55, -0.61, -0.01], 0x343e48, "body");
  }
  box([0.24, 0.34, 0.2], [-0.69, 0.1, 0.49], 0x26303a, "body", 0.045);
  box([0.015, 0.69, 0.42], [-0.95, 0.13, 0], 0x151e25, "processor");
  box([0.12, 0.24, 0.04], [-0.31, -0.6, 0.41], 0x92989b, "shutter", 0.02);
  box([0.025, 0.65, 0.4], [-0.77, 0, -0.05], 0x37674c, "processor");
  for (let i = 0; i < 3; i++)
    box(
      [0.03, 0.12, 0.08],
      [-0.74, -0.2 + i * 0.2, -0.05],
      0x1d272b,
      "processor",
    );
  ring(-0.19, 0.37, 0.038, 0x909ca4, "body");
  // C-section lens barrel makes the aperture and glass visible in cutaway.
  const front = Math.max(0.1, lensX + 0.22),
    back = -0.2,
    length = front - back,
    radius = Math.max(0.34, optics.diameter / 200 + 0.07);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radius,
      radius,
      length,
      64,
      1,
      true,
      0,
      cutaway ? Math.PI : Math.PI * 2,
    ),
    mat(0x283440, "lens"),
  );
  barrel.rotation.z = Math.PI / 2;
  barrel.position.x = (front + back) / 2;
  barrel.userData.part = "lens";
  g.add(barrel);
  for (let i = 0; i < 11; i++)
    ring(
      back + (i / 10) * length,
      radius + 0.006,
      i % 2 ? 0.006 : 0.012,
      0x4d5864,
      "lens",
    );
  for (const delta of [-0.07, 0.06]) {
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(
        radius * 0.86,
        40,
        20,
        0,
        Math.PI * 2,
        0,
        Math.PI,
      ),
      new THREE.MeshPhysicalMaterial({
        color: 0x79b9cb,
        transparent: true,
        opacity: 0.15,
        roughness: 0.1,
        metalness: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    lens.scale.set(0.13, 1, 1);
    lens.position.x = lensX + delta;
    lens.userData.part = "lens";
    g.add(lens);
  }
  const irisShape = new THREE.Shape();
  irisShape.absarc(0, 0, radius * 0.92, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  const pupil = optics.diameter / 200;
  for (let i = 0; i < 9; i++) {
    const a = (-i / 8) * Math.PI * 2,
      x = pupil * Math.cos(a),
      y = pupil * Math.sin(a);
    i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y);
  }
  irisShape.holes.push(hole);
  const iris = new THREE.Mesh(
    new THREE.ShapeGeometry(irisShape),
    mat(0x66727d, "iris"),
  );
  iris.rotation.y = Math.PI / 2;
  iris.position.x = lensX;
  iris.userData.part = "iris";
  g.add(iris);
  // A fixed sensor package, active image and optional representative RGGB grid.
  box(
    [0.035, sensorW / 100 + 0.07, sensorW / 150 + 0.07],
    [sensorX - 0.018, 0, 0],
    0x9f875b,
    "sensor",
  );
  const tex = new THREE.CanvasTexture(image.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const planeRotation = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(1, 0, 0),
  );
  const sensor = new THREE.Mesh(
    new THREE.PlaneGeometry(sensorW / 100, sensorW / 150),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  sensor.quaternion.setFromRotationMatrix(planeRotation);
  sensor.position.x = sensorX + 0.005;
  sensor.userData.part = "sensor";
  g.add(sensor);
  if (part === "filter")
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 8; j++)
        box(
          [0.004, sensorW / 1250, sensorW / 1250],
          [
            sensorX + 0.013,
            -halfW + ((i + 0.5) * sensorW) / 1200,
            -halfH + ((j + 0.5) * sensorW) / 1200,
          ],
          i % 2 === j % 2 ? (i % 2 ? 0x628fce : 0xd88565) : 0x87ba72,
          "filter",
          0.001,
        );
  const shutterX = sensorX + 0.06;
  box(
    [0.015, sensorW / 100 + 0.02, sensorW / 150 + 0.02],
    [shutterX, 0, shutterOpen ? 0.34 : 0],
    0x596573,
    "shutter",
    0.003,
  );
  for (let j = 0; j < 5; j++)
    segment(
      g,
      [
        [
          shutterX + 0.012,
          -halfW,
          (shutterOpen ? 0.34 : 0) - halfH + (j * halfH) / 2,
        ],
        [
          shutterX + 0.012,
          halfW,
          (shutterOpen ? 0.34 : 0) - halfH + (j * halfH) / 2,
        ],
      ],
      0x8794a0,
      0.6,
    );
  segment(
    g,
    [
      [sensorX, 0, -halfH],
      [-0.75, 0, -0.2],
    ],
    0x6bd0a0,
  );
  segment(
    g,
    [
      [sensorX - 0.08, 0, 0],
      [lensX + 2.9, 0, 0],
    ],
    0x5b7d8b,
    0.5,
  );
  const objects = cameraScene(objectM);
  objects.forEach((o) => {
    const x = lensX + (1.6 * o.depth) / objectM,
      t = new THREE.CanvasTexture(sceneTexture(o.id));
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(o.width * 0.8, o.height * 0.8),
      new THREE.MeshBasicMaterial({
        map: t,
        side: THREE.DoubleSide,
        transparent: o.id === "ball",
        depthWrite: o.id !== "ball",
      }),
    );
    m.quaternion.setFromRotationMatrix(planeRotation);
    m.position.set(x, o.y * 0.8, o.z * 0.8);
    g.add(m);
    if (o.id === "board") {
      caption(
        g,
        "FOCUS TARGET · " + objectM.toFixed(1) + " m",
        [x, 0, 0.43],
        "#efce95",
        0.13,
      );
      segment(
        g,
        [
          [x, 0, -0.25],
          [x, 0, -0.65],
        ],
        0x768894,
      );
    }
  });
  if (rays && shutterOpen)
    for (const [n, object] of objects
      .filter((o) => o.id !== "background")
      .entries()) {
      const objectOptics = cameraOptics({
          f,
          focusM,
          objectM: object.depth,
          fNumber,
          sensorW,
        }),
        height = object.z * 1000 + (object.id === "board" ? 120 : 0),
        horizontal = object.y * 1000;
      for (let j = 0; j < 9; j++) {
        const a = (j / 8) * Math.PI * 2,
          r = j === 8 ? 0 : optics.diameter * 0.42,
          py = r * Math.sin(a),
          pz = r * Math.cos(a);
        const iy = lensRayAtSensor(objectOptics, horizontal, py),
          iz = lensRayAtSensor(objectOptics, height, pz);
        segment(
          g,
          [
            [
              lensX + (1.6 * object.depth) / objectM,
              object.y * 0.8,
              (height / 1000) * 0.8,
            ],
            [lensX, py / 100, pz / 100],
            [sensorX, iy / 100, iz / 100],
          ],
          n === 0 ? 0xf69d73 : 0x6cd3e3,
          0.55,
        );
      }
    }
  if (optics.blurPx > 1) {
    const x = lensX - optics.v / 100;
    segment(
      g,
      [
        [x, -halfW, -halfH],
        [x, halfW, -halfH],
        [x, halfW, halfH],
        [x, -halfW, halfH],
        [x, -halfW, -halfH],
      ],
      0x87daa0,
      0.65,
    );
  }
  if (capture)
    g.userData.readout = box(
      [0.006, sensorW / 100, 0.005],
      [sensorX + 0.012, 0, halfH - progress * halfH * 2],
      0xffdc86,
      "sensor",
      0.001,
    );
  const positions = {
    lens: [front, 0.43, 0.34],
    iris: [lensX, -0.45, -0.25],
    sensor: [sensorX, -0.45, -0.3],
    filter: [sensorX, -0.48, 0.18],
    shutter: [shutterX, 0.43, 0.32],
    processor: [-0.79, 0.4, -0.32],
    body: [-0.6, -0.8, 0.42],
  };
  caption(g, partName, positions[part], "#ffd3a0", 0.12);
  return g;
}
