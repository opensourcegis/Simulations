import { useState } from "react";
import SurveyFlightView from "./SurveyFlightView.jsx";
import GroundPointComparison from "./GroundPointComparison.jsx";
import { BORESIGHT_STAGES } from "./boresight-lesson.js";
import { errorContributions } from "./georeferencing-model.js";
import "./survey-realism.css";
import Disclosure from "./Disclosure.jsx";

export default function GeoreferencingExperiment({
  settings: s,
  onChange: change,
  stage,
  onPreset,
  shot,
}) {
  const [reveal, setReveal] = useState(false),
    lesson = BORESIGHT_STAGES.find((l) => l.id === stage),
    lever = s.scannerArm.map((v, i) => v - s.antennaArm[i]);
  const vector = (field, i, value) =>
    change({ [field]: s[field].map((v, j) => (j === i ? value : v)) });
  const slider = (id, label, value, min, max, step, onChange, unit) => (
    <label key={id}>
      {label}
      <b>
        {Number(value.toFixed(3))} {unit}
      </b>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
  return (
    <section className="sim-panel teaching-lab">
      <nav
        className="teaching-stages"
        aria-label="Georeferencing teaching stages"
      >
        {BORESIGHT_STAGES.map((l) => (
          <button
            id={"geo-stage-" + l.id}
            key={l.id}
            aria-pressed={stage === l.id}
            onClick={() => {
              setReveal(false);
              onPreset(l.id);
            }}
          >
            {l.title}
          </button>
        ))}
      </nav>
      <div className="teaching-objective">
        <h2 id="geo-objective">{lesson.objective}</h2>
        <button className="bs-btn" onClick={() => setReveal(!reveal)}>
          {reveal ? "Hide lesson" : "Predict & explain"}
        </button>
        {reveal && (
          <div>
            <p id="geo-prediction">Predict: {lesson.predict}</p>
            <p>{lesson.explain}</p>
          </div>
        )}
      </div>
      <details className="teaching-definition" key={stage}>
        <summary>
          {stage === "lever"
            ? "Lever arm ℓ = scanner offset − antenna offset"
            : stage === "boresight"
              ? "Boresight = fixed scanner-to-IMU rotation"
              : stage === "attitude"
                ? "Attitude = changing body-to-map rotation"
                : "Point = antenna position + Rattitude [ℓ + Rboresight (ρ × ray)]"}
        </summary>
        <p>
          {stage === "lever"
            ? "Mount-input ℓ (forward/left/up) = [" +
              lever.map((v) => v.toFixed(2)).join(", ") +
              "] m; length " +
              Math.hypot(...lever).toFixed(3) +
              " m. In the drawn forward/right/down axes, ℓb = [" +
              lever.map((v, i) => (i === 0 ? v : -v).toFixed(2)).join(", ") +
              "] m. The GNSS antenna is not the laser origin."
            : stage === "boresight"
              ? "The scanner frame and body frame are different. True mounting angles orient the physical instrument; the correction controls only reconstruction."
              : "Each measurement is reconstructed with the same recorded range. Applying a correction does not move the real aircraft, scanner or ground hit."}
        </p>
      </details>
      <div className="teaching-corrections">
        {[
          ["geo-use-lever", "Apply lever-arm translation", "useLever"],
          ["geo-use-bore", "Apply boresight rotation", "useBore"],
          ["geo-use-attitude", "Apply measured attitude", "useAttitude"],
        ].map(([id, label, key]) => (
          <label key={id}>
            <input
              id={id}
              type="checkbox"
              checked={s[key]}
              onChange={(e) => change({ [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
        <button
          id="geo-perfect"
          className="bs-btn"
          onClick={() =>
            change({
              latencyMs: 0,
              leverError: [0, 0, 0],
              boreError: [0, 0, 0],
              rangeBias: 0,
              useLever: true,
              useBore: true,
              useAttitude: true,
            })
          }
        >
          Apply all exact corrections
        </button>
      </div>
      <div className="teaching-geometry">
        <div>
          <SurveyFlightView
            teaching
            lessonStage={stage}
            arms={{ gps: s.antennaArm, scanner: s.scannerArm }}
            attitude={s.attitude}
            boresight={s.boresight}
            height={s.height}
            slope={s.slope}
            scanAngle={s.scanAngle}
            shot={shot}
          />
          <details className="field-caption">
            <summary>How to read this view</summary>
            <p>
              <strong>
                GNSS receives satellite signals; it does not emit the LiDAR
                beam.
              </strong>{" "}
              The dashed gold arrow is the mathematical antenna → scanner lever
              arm, not a wire. Long calculated rays are off by default; if
              enabled, red is the reconstructed hypothesis and can start at the
              antenna when the lever arm is omitted. Optional body axes:
              Xb/Yb/Zb (forward/right/down); cyan: corresponding scanner axes
              Xs/Ys/Zs. β is ray-direction separation, not the magnitude of an
              Euler-angle triple. No geometric exaggeration.
            </p>
          </details>
        </div>
        <GroundPointComparison shot={shot} />
      </div>
      <div className="readouts teaching-readouts">
        <div>
          <span>Total 3D reconstruction error</span>
          <b id="geo-total">
            {shot ? (shot.total * 100).toFixed(2) + " cm" : "no forward hit"}
          </b>
        </div>
        <div>
          <span>Horizontal reconstruction error</span>
          <b id="geo-horizontal">
            {shot
              ? (shot.horizontal * 100).toFixed(2) + " cm"
              : "no forward hit"}
          </b>
        </div>
        <div>
          <span>Signed height error</span>
          <b id="geo-vertical">
            {shot ? (shot.vertical * 100).toFixed(2) + " cm" : "—"}
          </b>
        </div>
        <div>
          <span>Same recorded slant range</span>
          <b id="geo-range-value">
            {shot ? shot.range.toFixed(3) + " m" : "—"}
          </b>
        </div>
      </div>
      <div className="teaching-controls">
        <section>
          <h3>Physical survey setup</h3>
          <p>
            These change the true aircraft, scanner or surface. Corrections
            above leave the true setup unchanged.
          </p>
          <div className="control-grid realism-controls">
            {slider(
              "geo-height",
              "IMU height above datum",
              s.height,
              30,
              250,
              5,
              (v) => change({ height: v }),
              "m",
            )}
            {slider(
              "geo-scan",
              "Scanner angle (cross-track)",
              s.scanAngle,
              -40,
              40,
              1,
              (v) => change({ scanAngle: v }),
              "°",
            )}
            {slider(
              "geo-slope",
              "Terrain slope along north",
              s.slope,
              -20,
              20,
              1,
              (v) => change({ slope: v }),
              "°",
            )}
          </div>
          <Disclosure title="Body attitude & scanner mounting">
            <div className="control-grid realism-controls">
              {["roll", "pitch", "yaw"].map((name, i) =>
                slider(
                  "geo-att-" + i,
                  "Measured body " + name,
                  s.attitude[i],
                  -30,
                  30,
                  1,
                  (v) => vector("attitude", i, v),
                  "°",
                ),
              )}
              {["roll", "pitch", "yaw"].map((name, i) =>
                slider(
                  "geo-mount-" + i,
                  "True scanner-to-body " + name,
                  s.boresight[i],
                  -15,
                  15,
                  0.5,
                  (v) => vector("boresight", i, v),
                  "°",
                ),
              )}
            </div>
          </Disclosure>
          <details>
            <summary>Edit mounting positions from the IMU</summary>
            <p>
              X forward / Y left / Z up, in metres. Their difference is the
              antenna-to-scanner lever arm.
            </p>
            <div className="control-grid realism-controls">
              {["antennaArm", "scannerArm"].flatMap((field) =>
                ["X", "Y", "Z"].map((axis, i) =>
                  slider(
                    "geo-" + field + "-" + i,
                    (field === "antennaArm" ? "Antenna " : "Scanner ") + axis,
                    s[field][i],
                    -4,
                    4,
                    0.05,
                    (v) => vector(field, i, v),
                    "m",
                  ),
                ),
              )}
            </div>
          </details>
        </section>
        <section>
          <h3>Isolate a concept</h3>
          <p>
            Every preset resets timing and residual errors, so its prediction
            matches every view.
          </p>
          <div className="teaching-actions">
            {[
              ["zero", "Zero boresight · tilted body"],
              ["yaw-nadir", "10° yaw · nadir"],
              ["yaw-scan", "10° yaw · off-nadir"],
            ].map(([id, title]) => (
              <button
                id={"geo-preset-" + id}
                className="bs-btn"
                key={id}
                onClick={() => {
                  setReveal(false);
                  onPreset(id);
                }}
              >
                {title}
              </button>
            ))}
          </div>
          <details className="teaching-advanced">
            <summary>
              Advanced: calibration residuals, timing and range bias
            </summary>
            <p>
              Zero by default in each lesson. These change assumed
              reconstruction values, not physical mounting. Use one at a time.
            </p>
            <div className="control-grid realism-controls">
              {slider(
                "geo-lever",
                "Forward lever residual",
                s.leverError[0] * 100,
                -10,
                10,
                0.5,
                (v) => change({ leverError: [v / 100, 0, 0] }),
                "cm",
              )}
              {slider(
                "geo-bore",
                "Roll boresight residual",
                s.boreError[0],
                -0.2,
                0.2,
                0.005,
                (v) => change({ boreError: [v, 0, 0] }),
                "°",
              )}
              {slider(
                "geo-latency",
                "Navigation timestamp offset",
                s.latencyMs,
                -20,
                20,
                0.5,
                (v) => change({ latencyMs: v }),
                "ms",
              )}
              {slider(
                "geo-speed",
                "Platform speed",
                s.speed,
                0,
                80,
                1,
                (v) => change({ speed: v }),
                "m/s",
              )}
              {slider(
                "geo-rate",
                "Roll rate during offset",
                s.angularRate[0],
                -15,
                15,
                0.5,
                (v) => change({ angularRate: [v, 0, 0] }),
                "°/s",
              )}
              {slider(
                "geo-range",
                "Range bias",
                s.rangeBias * 100,
                -10,
                10,
                0.5,
                (v) => change({ rangeBias: v / 100 }),
                "cm",
              )}
            </div>
            <div className="realism-contributions">
              {errorContributions(s).map(([name, result]) => (
                <div key={name}>
                  <span>{name} only</span>
                  <b>
                    {result
                      ? (result.total * 100).toFixed(2) + " cm"
                      : "no hit"}
                  </b>
                </div>
              ))}
            </div>
          </details>
          <p className="teaching-limit">
            Local north/west/up mapping frame; mounts use forward/left/up.
            Attitude and boresight follow right-handed NED Rz Ry Rx. The field
            plane and representative equipment are synthetic. This is forward
            georeferencing, not an estimated calibration solution. GNSS noise,
            flexure, Earth curvature and antenna phase-centre variation are
            omitted.
          </p>
        </section>
      </div>
    </section>
  );
}
