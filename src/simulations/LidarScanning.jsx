import { useEffect, useMemo, useRef, useState } from "react";
import ScanningFieldView from "./ScanningFieldView.jsx";
import LidarLearningPanel from "./LidarLearningPanel.jsx";
import {
  SCAN_MECHANISMS,
  buildScanLine,
  scanVisibleCount,
} from "./scanning-model.js";
import "./scanning.css";

export default function LidarScanning() {
  const [mechanism, setMechanism] = useState("osc"),
    [height, setHeight] = useState(80),
    [speed, setSpeed] = useState(10),
    [objects, setObjects] = useState(true),
    [playbackRate, setRate] = useState(0.25),
    [pointColor, setPointColor] = useState("sequence"),
    [showBeam, setBeam] = useState(true),
    [highlightSweep, setHighlightSweep] = useState(true);
  const settings = useMemo(
    () => ({ mechanism, height, speed, objects }),
    [mechanism, height, speed, objects],
  );
  const data = useMemo(() => buildScanLine(settings), [settings]),
    m = SCAN_MECHANISMS.find((m) => m.id === mechanism),
    ref = data.reference;
  const clock = useRef({ time: 0, running: false }),
    rate = useRef(playbackRate);
  rate.current = playbackRate;
  const [snapshot, setSnapshot] = useState({ time: 0, running: false });
  const publish = () => setSnapshot({ ...clock.current });
  const reset = () => {
    clock.current = { time: 0, running: false };
    publish();
  };
  useEffect(() => {
    clock.current = { time: 0, running: false };
    setSnapshot({ ...clock.current });
    let previous = performance.now(),
      lastUpdate = 0,
      raf;
    const loop = (now) => {
      const dt = Math.min(0.1, (now - previous) / 1000);
      previous = now;
      if (clock.current.running) {
        clock.current.time = Math.min(
          ref.duration,
          clock.current.time + dt * rate.current,
        );
        if (clock.current.time >= ref.duration) clock.current.running = false;
        if (now - lastUpdate > 100 || !clock.current.running) {
          setSnapshot({ ...clock.current });
          lastUpdate = now;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [data, ref.duration]);
  const fly = () => {
    if (clock.current.time >= ref.duration) clock.current.time = 0;
    clock.current.running = true;
    publish();
  };
  const pause = () => {
    clock.current.running = false;
    publish();
  };
  const seek = (t) => {
    clock.current = { time: t, running: false };
    publish();
  };
  const count = scanVisibleCount(data.records, snapshot.time);
  const slider = (id, title, value, min, max, step, onChange, unit) => (
    <label className="scan-slider" key={id}>
      {title}
      <b>
        {value} {unit}
      </b>
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
  return (
    <div className="scan-lab">
      <header className="scan-header">
        <a href={import.meta.env.BASE_URL}>← All laboratories</a>
        <span>LIDAR / SCAN GEOMETRY</span>
      </header>
      <div className="scan-intro">
        <span>THE SCANNING LAB</span>
        <h1>LiDAR scan patterns</h1>
        <p>
          Steer a ray, intersect the first visible surface, and watch aircraft
          motion translate the scan pattern.
        </p>
      </div>
      <main className="scan-workspace">
        <section className="scan-primary">
          <div
            className="scan-flight-console"
            id="scan-flight-console"
            data-running={snapshot.running}
            data-time={snapshot.time}
          >
            <div className="scan-flight-heading">
              <div>
                <span>ONE FLIGHT LINE · 180 m</span>
                <h2>{m.name}</h2>
              </div>
              <div className="scan-flight-actions">
                <button id="scan-fly" onClick={fly} disabled={snapshot.running}>
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 9l16-6-6 15-2-6-8-3Z M10 12l8-9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {snapshot.running
                    ? "Flying…"
                    : snapshot.time > 0 && snapshot.time < ref.duration
                      ? "Resume flight"
                      : "Fly line"}
                </button>
                <button
                  id="scan-pause"
                  disabled={!snapshot.running}
                  onClick={pause}
                >
                  Pause
                </button>
                <button id="scan-reset" onClick={reset}>
                  Reset
                </button>
              </div>
            </div>
            <div className="scan-progress">
              <label htmlFor="scan-time">
                Inspect flight time{" "}
                <b id="scan-clock">
                  {snapshot.time.toFixed(2)} / {ref.duration.toFixed(2)} s
                </b>
              </label>
              <input
                id="scan-time"
                type="range"
                min="0"
                max={ref.duration}
                step=".01"
                value={snapshot.time}
                onChange={(e) => seek(+e.target.value)}
              />
            </div>
            <div className="scan-flight-stats">
              <span>
                <b id="scan-count">{count.toLocaleString()}</b> captured returns
              </span>
              <span>
                <b>{height} m</b> scanner AGL
              </span>
              <span>
                <b>{speed} m/s</b> aircraft speed
              </span>
              <span>
                <b>{playbackRate}×</b> playback only
              </span>
            </div>
          </div>
          <ScanningFieldView
            settings={settings}
            data={data}
            clock={clock}
            pointColor={pointColor}
            showBeam={showBeam}
            highlightSweep={highlightSweep}
          />
          <div className="scan-display-controls">
            <label>
              Point colour{" "}
              <select
                id="scan-color"
                value={pointColor}
                onChange={(e) => setPointColor(e.target.value)}
              >
                <option value="sequence">Acquisition time</option>
                <option value="height">Surface height</option>
              </select>
            </label>
            <span className="scan-color-key">
              {pointColor === "height"
                ? "Blue: 0 m → warm: 18 m+"
                : "Cyan: early → gold: late"}
            </span>
            <label>
              <input
                id="scan-show-beam"
                type="checkbox"
                checked={showBeam}
                onChange={(e) => setBeam(e.target.checked)}
              />
              Last recorded pulse
            </label>
            <label>
              <input
                id="scan-highlight-sweep"
                type="checkbox"
                checked={highlightSweep}
                onChange={(e) => setHighlightSweep(e.target.checked)}
              />
              Highlight latest scan cycle
            </label>
            <button id="scan-show-all" onClick={() => seek(ref.duration)}>
              Show complete line
            </button>
          </div>
          <p className="scan-note">
            The aircraft is drawn at physical size, not enlarged to fill the
            flight view. Use Payload to inspect the mounted sensor, or Point
            pattern to read the acquired swath. Amber rays are analytical
            near-infrared guides, not visible light. Each guide ends at its own
            recorded return (bright cream); the latest scan cycle is gold and
            older points are faint. A full accumulated swath can look like a
            dense grid at this scale. Guides hold the last emitted pulse between
            sensor ticks, and disappear during facet blanking. Point symbols are
            fixed screen pixels, not footprint diameters; they are shifted 2.5
            cm toward the scanner only to avoid surface display flicker.
          </p>
          <section className="scan-math">
            <h2>Connect the geometry to the sample pattern</h2>
            <div>
              <article>
                <span>FLAT-PLANE ENVELOPE</span>
                <code>W = 2 H tan α</code>
                <b id="scan-swath">{ref.width.toFixed(2)} m</b>
                <p>
                  {mechanism === "risley"
                    ? "Risley uses 2H(tan 8° + tan 7°) in its paraxial model."
                    : "H is the scanner height; α is the largest across-track off-nadir angle."}{" "}
                  Buildings intercept rays before they reach this reference
                  plane.
                </p>
              </article>
              <article>
                <span>FORWARD ADVANCE / CYCLE</span>
                <code>Δx = v / fscan</code>
                <b>{ref.advance.toFixed(3)} m</b>
                <p>
                  {mechanism === "risley"
                    ? "Here fscan = 2 Hz is the full 0.5 s rosette repeat."
                    : mechanism === "mems"
                      ? "Here fscan = 3.8 Hz is the slow axis, not a complete two-axis pattern repeat."
                      : `fscan = ${m.hz} Hz.`}{" "}
                  Loops and edge dwell are not a uniform grid.
                </p>
              </article>
              <article>
                <span>NOMINAL STRIP DENSITY</span>
                <code>d̄ = q · duty / (v W)</code>
                <b>{ref.density.toFixed(3)} pt/m²</b>
                <p>
                  Illustrative q = {ref.rate.toLocaleString()} rays/s; duty ={" "}
                  {(ref.duty * 100).toFixed(0)}%. Assumes complete flat-strip
                  coverage. This is not local density or a commercial instrument
                  specification.
                </p>
              </article>
            </div>
          </section>
        </section>
        <aside className="scan-settings">
          <section>
            <h2>Choose beam steering</h2>
            <div className="scan-mechanisms">
              {SCAN_MECHANISMS.map((m) => (
                <button
                  key={m.id}
                  id={"scan-mech-" + m.id}
                  aria-pressed={mechanism === m.id}
                  onClick={() => setMechanism(m.id)}
                >
                  <strong>{m.name}</strong>
                  <span>{m.pattern}</span>
                </button>
              ))}
            </div>
            <p>{m.explanation}</p>
            <code>{m.formula}</code>
          </section>
          <section>
            <h2>Flight & scene</h2>
            {slider(
              "scan-height",
              "Scanner height",
              height,
              40,
              160,
              5,
              setHeight,
              "m",
            )}
            {slider(
              "scan-speed",
              "Aircraft speed",
              speed,
              4,
              20,
              1,
              setSpeed,
              "m/s",
            )}
            {slider(
              "scan-playback",
              "Playback rate",
              playbackRate,
              0.05,
              2,
              0.05,
              setRate,
              "×",
            )}
            <label className="scan-check">
              <input
                id="scan-objects"
                type="checkbox"
                checked={objects}
                onChange={(e) => setObjects(e.target.checked)}
              />
              Buildings & opaque canopy surfaces
            </label>
            <p>
              Changing mechanism, height, speed or surfaces resets acquisition.
              Changing colour or playback rate preserves the captured flight.
            </p>
          </section>
          <details>
            <summary>What is physical—and what is simplified?</summary>
            <p>
              Unit rays hit the nearest intersection with a flat terrain plane,
              two opaque rectangular buildings or three opaque ellipsoid
              canopies. Those are the same surfaces rendered in 3D; roofs block
              ground returns. Vegetation penetration, range noise, pulse width,
              weather, roll/pitch, detection thresholds and multiple returns are
              not simulated. Displayed roofs have no unmodelled rooftop
              structures.
            </p>
            <p>
              Pulse timestamps are generated at fixed sensor cadence,
              independent of display frame rate. The six steering laws are
              representative teaching models, not proprietary optical designs. A
              full line can extend outside its nominal rectangular strip; the
              nominal density formula is not a coverage measurement. Reset does
              not change the synthetic site.
            </p>
          </details>
        </aside>
      </main>
      <LidarLearningPanel
        topic="scanning"
        workedExample={`H = ${height} m, W = ${ref.width.toFixed(2)} m, v = ${speed} m/s, q = ${ref.rate} rays/s; flat-strip reference density = ${ref.density.toFixed(3)} pt/m². ${count} first-surface returns acquired so far.`}
        onExperiment={(id) => {
          setMechanism(id === "risley" ? "risley" : "osc");
          setHeight(id === "height" ? 160 : 80);
        }}
      />
    </div>
  );
}
