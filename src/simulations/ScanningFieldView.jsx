import { useCallback, useMemo } from "react";
import * as THREE from "three";
import SurveyViewport from "./SurveyViewport.jsx";
import {
  terrain,
  siteDetails,
  surveyUas,
  box,
  trace,
  mesh,
} from "./survey-field-assets.js";
import { SURVEY_MOUNTS } from "./survey-mounts.js";
import {
  SCAN_BUILDINGS,
  SCAN_CANOPIES,
  SCAN_LINE,
  scanOrigin,
  scanDirections,
  scanIntersection,
  scanVisibleCount,
} from "./scanning-model.js";

export default function ScanningFieldView({
  settings,
  data,
  clock,
  pointColor,
  showBeam,
}) {
  const world = useCallback(() => {
    const g = new THREE.Group();
    terrain(g, () => 0);
    siteDetails(g, () => 0, { trees: false });
    if (settings.objects) {
      const wall = new THREE.MeshStandardMaterial({
        color: 0xbeb9a8,
        roughness: 0.9,
      });
      const roof = new THREE.MeshStandardMaterial({
        color: 0x606d6b,
        roughness: 0.7,
        metalness: 0.2,
      });
      const glass = new THREE.MeshStandardMaterial({
        color: 0x3b565d,
        roughness: 0.3,
        metalness: 0.2,
      });
      for (const b of SCAN_BUILDINGS) {
        box(
          g,
          [b.x1 - b.x0, b.y1 - b.y0, b.roofZ],
          [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.roofZ / 2],
          wall,
        );
        box(
          g,
          [b.x1 - b.x0, b.y1 - b.y0, 0.01],
          [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.roofZ],
          roof,
        );
        for (let x = b.x0 + 2; x < b.x1 - 1; x += 3)
          for (let z = 2; z < b.roofZ - 1; z += 3)
            box(g, [1.4, 0.01, 1.4], [x, b.y0 - 0.005, z], glass);
      }
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const c = canvas.getContext("2d");
      c.fillStyle = "#65754b";
      c.fillRect(0, 0, 128, 128);
      let seed = 71;
      for (let i = 0; i < 3500; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const x = seed % 128;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        c.fillStyle = i % 2 ? "#98a37b" : "#354d2b";
        c.fillRect(x, seed % 128, 2, 2);
      }
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const leaf = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 1,
      });
      for (const canopy of SCAN_CANOPIES) {
        const o = mesh(
          g,
          new THREE.SphereGeometry(1, 32, 20),
          leaf,
          canopy.center,
        );
        o.scale.set(...canopy.radii);
      }
    }
    return g;
  }, [settings.objects]);
  const overlay = useCallback(() => {
    const g = new THREE.Group(),
      uas = surveyUas();
    uas.name = "survey-aircraft";
    // Static site shadows are cached; do not bake a stationary aircraft shadow.
    uas.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
    uas.position.set(
      SCAN_LINE[0],
      0,
      settings.height - SURVEY_MOUNTS.scanner[2],
    );
    g.add(uas);
    const positions = new Float32Array(data.records.length * 3),
      colors = new Float32Array(positions.length),
      color = new THREE.Color();
    data.records.forEach((r, i) => {
      // Move only the glyph slightly toward the scanner so wall hits, as well
      // as roof/ground hits, remain visible without changing measured XYZ.
      positions.set(
        r.position.map((v, j) => v - 0.025 * r.direction[j]),
        i * 3,
      );
      if (pointColor === "height")
        color.setHSL(0.58 - Math.min(1, r.position[2] / 18) * 0.52, 0.85, 0.53);
      else
        color.setHSL(0.55 - (r.t / data.reference.duration) * 0.48, 0.9, 0.54);
      colors.set([color.r, color.g, color.b], i * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setDrawRange(0, 0);
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        vertexColors: true,
        size: 2.7,
        sizeAttenuation: false,
        depthTest: true,
      }),
    );
    points.name = "acquired-returns";
    g.add(points);
    const rayGeometry = new THREE.BufferGeometry();
    rayGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(48), 3),
    );
    rayGeometry.setDrawRange(0, 0);
    const rays = new THREE.LineSegments(
      rayGeometry,
      new THREE.LineBasicMaterial({
        color: 0xf1b65f,
        transparent: true,
        opacity: 0.8,
      }),
    );
    rays.name = "sampled-ray-guides";
    rays.frustumCulled = false;
    g.add(rays);
    trace(
      g,
      [
        [SCAN_LINE[0], 0, 0.04],
        [SCAN_LINE[1], 0, 0.04],
      ],
      0xeff2df,
      0.55,
    );
    return g;
  }, [data, settings.height, pointColor]);
  const onFrame = useCallback(
    (ctx) => {
      const t = clock.current.time,
        root = ctx.analytical,
        uas = root.getObjectByName("survey-aircraft"),
        points = root.getObjectByName("acquired-returns"),
        rays = root.getObjectByName("sampled-ray-guides");
      if (!uas || !points || !rays) return;
      const x = SCAN_LINE[0] + settings.speed * t,
        dx = x - uas.position.x;
      // Only the payload inspection view follows the moving aircraft.
      if (ctx.viewIndex === 1) {
        const follow =
          uas.userData.followRevision === ctx.viewRevision
            ? dx
            : x - SCAN_LINE[0];
        ctx.camera.position.x += follow;
        ctx.controls.target.x += follow;
        uas.userData.followRevision = ctx.viewRevision;
      }
      uas.position.x = x;
      uas.traverse((o) => {
        if (o.userData.rotor) o.rotation.z = t * 200;
      });
      points.geometry.setDrawRange(0, scanVisibleCount(data.records, t));
      const positions = rays.geometry.attributes.position;
      let count = 0;
      if (showBeam && t > 0) {
        const origin = scanOrigin(t, settings);
        for (const direction of scanDirections(settings.mechanism, t)) {
          const hit = scanIntersection(origin, direction, settings);
          if (!hit) continue;
          positions.setXYZ(count++, ...origin);
          positions.setXYZ(count++, ...hit.position);
        }
      }
      positions.needsUpdate = true;
      rays.geometry.setDrawRange(0, count);
    },
    [clock, data, settings, showBeam],
  );
  const views = useMemo(
    () => [
      {
        name: "Survey overview",
        position: [180, -210, 180],
        target: [0, 0, 30],
      },
      {
        name: "Payload",
        position: [SCAN_LINE[0] + 4.2, -5.3, settings.height + 1.4],
        target: [SCAN_LINE[0], 0, settings.height + 0.1],
      },
      { name: "Point pattern", position: [0, -0.1, 260], target: [0, 0, 0] },
      { name: "Ground returns", position: [20, -58, 25], target: [0, -10, 2] },
    ],
    [settings.height],
  );
  return (
    <SurveyViewport
      world={world}
      overlay={overlay}
      views={views}
      onFrame={onFrame}
      fitAspect={1.25}
      badge="SCAN ACQUISITION · WORLD METRES"
      label="Orbitable 3D survey with a moving aircraft, downward scanner rays, occluding roofs and canopies, and time-ordered first-surface returns"
    />
  );
}
