import "./disclosure.css";

// Keep controls mounted: opening an explanation must never regenerate a shot,
// reset an estimator or discard a learner's input.
export default function Disclosure({
  title,
  children,
  className = "",
  defaultOpen = false,
  id,
}) {
  return (
    <details
      id={id}
      className={`lab-disclosure ${className}`}
      open={defaultOpen}
    >
      <summary>{title}</summary>
      <div className="lab-disclosure-body">{children}</div>
    </details>
  );
}
