import { useMemo, useState } from "react";
import { generateSceneData, tinTerrainQuality } from "./tin-model.js";
import { tinSimpleLesson } from "./tin-simple-model.js";
import "./tin-simple.css";
const STAGES = [
  "Choose seeds",
  "Connect seeds",
  "Test a point",
  "Update the mesh",
  "Run the filter",
];
const TEXT = [
  "Pick the lowest eligible measured point in each cell. Gold points are seed hypotheses—not guaranteed ground.",
  "Connect the seeds with a Delaunay triangulation in XY. Their measured heights form the first 3D terrain surface.",
  "Find the triangle below the selected point. It must pass BOTH the perpendicular distance and facet-relative angle tests.",
  "If both tests pass, add the point and recompute the triangulation. Otherwise leave the mesh unchanged and defer the point.",
  "Run the full progressive filter from the seeds. Check coverage and height error; convergence alone does not prove the ground is correct.",
];
export default function TinEssentials({
  settings: s,
  onChange: change,
  onAdvanced,
}) {
  const [step, setStep] = useState(0),
    [choice, setChoice] = useState(0);
  const { points } = useMemo(
    () => generateSceneData(s.preset, s.density, s),
    [s.preset, s.density, s.noiseSigma, s.penetration],
  );
  const lesson = useMemo(() => tinSimpleLesson(points, s), [points, s]);
  const selected = lesson.candidates[choice],
    test = selected?.test,
    initial = lesson.initial;
  const snapshot =
    step === 4
      ? lesson.result
      : step === 3 && selected
        ? selected.after
        : initial;
  const triangles = step === 0 ? [] : (snapshot?.triangles ?? []),
    ground =
      step === 3
        ? selected?.after.groundSet
        : step === 4
          ? lesson.result?.groundSet
          : initial?.groundSet;
  const quality = useMemo(
    () =>
      step === 4 && snapshot
        ? tinTerrainQuality(points, snapshot, s.preset, s.maxEdge)
        : null,
    [step, points, snapshot, s.preset, s.maxEdge],
  );
  const byId = new Map(points.map((p) => [p.id, p])),
    key = (t) => [...t].sort((a, b) => a - b).join(","),
    oldKeys = new Set(initial?.triangles.map(key) || []),
    newKeys = new Set(triangles.map(key));
  const added = step === 3 ? triangles.filter((t) => !oldKeys.has(key(t))) : [],
    removed =
      step === 3 ? initial.triangles.filter((t) => !newKeys.has(key(t))) : [];
  const X = (v) => 148 + v * 3.8,
    Y = (v) => 420 - v * 3.8,
    path = (ids) =>
      ids
        .map((id) => {
          const p = byId.get(id);
          return X(p.x) + "," + Y(p.y);
        })
        .join(" ");
  const adjust = (patch) => {
    setStep(0);
    change(patch);
  };
  return (
    <div className="tin-simple">
      <header className="tin-simple-header">
        <a href={import.meta.env.BASE_URL}>← All laboratories</a>
        <span>LIDAR / GROUND FILTERING</span>
      </header>
      <div className="tin-simple-intro">
        <div>
          <p>THE TIN LESSON</p>
          <h1>Build a ground surface in five steps.</h1>
          <span>
            Choose seeds. Test one point. See why the triangles change.
          </span>
        </div>
        <button id="tin-open-advanced" onClick={onAdvanced}>
          Open full inspector ↗
        </button>
      </div>
      <nav className="tin-simple-stages" aria-label="TIN overview steps">
        {STAGES.map((title, i) => (
          <button
            id={"tin-simple-step-" + i}
            key={title}
            aria-current={step === i ? "step" : undefined}
            onClick={() => setStep(i)}
          >
            <span>{i + 1}</span>
            {title}
          </button>
        ))}
      </nav>
      <main className="tin-simple-workspace">
        <section className="tin-simple-main">
          <div className="tin-simple-step-heading">
            <span>STEP {step + 1} OF 5</span>
            <h2 id="tin-simple-title">{STAGES[step]}</h2>
            <p>{TEXT[step]}</p>
          </div>
          <svg
            id="tin-simple-plan"
            viewBox="0 0 700 470"
            role="img"
            aria-label="XY plan of measured points, seeds and actual supported TIN facets"
          >
            <rect x="148" y="40" width="380" height="380" fill="#f4f7ee" />
            {step === 0 &&
              initial?.seedCells.map((c, i) => (
                <rect
                  key={i}
                  x={X(c.x0)}
                  y={Y(c.y1)}
                  width={(c.x1 - c.x0) * 3.8}
                  height={(c.y1 - c.y0) * 3.8}
                  stroke="#d3dccb"
                  fill="none"
                />
              ))}
            {triangles.map((ids, i) => (
              <polygon
                key={i}
                points={path(ids)}
                fill="#5c8c6a0d"
                stroke="#77977b"
                strokeWidth="1"
              />
            ))}
            {step >= 2 && step <= 3 && test && (
              <polygon
                points={path(test.facetIds)}
                fill="#5fa4c224"
                stroke="#3585aa"
                strokeWidth="2"
              />
            )}
            {removed.map((ids, i) => (
              <polygon
                key={"old" + i}
                points={path(ids)}
                fill="none"
                stroke="#c68b52"
                strokeDasharray="5 4"
                strokeWidth="1.5"
              />
            ))}
            {added.map((ids, i) => (
              <polygon
                key={"new" + i}
                points={path(ids)}
                fill="#6bb38322"
                stroke="#2d8551"
                strokeWidth="2"
              />
            ))}
            {points.map((p) => (
              <circle
                key={p.id}
                cx={X(p.x)}
                cy={Y(p.y)}
                r={
                  initial?.seedSet.has(p.id) ? 4 : ground?.has(p.id) ? 2.8 : 1.8
                }
                fill={
                  initial?.seedSet.has(p.id)
                    ? "#bd953b"
                    : ground?.has(p.id)
                      ? "#658a69"
                      : "#a9b7b1"
                }
                opacity={ground?.has(p.id) ? 1 : 0.5}
              />
            ))}
            {step >= 2 && step <= 3 && test && (
              <>
                <circle
                  cx={X(byId.get(test.id).x)}
                  cy={Y(byId.get(test.id).y)}
                  r="7"
                  fill="#e8bb63"
                  stroke="#996f28"
                  strokeWidth="2"
                />
                <text
                  x={X(byId.get(test.id).x) + 10}
                  y={Y(byId.get(test.id).y) - 10}
                  fontSize="12"
                  fill="#805a22"
                >
                  P{test.id}
                </text>
              </>
            )}
            <path d="M148 40V420H528" fill="none" stroke="#637e66" />
            {[0, 25, 50, 75, 100].map((v) => (
              <g key={v} fontSize="10" fill="#6b7e6d">
                <text x={X(v)} y="440" textAnchor="middle">
                  {v}
                </text>
                <text x="136" y={Y(v) + 4} textAnchor="end">
                  {v}
                </text>
              </g>
            ))}
            <text
              x="336"
              y="460"
              textAnchor="middle"
              fontSize="11"
              fill="#6b7e6d"
            >
              X (m) · Y upwards · equal XY scale · plan view, not elevation
            </text>
          </svg>
          <div className="tin-simple-key">
            <span>
              <i style={{ background: "#bd953b" }} />
              Seed
            </span>
            <span>
              <i style={{ background: "#a9b7b1" }} />
              Not yet accepted
            </span>
            <span>
              <i style={{ background: "#3585aa" }} />
              Tested triangle
            </span>
            <span>
              <i style={{ background: "#2d8551" }} />
              New facets
            </span>
          </div>
          <div className="tin-simple-navigation">
            <button
              id="tin-simple-prev"
              disabled={step === 0}
              onClick={() => setStep((n) => n - 1)}
            >
              ← Back
            </button>
            <span>{step + 1} / 5</span>
            <button
              id="tin-simple-next"
              disabled={step === 4}
              onClick={() => setStep((n) => n + 1)}
            >
              Next step →
            </button>
            <button
              id="tin-final"
              className="tin-simple-final"
              onClick={() => setStep(4)}
            >
              Show final ground
            </button>
          </div>
        </section>
        <aside className="tin-simple-sidebar">
          <section>
            <h3>Change the terrain</h3>
            <div className="tin-simple-presets">
              {[
                ["hills", "Rolling ground"],
                ["steep", "Ridge"],
                ["urban", "Buildings"],
                ["noise", "Low outliers"],
              ].map(([id, name]) => (
                <button
                  key={id}
                  aria-pressed={s.preset === id}
                  onClick={() => adjust({ preset: id })}
                >
                  {name}
                </button>
              ))}
            </div>
            <label>
              Distance limit <b>{s.maxDist.toFixed(1)} m</b>
              <input
                id="tin-simple-distance"
                type="range"
                min=".2"
                max="3"
                step=".1"
                value={s.maxDist}
                onChange={(e) => adjust({ maxDist: +e.target.value })}
              />
            </label>
            <label>
              Angle limit <b>{s.maxAngle}°</b>
              <input
                id="tin-simple-angle"
                type="range"
                min="1"
                max="25"
                step="1"
                value={s.maxAngle}
                onChange={(e) => adjust({ maxAngle: +e.target.value })}
              />
            </label>
            <p>
              Distance is perpendicular to the triangle’s plane. Angle measures
              departure from that plane—not hillside slope.
            </p>
            {s.adaptive && (
              <p>
                Adaptive bounds are active from the full inspector; the tested
                local distance limit may be smaller than the slider cap.
              </p>
            )}
          </section>
          <section className="tin-simple-current">
            <span>CURRENT STEP</span>
            {step <= 1 ? (
              <>
                <h3>
                  {step === 0
                    ? "Start with plausible ground"
                    : "Join the seed points"}
                </h3>
                <p>
                  {initial?.seedSet.size ?? 0} seeds from{" "}
                  {initial?.seedCells.length ?? 0} cells.{" "}
                  {step === 1
                    ? `${triangles.length} supported facets connect their measured heights.`
                    : "A cell entirely covered by a roof can supply a bad seed."}
                </p>
              </>
            ) : step <= 3 && test ? (
              <>
                <h3>Test P{test.id}</h3>
                <div className="tin-simple-choice">
                  <button
                    aria-pressed={choice === 0}
                    onClick={() => setChoice(0)}
                  >
                    Near the surface
                  </button>
                  <button
                    aria-pressed={choice === 1}
                    onClick={() => setChoice(1)}
                  >
                    Farther from it
                  </button>
                </div>
                <dl>
                  <div>
                    <dt>Perpendicular distance</dt>
                    <dd id="tin-simple-d">{test.d.toFixed(3)} m</dd>
                  </div>
                  <div>
                    <dt>Local distance limit</dt>
                    <dd>{test.distanceLimit.toFixed(3)} m</dd>
                  </div>
                  <div>
                    <dt>Insertion angle</dt>
                    <dd>{test.angle.toFixed(2)}°</dd>
                  </div>
                </dl>
                <p
                  className={
                    test.accepted ? "tin-simple-pass" : "tin-simple-defer"
                  }
                  id="tin-simple-decision"
                >
                  {test.accepted
                    ? "Both tests pass → insert"
                    : "At least one test fails → defer"}
                </p>
                <p>
                  {step === 3
                    ? test.accepted
                      ? `${removed.length} previous facets are replaced by ${added.length} new facets.`
                      : "No insertion: the triangles stay unchanged. The point may be retested later."
                    : "The blue triangle is the supporting facet. The yellow point’s distance and angle are calculated in 3D, not measured from this XY picture."}
                </p>
              </>
            ) : step <= 3 ? (
              <>
                <h3>No supported candidate</h3>
                <p>
                  No nonseed point lies inside a supported initial facet. Change
                  terrain or use the full inspector to review the seed and edge
                  limits.
                </p>
              </>
            ) : (
              <>
                <h3>Read the result with its gaps</h3>
                <dl>
                  <div>
                    <dt>Ground hypotheses</dt>
                    <dd>{snapshot?.groundSet.size ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Supported coverage</dt>
                    <dd id="tin-simple-coverage">
                      {quality
                        ? (quality.coverage * 100).toFixed(1) + "%"
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>Independent height RMSE</dt>
                    <dd>
                      {quality?.rmse != null
                        ? quality.rmse.toFixed(3) + " m"
                        : "No support"}
                    </dd>
                  </div>
                </dl>
                <p>
                  Empty margins are unestimated. Synthetic reference labels
                  assess the result; they do not choose seeds or decide
                  insertions.
                </p>
              </>
            )}
          </section>
          <details className="tin-simple-limits">
            <summary>What is simplified here?</summary>
            <p>
              This walkthrough tests one chosen point against the initial mesh.
              The final step runs the full queued progressive filter from the
              seeds. The full inspector shows individual insertions,
              perpendicular projection, adaptive bounds, profiles and
              validation. Point symbols are not laser footprints.
            </p>
            <p>
              {s.adaptive ? "Adaptive" : "Fixed"} distance bounds · {s.gridSize}{" "}
              m target seed cells · {s.noiseSigma} m synthetic height-noise
              sigma · maximum supported edge {s.maxEdge} m.
            </p>
          </details>
        </aside>
      </main>
    </div>
  );
}
