import { levelClosures } from "./least-squares-model.js";
export const number = (value, digits = 6) =>
  value === null || value === undefined
    ? "—"
    : !Number.isFinite(value)
      ? "invalid"
      : value === 0
        ? "0"
        : Math.abs(value) < 0.0001 || Math.abs(value) >= 1e6
          ? value.toExponential(digits - 1)
          : Number(value.toPrecision(digits)).toString();
export function Matrix({
  name,
  values,
  rows,
  columns,
  selectedRow = -1,
  selectedColumn = -1,
  unit = "",
  caption = "",
}) {
  if (!values?.length) return null;
  const data = Array.isArray(values[0]) ? values : values.map((v) => [v]);
  return (
    <figure className="ls-matrix">
      <figcaption>
        <b>{name}</b>
        <span>
          {data.length} × {data[0].length}
          {unit && ` · ${unit}`}
        </span>
      </figcaption>
      <div
        className="ls-matrix-scroll"
        tabIndex="0"
        aria-label={`Scrollable ${name} matrix`}
      >
        <table>
          <thead>
            <tr>
              <th scope="col" />
              {data[0].map((_, i) => (
                <th scope="col" key={i}>
                  {columns?.[i] ?? i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r, i) => (
              <tr
                key={i}
                className={i === selectedRow ? "ls-selected-row" : ""}
              >
                <th scope="row">{rows?.[i] ?? i + 1}</th>
                {r.map((v, j) => (
                  <td
                    key={j}
                    className={`${j === selectedColumn ? "ls-selected-column" : ""} ${v === 0 ? "ls-zero" : ""}`}
                    title={v.toPrecision(16)}
                  >
                    {number(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caption && <p>{caption}</p>}
    </figure>
  );
}
function activate(event, fn) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    fn();
  }
}
export function NetworkView({
  data,
  result,
  selected,
  onSelect,
  profile = false,
  magnification = 1500,
}) {
  const stations = result.stations ?? data.stations,
    chosen = data.observations.find((o) => o.id === selected),
    maxE = Math.max(...stations.map((p) => p.e), 1),
    maxN = Math.max(...stations.map((p) => p.n), 1);
  const axisScale = Math.min(560 / maxE, 220 / maxN),
    point = (p) => [
      65 + (560 - maxE * axisScale) / 2 + p.e * axisScale,
      285 - p.n * axisScale,
    ],
    profilePoint = (p, i) => [
      85 + i * 175,
      260 - ((p.adjustedHeight ?? p.h) - 99) * 40,
    ];
  const edges = data.observations.filter(
      (o) => data.kind !== "baseline" || o.axis === 0,
    ),
    coordinates = Object.fromEntries(
      stations.map((p, i) => [p.id, profile ? profilePoint(p, i) : point(p)]),
    );
  return (
    <div className="ls-visual">
      <svg
        viewBox="0 0 720 355"
        role="group"
        aria-label={
          profile
            ? "Height profile. Stations arranged by name; vertical axis in metres."
            : "Survey network plan. Select a measured connection to inspect its equation."
        }
      >
        <defs>
          <pattern
            id="ls-field-grid"
            width="36"
            height="36"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M36 0H0V36"
              fill="none"
              stroke="#dbe4dd"
              strokeWidth=".7"
            />
          </pattern>
        </defs>
        <rect width="720" height="355" fill="#edf2e9" />
        <rect
          x="32"
          y="28"
          width="656"
          height="292"
          fill="url(#ls-field-grid)"
        />
        {profile &&
          [99, 100, 101, 102, 103, 104].map((h) => (
            <g key={h}>
              <line
                x1="40"
                x2="680"
                y1={260 - (h - 99) * 40}
                y2={260 - (h - 99) * 40}
                stroke="#cedbd2"
              />
              <text x="6" y={264 - (h - 99) * 40}>
                {h}
              </text>
            </g>
          ))}
        {edges.map((o, i) => {
          const a = coordinates[o.from],
            b = coordinates[o.to],
            active = chosen?.from === o.from && chosen?.to === o.to;
          return (
            <g
              key={o.id}
              role="button"
              tabIndex="0"
              aria-label={`Inspect observation ${o.label}`}
              onClick={() => onSelect(o.id)}
              onKeyDown={(e) => activate(e, () => onSelect(o.id))}
            >
              <line
                x1={a[0]}
                y1={a[1]}
                x2={b[0]}
                y2={b[1]}
                stroke={active ? "#b86136" : o.active ? "#6a8d83" : "#aab6ae"}
                strokeWidth={active ? 4 : 2}
                strokeDasharray={o.active ? undefined : "6 5"}
              />
              <circle
                cx={(a[0] + b[0]) / 2}
                cy={(a[1] + b[1]) / 2}
                r="12"
                fill={active ? "#b86136" : "#fffefa"}
                stroke="#b1c8b9"
              />
              <text
                x={(a[0] + b[0]) / 2}
                y={(a[1] + b[1]) / 2 + 4}
                textAnchor="middle"
                fill={active ? "#fffefa" : "#426257"}
              >
                {data.kind === "baseline" ? `G${i + 1}` : o.id}
              </text>
            </g>
          );
        })}
        {stations.map((p) => {
          const [x, y] = coordinates[p.id],
            e = p.ellipse;
          return (
            <g key={p.id}>
              {e && (
                <ellipse
                  cx={x}
                  cy={y}
                  rx={e.major * magnification * axisScale}
                  ry={e.minor * magnification * axisScale}
                  transform={`rotate(${(-e.angle * 180) / Math.PI} ${x} ${y})`}
                  fill="#e5b36625"
                  stroke="#a56d32"
                  strokeWidth="1.3"
                />
              )}
              {p.id === "A" ? (
                <path
                  d={`M${x} ${y - 10}l-10 18h20z`}
                  fill="#4a6358"
                  stroke="#fff"
                  strokeWidth="2"
                />
              ) : (
                <circle
                  cx={x}
                  cy={y}
                  r="8"
                  fill="#3c6e66"
                  stroke="#fffefa"
                  strokeWidth="3"
                />
              )}
              <rect
                x={x - 34}
                y={y + 15}
                width="108"
                height="34"
                rx="4"
                fill="#fffefa"
                stroke="#cfdbd0"
              />
              <text x={x - 26} y={y + 30} fontWeight="700">
                {p.id}
                {data.kind === "level"
                  ? ` · ${(p.adjustedHeight ?? p.h).toFixed(4)} m`
                  : " · station"}
              </text>
              <text x={x - 26} y={y + 43} fontSize="8">
                {result.error
                  ? "unsolved approximation"
                  : data.kind === "level"
                    ? `σH ${((p.sigma ?? 0) * 1000).toFixed(2)} mm`
                    : p.ellipse
                      ? `a95 ${(p.ellipse.major * 1000).toFixed(1)} mm`
                      : "datum reference"}
              </text>
            </g>
          );
        })}
        <text x="42" y="346">
          {profile
            ? "Height scale in m · station spacing schematic"
            : data.kind === "baseline"
              ? `East / North plan · 95% ellipses magnified ${magnification}×`
              : `East / North plan · line lengths are surveyed routes, not straight chords`}
        </text>
      </svg>
      {data.kind === "level" && (
        <div className="ls-closures">
          {levelClosures(data, result).map((c) => (
            <span key={c.label}>
              {c.label}
              <b>
                {c.raw === null
                  ? "loop open"
                  : `${(c.raw * 1000).toFixed(2)} → ${c.after === null ? "—" : (c.after * 1000).toFixed(3)} mm`}
              </b>
            </span>
          ))}
          <p>
            Measured → adjusted loop closure. Closure demonstrates internal
            consistency, not an independently verified datum.
          </p>
        </div>
      )}
    </div>
  );
}
export function SkyView({ data, selected, onSelect, result }) {
  const cx = 220,
    cy = 165,
    r = 130;
  return (
    <div className="ls-visual">
      <svg
        viewBox="0 0 720 355"
        role="group"
        aria-label="Synthetic satellite skyplot. Centre is zenith, edge is horizon; North up and azimuth clockwise."
      >
        <rect width="720" height="355" fill="#102b38" />
        {[30, 60, 90].map((el) => (
          <g key={el}>
            <circle
              cx={cx}
              cy={cy}
              r={(r * (90 - el)) / 90}
              fill="none"
              stroke="#355462"
            />
            <text x={cx + 3} y={cy - (r * (90 - el)) / 90 + 12} fill="#9eb9be">
              {el}°
            </text>
          </g>
        ))}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#63818c" />
        <path
          d={`M${cx - r} ${cy}H${cx + r}M${cx} ${cy - r}V${cy + r}`}
          stroke="#355462"
        />
        <text x={cx} y="23" textAnchor="middle" fill="#d7e5df">
          N
        </text>
        <text x="368" y={cy + 4} fill="#d7e5df">
          E
        </text>
        <circle cx={cx} cy={cy} r="5" fill="#f2c381" />
        {data.observations.map((o) => {
          const radius = (r * (90 - o.el)) / 90,
            x = cx + radius * Math.sin((o.az * Math.PI) / 180),
            y = cy - radius * Math.cos((o.az * Math.PI) / 180),
            chosen = o.id === selected;
          return (
            <g
              key={o.id}
              role="button"
              tabIndex="0"
              aria-label={`Inspect satellite ${o.id}`}
              onClick={() => onSelect(o.id)}
              onKeyDown={(e) => activate(e, () => onSelect(o.id))}
            >
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={chosen ? "#e9ba7d" : "#466975"}
                strokeWidth={chosen ? 2.4 : 1}
                opacity={o.active ? 1 : 0.2}
              />
              <circle
                cx={x}
                cy={y}
                r={chosen ? 10 : 7}
                fill={o.active ? (chosen ? "#edc184" : "#88b9c5") : "#576c76"}
              />
              <text x={x + 12} y={y + 4} fill="#e2e7dc">
                {o.id}
              </text>
            </g>
          );
        })}
        <text x="424" y="65" fill="#d8e8e3" fontSize="15">
          Geometry is part of the answer
        </text>
        <text x="424" y="100" fill="#91bac7">
          PDOP · unweighted geometry
        </text>
        <text x="424" y="132" fill="#f0c98d" fontSize="26">
          {result.gnss?.pdop.toFixed(3) ?? "not solvable"}
        </text>
        <text x="424" y="171" fill="#91bac7">
          GDOP · includes receiver clock
        </text>
        <text x="424" y="202" fill="#d8e8e3" fontSize="23">
          {result.gnss?.gdop.toFixed(3) ?? "—"}
        </text>
        <text x="424" y="242" fill="#b3c9c8">
          Eight synthetic satellite positions.
        </text>
        <text x="424" y="262" fill="#b3c9c8">
          Not a live constellation or ephemeris.
        </text>
        <text x="424" y="282" fill="#b3c9c8">
          A small residual is not low uncertainty.
        </text>
        <text x="52" y="337" fill="#a8c2c6">
          Horizon at edge · zenith at centre · elevation radial, azimuth
          clockwise
        </text>
      </svg>
    </div>
  );
}
export function MeanObjective({ data, fit, trial, onTrial }) {
  if (!data.observations.some((o) => o.active))
    return (
      <p>No active observations. Restore a reading to draw the objective.</p>
    );
  const rows = data.observations.filter((o) => o.active),
    lo = Math.min(...rows.map((o) => o.value)) - 0.01,
    hi = Math.max(...rows.map((o) => o.value)) + 0.01,
    P = fit?.P,
    objective = (h) =>
      rows.reduce(
        (s, o, i) => s + (h - o.value) ** 2 * (P?.[i]?.[i] ?? 1 / o.sigma ** 2),
        0,
      ),
    max = Math.max(objective(lo), objective(hi)),
    X = (v) => 58 + ((v - lo) / (hi - lo)) * 620,
    Y = (v) => 280 - (v / max) * 240;
  const path = Array.from({ length: 181 }, (_, i) => {
      const h = lo + ((hi - lo) * i) / 180;
      return `${i ? "L" : "M"}${X(h)},${Y(objective(h))}`;
    }).join(" "),
    estimate = fit?.dx ? 100 + fit.dx[0] : null;
  return (
    <div className="ls-mean-objective">
      <svg
        viewBox="0 0 720 340"
        role="img"
        aria-label="Weighted squared-error objective versus trial height. The fitted mean is at the minimum."
      >
        <rect width="720" height="340" fill="#f2f4ec" />
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line
              x1="58"
              x2="678"
              y1={Y(max * f)}
              y2={Y(max * f)}
              stroke="#d2ddd3"
            />
            <text x="50" y={Y(max * f) + 4} textAnchor="end">
              {(max * f).toFixed(0)}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#397d77" strokeWidth="3" />
        {estimate !== null && (
          <line
            x1={X(estimate)}
            x2={X(estimate)}
            y1="32"
            y2="284"
            stroke="#32685d"
            strokeDasharray="5 4"
          />
        )}
        <line x1={X(trial)} x2={X(trial)} y1="32" y2="284" stroke="#b76c3b" />
        <circle cx={X(trial)} cy={Y(objective(trial))} r="5" fill="#b76c3b" />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={X(lo + (hi - lo) * f)} y="305" textAnchor="middle">
            {(lo + (hi - lo) * f).toFixed(3)}
          </text>
        ))}
        <text x="58" y="22">
          J(H) = Σ (H − lᵢ)² / σᵢ²
        </text>
        <text x="580" y="328">
          Trial height / m
        </text>
      </svg>
      <label htmlFor="ls-trial">
        Try a height:{" "}
        <b>
          {trial.toFixed(4)} m · J = {objective(trial).toFixed(4)}
        </b>
        <input
          id="ls-trial"
          type="range"
          min={lo}
          max={hi}
          step=".0001"
          value={Math.max(lo, Math.min(hi, trial))}
          onChange={(e) => onTrial(+e.target.value)}
        />
      </label>
    </div>
  );
}
