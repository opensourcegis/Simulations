import { useCallback, useEffect, useMemo, useState } from "react";
import PhotoLabScene from "./PhotoLabScene.jsx";
import { PhotoLab, Panel, Slider, Metric } from "./PhotoLabUI.jsx";
import { createAerialSurvey, intersectObservations } from "./aerial-survey.js";
import {
  initialiseSfm,
  growSfm,
  refineSfm,
  makePairMatches,
} from "./sfm-reconstruction.js";
import { buildSurveyScene } from "./AerialScene.jsx";
import SurveyPhoto from "./SurveyPhoto.jsx";
import "./aerial-lab.css";

const empty = (n) => ({
  f: 1500,
  k1: -0.06,
  cameras: Array(6).fill(null),
  points: Array(n).fill(null),
  registered: [],
  log: [],
  iterations: 0,
});
export default function StructureFromMotion() {
  const [noise, setNoise] = useState(0.5),
    [baseline, setBaseline] = useState(32),
    [outliers, setOutliers] = useState(false),
    [pairChoice, setPairChoice] = useState("0,1"),
    [matched, setMatched] = useState(false),
    [point, setPoint] = useState(14),
    [rays, setRays] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(
      "Generate feature tracks to begin. Camera poses and 3D structure are initially unknown.",
    );
  const data = useMemo(
    () =>
      createAerialSurvey({
        noise,
        baseline,
        outliers,
        control: "none",
        navigation: "off",
      }),
    [noise, baseline, outliers],
  );
  const [model, setModel] = useState(() => empty(data.truth.points.length));
  const pair = pairChoice.split(",").map(Number);
  useEffect(() => {
    setModel(empty(data.truth.points.length));
    setMatched(false);
    setNotice("Inputs changed. Generate tracks and estimate a new seed pair.");
  }, [data, pairChoice]);
  const correspondences = makePairMatches(
    data.observations,
    ...pair,
    1500,
    -0.06,
  );
  const run = (task) => {
    setBusy(true);
    setTimeout(() => {
      try {
        task();
      } catch (error) {
        setNotice(error.message);
      } finally {
        setBusy(false);
      }
    }, 30);
  };
  const seed = () =>
    run(() => {
      const next = initialiseSfm(data.observations, {
        pointCount: data.truth.points.length,
        pair,
      });
      if (next.error) {
        setNotice(next.error);
        return;
      }
      const fitted = refineSfm(next, data.observations, 8);
      setModel(fitted);
      setNotice(
        "Seed estimated from pixels. Translation scale is arbitrary; no known camera or terrain coordinates were supplied.",
      );
    });
  const grow = () =>
    run(() => {
      const next = growSfm(model, data.observations);
      setModel(next.blocked ? next : refineSfm(next, data.observations, 5));
      setNotice(
        next.blocked
          ? "Registration blocked: insufficient consistent tracks. Try lower noise, better overlap, or a different seed pair."
          : "Added one camera by 2D–3D resection, then retriangulated and jointly adjusted registered views.",
      );
    });
  const refine = () =>
    run(() => {
      setModel(refineSfm(model, data.observations, 5));
      setNotice(
        "Five genuine joint bundle iterations completed in the relative coordinate frame.",
      );
    });
  const build = useCallback(
    () =>
      buildSurveyScene({
        data,
        state: model,
        camera: pair[0],
        point,
        rays,
        relative: true,
      }),
    [data, model, pairChoice, point, rays],
  );
  const selectedObs = data.observations.filter(
    (o) => o.pi === point && model.cameras[o.ci],
  );
  const hit = intersectObservations(model, selectedObs);
  const solved = model.points.filter(Boolean).length;
  return (
    <PhotoLab
      name="Structure from motion"
      title="Recover the cameras. Then recover the world."
      intro="A calibrated incremental SfM pipeline: geometric match verification, image-based two-view pose, positive-depth triangulation, camera resection and joint bundle refinement. No perfectly known reference cameras."
      notebook={
        <>
          <h3>What the photographs provide</h3>
          <p>
            The six procedural aerial images contain noisy synthetic feature
            tracks with known correspondence IDs. The image generator knows its
            scene; the reconstruction functions receive only pixel observations
            and the camera calibration f = 1500 px, k₁ = −0.06. Actual SIFT/ORB
            detection, descriptor matching and photographic texture
            reconstruction are not implemented. The “generate tracks” step
            exposes synthetic detector output, not a feature detector benchmark.
          </p>
          <h3>Relative orientation from two images</h3>
          <p>
            Pixels are undistorted and normalized. A seeded 160-trial
            eight-point RANSAC estimates the essential matrix, with a 2 px
            Sampson-distance gate. Hartley normalization improves conditioning;
            the essential matrix is projected to equal nonzero singular values
            and rank two. Four rotation/translation decompositions are tested by
            positive-depth intersection and a 0.5° minimum ray angle. Failed or
            nearly planar/low-parallax pairs can remain unsolved; there is no
            truth-pose fallback. This is an eight-point teaching implementation,
            not the minimal five-point solver.
          </p>
          <h3>Adding cameras and structure</h3>
          <p>
            A new image needs at least six 2D–3D correspondences. Calibrated DLT
            supplies a pose initialization, followed by robust nonlinear pose
            refinement and a 4 px inlier gate. This is not a RANSAC-PnP
            implementation. New multiview tracks are intersected and checked for
            positive depth and parallax. Bundle refinement jointly updates
            registered poses and track XYZ; Huber loss limits large residuals.
          </p>
          <h3>Scale and datum are not observed</h3>
          <p>
            Monocular imagery has seven similarity freedoms. The first recovered
            camera defines the origin/orientation; another baseline coordinate
            fixes an arbitrary scale. Neither camera is fixed at synthetic
            truth. Labels are relative units, not surveyed metres. Camera/point
            truth and GCP XYZ do not enter reconstruction. Absolute accuracy
            requires independent survey alignment and checks, explored in the
            aerial triangulation lab.
          </p>
          <h3>Do not confuse sparse structure with a surface</h3>
          <p>
            The view shows only reconstructed sparse features. A filled building
            mesh or dense surface is not fabricated from scene truth. Dense
            multiview stereo, meshing, radiometric matching, rolling shutter,
            uncertain calibration and production-scale sparse optimization
            remain outside this demonstration. Higher noise or bad matches can
            block registration rather than always producing a successful model.
            References: Hartley &amp; Zisserman, Multiple View Geometry;
            Schönberger &amp; Frahm (2016), Structure-from-Motion Revisited.
          </p>
        </>
      }
    >
      <div className="sfm-pipeline">
        <button
          id="sfm-match"
          disabled={busy}
          className={matched ? "active" : ""}
          onClick={() => {
            setMatched(true);
            setNotice(
              "Synthetic feature tracks generated. Inspect their corresponding image locations, then estimate the seed pose.",
            );
          }}
        >
          <span>01 / FEATURES</span>Generate synthetic tracks
        </button>
        <button
          id="sfm-seed"
          disabled={!matched || busy}
          className={model.registered.length ? "active" : ""}
          onClick={seed}
        >
          <span>02 / RELATIVE ORIENTATION</span>Estimate seed pair
        </button>
        <button
          id="sfm-grow"
          disabled={
            model.registered.length < 2 || model.registered.length >= 6 || busy
          }
          onClick={grow}
        >
          <span>03 / INCREMENTAL MAPPING</span>Register next camera
        </button>
        <button
          id="sfm-refine"
          disabled={model.registered.length < 2 || busy}
          onClick={refine}
        >
          <span>04 / GLOBAL REFINEMENT</span>Joint bundle adjustment
        </button>
      </div>
      <div className="aerial-summary">
        <span>
          <b id="sfm-registered">{model.registered.length} / 6</b>registered
          cameras
        </span>
        <span>
          <b id="sfm-points">{solved} points</b>reconstructed sparse tracks
        </span>
        <span>
          <b id="sfm-rms">
            {Number.isFinite(model.rms) ? model.rms.toFixed(3) : "—"} px
          </b>
          raw image-coordinate RMS
        </span>
        <span>
          <b>Relative frame</b>scale is not surveyed
        </span>
      </div>
      <div className="photo-workspace">
        <aside className="photo-controls">
          <Panel tag="IMAGE EVIDENCE" title="Geometry & match quality">
            <Slider
              id="sfm-noise"
              label="Detector noise σ"
              value={noise}
              display={noise.toFixed(1) + " px"}
              min={0}
              max={1.5}
              step={0.1}
              onChange={setNoise}
            />
            <Slider
              id="sfm-baseline"
              label="Synthetic flight baseline"
              value={baseline}
              display={baseline + " m"}
              min={12}
              max={55}
              onChange={setBaseline}
            />
            <label className="photo-select">
              Seed pair
              <select
                id="sfm-pair"
                value={pairChoice}
                onChange={(e) => setPairChoice(e.target.value)}
              >
                <option value="0,1">C1 / C2 · adjacent strip views</option>
                <option value="0,2">C1 / C3 · longer baseline</option>
                <option value="0,3">C1 / C4 · cross-strip</option>
              </select>
            </label>
            <label className="photo-check">
              <input
                id="sfm-outliers"
                type="checkbox"
                checked={outliers}
                onChange={(e) => setOutliers(e.target.checked)}
              />
              Inject gross correspondence errors
            </label>
            <label className="photo-select">
              Inspect track
              <select
                id="sfm-point"
                value={point}
                onChange={(e) => setPoint(+e.target.value)}
              >
                {data.truth.points.map((_, i) => (
                  <option key={i} value={i}>
                    P{i + 1}
                    {data.checkpoints.includes(i) ? " · withheld" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="photo-check">
              <input
                type="checkbox"
                checked={rays}
                onChange={(e) => setRays(e.target.checked)}
              />
              Show triangulation rays
            </label>
            <div className="photo-actions">
              <button
                id="sfm-reset"
                disabled={busy}
                onClick={() => {
                  setModel(empty(data.truth.points.length));
                  setMatched(false);
                  setNotice("Reconstruction cleared. No cameras are known.");
                }}
              >
                Reset reconstruction
              </button>
            </div>
            <p className="photo-note">
              Scene-design baseline is in metres; reconstruction remains in
              arbitrary relative units. Noise and geometry changes clear solved
              results.
            </p>
          </Panel>
          <Panel
            tag="PROCESS STATUS"
            title={
              busy
                ? "Computing geometric solution…"
                : "Evidence, not an animation"
            }
          >
            <p id="sfm-status" role="status" className="photo-alert">
              {notice}
            </p>
            <ol className="aerial-log">
              {model.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </Panel>
        </aside>
        <div className="photo-instruments">
          <Panel
            tag="SPARSE RECONSTRUCTION / RELATIVE UNITS"
            title="Only recovered cameras and points"
            className="photo-stage"
          >
            <PhotoLabScene
              build={build}
              initial={[4, -6, 4]}
              target={[1, 0, -3]}
              label="Image-estimated cameras and sparse triangulated points in an arbitrary relative reference frame. Unsolved cameras are not displayed."
            />
            <div className="photo-stage-key">
              <span>gold: recovered cameras</span>
              <span>cyan: reconstructed tracks</span>
              <span>no truth cameras or fabricated surface</span>
            </div>
          </Panel>
          <Panel
            tag="OBSERVATION TRACKS"
            title="The same physical feature in overlapping images"
          >
            <p className="photo-note">
              These are synthetic perspective images with detector-noisy feature
              centroids. Select a point to follow its track. Only image
              coordinates and calibration are passed to the reconstruction—not
              synthetic camera poses.
            </p>
            <div className="aerial-gallery">
              {data.truth.cameras.map((_, ci) => (
                <div key={ci}>
                  <h3>
                    C{ci + 1}
                    <small>
                      {model.cameras[ci] ? "REGISTERED" : "POSE UNKNOWN"}
                    </small>
                  </h3>
                  <SurveyPhoto
                    data={data}
                    camera={ci}
                    point={point}
                    selected={
                      matched
                        ? data.observations
                            .filter((o) => o.ci === ci && !o.checkpoint)
                            .map((o) => o.pi)
                        : []
                    }
                    onSelect={setPoint}
                  />
                </div>
              ))}
            </div>
          </Panel>
        </div>
        <aside className="photo-diagnostics">
          <Panel tag="GEOMETRIC VERIFICATION" title="Seed & depth evidence">
            <dl>
              <Metric
                label="Seed pair correspondences"
                value={matched ? correspondences.length : 0}
              />
              <Metric label="RANSAC inliers" value={model.inliers ?? "—"} />
              <Metric
                label="Rejected seed matches"
                value={model.rejected ?? "—"}
              />
              <Metric label="Joint iterations" value={model.iterations ?? 0} />
              <Metric
                label="Selected registered views"
                value={selectedObs.length}
              />
              <Metric
                label="Selected maximum ray angle"
                value={hit ? hit.angle.toFixed(2) : "—"}
                unit="°"
              />
              <Metric
                label="Ray intersection RMS"
                value={hit ? hit.rayRms.toFixed(4) : "—"}
                unit="rel. units"
              />
            </dl>
            <p className="photo-note">
              RANSAC consensus is a geometric test, not proof of correct
              identity. Low parallax or near-planarity can defeat
              initialization.
            </p>
          </Panel>
          <Panel
            tag="NEXT: GEOREFERENCING"
            title="Relative shape is not a survey"
          >
            <p className="photo-note">
              No absolute metres or truth-error score is claimed for the
              recovered model. Use weighted survey control and withheld
              checkpoints to assess a mapped block.
            </p>
            <div className="photo-actions">
              <a
                href={
                  import.meta.env.BASE_URL + "?simulation=aerial-triangulation"
                }
              >
                Open aerial triangulation →
              </a>
              <a
                href={import.meta.env.BASE_URL + "?simulation=block-adjustment"}
              >
                Inspect weighted bundle adjustment →
              </a>
            </div>
          </Panel>
        </aside>
      </div>
    </PhotoLab>
  );
}
