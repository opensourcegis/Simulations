import { TIN_PHASE_TEXT } from "./tin-teaching.js";
import "./survey-teaching.css";

export default function TinTeachingPanel({
  frame,
  frames,
  index,
  onChange,
  points,
  maxAngle,
}) {
  if (!frame) return null;
  const { phase, snapshot: s, event } = frame,
    test = event?.test,
    byId = new Map(points.map((p) => [p.id, p])),
    selected = event?.id;
  const x = (v) => 40 + v * 2.8,
    y = (v) => 320 - v * 2.8,
    key = (t) => [...t].sort((a, b) => a - b).join(",");
  const before = new Set(event?.beforeTriangles.map(key) || []),
    after = new Set(event?.afterTriangles?.map(key) || []),
    added =
      phase === "retriangulate"
        ? s.triangles.filter((t) => !before.has(key(t)))
        : [],
    removed =
      phase === "retriangulate"
        ? event.beforeTriangles.filter((t) => !after.has(key(t)))
        : [];
  let circle = null;
  if (frame.triangle) {
    const [a, b, c] = frame.triangle.map((id) => byId.get(id)),
      d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) > 1e-8) {
      const sq = (p) => p.x * p.x + p.y * p.y,
        cx =
          (sq(a) * (b.y - c.y) + sq(b) * (c.y - a.y) + sq(c) * (a.y - b.y)) / d,
        cy =
          (sq(a) * (c.x - b.x) + sq(b) * (a.x - c.x) + sq(c) * (b.x - a.x)) / d;
      circle = { x: cx, y: cy, r: Math.hypot(a.x - cx, a.y - cy) };
    }
  }
  const path = (ids) =>
    ids
      .map((id) => {
        const p = byId.get(id);
        return x(p.x) + "," + y(p.y);
      })
      .join(" ");
  return (
    <div
      className="tin-teaching-panel"
      data-phase={phase}
      data-triangle-count={s.triangles.length}
      data-ground-count={s.groundSet.size}
      data-event-id={event?.id}
    >
      <div className="tin-phase-list">
        {[
          ["cloud", "Cloud"],
          ["cells", "Cells"],
          ["seeds", "Seeds"],
          ["initial", "Initial TIN"],
          ["test", "Test"],
          ["decision", "Decide"],
          ["retriangulate", "Retriangulate"],
          ["complete", "Evaluate"],
        ].map(([id, label]) => (
          <span key={id} aria-current={phase === id ? "step" : undefined}>
            {label}
          </span>
        ))}
      </div>
      <h3 id="tin-lesson-title">{frame.title}</h3>
      <p id="tin-lesson-explanation">{TIN_PHASE_TEXT[phase]}</p>
      {frame.event && (
        <p>
          Playback shows every actual insertion and one representative failed
          test per batch. It does not display every preliminary qualification.
        </p>
      )}
      <div className="tin-teaching-tools">
        <button
          id="tin-jump-seeds"
          onClick={() => onChange(frames.findIndex((f) => f.phase === "seeds"))}
        >
          Show seeds
        </button>
        <button
          id="tin-jump-initial"
          onClick={() =>
            onChange(frames.findIndex((f) => f.phase === "initial"))
          }
        >
          Build initial TIN
        </button>
        <button
          id="tin-jump-test"
          disabled={!frames.some((f) => f.phase === "test")}
          onClick={() => onChange(frames.findIndex((f) => f.phase === "test"))}
        >
          Inspect first candidate
        </button>
        <button
          id="tin-next-candidate"
          disabled={!frames.some((f, i) => i > index && f.phase === "test")}
          onClick={() =>
            onChange(
              frames.findIndex((f, i) => i > index && f.phase === "test"),
            )
          }
        >
          Next candidate
        </button>
      </div>
      {test && (
        <div className="tin-teaching-status">
          <div>
            Candidate / supporting facet
            <b id="tin-event-candidate">
              P{event.id} / {test.facetIds.join(" · ")}
            </b>
            <span>
              {phase === "retriangulate"
                ? "Test recorded just before this insertion"
                : "Test matches the displayed pre-insertion mesh"}
            </span>
          </div>
          <div>
            Perpendicular distance / local limit
            <b id="tin-event-distance">
              {test.d.toFixed(4)} / {test.distanceLimit.toFixed(4)} m
            </b>
            <span>
              {test.passesDist ? "Distance passes" : "Distance fails"} · global
              cap is not necessarily the local bound
            </span>
          </div>
          <div>
            Maximum insertion angle / limit
            <b>
              {test.angle.toFixed(3)}° / {maxAngle}°
            </b>
            <span>{test.passesAngle ? "Angle passes" : "Angle fails"}</span>
          </div>
        </div>
      )}
      <p id="tin-event-decision" aria-live="polite">
        {phase === "test"
          ? "Predict: should this point be inserted? Advance one stage to reveal the decision."
          : phase === "decision"
            ? event.inserted
              ? "Pass → proposed insertion. Advance to see the mesh update."
              : "Defer → no insertion and no mesh change. This is not a permanent non-ground label."
            : phase === "retriangulate"
              ? `Inserted P${event.id}: ${removed.length} previous facets replaced by ${added.length} new facets. The next test uses this mesh.`
              : phase === "seeds"
                ? `${s.seedSet.size} eligible cell minima selected; no synthetic boundary anchors.`
                : `${s.triangles.length} supported facets currently visible.`}
      </p>
      <details
        open={phase === "cells" || phase === "seeds" || phase === "initial"}
      >
        <summary>
          XY construction plan · metres{" "}
          {circle ? "· dashed empty circumcircle" : ""}
        </summary>
        <svg
          className="tin-teaching-plan"
          viewBox="0 0 360 360"
          role="img"
          aria-label="XY plan showing seed cells, measured points, current triangulation and changed facets"
        >
          <defs>
            <clipPath id="tin-plan-clip">
              <rect x="40" y="40" width="280" height="280" />
            </clipPath>
          </defs>
          <g clipPath="url(#tin-plan-clip)">
            {["cells", "seeds"].includes(phase) &&
              s.seedCells.map((c, i) => (
                <rect
                  key={i}
                  x={x(c.x0)}
                  y={y(c.y1)}
                  width={(c.x1 - c.x0) * 2.8}
                  height={(c.y1 - c.y0) * 2.8}
                  fill="none"
                  stroke="#bdcbb5"
                />
              ))}
            {s.triangles.map((t, i) => (
              <polygon
                key={i}
                points={path(t)}
                fill="#648d6e12"
                stroke="#52745b"
                strokeWidth=".7"
              />
            ))}
            {removed.map((t, i) => (
              <polygon
                key={"r" + i}
                points={path(t)}
                fill="none"
                stroke="#bc7949"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
            ))}
            {added.map((t, i) => (
              <polygon
                key={"a" + i}
                points={path(t)}
                fill="#62c48b22"
                stroke="#247b49"
                strokeWidth="2"
              />
            ))}
            {event && phase !== "retriangulate" && (
              <polygon
                points={path(test.facetIds)}
                fill="#4388b333"
                stroke="#3682af"
                strokeWidth="2"
              />
            )}
            {circle && (
              <circle
                cx={x(circle.x)}
                cy={y(circle.y)}
                r={circle.r * 2.8}
                fill="none"
                stroke="#a27639"
                strokeDasharray="5 4"
              />
            )}
            {points.map((p) => (
              <circle
                key={p.id}
                cx={x(p.x)}
                cy={y(p.y)}
                r={p.id === selected ? 4 : s.seedSet.has(p.id) ? 3 : 1.1}
                fill={
                  p.id === selected
                    ? "#c67c26"
                    : s.seedSet.has(p.id)
                      ? "#bf982d"
                      : s.groundSet.has(p.id)
                        ? "#368652"
                        : s.excludedSet.has(p.id)
                          ? "#b3554d"
                          : "#a8b6af"
                }
              />
            ))}
            {frame.triangle?.map((id) => {
              const p = byId.get(id);
              return (
                <text
                  key={id}
                  x={x(p.x) + 4}
                  y={y(p.y) - 4}
                  fill="#335e43"
                  fontSize="9"
                >
                  P{id}
                </text>
              );
            })}
          </g>
          <path d="M40 40V320H320" fill="none" stroke="#6e846d" />
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v} fill="#5b705d" fontSize="9">
              <text x={x(v)} y="337" textAnchor="middle">
                {v}
              </text>
              <text x="30" y={y(v) + 3} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          <text
            x="178"
            y="355"
            textAnchor="middle"
            fill="#5b705d"
            fontSize="10"
          >
            X (m) · Y upwards
          </text>
        </svg>
        {circle && (
          <p>
            A Delaunay facet has no other seed strictly inside its XY
            circumcircle. Co-circular seeds can permit multiple valid
            triangulations.
          </p>
        )}
      </details>
    </div>
  );
}
