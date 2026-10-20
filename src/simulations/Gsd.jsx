import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import PhotoLabScene, { caption, marker, segment } from "./PhotoLabScene.jsx";
import { PhotoLab, Panel, Slider, Metric } from "./PhotoLabUI.jsx";
import {
  CAMERA_SENSORS,
  gsdCamera,
  groundPixelRay,
  localGsd,
  imageFootprint,
  imageBlur,
  sampleGroundTarget,
} from "./gsd-model.js";
import "./survey-realism.css";
const cm = (x) => (Number.isFinite(x) ? (x * 100).toFixed(2) : "—");

export default function Gsd() {
  const [f, setF] = useState(50),
    [height, setHeight] = useState(100),
    [elevation, setElevation] = useState(0),
    [tilt, setTilt] = useState(20),
    [slope, setSlope] = useState(0),
    [sensor, setSensor] = useState(0),
    [megapixels, setMegapixels] = useState(24),
    [cell, setCell] = useState([4, 3]);
  const [fNumber, setFNumber] = useState(5.6),
    [exposureMs, setExposure] = useState(1),
    [speed, setSpeed] = useState(15),
    [targetSize, setTarget] = useState(0.5),
    [phase, setPhase] = useState(0),
    [pattern, setPattern] = useState("check"),
    [noise, setNoise] = useState(false),
    [seed, setSeed] = useState(7);
  const camera = useMemo(
    () => gsdCamera({ f, height, elevation, tilt, slope, sensor, megapixels }),
    [f, height, elevation, tilt, slope, sensor, megapixels],
  );
  const u = Math.floor((camera.width * (cell[0] + 0.5)) / 9) + 0.5,
    v = Math.floor((camera.imageHeight * (cell[1] + 0.5)) / 7) + 0.5;
  const footprint = useMemo(() => localGsd(camera, u, v), [camera, u, v]),
    bounds = imageFootprint(camera),
    near = localGsd(camera, camera.width * 0.1, camera.imageHeight / 2),
    far = localGsd(camera, camera.width * 0.9, camera.imageHeight / 2),
    blur = imageBlur(camera, footprint, {
      fNumber,
      exposure: exposureMs / 1000,
      speed,
    });
  const captured = useMemo(
    () =>
      sampleGroundTarget(camera, footprint, {
        size: targetSize,
        pattern,
        phase,
        seed,
        noise,
        fNumber,
        exposure: exposureMs / 1000,
        speed,
      }),
    [
      camera,
      footprint,
      targetSize,
      pattern,
      phase,
      seed,
      noise,
      fNumber,
      exposureMs,
      speed,
    ],
  );
  const imageRef = useRef(null),
    targetRef = useRef(null);
  useEffect(() => {
    const canvas = imageRef.current,
      ctx = canvas.getContext("2d");
    canvas.width = 48;
    canvas.height = 48;
    const image = ctx.createImageData(48, 48);
    for (let i = 0; i < 48 * 48; i++) {
      const value = captured
        ? Math.round(Math.pow(captured.pixels[i], 1 / 2.2) * 255)
        : 20;
      image.data.set([value, value, value, 255], i * 4);
    }
    ctx.putImageData(image, 0, 0);
    const t = targetRef.current,
      tc = t.getContext("2d");
    tc.fillStyle = "#d1d5c7";
    tc.fillRect(0, 0, 200, 200);
    for (let y = 0; y < 200; y++)
      for (let x = 0; x < 200; x++) {
        const white =
          pattern === "bowtie"
            ? Math.abs(x - 100) < Math.abs(y - 100)
            : x < 100 !== y < 100;
        tc.fillStyle = white ? "#e8e8e1" : "#242b2d";
        tc.fillRect(x, y, 1, 1);
      }
  }, [captured, pattern]);
  const build = useCallback(() => {
    const group = new THREE.Group(),
      gradient = Math.tan((camera.slope * Math.PI) / 180),
      groundSize = 260;
    const positions = [
      -groundSize,
      -groundSize,
      camera.elevation - gradient * groundSize,
      groundSize,
      -groundSize,
      camera.elevation + gradient * groundSize,
      groundSize,
      groundSize,
      camera.elevation + gradient * groundSize,
      -groundSize,
      groundSize,
      camera.elevation - gradient * groundSize,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    group.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: 0x697d59,
          side: THREE.DoubleSide,
          roughness: 1,
        }),
      ),
    );
    for (let a = -250; a <= 250; a += 25) {
      segment(
        group,
        [
          [-250, a, camera.elevation - 250 * gradient + 0.05],
          [250, a, camera.elevation + 250 * gradient + 0.05],
        ],
        0xb0bc87,
        0.3,
      );
      segment(
        group,
        [
          [a, -250, camera.elevation + a * gradient + 0.05],
          [a, 250, camera.elevation + a * gradient + 0.05],
        ],
        0xb0bc87,
        0.3,
      );
    }
    const origin = [0, 0, camera.height];
    marker(group, origin, 0xe4e8de, 1.8);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4, 5, 2),
      new THREE.MeshStandardMaterial({ color: 0x617783 }),
    );
    body.position.set(...origin);
    body.rotation.y = (-camera.tilt * Math.PI) / 180;
    group.add(body);
    for (let row = 0; row <= 7; row++)
      for (let col = 0; col <= 9; col++) {
        if (row !== 0 && row !== 7 && col !== 0 && col !== 9) continue;
        const p = groundPixelRay(
          camera,
          (col / 9) * camera.width,
          (row / 7) * camera.imageHeight,
        );
        if (p && Math.hypot(...p) < 1500)
          segment(group, [origin, p], 0x9cc9d5, 0.15);
      }
    for (let row = 0; row < 7; row++)
      for (let col = 0; col < 9; col++) {
        const corners = [
          [col, row],
          [col + 1, row],
          [col + 1, row + 1],
          [col, row + 1],
        ].map(([x, y]) =>
          groundPixelRay(
            camera,
            (x / 9) * camera.width,
            (y / 7) * camera.imageHeight,
          ),
        );
        if (corners.every((p) => p && Math.hypot(...p) < 1500))
          segment(
            group,
            [...corners, corners[0]].map((p) => [p[0], p[1], p[2] + 0.1]),
            col === cell[0] && row === cell[1] ? 0xffd36a : 0xabc5bc,
            col === cell[0] && row === cell[1] ? 0.95 : 0.35,
          );
      }
    if (footprint && footprint.range < 1500) {
      segment(group, [origin, footprint.center], 0xffd36a, 0.9);
      marker(group, footprint.center, 0xffd36a, 0.5);
      const enlarged = footprint.corners.map((p) =>
        p.map(
          (x, j) =>
            footprint.center[j] +
            80 * (x - footprint.center[j]) +
            (j === 2 ? 0.25 : 0),
        ),
      );
      segment(group, [...enlarged, enlarged[0]], 0xffd36a);
      caption(
        group,
        "Native pixel outline ×80",
        [footprint.center[0], footprint.center[1], footprint.center[2] + 5],
        "#ffe0a4",
        4,
      );
    }
    caption(
      group,
      `${camera.width} × ${camera.imageHeight} photosites`,
      [0, 0, camera.height + 8],
      "#c2d7e2",
      5,
    );
    caption(
      group,
      "25 m surface grid · actual ray-plane intersections",
      [-80, -95, camera.elevation - 80 * gradient + 2],
      "#d2ddc7",
      4,
    );
    return group;
  }, [camera, cell, footprint]);
  return (
    <PhotoLab
      name="Ground sampling distance"
      title="A pixel is a footprint—not a resolution guarantee."
      intro="Trace a native camera pixel onto tilted, elevated terrain. Compare near and far sampling, optical blur, motion and subpixel alignment using actual ray–plane intersections."
      notebook={
        <>
          <h3>Sampling geometry</h3>
          <p>
            For level, nadir imagery over a horizontal plane, GSD = pixel pitch
            × height above ground / focal length. Height above a datum is not
            automatically height above terrain. This model uses the selected
            sensor dimensions and native image resolution. Each selected pixel's
            four corner rays intersect z = elevation + tan(slope) X; lengths and
            area are measured on that sloping surface, not a horizontal map
            projection.
          </p>
          <p>
            Camera tilt, terrain slope and image position make footprints
            anisotropic and variable. A ray parallel to or above the plane has
            no forward ground hit. No horizon is silently clamped to a finite
            footprint. The 9 × 7 display regions group many native pixels and
            are not sensor photosites. The selected native-pixel outline is
            enlarged 80×; camera housing is enlarged for visibility. The ground
            viewport is finite; distant intersections may be outside its
            drawing.
          </p>
          <h3>Sampling is not resolving</h3>
          <p>
            A 2 cm pixel footprint does not mean a 2 cm object can be resolved.
            Ideal band-limited sampling requires at least two samples per cycle;
            optics, contrast, pixel integration, demosaicing and motion can make
            practical resolution worse. More pixels do not automatically add
            optical detail. Read GSD separately from diffraction and motion
            blur.
          </p>
          <h3>Native-pixel target crop</h3>
          <p>
            The preview is a fixed 48 × 48 native-pixel crop, not a
            rounded/resized count of pixels forced across a target. Each sensor
            pixel integrates nine subpixel ray-plane samples and a five-tap
            moment-matched blur kernel. The checker/bowtie is defined on the
            ground plane. Moving its phase by a fraction of a pixel changes
            sampling without changing GSD. Large markers may be cropped; the
            true marker size and fractional pixels across it are shown
            numerically.
          </p>
          <p>
            The Airy first-zero diameter is 2.44 λN with λ = 550 nm. Its central
            lobe is approximated by a Gaussian sigma of 0.18 times that
            diameter. Along-image-X ground motion is approximated by a box-blur
            variance (speed × exposure / local GSDx)²/12; this combines with
            diffraction along X, while Y retains diffraction only. This is not a
            compound lens prescription, measured MTF or complete flight-motion
            projection.
          </p>
          <p>
            Optional noise uses an illustrative fixed-exposure charge budget:
            10,000 electrons for unit radiance at 6 µm pitch, f/4 and 1 ms,
            scaled by pixel area, f-number and exposure. Gaussian shot/read
            noise (3 e⁻ RMS), 20,000 e⁻ clipping and a display gamma are
            included. Sensor pitch alone does not determine real SNR. The seed
            is stable until a new sample is requested. No automatic camera
            exposure or resolution certification is simulated.
          </p>
        </>
      }
    >
      <div className="photo-workspace">
        <aside className="photo-controls">
          <Panel tag="01 / CAMERA & SURFACE" title="Project the actual pixel">
            <Slider
              id="gsd-height"
              label="Camera height above datum"
              value={height}
              display={height + " m"}
              min={30}
              max={200}
              step={5}
              onChange={setHeight}
            />
            <Slider
              id="gsd-elevation"
              label="Terrain elevation at X = 0"
              value={elevation}
              display={elevation + " m"}
              min={-20}
              max={25}
              onChange={setElevation}
            />
            <Slider
              id="gsd-focal"
              label="Focal length"
              value={f}
              display={f + " mm"}
              min={16}
              max={100}
              onChange={setF}
            />
            <Slider
              id="gsd-tilt"
              label="Camera off-nadir tilt"
              value={tilt}
              display={tilt + "°"}
              min={0}
              max={70}
              onChange={setTilt}
            />
            <Slider
              id="gsd-slope"
              label="Terrain slope along X"
              value={slope}
              display={slope + "°"}
              min={-25}
              max={25}
              onChange={setSlope}
            />
            <label className="photo-select">
              Sensor format
              <select
                id="gsd-sensor"
                value={sensor}
                onChange={(e) => setSensor(+e.target.value)}
              >
                {CAMERA_SENSORS.map((s, i) => (
                  <option key={s.name} value={i}>
                    {s.name} · {s.width} mm wide
                  </option>
                ))}
              </select>
            </label>
            <label className="photo-select">
              Native resolution
              <select
                id="gsd-resolution"
                value={megapixels}
                onChange={(e) => setMegapixels(+e.target.value)}
              >
                {[12, 24, 48, 96].map((n) => (
                  <option key={n} value={n}>
                    {n} MP
                  </option>
                ))}
              </select>
            </label>
          </Panel>
          <Panel tag="02 / IMAGE FORMATION" title="Separate sampling from blur">
            <Slider
              id="gsd-fnumber"
              label="Aperture f-number"
              value={fNumber}
              display={"f/" + fNumber}
              min={2}
              max={22}
              step={0.1}
              onChange={setFNumber}
            />
            <Slider
              id="gsd-exposure"
              label="Exposure time"
              value={exposureMs}
              display={exposureMs.toFixed(1) + " ms"}
              min={0.1}
              max={10}
              step={0.1}
              onChange={setExposure}
            />
            <Slider
              id="gsd-speed"
              label="Local along-image ground speed"
              value={speed}
              display={speed + " m/s"}
              min={0}
              max={50}
              onChange={setSpeed}
            />
            <label className="photo-check">
              <input
                id="gsd-noise"
                type="checkbox"
                checked={noise}
                onChange={(e) => setNoise(e.target.checked)}
              />
              Illustrative shot/read noise
            </label>
            <div className="photo-actions">
              <button id="gsd-new-sample" onClick={() => setSeed(seed + 1)}>
                New sensor-noise sample
              </button>
              <button
                id="gsd-nadir"
                onClick={() => {
                  setTilt(0);
                  setSlope(0);
                  setElevation(0);
                }}
              >
                Nadir / flat-datum reference
              </button>
            </div>
          </Panel>
        </aside>
        <div className="photo-instruments">
          <Panel
            tag="ACTUAL PROJECTION GEOMETRY"
            title="Oblique image footprint on the terrain"
            className="photo-stage"
          >
            <PhotoLabScene
              build={build}
              initial={[130, -155, 145]}
              target={[40, 0, 40]}
              maxDistance={2000}
              label="Aerial camera, oblique ground footprint and selected pixel ray on a sloping terrain plane."
            />
            <div className="photo-stage-key">
              <span>9 × 7 grouped image regions—not individual pixels</span>
              <span>gold native pixel outline ×80</span>
            </div>
          </Panel>
          <Panel
            tag="INSPECT IMAGE POSITION"
            title="Select a region and inspect its central native pixel"
          >
            <div
              className="gsd-region-picker"
              role="group"
              aria-label="Image-region selection"
            >
              {Array.from({ length: 63 }, (_, i) => {
                const col = i % 9,
                  row = Math.floor(i / 9);
                return (
                  <button
                    key={i}
                    aria-label={`Image region ${col + 1}, ${row + 1}`}
                    aria-pressed={cell[0] === col && cell[1] === row}
                    onClick={() => setCell([col, row])}
                  />
                );
              })}
            </div>
            <p className="photo-note">
              Native sample u = {u.toFixed(1)}, v = {v.toFixed(1)}. Moving
              toward the far image edge changes GSD even though the camera and
              pixel pitch stay the same.
            </p>
          </Panel>
          <Panel
            tag="NATIVE SENSOR CROP"
            title="Same marker, different sampling"
          >
            <div className="gsd-samples">
              <figure>
                <canvas ref={targetRef} width="200" height="200" />
                <figcaption>
                  Physical {targetSize.toFixed(2)} m marker
                </figcaption>
              </figure>
              <figure>
                <canvas id="gsd-captured" ref={imageRef} />
                <figcaption>48 × 48 native pixels · may crop marker</figcaption>
              </figure>
            </div>
            <div className="photo-inline">
              <label>
                Pattern
                <select
                  id="gsd-pattern"
                  value={pattern}
                  onChange={(e) => setPattern(e.target.value)}
                >
                  <option value="check">Checkerboard</option>
                  <option value="bowtie">Bowtie</option>
                </select>
              </label>
            </div>
            <Slider
              id="gsd-target"
              label="Ground marker side length"
              value={targetSize}
              display={targetSize.toFixed(2) + " m"}
              min={0.05}
              max={2}
              step={0.05}
              onChange={setTarget}
            />
            <Slider
              id="gsd-phase"
              label="Marker shift in local pixel units"
              value={phase}
              display={phase.toFixed(2) + " px"}
              min={-0.5}
              max={0.5}
              step={0.05}
              onChange={setPhase}
            />
            <p className="photo-note">
              Pixel-area integration and optics/motion blur occur before
              sampling. Noise is optional and fixed until the seed changes. The
              crop is not rescaled to fit the marker.
            </p>
          </Panel>
        </div>
        <aside className="photo-diagnostics">
          <Panel
            tag="GEOMETRY / SURFACE DISTANCES"
            title="Read the local footprint"
          >
            <div className="photo-result" id="gsd-local">
              {footprint ? cm(footprint.gx) : "—"}
              <small>cm/px along X</small>
            </div>
            <p
              id="gsd-validity"
              className={footprint ? "photo-note" : "photo-alert warning"}
            >
              {footprint
                ? "Selected native pixel has a forward surface intersection."
                : "No forward intersection for this pixel. Check tilt, terrain slope and camera clearance."}
            </p>
            <dl>
              <Metric
                label="Across-image local GSD"
                value={footprint ? cm(footprint.gy) : "—"}
                unit="cm/px"
              />
              <Metric
                label="Pixel surface area"
                value={footprint ? (footprint.area * 10000).toFixed(3) : "—"}
                unit="cm²"
              />
              <Metric
                label="Slant distance"
                value={footprint ? footprint.range.toFixed(2) : "—"}
                unit="m"
              />
              <Metric
                label="Height above terrain at camera XY"
                value={(height - elevation).toFixed(1)}
                unit="m"
              />
              <Metric
                label="Nadir flat-plane reference"
                value={cm(camera.nominal)}
                unit="cm/px"
              />
              <Metric
                label="Near / far image-X samples"
                value={cm(near?.gx) + " / " + cm(far?.gx)}
                unit="cm/px"
              />
              <Metric
                label="Complete image-plane footprint"
                value={
                  bounds
                    ? "four corners forward"
                    : "one or more corners invalid"
                }
              />
              <Metric
                label="Native pixel pitch"
                value={(camera.pitchMm * 1000).toFixed(2)}
                unit="µm"
              />
              <Metric
                label="Marker along-X samples"
                value={footprint ? (targetSize / footprint.gx).toFixed(2) : "—"}
                unit="pixels"
              />
            </dl>
          </Panel>
          <Panel
            tag="OPTICS & MOTION"
            title="Smaller GSD is not always sharper"
          >
            <dl>
              <Metric
                label="Airy first-zero diameter"
                value={blur.airyPx.toFixed(2)}
                unit="px"
              />
              <Metric
                label="Exposure motion length"
                value={
                  Number.isFinite(blur.motionPx)
                    ? blur.motionPx.toFixed(2)
                    : "—"
                }
                unit="px"
              />
            </dl>
            <p className="photo-note">
              Sampling sets the ground spacing, not a smallest resolvable
              object. Diffraction, motion, contrast and pixel integration affect
              actual detail. Change f-number or exposure without changing GSD to
              see the distinction.
            </p>
          </Panel>
        </aside>
      </div>
    </PhotoLab>
  );
}
