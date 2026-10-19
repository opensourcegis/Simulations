import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import PhotoLabScene, { caption, marker, segment } from "./PhotoLabScene.jsx";
import { PhotoLab, Panel, Slider, Metric } from "./PhotoLabUI.jsx";
import {
  createBundle,
  bundleStep,
  bundleMetrics,
  bundleResiduals,
  project,
  cameraRay,
} from "./photogrammetry-model.js";

const fresh = (data) => ({
  state: data.initial,
  lambda: 0.01,
  history: [
    {
      ...bundleMetrics(data, data.initial),
      cost: bundleResiduals(data, data.initial).reduce(
        (s, x) => s + (x * x) / 2,
        0,
      ),
    },
  ],
});
export default function BlockAdjustment() {
  const [baseline, setBaseline] = useState(7),
    [stripSpacing, setStripSpacing] = useState(7),
    [noise, setNoise] = useState(0.5),
    [control, setControl] = useState("distributed");
  const [outliers, setOutliers] = useState(false),
    [calibrate, setCalibrate] = useState(false),
    [robust, setRobust] = useState(true);
  const [camera, setCamera] = useState(0),
    [point, setPoint] = useState(12),
    [rays, setRays] = useState(true),
    [reference, setReference] = useState(true),
    [residualScale, setResidualScale] = useState(10),
    [running, setRunning] = useState(false);
  const data = useMemo(
    () =>
      createBundle({
        baseline,
        stripSpacing,
        noise,
        control,
        outliers,
        calibrate,
      }),
    [baseline, stripSpacing, noise, control, outliers, calibrate],
  );
  const [solution, setSolution] = useState(() => fresh(data));
  const photo = useRef(null);
  useEffect(() => {
    setSolution(fresh(data));
    setRunning(false);
  }, [data, robust]);
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
    const timer = setTimeout(step, 180);
    return () => clearTimeout(timer);
  }, [running, solution.history.length, step]);
  const metrics = bundleMetrics(data, solution.state),
    iteration = solution.history.length - 1;
  const build = useCallback(() => {
    const group = new THREE.Group(),
      grid = new THREE.GridHelper(32, 16, 0x3d5864, 0x243d48);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.7;
    group.add(grid);
    data.truth.points.forEach((p, i) => {
      if (reference) marker(group, p, 0x516c77, 0.09);
      const q = solution.state.points[i],
        gcp = data.gcps.includes(i),
        check = data.checkpoints.includes(i);
      if (check) {
        marker(group, p, 0xc192ff, 0.19);
        return;
      }
      marker(
        group,
        q,
        gcp ? 0x62d99d : i === point ? 0xffd665 : 0x5ad1ff,
        i === point ? 0.25 : 0.13,
      );
      if (gcp)
        caption(
          group,
          "GCP " + (i + 1),
          [...q.slice(0, 2), q[2] + 0.55],
          "#7ee0ad",
          1.4,
        );
    });
    solution.state.cameras.forEach((cam, ci) => {
      marker(group, cam.c, ci === camera ? 0xffd665 : 0xff9d63, 0.24);
      const corners = [
        [0, 0],
        [1600, 0],
        [1600, 1200],
        [0, 1200],
      ].map(([u, v]) => {
        const d = cameraRay(cam, u, v, solution.state.f);
        return cam.c.map((x, j) => x + d[j] * 4);
      });
      segment(
        group,
        [...corners, corners[0]],
        ci === camera ? 0xffd665 : 0xc98864,
        0.8,
      );
      corners.forEach((p) => segment(group, [cam.c, p], 0xc98864, 0.7));
      caption(
        group,
        "C" + (ci + 1),
        [cam.c[0], cam.c[1], cam.c[2] + 1],
        "#ffd0a5",
        1.6,
      );
      if (rays)
        data.observations
          .filter(
            (o) =>
              o.ci === ci && !o.checkpoint && (o.pi === point || ci === camera),
          )
          .forEach((o) =>
            segment(
              group,
              [cam.c, solution.state.points[o.pi]],
              o.pi === point ? 0xffd665 : 0x4e94a7,
              o.pi === point ? 0.8 : 0.18,
            ),
          );
    });
    caption(group, "WORLD · metres · Z up", [0, -12, -0.5], "#88a5b2", 1.4);
    return group;
  }, [data, solution.state, point, camera, rays, reference]);
  useEffect(() => {
    const canvas = photo.current,
      ctx = canvas.getContext("2d");
    ctx.fillStyle = "#101e29";
    ctx.fillRect(0, 0, 400, 300);
    ctx.strokeStyle = "#253c4a";
    for (let x = 0; x <= 400; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 300);
      ctx.stroke();
    }
    for (let y = 0; y <= 300; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(400, y);
      ctx.stroke();
    }
    data.observations
      .filter((o) => o.ci === camera)
      .forEach((o) => {
        const x = o.u / 4,
          y = o.v / 4,
          q = project(
            solution.state.cameras[camera],
            solution.state.points[o.pi],
            solution.state.f,
          );
        ctx.fillStyle = o.checkpoint
          ? "#c192ff"
          : data.gcps.includes(o.pi)
            ? "#62d99d"
            : "#5ad1ff";
        ctx.beginPath();
        ctx.arc(x, y, o.pi === point ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        if (!o.checkpoint && q) {
          ctx.strokeStyle = o.bad ? "#ff7b6b" : "#ffcb62";
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(
            x + ((q[0] - o.u) / 4) * residualScale,
            y + ((q[1] - o.v) / 4) * residualScale,
          );
          ctx.stroke();
        }
        if (o.pi === point) {
          ctx.fillStyle = "#f5d477";
          ctx.font = "12px monospace";
          ctx.fillText("P" + (o.pi + 1), x + 7, y - 6);
        }
      });
  }, [data, solution.state, camera, point, residualScale]);
  const choosePoint = (e) => {
    const r = e.currentTarget.getBoundingClientRect(),
      x = ((e.clientX - r.left) / r.width) * 1600,
      y = ((e.clientY - r.top) / r.height) * 1200;
    const nearest = data.observations
      .filter((o) => o.ci === camera)
      .sort(
        (a, b) => Math.hypot(a.u - x, a.v - y) - Math.hypot(b.u - x, b.v - y),
      )[0];
    if (nearest) setPoint(nearest.pi);
  };
  const georeferenced = control === "distributed" || control === "five";
  const graph = solution.history
    .map(
      (h, i) =>
        `${18 + (i / Math.max(1, solution.history.length - 1)) * 364},${145 - (Math.log1p(h.rms) / Math.log1p(solution.history[0].rms)) * 125}`,
    )
    .join(" ");
  return (
    <PhotoLab
      name="Bundle block adjustment"
      title="Many images. One consistent world."
      intro="Adjust six camera poses and a network of 3D points against actual noisy image observations. Inspect the rays, residuals and independent checkpoint evidence."
      notebook={
        <>
          <h3>What is being solved?</h3>
          <p>
            For each observation: q = Rᵀ · [X−Xc, −(Y−Yc), Zc−Z], u = 800 + f
            qx/qz, v = 600 + f qy/qz. Angles are radians; the image is 1600 ×
            1200 pixels; f is pixels. The base camera looks down world Z, with
            image Y downward. A 3D point and a camera must predict the same
            measured image location.
          </p>
          <p>
            The solver jointly updates 6 exterior orientation parameters per
            camera and 3 coordinates per tie point. Optionally it estimates one
            shared focal length; principal point and distortion stay fixed.
            Finite-difference Jacobians, damped normal equations and
            accept/reject Levenberg–Marquardt steps minimise actual residuals.
            Huber fitting downweights large radial residuals. Raw RMS is per
            image coordinate and can be higher with robust fitting even when 3D
            error improves.
          </p>
          <h3>Control, datum and independent checks</h3>
          <p>
            GCP XYZ are held exact, not noisy weighted observations. Distributed
            non-collinear control constrains the similarity datum but does not
            guarantee good geometry or calibration. Collinear control leaves
            rotation about its line unobservable. Without GCPs, the first
            estimated camera pose and one baseline coordinate are fixed (seven
            datum parameters): the result is relative, not an absolute map.
            Equation surplus does not prove full rank.
          </p>
          <p>
            The three purple checkpoints have image measurements withheld from
            adjustment. After each iteration their coordinates are intersected
            using estimated cameras and compared with synthetic reference XYZ.
            Their images can contain injected outliers. Tie-point reference RMSE
            uses synthetic truth, not independent survey checks. Absolute
            metrics are suppressed for a defective absolute datum.
          </p>
          <h3>Try three controlled comparisons</h3>
          <ol>
            <li>
              Run the clean block. Inspect camera corrections and shrinking
              residuals.
            </li>
            <li>
              Enable gross errors. Compare robust fitting on and off: the lowest
              raw RMS need not give the best ground coordinates.
            </li>
            <li>
              Compare distributed, collinear and no control. Good pixel
              agreement alone cannot certify georeferencing.
            </li>
          </ol>
          <h3>Scope and references</h3>
          <p>
            Small synthetic 2 × 3 block, exact correspondences, no occlusion,
            distortion fixed to zero, Gaussian image-coordinate noise, sparse
            gross errors, no GNSS/IMU priors or GCP covariance. Near-parallel
            nadir imagery can weakly constrain focal length and height. This
            dense demonstration is not a production sparse bundle solver.
            Further reading: Triggs et al., “Bundle Adjustment — A Modern
            Synthesis” (2000); Hartley &amp; Zisserman, Multiple View Geometry.
          </p>
        </>
      }
    >
      <div className="photo-workspace">
        <aside className="photo-controls">
          <Panel tag="01 / DESIGN THE BLOCK" title="Geometry & observations">
            <Slider
              id="ba-baseline"
              label="Along-strip baseline"
              value={baseline}
              display={baseline + " m"}
              min={3}
              max={12}
              onChange={setBaseline}
            />
            <Slider
              id="ba-strips"
              label="Strip separation"
              value={stripSpacing}
              display={stripSpacing + " m"}
              min={4}
              max={14}
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
            <label className="photo-select" htmlFor="ba-control">
              Ground control
              <select
                id="ba-control"
                value={control}
                onChange={(e) => setControl(e.target.value)}
              >
                <option value="distributed">3 distributed GCPs</option>
                <option value="five">5 distributed GCPs</option>
                <option value="collinear">3 collinear GCPs</option>
                <option value="none">No GCPs · relative datum</option>
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
                type="checkbox"
                checked={calibrate}
                onChange={(e) => setCalibrate(e.target.checked)}
              />
              Estimate shared focal length
            </label>
            <label className="photo-check">
              <input
                id="ba-robust"
                type="checkbox"
                checked={robust}
                onChange={(e) => setRobust(e.target.checked)}
              />
              Huber robust fitting
            </label>
            {calibrate && (
              <p className="photo-alert warning">
                Parallel nadir views weakly constrain focal length versus flying
                height. A low image RMS can coexist with a biased focal
                estimate.
              </p>
            )}
          </Panel>
          <Panel tag="02 / ADJUST" title="Solve the real residuals">
            <div className="photo-actions">
              <button
                id="ba-run"
                disabled={iteration >= 25}
                className="photo-primary"
                onClick={() => setRunning(!running)}
              >
                {running ? "Pause adjustment" : "Run adjustment"}
              </button>
              <button id="ba-step" disabled={running} onClick={step}>
                One iteration
              </button>
              <button
                onClick={() => {
                  setRunning(false);
                  setSolution(fresh(data));
                }}
              >
                Reset estimates
              </button>
            </div>
            {iteration >= 25 && (
              <p className="photo-alert" role="status">
                25-iteration run limit reached. This is not a convergence
                certificate; reset estimates to start again, or inspect
                individual steps.
              </p>
            )}
            <p className="photo-note">
              Changing geometry, noise or loss resets the same seeded
              experiment. No synthetic convergence curve is used.
            </p>
          </Panel>
        </aside>
        <div className="photo-instruments">
          <Panel
            tag="LIVE 3D BLOCK"
            title="Camera bundles & ground network"
            className="photo-stage"
          >
            <PhotoLabScene
              build={build}
              label="Six camera frustums, estimated tie points, exact ground control and withheld checkpoints in an orbitable 3D block."
            />
            <div className="photo-stage-key">
              <span>● cyan: adjusted ties</span>
              <span>● green: exact GCP</span>
              <span>● purple: withheld check</span>
              <span>● gold: selection</span>
            </div>
          </Panel>
          <div className="photo-instrument-pair">
            <Panel
              tag="IMAGE OBSERVATIONS"
              title="Measured points & residual vectors"
            >
              <div className="photo-inline">
                <label>
                  Image
                  <select
                    id="ba-camera"
                    value={camera}
                    onChange={(e) => setCamera(+e.target.value)}
                  >
                    {data.truth.cameras.map((_, i) => (
                      <option key={i} value={i}>
                        Camera {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Point
                  <select
                    value={point}
                    onChange={(e) => setPoint(+e.target.value)}
                  >
                    {data.truth.points.map((_, i) => (
                      <option key={i} value={i}>
                        P{i + 1}
                        {data.gcps.includes(i)
                          ? " · GCP"
                          : data.checkpoints.includes(i)
                            ? " · check"
                            : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <canvas
                ref={photo}
                width="400"
                height="300"
                onClick={choosePoint}
                role="img"
                aria-label="Measured dots and magnified reprojection vectors. Use the point selector for keyboard selection."
              />
              <Slider
                id="ba-residual-scale"
                label="Vector display magnification"
                value={residualScale}
                display={residualScale + "×"}
                min={1}
                max={40}
                onChange={setResidualScale}
              />
              <p className="photo-note">
                Dots are measurements, arrows point toward projections. Purple
                checkpoints never enter the fit. Click a dot or use the
                selector.
              </p>
            </Panel>
            <Panel tag="ACTUAL ITERATION HISTORY" title="Image-coordinate RMS">
              <svg
                viewBox="0 0 400 180"
                role="img"
                aria-label="Actual image-coordinate RMS after each iteration, logarithmic vertical scale."
              >
                <path d="M18 18V145H382" stroke="#66838b" fill="none" />
                <polyline
                  points={graph}
                  fill="none"
                  stroke="#ffbc69"
                  strokeWidth="3"
                />
                <text x="20" y="172" fill="#aac0cb" fontSize="11">
                  Iteration 0 → {iteration} · log(1 + RMS in px)
                </text>
              </svg>
              <p className="photo-note">
                Accepted steps reduce the selected objective, not necessarily
                raw RMS. A low pixel residual does not prove map accuracy.
              </p>
              <label className="photo-check">
                <input
                  type="checkbox"
                  checked={rays}
                  onChange={(e) => setRays(e.target.checked)}
                />
                Show observation bundles
              </label>
              <label className="photo-check">
                <input
                  type="checkbox"
                  checked={reference}
                  onChange={(e) => setReference(e.target.checked)}
                />
                Show reference points
              </label>
            </Panel>
          </div>
        </div>
        <aside className="photo-diagnostics">
          <Panel tag="03 / EVALUATE" title="Adjustment evidence">
            <div id="ba-rms" className="photo-result">
              {metrics.rms.toFixed(3)}
              <small>px</small>
            </div>
            <p className="photo-note">Raw RMS per measured image coordinate</p>
            <dl>
              <Metric label="Iterations completed" value={iteration} />
              <Metric
                label="Image-coordinate equations"
                value={metrics.observations}
              />
              <Metric label="Active unknowns" value={metrics.unknowns} />
              <Metric
                label="Equation surplus (not rank)"
                value={metrics.observations - metrics.unknowns}
              />
              <Metric
                label="Estimated focal length"
                value={solution.state.f.toFixed(2)}
                unit="px"
              />
              <Metric
                label="Tie XYZ reference RMSE"
                value={
                  georeferenced
                    ? metrics.pointRmse.toFixed(3)
                    : "relative / non-unique"
                }
                unit={georeferenced ? "m" : ""}
              />
              <Metric
                label="Withheld checkpoint RMSE"
                value={
                  georeferenced
                    ? metrics.checkpointRmse.toFixed(3)
                    : "datum not absolute"
                }
                unit={georeferenced ? "m" : ""}
              />
            </dl>
          </Panel>
          <Panel
            tag="DATUM & OBSERVABILITY"
            title={
              georeferenced
                ? "Distributed ground control"
                : control === "none"
                  ? "Relative model only"
                  : "Collinear control warning"
            }
          >
            <p className={"photo-alert " + (!georeferenced ? "warning" : "")}>
              {georeferenced
                ? "Control anchors the block; geometry, noise and calibration still govern the result."
                : control === "none"
                  ? "Seven datum parameters are fixed to the initial camera network. Absolute position, attitude and scale are not independently recovered."
                  : "A line of control points cannot fix rotation about that line. Damping is not evidence of a unique solution."}
            </p>
            <p className="photo-note">
              Only visible points contribute equations. More overlap can add
              rays, but a smaller baseline can weaken depth intersection.
            </p>
          </Panel>
        </aside>
      </div>
    </PhotoLab>
  );
}
