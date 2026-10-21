import { useState, useMemo, useCallback, useRef } from "react";
import PhotoLabScene from "./PhotoLabScene.jsx";
import { Panel, Slider, Metric, MethodTabs } from "./PhotoLabUI.jsx";
import {
  NavigationLab,
  Playback,
  usePlayback,
  SeriesChart,
  VectorReadout,
  KnowledgeCheck,
} from "./NavigationUI.jsx";
import {
  makeTrajectory,
  trajectoryAt,
  lidarEndpoint,
  sbetRow,
  sbetCsv,
  SBET_FIELDS,
} from "./trajectory-model.js";
import {
  buildTrajectoryScene,
  updateTrajectoryScene,
} from "./trajectory-scene.js";
import { DEG, norm, sub, qEuler } from "./navigation-math.js";

const modes = {
  raw: "Unaided INS",
  filtered: "Forward Kalman",
  smoothed: "RTS smoothed",
};
const instructions = {
  propagate: [
    "01 / PROPAGATE AT 50 Hz",
    "Strapdown navigation integrates bias-corrected angular rates and specific force. The 15-state error model propagates position, velocity, attitude and both sensor-bias covariances. No synthetic true positions are used by this prediction.",
  ],
  update: [
    "02 / CORRECT WITH GNSS",
    "At the selected GNSS cadence, antenna-position residuals correct the IMU-referenced state. The observation includes the calibrated antenna lever arm. The Kalman gain balances predicted covariance with the stated GNSS variance. During an outage there is no update.",
  ],
  smooth: [
    "03 / REVISIT WITH LATER EVIDENCE",
    "A backward extended Rauch–Tung–Striebel pass revises earlier states using later GNSS-supported estimates. This is offline processing: future observations are available to the smoother, but never to the forward Kalman filter. Smoothing cannot create missing information indefinitely.",
  ],
  lidar: [
    "04 / GEOREFERENCE EACH LASER SHOT",
    "A time-tagged trajectory gives the IMU position and body attitude at emission. Rotate the calibrated scanner lever and the measured beam vector, then add the position. The same recorded range is used for the true and estimated endpoint; wrong points are not re-intersected with the ground.",
  ],
};
export default function SbetTrajectory() {
  const [gnssSigma, setGnssSigma] = useState(0.4),
    [rate, setRate] = useState(1),
    [outage, setOutage] = useState(20),
    [accelBias, setAccelBias] = useState(0.035),
    [gyroBias, setGyroBias] = useState(0.035),
    [gate, setGate] = useState(true),
    [outlier, setOutlier] = useState(false),
    [mode, setMode] = useState("smoothed"),
    [stage, setStage] = useState("smooth"),
    [offset, setOffset] = useState(0),
    [lever, setLever] = useState(true),
    [showTruth, setShowTruth] = useState(true);
  const result = useMemo(
    () =>
      makeTrajectory({
        gnssSigma,
        gnssRate: rate,
        outageDuration: outage,
        accelBias,
        gyroBias,
        gate,
        outlier,
      }),
    [gnssSigma, rate, outage, accelBias, gyroBias, gate, outlier],
  );
  const clock = usePlayback(60, result),
    row =
      result.records[
        Math.min(
          result.records.length - 1,
          Math.round(clock.time / result.config.dt),
        )
      ];
  const options = useMemo(
    () => ({ mode, lever, offset: offset / 1000, showTruth }),
    [mode, lever, offset, showTruth],
  );
  const state = trajectoryAt(result.records, row.t + options.offset, mode),
    endpoint = state ? lidarEndpoint(state, row.shot, options) : null,
    pointError = endpoint ? norm(sub(endpoint, row.shot.truth)) : null;
  const live = useRef();
  live.current = { row, options };
  const build = useCallback(
    () => buildTrajectoryScene(result, options),
    [result, options],
  );
  const frame = useCallback(
    (root) =>
      updateTrajectoryScene(
        root,
        result,
        live.current.row,
        live.current.options,
      ),
    [result],
  );
  const covariance = mode === "smoothed" ? row.smoothP : row.P,
    updateRecord = result.records
      .slice(0, Math.round(row.t / result.config.dt) + 1)
      .findLast((r) => r.gnss),
    update = updateRecord?.gnss;
  const nextUpdate = result.records.find((r) => r.t > row.t + 0.001 && r.gnss);
  const selectStage = (v) => {
    setStage(v);
    setMode(
      v === "propagate" ? "raw" : v === "update" ? "filtered" : "smoothed",
    );
  };
  const download = () => {
    const blob = new Blob([sbetCsv(result, mode)], {
        type: "text/csv;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `geosim-sbet-style-${mode}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const fields = sbetRow(row, mode);
  return (
    <NavigationLab
      name="SBET trajectory & Kalman filtering"
      title="From inertial drift to a usable LiDAR trajectory."
      intro="Inspect a 60-second synthetic survey: 50 Hz strapdown IMU propagation, GNSS antenna-position updates, a genuine 15-state error-state Kalman filter and an offline RTS smoother. SBET describes the trajectory output—not a filtering algorithm."
      notebook={
        <>
          <h3>What is in a trajectory?</h3>
          <p>
            A LiDAR trajectory provides time, position, velocity and attitude,
            referenced to a defined body origin and coordinate frame. SBET
            commonly means Smoothed Best Estimate of Trajectory and is also used
            for a 17-double trajectory record format. The file does not itself
            run a Kalman filter. An integrated navigation system estimates the
            trajectory first; a writer serializes it afterward. Biases and
            uncertainty are internal estimates, not fields in the basic 17-value
            SBET record.
          </p>
          <h3>The forward filter really estimates 15 errors</h3>
          <p>
            The nominal state is p, v, quaternion q, accelerometer bias bₐ and
            gyro bias bɡ. The local error is δx = [δp, δv, δθ, δbₐ, δbɡ].
            Prediction uses fᵇ − b̂ₐ and ωᵇ − b̂ɡ, local constant gravity and
            quaternion increments. Its Jacobian couples attitude error into
            velocity through −R[f]× and bias error through −R. Covariance
            follows P⁻ = F P⁺ Fᵀ + Q. Q includes per-sample IMU white noise and
            small bias random walks.
          </p>
          <p>
            Per-sample IMU noise is 0.018 m/s² and 0.004°/s, independently on
            each body axis. Constant synthetic biases have ratios [1, −0.55,
            0.35] for the accelerometers and [0.25, −0.15, 1] for the gyros. The
            covariance model allows bias random walks of 0.0003 m/s²/√s and
            0.0003°/s/√s. Initial attitude-error standard deviations are 1°, 1°,
            3°; initial bias standard deviations are 0.08 m/s² and 0.1°/s.
          </p>
          <h3>GNSS correction, lever arm and quality gate</h3>
          <p>
            The antenna observation is z = pIMU + R lGNSS + noise. Thus H = [I,
            0, −R[lGNSS]×, 0, 0]. S = H P⁻ Hᵀ + RGNSS, K = P⁻ Hᵀ S⁻¹, δx = K(z −
            h). The state is corrected multiplicatively in attitude; covariance
            uses the Joseph update and a small-angle reset Jacobian. A
            three-dimensional innovation gate uses NIS = νᵀ S⁻¹ν ≤ 16.27 (χ², 3
            degrees of freedom, approximately 99.9%). A rejected observation
            does not update the state. GNSS standard deviations are assumed
            isotropic and known; availability and measurement precision are
            different controls.
          </p>
          <h3>Initialization, observability and outages</h3>
          <p>
            Initial position is one GNSS fix corrected for its antenna offset;
            initial velocity represents a noisy Doppler alignment. Initial
            attitude is externally aligned with small tilt errors and a 1° yaw
            error. Gravity alone cannot determine yaw. Position observations
            plus changing motion provide some bias and attitude observability; a
            poorly excited trajectory cannot resolve every error equally. No
            true position, attitude or bias is injected after initialization.
            True states are used only to synthesize sensors and assess errors.
          </p>
          <h3>Backward smoothing is not a moving average</h3>
          <p>
            The extended RTS recursion uses Cₖ = Pₖ⁺ Fₖ₊₁ᵀ (Pₖ₊₁⁻)⁻¹, then
            revises the filtered state with the next smoothed-minus-predicted
            error in quaternion tangent coordinates. It also revises covariance.
            Later fixes can improve an earlier outage. This is a first-order
            extended smoother, not a production relinearized navigation
            processor. The plotted ±1σ is a marginal East standard deviation,
            not a guarantee that true error stays inside it. The 3D wire glyph
            uses marginal 2σ axes without covariance tilt; it is not a joint 95%
            confidence ellipsoid.
          </p>
          <h3>LiDAR time, attitude and mounting</h3>
          <p>
            pground = pIMU(t) + R(t)[lscanner + r dbeam]. Each shot stores one
            range r and a unit body-frame direction. Position/velocity use
            linear interpolation and attitude uses quaternion SLERP. The same
            lever defaults as the boresight lab are applied. Timestamp mismatch
            samples a different part of the trajectory; missing scanner
            translation is a separate error. The simulation rejects
            out-of-interval interpolation instead of extrapolating. A good
            position RMS alone does not guarantee good laser points: attitude
            and timing matter too.
          </p>
          <h3>Export conventions and limits</h3>
          <p>
            The 10 Hz CSV is a teaching export with 17 named fields, not a
            vendor-compatible binary SBET file. GNSS time is synthetic seconds
            of week beginning at 250000; no UTC/leap-second conversion is made.
            Local ENU is mapped approximately to WGS84 latitude/longitude around
            12.97° N, 77.59° E, 800 m ellipsoidal origin using fixed local
            radii. Output velocities are North/East/Down, attitude is body
            Forward/Right/Down relative to NED, heading clockwise from North,
            all angles/rates in radians and wander angle zero. Body
            accelerations are explicitly gravity-removed kinematic acceleration,
            not raw specific force. Vendor acceleration/frame/time definitions
            must be checked before using a real SBET reader.
          </p>
          <p>
            The flight is short-range and local-level: Earth rotation, transport
            rate, geoid/orthometric height, GNSS satellite observables, integer
            ambiguities, multipath, sensor thermal/scale-factor errors and full
            coning/sculling are omitted. GNSS is loosely coupled through
            positions, not raw observations. The 0.8 Hz scan and 50 Hz IMU
            cadence are reduced teaching values; the terrain is a zero-height
            plane. References: Groves, Principles of GNSS, Inertial, and
            Multisensor Integrated Navigation Systems; Särkkä, Bayesian
            Filtering and Smoothing; Rauch, Tung &amp; Striebel (1965).
          </p>
        </>
      }
    >
      <MethodTabs
        tabs={[
          ["propagate", "IMU propagation"],
          ["update", "GNSS / Kalman update"],
          ["smooth", "Backward smoothing"],
          ["lidar", "Trajectory → LiDAR"],
        ]}
        value={stage}
        onChange={selectStage}
      />
      <div className="nav-metrics">
        <Metric
          label="Unaided INS position RMS"
          value={result.rms.raw.toFixed(3)}
          unit="m"
        />
        <Metric
          label="Forward-filter position RMS"
          value={result.rms.filtered.toFixed(3)}
          unit="m"
        />
        <Metric
          label="Smoothed position RMS"
          value={result.rms.smoothed.toFixed(3)}
          unit="m"
        />
        <Metric
          label="Current LiDAR endpoint error"
          value={
            pointError === null ? "outside interval" : pointError.toFixed(3)
          }
          unit={pointError === null ? "" : "m"}
        />
      </div>
      <div className="nav-workspace">
        <aside className="nav-sidebar">
          <Panel
            tag="SYNTHETIC SENSOR EVIDENCE"
            title="GNSS availability & precision"
          >
            <Slider
              id="sbet-gnss-sigma"
              label="GNSS position σ, per axis"
              value={gnssSigma}
              min={0.1}
              max={2}
              step={0.1}
              display={`${gnssSigma.toFixed(1)} m`}
              onChange={setGnssSigma}
            />
            <label className="nav-select" htmlFor="sbet-gnss-rate">
              GNSS update rate
              <select
                id="sbet-gnss-rate"
                value={rate}
                onChange={(e) => setRate(+e.target.value)}
              >
                {[0.5, 1, 2].map((v) => (
                  <option key={v} value={v}>
                    {v} Hz
                  </option>
                ))}
              </select>
            </label>
            <Slider
              id="sbet-outage"
              label="GNSS outage from t = 20 s"
              value={outage}
              min={0}
              max={30}
              display={`${outage} s`}
              onChange={setOutage}
            />
            <label className="nav-checkbox">
              <input
                id="sbet-outlier"
                type="checkbox"
                checked={outlier}
                onChange={(e) => setOutlier(e.target.checked)}
              />
              Inject +30 m East GNSS error at 46 s
            </label>
            <label className="nav-checkbox">
              <input
                id="sbet-gate"
                type="checkbox"
                checked={gate}
                onChange={(e) => setGate(e.target.checked)}
              />
              Apply innovation quality gate
            </label>
            <p className="nav-note">
              Accepted: <b id="sbet-accepted">{result.accepted}</b> · Rejected:{" "}
              <b id="sbet-rejected">{result.rejected}</b>. A missing observation
              is not a rejected one. Outliers inside an outage are unavailable.
            </p>
          </Panel>
          <Panel
            tag="TRUE SENSOR BIASES · HIDDEN FROM FILTER"
            title="How strongly does INS drift?"
          >
            <Slider
              id="sbet-accel-bias"
              label="Body X accelerometer bias"
              value={accelBias}
              min={0}
              max={0.1}
              step={0.005}
              display={`${accelBias.toFixed(3)} m/s²`}
              onChange={setAccelBias}
            />
            <Slider
              id="sbet-gyro-bias"
              label="Body Z gyro bias"
              value={gyroBias}
              min={0}
              max={0.1}
              step={0.005}
              display={`${gyroBias.toFixed(3)}°/s`}
              onChange={setGyroBias}
            />
            <p className="nav-note">
              Other body axes use fixed proportional offsets. The filter starts
              with zero bias estimates and learns through GNSS residuals; it is
              not given these settings. Controls regenerate a seeded experiment,
              not a new animation heuristic.
            </p>
          </Panel>
          <Panel
            tag="CALIBRATED MOUNTING & SYNCHRONIZATION"
            title="A trajectory is only one ingredient"
          >
            <label className="nav-checkbox">
              <input
                id="sbet-lever"
                type="checkbox"
                checked={lever}
                onChange={(e) => setLever(e.target.checked)}
              />
              Apply scanner lever arm to LiDAR points
            </label>
            <Slider
              id="sbet-offset"
              label="Trajectory timestamp mismatch"
              value={offset}
              min={-100}
              max={100}
              step={10}
              display={`${offset} ms`}
              onChange={setOffset}
            />
            <p className="nav-note">
              Positive mismatch uses trajectory at t + Δt for a shot fired at t.
              This changes LiDAR reconstruction, not the fitted navigation
              solution. End timestamps may fall outside the available
              trajectory.
            </p>
          </Panel>
        </aside>
        <main className="nav-main">
          <Panel
            tag="METRIC ENU SURVEY · PHYSICAL EQUIPMENT SCALE"
            title="The trajectory positions and orients every laser shot"
            className="photo-stage"
          >
            <PhotoLabScene
              build={build}
              onFrame={frame}
              initial={[34, -46, 35]}
              target={[20, 0, 3]}
              maxDistance={180}
              closeup={
                state
                  ? {
                      target: state.p.map((v) => v * 0.08),
                      position: state.p.map(
                        (v, i) => v * 0.08 + [0.7, -0.9, 0.6][i],
                      ),
                      onActivate: () => clock.seek(clock.time),
                    }
                  : null
              }
              closeupLabel="Inspect current payload"
              label="Survey terrain with unaided, forward-filtered and smoothed 3D trajectories, time-tagged laser endpoints and a physical-size survey drone."
            />
            <div className="nav-scene-controls">
              <label htmlFor="sbet-mode">
                Inspect trajectory{" "}
                <select
                  id="sbet-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  {Object.entries(modes).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  id="sbet-truth"
                  type="checkbox"
                  checked={showTruth}
                  onChange={(e) => setShowTruth(e.target.checked)}
                />
                Show synthetic reference for assessment
              </label>
            </div>
            <div className="nav-legend nav-scene-legend">
              <span>
                <i style={{ background: "#e9aa6c" }} />
                Unaided INS
              </span>
              <span>
                <i style={{ background: "#70cbe6" }} />
                Forward Kalman
              </span>
              <span>
                <i style={{ background: "#95d7a9" }} />
                RTS smoothed
              </span>
              <span>Wire glyph: marginal 2σ position axes</span>
              <span>
                Full 60 s capture · return glyphs are symbols, not beam
                footprints
              </span>
            </div>
          </Panel>
          <Playback id="sbet" clock={clock} duration={60} />
          <div className="nav-step-buttons">
            <button
              id="sbet-next-update"
              disabled={!nextUpdate}
              onClick={() => clock.seek(nextUpdate.t)}
            >
              Next GNSS observation →
            </button>
            <button
              disabled={!outage}
              onClick={() => clock.seek(20 + outage / 2)}
            >
              Inspect mid-outage
            </button>
            <button disabled={!outage} onClick={() => clock.seek(20 + outage)}>
              Inspect GNSS return
            </button>
          </div>
          <section className="nav-explanation" aria-live="polite">
            <span>{instructions[stage][0]}</span>
            <h2>
              {stage === "propagate"
                ? "Predict state and uncertainty"
                : stage === "update"
                  ? "Use independent position evidence"
                  : stage === "smooth"
                    ? "Reprocess the earlier flight"
                    : "Use pose at the shot timestamp"}
            </h2>
            <p>{instructions[stage][1]}</p>
            <p className="nav-equation">
              {stage === "propagate"
                ? "P⁻ = F P⁺ Fᵀ + Q"
                : stage === "update"
                  ? "K = P⁻ Hᵀ (H P⁻ Hᵀ + RGNSS)⁻¹"
                  : stage === "smooth"
                    ? "xˢₖ = x⁺ₖ ⊕ Cₖ (xˢₖ₊₁ ⊖ x⁻ₖ₊₁)"
                    : "pground = pIMU(t) + R(t) [lscanner + r dbeam]"}
            </p>
          </section>
          <section className="nav-worked-update" id="sbet-worked-update">
            <h3>
              A real recorded Kalman correction ·{" "}
              {updateRecord
                ? `${updateRecord.t.toFixed(2)} s`
                : "inspect the first GNSS observation"}
            </h3>
            {update ? (
              <>
                <p>
                  {update.accepted
                    ? "Accepted observation: the following correction was applied to the forward filter."
                    : "Rejected observation: the residual failed the quality gate. The state and covariance were left unchanged."}{" "}
                  This is the latest observation at or before the inspected
                  time, not a smoother correction.
                </p>
                <div className="nav-update-values">
                  <span>
                    Predicted East{" "}
                    <b>{update.trace.predictedEast.toFixed(3)} m</b>
                  </span>
                  <span>
                    Applied δEast{" "}
                    <b>{update.trace.eastCorrection.toFixed(3)} m</b>
                  </span>
                  <span>
                    Corrected East{" "}
                    <b>{update.trace.correctedEast.toFixed(3)} m</b>
                  </span>
                </div>
                <p className="nav-equation">
                  δEast = [
                  {update.trace.eastGain.map((v) => v.toFixed(4)).join(", ")}] ·
                  [{update.innovation.map((v) => v.toFixed(3)).join(", ")}] ={" "}
                  {update.trace.eastCorrection.toFixed(3)} m
                </p>
                <p>
                  Marginal East σ: {update.trace.sigmaBefore.toFixed(3)} m
                  before → {update.trace.sigmaAfter.toFixed(3)} m after. GNSS
                  per-axis σ = {gnssSigma.toFixed(1)} m. The off-diagonal gain
                  terms explain why a three-dimensional residual cannot be
                  reduced to a single scalar blend.
                </p>
              </>
            ) : (
              <p>
                The first record is an alignment state. Use “Next GNSS
                observation” to inspect an actual
                prediction–innovation–correction step.
              </p>
            )}
          </section>
          <SeriesChart
            id="sbet-error-chart"
            title="East position error and propagated uncertainty"
            records={result.records}
            series={[
              {
                label: "Forward error",
                color: "#287f9b",
                value: (r) => r.filtered.p[0] - r.truth.p[0],
              },
              {
                label: "Smoothed error",
                color: "#56845b",
                value: (r) => r.smoothed.p[0] - r.truth.p[0],
              },
            ]}
            band={(r) => Math.sqrt(r.P[0])}
            outage={[20, 20 + outage]}
            time={clock.time}
            unit="metres"
          />
          <section className="nav-export">
            <h2>Inspect the trajectory record</h2>
            <p>
              Selected source: <b>{modes[mode]}</b>. Values below describe the
              record at <b>{row.t.toFixed(2)} s</b>, not the shifted LiDAR
              query. This is a 17-field teaching CSV, not a production binary
              SBET file. Frame, datum and acceleration conventions are in the
              notebook.
            </p>
            <div className="nav-table-wrap">
              <table id="sbet-record-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {SBET_FIELDS.map((field, i) => (
                    <tr key={field}>
                      <td>{field}</td>
                      <td>
                        {fields[i].toFixed(field.includes("rad") ? 8 : 4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button id="sbet-export" onClick={download}>
              Download 10 Hz teaching trajectory CSV ↓
            </button>
          </section>
          <KnowledgeCheck
            question="Why can an offline smoothed trajectory improve the middle of a GNSS outage?"
            choices={[
              "It uses later observations in a backward estimation pass",
              "It inserts the known true trajectory",
              "SBET records remove IMU bias automatically",
            ]}
            answer={0}
            explanation="The smoother uses the dynamic model, propagated uncertainty and later evidence. The forward filter cannot use observations that have not happened yet, and the file format alone estimates nothing."
          />
        </main>
        <aside className="nav-sidebar">
          <Panel
            tag="CURRENT FILTER EVIDENCE"
            title={`t = ${row.t.toFixed(2)} s · ${row.outage ? "GNSS OUTAGE" : "GNSS available"}`}
          >
            <div id="sbet-current-status" className="nav-status">
              {row.gnss
                ? row.gnss.accepted
                  ? "GNSS observation accepted"
                  : "GNSS observation rejected by NIS gate"
                : row.outage
                  ? "Prediction only: no GNSS observation"
                  : "Between GNSS observations: IMU prediction"}
            </div>
            <p>
              Latest innovation ν:{" "}
              <b>{update ? norm(update.innovation).toFixed(3) : "—"} m</b>
            </p>
            <p>
              Latest NIS:{" "}
              <b id="sbet-nis">{update ? update.nis.toFixed(3) : "—"}</b> / gate
              16.27
            </p>
            <p>
              Latest mean position gain:{" "}
              <b>{update ? update.gain.toFixed(3) : "—"}</b>
            </p>
            <p>
              Current East σ:{" "}
              <b id="sbet-sigma">
                {mode === "raw"
                  ? "not tracked"
                  : Math.sqrt(covariance[0]).toFixed(3) + " m"}
              </b>
            </p>
            <p className="nav-note">
              The latest update may be earlier than the inspected timestamp.
              Covariance is model-based uncertainty, not the measured true
              error. Summary RMS uses the full 60 s run; playback scrubs its
              recorded history.
            </p>
          </Panel>
          <Panel tag="SELECTED TRAJECTORY STATE" title={modes[mode]}>
            <VectorReadout
              label="IMU position · East / North / Up"
              values={row[mode].p}
              unit="m · local ENU"
            />
            <VectorReadout
              label="Velocity · East / North / Up"
              values={row[mode].v}
              unit="m/s"
            />
            <VectorReadout
              label="Roll / pitch / ENU yaw"
              values={qEuler(row[mode].q).map((v) => v / DEG)}
              unit="degrees · body FLU"
            />
            <VectorReadout
              label="Estimated accelerometer bias"
              values={row[mode].ba}
              unit="m/s²"
            />
            <VectorReadout
              label="Estimated gyro bias"
              values={row[mode].bg.map((v) => v / DEG)}
              unit="degrees/s"
            />
          </Panel>
          <Panel
            tag="ONE RANGE · TWO ENDPOINTS"
            title="Error at this laser shot"
          >
            <p>
              Recorded range: <b>{row.shot.range.toFixed(3)} m</b>
            </p>
            <p>
              Position error:{" "}
              <b id="sbet-position-error">{row.error[mode].toFixed(3)} m</b>
            </p>
            <p>
              LiDAR endpoint error:{" "}
              <b id="sbet-point-error">
                {pointError === null
                  ? "Timestamp outside trajectory"
                  : pointError.toFixed(3) + " m"}
              </b>
            </p>
            <p className="nav-note">
              The endpoint includes position, attitude, timing and scanner
              translation. A wrong ray endpoint retains its height error; it is
              never forced back onto terrain.
            </p>
            <a href={`${import.meta.env.BASE_URL}?simulation=imu`}>
              Inspect how IMU measurements work →
            </a>
          </Panel>
        </aside>
      </div>
    </NavigationLab>
  );
}
