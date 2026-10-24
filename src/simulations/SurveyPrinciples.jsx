import { useState } from "react";
import { PhotoLab, MethodTabs, Slider } from "./PhotoLabUI.jsx";
import Disclosure from "./Disclosure.jsx";
import {
  CONTROL_ROUTE,
  CONTROL_NAMES,
  controlFrameworkExample,
  referencePointExample,
} from "./survey-principles-model.js";
import "./survey-principles.css";

const fmt = (v, n = 2) => (Number.isFinite(v) ? v.toFixed(n) : "—");
const FRAME_STEPS = [
  "Establish control",
  "Subdivide the area",
  "Survey the details",
];
const RANGE_STEPS = [
  "Measure AP",
  "Add reference B",
  "Use the field sketch",
  "Check from C",
];
function Steps({ id, items, step, onChange }) {
  return (
    <nav className="sp-steps" aria-label="Guided experiment steps">
      {items.map((label, i) => (
        <button
          id={`${id}-step-${i}`}
          key={label}
          aria-pressed={step === i}
          onClick={() => onChange(i)}
        >
          <span>{i + 1}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}
function Progress({
  step,
  setStep,
  items,
  onComplete,
  completeLabel = "Lesson complete ✓",
}) {
  return (
    <div className="sp-progress">
      <button disabled={step === 0} onClick={() => setStep(step - 1)}>
        Previous
      </button>
      <span>
        Step {step + 1} of {items.length}
      </span>
      <button
        className="sp-primary"
        disabled={step === items.length - 1 && !onComplete}
        onClick={() =>
          step === items.length - 1 ? onComplete?.() : setStep(step + 1)
        }
      >
        {step === items.length - 1
          ? completeLabel
          : `Next: ${items[step + 1]} →`}
      </button>
    </div>
  );
}
function Marker({ p, label, control = false, color = "#176d66", x, y }) {
  return (
    <g transform={`translate(${x(p[0])},${y(p[1])})`} className="sp-marker">
      {control ? (
        <path d="M0 -8L8 7H-8Z" fill="#fff" stroke={color} strokeWidth="2" />
      ) : (
        <circle r="4" fill={color} />
      )}
      <text x="10" y="-8" fill={color}>
        {label}
      </text>
    </g>
  );
}
function SitePlan({ step, points, method, badLeg, details = [] }) {
  const X = (x) => 45 + x * 4.8,
    Y = (y) => 420 - y * 4.8;
  const path = (ps) =>
    ps.map((p, i) => `${i ? "L" : "M"}${X(p[0])},${Y(p[1])}`).join(" ");
  return (
    <svg
      viewBox="0 0 570 460"
      role="img"
      aria-label={`${method ?? "Survey framework"}: four main controls around a site, local traverses and plotted detail positions. Coordinates in metres with equal axis scales.`}
    >
      <rect x="35" y="28" width="490" height="400" rx="6" fill="#f1f4ed" />
      {Array.from({ length: 9 }, (_, i) => (
        <g key={i} stroke="#dce5da" strokeWidth="0.7">
          <path d={`M${X(i * 10)} 30V428`} />
          <path d={`M35 ${Y(i * 10)}H525`} />
        </g>
      ))}
      <path d="M35 270H525" stroke="#d3d6ca" strokeWidth="16" />
      <path
        d="M35 270H525"
        stroke="#f9faf6"
        strokeWidth="1"
        strokeDasharray="12 8"
      />
      <g fill="#d0d9c7" stroke="#a7b69e">
        <rect x="218" y="130" width="75" height="58" />
        <path d="M210 130L255 110L301 130Z" />
        <circle cx="382" cy="190" r="15" />
        <circle cx="405" cy="205" r="12" />
        <circle cx="145" cy="175" r="16" />
      </g>
      <path
        d={path([
          CONTROL_ROUTE[0],
          CONTROL_ROUTE[3],
          CONTROL_ROUTE[6],
          CONTROL_ROUTE[9],
          CONTROL_ROUTE[12],
        ])}
        fill="none"
        stroke="#176d66"
        strokeWidth="2.5"
      />
      <path
        d={
          path([CONTROL_ROUTE[0], CONTROL_ROUTE[6]]) +
          path([CONTROL_ROUTE[3], CONTROL_ROUTE[9]])
        }
        fill="none"
        stroke="#176d66"
        strokeWidth="1"
        strokeDasharray="5 5"
        opacity=".45"
      />
      {step > 0 && (
        <path
          d={path(CONTROL_ROUTE)}
          fill="none"
          stroke="#7a9291"
          strokeWidth="1.4"
          strokeDasharray="5 4"
        />
      )}
      {step > 1 && (
        <>
          <path
            d={path(points)}
            fill="none"
            stroke="#b95830"
            strokeWidth="2.5"
          />
          <path
            d={path(CONTROL_ROUTE.slice(badLeg, badLeg + 2))}
            fill="none"
            stroke="#b33f43"
            strokeWidth="4"
          />
          {points.slice(1, -1).map((p, i) => (
            <g key={i}>
              <path
                d={path([CONTROL_ROUTE[i + 1], p])}
                stroke="#b95830"
                strokeWidth="1.5"
              />
              <circle cx={X(p[0])} cy={Y(p[1])} r="3.5" fill="#b95830" />
            </g>
          ))}
          {details.map((d) => {
            const p = method === "One large detail traverse" ? d.long : d.local;
            return (
              <g key={d.station} className="sp-detail-offset">
                <path
                  d={path([points[d.station], p])}
                  stroke="#b95830"
                  strokeWidth="1"
                />
                <path
                  d={`M${X(d.truth[0]) - 3} ${Y(d.truth[1])}h6m-3 -3v6`}
                  stroke="#7a9291"
                />
                <rect
                  x={X(p[0]) - 2.5}
                  y={Y(p[1]) - 2.5}
                  width="5"
                  height="5"
                  fill="#b95830"
                />
              </g>
            );
          })}
        </>
      )}
      {CONTROL_ROUTE.slice(0, -1).map(
        (p, i) =>
          (i % 3 === 0 || step > 0) && (
            <Marker
              key={i}
              p={p}
              label={CONTROL_NAMES[i]}
              control={i % 3 === 0}
              color={i % 3 === 0 ? "#176d66" : "#586970"}
              x={X}
              y={Y}
            />
          ),
      )}
      <g stroke="#586970" fill="#586970">
        <path d="M515 88V48m0 0l-4 9m4-9l4 9" />
        <text x="509" y="41" stroke="none">
          N
        </text>
        <path d={`M45 445h${20 * 4.8}m-${20 * 4.8} -4v8m${20 * 4.8} -8v8`} />
        <text x="155" y="449" stroke="none">
          20 m
        </text>
      </g>
    </svg>
  );
}
function FrameworkLesson({ onNext }) {
  const [step, setStep] = useState(0),
    [error, setError] = useState(5),
    [badLeg, setBadLeg] = useState(4);
  const model = controlFrameworkExample(badLeg, error);
  const cell = model.cells[model.affectedCell];
  const instructions = [
    "First establish and independently check A, B, C and D around the whole site. This framework provides a common position and orientation for later work.",
    "Now subdivide the site with local control stations 1–8. Short traverses connect the established main controls; the details will be tied to these local stations.",
    "The same field mistake is present in both examples. One long traverse spreads its correction across the site. Control-first working confines it to one cell. Small squares are detail points tied to local stations.",
  ];
  return (
    <section className="sp-lesson" aria-label="Work from whole to part">
      <Steps
        id="framework"
        items={FRAME_STEPS}
        step={step}
        onChange={setStep}
      />
      <div className="sp-layout">
        <div className="sp-main">
          <h2>{FRAME_STEPS[step]}</h2>
          <p className="sp-objective" id="framework-objective">
            {instructions[step]}
          </p>
          <div className={`sp-maps ${step === 2 ? "sp-compare" : ""}`}>
            {step === 2 && (
              <figure>
                <figcaption>
                  One large detail traverse <small>Only A is held fixed</small>
                </figcaption>
                <SitePlan
                  step={step}
                  points={model.whole.points}
                  method="One large detail traverse"
                  badLeg={badLeg}
                  details={model.details}
                />
                <p>
                  <b id="framework-long-outside">{model.longOutside}</b> detail
                  points outside the affected cell move.
                </p>
              </figure>
            )}
            <figure>
              <figcaption>
                {step === 2 ? "Whole → part" : "The site framework"}
                <small>
                  {step === 2
                    ? "A, B, C and D held at checked control coordinates"
                    : "Control first; details follow"}
                </small>
              </figcaption>
              <SitePlan
                step={step}
                points={model.local}
                method="Whole to part"
                badLeg={badLeg}
                details={model.details}
              />
              {step === 2 && (
                <p>
                  <b id="framework-local-outside">{model.localOutside}</b>{" "}
                  detail points outside the affected cell move.
                </p>
              )}
            </figure>
          </div>
          <div className="sp-key">
            <span>
              <i className="sp-control-key" />
              Checked control
            </span>
            {step > 0 && <span>Dashed: error-free reference route</span>}
            {step > 1 && (
              <span className="sp-rust">
                Orange: balanced plotted positions · red: suspect leg
              </span>
            )}
            {step > 1 && (
              <span>Small squares: details tied to local stations</span>
            )}
          </div>
          <Progress
            step={step}
            setStep={setStep}
            items={FRAME_STEPS}
            onComplete={onNext}
            completeLabel="Explore principle 2 →"
          />
          {step === 2 && (
            <Disclosure title="See the closure calculation">
              <p>
                Both examples use the same observed leg vectors. The only added
                information is the independently established framework.
              </p>
              <p>
                Local detail offsets are exact here, so their plotted errors
                come only from the parent station. No plotted detail is snapped
                back to its error-free reference.
              </p>
              <code>e = Σ observed vectors − (known end − known start)</code>
              <p>
                Cell {CONTROL_NAMES[cell.first]}–{CONTROL_NAMES[cell.last]}: e =
                [{cell.closure.map((v) => fmt(v, 3)).join(", ")}] m.
              </p>
              <code>
                Correction to leg i = −e × observed length i / Σ observed
                lengths
              </code>
              <table>
                <thead>
                  <tr>
                    <th>Leg</th>
                    <th>Observed ΔE, ΔN (m)</th>
                    <th>Local correction (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {model.observations
                    .slice(cell.first, cell.last)
                    .map((o, i) => (
                      <tr key={i}>
                        <td>
                          {o.from} → {o.to}
                        </td>
                        <td>{o.delta.map((v) => fmt(v, 3)).join(", ")}</td>
                        <td>
                          {cell.corrections[i].map((v) => fmt(v, 3)).join(", ")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p>
                This is the compass/Bowditch rule, not a least-squares
                adjustment. A gross mistake should be investigated and
                reobserved, not accepted because a traverse has been balanced.
              </p>
            </Disclosure>
          )}
        </div>
        <aside className="sp-settings">
          <h3>Why work in this order?</h3>
          <p>
            Reliable main control prevents each new detail from becoming the
            unchecked starting point for the next.
          </p>
          {step < 2 ? (
            <div className="sp-takeaway">
              <b>Whole → part</b>
              <p>Checked main control → local control → detail measurements.</p>
            </div>
          ) : (
            <>
              <label htmlFor="framework-leg">
                Leg with the field mistake
                <select
                  id="framework-leg"
                  value={badLeg}
                  onChange={(e) => setBadLeg(+e.target.value)}
                >
                  {model.observations.map((o, i) => (
                    <option key={i} value={i}>
                      {o.from} → {o.to}
                    </option>
                  ))}
                </select>
              </label>
              <Slider
                id="framework-error"
                label="Injected northing error"
                value={error}
                display={fmt(error, 1) + " m"}
                min={0}
                max={10}
                step={0.1}
                onChange={setError}
              />
              <p className="sp-note">
                An intentionally large field mistake, not typical instrument
                precision. Positions and arrows are drawn to scale.
              </p>
              <div className="sp-takeaway">
                <b>Check each part</b>
                <p>
                  {model.cells.map((c, i) => (
                    <span
                      className={
                        i === model.affectedCell && error > 0 ? "sp-rust" : ""
                      }
                      key={i}
                    >
                      {CONTROL_NAMES[c.first]}–{CONTROL_NAMES[c.last]} closure:{" "}
                      {fmt(Math.hypot(...c.closure))} m<br />
                    </span>
                  ))}
                </p>
              </div>
              <button
                id="framework-reobserve"
                className="sp-primary"
                onClick={() => setError(0)}
              >
                Reobserve the suspect leg
              </button>
            </>
          )}
          <button
            id="framework-reset"
            onClick={() => {
              setStep(0);
              setError(5);
              setBadLeg(4);
            }}
          >
            Restart this lesson
          </button>
        </aside>
      </div>
    </section>
  );
}

function ReferencePlan({ model, step, onTarget, ellipse }) {
  const X = (x) => 20 + (x + 50) * 3,
    Y = (y) => 20 + (90 - y) * 3;
  const drag = (event) => {
    if (event.type === "pointermove" && event.buttons !== 1) return;
    const svg = event.currentTarget,
      point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const p = point.matrixTransform(svg.getScreenCTM().inverse());
    onTarget([
      Math.max(25, Math.min(75, (p.x - 20) / 3 - 50)),
      Math.max(0, Math.min(65, 90 - (p.y - 20) / 3)),
    ]);
  };
  const line = (a, b) => `M${X(a[0])},${Y(a[1])}L${X(b[0])},${Y(b[1])}`;
  const { A, B, C, P, target, rA, rB, result, geometry } = model;
  return (
    <svg
      id="survey-reference-plan"
      viewBox="0 0 640 570"
      role="img"
      aria-label="Plan view of distance circles about A and B, their possible intersection points, and an independent check from C. Click or drag to move the field target; equivalent easting and northing sliders are provided."
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag(e);
      }}
      onPointerMove={drag}
    >
      <defs>
        <clipPath id="survey-reference-clip">
          <rect x="20" y="20" width="600" height="510" rx="6" />
        </clipPath>
      </defs>
      <g clipPath="url(#survey-reference-clip)">
        <rect x="20" y="20" width="600" height="510" fill="#f1f4ed" />
        {Array.from({ length: 18 }, (_, i) => (
          <g key={i} stroke="#dce5da" strokeWidth=".7">
            <path d={`M${20 + i * 35} 20V530`} />
            <path d={`M20 ${20 + i * 35}H620`} />
          </g>
        ))}
        <path d={line([-50, 0], [150, 0])} stroke="#a8b6af" strokeWidth="1.3" />
        <text x="28" y={Y(0) - 9} className="sp-map-muted sp-halfplane-label">
          North of baseline
        </text>
        <text x="28" y={Y(0) + 19} className="sp-map-muted sp-halfplane-label">
          South of baseline
        </text>
        <circle
          cx={X(A[0])}
          cy={Y(A[1])}
          r={rA * 3}
          fill="none"
          stroke="#297ea0"
          strokeWidth="2"
        />
        {step > 0 && rB >= 0 && (
          <circle
            cx={X(B[0])}
            cy={Y(B[1])}
            r={rB * 3}
            fill="none"
            stroke="#bc7733"
            strokeWidth="2"
          />
        )}
        <path d={line(A, B)} stroke="#176d66" strokeWidth="3" />
        {step === 0 &&
          [0.2, 1.4, 2.4, 3.8, 5.2].map((angle) => (
            <circle
              key={angle}
              cx={X(A[0] + rA * Math.cos(angle))}
              cy={Y(A[1] + rA * Math.sin(angle))}
              r="4"
              fill="#297ea0"
            />
          ))}
        <path d={line(A, target)} stroke="#297ea0" strokeDasharray="5 4" />
        {step > 0 && P && (
          <>
            <path d={line(B, P)} stroke="#bc7733" strokeDasharray="5 4" />
            {result.points.map((p, i) => (
              <g key={i} opacity={step > 1 && i === 1 ? 0.35 : 1}>
                <circle
                  cx={X(p[0])}
                  cy={Y(p[1])}
                  r="7"
                  fill={step > 1 && i === 0 ? "#176d66" : "#fff"}
                  stroke="#176d66"
                  strokeWidth="2"
                />
                <text
                  x={X(p[0]) + 10}
                  y={Y(p[1]) + 18}
                  className="sp-map-label"
                >
                  {step > 1 && i === 0 ? "P located" : `Possible P${i + 1}`}
                </text>
              </g>
            ))}
          </>
        )}
        {step > 1 && P && ellipse && geometry && !geometry.singular && (
          <ellipse
            id="survey-error-ellipse"
            cx={X(P[0])}
            cy={Y(P[1])}
            rx={geometry.major * 3 * 5}
            ry={geometry.minor * 3 * 5}
            transform={`rotate(${(-geometry.orientation * 180) / Math.PI},${X(P[0])},${Y(P[1])})`}
            fill="#176d6615"
            stroke="#176d66"
            strokeWidth="1.5"
          />
        )}
        {step === 3 && P && (
          <path
            d={line(C, P)}
            stroke="#925a98"
            strokeWidth="2"
            strokeDasharray="6 4"
          />
        )}
        <g
          transform={`translate(${X(target[0])},${Y(target[1])})`}
          className="sp-target"
        >
          <path
            d="M0 2V-23l16 4-16 5"
            stroke="#3b5058"
            strokeWidth="2"
            fill="#dfd3ac"
          />
          <text x="8" y="-29" className="sp-map-label">
            Field target
          </text>
        </g>
        <Marker p={A} label="A" control x={X} y={Y} />
        <Marker p={B} label="B" control x={X} y={Y} />
        {step === 3 && (
          <Marker
            p={C}
            label="C · check only"
            control
            color="#925a98"
            x={X}
            y={Y}
          />
        )}
        {step === 3 && (
          <text
            x={X(C[0]) + 10}
            y={Y(C[1]) + 18}
            fill="#925a98"
            className="sp-check-label"
          >
            CP discrepancy: {fmt(model.checkResidual, 3)} m
          </text>
        )}
      </g>
      <g stroke="#586970" fill="#586970">
        <path d="M590 80V40m0 0l-4 9m4-9l4 9" />
        <text x="584" y="33" stroke="none">
          N
        </text>
        <path d="M35 550h60m-60 -4v8m60 -8v8" />
        <text x="105" y="554" stroke="none">
          20 m · equal axis scale
        </text>
      </g>
    </svg>
  );
}
function ReferenceLesson() {
  const [step, setStep] = useState(0),
    [baseline, setBaseline] = useState(70),
    [target, setTarget] = useState([50, 40]),
    [rangeError, setRangeError] = useState(0),
    [ellipse, setEllipse] = useState(false);
  const model = referencePointExample({ baseline, target, rangeError });
  const { A, B, rA, rB, result, P, geometry } = model;
  const text = [
    "One distance AP only says that P is somewhere on a circle. Measuring AP again may improve the distance, but it does not provide a new geometric constraint.",
    "A distance from B adds a different geometric constraint. Two distance circles usually meet at two possible positions—not automatically one unique point.",
    target[1] === 0
      ? "P is on the baseline. Tangent circles can give a single geometric intersection, yet the local range geometry is singular: a single drawn point is not a reliable two-dimensional fix."
      : "The field sketch places P north of AB. That extra side information selects the northern intersection. Change the baseline or target northing to explore strong and weak geometry.",
    "A third independently measured distance CP is a check, not an input to this two-range solution. Introduce a mistake in BP: AP and BP can still fit exactly, while CP exposes the disagreement.",
  ];
  return (
    <section
      className="sp-lesson"
      aria-label="Fix a point with independent references"
    >
      <Steps
        id="references"
        items={RANGE_STEPS}
        step={step}
        onChange={setStep}
      />
      <div className="sp-layout">
        <div className="sp-main">
          <h2>{RANGE_STEPS[step]}</h2>
          <p id="reference-objective" className="sp-objective">
            {text[step]}
          </p>
          <ReferencePlan
            model={model}
            step={step}
            onTarget={setTarget}
            ellipse={ellipse}
          />
          <div
            className="sp-readouts"
            id="survey-range-results"
            data-east={P?.[0] ?? ""}
            data-north={P?.[1] ?? ""}
            data-candidates={result.points.length}
            data-range-a={rA}
            data-range-b={rB}
            aria-live="polite"
          >
            <div>
              <span>Measured AP</span>
              <b>{fmt(rA)} m</b>
            </div>
            <div>
              <span>{step > 0 ? "Measured BP" : "Second constraint"}</span>
              <b>{step > 0 ? fmt(rB) + " m" : "Not yet"}</b>
            </div>
            <div>
              <span>
                {step > 1
                  ? "Selected coordinates E, N"
                  : "Geometric possibilities"}
              </span>
              <b>
                {step > 1 && P
                  ? `${fmt(P[0])}, ${fmt(P[1])} m`
                  : step === 0
                    ? "Whole circle"
                    : `${result.points.length} intersections`}
              </b>
            </div>
          </div>
          {step > 0 && result.points.length === 0 && (
            <p className="sp-warning" role="status">
              {result.status === "invalid"
                ? "Invalid distance. Check the observation."
                : "The circles do not intersect. The observations are inconsistent; do not invent a point."}
            </p>
          )}
          {step > 1 && geometry && (
            <p className="sp-note" id="survey-geometry-status">
              Intersection angle: {fmt(geometry.angle, 1)}°.{" "}
              {geometry.singular
                ? "Singular geometry: an unbounded direction remains."
                : ellipse
                  ? `Local 95% ellipse: ${fmt(geometry.major)} × ${fmt(geometry.minor)} m semi-axes. Drawn ×5 in size for visibility.`
                  : "Geometry becomes weak as this angle approaches 0° or 180°."}
            </p>
          )}
          {step === 3 && (
            <div
              className="sp-check"
              id="survey-independent-check"
              data-residual={model.checkResidual ?? ""}
            >
              <b>Independent check from C</b>
              <p>
                Observed CP = {fmt(model.checkObserved, 3)} m. Computed CP ={" "}
                {fmt(model.checkComputed, 3)} m.
              </p>
              <strong
                className={
                  Math.abs(model.checkResidual ?? 0) > 0.01 ? "sp-rust" : ""
                }
              >
                Check discrepancy: {fmt(model.checkResidual, 3)} m
              </strong>
              <p>
                Two observations for two coordinates leave no redundant
                observation. A zero fit to AP and BP does not prove either
                reading is correct.
              </p>
            </div>
          )}
          <Progress step={step} setStep={setStep} items={RANGE_STEPS} />
          <Disclosure title="See the point-fixing calculation">
            <p>
              A = ({fmt(A[0])}, 0), B = ({fmt(B[0])}, 0). Let b = AB ={" "}
              {fmt(baseline)} m.
            </p>
            <code>x from A = (AP² − BP² + b²) / (2b)</code>
            <code id="survey-range-working">
              = ({fmt(rA, 3)}² − {fmt(rB, 3)}² + {fmt(baseline, 3)}²) / (2 ×{" "}
              {fmt(baseline, 3)}) = {fmt(result.along, 3)} m
            </code>
            <code>h = √(AP² − x²) = {fmt(result.height, 3)} m</code>
            <p>
              Two candidates: (Aₑ + x, +h) and (Aₑ + x, −h). The
              north-of-baseline field sketch selects +h. These equations use
              only A, B, AP and BP—not the reference target coordinates.
            </p>
            <p>
              The optional ellipse uses Σ = σ²(JᵀJ)⁻¹, with σ = 0.5 m and one
              unit-range-gradient row of J per station. Its 95% semi-axes are
              √(5.991 λ). This is a local Gaussian precision illustration, not a
              guarantee of accuracy or a blunder detector.
            </p>
          </Disclosure>
        </div>
        <aside className="sp-settings">
          <h3>Synthetic field setup</h3>
          <p>
            Reference target coordinates generate the observations. Drag the
            target or use the sliders; the point solver receives only A, B and
            the ranges.
          </p>
          <Slider
            id="survey-target-east"
            label="Target easting"
            value={target[0]}
            display={fmt(target[0], 1) + " m"}
            min={25}
            max={75}
            step={0.5}
            onChange={(v) => setTarget([v, target[1]])}
          />
          <Slider
            id="survey-target-north"
            label="Target northing"
            value={target[1]}
            display={fmt(target[1], 1) + " m"}
            min={0}
            max={65}
            step={0.5}
            onChange={(v) => setTarget([target[0], v])}
          />
          {step > 0 && (
            <Slider
              id="survey-baseline"
              label="Known baseline AB"
              value={baseline}
              display={baseline + " m"}
              min={20}
              max={80}
              step={1}
              onChange={setBaseline}
            />
          )}
          {step > 1 && (
            <label className="sp-checkbox">
              <input
                id="survey-ellipse"
                type="checkbox"
                checked={ellipse}
                onChange={(e) => setEllipse(e.target.checked)}
              />
              Optional uncertainty ellipse ×5
            </label>
          )}
          {step === 3 && (
            <>
              <Slider
                id="survey-range-error"
                label="Mistake in observed BP"
                value={rangeError}
                display={
                  (rangeError >= 0 ? "+" : "") + fmt(rangeError, 1) + " m"
                }
                min={-8}
                max={8}
                step={0.1}
                onChange={setRangeError}
              />
              <button
                id="survey-range-reobserve"
                className="sp-primary"
                onClick={() => setRangeError(0)}
              >
                Reobserve BP correctly
              </button>
            </>
          )}
          <div className="sp-takeaway">
            <b>Independent geometry matters</b>
            <p>
              Two repeats from A still describe one circle. A second fixed
              reference supplies new positional information; a third observation
              supplies a check.
            </p>
          </div>
          <button
            id="survey-references-reset"
            onClick={() => {
              setStep(0);
              setBaseline(70);
              setTarget([50, 40]);
              setRangeError(0);
              setEllipse(false);
            }}
          >
            Restart this lesson
          </button>
        </aside>
      </div>
    </section>
  );
}

export default function SurveyPrinciples() {
  const [principle, setPrinciple] = useState("framework");
  return (
    <PhotoLab
      name="Two principles of surveying"
      title="Build the framework. Locate the point."
      discipline="SURVEYING FUNDAMENTALS"
      intro="Learn why surveys start with control, and why a point needs independent geometric constraints—not just repeated readings."
      notebook={
        <>
          <h3>1. Work from whole to part</h3>
          <p>
            Establish and check a sufficiently precise primary control network
            over the whole area, subdivide it into secondary control, then
            locate details. Independent checks at successive levels help contain
            and diagnose errors. The primary controls here are supplied as exact
            teaching references; real control also has uncertainty.
          </p>
          <h3>2. Fix points by independent measurements</h3>
          <p>
            Distances, directions, angles or offsets may supply positional
            constraints. Two distances to two known points are one example, not
            the only surveying method. Range-circle intersections can be
            ambiguous; field-side information, sound geometry and redundant
            measurements matter. Independence of geometry does not automatically
            imply uncorrelated instrument errors.
          </p>
          <h3>Model limits</h3>
          <p>
            Two-dimensional local plane, synthetic observations and supplied
            control coordinates. No terrain corrections, centring error,
            atmospheric corrections, correlated distance errors or operational
            accuracy certification. The whole-to-part comparison uses the same
            observations with length-proportional compass-rule closure
            corrections; it does not demonstrate that adjusting a gross mistake
            is acceptable. The point solution uses only its observed ranges, and
            C is withheld from that solution.
          </p>
          <p>
            Further reading: Ghilani &amp; Wolf,{" "}
            <em>Elementary Surveying: An Introduction to Geomatics</em>, control
            surveys and trilateration;{" "}
            <a
              href="https://www.ngs.noaa.gov/"
              target="_blank"
              rel="noreferrer"
            >
              NOAA National Geodetic Survey: survey control ↗
            </a>
            .
          </p>
          <a href={`${import.meta.env.BASE_URL}?simulation=least-squares`}>
            Next: least-squares adjustment and independent checks →
          </a>
        </>
      }
    >
      <div className="sp-lab">
        <MethodTabs
          value={principle}
          onChange={setPrinciple}
          tabs={[
            ["framework", "1 · Whole to part"],
            ["references", "2 · Independent references"],
          ]}
        />
        <div hidden={principle !== "framework"}>
          <FrameworkLesson onNext={() => setPrinciple("references")} />
        </div>
        <div hidden={principle !== "references"}>
          <ReferenceLesson />
        </div>
      </div>
    </PhotoLab>
  );
}
