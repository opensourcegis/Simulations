import { useState } from "react";
import "./simulation.css";
import "./native.css";
import "./boresight.css";
import LidarLearningPanel from "./LidarLearningPanel.jsx";
import GeoreferencingExperiment from "./GeoreferencingExperiment.jsx";
import SurveyFlightView from "./SurveyFlightView.jsx";
import { boresightComparison } from "../../games/shared/lidar-physics.js";

const sub = (a, b) => a.map((v, i) => v - b[i]);
const norm = (a) => Math.hypot(...a);
const SENSORS = {
  gps: { label: "GPS antenna", color: "#f59e0b", bore: false },
  scanner: { label: "LiDAR", color: "#38bdf8", bore: true },
};

const DEFAULTS = {
  gps: { arm: [-0.9, 0.0, 1.05], bore: [0, 0, 0] }, // GNSS radome behind the IMU
  scanner: { arm: [0.7, 0.0, -0.8], bore: [4, -3, 5] }, // scanner beneath the chassis
};

export default function Boresight() {
  const [arms, setArms] = useState({
    gps: DEFAULTS.gps.arm.slice(),
    scanner: DEFAULTS.scanner.arm.slice(),
  });
  const [bores, setBores] = useState({
    scanner: DEFAULTS.scanner.bore.slice(),
  });
  const [att, setAtt] = useState([12, -6, 15]); // drone attitude the IMU records
  const [height, setHeight] = useState(6);
  const [scanAngle, setScanAngle] = useState(0);
  const [sel, setSel] = useState("scanner");
  const [showArms, setShowArms] = useState(true);
  const [showGhost, setShowGhost] = useState(true);
  const [showLaser, setShowLaser] = useState(true);

  const setArm = (key, i) => (e) =>
    setArms((p) => {
      const a = { ...p, [key]: p[key].slice() };
      a[key][i] = Number(e.target.value);
      return a;
    });
  const setBore = (key, i) => (e) =>
    setBores((p) => {
      const b = { ...p, [key]: p[key].slice() };
      b[key][i] = Number(e.target.value);
      return b;
    });
  const setAt = (i) => (e) =>
    setAtt((p) => {
      const a = p.slice();
      a[i] = Number(e.target.value);
      return a;
    });

  const reset = () => {
    setArms({
      gps: DEFAULTS.gps.arm.slice(),
      scanner: DEFAULTS.scanner.arm.slice(),
    });
    setBores({ scanner: DEFAULTS.scanner.bore.slice() });
  };
  const zeroBore = () =>
    setBores((p) => ({ scanner: sel === "scanner" ? [0, 0, 0] : p.scanner }));

  // Readouts and canvas share the same measured-range comparison.
  const comparison = boresightComparison(
    height,
    arms.scanner,
    att,
    bores.scanner,
    scanAngle,
  );
  const groundErr = comparison?.horizontalError ?? 0;
  const [aRoll, aPitch, aYaw] = att; // drone attitude the IMU records
  const leverArm = norm(sub(arms.scanner, arms.gps)); // antenna → LiDAR
  const s = SENSORS[sel];
  const arm = arms[sel];

  const AXES = ["X", "Y", "Z"];
  const RPY = ["roll (X)", "pitch (Y)", "yaw (Z)"];

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>
          &larr; All simulators
        </a>
        <div className="title-block">
          <h1>
            Boresight &amp; Lever-Arm{" "}
            <span className="native-badge">Native React</span>
          </h1>
          <span className="sub">
            Direct georeferencing: rotate the drone — the LiDAR rotates with it
            and the IMU records roll/pitch/yaw
          </span>
        </div>
        <span className="score-chip">
          IMU records:{" "}
          <b>
            {aRoll.toFixed(0)}° / {aPitch.toFixed(0)}° / {aYaw.toFixed(0)}°
          </b>
        </span>
      </header>

      <GeoreferencingExperiment
        arms={arms}
        attitude={att}
        boresight={bores.scanner}
      />
      <LidarLearningPanel
        topic="boresight"
        workedExample={
          comparison
            ? `Measured slant range ρ = ${comparison.range.toFixed(3)} m; scanner height = ${comparison.sensorHeight.toFixed(3)} m. Omitting boresight shifts the same-range endpoint by Δhorizontal = ${(comparison.horizontalError * 100).toFixed(2)} cm and Δz = ${(comparison.verticalError * 100).toFixed(2)} cm. Attitude is included in both endpoints.`
            : "The selected scanner position or ray has no forward ground intersection. Restore a higher platform or a downward-looking ray."
        }
        onExperiment={(id) => {
          setSel("scanner");
          setAtt(id === "zero" ? [12, -6, 15] : [0, 0, 0]);
          setBores({ scanner: id === "zero" ? [0, 0, 0] : [0, 0, 10] });
          setScanAngle(id === "yaw-scan" ? 30 : 0);
          setHeight(6);
        }}
      />

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2>
              <span className="stepno">1</span> Sensor assembly{" "}
              <small>&mdash; drag to orbit, scroll to zoom</small>
            </h2>
            <SurveyFlightView
              inspection
              height={height}
              scanAngle={scanAngle}
              arms={arms}
              attitude={att}
              boresight={bores.scanner}
              onSelect={(id) => {
                if (id === "gps" || id === "scanner") setSel(id);
              }}
              showArms={showArms}
              showLaser={showLaser}
              showGhost={showGhost}
            />
            <p className="field-caption">
              White radome: GNSS antenna · bronze enclosure: IMU · cylindrical
              belly payload: LiDAR. The sand line connects the antenna and
              scanner centres; axes are optional forward / left / up guides.
            </p>
            <div className="bs-toolbar">
              <label>
                <input
                  type="checkbox"
                  checked={showArms}
                  onChange={(e) => setShowArms(e.target.checked)}
                />{" "}
                lever-arm vector
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showGhost}
                  onChange={(e) => setShowGhost(e.target.checked)}
                />{" "}
                body-frame axes
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showLaser}
                  onChange={(e) => setShowLaser(e.target.checked)}
                />{" "}
                measured ray &amp; omitted-boresight ray
              </label>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2>
              <span className="stepno">2</span> Fly the drone{" "}
              <small>&mdash; the IMU records this attitude</small>
            </h2>
            <div
              className="control-grid"
              style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
            >
              {["roll", "pitch", "yaw"].map((nm, i) => (
                <label key={nm}>
                  {nm} <b>{att[i].toFixed(0)}&deg;</b>
                  <input
                    type="range"
                    min="-30"
                    max="30"
                    step="1"
                    value={att[i]}
                    onChange={setAt(i)}
                  />
                </label>
              ))}
            </div>
            <div
              className="readouts"
              style={{ gridTemplateColumns: "repeat(3,1fr)" }}
            >
              <div>
                <span>IMU roll</span>
                <b>{aRoll.toFixed(0)}&deg;</b>
              </div>
              <div>
                <span>IMU pitch</span>
                <b>{aPitch.toFixed(0)}&deg;</b>
              </div>
              <div>
                <span>IMU yaw</span>
                <b>{aYaw.toFixed(0)}&deg;</b>
              </div>
            </div>
            <div className="bs-toolbar">
              <button className="bs-btn" onClick={() => setAtt([0, 0, 0])}>
                level flight (0/0/0)
              </button>
            </div>
            <div className="bs-note">
              Rotating the drone turns the rigid platform, beam and antenna
              about the IMU. Direct georeferencing <b>uses</b> the measured
              attitude to transform the observed ray into the mapping frame; it
              does not turn the actual ground hit into a nadir hit. Both plotted
              endpoints use that attitude, and differ only in whether the
              boresight calibration is applied.
            </div>
          </section>

          <section className="sim-panel">
            <h2>
              <span className="stepno">3</span> Edit a component
            </h2>
            <div className="bs-seg">
              {Object.keys(SENSORS).map((k) => (
                <button
                  key={k}
                  className={`bs-segbtn ${sel === k ? "on" : ""}`}
                  onClick={() => setSel(k)}
                >
                  <i
                    className="bs-swatch"
                    style={{ background: SENSORS[k].color }}
                  />
                  {SENSORS[k].label}
                </button>
              ))}
            </div>

            <div className="bs-sub">
              Mounting offset from IMU: X forward, Y left, Z up (metres)
            </div>
            <div
              className="control-grid"
              style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
            >
              {AXES.map((ax, i) => (
                <label key={ax}>
                  {ax} <b>{arm[i].toFixed(2)}</b>
                  <input
                    type="range"
                    min="-4"
                    max="4"
                    step="0.05"
                    value={arm[i]}
                    onChange={setArm(sel, i)}
                  />
                </label>
              ))}
            </div>
            <div className="bs-eq">
              antenna → LiDAR lever arm |a<sub>gps→ls</sub>| ={" "}
              <b>{leverArm.toFixed(2)} m</b>
            </div>

            {s.bore ? (
              <>
                <div className="bs-sub">
                  Boresight — LiDAR roll / pitch / yaw vs the IMU (deg,
                  exaggerated)
                </div>
                <div
                  className="control-grid"
                  style={{ gridTemplateColumns: "1fr 1fr 1fr" }}
                >
                  {RPY.map((nm, i) => (
                    <label key={nm}>
                      {nm} <b>{bores[sel][i]}&deg;</b>
                      <input
                        type="range"
                        min="-15"
                        max="15"
                        step="0.5"
                        value={bores[sel][i]}
                        onChange={setBore(sel, i)}
                      />
                    </label>
                  ))}
                </div>
                <button
                  className="bs-btn"
                  style={{ marginTop: 8 }}
                  onClick={zeroBore}
                >
                  zero this boresight
                </button>
              </>
            ) : (
              <div className="bs-note">
                The antenna is modelled as one phase-centre <b>point</b>. ECEF
                describes its Earth-coordinate position, not the antenna&rsquo;s
                physical orientation. Antenna orientation and phase-centre
                variations matter in real systems but are omitted here.
              </div>
            )}

            <div className="bs-sub">Flying height &amp; impact</div>
            <div
              className="control-grid"
              style={{ gridTemplateColumns: "1fr" }}
            >
              <label>
                height above ground <b>{height} m</b>
                <input
                  type="range"
                  min="2"
                  max="12"
                  step="0.5"
                  value={height}
                  onChange={(e) => setHeight(Number(e.target.value))}
                />
              </label>
              <label>
                scanner off-axis angle <b>{scanAngle}°</b>
                <input
                  type="range"
                  min="-45"
                  max="45"
                  step="1"
                  value={scanAngle}
                  onChange={(e) => setScanAngle(Number(e.target.value))}
                />
              </label>
            </div>
            <div
              className="readouts"
              style={{ gridTemplateColumns: "repeat(3,1fr)" }}
            >
              <div>
                <span>horizontal endpoint error</span>
                <b className={groundErr > 0.3 ? "orange" : ""}>
                  {comparison ? `${(groundErr * 100).toFixed(1)} cm` : "no hit"}
                </b>
              </div>
              <div>
                <span>vertical endpoint error Δz</span>
                <b>
                  {comparison
                    ? `${(comparison.verticalError * 100).toFixed(1)} cm`
                    : "no hit"}
                </b>
              </div>
              <div>
                <span>measured slant range ρ</span>
                <b>
                  {comparison ? `${comparison.range.toFixed(2)} m` : "no hit"}
                </b>
              </div>
            </div>

            <div className="rect-summary">
              <b>Use attitude and boresight; neither can be silently omitted</b>
              <p>
                Rotate the drone and the whole rigid platform — the{" "}
                <b>IMU body frame</b>, the <b>GPS antenna</b> and the
                <b> LiDAR</b> — swings together. The <b>IMU records</b> that
                motion as <b>roll / pitch / yaw</b> against the fixed
                <b> North / East / Down</b> navigation frame. The{" "}
                <b>boresight</b> is a separate scanner-to-body rotation that
                must also be calibrated and applied. The display compares the{" "}
                <b>same measured range</b> with and without that rotation. A
                pure yaw misalignment leaves a nadir ray unchanged, but shifts
                an off-axis ray. The <b>lever arm</b> is a translation expressed
                in a declared body frame; it must be rotated with the platform
                before adding it to a world position.
              </p>
            </div>
            <div className={`bs-note ${groundErr > 0.3 ? "warn" : ""}`}>
              <b>
                xₑ = x<sub>GNSS,e</sub> + R<sub>e←n</sub> R<sub>n←b</sub> (ℓ
                <sub>GNSS→scanner,b</sub> + R<sub>b←s</sub> ρ uₛ)
              </b>
              . The arrows declare source and destination frames. Apply scanner
              direction uₛ, boresight R<sub>b←s</sub>, body-frame lever arm,
              measured attitude and navigation-to-Earth rotation in that order.
              The small-angle scale ρ·δβ is a sensitivity estimate, not a full
              error budget.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
