import { useCallback, useMemo, useState } from "react";
import * as THREE from "three";
import SurveyViewport from "./SurveyViewport.jsx";
import {
  terrain,
  siteDetails,
  building,
  surveyUas,
  trace,
  checkerTarget,
} from "./survey-field-assets.js";
import { groundPixelRay, imageFootprint } from "./gsd-model.js";

export default function GsdFieldView({
  camera,
  footprint,
  targetSize,
  pattern,
  phase = 0,
}) {
  const [guides, setGuides] = useState(false),
    gradient = Math.tan((camera.slope * Math.PI) / 180);
  const world = useCallback(() => {
    const g = new THREE.Group(),
      h = (x) => camera.elevation + gradient * x;
    terrain(g, h);
    siteDetails(g, h);
    building(g, {
      x0: 105,
      x1: 123,
      y0: 25,
      y1: 46,
      baseZ: h(114),
      roofZ: h(114) + 6,
    });
    return g;
  }, [camera.elevation, gradient]);
  const overlay = useCallback(() => {
    const g = new THREE.Group(),
      uas = surveyUas({
        camera: true,
        scanner: [0, 0, -0.8],
        tilt: camera.tilt,
      });
    uas.position.set(0, 0, camera.height + 0.8);
    g.add(uas);
    const corners = imageFootprint(camera);
    if (corners) {
      trace(
        g,
        [...corners, corners[0]].map((p) => [p[0], p[1], p[2] + 0.035]),
        0xe9dfb6,
        0.8,
      );
    }
    if (footprint) {
      const center = [
        footprint.center[0] +
          phase * footprint.gx * Math.cos((camera.slope * Math.PI) / 180),
        footprint.center[1],
        0,
      ];
      center[2] = camera.elevation + gradient * center[0];
      checkerTarget(g, center, targetSize, gradient, pattern);
      if (guides) {
        trace(g, [[0, 0, camera.height], footprint.center], 0xe1c787, 0.8);
        for (let row = 0; row <= 7; row++) {
          const a = groundPixelRay(camera, 0, (row / 7) * camera.imageHeight),
            b = groundPixelRay(
              camera,
              camera.width,
              (row / 7) * camera.imageHeight,
            );
          if (a && b && Math.hypot(...a) < 1500 && Math.hypot(...b) < 1500)
            trace(
              g,
              [a, b].map((p) => [p[0], p[1], p[2] + 0.045]),
              0xe1e3c8,
              0.35,
            );
        }
        for (let col = 0; col <= 9; col++) {
          const a = groundPixelRay(camera, (col / 9) * camera.width, 0),
            b = groundPixelRay(
              camera,
              (col / 9) * camera.width,
              camera.imageHeight,
            );
          if (a && b && Math.hypot(...a) < 1500 && Math.hypot(...b) < 1500)
            trace(
              g,
              [a, b].map((p) => [p[0], p[1], p[2] + 0.045]),
              0xe1e3c8,
              0.35,
            );
        }
      }
    }
    return g;
  }, [camera, footprint, targetSize, pattern, phase, guides, gradient]);
  const views = useMemo(() => {
    const p = footprint?.center || [20, 0, camera.elevation],
      s = Math.max(targetSize * 2.4, 0.7);
    return [
      {
        name: "Camera payload",
        position: [4.7, -5.2, camera.height + 2.2],
        target: [0, 0, camera.height + 0.5],
      },
      {
        name: "Survey context",
        position: [145, -165, camera.height + 65],
        target: [25, 0, camera.elevation + 28],
      },
      {
        name: "Lens",
        position: [0.5, -0.6, camera.height - 0.3],
        target: [0, 0, camera.height + 0.035],
      },
      {
        name: "Ground target",
        position: [p[0] + s, p[1] - s, p[2] + s * 1.1],
        target: p,
      },
    ];
  }, [camera.height, camera.elevation, footprint, targetSize]);
  return (
    <>
      <div className="field-modebar">
        <span className="field-caption">
          {camera.width.toLocaleString()} ×{" "}
          {camera.imageHeight.toLocaleString()} photosites · {camera.f} mm lens
        </span>
        <label>
          <input
            type="checkbox"
            checked={guides}
            onChange={(e) => setGuides(e.target.checked)}
          />
          Sampling guides
        </label>
      </div>
      <SurveyViewport
        world={world}
        overlay={overlay}
        views={views}
        badge="AERIAL CAMERA · PHYSICAL SCALE"
        label="Survey camera over textured terrain. Image boundary and a physically scaled checker target. Camera payload and ground-target close-ups are available."
      />
      <p className="field-caption">
        The thin boundary is the full image footprint. The{" "}
        {targetSize.toFixed(2)} m target and camera are at physical scale.{" "}
        {guides
          ? "The 9 × 7 guide cells group many pixels; the gold line traces the selected native pixel."
          : "Turn on sampling guides to inspect the selected native-pixel ray."}{" "}
        Synthetic site texture is context; the native-pixel crop below models
        the target numerically.
      </p>
    </>
  );
}
