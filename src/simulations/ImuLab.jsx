import { useMemo, useState, useCallback, useRef } from "react";
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
import { IMU_PRESETS, makeImuExperiment } from "./imu-model.js";
import { DEG, G, norm, add, rotate, qEuler } from "./navigation-math.js";
import { buildImuBench, updateImuBench } from "./imu-scene.js";

const lessons = {
  force: [
    "Specific force, not speed",
    "An accelerometer is a suspended proof mass and a readout. At rest on Earth the package supports the mass: f = a − g, so the vertical channel reads about +9.81 m/s². Constant velocity gives the same reading as rest. In ideal free fall the output is zero, although gravity is still present.",
  ],
  gyro: [
    "A gyro senses rate, not an absolute heading",
    "A MEMS gyro drives a mass back and forth. Rotation creates a Coriolis sense force, F꜀ = −2m(Ω × vdrive). Here the paired drive masses move oppositely. The drawn Z-rate mechanism is representative; a real triaxial IMU has three rate channels.",
  ],
  attitude: [
    "Integrate rates; use gravity cautiously",
    "Gyro rates propagate a quaternion. The orange frame shows the estimate; an initial 5° tilt error is deliberately present. A gravity-aided complementary filter corrects tilt when acceleration is approximately just gravity. It cannot observe yaw, and sustained horizontal acceleration can fool it.",
  ],
  calibration: [
    "Estimate zero-rate offset before integrating",
    "The calibration uses 200 held-still gyro readings and subtracts their mean. It does not read the synthetic bias variable. It removes a constant offset but not white noise, temperature dependence or future bias drift. It does not calibrate the accelerometers.",
  ],
};
export default function ImuLab() {
  const [preset, setPreset] = useState("rest"),
    [pose, setPose] = useState({ ...IMU_PRESETS.rest }),
    [gyroBias, setGyroBias] = useState(0.08),
    [accelBias, setAccelBias] = useState(3),
    [noise, setNoise] = useState(1),
    [calibrate, setCalibrate] = useState(false),
    [stage, setStage] = useState("force"),
    [aided, setAided] = useState(false),
    [showEstimate, setShowEstimate] = useState(true);
  const result = useMemo(
    () => makeImuExperiment({ ...pose, gyroBias, accelBias, noise, calibrate }),
    [pose, gyroBias, accelBias, noise, calibrate],
  );
  const clock = usePlayback(result.config.duration, result),
    row =
      result.records[
        Math.min(
          result.records.length - 1,
          Math.round(clock.time / result.config.dt),
        )
      ];
  const live = useRef();
  live.current = { row, aided, showEstimate };
  const build = useCallback(() => buildImuBench(), []),
    frame = useCallback(
      (root) => updateImuBench(root, live.current.row, live.current),
      [],
    );
  const acceleration = add(rotate(aided ? row.aidedQ : row.gyroQ, row.force), [
    0,
    0,
    -G,
  ]);
  const change = (key, value) => {
    setPreset("custom");
    setPose((p) => ({ ...p, [key]: value, freefall: false }));
  };
  return (
    <NavigationLab
      name="Inside an IMU"
      title="Measure force. Measure rotation. Estimate motion."
      intro="An instrument-centred 3D cutaway with six real sensor channels, quaternion rate integration and a gravity-aided tilt estimator. Change the motion, predict the readings, then inspect the evidence."
      notebook={
        <>
          <h3>Frames, units and equations</h3>
          <p>
            Navigation is East–North–Up (ENU), with gravity g = [0, 0, −9.80665]
            m/s². Body axes are forward–left–up (FLU). R rotates body vectors
            into ENU. Accelerometers measure fᵇ = Rᵀ(aⁿ − gⁿ) + bₐ + nₐ; gyros
            measure ωᵇ + bɡ + nɡ. To recover translation, calculate aⁿ = R(fᵇ −
            bₐ) + gⁿ, then integrate velocity and position. A small attitude
            error leaks gravity into horizontal acceleration.
          </p>
          <h3>How the instruments work</h3>
          <p>
            A quasi-static accelerometer proof-mass deflection obeys x = −mf/k.
            Capacitive electrodes sense this displacement. The 3-axis mass,
            springs and circuit board are explanatory geometry, not a
            manufacturing drawing. Deflections and drive motion are amplified;
            the gyro drive is slowed to 2 visible cycles/s. No MEMS stiffness,
            damping, resonant dynamics or electronic transfer function is
            claimed.
          </p>
          <h3>Rate integration and tilt aiding</h3>
          <p>
            The 100 Hz model applies qₖ₊₁ = qₖ ⊗ Exp((ωₘ − b̂ɡ)Δt). The
            gravity-aided option adds a cross-product tilt correction with gain
            1.7 s⁻¹ when 0.7g &lt; |f| &lt; 1.3g. This is a complementary
            estimator, not a Kalman filter. A magnitude test cannot reliably
            reject sustained horizontal acceleration; observe the wrong tilt
            under the acceleration preset. Gravity supplies no heading
            reference.
          </p>
          <p>
            Gyro bias components scale as [0.2, −0.15, 1] times the Z-bias
            setting; accelerometer biases scale as [1, −0.5, 0.3] times the
            X-bias setting. At noise multiplier 1 the per-sample standard
            deviations are 0.015°/s and 0.002g. Mechanical deflection uses the
            ideal force/rate; electronic bias and noise affect the displayed
            readings and integration, not the mechanical mass motion.
          </p>
          <h3>Try these experiments</h3>
          <p>
            Compare rest with constant velocity: both read one g, not zero. Tilt
            the board: gravity redistributes between channels without
            translation. Use free fall: gravity remains drawn but specific force
            vanishes. Run a stationary case for 20 s with and without zero-rate
            calibration; compare yaw drift. Then add horizontal acceleration and
            observe the gravity-aided tilt error. Free fall is an instantaneous
            idealized condition, not a 20 s safe terrestrial drop or an altitude
            trajectory.
          </p>
          <h3>Model limits and references</h3>
          <p>
            Seeded white noise and constant biases are simulated; acceleration
            bias is not estimated here. Earth rotation, coning/sculling
            corrections, scale-factor/cross-axis errors, vibration
            rectification, saturation and thermal bias are omitted. Instrument
            position is held at the view origin so its mechanics remain
            inspectable. References: Titterton &amp; Weston, Strapdown Inertial
            Navigation Technology; Groves, Principles of GNSS, Inertial, and
            Multisensor Integrated Navigation Systems.
          </p>
        </>
      }
    >
      <MethodTabs
        tabs={[
          ["force", "Accelerometer"],
          ["gyro", "Gyroscope"],
          ["attitude", "Attitude & drift"],
          ["calibration", "Calibration"],
        ]}
        value={stage}
        onChange={(v) => {
          setStage(v);
          if (v === "attitude") setAided(true);
        }}
      />
      <div className="nav-metrics">
        <Metric
          label="Measured specific-force norm"
          value={norm(row.force).toFixed(3)}
          unit="m/s²"
        />
        <Metric
          label="True translational acceleration"
          value={norm(row.acceleration).toFixed(2)}
          unit="m/s²"
        />
        <Metric
          label="Gyro-only yaw error"
          value={row.yawError.toFixed(3)}
          unit="°"
        />
        <Metric
          label="Gravity-aided tilt error"
          value={row.tiltError.toFixed(3)}
          unit="°"
        />
      </div>
      <div className="nav-workspace">
        <aside className="nav-sidebar">
          <Panel tag="CONTROLLED MOTION" title="Make a sensor prediction">
            <label className="nav-select" htmlFor="imu-preset">
              Motion experiment
              <select
                id="imu-preset"
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value);
                  setPose({ ...IMU_PRESETS[e.target.value] });
                }}
              >
                {Object.entries(IMU_PRESETS).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.name}
                  </option>
                ))}
                {preset === "custom" && (
                  <option value="custom">Custom motion</option>
                )}
              </select>
            </label>
            <Slider
              id="imu-roll"
              label="Body roll"
              value={pose.roll}
              min={-60}
              max={60}
              display={`${pose.roll}°`}
              onChange={(v) => change("roll", v)}
            />
            <Slider
              id="imu-pitch"
              label="Body pitch"
              value={pose.pitch}
              min={-60}
              max={60}
              display={`${pose.pitch}°`}
              onChange={(v) => change("pitch", v)}
            />
            <Slider
              id="imu-yaw"
              label="Initial ENU yaw"
              value={pose.yaw}
              min={-180}
              max={180}
              display={`${pose.yaw}°`}
              onChange={(v) => change("yaw", v)}
            />
            <Slider
              id="imu-acceleration"
              label="World East acceleration"
              value={pose.acceleration}
              min={-4}
              max={4}
              step={0.1}
              display={`${pose.acceleration.toFixed(1)} m/s²`}
              onChange={(v) => change("acceleration", v)}
            />
            <Slider
              id="imu-rate"
              label="Rotation about world vertical"
              value={pose.rate}
              min={-30}
              max={30}
              display={`${pose.rate}°/s`}
              onChange={(v) => change("rate", v)}
            />
            <p className="nav-note">
              {pose.freefall
                ? "Ideal free fall: a = g. Not a full falling-body trajectory."
                : preset === "cruise"
                  ? "Constant world velocity 5 m/s; acceleration is zero. The channels cannot measure that speed."
                  : "The view follows the instrument; translation is represented by the acceleration input."}
            </p>
            <p className="nav-note">
              Reference speed:{" "}
              <b id="imu-reference-speed">
                {norm(row.velocity).toFixed(2)} m/s
              </b>
              . This is imposed motion, not an IMU speed measurement.
            </p>
          </Panel>
          <Panel tag="SENSOR IMPERFECTIONS" title="Why integration drifts">
            <Slider
              id="imu-gyro-bias"
              label="Z gyro zero-rate bias"
              value={gyroBias}
              min={0}
              max={0.3}
              step={0.01}
              display={`${gyroBias.toFixed(2)}°/s`}
              onChange={setGyroBias}
            />
            <Slider
              id="imu-accel-bias"
              label="X accelerometer bias"
              value={accelBias}
              min={0}
              max={15}
              step={1}
              display={`${accelBias} mg`}
              onChange={setAccelBias}
            />
            <Slider
              id="imu-noise"
              label="White-noise multiplier"
              value={noise}
              min={0}
              max={3}
              step={0.25}
              onChange={setNoise}
            />
            <label className="nav-checkbox">
              <input
                id="imu-calibrate"
                type="checkbox"
                checked={calibrate}
                onChange={(e) => setCalibrate(e.target.checked)}
              />
              Apply measured stationary gyro calibration
            </label>
            <p className="nav-note">
              Estimated Z offset: {(result.calibration[2] / DEG).toFixed(4)}°/s.
              Other gyro/accelerometer axes have fixed proportional biases,
              disclosed in the notebook.
            </p>
          </Panel>
        </aside>
        <main className="nav-main">
          <Panel
            tag="INSTRUMENT-CENTRED 3D VIEW"
            title="Proof mass, driven gyro & body frame"
            className="photo-stage"
          >
            <PhotoLabScene
              build={build}
              onFrame={frame}
              initial={[4.5, -5.5, 5]}
              target={[-0.4, 0, 0.2]}
              closeup={{
                target: [-0.25, 0, 0.4],
                position: [2.5, -3.3, 3],
                onActivate: () => clock.seek(clock.time),
              }}
              closeupLabel="Sensor close-up"
              label="A rotating IMU circuit board with an amplified suspended proof mass, paired vibrating gyro masses, body axes, a world-down gravity arrow and an estimated attitude outline."
            />
            <div className="nav-scene-controls">
              <label>
                <input
                  id="imu-aided"
                  type="checkbox"
                  checked={aided}
                  onChange={(e) => setAided(e.target.checked)}
                />
                Orange frame: gravity-aided estimate
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={showEstimate}
                  onChange={(e) => setShowEstimate(e.target.checked)}
                />
                Show estimated frame
              </label>
            </div>
          </Panel>
          <Playback id="imu" clock={clock} duration={result.config.duration} />
          <section className="nav-explanation" aria-live="polite">
            <span>WORKING PRINCIPLE</span>
            <h2>{lessons[stage][0]}</h2>
            <p>{lessons[stage][1]}</p>
          </section>
          <SeriesChart
            id="imu-drift-chart"
            title="Heading error: gravity does not provide yaw"
            records={result.records}
            series={[
              {
                label: "Gyro only",
                color: "#b7723f",
                value: (r) => r.yawError,
              },
              {
                label: "Gravity-aided",
                color: "#287e87",
                value: (r) => r.aidedYawError,
              },
            ]}
            time={clock.time}
            unit="degrees"
          />
          <KnowledgeCheck
            question="An IMU moves at a perfectly constant velocity on a level surface. What does its ideal vertical accelerometer read?"
            choices={[
              "0 m/s², because acceleration is zero",
              "About +9.81 m/s² in body-up",
              "Its speed in metres per second",
            ]}
            answer={1}
            explanation="The accelerometer senses a − g, not velocity. The supporting surface produces one g of specific force."
          />
        </main>
        <aside className="nav-sidebar">
          <Panel
            tag="SIX MEASURED CHANNELS · BODY FLU"
            title={`Readout at ${row.t.toFixed(2)} s`}
          >
            <VectorReadout
              id="imu-force"
              label="Accelerometer fₘ"
              values={row.force}
              unit="m/s² · includes bias and noise"
            />
            <VectorReadout
              id="imu-omega"
              label="Gyroscope ωₘ"
              values={row.omega.map((v) => v / DEG)}
              unit="degrees/s · body angular rate"
            />
            <p className="nav-equation">fᵇ = Rᵀ(aⁿ − gⁿ) + bₐ + nₐ</p>
            <p className="nav-note">
              Cyan arrow: specific force, not gravity. Amber world arrow:
              gravity. The mass displacement opposes specific force; mechanical
              motion is amplified.
            </p>
          </Panel>
          <Panel
            tag="PROPAGATED ATTITUDE → ACCELERATION"
            title="Why the frame matters"
          >
            <VectorReadout
              id="imu-estimated-acceleration"
              label="Estimated world a"
              values={acceleration}
              unit="m/s² · R̂ fₘ + g, no accelerometer-bias correction"
            />
            <VectorReadout
              label="Estimated roll / pitch / ENU yaw"
              values={qEuler(aided ? row.aidedQ : row.gyroQ).map(
                (v) => v / DEG,
              )}
              unit="degrees · ENU yaw starts at East, positive to North"
            />
            <p className="nav-note">
              An initial 5° tilt error is intentional. Gravity aiding can remove
              it at rest; sustained acceleration can create a false tilt
              instead. It cannot correct absolute yaw.
            </p>
            <a href={`${import.meta.env.BASE_URL}?simulation=sbet-trajectory`}>
              Next: GNSS/IMU Kalman filtering →
            </a>
          </Panel>
        </aside>
      </div>
    </NavigationLab>
  );
}
