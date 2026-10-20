import { useCallback, useEffect, useMemo, useState } from "react";
import PhotoLabScene from "./PhotoLabScene.jsx";
import { PhotoLab, Panel, Slider, Metric, MethodTabs } from "./PhotoLabUI.jsx";
import {
  bundleStep,
  bundleMetrics,
  bundleObjective,
} from "./photogrammetry-model.js";
import {
  createAerialSurvey,
  surveyDiagnostics,
  intersectObservations,
} from "./aerial-survey.js";
import { buildSurveyScene } from "./AerialScene.jsx";
import SurveyPhoto from "./SurveyPhoto.jsx";
import "./aerial-lab.css";

const fresh = (data, robust) => ({
  state: data.initial,
  lambda: 0.01,
  history: [
    {
      ...bundleMetrics(data, data.initial),
      cost: bundleObjective(data, data.initial, robust),
    },
  ],
});
const fmt = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : "—");
export default function BlockAdjustment({ triangulation = false }) {
  const [baseline, setBaseline] = useState(32),
    [stripSpacing, setStripSpacing] = useState(38),
    [altitude, setAltitude] = useState(120),
    [noise, setNoise] = useState(0.5),
    [control, setControl] = useState("distributed"),
    [controlSigma, setControlSigma] = useState(0.03),
    [navigation, setNavigation] = useState("standard");
  const [outliers, setOutliers] = useState(false),
    [calibrate, setCalibrate] = useState(false),
    [robust, setRobust] = useState(true),
    [camera, setCamera] = useState(0),
    [point, setPoint] = useState(14),
    [rays, setRays] = useState(true),
    [reference, setReference] = useState(false),
    [residualScale, setResidualScale] = useState(10),
    [running, setRunning] = useState(false),
    [stage, setStage] = useState("plan"),
    [measurements, setMeasurements] = useState({}),
    [allMeasured, setAllMeasured] = useState(!triangulation);
  const source = useMemo(
    () =>
      createAerialSurvey({
        baseline,
        stripSpacing,
        altitude,
        noise,
        control,
        controlSigma,
        navigation,
        outliers,
        calibrate,
      }),
    [
      baseline,
      stripSpacing,
      altitude,
      noise,
      control,
      controlSigma,
      navigation,
      outliers,
      calibrate,
    ],
  );
  const data = useMemo(() => {
    if (allMeasured) return source;
    const preliminary = source.observations
      .filter(
        (o) =>
          o.checkpoint ||
          source.gcps.includes(o.pi) ||
          measurements[`${o.ci}-${o.pi}`],
      )
      .map((o) => ({ ...o, ...measurements[`${o.ci}-${o.pi}`] }));
    const active = new Set(
      preliminary
        .filter(
          (o) =>
            !o.checkpoint &&
            preliminary.filter((p) => p.pi === o.pi).length >= 2,
        )
        .map((o) => o.pi),
    );
    return {
      ...source,
      observations: preliminary.filter((o) => o.checkpoint || active.has(o.pi)),
      parameters: source.parameters.filter(
        (p) => p.type !== "p" || active.has(p.i),
      ),
    };
  }, [source, measurements, allMeasured]);
  const [solution, setSolution] = useState(() => fresh(data, robust));
  useEffect(() => {
    setSolution(fresh(data, robust));
    setRunning(false);
  }, [data, robust]);
  useEffect(() => {
    setMeasurements({});
    setAllMeasured(!triangulation);
  }, [source, triangulation]);
  const step = useCallback(
    () =>
      setSolution((previous) => {
        const result = bundleStep(data, previous.state, {
          robust,
          lambda: previous.lambda,
        });
        return {
          state: result.state,
          lambda: result.lambda,
          history: [
            ...previous.history,
            {
              ...bundleMetrics(data, result.state),
              cost: result.cost,
              accepted: result.accepted,
            },
          ],
        };
      }),
    [data, robust],
  );
  useEffect(() => {
    if (!running) return;
    if (solution.history.length >= 26) {
      setRunning(false);
      return;
    }
    const timer = setTimeout(step, 140);
    return () => clearTimeout(timer);
  }, [running, solution.history.length, step]);
  const state = solution.state,
    metrics = bundleMetrics(data, state),
    diagnostics = surveyDiagnostics(data, state),
    iteration = solution.history.length - 1,
    absolute =
      control === "distributed" || control === "five" || navigation !== "off";
  const selectedHit = intersectObservations(
    state,
    data.observations.filter((o) => o.pi === point),
  );
  const build = useCallback(
    () =>
      buildSurveyScene({
        data,
        state,
        camera,
        point,
        rays,
        reference,
        connections: triangulation && stage === "plan",
      }),
    [data, state, camera, point, rays, reference, triangulation, stage],
  );
  const graph = solution.history
    .map(
      (h, i) =>
        `${18 + (i / Math.max(1, iteration)) * 364},${145 - (Math.log1p(h.rms) / Math.max(0.001, Math.log1p(solution.history[0].rms))) * 125}`,
    )
    .join(" ");
  const addMeasurement = (ci, uv) => {
    if (
      !source.observations.some((o) => o.ci === ci && o.pi === point) ||
      source.gcps.includes(point) ||
      source.checkpoints.includes(point)
    )
      return;
    setAllMeasured(false);
    setMeasurements((previous) => ({ ...previous, [`${ci}-${point}`]: uv }));
  };
  const addDetected = () => {
    setAllMeasured(false);
    setMeasurements((previous) => {
      const next = { ...previous };
      source.observations
        .filter((o) => o.pi === point && !o.checkpoint)
        .forEach((o) => {
          next[`${o.ci}-${o.pi}`] = { u: o.u, v: o.v };
        });
      return next;
    });
  };
  return (
    <PhotoLab
      name={triangulation ? "Aerial triangulation" : "Bundle block adjustment"}
      title={
        triangulation
          ? "Connect the strips. Intersect the rays."
          : "An aerial block, adjusted from evidence."
      }
      intro="Six overlapping aerial images over rolling terrain and buildings. Solve camera exterior orientation and 3D ties, weight survey uncertainty, and evaluate held-out checkpoints—not just pixel fit."
      notebook={
        <>
          <h3>Photographic and survey evidence</h3>
          <p>
            The 1600 × 1200 synthetic images use collinearity with radial
            distortion k₁. Nominal f = 1500 px corresponds to 24 mm on a 25.6
            mm-wide sensor. At 120 m above the datum, GSD is 8 cm/pixel. Relief
            changes local GSD and overlap; quoted overlap is a flat-datum
            planning approximation. Visibility includes field of view and
            64-sample terrain/building occlusion tests.
          </p>
          <p>
            GCP XYZ are Gaussian weighted observations, not exact coordinates.
            Their selected horizontal sigma and 1.5× vertical sigma determine
            their weight. Camera-position priors have 1.5/1.5/2.5 m sigmas for
            standard GNSS or 4/4/7 cm for illustrative RTK. No attitude priors
            are used. Huber loss downweights image-vector outliers only; survey
            constraints remain Gaussian. Prior weights use a 0.25 px noise floor
            when selected image noise is smaller.
          </p>
          <h3>Actual joint adjustment</h3>
          <p>
            Finite-difference Jacobians and damped normal equations jointly
            estimate camera poses and tie coordinates. Accepted
            Levenberg–Marquardt steps decrease the weighted objective. Optional
            self-calibration estimates shared f and k₁. Navigation-based initial
            estimates are not an SfM initialization. This small dense solver
            does not implement a production sparse Schur-complement solver.
          </p>
          <h3>Independent checks, geometry and datum</h3>
          <p>
            Purple checkpoint images and XYZ never enter the fitting residuals
            or unknowns. Their coordinates are intersected after adjustment,
            then axis-wise errors are compared with independent synthetic survey
            truth. Ray angle reveals depth weakness; pixel agreement alone is
            not height accuracy. Missing overlap can make checks unavailable.
          </p>
          <p>
            Without control and navigation, one estimated camera pose and one
            additional baseline coordinate fix seven arbitrary gauge freedoms.
            This is a relative model, not a georeferenced map. Collinear-only
            control leaves rotation around its line unobservable. Navigation
            priors may supply additional datum information. Equation surplus is
            not a rank test.
          </p>
          {triangulation && (
            <>
              <h3>Manual measurement</h3>
              <p>
                Select a track, then click the same physical detail in each
                synthetic image. Actual clicked pixels enter the fit; the
                nearest feature is not silently substituted. “Measure selected
                detected track” uses generated noisy centroids as an accessible
                alternative. “Populate synthetic tracks” fills all synthetic
                correspondences. GCP/check images remain premeasured. A tie
                needs two or more observations. Feature descriptors on real
                photographs are not implemented.
              </p>
            </>
          )}
          <h3>Limitations and references</h3>
          <p>
            No rolling shutter, full Brown distortion, refraction, covariance
            propagation, detector saturation or certified mapping-grade
            accuracy. Nadir self-calibration can couple f, radial distortion and
            flying height. Further reading: Triggs et al. (2000), “Bundle
            Adjustment — A Modern Synthesis”; Hartley &amp; Zisserman, Multiple
            View Geometry.
          </p>
        </>
      }
    >
      {triangulation && (
        <MethodTabs
          value={stage}
          onChange={setStage}
          tabs={[
            ["plan", "Flight block"],
            ["measure", "Image measurements"],
            ["adjust", "Joint adjustment"],
            ["qa", "Independent QA"],
          ]}
        />
      )}
      <div className="aerial-summary">
        <span>
          <b>{fmt(diagnostics.gsd * 100, 1)} cm/px</b>nominal datum GSD
        </span>
        <span>
          <b>
            {fmt(diagnostics.forwardOverlap * 100, 0)} /{" "}
            {fmt(diagnostics.sideOverlap * 100, 0)}%
          </b>
          forward / side overlap
        </span>
        <span>
          <b>{diagnostics.tracks.length} tracks</b>seen in two or more images
        </span>
        <span>
          <b>
            {data.observations.filter((o) => !o.checkpoint).length} observations
          </b>
          two image equations each
        </span>
      </div>
      {triangulation && stage === "measure" && (
        <Panel
          tag="MEASURE THE BLOCK"
          title="Follow the same physical feature across the photographs"
        >
          <div className="photo-inline">
            <label>
              Active track
              <select
                id="at-track"
                value={point}
                onChange={(e) => setPoint(+e.target.value)}
              >
                {source.truth.points.map((_, i) => (
                  <option key={i} value={i}>
                    P{i + 1}
                    {source.gcps.includes(i)
                      ? " · GCP"
                      : source.checkpoints.includes(i)
                        ? " · check"
                        : ""}
                  </option>
                ))}
              </select>
            </label>
            <button id="at-detected" onClick={addDetected}>
              Measure selected detected track
            </button>
            <button id="at-populate" onClick={() => setAllMeasured(true)}>
              Populate synthetic tracks
            </button>
            <button
              id="at-clear"
              onClick={() => {
                setMeasurements({});
                setAllMeasured(false);
              }}
            >
              Clear manual ties
            </button>
          </div>
          <p className="photo-note">
            Green rings are measured tracks. The selected track receives your
            actual click coordinates. GCPs/checks are premeasured; incomplete
            one-image ties are excluded from adjustment.
          </p>
          <div className="aerial-gallery">
            {source.truth.cameras.map((_, ci) => (
              <div key={ci}>
                <h3>
                  C{ci + 1} · strip {ci < 3 ? "A" : "B"}
                  <small>
                    {
                      data.observations.filter(
                        (o) => o.ci === ci && !o.checkpoint,
                      ).length
                    }{" "}
                    fitted tracks
                  </small>
                </h3>
                <SurveyPhoto
                  data={source}
                  camera={ci}
                  point={point}
                  selected={
                    allMeasured
                      ? source.observations
                          .filter((o) => o.ci === ci)
                          .map((o) => o.pi)
                      : Object.keys(measurements)
                          .filter((k) => k.startsWith(ci + "-"))
                          .map((k) => +k.split("-")[1])
                  }
                  onSelect={(_, uv) => addMeasurement(ci, uv)}
                />
              </div>
            ))}
          </div>
        </Panel>
      )}
      <div className="photo-workspace">
        <aside className="photo-controls">
          <Panel tag="01 / FLIGHT GEOMETRY" title="Survey & camera network">
            <Slider
              id="ba-altitude"
              label="Height above local datum"
              value={altitude}
              display={altitude + " m"}
              min={90}
              max={180}
              step={5}
              onChange={setAltitude}
            />
            <Slider
              id="ba-baseline"
              label="Along-strip baseline"
              value={baseline}
              display={baseline + " m"}
              min={12}
              max={65}
              onChange={setBaseline}
            />
            <Slider
              id="ba-strips"
              label="Strip separation"
              value={stripSpacing}
              display={stripSpacing + " m"}
              min={16}
              max={70}
              onChange={setStripSpacing}
            />
            <Slider
              id="ba-noise"
              label="Image-coordinate noise σ"
              value={noise}
              display={noise.toFixed(1) + " px"}
              min={0}
              max={3}
              step={0.1}
              onChange={setNoise}
            />
            <label className="photo-select">
              Ground control
              <select
                id="ba-control"
                value={control}
                onChange={(e) => setControl(e.target.value)}
              >
                <option value="distributed">3 distributed GCPs</option>
                <option value="five">5 distributed GCPs</option>
                <option value="collinear">3 collinear GCPs</option>
                <option value="none">No ground control</option>
              </select>
            </label>
            <Slider
              id="ba-control-sigma"
              label="GCP horizontal sigma"
              value={controlSigma}
              display={fmt(controlSigma * 100, 1) + " cm"}
              min={0.01}
              max={0.3}
              step={0.01}
              onChange={setControlSigma}
            />
            <label className="photo-select">
              Position observations
              <select
                id="ba-navigation"
                value={navigation}
                onChange={(e) => setNavigation(e.target.value)}
              >
                <option value="standard">Standard GNSS · metre level</option>
                <option value="rtk">RTK positions · centimetre level</option>
                <option value="off">No camera position priors</option>
              </select>
            </label>
            <label className="photo-check">
              <input
                id="ba-outliers"
                type="checkbox"
                checked={outliers}
                onChange={(e) => setOutliers(e.target.checked)}
              />
              Inject gross image errors
            </label>
            <label className="photo-check">
              <input
                id="ba-calibrate"
                type="checkbox"
                checked={calibrate}
                onChange={(e) => setCalibrate(e.target.checked)}
              />
              Estimate shared focal length &amp; k₁
            </label>
            <label className="photo-check">
              <input
                id="ba-robust"
                type="checkbox"
                checked={robust}
                onChange={(e) => setRobust(e.target.checked)}
              />
              Huber robust image fitting
            </label>
            {calibrate && (
              <p className="photo-alert warning">
                Nadir imagery couples focal length, height and distortion. Low
                pixel RMS alone does not prove calibration.
              </p>
            )}
          </Panel>
          <Panel tag="02 / ADJUST" title="Joint pose & point estimation">
            <div className="photo-actions">
              <button
                id="ba-run"
                className="photo-primary"
                disabled={iteration >= 25}
                onClick={() => setRunning(!running)}
              >
                {running ? "Pause adjustment" : "Run adjustment"}
              </button>
              <button id="ba-step" disabled={running} onClick={step}>
                One iteration
              </button>
              <button
                id="ba-reset"
                onClick={() => {
                  setRunning(false);
                  setSolution(fresh(data, robust));
                }}
              >
                Reset estimates
              </button>
            </div>
            <p className="photo-note">
              {iteration >= 25
                ? "25-iteration limit—not a convergence certificate."
                : "Actual solver steps. Changing geometry, measurements or fitting method resets the experiment."}
            </p>
          </Panel>
        </aside>
        <div className="photo-instruments">
          <Panel
            tag="LIVE 3D AERIAL BLOCK"
            title="Flight strips, terrain & ray bundles"
            className="photo-stage"
          >
            <PhotoLabScene
              build={build}
              initial={[145, -175, 160]}
              target={[0, 0, 48]}
              maxDistance={600}
              label="Six aerial camera stations, terrain, buildings, selected footprint and observation rays in a survey grid."
              onSelect={(part) => {
                if (part.startsWith("camera-")) setCamera(+part.slice(7));
              }}
            />
            <div className="photo-stage-key">
              <span>cyan: ties</span>
              <span>green: weighted GCP</span>
              <span>purple: independent check</span>
              <span>gold: selection / footprint</span>
            </div>
          </Panel>
          <div className="photo-instrument-pair">
            <Panel
              tag="SYNTHETIC IMAGE / ACTUAL OBSERVATIONS"
              title="Measured pixels & residual vectors"
            >
              <div className="photo-inline">
                <label>
                  Image
                  <select
                    id="ba-camera"
                    value={camera}
                    onChange={(e) => setCamera(+e.target.value)}
                  >
                    {source.truth.cameras.map((_, i) => (
                      <option key={i} value={i}>
                        C{i + 1} · strip {i < 3 ? "A" : "B"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Point
                  <select
                    id="ba-point"
                    value={point}
                    onChange={(e) => setPoint(+e.target.value)}
                  >
                    {data.truth.points.map((_, i) => (
                      <option key={i} value={i}>
                        P{i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <SurveyPhoto
                data={data}
                camera={camera}
                state={state}
                point={point}
                residualScale={residualScale}
                onSelect={setPoint}
              />
              <Slider
                id="ba-residual-scale"
                label="Vector magnification"
                value={residualScale}
                display={residualScale + "×"}
                min={1}
                max={40}
                onChange={setResidualScale}
              />
              <p className="photo-note">
                Dots are measured pixels; vectors point toward current
                projections. Purple checks never enter the fit. Procedural
                terrain imagery is synthetic, not an input aerial photograph.
              </p>
            </Panel>
            <Panel
              tag="ACTUAL ITERATION HISTORY"
              title="Fit & intersection geometry"
            >
              <svg
                viewBox="0 0 400 180"
                role="img"
                aria-label="Actual image-coordinate RMS after each iteration, logarithmic scale."
              >
                <path d="M18 18V145H382" stroke="#66838b" fill="none" />
                <polyline
                  points={graph}
                  fill="none"
                  stroke="#ffbc69"
                  strokeWidth="3"
                />
                <text x="20" y="172" fill="#aac0cb" fontSize="11">
                  Iteration 0 → {iteration} · log(1 + RMS px)
                </text>
              </svg>
              <dl>
                <Metric
                  label="Selected track observations"
                  value={data.observations.filter((o) => o.pi === point).length}
                />
                <Metric
                  label="Maximum ray angle"
                  value={selectedHit ? fmt(selectedHit.angle, 1) : "—"}
                  unit="°"
                />
                <Metric
                  label="Closest-ray RMS"
                  value={selectedHit ? fmt(selectedHit.rayRms) : "—"}
                  unit="m"
                />
                <Metric
                  label="Weighted objective"
                  value={fmt(solution.history.at(-1).cost, 2)}
                />
                <Metric
                  label="Last step"
                  value={
                    iteration
                      ? solution.history.at(-1).accepted
                        ? "accepted"
                        : "rejected / stationary"
                      : "not run"
                  }
                />
              </dl>
              <label className="photo-check">
                <input
                  type="checkbox"
                  checked={rays}
                  onChange={(e) => setRays(e.target.checked)}
                />
                Show observation rays
              </label>
              <label className="photo-check">
                <input
                  type="checkbox"
                  checked={reference}
                  onChange={(e) => setReference(e.target.checked)}
                />
                Show tie-to-truth error links (evaluation only)
              </label>
            </Panel>
          </div>
        </div>
        <aside className="photo-diagnostics">
          <Panel tag="03 / INDEPENDENT QA" title="Fit is not map accuracy">
            <div id="ba-rms" className="photo-result">
              {fmt(metrics.rms)}
              <small>px</small>
            </div>
            <p className="photo-note">RMS per fitted image coordinate</p>
            <dl>
              <Metric label="Iterations" value={iteration} />
              <Metric label="Image equations" value={metrics.observations} />
              <Metric
                label="Survey / position equations"
                value={diagnostics.constraintEquations}
              />
              <Metric label="Active unknowns" value={metrics.unknowns} />
              <Metric
                label="Equation surplus (not rank)"
                value={
                  metrics.observations +
                  diagnostics.constraintEquations -
                  metrics.unknowns
                }
              />
              <Metric
                label="Focal length estimate"
                value={fmt(state.f, 2)}
                unit="px"
              />
              <Metric label="Radial k₁ estimate" value={fmt(state.k1, 5)} />
              <Metric
                label="Tie XYZ truth RMSE"
                value={
                  absolute ? fmt(metrics.pointRmse) : "relative / non-unique"
                }
                unit={absolute ? "m" : ""}
              />
              <Metric
                label="Independent check X / Y RMSE"
                value={
                  absolute
                    ? `${fmt(diagnostics.rmseX)} / ${fmt(diagnostics.rmseY)}`
                    : "datum not absolute"
                }
                unit={absolute ? "m" : ""}
              />
              <Metric
                label="Independent check Z RMSE"
                value={absolute ? fmt(diagnostics.rmseZ) : "datum not absolute"}
                unit={absolute ? "m" : ""}
              />
            </dl>
          </Panel>
          <Panel
            tag="DATUM & NETWORK"
            title={
              absolute
                ? "Survey-weighted georeferencing"
                : control === "collinear"
                  ? "Collinear control warning"
                  : "Relative model only"
            }
          >
            <p className={"photo-alert " + (!absolute ? "warning" : "")}>
              {control === "none" && navigation === "off"
                ? "Relative model only: seven arbitrary gauge coordinates are fixed. There is no absolute map frame."
                : control === "collinear" && navigation === "off"
                  ? "Collinear control warning: rotation about the survey line is unobservable."
                  : control === "none"
                    ? "Position observations supply the datum. Accuracy depends on their uncertainty and geometry."
                    : "Ground control is measured with uncertainty and adjusted—not held at truth. Checkpoints never improve the fit."}
            </p>
            <p className="photo-note">
              {diagnostics.connections.length} connected camera pairs. More
              equations do not guarantee a well-conditioned network.
            </p>
            <div className="aerial-checks" id="ba-checkpoints">
              {diagnostics.checks.map((c) => (
                <div key={c.pi}>
                  <b>CP {c.pi + 1}</b>
                  <span>
                    {!c.valid
                      ? "not intersectable"
                      : !absolute
                        ? "relative frame"
                        : `ΔZ ${fmt(c.delta[2])} m · ${fmt(c.angle, 1)}°`}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </PhotoLab>
  );
}
