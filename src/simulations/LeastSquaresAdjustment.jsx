import { useEffect, useMemo, useState } from "react";
import { PhotoLab, Panel, Slider, MethodTabs } from "./PhotoLabUI.jsx";
import {
  LS_CASES,
  makeLeastSquaresExample,
  solveLeastSquaresExample,
  adjustmentCsv,
} from "./least-squares-model.js";
import { norm } from "./least-squares-math.js";
import {
  Matrix,
  NetworkView,
  SkyView,
  MeanObjective,
  number,
} from "./LeastSquaresVisuals.jsx";
import "./least-squares.css";
import Disclosure from "./Disclosure.jsx";

const STAGES = [
  ["observe", "Network & observations"],
  ["equations", "Form the equations"],
  ["solve", "Compute the adjustment"],
  ["quality", "Test & interpret"],
];
const CASE_NOTES = {
  mean: "Four independent estimates of the same benchmark height. The most precise observation should pull the solution more strongly—not simply count as one more vote.",
  level:
    "Six observed height differences connect four benchmarks. A datum is needed for absolute heights. Length-dependent precision determines how loop misclosures are distributed.",
  baseline:
    "Six GNSS baseline vectors connect four stations. East, North and Up within one baseline can be correlated. These are processed vector observations, not raw carrier-phase ambiguity resolution.",
  code: "Eight synthetic corrected pseudoranges estimate three ECEF coordinates and receiver clock range. Range is nonlinear: calculate a Jacobian, solve a correction, update, and linearize again.",
};
function ObservationNumber({
  id,
  label,
  value,
  onChange,
  positive = false,
  minimum = 1e-6,
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const parsed = Number(draft),
    valid =
      draft.trim() !== "" &&
      Number.isFinite(parsed) &&
      Math.abs(parsed) < 1e10 &&
      (!positive || parsed > minimum);
  return (
    <input
      id={id}
      className="ls-number-input"
      type="text"
      inputMode="decimal"
      aria-label={label}
      aria-invalid={!valid}
      value={draft}
      onChange={(e) => {
        const text = e.target.value,
          n = Number(text);
        setDraft(text);
        if (
          text.trim() !== "" &&
          Number.isFinite(n) &&
          Math.abs(n) < 1e10 &&
          (!positive || n > minimum)
        )
          onChange(n);
      }}
      onBlur={() => {
        if (!valid) setDraft(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function EquationInspector({ data, step, selected, parameters }) {
  const i = step?.model.rows.findIndex((o) => o.id === selected) ?? -1;
  if (i < 0)
    return (
      <section className="ls-worked">
        <h3>Observation equation</h3>
        <p>
          The selected observation is excluded, or no active equations remain.
          It contributes no row to A, w, Σ or the objective.
        </p>
      </section>
    );
  const o = step.model.rows[i],
    a = step.model.A[i],
    predicted = step.model.predicted[i],
    w = step.fit.w[i],
    terms = a
      .map((v, j) => (v ? `${number(v)} × ${step.before[j].toFixed(6)}` : null))
      .filter(Boolean),
    residual = step.exactResidual?.[i],
    constant = predicted - a.reduce((s, v, j) => s + v * step.before[j], 0);
  return (
    <section className="ls-worked" id="ls-equation-inspector">
      <span>SELECTED OBSERVATION · {o.id}</span>
      <h3>{o.label}</h3>
      {data.kind === "code" ? (
        <>
          <p className="ls-equation">
            ρᵢ + vᵢ = √[(X − Xᵢ)² + (Y − Yᵢ)² + (Z − Zᵢ)²] + b
          </p>
          <p>
            Satellite ECEF: [{o.position.map((v) => v.toFixed(3)).join(", ")}]
            m. Receiver approximation: [
            {step.before
              .slice(0, 3)
              .map((v) => v.toFixed(3))
              .join(", ")}
            ] m.
          </p>
          <p className="ls-equation">
            rᵢ = √[
            {step.before
              .slice(0, 3)
              .map((v, j) => `(${(v - o.position[j]).toFixed(3)})²`)
              .join(" + ")}
            ] = {norm(o.position.map((v, j) => v - step.before[j])).toFixed(6)}{" "}
            m
          </p>
          <p className="ls-equation">
            fᵢ(xₖ) ={" "}
            {norm(o.position.map((v, j) => v - step.before[j])).toFixed(6)} +{" "}
            {step.before[3].toFixed(6)} = {predicted.toFixed(6)} m
          </p>
          <p>
            Aᵢ = [(X − Xᵢ)/rᵢ, (Y − Yᵢ)/rᵢ, (Z − Zᵢ)/rᵢ, 1] = [
            {a.map((v) => v.toFixed(7)).join(", ")}]. The clock unknown b = c Δt
            is in metres, so its derivative is 1.
          </p>
        </>
      ) : (
        <>
          <p className="ls-equation">
            {data.kind === "mean"
              ? "lᵢ + vᵢ = H"
              : o.control
                ? "lcontrol + vcontrol = coordinate(A)"
                : data.kind === "level"
                  ? `Δh(${o.from}→${o.to}) + vᵢ = H${o.to} − H${o.from}`
                  : `Δ${["E", "N", "U"][o.axis]}(${o.from}→${o.to}) + vᵢ = ${["E", "N", "U"][o.axis]}${o.to} − ${["E", "N", "U"][o.axis]}${o.from}`}
          </p>
          <p>
            At the current approximation, fᵢ(x₀) = {predicted.toFixed(6)} m.{" "}
            {o.from === "A" || o.to === "A"
              ? "Any exact fixed-A contribution is included in this prediction, not treated as another unknown."
              : ""}
          </p>
          <p>
            A row: [{a.join(", ")}], ordered as [
            {parameters.map((p) => p.label).join(", ")}].
          </p>
          <p className="ls-equation">
            fᵢ(x₀) = {terms.join(" + ")}
            {constant === 0 ? "" : ` + (${constant.toFixed(6)})`} ={" "}
            {predicted.toFixed(6)} m
          </p>
        </>
      )}
      <p className="ls-equation">
        wᵢ = lᵢ − fᵢ(xₖ) = {o.value.toFixed(6)} − ({predicted.toFixed(6)}) ={" "}
        {w.toFixed(9)} m
      </p>
      {data.kind === "level" && !o.control && (
        <p>
          Factory levelling precision: σᵢ = 2√{o.length.toFixed(2)} ={" "}
          {(2 * Math.sqrt(o.length)).toFixed(6)} mm. The editable stated value
          is {(o.sigma * 1000).toFixed(6)} mm; an edit overrides that factory
          value.
        </p>
      )}
      <p className="ls-equation">
        Σᵢᵢ = σassumed² = {Math.sqrt(step.fit.Sigma[i][i]).toFixed(9)}² ={" "}
        {number(step.fit.Sigma[i][i], 10)} m² · Pᵢᵢ ={" "}
        {number(step.fit.P[i][i], 10)} m⁻²
      </p>
      <p>
        {step.fit.Sigma[i].some((v, j) => j !== i && v !== 0)
          ? "This row is correlated with other components. Pᵢᵢ is not simply 1/Σᵢᵢ; the whole covariance block must be inverted."
          : "This row is independent of the others, so Pᵢᵢ = 1/Σᵢᵢ."}
      </p>
      <p>
        Linearized equation:{" "}
        {a
          .map((v, j) => (v ? `${number(v)} δ${parameters[j].label}` : null))
          .filter(Boolean)
          .join(" + ")}{" "}
        = {w.toFixed(9)} + vᵢ.
      </p>
      {residual !== undefined ? (
        <>
          <p className="ls-equation">
            vᵢ = fᵢ(x̂) − lᵢ = {(o.value + residual).toFixed(9)} −{" "}
            {o.value.toFixed(9)} = {residual.toFixed(9)} m
          </p>
          <p>
            Adjusted observation l̂ᵢ = lᵢ + vᵢ. Positive residual means the
            observation is increased.{" "}
            {data.kind === "code"
              ? `This is the exact re-evaluated range residual after this step; its linearized counterpart is ${step.fit.v[i].toFixed(9)} m.`
              : "The adjusted observation is consistent with the fitted heights/coordinates."}
          </p>
        </>
      ) : (
        <p>
          A unique estimate is not available, so no adjusted observation or
          residual is reported.
        </p>
      )}
    </section>
  );
}
function NormalCalculation({ fit, parameters }) {
  const [j, setJ] = useState(0),
    [k, setK] = useState(0),
    column = Math.min(j, parameters.length - 1),
    other = Math.min(k, parameters.length - 1);
  if (!fit?.N) return null;
  return (
    <section className="ls-worked">
      <span>BUILD ONE NORMAL-EQUATION ELEMENT</span>
      <h3>See where N and u come from</h3>
      <div className="ls-inline-selects">
        <label>
          Row parameter j
          <select
            id="ls-normal-j"
            value={column}
            onChange={(e) => setJ(+e.target.value)}
          >
            {parameters.map((p, i) => (
              <option key={p.id} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Column parameter k
          <select
            id="ls-normal-k"
            value={other}
            onChange={(e) => setK(+e.target.value)}
          >
            {parameters.map((p, i) => (
              <option key={p.id} value={i}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        Whiten first: Σ = L Lᵀ, Aᵥ = L⁻¹A, wᵥ = L⁻¹w. Thus AᵥᵀAᵥ = AᵀPA, even
        when observations are correlated. A whitened row can mix multiple
        physical components.
      </p>
      <p className="ls-equation">
        N[{parameters[column].label}, {parameters[other].label}] = Σᵣ Aᵥ[r,j]
        Aᵥ[r,k] = {number(fit.N[column][other], 10)} m⁻²
      </p>
      <p className="ls-equation">
        u[{parameters[column].label}] = Σᵣ Aᵥ[r,j] wᵥ[r] ={" "}
        {number(fit.u[column], 10)} m⁻¹
      </p>
      <div className="ls-table-scroll ls-term-table">
        <table>
          <thead>
            <tr>
              <th>Whitened row</th>
              <th>Aᵥ[r,j] × Aᵥ[r,k]</th>
              <th>Contribution to N</th>
              <th>Aᵥ[r,j] × wᵥ[r]</th>
              <th>Contribution to u</th>
            </tr>
          </thead>
          <tbody>
            {fit.white.A.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  {number(r[column])} × {number(r[other])}
                </td>
                <td>{number(r[column] * r[other])}</td>
                <td>
                  {number(r[column])} × {number(fit.white.w[i])}
                </td>
                <td>{number(r[column] * fit.white.w[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        For multiple unknowns, δxⱼ is generally <em>not</em> uⱼ/Nⱼⱼ: the
        off-diagonal terms couple the unknowns. Solve the whole system.
      </p>
    </section>
  );
}
function QualityPanel({ step, result }) {
  if (!step?.fit.Cx) return null;
  const f = step.fit,
    ready = result.data.kind !== "code" || step.converged;
  return (
    <section className="ls-worked ls-quality" id="ls-quality">
      <span>REDUNDANCY, RESIDUALS & STOCHASTIC MODEL</span>
      <h3>Does the evidence agree with the stated precision?</h3>
      <div className="ls-formula-grid">
        <p className="ls-equation">
          ν = m − n = {f.m} − {f.n} = {f.dof}
        </p>
        <p className="ls-equation">T = vᵀPv = {number(f.objective, 10)}</p>
        <p className="ls-equation">
          σ̂₀ = √(T/ν) = {f.sigma0 === null ? "undefined" : number(f.sigma0, 9)}
        </p>
        <p className="ls-equation">
          AᵀPv ≈ [{f.gradient.map((v) => number(v, 4)).join(", ")}]
        </p>
      </div>
      <details className="ls-details">
        <summary>Expand the actual vᵀPv calculation</summary>
        <p>
          Use the linearized residual v = Aδx − w. With z = L⁻¹v, T = zᵀz. For
          correlated observations these are mixed whitened residuals, not
          independent post-fit diagnostic statistics.
        </p>
        <p className="ls-equation">
          T = {f.whitenedResidual.map((v) => `(${number(v, 8)})²`).join(" + ")}{" "}
          = {number(f.objective, 10)}
        </p>
        <div className="ls-matrix-grid">
          <Matrix
            name="v · linearized residuals"
            values={f.v}
            rows={step.model.rows.map((o) => o.id)}
            unit="m"
          />
          <Matrix
            name="z = L⁻¹v"
            values={f.whitenedResidual}
            columns={["dimensionless"]}
          />
        </div>
      </details>
      <div
        className={`ls-test-result ${ready ? (f.globalStatus === "inside interval" ? "ls-consistent" : "ls-caution") : ""}`}
        id="ls-global-test"
      >
        {!ready
          ? "Do not interpret a global test before the nonlinear iteration has converged."
          : f.dof <= 0
            ? "No redundancy: residual agreement cannot test the stochastic model."
            : `95% two-sided χ² interval: [${f.limits[0].toFixed(5)}, ${f.limits[1].toFixed(5)}]. T = ${f.objective.toFixed(5)} is ${f.globalStatus}.`}
      </div>
      <p>
        {f.globalStatus === "above interval"
          ? "A high statistic suggests the observations, functional model and assumed covariance disagree. It does not identify which reading is wrong."
          : f.globalStatus === "below interval"
            ? "A low statistic can reflect conservative standard deviations, unmodelled correlations or chance—not proof of exceptional accuracy."
            : "An inside-interval result means no discrepancy was detected at this test level. It does not prove the observations, datum or position are correct."}{" "}
        This test assumes an appropriate model and Gaussian observation errors
        with the stated covariance.
      </p>
      <h4>Residual uncertainty is not the observation's original σ</h4>
      <p className="ls-equation">
        Cᵥ = Σ − A Cₓ Aᵀ · normalized residual rᵢ = vᵢ / √Cᵥ,ᵢᵢ
      </p>
      <p>
        |rᵢ| &gt; 3 is only an exploratory diagnostic. Residuals are correlated,
        multiple testing matters, and small-redundancy observations can hide
        errors. No observation is silently deleted. Generalized redundancy is
        diag(I − A Cₓ AᵀP), whose trace is ν; with correlated observations it is
        not a per-reading probability.
      </p>
      <div className="ls-table-scroll">
        <table id="ls-residual-table">
          <thead>
            <tr>
              <th>Observation</th>
              <th>Adjusted / m</th>
              <th>v / mm</th>
              <th>√Cᵥ,ᵢᵢ / mm</th>
              <th>Normalized r</th>
              <th>Generalized redundancy</th>
            </tr>
          </thead>
          <tbody>
            {step.model.rows.map((o, i) => (
              <tr
                key={o.id}
                className={
                  Math.abs(f.normalized[i] ?? 0) > 3 ? "ls-flagged" : ""
                }
              >
                <th>{o.id}</th>
                <td>{(o.value + step.exactResidual[i]).toFixed(6)}</td>
                <td>{(step.exactResidual[i] * 1000).toFixed(4)}</td>
                <td>{Math.sqrt(Math.max(0, f.Cv[i][i]) * 1e6).toFixed(4)}</td>
                <td>
                  {f.normalized[i] === null
                    ? "not testable"
                    : f.normalized[i].toFixed(4)}
                </td>
                <td>{f.redundancy[i].toFixed(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        {result.data.kind === "code" && !step.converged
          ? "At this intermediate step, Cᵥ and normalized residuals belong to the linearized system, while the adjusted-observation column is re-evaluated from the nonlinear range model. Continue to convergence before interpreting them."
          : "At the converged/linear solution, the exact and linearized residuals agree to numerical precision."}
      </p>
      <h4>Two covariance statements—different assumptions</h4>
      <p>
        Cₓ = (AᵀPA)⁻¹ uses absolute a priori observation covariance. Its
        diagonal square roots are the reported standard uncertainties. The
        separately shown estimate Ĉₓ = σ̂₀² Cₓ assumes only an unknown common
        variance scale. Scaling covariance must not be used to hide a model
        failure. Confidence ellipses here use <em>a priori</em> covariance and
        χ²₂,₀.₉₅ = 5.99146, not the estimated-scale formula.
      </p>
      <div className="ls-matrix-grid">
        <Matrix
          name="Cₓ · a priori"
          values={f.Cx}
          rows={result.parameters.map((p) => p.label)}
          columns={result.parameters.map((p) => p.label)}
          unit="m²"
        />
        <Matrix
          name="Ĉₓ = σ̂₀² Cₓ · estimated common scale"
          values={f.posteriorCx}
          rows={result.parameters.map((p) => p.label)}
          columns={result.parameters.map((p) => p.label)}
          unit="m²"
        />
      </div>
    </section>
  );
}
export default function LeastSquaresAdjustment() {
  const [data, setData] = useState(() => makeLeastSquaresExample("level")),
    [datum, setDatum] = useState("fixed"),
    [weightMode, setWeightMode] = useState("stated"),
    [correlation, setCorrelation] = useState(0.45),
    [correlated, setCorrelated] = useState(true),
    [sigmaScale, setSigmaScale] = useState(1),
    [geometry, setGeometry] = useState("spread"),
    [initialOffset, setInitialOffset] = useState(1),
    [selected, setSelected] = useState("L1"),
    [stage, setStage] = useState("observe"),
    [showAll, setShowAll] = useState(false),
    [iteration, setIteration] = useState(0),
    [profile, setProfile] = useState(false),
    [trial, setTrial] = useState(100),
    [check, setCheck] = useState(null),
    [controlsOpen, setControlsOpen] = useState(
      () => window.matchMedia("(min-width: 761px)").matches,
    );
  const result = useMemo(
    () =>
      solveLeastSquaresExample(data, {
        datum,
        weightMode,
        correlation,
        correlated,
        sigmaScale,
      }),
    [data, datum, weightMode, correlation, correlated, sigmaScale],
  );
  const iterationIndex = Math.min(
      iteration,
      Math.max(0, result.iterations.length - 1),
    ),
    step = result.iterations[iterationIndex],
    fit = step?.fit ?? result.fit,
    parameters = result.parameters,
    rowIndex = step?.model.rows.findIndex((o) => o.id === selected) ?? -1,
    small = data.kind !== "code",
    selectedObservation = data.observations.find((o) => o.id === selected),
    stageIndex = STAGES.findIndex(([id]) => id === stage);
  const updateData = (fn) => {
    setIteration(0);
    setData(fn);
  };
  const switchCase = (kind) => {
    const next = makeLeastSquaresExample(kind);
    setData(next);
    setSelected(next.observations[0].id);
    setIteration(0);
    setDatum("fixed");
    setWeightMode("stated");
    setSigmaScale(1);
    setCorrelation(0.45);
    setCorrelated(true);
    setGeometry("spread");
    setInitialOffset(1);
    setProfile(false);
    setCheck(null);
    setStage("observe");
    setShowAll(false);
  };
  const regenerate = (g, o) => {
    const next = makeLeastSquaresExample("code", {
      geometry: g,
      initialOffset: o,
    });
    setData(next);
    setSelected(next.observations[0].id);
    setIteration(0);
  };
  const edit = (id, key, value) =>
    updateData((d) => ({
      ...d,
      observations: d.observations.map((o) =>
        o.id === id ? { ...o, [key]: value } : o,
      ),
    }));
  const jump = (id) => {
    setStage(id);
    setShowAll(false);
  };
  const perturb = () => {
    if (selectedObservation)
      edit(selected, "value", selectedObservation.value + (small ? 0.02 : 20));
  };
  const download = () => {
    if (!result.final) return;
    const blob = new Blob([adjustmentCsv(result)], {
        type: "text/csv;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `least-squares-${data.kind}-residuals.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const equationRows = step?.model.rows ?? result.model?.rows ?? [],
    names = parameters.map((p) => p.label),
    inspectionStep =
      step ??
      (result.model && fit
        ? { model: result.model, fit, before: parameters.map((p) => p.initial) }
        : null),
    inspectionRows = [
      ...data.observations,
      ...equationRows.filter((o) => o.control),
    ];
  return (
    <div className="ls-lab">
      <PhotoLab
        discipline="SURVEY ADJUSTMENT"
        name="Least-squares adjustment"
        title="Let the observations disagree. Then account for every correction."
        intro="A numerical worksheet for weighted means, levelling, GNSS baselines and nonlinear code positioning. Edit a reading, predict its influence, and follow the actual equations, matrix products, residuals and uncertainty."
        notebook={
          <>
            <h3>One sign convention throughout</h3>
            <p>
              Observations plus residuals equal model predictions: l + v = f(x).
              Around x₀, f(x₀ + δx) ≈ f(x₀) + Aδx. Define w = l − f(x₀), giving
              v = Aδx − w. Minimize J = vᵀPv with P = Σ⁻¹. Thus AᵀPAδx = AᵀPw,
              or Nδx = u. Adjust x̂ = x₀ + δx and l̂ = l + v. In a linear model
              AᵀPv is zero at the minimum. The displayed arithmetic uses
              full-precision numbers; printed values are rounded.
            </p>
            <h3>Numerics, rank and datum</h3>
            <p>
              The engine solves L⁻¹Aδx ≈ L⁻¹w using column-pivoted Householder
              QR, with Σ = LLᵀ. It exposes N, u and the normal-equation
              calculation for teaching but does not numerically invert N to
              obtain the solution. A relative height network without a benchmark
              has one translation freedom; a 3D baseline network has three.
              Rank-deficient systems are reported as unsolved, without
              fabricated coordinates or uncertainty. A weighted benchmark is an
              observation, not an exact constraint. Excluding observations can
              disconnect the network or destroy redundancy.
            </p>
            <h3>Worked examples and their boundaries</h3>
            <p>
              Weighted mean: independent measurements of a single height.
              Levelling: the recorded differences point from the first station
              to the second; σΔh = 2 mm/√km × √L. Route lengths may exceed
              straight plan distances. GNSS baselines: full 3 × 3 covariance
              within each processed ENU vector; different baselines are assumed
              independent. These small synthetic vectors do not simulate raw
              carrier phase, ambiguity fixing or inter-session correlations.
            </p>
            <p>
              Code positioning: ρᵢ = |sᵢ − r| + b + noise, with ECEF receiver
              coordinates and b = cΔt in metres, c = 299792458 m/s. A row is [(X
              − Xᵢ)/rᵢ, (Y − Yᵢ)/rᵢ, (Z − Zᵢ)/rᵢ, 1]. Satellites are fixed
              synthetic orbit points at one epoch; observations are treated as
              already corrected. Satellite clock, Earth rotation during
              propagation, relativity, ionosphere, troposphere, multipath and
              ephemeris errors are not separately processed. This is a
              positioning/adjustment lesson, not a RINEX or PPP engine. A
              receiver clock term is essential even when the satellites are well
              distributed.
            </p>
            <h3>Weights, correlations and precision</h3>
            <p>
              All observation covariance is absolute, in m². Equal weighting
              replaces all active observation standard deviations, including a
              weighted benchmark, by a case-specific common value (6 mm for the
              mean, 2 mm for levelling, 8 mm for baselines, 1.2 m for code).
              Scaling every assumed σ by a common factor changes uncertainty and
              the global statistic, but not the fitted solution. The baseline
              correlation control changes the assumed covariance, not the
              measured baseline numbers. PDOP/GDOP use the unweighted geometry
              matrix and are dimensionless; they are not position accuracy in
              metres.
            </p>
            <h3>Quality tests are conditional statements</h3>
            <p>
              For a full-rank converged solution, ν = m − n and σ̂₀ = √(vᵀPv/ν).
              With known Gaussian covariance, T = vᵀPv is compared with an exact
              two-sided 95% chi-square interval. Cᵥ = Σ − A CₓAᵀ is residual
              covariance and must not be confused with Σ. Normalized residuals
              can suggest inconsistencies but are correlated, may have low
              detectability and do not by themselves prove a reading is a
              blunder. Zero residuals with no redundancy cannot validate the
              experiment.
            </p>
            <p>
              The a priori parameter covariance is Cₓ = (AᵀPA)⁻¹. An estimated
              common-scale covariance is shown separately as Ĉₓ = σ̂₀²Cₓ. The
              GNSS baseline ellipses use a priori horizontal covariance and
              χ²₂,₀.₉₅ = 5.99146; magnification is explicitly labelled. A 95%
              ellipse is not a guarantee about a particular noisy estimate.
              Nonlinear covariance and tests use local linearization and should
              be interpreted after convergence.
            </p>
            <h3>Try these predictions</h3>
            <p>
              Increase a selected reading, then increase its σ and observe how
              its influence changes. Multiply all σ by two: the coordinates
              should stay fixed, Cₓ should grow fourfold and T should fall
              fourfold. Remove the datum and inspect rank. Make a levelling loop
              open and inspect lost redundancy. Ignore baseline correlations and
              compare both coordinates and ellipses. Cluster the GNSS
              satellites: residuals can remain small while uncertainty grows.
              Step through the first GNSS linearization and compare its exact
              and linearized range residuals.
            </p>
            <p>
              References: Ghilani, Adjustment Computations; Teunissen,
              Adjustment Theory; Leick, Rapoport &amp; Tatarnikov, GPS Satellite
              Surveying; Strang &amp; Borre, Linear Algebra, Geodesy, and GPS.
            </p>
          </>
        }
      >
        <MethodTabs
          tabs={Object.entries(LS_CASES)}
          value={data.kind}
          onChange={switchCase}
        />
        <div className="ls-summary" id="ls-summary">
          <div>
            <span>Active equations m</span>
            <b>{fit?.m ?? equationRows.length}</b>
          </div>
          <div>
            <span>Unknowns n / rank</span>
            <b>
              {parameters.length} / {fit?.rank ?? 0}
            </b>
          </div>
          <div>
            <span>Redundancy ν</span>
            <b>{fit?.dof ?? "not solved"}</b>
          </div>
          <div>
            <span>Weighted objective vᵀPv</span>
            <b>
              {fit?.objective === undefined
                ? "not solved"
                : number(fit.objective, 7)}
            </b>
          </div>
          <div>
            <span>σ̂₀ · dimensionless common scale</span>
            <b>
              {fit?.sigma0 === null || fit?.sigma0 === undefined
                ? "undefined"
                : number(fit.sigma0, 6)}
            </b>
          </div>
        </div>
        <div className="ls-layout">
          <aside className="ls-controls">
            <details
              open={controlsOpen}
              onToggle={(e) => setControlsOpen(e.currentTarget.open)}
            >
              <summary>Experiment controls & assumptions</summary>
              <div className="ls-controls-stack">
                <Panel tag="EXPERIMENT" title="Change one assumption">
                  <p>{CASE_NOTES[data.kind]}</p>
                  {["level", "baseline"].includes(data.kind) && (
                    <label className="ls-select" htmlFor="ls-datum">
                      Network datum
                      <select
                        id="ls-datum"
                        value={datum}
                        onChange={(e) => {
                          setDatum(e.target.value);
                          setIteration(0);
                        }}
                      >
                        <option value="fixed">A fixed exactly</option>
                        <option value="weighted">
                          A observed with uncertainty
                        </option>
                        <option value="free">
                          No datum · demonstrate rank defect
                        </option>
                      </select>
                    </label>
                  )}
                  <label className="ls-select" htmlFor="ls-weights">
                    Observation weighting
                    <select
                      id="ls-weights"
                      value={weightMode}
                      onChange={(e) => {
                        setWeightMode(e.target.value);
                        setIteration(0);
                      }}
                    >
                      <option value="stated">Use stated covariance</option>
                      <option value="equal">Equal, independent weights</option>
                    </select>
                  </label>
                  <Slider
                    id="ls-sigma-scale"
                    label="Scale every assumed σ"
                    min={0.5}
                    max={3}
                    step={0.25}
                    value={sigmaScale}
                    display={`${sigmaScale.toFixed(2)}×`}
                    onChange={(v) => {
                      setSigmaScale(v);
                      setIteration(0);
                    }}
                  />
                  {data.kind === "baseline" && (
                    <>
                      <label className="ls-checkbox">
                        <input
                          id="ls-correlated"
                          type="checkbox"
                          checked={correlated}
                          onChange={(e) => setCorrelated(e.target.checked)}
                        />
                        Model correlations within each baseline
                      </label>
                      <Slider
                        id="ls-correlation"
                        label="Assumed E–N correlation ρ"
                        value={correlation}
                        min={-0.8}
                        max={0.8}
                        step={0.05}
                        display={correlation.toFixed(2)}
                        onChange={(v) => {
                          setCorrelation(v);
                          setIteration(0);
                        }}
                      />
                      <p className="ls-note">
                        E–U correlation is +0.2, N–U is −0.1 when enabled.
                        Baselines have different component precisions.
                        Observation values do not change when this assumption
                        changes.
                      </p>
                    </>
                  )}
                  {data.kind === "code" && (
                    <>
                      <label className="ls-select" htmlFor="ls-geometry">
                        Satellite geometry
                        <select
                          id="ls-geometry"
                          value={geometry}
                          onChange={(e) => {
                            setGeometry(e.target.value);
                            regenerate(e.target.value, initialOffset);
                          }}
                        >
                          <option value="spread">Spread around the sky</option>
                          <option value="cluster">
                            Clustered · weak geometry
                          </option>
                        </select>
                      </label>
                      <label className="ls-select" htmlFor="ls-initial-offset">
                        Starting-coordinate offset
                        <select
                          id="ls-initial-offset"
                          value={initialOffset}
                          onChange={(e) => {
                            setInitialOffset(+e.target.value);
                            regenerate(geometry, +e.target.value);
                          }}
                        >
                          <option value={0.1}>About 262 m</option>
                          <option value={1}>About 2.62 km</option>
                          <option value={10}>About 26.2 km</option>
                        </select>
                      </label>
                    </>
                  )}
                  <button id="ls-restore" onClick={() => switchCase(data.kind)}>
                    Restore example & assumptions
                  </button>
                  <p className="ls-note">
                    Changes recompute the mathematical problem. There is no
                    hidden truth-coordinate correction, blunder deletion or
                    success animation.
                  </p>
                </Panel>
                <Panel
                  tag="PREDICT → MODIFY → EXPLAIN"
                  title="A controlled discrepancy"
                >
                  <p>
                    Selected: <b>{selected}</b>. Add {small ? "20 mm" : "20 m"}{" "}
                    to this measured value. Then change its σ and explain how
                    the adjustment responds.
                  </p>
                  <button
                    id="ls-perturb"
                    disabled={!selectedObservation}
                    onClick={perturb}
                  >
                    Add +{small ? "20 mm" : "20 m"} to selected observation
                  </button>
                  <p className="ls-note">
                    This is a visible observation edit. It is not an oracle
                    outlier flag, and nothing is automatically rejected.
                  </p>
                </Panel>
                <Panel
                  tag="NOTATION"
                  title="Signs, symbols & units"
                  collapsible
                >
                  <dl className="ls-symbols">
                    <dt>l</dt>
                    <dd>Measured observations, metres</dd>
                    <dt>x₀, δx, x̂</dt>
                    <dd>Approximation, correction, estimate</dd>
                    <dt>w = l − f(x₀)</dt>
                    <dd>Misclosure, not final residual</dd>
                    <dt>v = f(x̂) − l</dt>
                    <dd>Residual added to measurement</dd>
                    <dt>Σ, P = Σ⁻¹</dt>
                    <dd>Covariance, precision matrix</dd>
                  </dl>
                  <p className="ls-note">
                    Matrices show rounded values; hover any element for
                    full-precision output.
                  </p>
                </Panel>
              </div>
            </details>
          </aside>
          <main className="ls-main">
            <div className="ls-stages" aria-label="Worksheet steps">
              {STAGES.map(([id, label], i) => (
                <button
                  key={id}
                  id={`ls-step-${id}`}
                  aria-controls={`ls-pane-${id}`}
                  aria-pressed={stage === id}
                  className={stage === id ? "on" : ""}
                  onClick={() => jump(id)}
                >
                  <span>0{i + 1}</span>
                  {label}
                </button>
              ))}
            </div>
            <div className="ls-view-option">
              <span>One step at a time</span>
              <button
                id="ls-full-worksheet"
                aria-pressed={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? "Return to focused view" : "Show full worksheet"}
              </button>
            </div>
            {result.error && (
              <section
                className="ls-rank-error"
                id="ls-rank-error"
                role="status"
              >
                <h2>No unique adjustment</h2>
                <p>{result.error}</p>
                <p>
                  No fitted coordinates or covariance have been invented. You
                  can still inspect A and N in the equations and adjustment
                  steps. Restoring sufficient observations and an appropriate
                  datum resolves different kinds of rank deficiency.
                </p>
              </section>
            )}
            <div
              id="ls-pane-observe"
              className="ls-stage-panel"
              hidden={!showAll && stage !== "observe"}
              aria-labelledby="ls-step-observe"
            >
              <Panel
                tag={
                  data.kind === "code"
                    ? "SYNTHETIC EPOCH GEOMETRY"
                    : "OBSERVATIONS ARE CONNECTED EVIDENCE"
                }
                title={LS_CASES[data.kind]}
                className="ls-geometry-panel"
              >
                {data.kind === "mean" ? (
                  <MeanObjective
                    data={data}
                    fit={fit}
                    trial={trial}
                    onTrial={setTrial}
                  />
                ) : data.kind === "code" ? (
                  <SkyView
                    data={data}
                    result={result}
                    selected={selected}
                    onSelect={setSelected}
                  />
                ) : (
                  <NetworkView
                    data={data}
                    result={result}
                    selected={selected}
                    onSelect={setSelected}
                    profile={profile}
                  />
                )}
                {data.kind === "level" && (
                  <div className="ls-view-controls">
                    <button
                      aria-pressed={!profile}
                      onClick={() => setProfile(false)}
                    >
                      Network plan
                    </button>
                    <button
                      aria-pressed={profile}
                      onClick={() => setProfile(true)}
                    >
                      Height profile
                    </button>
                    <span>Click a line to inspect its equation</span>
                  </div>
                )}
              </Panel>
            </div>
            {data.kind === "code" && (
              <section className="ls-iteration" id="ls-iteration">
                <div>
                  <span>GAUSS–NEWTON · REAL LINEARIZATION RECORD</span>
                  <h3>
                    Iteration {step ? iterationIndex + 1 : "—"} /{" "}
                    {result.iterations.length} ·{" "}
                    {step?.converged ? "converged" : "continue to convergence"}
                  </h3>
                </div>
                <button
                  id="ls-next-iteration"
                  disabled={
                    !step || iterationIndex >= result.iterations.length - 1
                  }
                  onClick={() => setIteration((i) => i + 1)}
                >
                  Next iteration →
                </button>
                <button
                  id="ls-converge"
                  disabled={!step}
                  onClick={() => {
                    setIteration(result.iterations.length - 1);
                    setStage("quality");
                  }}
                >
                  Show converged solution
                </button>
                <button onClick={() => setIteration(0)}>First iteration</button>
              </section>
            )}
            <section
              className="ls-observations"
              hidden={!showAll && stage !== "observe"}
            >
              <div className="ls-section-title">
                <span>01 / FIELD BOOK</span>
                <h2>Measured evidence—not adjusted values</h2>
                <p>
                  Edit measurements or their stated standard deviations.
                  Excluding a row changes the equations and redundancy. The
                  generated control observations for an uncertain A appear
                  separately in the matrices.
                </p>
              </div>
              <div className="ls-table-scroll">
                <table id="ls-observation-table">
                  <thead>
                    <tr>
                      <th>Use</th>
                      <th>Observation</th>
                      <th>Measured / m</th>
                      <th>Stated σ / {small ? "mm" : "m"}</th>
                      {data.kind === "level" && <th>Route / km</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.observations.map((o) => (
                      <tr
                        key={o.id}
                        className={selected === o.id ? "ls-selected-row" : ""}
                      >
                        <td>
                          <input
                            id={`ls-use-${o.id}`}
                            aria-label={`Use ${o.id}`}
                            type="checkbox"
                            checked={o.active}
                            onChange={(e) =>
                              edit(o.id, "active", e.target.checked)
                            }
                          />
                        </td>
                        <th>
                          <button
                            className="ls-observation-pick"
                            aria-pressed={selected === o.id}
                            onClick={() => {
                              setSelected(o.id);
                              jump("equations");
                            }}
                          >
                            {o.id} · {o.label}
                          </button>
                        </th>
                        <td>
                          <ObservationNumber
                            id={`ls-value-${o.id}`}
                            label={`${o.id} measured metres`}
                            value={o.value}
                            onChange={(v) => edit(o.id, "value", v)}
                          />
                        </td>
                        <td>
                          <ObservationNumber
                            id={`ls-sigma-${o.id}`}
                            label={`${o.id} standard deviation ${small ? "millimetres" : "metres"}`}
                            positive
                            minimum={small ? 0.001 : 0.000001}
                            value={Number(
                              (o.sigma * (small ? 1000 : 1)).toPrecision(10),
                            )}
                            onChange={(number) => {
                              const v = number / (small ? 1000 : 1);
                              if (Number.isFinite(v) && v > 1e-6)
                                edit(o.id, "sigma", v);
                            }}
                          />
                        </td>
                        {data.kind === "level" && (
                          <td>{o.length.toFixed(2)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div
              id="ls-pane-equations"
              className="ls-stage-panel"
              hidden={!showAll && stage !== "equations"}
              aria-labelledby="ls-step-equations"
            >
              <div className="ls-section-title">
                <span>02 / LINEARIZE & WEIGHT</span>
                <h2>l + v = f(xₖ) + Aδx → Aδx − w = v</h2>
                <p>
                  The selected physical observation is highlighted across the
                  design matrix and misclosure vector.
                </p>
                <label className="ls-select" htmlFor="ls-inspect">
                  Inspect an observation equation
                  <select
                    id="ls-inspect"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                  >
                    {inspectionRows.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id} · {o.label}
                        {o.active ? "" : " · excluded"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <EquationInspector
                data={data}
                step={inspectionStep}
                selected={selected}
                parameters={parameters}
              />
              {fit?.A && (
                <div className="ls-matrix-grid">
                  <Matrix
                    name="A · design matrix"
                    values={fit.A}
                    rows={equationRows.map((o) => o.id)}
                    columns={names}
                    selectedRow={rowIndex}
                  />
                  <Matrix
                    name="w = l − f(xₖ)"
                    values={fit.w}
                    rows={equationRows.map((o) => o.id)}
                    columns={["misclosure / m"]}
                    selectedRow={rowIndex}
                  />
                  <Disclosure
                    title="Covariance & precision matrices"
                    className="ls-matrix-disclosure"
                  >
                    <Matrix
                      name="Σ · assumed observation covariance"
                      values={fit.Sigma}
                      rows={equationRows.map((o) => o.id)}
                      columns={equationRows.map((o) => o.id)}
                      selectedRow={rowIndex}
                      unit="m²"
                    />
                    <Matrix
                      name="P = Σ⁻¹ · precision matrix"
                      values={fit.P}
                      rows={equationRows.map((o) => o.id)}
                      columns={equationRows.map((o) => o.id)}
                      selectedRow={rowIndex}
                      unit="m⁻²"
                    />
                  </Disclosure>
                </div>
              )}
            </div>
            <div
              id="ls-pane-solve"
              className="ls-stage-panel"
              hidden={!showAll && stage !== "solve"}
              aria-labelledby="ls-step-solve"
            >
              {fit?.N && (
                <>
                  <div className="ls-section-title">
                    <span>03 / MINIMIZE THE WEIGHTED SQUARED RESIDUALS</span>
                    <h2>Nδx = u, with N = AᵀPA and u = AᵀPw</h2>
                    <p>
                      The visible normal equations describe the solution. The
                      numerical engine uses whitened, column-pivoted QR for
                      stability.
                    </p>
                  </div>
                  <NormalCalculation fit={fit} parameters={parameters} />
                  <div className="ls-normal-system">
                    <Matrix
                      name="N = AᵀPA"
                      values={fit.N}
                      rows={names}
                      columns={names}
                      unit="m⁻²"
                    />
                    <Matrix
                      name="u = AᵀPw"
                      values={fit.u}
                      rows={names}
                      columns={["right-hand side"]}
                      unit="m⁻¹"
                    />
                    <Matrix
                      name="δx · jointly solved corrections"
                      values={fit.dx}
                      rows={names}
                      columns={["correction / m"]}
                    />
                  </div>
                  <details className="ls-details">
                    <summary>
                      Inspect Cholesky whitening and the pivoted QR system
                    </summary>
                    <div className="ls-matrix-grid">
                      <Matrix name="L, where Σ = LLᵀ" values={fit.L} unit="m" />
                      <Matrix
                        name="Aᵥ = L⁻¹A"
                        values={fit.white.A}
                        columns={names}
                      />
                      <Matrix name="wᵥ = L⁻¹w" values={fit.white.w} />
                      <Matrix
                        name="QR upper factor R"
                        values={fit.R}
                        columns={fit.permutation?.map((i) => names[i])}
                        caption="Columns are pivoted in the displayed order. The solve restores the original unknown order."
                      />
                    </div>
                  </details>
                </>
              )}
              {step && (
                <section className="ls-solution" id="ls-solution">
                  <span>UPDATE THE UNKNOWNS · xₖ₊₁ = xₖ + δx</span>
                  <h2>Each correction has a traceable destination</h2>
                  <div className="ls-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Unknown</th>
                          <th>Before / m</th>
                          <th>δx / m</th>
                          <th>After / m</th>
                          <th>A priori σ / m</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parameters.map((p, i) => (
                          <tr key={p.id}>
                            <th>{p.label}</th>
                            <td>{step.before[i].toFixed(7)}</td>
                            <td>{step.fit.dx[i].toFixed(9)}</td>
                            <td>{step.after[i].toFixed(7)}</td>
                            <td>{Math.sqrt(step.fit.Cx[i][i]).toFixed(7)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.kind === "mean" && (
                    <p className="ls-equation">
                      Ĥ = Σ(pᵢlᵢ) / Σpᵢ ={" "}
                      {number(
                        step.model.rows.reduce(
                          (s, o, i) => s + step.fit.P[i][i] * o.value,
                          0,
                        ),
                        12,
                      )}{" "}
                      /{" "}
                      {number(
                        step.fit.P.reduce((s, r, i) => s + r[i], 0),
                        12,
                      )}{" "}
                      = {step.after[0].toFixed(9)} m
                    </p>
                  )}
                  {data.kind === "code" && (
                    <p>
                      Correction norm:{" "}
                      {norm(step.fit.dx.slice(0, 3)).toExponential(5)} m; clock
                      correction: {step.fit.dx[3].toExponential(5)} m. Exact
                      recomputed objective after this step ={" "}
                      {number(step.afterObjective, 10)}. Convergence requires
                      position and clock-range corrections below 0.00001 m.
                    </p>
                  )}
                </section>
              )}
            </div>
            <div
              id="ls-pane-quality"
              className="ls-stage-panel"
              hidden={!showAll && stage !== "quality"}
              aria-labelledby="ls-step-quality"
            >
              {result.gnss && step?.converged && (
                <section className="ls-gnss-solution">
                  <h3>Converged receiver result</h3>
                  <p>
                    Latitude{" "}
                    {((result.gnss.geodetic.lat * 180) / Math.PI).toFixed(8)}° ·
                    longitude{" "}
                    {((result.gnss.geodetic.lon * 180) / Math.PI).toFixed(8)}° ·
                    ellipsoid height {result.gnss.geodetic.h.toFixed(4)} m.
                  </p>
                  <p className="ls-equation">
                    Δt = b/c = {result.final.after[3].toFixed(6)} / 299792458 ={" "}
                    {result.gnss.clockNs.toFixed(6)} ns
                  </p>
                  <p>
                    Horizontal 95% ellipse semi-axes:{" "}
                    {result.gnss.ellipse.major.toFixed(4)} m,{" "}
                    {result.gnss.ellipse.minor.toFixed(4)} m. These derive from
                    the a priori ECEF covariance rotated into the local ENU
                    frame.
                  </p>
                </section>
              )}
              <QualityPanel step={step} result={result} />
              <section className="ls-check">
                <h3>Check your reasoning</h3>
                <p>
                  If all assumed observation standard deviations are doubled,
                  what happens to a full-rank linear solution?
                </p>
                <div>
                  {[
                    "The fitted coordinates change by a factor of two",
                    "Coordinates stay the same; covariance grows fourfold",
                    "Nothing changes, including uncertainty",
                  ].map((text, i) => (
                    <button
                      key={text}
                      aria-pressed={check === i}
                      onClick={() => setCheck(i)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                {check !== null && (
                  <p role="status">
                    {check === 1
                      ? "Correct. "
                      : "Revisit the normal equations. "}
                    P becomes P/4; both N and u scale by 1/4, so δx is
                    unchanged, while N⁻¹ grows by four. Try the σ multiplier and
                    inspect the matrices.
                  </p>
                )}
              </section>
            </div>
            {!showAll && (
              <nav
                className="ls-step-actions"
                aria-label="Continue the worked example"
              >
                {stageIndex > 0 && (
                  <button onClick={() => jump(STAGES[stageIndex - 1][0])}>
                    ← Previous step
                  </button>
                )}
                {stageIndex < STAGES.length - 1 && (
                  <button onClick={() => jump(STAGES[stageIndex + 1][0])}>
                    Next: {STAGES[stageIndex + 1][1]} →
                  </button>
                )}
              </nav>
            )}
            <button
              id="ls-export"
              className="ls-download"
              disabled={!result.final || !result.converged}
              onClick={download}
            >
              Download converged residual worksheet CSV ↓
            </button>
          </main>
        </div>
      </PhotoLab>
    </div>
  );
}
