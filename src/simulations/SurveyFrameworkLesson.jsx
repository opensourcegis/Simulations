import { useState } from "react";
import Disclosure from "./Disclosure.jsx";
import { surveyHierarchyExample } from "./survey-principles-model.js";

const titles = [
  "Control the whole site",
  "Add control inside each part",
  "Measure the small details",
];
const shortTitles = ["Whole site", "Smaller parts", "Local details"];
const descriptions = [
  "Before measuring buildings or roads, establish and check a few main control points around the entire site. Every later measurement uses this same coordinate framework.",
  "Divide the site into manageable areas. Establish nearby working stations from the main control—not from an unchecked chain of building corners.",
  "Set up at S1, orient the instrument to S2, then measure a direction and distance to a building corner P. The detail is now connected to the whole survey.",
];
const f = (n, digits = 2) => n.toFixed(digits);
const deg = (r) => f((r * 180) / Math.PI, 2) + "°";

function PlanMarker({ p, label, level, X, Y }) {
  return (
    <g
      className={`sf-marker sf-${level}`}
      transform={`translate(${X(p[0])},${Y(p[1])})`}
    >
      {level === "primary" ? (
        <path d="M0 -8L8 7H-8Z" />
      ) : level === "secondary" ? (
        <circle r="6" />
      ) : (
        <path d="M-5 -5H5V5H-5Z" />
      )}
      <text x="12" y="-10">
        {label}
      </text>
    </g>
  );
}

function HierarchyPlan({ model, zone, step }) {
  const { controls, names, stations, building, point, baselineNames } = model;
  const X = (v) => 25 + v * 5;
  const Y = (v) => 425 - v * 5;
  const line = (a, b) => `M${X(a[0])},${Y(a[1])}L${X(b[0])},${Y(b[1])}`;
  const polygon = (points) =>
    points.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ");
  return (
    <svg
      id="framework-hierarchy-plan"
      viewBox="0 0 550 460"
      role="img"
      aria-label={`Whole-site plan. ${step === 0 ? "Only main control A, B, C and D is established." : `Area ${zone + 1} is highlighted. S1 and S2 are established from the main controls.`} ${step === 2 ? "Building corner P is measured from this local control." : ""}`}
    >
      <rect x="38" y="40" width="474" height="330" rx="5" fill="#f2f4ee" />
      <path d="M38 225H512" stroke="#e0e3d8" strokeWidth="20" />
      <path
        d="M38 225H512"
        stroke="#fff"
        strokeWidth="1"
        strokeDasharray="9 9"
      />
      <g fill="#d8dfd0" opacity=".7">
        <circle cx="125" cy="133" r="12" />
        <circle cx="145" cy="145" r="9" />
        <circle cx="425" cy="298" r="13" />
      </g>
      <polygon
        points={polygon(Object.values(controls))}
        fill="none"
        stroke="#176d66"
        strokeWidth="3"
      />
      <path d={line(controls.A, controls.C)} stroke="#176d66" strokeWidth="2" />
      {step > 0 && (
        <polygon
          className="sf-selected-area"
          points={polygon(names.map((n) => controls[n]))}
          fill="#176d66"
          fillOpacity=".08"
          stroke="#176d66"
          strokeWidth="2"
        />
      )}
      <text
        x="350"
        y="310"
        className={step > 0 && zone === 0 ? "sf-area-label" : "sf-area-muted"}
      >
        Area 1
      </text>
      <text
        x="100"
        y="150"
        className={step > 0 && zone === 1 ? "sf-area-label" : "sf-area-muted"}
      >
        Area 2
      </text>
      {step > 0 && (
        <>
          {stations.flatMap((s, i) =>
            baselineNames.map((n) => (
              <path
                key={`${i}-${n}`}
                d={line(controls[n], s)}
                stroke="#4c75a0"
                strokeWidth="1.5"
                strokeDasharray="6 5"
              />
            )),
          )}
          <path d={line(...stations)} stroke="#4c75a0" strokeWidth="2" />
          {stations.map((p, i) => (
            <PlanMarker
              key={i}
              p={p}
              label={`S${i + 1}`}
              level="secondary"
              X={X}
              Y={Y}
            />
          ))}
        </>
      )}
      {step === 2 && (
        <>
          <polygon
            points={polygon(building)}
            fill="#e2c6a9"
            stroke="#9d7050"
            strokeWidth="1.5"
          />
          <path d={line(stations[0], point)} stroke="#b95830" strokeWidth="2" />
          <PlanMarker p={point} label="" level="detail" X={X} Y={Y} />
        </>
      )}
      {Object.entries(controls).map(([n, p]) => (
        <PlanMarker key={n} p={p} label={n} level="primary" X={X} Y={Y} />
      ))}
      <g className="sf-scale" stroke="#6e7c77" fill="#6e7c77">
        <path d="M42 413H142m-100 -4v8m100 -8v8" />
        <text x="42" y="440" stroke="none">
          20 m · equal scales
        </text>
        <path d="M510 405V378m-4 7l4-7 4 7" />
        <text x="503" y="427" stroke="none">
          N
        </text>
      </g>
    </svg>
  );
}

function DetailPlan({ model }) {
  const {
    stations: [S1, S2],
    point,
    building,
  } = model;
  const X = (v) => 130 + (v - S1[0]) * 10;
  const Y = (v) => 325 - (v - S1[1]) * 10;
  const line = (a, b) => `M${X(a[0])},${Y(a[1])}L${X(b[0])},${Y(b[1])}`;
  const arcPoint = (angle, radius) => [
    X(S1[0]) + radius * Math.sin(angle),
    Y(S1[1]) - radius * Math.cos(angle),
  ];
  const arcStart = arcPoint(model.backsightBearing, 44);
  const arcEnd = arcPoint(model.gridBearing, 44);
  const arcLabel = arcPoint(
    model.backsightBearing + model.horizontalAngle / 2,
    63,
  );
  return (
    <svg
      id="framework-detail-plan"
      viewBox="0 0 390 420"
      role="img"
      aria-label="Enlarged local survey: total station at S1, orientation to S2, measured ray to building corner P and an independent distance check from S2. This is a different scale from the whole-site map."
    >
      <rect x="20" y="22" width="350" height="360" rx="5" fill="#f6f4ed" />
      <polygon
        points={building.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ")}
        fill="#e2c6a9"
        stroke="#9d7050"
        strokeWidth="2"
      />
      <text
        x={X(building[0][0]) + 10}
        y={Y(building[0][1]) - 35}
        className="sf-building-label"
      >
        Building
      </text>
      <path
        d={line(S1, S2)}
        stroke="#4c75a0"
        strokeWidth="2"
        strokeDasharray="7 5"
      />
      <path d={line(S1, point)} stroke="#b95830" strokeWidth="3" />
      <path
        d={`M${arcStart.join(",")}A44 44 0 ${model.horizontalAngle > Math.PI ? 1 : 0} 1 ${arcEnd.join(",")}`}
        fill="none"
        stroke="#b95830"
        strokeWidth="1.5"
      />
      <text x={arcLabel[0]} y={arcLabel[1]} className="sf-angle-label">
        α
      </text>
      <path
        d={line(S2, point)}
        stroke="#87978a"
        strokeWidth="1.5"
        strokeDasharray="3 5"
      />
      <g
        transform={`translate(${X(S1[0])},${Y(S1[1])})`}
        className="sf-instrument"
        stroke="#3b5767"
        strokeWidth="2"
      >
        <path d="M0 -8L-13 19M0 -8L13 19M0 -8V20" />
        <rect x="-9" y="-19" width="18" height="14" rx="3" fill="#4c75a0" />
        <circle cy="-12" r="3" fill="#e7f1f3" />
      </g>
      <text x={X(S1[0]) - 25} y={Y(S1[1]) + 43} className="sf-station-label">
        S1
      </text>
      <PlanMarker p={S2} label="S2" level="secondary" X={X} Y={Y} />
      <PlanMarker p={point} label="P" level="detail" X={X} Y={Y} />
      <g className="sf-scale" stroke="#6e7c77" fill="#6e7c77">
        <path d="M250 352h50m-50 -4v8m50 -8v8" />
        <text x="250" y="375" stroke="none">
          5 m
        </text>
        <path d="M340 315V288m-4 7l4-7 4 7" />
        <text x="334" y="337" stroke="none">
          N
        </text>
      </g>
    </svg>
  );
}

export default function FrameworkLesson({ onNext, errorExperiment }) {
  const [step, setStep] = useState(0);
  const [zone, setZone] = useState(0);
  const [corner, setCorner] = useState(0);
  const model = surveyHierarchyExample(zone, corner);
  const [S1] = model.stations;
  return (
    <section
      className="sp-lesson sf-lesson"
      aria-label="Work from whole to part"
    >
      <nav className="sf-sequence" aria-label="Whole to part survey sequence">
        {shortTitles.map((title, i) => (
          <button
            id={`framework-step-${i}`}
            key={title}
            aria-pressed={step === i}
            onClick={() => setStep(i)}
          >
            <span>{i + 1}</span>
            <div>
              <strong>{title}</strong>
              <small>
                {
                  [
                    "Main control A–D",
                    "Working stations S1, S2",
                    "Building corner P",
                  ][i]
                }
              </small>
            </div>
            {i < 2 && <b aria-hidden="true">→</b>}
          </button>
        ))}
      </nav>
      <div className="sf-heading">
        <h2>{titles[step]}</h2>
        <p id="framework-objective">{descriptions[step]}</p>
      </div>
      {step > 0 && (
        <div
          className="sf-tools"
          role="group"
          aria-label="Select the smaller survey area"
        >
          <span>Explore a part:</span>
          {[0, 1].map((n) => (
            <button
              key={n}
              id={`framework-zone-${n}`}
              aria-pressed={zone === n}
              onClick={() => setZone(n)}
            >
              Area {n + 1} · {n === 0 ? "A–B–C" : "A–C–D"}
            </button>
          ))}
        </div>
      )}
      <div className="sf-workspace">
        <div className="sf-drawing">
          <div className={`sf-plans ${step === 2 ? "sf-with-detail" : ""}`}>
            <figure>
              <figcaption>
                Whole site{" "}
                <small>
                  {step === 0
                    ? "Establish the framework before filling in details"
                    : `Area ${zone + 1} remains tied to the main framework`}
                </small>
              </figcaption>
              <HierarchyPlan model={model} zone={zone} step={step} />
            </figure>
            {step === 2 && (
              <figure>
                <figcaption>
                  Inside Area {zone + 1}{" "}
                  <small>Enlarged view · different map scale</small>
                </figcaption>
                <DetailPlan model={model} />
                <div className="sf-measurements">
                  <span>
                    Turn α <b>{deg(model.horizontalAngle)}</b>
                  </span>
                  <span>
                    Distance d <b>{f(model.range)} m</b>
                  </span>
                </div>
              </figure>
            )}
          </div>
          <div className="sf-legend">
            <span className="sf-primary">△ Main control</span>
            {step > 0 && (
              <span className="sf-secondary">● Working station</span>
            )}
            {step === 2 && (
              <>
                <span className="sf-detail">■ Measured detail</span>
                <span>Dashed blue: orientation · dotted: check</span>
              </>
            )}
          </div>
        </div>
        <aside className="sf-guide">
          <span className="sf-eyebrow">
            {["THE WHOLE", "THE PARTS", "THE DETAILS"][step]}
          </span>
          <h3>
            {
              [
                "A reliable frame for everything",
                "Bring that frame closer to the work",
                "Give the detail a position",
              ][step]
            }
          </h3>
          {step === 0 && (
            <>
              <p>
                A–D are stable survey marks enclosing the site. Their checked
                coordinates fix position, orientation and scale. Establish these
                first, to a higher precision than the detail survey.
              </p>
              <div className="sf-insight">
                <strong>Not yet: buildings and roads</strong>
                <p>
                  The first task is to make the main framework reliable—not to
                  collect every visible point.
                </p>
              </div>
              <p className="sp-note">
                Main control is supplied here. In the field it is observed,
                adjusted and independently checked to the required accuracy.
              </p>
            </>
          )}
          {step === 1 && (
            <>
              <p>
                Blue lines tie S1 and S2 to {model.baselineNames.join(" and ")}.
                Their coordinates use the same system as A–D.
              </p>
              <div className="sf-insight">
                <strong>The main control stays fixed</strong>
                <p>
                  Switch areas: the working stations change, but the whole-site
                  framework does not.
                </p>
              </div>
              <p className="sp-note">
                This example uses two ranges and the known side of the baseline
                to establish each local station. Real control also needs
                redundant checks.
              </p>
            </>
          )}
          {step === 2 && (
            <>
              <label htmlFor="framework-corner">
                Measure a building corner
                <select
                  id="framework-corner"
                  value={corner}
                  onChange={(e) => setCorner(+e.target.value)}
                >
                  {["South-west", "South-east", "North-west"].map((name, i) => (
                    <option key={name} value={i}>
                      {name} corner
                    </option>
                  ))}
                </select>
              </label>
              <ol className="sf-field-steps">
                <li>
                  <b>Occupy S1.</b> Use its known coordinates.
                </li>
                <li>
                  <b>Sight S2.</b> Set the orientation.
                </li>
                <li>
                  <b>Turn and measure to P.</b> Obtain a grid bearing and
                  horizontal distance.
                </li>
              </ol>
              <div
                id="framework-detail-results"
                data-east={model.point[0]}
                data-north={model.point[1]}
                data-range={model.range}
                className="sf-result"
              >
                <span>Calculated corner P · E, N (m)</span>
                <strong>
                  {f(model.point[0])}, {f(model.point[1])}
                </strong>
                <small>Connected through S1/S2 back to A–D</small>
              </div>
              <p className="sp-note">
                Dotted line: a separate distance from S2 checks the detail; it
                is not used to calculate P.
              </p>
            </>
          )}
        </aside>
      </div>
      <div className="sf-message" id="framework-takeaway">
        {
          [
            "Whole to part means building a trusted framework first—not drawing the entire map first.",
            "Each smaller survey fits into the same larger framework, so neighbouring pieces share a consistent reference.",
            "A–D → S1 / S2 → P. Checked control anchors each part; a detail mistake does not redefine the whole-site framework.",
          ][step]
        }
      </div>
      <div className="sp-progress">
        <button disabled={step === 0} onClick={() => setStep(step - 1)}>
          Previous
        </button>
        <span>Step {step + 1} of 3</span>
        <button
          className="sp-primary"
          onClick={() => (step === 2 ? onNext() : setStep(step + 1))}
        >
          {step === 2
            ? "Explore principle 2 →"
            : `Next: ${shortTitles[step + 1]} →`}
        </button>
      </div>
      {step > 0 && (
        <Disclosure title="How the coordinates connect">
          <div id="framework-coordinate-working">
            <p>
              All coordinates are in the same local E, N system (metres). Exact
              synthetic observations isolate the hierarchy; this is not an
              accuracy assessment.
            </p>
            <p>
              Main controls:{" "}
              {Object.entries(model.controls)
                .map(([n, p]) => `${n} (${p.join(", ")})`)
                .join("; ")}
              .
            </p>
            <table>
              <thead>
                <tr>
                  <th>Local control</th>
                  <th>Range from {model.baselineNames[0]}</th>
                  <th>Range from {model.baselineNames[1]}</th>
                  <th>Solved E, N (m)</th>
                </tr>
              </thead>
              <tbody>
                {model.stations.map((p, i) => (
                  <tr key={i}>
                    <td>S{i + 1}</td>
                    <td>{f(model.ties[i][0], 3)} m</td>
                    <td>{f(model.ties[i][1], 3)} m</td>
                    <td>{p.map((v) => f(v, 3)).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>
              The intersection on the {zone === 0 ? "north" : "south"} side of{" "}
              {model.baselineNames.join("–")} is selected using the field
              sketch. Neither P nor its coordinates is used to establish S1/S2.
            </p>
            {step === 2 && (
              <>
                <p>
                  Backsight S1→S2: grid bearing {deg(model.backsightBearing)}.
                  Clockwise horizontal angle to P: {deg(model.horizontalAngle)}.
                  Thus θ = {deg(model.gridBearing)}, measured clockwise from
                  grid north. Horizontal distance d = {f(model.range, 3)} m.
                </p>
                <code>
                  Eₚ = Eₛ₁ + d sin θ = {f(S1[0], 3)} + {f(model.range, 3)} sin(
                  {deg(model.gridBearing)}) = {f(model.point[0], 3)} m
                </code>
                <code>
                  Nₚ = Nₛ₁ + d cos θ = {f(S1[1], 3)} + {f(model.range, 3)} cos(
                  {deg(model.gridBearing)}) = {f(model.point[1], 3)} m
                </code>
                <p>
                  Independent S2→P distance: observed {f(model.checkRange, 3)}{" "}
                  m; computed {f(model.computedCheck, 3)} m. Agreement{" "}
                  {f(model.computedCheck - model.checkRange, 3)} m in this exact
                  example. Values shown are rounded; calculations use full
                  precision.
                </p>
              </>
            )}
          </div>
        </Disclosure>
      )}
      {step === 2 && (
        <Disclosure
          title="Why this order? Try an error experiment"
          id="framework-error-disclosure"
        >
          {errorExperiment}
        </Disclosure>
      )}
    </section>
  );
}
