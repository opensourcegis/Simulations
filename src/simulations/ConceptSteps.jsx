import "./concept-steps.css";

// Buttons switch focus without unmounting the diagrams or changing experiment
// values. "Compare all" is explicit, rather than the initial wall of panels.
export default function ConceptSteps({ id, steps, value, onChange }) {
  return (
    <nav className="concept-steps" aria-label="Lesson section">
      {steps.map(([key, label]) => (
        <button
          key={key}
          id={`${id}-step-${key}`}
          aria-pressed={value === key}
          aria-controls={`${id}-pane-${key}`}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
      <button
        className="concept-compare"
        aria-pressed={value === "all"}
        onClick={() => onChange(value === "all" ? steps[0][0] : "all")}
      >
        {value === "all" ? "Focus one section" : "Compare all"}
      </button>
    </nav>
  );
}
