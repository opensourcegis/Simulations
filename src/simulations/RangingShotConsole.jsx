export default function RangingShotConsole({
  distance,
  onDistance,
  pulseWidth,
  onPulseWidth,
  speed,
  onSpeed,
  continuous,
  onContinuous,
  playback,
  measured,
  onFire,
  onStop,
}) {
  const state = playback.active
    ? "acquiring"
    : measured
      ? measured.detected
        ? "valid"
        : "miss"
      : "idle";
  const status = measured
    ? measured.detected
      ? `${playback.active ? "Last completed shot" : "Last shot"} · valid return (includes timing noise)`
      : "No valid return · expected SNR below 6"
    : playback.active
      ? "Awaiting return · acquisition in progress"
      : "Awaiting a new valid return";
  return (
    <section
      className="rng-shot-console"
      id="rng-shot-console"
      data-state={state}
      data-capture-seed={measured?.seed ?? ""}
      tabIndex={-1}
      aria-labelledby="rng-shot-title"
    >
      <div className="rng-shot-heading">
        <div>
          <h2 id="rng-shot-title">Pulse measurement</h2>
        </div>
        <div className="rng-shot-actions">
          <button
            id="rng-fire"
            className="rng-fire-primary"
            onClick={onFire}
            disabled={playback.active}
            aria-describedby="rng-shot-instructions"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M2 11h4l2-7 4 12 2-5h4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            Fire pulse
          </button>
          <button
            id="rng-stop"
            className="rng-stop"
            onClick={onStop}
            disabled={!playback.active}
          >
            Stop
          </button>
        </div>
      </div>
      <div className="rng-shot-fields">
        <label className="rng-control">
          Target distance <b>{distance} m</b>
          <input
            id="rng-distance"
            type="range"
            min="10"
            max="300"
            step="1"
            value={distance}
            onChange={(e) => onDistance(+e.target.value)}
          />
        </label>
        <label className="rng-control">
          Pulse width <b>{pulseWidth} ns</b>
          <input
            id="rng-width"
            type="range"
            min="1"
            max="40"
            step="1"
            value={pulseWidth}
            onChange={(e) => onPulseWidth(+e.target.value)}
          />
        </label>
        <div className="rng-shot-readout">
          <span>
            {playback.active && measured
              ? "LAST COMPLETED RANGE"
              : "MEASURED ONE-WAY RANGE"}
          </span>
          <div className="rng-result" id="rng-result">
            {measured?.detected ? measured.range.toFixed(2) : "—"}
            <small>m</small>
          </div>
          <p className="rng-result-label" id="rng-detection" role="status">
            {status}
          </p>
        </div>
      </div>
      <details className="rng-playback-options"><summary>Playback &amp; repeat settings</summary>
      <div className="rng-shot-footer">
        <label className="rng-check">
          <input
            id="rng-repeat"
            type="checkbox"
            checked={continuous}
            onChange={(e) => onContinuous(e.target.checked)}
          />
          Repeat after each return
        </label>
        <label className="rng-playback-speed" htmlFor="rng-speed">
          Playback{" "}
          <input
            id="rng-speed"
            type="range"
            min="0.3"
            max="4"
            step="0.1"
            value={speed}
            onChange={(e) => onSpeed(+e.target.value)}
          />
          <b>{speed.toFixed(1)}×</b>
        </label>
        <p id="rng-shot-instructions">
          Change a setting, then fire. Playback is slowed; measured time stays
          in ns.
        </p>
      </div>
      </details>
      <div
        className="rng-shot-progress"
        aria-label={
          playback.active
            ? "Pulse acquisition in progress"
            : measured
              ? "Pulse acquisition complete"
              : "Ready to emit a pulse"
        }
      >
        {["Emit", "Reflect", "Receive"].map((title, i) => (
          <span
            key={title}
            className={
              (playback.active && playback.progress >= i / 2) || measured
                ? "reached"
                : ""
            }
          >
            <i />
            {title}
          </span>
        ))}
        <b>
          {state === "acquiring"
            ? continuous
              ? "Repeating · Stop to finish"
              : "Acquiring return…"
            : state === "valid"
              ? "Return accepted"
              : state === "miss"
                ? "Below detection gate"
                : "Ready to fire"}
        </b>
      </div>
    </section>
  );
}
