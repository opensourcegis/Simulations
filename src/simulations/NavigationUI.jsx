import { useEffect, useRef, useState } from "react";
import { PhotoLab } from "./PhotoLabUI.jsx";
import "./navigation-labs.css";

export function NavigationLab(props) {
  return (
    <div className="navigation-lab">
      <PhotoLab {...props} discipline="INERTIAL NAVIGATION" />
    </div>
  );
}
export function usePlayback(duration, resetKey) {
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState(1);
  const current = useRef(time);
  current.current = time;
  useEffect(() => {
    setTime(0);
    setPlaying(false);
  }, [resetKey]);
  useEffect(() => {
    if (!playing) return;
    let frame,
      last = performance.now(),
      published = last,
      t = current.current;
    const loop = (now) => {
      t = Math.min(duration, t + Math.min(0.15, (now - last) / 1000) * rate);
      last = now;
      if (now - published > 70 || t === duration) {
        setTime(t);
        published = now;
      }
      if (t === duration) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, duration]);
  const seek = (t) => {
    setPlaying(false);
    setTime(Math.max(0, Math.min(duration, t)));
  };
  return {
    time,
    playing,
    rate,
    setRate,
    seek,
    reset: () => seek(0),
    toggle: () => {
      if (time >= duration) setTime(0);
      setPlaying((v) => !v);
    },
  };
}
export function Playback({ id, clock, duration }) {
  return (
    <div
      className="nav-playback"
      id={`${id}-playback`}
      data-time={clock.time.toFixed(2)}
      data-playing={clock.playing}
    >
      <div className="nav-play-buttons">
        <button id={`${id}-play`} onClick={clock.toggle}>
          {clock.playing ? "Pause" : "Play experiment ▶"}
        </button>
        <button id={`${id}-reset`} onClick={clock.reset}>
          Reset time
        </button>
        <label>
          Playback speed{" "}
          <select
            value={clock.rate}
            onChange={(e) => clock.setRate(+e.target.value)}
          >
            {[0.25, 0.5, 1, 2].map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </label>
        <output>
          {clock.time.toFixed(2)} / {duration} s
        </output>
      </div>
      <label htmlFor={`${id}-time`}>
        Inspect a timestamp
        <input
          id={`${id}-time`}
          type="range"
          min="0"
          max={duration}
          step=".01"
          value={clock.time}
          onChange={(e) => clock.seek(+e.target.value)}
        />
      </label>
    </div>
  );
}
export function SeriesChart({
  id,
  title,
  records,
  series,
  time,
  unit,
  band,
  outage,
}) {
  const rows = records.filter(
      (_, i) => i % 5 === 0 || i === records.length - 1,
    ),
    all = rows.flatMap((r) => series.map((s) => s.value(r)));
  if (band) for (const r of rows) all.push(band(r), -band(r));
  const extent = Math.max(0.1, ...all.map(Math.abs)) * 1.12,
    left = 58,
    top = 16,
    w = 704,
    h = 168,
    end = records.at(-1).t;
  const x = (t) => left + (t / end) * w,
    y = (v) => top + h / 2 - ((v / extent) * h) / 2,
    path = (f) =>
      rows
        .map(
          (r, i) =>
            `${i ? "L" : "M"}${x(r.t).toFixed(2)},${y(f(r)).toFixed(2)}`,
        )
        .join(" ");
  return (
    <figure className="nav-chart" id={id}>
      <figcaption>{title}</figcaption>
      <svg
        viewBox="0 0 800 225"
        role="img"
        aria-label={`${title}. Horizontal axis: time in seconds. Vertical axis: ${unit}.`}
      >
        {outage && outage[1] > outage[0] && (
          <rect
            x={x(outage[0])}
            y={top}
            width={x(outage[1]) - x(outage[0])}
            height={h}
            fill="#e8d8bd"
            opacity=".5"
          />
        )}
        {[-1, 0, 1].map((n) => (
          <g key={n}>
            <line
              x1={left}
              x2={left + w}
              y1={y(n * extent)}
              y2={y(n * extent)}
              stroke="#d9dfda"
            />
            <text x={left - 8} y={y(n * extent) + 4} textAnchor="end">
              {(n * extent).toFixed(extent < 2 ? 2 : 1)}
            </text>
          </g>
        ))}
        {band && (
          <path
            d={`${path(band)} ${rows
              .slice()
              .reverse()
              .map((r) => `L${x(r.t).toFixed(2)},${y(-band(r)).toFixed(2)}`)
              .join(" ")} Z`}
            fill="#88b8c6"
            opacity=".22"
          />
        )}
        {series.map((s) => (
          <path
            key={s.label}
            d={path(s.value)}
            fill="none"
            stroke={s.color}
            strokeWidth="2.2"
          />
        ))}
        <line
          x1={x(time)}
          x2={x(time)}
          y1={top}
          y2={top + h}
          stroke="#273e46"
          strokeDasharray="4 3"
        />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={x(end * f)} y="205" textAnchor="middle">
            {(end * f).toFixed(0)} s
          </text>
        ))}
        <text x="5" y="12">
          {unit}
        </text>
      </svg>
      <div className="nav-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {band && (
          <span>
            <i style={{ background: "#bdd3da" }} />
            Filter ±1σ · marginal East
          </span>
        )}
        {outage && outage[1] > outage[0] && (
          <span>
            <i style={{ background: "#e8d8bd" }} />
            GNSS unavailable
          </span>
        )}
      </div>
    </figure>
  );
}
export function VectorReadout({ label, values, unit, id }) {
  return (
    <div className="nav-vector" id={id}>
      <span>{label}</span>
      <div>
        {values.map((v, i) => (
          <span key={i}>
            <small>{["x", "y", "z"][i]}</small>
            <b>{v.toFixed(3)}</b>
          </span>
        ))}
      </div>
      <small>{unit}</small>
    </div>
  );
}
export function KnowledgeCheck({ question, choices, answer, explanation }) {
  const [selected, setSelected] = useState(null);
  return (
    <section className="nav-check">
      <h3>Check your understanding</h3>
      <p>{question}</p>
      <div>
        {choices.map((c, i) => (
          <button
            key={c}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            {c}
          </button>
        ))}
      </div>
      {selected !== null && (
        <p role="status">
          {selected === answer ? "Correct. " : "Try the reasoning again. "}
          {explanation}
        </p>
      )}
    </section>
  );
}
