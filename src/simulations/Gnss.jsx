import { useMemo, useState } from "react";
import {
  LIGHT_SPEED,
  L1_WAVELENGTH,
  makeGnssObservations,
  solveCode,
  doubleDifferences,
  solveFixedBaseline,
} from "./gnss-model.js";
import LessonBrief from "./LessonBrief.jsx";
import "./simulation.css";
import "./native.css";
import "./gnss.css";

const longitude = (east) =>
  `${(77.5 + east / (111320 * Math.cos((13 * Math.PI) / 180))).toFixed(8)}° E`;
const signed = (value, digits = 3) =>
  `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
const COLORS = [
  "#5ad1ff",
  "#7ee0c4",
  "#f6c85f",
  "#ff9f6b",
  "#c9a2ff",
  "#ff7aa8",
];
function SignalGeometry({ sats, selected }) {
  return (
    <svg
      className="gn-geometry"
      viewBox="0 0 700 350"
      role="img"
      aria-label="Satellite sight lines in the local east-up plane. Not orbital scale."
    >
      <rect width="700" height="350" fill="#101f2a" />
      <path d="M30 285H670" stroke="#758a84" />
      <text x="30" y="325" fill="#b7c7c6">
        Local east → · north and height held fixed
      </text>
      <text x="30" y="25" fill="#b7c7c6">
        Schematic geometry · calculated distances in table
      </text>
      {sats.map((s, i) => {
        const a = (s.el * Math.PI) / 180,
          x = 350 + s.side * Math.cos(a) * 265,
          y = 285 - Math.sin(a) * 230;
        return (
          <g key={s.prn}>
            <path
              d={`M${x} ${y}L350 285`}
              stroke={COLORS[i]}
              opacity={i === selected ? 1 : 0.3}
              strokeWidth={i === selected ? 2.5 : 1}
            />
            <rect x={x - 14} y={y - 4} width="28" height="8" fill={COLORS[i]} />
            <rect x={x - 5} y={y - 8} width="10" height="16" fill="#dce8e9" />
            <text x={x} y={y - 19} textAnchor="middle" fill={COLORS[i]}>
              G{s.prn} · {s.el}°
            </text>
          </g>
        );
      })}
      <path d="M350 285V265M335 265H365" stroke="#f6c85f" strokeWidth="4" />
      <text x="373" y="280" fill="#f6c85f">
        Rover / nearby base
      </text>
    </svg>
  );
}
export default function Gnss() {
  const [stage, setStage] = useState("code"),
    [east, setEast] = useState(6),
    [count, setCount] = useState(5);
  const [codeSigma, setCodeSigma] = useState(2.5),
    [clockUs, setClockUs] = useState(500),
    [selected, setSelected] = useState(0);
  const [applied, setApplied] = useState(false),
    [integerOffset, setIntegerOffset] = useState(0);
  const sats = useMemo(
    () =>
      makeGnssObservations({
        east,
        count,
        codeSigma,
        roverClock: clockUs * 1e-6 * LIGHT_SPEED,
      }),
    [east, count, codeSigma, clockUs],
  );
  const code = useMemo(() => solveCode(sats), [sats]);
  const rows = useMemo(
    () => doubleDifferences(sats, selected),
    [sats, selected],
  );
  const fixed = useMemo(
    () => solveFixedBaseline(rows, integerOffset),
    [rows, integerOffset],
  );
  const sat = sats[selected];
  const reset = () => {
    setEast(6);
    setCount(5);
    setCodeSigma(2.5);
    setClockUs(500);
    setSelected(0);
    setApplied(false);
    setIntegerOffset(0);
    setStage("code");
  };
  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>
          ← All simulators
        </a>
        <div className="title-block">
          <h1>GNSS Positioning</h1>
          <span className="sub">
            Measured code → carrier ambiguity → double differences
          </span>
        </div>
        <button className="gn-btn" onClick={reset}>
          Reset experiment
        </button>
      </header>
      <LessonBrief topic="gnss" />
      <nav className="gn-modes" aria-label="GNSS experiment stage">
        {[
          ["code", "1 · Code & clock"],
          ["phase", "2 · Carrier ambiguity"],
          ["differencing", "3 · Base + rover"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={`gn-seg ${stage === id ? "on" : ""}`}
            aria-pressed={stage === id}
            onClick={() => setStage(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2>Geometry &amp; experiment inputs</h2>
            <SignalGeometry sats={sats} selected={selected} />
            <div className="control-grid">
              <label>
                True east offset <b>{east.toFixed(1)} m</b>
                <input
                  id="gn-east"
                  type="range"
                  min="-15"
                  max="15"
                  step="0.1"
                  value={east}
                  onChange={(e) => setEast(+e.target.value)}
                />
              </label>
              <label>
                Satellites <b>{count}</b>
                <input
                  id="gn-count"
                  type="range"
                  min="4"
                  max="6"
                  value={count}
                  onChange={(e) => {
                    setCount(+e.target.value);
                    setSelected((i) => Math.min(i, +e.target.value - 1));
                  }}
                />
              </label>
              <label>
                Code noise σ <b>{codeSigma.toFixed(1)} m</b>
                <input
                  id="gn-noise"
                  type="range"
                  min="0.2"
                  max="6"
                  step="0.1"
                  value={codeSigma}
                  onChange={(e) => setCodeSigma(+e.target.value)}
                />
              </label>
              <label>
                Rover clock offset <b>{clockUs} μs</b>
                <input
                  id="gn-clock"
                  type="range"
                  min="0"
                  max="1000"
                  step="10"
                  value={clockUs}
                  onChange={(e) => setClockUs(+e.target.value)}
                />
              </label>
              <label>
                Inspect / DD reference
                <select
                  id="gn-reference"
                  value={selected}
                  onChange={(e) => setSelected(+e.target.value)}
                >
                  {sats.map((s, i) => (
                    <option key={s.prn} value={i}>
                      G{s.prn} · {s.el}° elevation
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="gn-note">
              This is a <b>one-dimensional</b> east-position experiment with
              fixed north and height. Code solves east and receiver clock range
              b. A real unconstrained 3D fix requires at least four satellites
              for X, Y, Z and b. The drawing is schematic, not an orbital
              ephemeris.
            </p>
          </section>
          <section className="sim-panel">
            <h2>Calculated code solution</h2>
            <div className="gn-lon" id="gn-code-result">
              <div className="gn-lonrow">
                <span>known synthetic truth</span>
                <b>{east.toFixed(3)} m east</b>
              </div>
              <div className="gn-lonrow code">
                <span>estimated from code</span>
                <b>{code.east.toFixed(3)} m east</b>
              </div>
              <div className="gn-lonrow">
                <span>error vs synthetic truth</span>
                <b>{signed(code.east - east)} m</b>
              </div>
              <div className="gn-lonrow">
                <span>estimated clock</span>
                <b>{((code.clock / LIGHT_SPEED) * 1e6).toFixed(4)} μs</b>
              </div>
            </div>
            <p className="gn-note">
              Approximate longitude: {longitude(code.east)}. East is the
              estimated quantity; the longitude conversion is local and
              illustrative. Seeded noise makes changes repeatable.
            </p>
          </section>
        </div>
        <div className="sim-col">
          {stage === "code" && (
            <section className="sim-panel">
              <h2>Code: travel time plus receiver clock</h2>
              <div className="gn-eq">
                Pᵢ = rᵢ(E) + b + εᵢ
                <br />b = c δt = {(clockUs * 1e-6 * LIGHT_SPEED).toFixed(3)} m
              </div>
              <div className="gn-table-scroll">
                <table className="gn-tbl">
                  <caption>Generated observations and fitted residuals</caption>
                  <thead>
                    <tr>
                      <th>Sat</th>
                      <th>r (km)</th>
                      <th>P (km)</th>
                      <th>P − fitted (m)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sats.map((s, i) => (
                      <tr key={s.prn}>
                        <td>G{s.prn}</td>
                        <td>{(s.roverRange / 1000).toFixed(3)}</td>
                        <td>{(s.code / 1000).toFixed(3)}</td>
                        <td>{signed(code.residuals[i])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="gn-note">
                For G{sat.prn}, P/c ={" "}
                {((sat.code / LIGHT_SPEED) * 1000).toFixed(6)} ms, while
                geometric travel time r/c ={" "}
                {((sat.roverRange / LIGHT_SPEED) * 1000).toFixed(6)} ms. The
                difference contains clock offset and noise.
              </p>
              <p className="gn-note good">
                Double the clock offset: all code observations shift together.
                The estimated clock changes, while estimated east should stay
                the same. More satellites change geometry and redundancy, but do
                not guarantee every noisy realization improves.
              </p>
            </section>
          )}
          {stage === "phase" && (
            <section className="sim-panel">
              <h2>Carrier: precise, but not an absolute distance</h2>
              <div className="gn-phase-dial">
                <svg
                  viewBox="0 0 220 220"
                  role="img"
                  aria-label={`G${sat.prn} fractional carrier phase ${(sat.phaseFraction * 360).toFixed(1)} degrees`}
                >
                  <circle
                    cx="110"
                    cy="110"
                    r="82"
                    fill="#10222a"
                    stroke="#789693"
                  />
                  <path
                    d="M110 110H192"
                    stroke="#91a6aa"
                    strokeDasharray="4 4"
                  />
                  <path
                    d={`M110 110L${110 + 78 * Math.cos(2 * Math.PI * sat.phaseFraction)} ${110 - 78 * Math.sin(2 * Math.PI * sat.phaseFraction)}`}
                    stroke="#e9ad49"
                    strokeWidth="4"
                  />
                  <circle cx="110" cy="110" r="4" fill="#e9ad49" />
                  <text x="110" y="212" textAnchor="middle" fill="#46616c">
                    φ = {sat.phaseFraction.toFixed(4)} cycles
                  </text>
                </svg>
              </div>
              <div className="gn-eq">
                λ = c/fL1 = {L1_WAVELENGTH.toFixed(6)} m<br />
                Lᵢ = λΦᵢ = rᵢ + b + λNᵢ + εΦᵢ
                <br />φ = frac(Φ) = {sat.phaseFraction.toFixed(6)} cycles
              </div>
              <p className="gn-note">
                The receiver tracks accumulated cycles after lock; initial
                integer ambiguity N remains unknown. Carrier noise here is σ = 2
                mm per receiver, but small phase uncertainty is <b>not</b>{" "}
                centimetre absolute position accuracy. Clock b is already in Φ;
                do not add it twice.
              </p>
              <p className="gn-note good">
                Metre-noisy code cannot reliably select one 19 cm carrier cycle.
                Continue to base + rover to see what differencing removes—and
                what it leaves unknown.
              </p>
            </section>
          )}
          {stage === "differencing" && (
            <section className="sim-panel">
              <h2>Double differences: cancellation, not automatic fixing</h2>
              <div className="gn-eq">
                ∇ΔLᵢ = (Lrover,ᵢ − Lbase,ᵢ) − (Lrover,ref − Lbase,ref)
                <br />= ∇Δrᵢ(E) + λ∇ΔNᵢ + εDD
                <br />
                Reference: G{sat.prn}
              </div>
              <p className="gn-note">
                Same-epoch receiver clocks cancel between satellites. Satellite
                clocks cancel between nearby receivers. Integer ambiguities{" "}
                <b>remain</b>. Atmospheric errors only approximately cancel in
                real short baselines; they are omitted here.
              </p>
              <button
                id="gn-apply-integers"
                className="gn-btn primary"
                aria-pressed={applied}
                onClick={() => setApplied((v) => !v)}
              >
                {applied
                  ? "Hide conditional phase solution"
                  : "Apply synthetic integer hypothesis"}
              </button>
              <p className="gn-note">
                The integer vector is supplied by the synthetic-data generator.
                It is <b>not estimated or validated</b>. Real RTK uses
                multi-satellite/multi-epoch estimation, validation and
                cycle-slip checks.
              </p>
              <div className="gn-table-scroll">
                <table className="gn-tbl">
                  <caption>Double-differenced carrier observations</caption>
                  <thead>
                    <tr>
                      <th>Sat − ref</th>
                      <th>∇ΔL (m)</th>
                      <th>N hypothesis</th>
                      <th>Residual (mm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.prn}>
                        <td>
                          G{r.prn} − G{sat.prn}
                        </td>
                        <td>{r.measured.toFixed(4)}</td>
                        <td>{applied ? fixed.integers[i] : "?"}</td>
                        <td>
                          {applied ? signed(fixed.residuals[i] * 1000, 2) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {applied && (
                <>
                  <label className="gn-hypothesis">
                    Change first DD integer{" "}
                    <b>{signed(integerOffset, 0)} cycles</b>
                    <input
                      id="gn-integer-offset"
                      type="range"
                      min="-2"
                      max="2"
                      value={integerOffset}
                      onChange={(e) => setIntegerOffset(+e.target.value)}
                    />
                  </label>
                  <div className="gn-lon" id="gn-phase-result">
                    <div className="gn-lonrow rtk">
                      <span>conditional phase solution</span>
                      <b>{fixed.east.toFixed(4)} m east</b>
                    </div>
                    <div className="gn-lonrow">
                      <span>error vs synthetic truth</span>
                      <b>{signed((fixed.east - east) * 1000, 2)} mm</b>
                    </div>
                    <div className="gn-lonrow">
                      <span>formal σE, integers assumed correct</span>
                      <b>{(fixed.sigmaEast * 1000).toFixed(2)} mm</b>
                    </div>
                    <div className="gn-lonrow">
                      <span>vᵀΣ⁻¹v / degrees of freedom</span>
                      <b>
                        {fixed.statistic.toFixed(2)} / {fixed.dof}
                      </b>
                    </div>
                  </div>
                </>
              )}
              <p className="gn-note">
                DDs share a reference: ΣDD = 2σΦ²(I + 11ᵀ), with off-diagonal
                correlations 0.5. The baseline uses this covariance. Wrong
                integers can shift position and inflate residuals. Formal
                precision assumes correct integers; it is not an integrity
                guarantee.
              </p>
            </section>
          )}
          <a
            className="gn-note"
            href={`${import.meta.env.BASE_URL}?simulation=least-squares`}
          >
            Inspect full 3D GNSS least-squares calculations →
          </a>
        </div>
      </main>
    </div>
  );
}
