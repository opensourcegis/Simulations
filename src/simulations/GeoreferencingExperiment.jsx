import { useState } from "react";
import SurveyFlightView from "./SurveyFlightView.jsx";
import {
  directGeoreference,
  errorContributions,
  opposingSwaths,
} from "./georeferencing-model.js";
import "./survey-realism.css";

export default function GeoreferencingExperiment({
  arms,
  attitude,
  boresight,
}) {
  const [height, setHeight] = useState(100),
    [latencyMs, setLatency] = useState(5),
    [speed, setSpeed] = useState(45),
    [rate, setRate] = useState(2),
    [slope, setSlope] = useState(0),
    [scanAngle, setScan] = useState(25),
    [leverCm, setLever] = useState(2),
    [boreDeg, setBore] = useState(0.05),
    [rangeCm, setRange] = useState(2),
    [useLever, setUseLever] = useState(true),
    [useBore, setUseBore] = useState(true);
  const settings = {
    height,
    antennaArm: arms.gps,
    scannerArm: arms.scanner,
    attitude,
    boresight,
    scanAngle,
    slope,
    speed,
    latencyMs,
    angularRate: [rate, 0, 0],
    leverError: [leverCm / 100, 0, 0],
    boreError: [boreDeg, 0, 0],
    rangeBias: rangeCm / 100,
    useLever,
    useBore,
  };
  const shot = directGeoreference(settings),
    parts = errorContributions(settings),
    swaths = opposingSwaths(settings),
    exaggeration = 10;
  const extents = swaths.flatMap((s) => [
      s.actual,
      s.actual.map((x, j) => x + s.error[j] * exaggeration),
    ]),
    extent =
      Math.max(
        50,
        ...extents.map((p) => Math.max(Math.abs(p[0]), Math.abs(p[1]))),
      ) + 10;
  const X = (x) => 350 + (x / extent) * 290,
    Y = (y) => 200 - (y / extent) * 160;
  const sliders = [
    ["geo-height", "Survey flying height", height, 30, 250, 5, setHeight, "m"],
    ["geo-speed", "Platform speed", speed, 0, 80, 1, setSpeed, "m/s"],
    [
      "geo-latency",
      "Navigation timestamp offset",
      latencyMs,
      -20,
      20,
      0.5,
      setLatency,
      "ms",
    ],
    ["geo-rate", "Roll rate during offset", rate, -15, 15, 0.5, setRate, "°/s"],
    ["geo-slope", "Ground slope along north", slope, -20, 20, 1, setSlope, "°"],
    ["geo-scan", "Scanner angle", scanAngle, -40, 40, 1, setScan, "°"],
    [
      "geo-lever",
      "Forward lever-arm residual",
      leverCm,
      -10,
      10,
      0.5,
      setLever,
      "cm",
    ],
    [
      "geo-bore",
      "Roll boresight residual",
      boreDeg,
      -0.2,
      0.2,
      0.005,
      setBore,
      "°",
    ],
    ["geo-range", "Range bias", rangeCm, -10, 10, 0.5, setRange, "cm"],
  ];
  return (
    <section className="sim-panel realism-experiment">
      <div className="realism-heading">
        <div>
          <span className="realism-eyebrow">SURVEY-SCALE EXPERIMENT</span>
          <h2>One laser range. Several ways to misplace it.</h2>
        </div>
        <span>Truth and reconstruction use the same pulse</span>
      </div>
      <SurveyFlightView
        arms={arms}
        attitude={attitude}
        boresight={boresight}
        height={height}
        slope={slope}
        shot={shot}
      />
      <div className="realism-workspace">
        <div>
          <div className="control-grid realism-controls">
            {sliders.map(([id, label, value, min, max, step, set, unit]) => (
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
                  onChange={(e) => set(+e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="realism-actions">
            <label>
              <input
                id="geo-use-lever"
                type="checkbox"
                checked={useLever}
                onChange={(e) => setUseLever(e.target.checked)}
              />
              Apply antenna → scanner lever arm
            </label>
            <label>
              <input
                id="geo-use-bore"
                type="checkbox"
                checked={useBore}
                onChange={(e) => setUseBore(e.target.checked)}
              />
              Apply scanner → body boresight
            </label>
            <button
              id="geo-perfect"
              onClick={() => {
                setLatency(0);
                setLever(0);
                setBore(0);
                setRange(0);
                setUseLever(true);
                setUseBore(true);
              }}
            >
              Perfect synchronization & calibration
            </button>
          </div>
        </div>
        <div>
          <details className="field-analysis">
            <summary>Inspect opposing-strip residuals · vectors ×10</summary>
            <svg
              className="realism-map"
              viewBox="0 0 700 400"
              role="img"
              aria-label="Opposing flight-strip ground points. True positions are hollow, erroneous positions filled; error vectors are exaggerated ten times for inspection."
            >
              <rect width="700" height="400" fill="#0d1c27" />
              {[-2, -1, 0, 1, 2].map((i) => (
                <g key={i} stroke="#25414c">
                  <path d={`M${350 + i * 100} 25V375M35 ${200 + i * 65}H665`} />
                </g>
              ))}
              <text x="30" y="25" fill="#b4cbd2" fontSize="12">
                LOCAL GROUND PLAN · N ↑ / W →
              </text>
              {swaths.map((s, i) => {
                const [n, w] = s.actual,
                  dx = s.error[0] * exaggeration,
                  dy = s.error[1] * exaggeration,
                  color = s.heading === 0 ? "#79d9d4" : "#ffbd76";
                return (
                  <g key={i}>
                    <circle
                      cx={X(w)}
                      cy={Y(n)}
                      r="4"
                      fill="none"
                      stroke={color}
                    />
                    <path
                      d={`M${X(w)} ${Y(n)}L${X(w + dy)} ${Y(n + dx)}`}
                      stroke={color}
                    />
                    <circle
                      cx={X(w + dy)}
                      cy={Y(n + dx)}
                      r="2.4"
                      fill={color}
                    />
                  </g>
                );
              })}
              <text x="30" y="377" fill="#b4cbd2" fontSize="11">
                Cyan: heading 0° · orange: heading 180° · residual vectors ×10
              </text>
            </svg>
          </details>
          <div className="readouts realism-readouts">
            <div>
              <span>Combined horizontal error</span>
              <b id="geo-horizontal">
                {shot
                  ? (shot.horizontal * 100).toFixed(2) + " cm"
                  : "no forward hit"}
              </b>
            </div>
            <div>
              <span>Signed vertical error</span>
              <b id="geo-vertical">
                {shot ? (shot.vertical * 100).toFixed(2) + " cm" : "—"}
              </b>
            </div>
            <div>
              <span>Recorded slant range</span>
              <b>{shot ? shot.range.toFixed(3) + " m" : "—"}</b>
            </div>
          </div>
          <div className="realism-contributions">
            {parts.map(([name, result]) => (
              <div key={name}>
                <span>{name} only</span>
                <b>
                  {result ? (result.total * 100).toFixed(2) + " cm" : "no hit"}
                </b>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="realism-note">
        The antenna position, body-frame mount translation and measured ray are
        composed in one declared frame. Timestamp error samples a linearly
        moving trajectory and a local Euler-angle-rate approximation; both GNSS
        position and attitude are displaced in time. Each contribution is
        evaluated alone, not added as independent noise. Combined systematic
        errors can cancel or reinforce. Wrong endpoints are <b>not</b>{" "}
        re-intersected with the ground, so a height error remains visible in the
        numerical result.
      </p>
      <p className="realism-note">
        The detailed assembly uses physical mounting dimensions and deliberately
        large instructional angles; this panel uses survey-scale ranges and
        calibration residuals. Opposing swaths reset heading to 0°/180° while
        retaining roll/pitch; they are diagnostic synthetic shots, not a
        trajectory-estimation or calibration solver. Earth curvature, GNSS
        covariance, attitude interpolation and antenna phase-centre variation
        are omitted.
      </p>
    </section>
  );
}
