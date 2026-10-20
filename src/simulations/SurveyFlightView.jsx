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
import { rotateBody, directGeoreference } from "./georeferencing-model.js";

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
  onSelect,
  showArms = true,
  showLaser = true,
  showGhost = false,
}) {
  const [guides, setGuides] = useState(inspection),
    h = height;
  const shot = inspection
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
              position: [4.6, -5.3, h + 2],
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
    [h, inspection, shot],
  );
  return (
    <>
      <div className="field-modebar">
        <span className="field-caption">
          {inspection
            ? "Representative survey UAS · GNSS radome / IMU / laser payload"
            : "Direct georeferencing · physical aircraft and ground dimensions"}
        </span>
        <label>
          <input
            type="checkbox"
            checked={guides}
            onChange={(e) => setGuides(e.target.checked)}
          />
          {inspection ? "Mount vector" : "Measured & reconstructed rays"}
        </label>
      </div>
      <SurveyViewport
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
