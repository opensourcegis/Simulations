import "./photo-lab.css";
export function PhotoLab({
  name,
  title,
  intro,
  children,
  notebook,
  discipline = "PHOTOGRAMMETRY",
}) {
  return (
    <div className="photo-lab">
      <header className="photo-header">
        <a href={import.meta.env.BASE_URL}>
          <span aria-hidden="true">⌁</span> GEOSIM / All laboratories
        </a>
        <span>
          {discipline} · {name.toUpperCase()}
        </span>
      </header>
      <section className="photo-intro">
        <p className="photo-eyebrow">{name}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
      </section>
      {children}
      <details className="photo-notebook">
        <summary>
          <span>
            <span className="photo-eyebrow">THE LAB NOTEBOOK</span>Principles,
            experiments &amp; model limits
          </span>
          <span aria-hidden="true">＋</span>
        </summary>
        <div>{notebook}</div>
      </details>
      <footer className="photo-footer">
        GEOSIM / Make a prediction. Change one variable. Inspect the evidence.
      </footer>
    </div>
  );
}
export function Panel({ tag, title, children, className = "" }) {
  return (
    <section className={"photo-panel " + className}>
      <h2>
        <span>{tag}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
export function Slider({
  id,
  label,
  value,
  display,
  min,
  max,
  step = 1,
  onChange,
}) {
  return (
    <label className="photo-control" htmlFor={id}>
      {label}
      <b>{display ?? value}</b>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </label>
  );
}
export function Metric({ label, value, unit = "" }) {
  return (
    <div className="photo-metric">
      <dt>{label}</dt>
      <dd>
        {value}
        <small>{unit}</small>
      </dd>
    </div>
  );
}
export function MethodTabs({ tabs, value, onChange }) {
  return (
    <div className="photo-tabs" aria-label="Experiment stage">
      {tabs.map(([id, title], i) => (
        <button
          key={id}
          aria-pressed={id === value}
          className={id === value ? "on" : ""}
          onClick={() => onChange(id)}
        >
          <span>0{i + 1}</span>
          {title}
        </button>
      ))}
    </div>
  );
}
