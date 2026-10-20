import { useCallback, useMemo, useState } from "react";
import * as THREE from "three";
import SurveyViewport from "./SurveyViewport.jsx";
import {
  terrain,
  building,
  siteDetails,
  surveyUas,
  trace,
  box,
} from "./survey-field-assets.js";
import {
  rotateBody,
  scannerDirection,
  directGeoreference,
} from "./georeferencing-model.js";
import { caption } from "./PhotoLabScene.jsx";

function orient(o, attitude) {
  o.setRotationFromMatrix(
    new THREE.Matrix4().makeBasis(
      ...[
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ].map((v) => new THREE.Vector3(...rotateBody(v, attitude))),
    ),
  );
}
export default function SurveyFlightView({
  arms,
  attitude,
  boresight,
  height = 100,
  slope = 0,
  shot: surveyShot,
  scanAngle = 0,
  inspection = false,
  teaching = false,
  lessonStage = "combined",
  onSelect,
  showArms = true,
  showLaser = true,
  showGhost = false,
}) {
  const [guides, setGuides] = useState(inspection || teaching),
    h = height;
  const shot =
    inspection && surveyShot === undefined
      ? directGeoreference({
          height: h,
          antennaArm: arms.gps,
          scannerArm: arms.scanner,
          attitude,
          boresight,
          scanAngle,
          useBore: false,
        })
      : surveyShot;
  const world = useCallback(() => {
    const g = new THREE.Group(),
      z = (x) => Math.tan((slope * Math.PI) / 180) * x;
    terrain(g, z);
    siteDetails(g, z);
    building(g, {
      x0: 105,
      x1: 123,
      y0: 25,
      y1: 46,
      baseZ: z(114),
      roofZ: z(114) + 6,
    });
    if (inspection)
      box(
        g,
        [6, 5, 0.08],
        [0, 0, 0.04],
        new THREE.MeshStandardMaterial({ color: 0x96978a, roughness: 1 }),
      );
    return g;
  }, [slope, inspection]);
  const overlay = useCallback(() => {
    const g = new THREE.Group(),
      uas = surveyUas({ ...arms, boresight });
    orient(uas, attitude);
    uas.position.z = h;
    g.add(uas);
    const p = (v) =>
      rotateBody(v, attitude).map((x, i) => x + (i === 2 ? h : 0));
    if (guides && showArms)
      trace(g, [p(arms.gps), p(arms.scanner)], 0xe1bc78, 0.8);
    if (teaching) {
      const antenna = p(arms.gps),
        origin = p(arms.scanner);
      caption(
        g,
        "GNSS antenna",
        antenna.map((v, i) => v + (i === 2 ? 0.4 : 0)),
        "#f1db9e",
        0.36,
      );
      caption(g, "IMU / body origin", [0, 0, h + 0.85], "#f1ddd0", 0.34);
      caption(
        g,
        "LiDAR origin",
        origin.map((v, i) => v + (i === 2 ? -0.32 : 0)),
        "#c1e6e3",
        0.34,
      );
      const lever = arms.scanner.map((v, i) => v - arms.gps[i]);
      const a = new THREE.ArrowHelper(
        new THREE.Vector3(...origin)
          .sub(new THREE.Vector3(...antenna))
          .normalize(),
        new THREE.Vector3(...antenna),
        Math.hypot(...lever),
        0xe1bc78,
        0.3,
        0.075,
      );
      g.add(a);
      caption(
        g,
        "ℓ = " + Math.hypot(...lever).toFixed(3) + " m",
        antenna.map((v, i) => (v + origin[i]) / 2 + (i === 1 ? 0.23 : 0)),
        "#f1db9e",
        0.3,
      );
      for (let i = 0; i < 3; i++) {
        const v = [0, 0, 0];
        v[i] = i === 0 ? 1 : -1;
        const body = rotateBody(v, attitude),
          sensor = rotateBody(rotateBody(v, boresight), attitude);
        const bt = body.map((v, j) => v * 1.15 + (j === 2 ? h : 0)),
          st = sensor.map((v, j) => v * 0.8 + origin[j]);
        trace(g, [[0, 0, h], bt], [0xcf8f7b, 0x99b784, 0x9eb3d0][i], 0.95);
        if (lessonStage !== "lever" && lessonStage !== "attitude")
          trace(g, [origin, st], 0x47b9be, 0.95);
        caption(g, ["Xb", "Yb", "Zb"][i], bt, "#f5dec9", 0.28);
        if (lessonStage !== "lever" && lessonStage !== "attitude")
          caption(g, ["Xs", "Ys", "Zs"][i], st, "#a9eeee", 0.28);
        if (lessonStage === "attitude") {
          const world = [0, 0, h];
          world[i] += (i === 0 ? 1 : -1) * 1.65;
          trace(g, [[0, 0, h], world], 0xb8bdba, 0.7);
          caption(g, ["N", "E", "Down"][i], world, "#edf0e8", 0.28);
        }
      }
      const nominal = new THREE.Vector3(
          ...scannerDirection(attitude, [0, 0, 0], scanAngle),
        ),
        actual = new THREE.Vector3(
          ...scannerDirection(attitude, boresight, scanAngle),
        ),
        angle = nominal.angleTo(actual),
        axis = new THREE.Vector3().crossVectors(nominal, actual).normalize();
      trace(
        g,
        [
          origin,
          nominal
            .clone()
            .multiplyScalar(1.6)
            .add(new THREE.Vector3(...origin))
            .toArray(),
        ],
        0xaab8be,
        0.8,
      );
      trace(
        g,
        [
          origin,
          actual
            .clone()
            .multiplyScalar(1.6)
            .add(new THREE.Vector3(...origin))
            .toArray(),
        ],
        0xf1c083,
        0.95,
      );
      if (angle > 1e-7) {
        const arc = Array.from({ length: 33 }, (_, i) =>
          nominal
            .clone()
            .applyAxisAngle(axis, (angle * i) / 32)
            .multiplyScalar(1.05)
            .add(new THREE.Vector3(...origin))
            .toArray(),
        );
        trace(g, arc, 0xffdb8e, 1);
      }
      caption(
        g,
        "βbeam = " + ((angle * 180) / Math.PI).toFixed(2) + "°",
        actual
          .clone()
          .multiplyScalar(1.25)
          .add(new THREE.Vector3(...origin))
          .toArray(),
        "#ffe0a4",
        0.32,
      );
    }
    if (inspection && showGhost) {
      for (const [v, color] of [
        [[1, 0, 0], 0xd59882],
        [[0, 1, 0], 0xa4c397],
        [[0, 0, 1], 0x99bacd],
      ])
        trace(g, [[0, 0, h], p(v)], color, 0.65);
    }
    if (!inspection && shot && guides) {
      trace(g, [shot.origin, shot.actual], 0xe4c18d, 0.65);
      trace(g, [shot.reconstructedOrigin, shot.estimated], 0xb17460, 0.65);
      const a = new THREE.Mesh(
        new THREE.RingGeometry(0.18, 0.25, 24),
        new THREE.MeshBasicMaterial({
          color: 0xe7dcc1,
          side: THREE.DoubleSide,
        }),
      );
      a.position.set(...shot.actual);
      a.position.z += 0.02;
      a.rotation.y = (-slope * Math.PI) / 180;
      g.add(a);
    }
    if (inspection && showLaser && shot) {
      trace(g, [shot.origin, shot.actual], 0xd8ad7a, 0.7);
      trace(g, [shot.reconstructedOrigin, shot.estimated], 0xb17460, 0.7);
    }
    return g;
  }, [
    arms,
    attitude,
    boresight,
    h,
    shot,
    guides,
    inspection,
    showArms,
    showLaser,
    showGhost,
    slope,
    teaching,
    lessonStage,
  ]);
  const views = useMemo(
    () =>
      inspection
        ? [
            {
              name: "Payload assembly",
              position: [4.6, -5.3, h + 1.4],
              target: [0, 0, h - 0.05],
            },
            {
              name: "Mounts",
              position: [1.9, -2.1, h - 0.8],
              target: [0.25, 0, h - 0.3],
            },
            { name: "Above", position: [4, 3, h + 4.3], target: [0, 0, h] },
          ]
        : [
            {
              name: "Payload",
              position: teaching ? [4.3, -5.3, h + 1.9] : [4.6, -5.3, h + 2],
              target: [0, 0, h - 0.1],
            },
            {
              name: "Survey context",
              position: [150, -175, h + 35],
              target: [18, 0, h * 0.38],
            },
            {
              name: "Ground",
              position: [85, -85, 20],
              target: shot?.actual || [0, 0, 0],
            },
          ],
    [h, inspection, shot, teaching],
  );
  return (
    <>
      <div className="field-modebar">
        <span className="field-caption">
          {inspection
            ? "Representative survey UAS · GNSS radome / IMU / laser payload"
            : teaching
              ? "Labelled sensor frames · same observation as the ground map"
              : "Direct georeferencing · physical aircraft and ground dimensions"}
        </span>
        <label>
          <input
            type="checkbox"
            checked={guides}
            onChange={(e) => setGuides(e.target.checked)}
          />
          {inspection
            ? "Mount vector"
            : teaching
              ? "Full-range ray overlays"
              : "Measured & reconstructed rays"}
        </label>
      </div>
      <SurveyViewport
        fitAspect={teaching ? 1.3 : 0}
        world={world}
        overlay={overlay}
        views={views}
        onSelect={onSelect}
        label={
          inspection
            ? "Detailed survey multirotor with selectable GNSS antenna and LiDAR payload at their numerical mount positions."
            : "Survey multirotor above a textured field with optional actual-scale measured and reconstructed laser rays."
        }
        badge={
          inspection ? "PAYLOAD INSPECTION · METRES" : "SURVEY FLIGHT · METRES"
        }
      />
      <p className="field-caption">
        {inspection
          ? "Select the GNSS radome or scanner to edit its mounting position. Motors and scanner remain still; the displayed attitude comes from the controls."
          : "Paused survey instant. The aircraft is small at real survey height—use Payload to inspect it. Laser traces are analytical guides, not visible light in clear air. Endpoint errors are not exaggerated here."}
      </p>
    </>
  );
}
