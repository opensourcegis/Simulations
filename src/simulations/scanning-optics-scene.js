import * as THREE from "three";
import {
  POLYGON_APOTHEM,
  POLYGON_FACETS,
  POLYGON_RADIUS,
} from "./scan-optics.js";

const Z = new THREE.Vector3(0, 0, 1);
const X = new THREE.Vector3(1, 0, 0);
const mat = (color, metalness = 0.25, roughness = 0.4) =>
  new THREE.MeshStandardMaterial({
    color,
    metalness,
    roughness,
    side: THREE.DoubleSide,
  });

export function buildScanOpticsScene(id) {
  const root = new THREE.Group();
  const shell = mat(0x344653, 0.65),
    metal = mat(0x91a9b3, 0.7, 0.22);
  const mirrorSurface = mat(0xcce9ef, 0.75, 0.13),
    copper = mat(0xc49555, 0.6);
  const add = (parent, geometry, material, position = [0, 0, 0]) => {
    const o = new THREE.Mesh(geometry, material);
    o.position.set(...position);
    parent.add(o);
    return o;
  };
  const box = (parent, size, position, material = shell) =>
    add(parent, new THREE.BoxGeometry(...size), material, position);
  const cylinder = (
    parent,
    radius,
    length,
    position,
    material = metal,
    segments = 32,
  ) => {
    const o = add(
      parent,
      new THREE.CylinderGeometry(radius, radius, length, segments),
      material,
      position,
    );
    o.rotation.x = Math.PI / 2;
    return o;
  };
  const emitter = (position, direction) => {
    const body = cylinder(root, 0.14, 0.4, position, shell);
    body.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(...direction),
    );
    const lens = cylinder(
      root,
      0.09,
      0.025,
      position.map((p, i) => p + direction[i] * 0.21),
      mat(0x5bd7eb, 0.3, 0.1),
    );
    lens.quaternion.copy(body.quaternion);
  };
  let mirror, outer, inner, rotor, head;
  const facets = [],
    prisms = [];
  if (id === "poly") {
    const center = POLYGON_APOTHEM / Math.sqrt(2);
    rotor = new THREE.Group();
    rotor.position.set(0, center, center);
    root.add(rotor);
    const spacing = (2 * Math.PI) / POLYGON_FACETS,
      beta0 = Math.PI / 4 - (25 * Math.PI) / 360;
    const cap = new THREE.CylinderGeometry(
      POLYGON_RADIUS,
      POLYGON_RADIUS,
      0.38,
      POLYGON_FACETS,
    );
    cap.rotateZ(Math.PI / 2);
    cap.rotateX(beta0 + Math.PI / 2 + spacing / 2);
    add(rotor, cap, shell);
    for (let j = 0; j < POLYGON_FACETS; j++) {
      const beta = beta0 + j * spacing;
      const n = new THREE.Vector3(0, -Math.cos(beta), -Math.sin(beta));
      const facet = box(
        rotor,
        [
          0.42,
          2 * POLYGON_RADIUS * Math.sin(Math.PI / POLYGON_FACETS) * 0.97,
          0.012,
        ],
        n.clone().multiplyScalar(POLYGON_APOTHEM).toArray(),
        mirrorSurface.clone(),
      );
      facet.quaternion.setFromUnitVectors(Z, n);
      facet.name = `scan-optic-facet-${j}`;
      facets.push(facet);
    }
    const axle = cylinder(root, 0.075, 1.65, [0, center, center], copper);
    axle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), X);
    box(root, [0.28, 0.48, 0.55], [-0.86, center, center]);
    emitter([0, -1.35, 0], [0, 1, 0]);
  } else if (id === "risley") {
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x70c8df,
      metalness: 0.1,
      roughness: 0.15,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (const height of [0.65, 0]) {
      const prism = new THREE.Group();
      prism.position.z = height;
      root.add(prism);
      const vertices = [];
      for (const z of [-1, 1])
        for (const [x, y] of [
          [-0.5, -0.5],
          [0.5, -0.5],
          [0.5, 0.5],
          [-0.5, 0.5],
        ])
          vertices.push(x, y, z < 0 ? -0.07 : 0.12 + y * 0.2);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geometry.setIndex([
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
      ]);
      geometry.computeVertexNormals();
      add(prism, geometry, glass);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x89d6e8 }),
      );
      prism.add(edges);
      const ring = add(
        prism,
        new THREE.TorusGeometry(0.79, 0.055, 8, 48),
        shell,
      );
      ring.position.z = 0.04;
      box(prism, [0.08, 0.24, 0.08], [0, 0.73, 0.08], copper);
      prisms.push(prism);
    }
    emitter([0, 0, 1.3], [0, 0, -1]);
  } else if (id === "multi") {
    head = new THREE.Group();
    root.add(head);
    cylinder(head, 0.47, 0.65, [0, 0, 0.1], shell);
    cylinder(head, 0.49, 0.05, [0, 0, 0.43], metal);
    cylinder(head, 0.49, 0.05, [0, 0, -0.23], metal);
    for (let i = 0; i < 8; i++) {
      const beta = ((4 + (16 * i) / 7) * Math.PI) / 180;
      const lens = cylinder(
        head,
        0.035,
        0.03,
        [0.3, 0, 0.32 - i * 0.065],
        mat(0x5bd7eb, 0.35, 0.1),
        12,
      );
      lens.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(Math.sin(beta), 0, -Math.cos(beta)),
      );
    }
    box(head, [0.12, 0.08, 0.65], [0.47, 0, 0.1], copper);
    cylinder(root, 0.12, 0.45, [0, 0, 0.7], metal);
  } else {
    if (id === "palmer") {
      mirror = new THREE.Group();
      mirror.name = "scan-optic-mirror";
      root.add(mirror);
      add(
        mirror,
        new THREE.CylinderGeometry(0.6, 0.6, 0.055, 48).rotateX(Math.PI / 2),
        mirrorSurface,
      );
      box(mirror, [0.12, 0.12, 0.02], [0.4, 0, 0.04], copper);
      cylinder(root, 0.065, 0.8, [0, 0, 0.5], copper);
      cylinder(root, 0.23, 0.35, [0, 0, 1.05], shell);
      emitter([0, 0, -0.8], [0, 0, 1]);
    } else if (id === "mems") {
      outer = new THREE.Group();
      inner = new THREE.Group();
      inner.name = "scan-optic-mirror";
      root.add(outer);
      outer.add(inner);
      for (const [group, size] of [
        [outer, 1.25],
        [inner, 0.9],
      ]) {
        for (const side of [-1, 1]) {
          box(group, [size, 0.055, 0.04], [0, (side * size) / 2, 0], copper);
          box(group, [0.055, size, 0.04], [(side * size) / 2, 0, 0], copper);
        }
      }
      box(inner, [0.7, 0.7, 0.035], [0, 0, 0], mirrorSurface);
      for (const side of [-1, 1]) {
        box(outer, [0.22, 0.035, 0.04], [side * 0.74, 0, 0], metal);
        box(inner, [0.035, 0.18, 0.04], [0, side * 0.53, 0], metal);
      }
      emitter([0, -1.6, 0], [0, 1, 0]);
    } else {
      mirror = new THREE.Group();
      mirror.name = "scan-optic-mirror";
      root.add(mirror);
      box(mirror, [1.0, 0.64, 0.04], [0, 0, 0], mirrorSurface);
      box(mirror, [1.03, 0.66, 0.04], [0, 0, 0.035], shell);
      const shaft = cylinder(root, 0.055, 1.7, [0, 0, 0], copper);
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), X);
      const motor = cylinder(root, 0.23, 0.5, [-0.95, 0, 0], shell);
      motor.quaternion.copy(shaft.quaternion);
      emitter([0, -1.4, 0], [0, 1, 0]);
    }
  }

  const segmentBuffer = (color, dashed = false) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(96), 3),
    );
    geometry.setDrawRange(0, 0);
    const material = dashed
      ? new THREE.LineDashedMaterial({
          color,
          dashSize: 0.06,
          gapSize: 0.045,
          transparent: true,
          opacity: 0.4,
        })
      : new THREE.LineBasicMaterial({ color });
    const line = new THREE.LineSegments(geometry, material);
    line.frustumCulled = false;
    root.add(line);
    return line;
  };
  const incident = segmentBuffer(0xf0bd64),
    outgoing = segmentBuffer(0x60d6e7),
    preview = segmentBuffer(0x60d6e7, true),
    normal = segmentBuffer(0xecf4f5);
  incident.name = "scan-optic-input";
  outgoing.name = "scan-optic-output";
  preview.name = "scan-optic-preview";
  const fill = (line, segments) => {
    const attribute = line.geometry.attributes.position;
    segments.forEach((p, i) => attribute.array.set(p, i * 3));
    attribute.needsUpdate = true;
    line.geometry.setDrawRange(0, segments.length);
    if (line.material.isLineDashedMaterial) line.computeLineDistances();
  };
  const grid = [];
  for (let i = -2; i <= 2; i++) {
    const v = i * 0.5;
    grid.push([-1.1, v, -1.9], [1.1, v, -1.9], [v, -1.1, -1.9], [v, 1.1, -1.9]);
  }
  const guide = segmentBuffer(0x334b57);
  fill(guide, grid);
  const update = (state, active, showPreview) => {
    const n = state.normal && new THREE.Vector3(...state.normal);
    if (id === "palmer") {
      mirror.quaternion
        .setFromAxisAngle(Z, state.psi)
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            (-10 * Math.PI) / 180,
          ),
        );
    } else if (mirror) mirror.quaternion.setFromUnitVectors(Z, n);
    if (outer) {
      outer.rotation.x = Math.atan2(-n.y, n.z);
      inner.rotation.y = Math.asin(n.x);
    }
    if (rotor) {
      rotor.rotation.x = state.rotorAngle;
      facets.forEach((facet, i) =>
        facet.material.color.set(i === state.facet ? 0x8be1eb : 0xcce9ef),
      );
    }
    prisms.forEach((prism, i) => {
      prism.rotation.z = -state.prisms[i];
    });
    if (head) head.rotation.z = state.psi;
    const origin = state.origin;
    const path = [];
    if (id === "risley") path.push([0, 0, 0.65], origin);
    for (const d of state.directions) {
      const length = (-1.9 - origin[2]) / d[2];
      path.push(
        origin,
        origin.map((v, i) => v + length * d[i]),
      );
    }
    const input =
      id === "multi"
        ? []
        : id === "risley"
          ? [
              [0, 0, 1.1],
              [0, 0, 0.65],
            ]
          : [
              id === "palmer"
                ? [0, 0, -0.58]
                : [0, id === "mems" ? -1.38 : -1.13, 0],
              origin,
            ];
    fill(incident, active ? input : []);
    fill(outgoing, active ? path : []);
    fill(preview, showPreview ? path : []);
    fill(
      normal,
      n
        ? [
            origin,
            origin.map(
              (v, i) => v + state.normal[i] * (id === "poly" ? -0.48 : 0.48),
            ),
          ]
        : [],
    );
  };
  return { root, update };
}
