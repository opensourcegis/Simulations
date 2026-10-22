import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { scanPlaybackFrame } from "./scanning-model.js";
import { scanOpticsState } from "./scan-optics.js";
import { buildScanOpticsScene } from "./scanning-optics-scene.js";
import "./scanning-mechanism.css";

export default function ScanningMechanism({
  data,
  clock,
  onSlow,
  onSeek,
  onPause,
  running,
}) {
  const host = useRef(null),
    status = useRef(null),
    readout = useRef(null),
    phaseInput = useRef(null),
    labels = useRef([]);
  const [error, setError] = useState(false);
  const initial = scanOpticsState(data.mechanism, 0);
  const parts =
    data.mechanism === "risley"
      ? [
          ["Prism 1", [0, 0.5, 0.8]],
          ["Prism 2", [0, 0.5, 0.1]],
        ]
      : data.mechanism === "multi"
        ? [
            ["Motor", [0, 0, 0.9]],
            ["8-channel head", [0.4, 0, 0.1]],
          ]
        : [
            [
              data.mechanism === "palmer" ? "Axial laser" : "Laser",
              data.mechanism === "palmer" ? [0, 0, -0.8] : [0, -1.4, 0],
            ],
            [
              data.mechanism === "poly"
                ? "Active facet"
                : data.mechanism === "mems"
                  ? "Micromirror"
                  : "Mirror",
              [0, 0, 0.15],
            ],
          ];
  useEffect(() => {
    const element = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError(true);
      return;
    }
    setError(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    element.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101e28);
    scene.add(new THREE.HemisphereLight(0xe4f6ff, 0x334044, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3.5);
    light.position.set(3, -6, 2);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(39, 1, 0.05, 40);
    camera.up.set(0, 0, 1);
    camera.position.set(2.7, -4.2, 2.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, -0.25);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3;
    controls.maxDistance = 12;
    const optic = buildScanOpticsScene(data.mechanism);
    scene.add(optic.root);
    const resize = new ResizeObserver(() => {
      const width = element.clientWidth,
        height = element.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    let visible = true,
      raf,
      lastPublish = -Infinity;
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(element);
    const draw = (now) => {
      if (visible && !document.hidden) {
        const time = clock.current.time;
        const frame = scanPlaybackFrame(data, time);
        // A bright ray uses precisely the emission timestamp shown in the
        // survey. Between pulses it holds; during blanking it disappears.
        const state = scanOpticsState(data.mechanism, frame.pulseTime ?? time);
        optic.update(state, frame.pulseTime !== null, time === 0);
        controls.update();
        parts.forEach((part, index) => {
          const position = new THREE.Vector3(...part[1]).project(camera);
          const label = labels.current[index];
          if (!label) return;
          label.style.left = `${(position.x + 1) * 50}%`;
          label.style.top = `${(1 - position.y) * 50}%`;
          label.hidden =
            Math.abs(position.x) > 0.9 || Math.abs(position.y) > 0.9;
        });
        renderer.render(scene, camera);
        if (now - lastPublish > 80) {
          element.dataset.state = JSON.stringify({
            time,
            pulseTime: frame.pulseTime,
            ...state,
          });
          readout.current.textContent = state.readout;
          phaseInput.current.value = ((time / data.cycleSeconds) % 1).toFixed(
            3,
          );
          status.current.textContent =
            frame.pulseTime !== null
              ? `Recorded pulse · t = ${frame.pulseTime.toFixed(5)} s`
              : time === 0
                ? "Steering preview · no pulse emitted"
                : "No emitted pulse at this sensor tick";
          lastPublish = now;
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      observer.disconnect();
      controls.dispose();
      const materials = new Set(),
        geometries = new Set();
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        for (const m of Array.isArray(o.material)
          ? o.material
          : o.material
            ? [o.material]
            : [])
          materials.add(m);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [data, clock]);
  return (
    <div className="scan-optics" id="scan-optics">
      <h3 id="scan-optics-heading" tabIndex="-1">
        Steering mechanism
      </h3>
      <div
        className="scan-optics-view"
        id="scan-optics-view"
        ref={host}
        role="img"
        aria-label={`Animated cutaway of the ${initial.name} scanner mechanism. Drag to orbit. Amber indicates the incident beam; cyan indicates outgoing directions.`}
      >
        {error && (
          <p className="scan-optics-error">
            3D unavailable. The scan law and mechanism explanation remain below.
          </p>
        )}
        {!error &&
          parts.map(([name], index) => (
            <span
              key={name}
              ref={(element) => {
                labels.current[index] = element;
              }}
              className="scan-optic-part"
            >
              {name}
            </span>
          ))}
      </div>
      <p className="scan-optics-status" ref={status}>
        Steering preview · no pulse emitted
      </p>
      <output ref={readout} id="scan-optics-readout">
        {initial.readout}
      </output>
      <div className="scan-optics-actions">
        <button id="scan-optics-slow" onClick={onSlow}>
          Run slowly
        </button>
        <button id="scan-optics-pause" disabled={!running} onClick={onPause}>
          Pause
        </button>
        <label>
          Inspect cycle phase
          <input
            ref={phaseInput}
            id="scan-optics-phase"
            type="range"
            min="0"
            max="0.999"
            step="0.001"
            defaultValue="0"
            onChange={(event) => {
              const start =
                Math.floor(
                  Math.min(
                    clock.current.time,
                    data.reference.duration - data.cycleSeconds,
                  ) / data.cycleSeconds,
                ) * data.cycleSeconds;
              onSeek(
                Math.min(
                  data.reference.duration,
                  start + Number(event.target.value) * data.cycleSeconds,
                ),
              );
            }}
          />
        </label>
      </div>
      <p className="scan-optics-key">
        Amber: incident · cyan: outgoing · white: surface normal. Drag to orbit.
      </p>
      <details className="scan-optics-explanation">
        <summary>How this mechanism steers the beam</summary>
        <p>{initial.detail}</p>
      </details>
      <small>
        Enlarged cutaway; path lengths schematic. Ray directions share the
        survey scan law and clock.
      </small>
    </div>
  );
}
