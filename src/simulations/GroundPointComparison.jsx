export default function GroundPointComparison({ shot }) {
  if (!shot) return <p>No forward ground hit. No endpoint is invented.</p>;
  const span = Math.max(
      0.1,
      Math.abs(shot.error[0]) * 1.7,
      Math.abs(shot.error[1]) * 1.7,
    ),
    x = (v) => 210 + (v / span) * 135,
    y = (v) => 150 - (v / span) * 100;
  return (
    <div className="teaching-result">
      <h3>Ground-point comparison</h3>
      <p>
        Local map centred on the true hit · auto-fit axes in metres · not a
        second ray–terrain intersection
      </p>
      <svg
        viewBox="0 0 420 280"
        role="img"
        aria-label="Auto-fit north-west map of true and reconstructed ground points, with an error vector."
      >
        <defs>
          <marker
            id="geo-error-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10" fill="#b65d3e" />
          </marker>
        </defs>
        {[-1, 0, 1].map((i) => (
          <g key={i} stroke="#d4dfd7">
            <path d={`M${x(i * span)} 35V250M35 ${y(i * span)}H385`} />
            <text
              x={x(i * span)}
              y="270"
              stroke="none"
              fill="#52685d"
              textAnchor="middle"
              fontSize="10"
            >
              {(i * span).toFixed(2)}
            </text>
          </g>
        ))}
        <text x="20" y="20" fill="#52685d" fontSize="11">
          North ↑ · West →
        </text>
        <circle
          cx="210"
          cy="150"
          r="7"
          fill="#fff"
          stroke="#23705f"
          strokeWidth="3"
        />
        <path
          d={`M210 150L${x(shot.error[1])} ${y(shot.error[0])}`}
          stroke="#b65d3e"
          strokeWidth="2"
          markerEnd="url(#geo-error-arrow)"
        />
        <circle
          cx={x(shot.error[1])}
          cy={y(shot.error[0])}
          r="4"
          fill="#b65d3e"
        />
        <text x="210" y="180" fill="#23705f" fontSize="11" textAnchor="middle">
          True hit
        </text>
        <text
          x={x(shot.error[1])}
          y={y(shot.error[0]) - 14}
          fill="#9a4a30"
          fontSize="11"
          textAnchor="middle"
        >
          Reconstructed
        </text>
      </svg>
      <div className="teaching-coordinates">
        <span>True XYZ</span>
        <code id="geo-actual">
          {shot.actual.map((v) => v.toFixed(3)).join(", ")} m
        </code>
        <span>Reconstructed XYZ</span>
        <code id="geo-estimated">
          {shot.estimated.map((v) => v.toFixed(3)).join(", ")} m
        </code>
        <span>Δ north / west / up</span>
        <code>
          {shot.error.map((v) => (v * 100).toFixed(2)).join(" / ")} cm
        </code>
      </div>
      <p>
        Height error is retained in Δup; the map is only the horizontal
        projection.
      </p>
    </div>
  );
}
