import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import PhotoLabScene, { caption, marker, segment } from "./PhotoLabScene.jsx";
import { PhotoLab, Panel, Slider, Metric, MethodTabs } from "./PhotoLabUI.jsx";
import {
  cameraOptics,
  lensRayAtSensor,
  distort,
} from "./photogrammetry-model.js";

const PARTS = {
  lens: [
    "Lens group",
    "Refraction bends incident rays toward an image. Here a paraxial thin lens replaces the real multi-element lens: 1/f = 1/u + 1/v. Coloured glass surfaces are anatomical context, not a surface-by-surface optical ray trace.",
  ],
  iris: [
    "Aperture / iris",
    "The entrance pupil controls the cone of light. Its diameter D = f/N for f-number N. A smaller opening reduces geometric defocus and irradiance, but increases diffraction. The entrance pupil need not coincide with a real mechanical iris.",
  ],
  shutter: [
    "Shutter",
    "Exposure time controls how long photons are integrated. Mechanical curtains and electronic exposure both exist. This schematic gate and slowed readout animation do not model a particular shutter mechanism.",
  ],
  sensor: [
    "Image sensor",
    "The lens forms a real, inverted image. Photodiodes integrate photoelectrons; microlenses, quantum efficiency, full-well capacity and read noise affect the recorded signal. Pixel pitch is 36 mm / 6000 = 6 µm in the full-frame setting.",
  ],
  filter: [
    "Colour filter array",
    "A typical Bayer mosaic samples red, green and blue through filters over individual photosites. Demosaicing estimates missing colour channels. The visible grid is schematic, not thousands of resolved pixels.",
  ],
  processor: [
    "Readout & image processor",
    "Rows are read, amplified and digitised. Black-level correction, demosaicing, white balance and tone mapping form a display image. RAW values and a processed photograph are not the same thing. ISO is modelled as output gain, not extra incoming light.",
  ],
  body: [
    "Camera body & mount",
    "The light-tight housing holds the optical axis, shutter and sensor. Focus changes the image distance in this ideal lens. Real cameras often move internal groups, and their effective focal length and principal planes can change.",
  ],
};
const STAGES = [
  ["anatomy", "Camera anatomy"],
  ["focus", "Focus & aperture"],
  ["exposure", "Exposure & readout"],
  ["calibration", "Calibration"],
];
export default function CameraLab() {
  const [stage, setStage] = useState("anatomy"),
    [part, setPart] = useState("lens"),
    [f, setF] = useState(50),
    [objectM, setObjectM] = useState(2),
    [focusM, setFocusM] = useState(2),
    [fNumber, setFNumber] = useState(4),
    [sensorW, setSensorW] = useState(36);
  const [shutterDen, setShutterDen] = useState(125),
    [iso, setIso] = useState(100),
    [speed, setSpeed] = useState(1),
    [readoutMs, setReadoutMs] = useState(20),
    [k1, setK1] = useState(0),
    [cutaway, setCutaway] = useState(true),
    [rays, setRays] = useState(true),
    [shutterOpen, setShutterOpen] = useState(true),
    [capture, setCapture] = useState(null),
    [progress, setProgress] = useState(0);
  const preview = useRef(null),
    metrics = cameraOptics({
      f,
      objectM,
      focusM,
      fNumber,
      sensorW,
      sensorH: (sensorW * 2) / 3,
      shutter: 1 / shutterDen,
      iso,
      speed,
      readoutMs,
    });
  const optics = useMemo(
    () => metrics,
    [f, objectM, focusM, fNumber, sensorW, shutterDen, iso, speed, readoutMs],
  );
  useEffect(() => {
    if (!capture) return;
    setProgress(0);
    const start = performance.now(),
      timer = setInterval(() => {
        const t = Math.min(1, (performance.now() - start) / 1200);
        setProgress(t);
        if (t === 1) clearInterval(timer);
      }, 90);
    return () => clearInterval(timer);
  }, [capture]);
  const build = useCallback(() => {
    const g = new THREE.Group(),
      sensorX = -optics.sensorDistance / 100,
      halfW = sensorW / 200,
      halfH = sensorW / 300;
    const material = (color, opacity = 1) =>
      new THREE.MeshStandardMaterial({
        color,
        transparent: opacity < 1,
        depthWrite: opacity >= 1,
        opacity,
        side: THREE.DoubleSide,
        roughness: 0.45,
        metalness: 0.2,
      });
    const box = (size, pos, color, tag, opacity = 1) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(...size),
        material(color, opacity),
      );
      m.position.set(...pos);
      m.userData.part = tag;
      g.add(m);
      return m;
    };
    const highlight = (tag, color) => (part === tag ? 0xffc266 : color);
    const housing = box(
      [Math.abs(sensorX) + 0.16, 0.56, 0.4],
      [sensorX / 2, 0, 0],
      highlight("body", 0x304351),
      "body",
      cutaway ? 0.08 : 0.9,
    );
    if (cutaway) delete housing.userData.part;
    box(
      [Math.abs(sensorX) + 0.16, 0.56, 0.035],
      [sensorX / 2, 0, -0.22],
      0x435666,
      "body",
    );
    box(
      [0.018, sensorW / 100, sensorW / 150],
      [sensorX, 0, 0],
      highlight("sensor", 0x5ac4d8),
      "sensor",
    );
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 8; j++)
        box(
          [0.008, sensorW / 1250, sensorW / 1250],
          [
            sensorX + 0.016,
            -halfW + ((i + 0.5) * sensorW) / 1200,
            -halfH + ((j + 0.5) * sensorW) / 1200,
          ],
          stage === "anatomy"
            ? i % 2 === j % 2
              ? i % 2
                ? 0x72a4d8
                : 0xdf8867
              : 0x9dd17a
            : 0x337384,
          "filter",
          0.8,
        );
    const shutterX = sensorX + 0.065;
    box(
      [0.014, sensorW / 100, sensorW / 150],
      [shutterX, 0, shutterOpen ? halfH * 2.5 : 0],
      highlight("shutter", 0x566879),
      "shutter",
      0.9,
    );
    for (const x of [-0.035, 0.035]) {
      const radius = Math.max(0.24, (optics.diameter / 200) * 1.1);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, 0.035, 48),
        material(highlight("lens", 0x69c4e0), 0.2),
      );
      lens.rotation.z = Math.PI / 2;
      lens.position.x = x;
      lens.userData.part = "lens";
      g.add(lens);
    }
    const shape = new THREE.Shape();
    shape.absarc(
      0,
      0,
      Math.max(0.255, optics.diameter / 200 + 0.04),
      0,
      Math.PI * 2,
      false,
    );
    const hole = new THREE.Path();
    hole.absarc(0, 0, optics.diameter / 200, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const iris = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      material(highlight("iris", 0x7b8a93), 0.8),
    );
    iris.rotation.y = Math.PI / 2;
    iris.position.x = 0.004;
    iris.userData.part = "iris";
    g.add(iris);
    box(
      [0.12, 0.22, 0.13],
      [sensorX - 0.09, 0, -0.32],
      highlight("processor", 0x79ab72),
      "processor",
    );
    segment(
      g,
      [
        [sensorX, 0, -halfH],
        [sensorX - 0.09, 0, -0.32],
      ],
      0x77ddaa,
    );
    segment(
      g,
      [
        [sensorX - 0.2, 0, 0],
        [3.7, 0, 0],
      ],
      0x688996,
      0.5,
    );
    // Object distance is compressed for readability. Sensor and pupil are
    // mutually scaled correctly; the object height is also schematic.
    const objectX = 1.6;
    segment(
      g,
      [
        [objectX, 0, -0.5],
        [objectX, 0, 0.5],
        [objectX, 0, 0.5],
        [objectX, 0, 0.9],
      ],
      0xffa768,
    );
    marker(g, [objectX, 0, 0.9], 0xffc266, 0.055);
    caption(
      g,
      "OBJECT · " + objectM.toFixed(1) + " m",
      [objectX, 0, 1.15],
      "#ffd1a3",
      0.16,
    );
    const objectHeight = 120;
    if (optics.blurPx > 1) {
      const x = -optics.v / 100;
      segment(
        g,
        [
          [x, -halfW, -halfH],
          [x, halfW, -halfH],
          [x, halfW, halfH],
          [x, -halfW, halfH],
          [x, -halfW, -halfH],
        ],
        0x7bedad,
        0.7,
      );
      caption(g, "BEST FOCUS", [x, 0.45, 0.3], "#8ae7bb", 0.12);
    }
    if (rays && shutterOpen)
      for (let j = 0; j <= 12; j++) {
        const angle = (j / 12) * Math.PI * 2,
          radius = j === 12 ? 0 : optics.diameter * 0.45,
          pupilY = radius * Math.sin(angle),
          pupilHeight = radius * Math.cos(angle),
          sensorHeight = lensRayAtSensor(optics, objectHeight, pupilHeight),
          sensorY = pupilY * (1 - optics.sensorDistance / optics.v);
        segment(
          g,
          [
            [objectX, 0, 0.9],
            [0, pupilY / 100, pupilHeight / 100],
            [sensorX, sensorY / 100, sensorHeight / 100],
          ],
          j === 12 ? 0xffcd66 : 0x72cde0,
          0.65,
        );
        marker(
          g,
          [sensorX + 0.012, sensorY / 100, sensorHeight / 100],
          0xffbe66,
          0.003,
        );
      }
    if (stage === "calibration")
      for (let i = -4; i <= 4; i++)
        for (const horizontal of [false, true]) {
          const points = [];
          for (let j = -40; j <= 40; j++) {
            const a = i / 4,
              b = j / 40,
              xx = ((horizontal ? b : a) * sensorW) / 2 / f,
              yy = ((horizontal ? a : b) * sensorW) / 3 / f,
              [dx, dy] = distort(xx, yy, k1);
            points.push([sensorX + 0.028, (dx * f) / 100, (dy * f) / 100]);
          }
          segment(g, points, 0xffc46b, 0.85);
        }
    if (capture && progress < 1) {
      box(
        [0.025, sensorW / 100, 0.008],
        [sensorX + 0.035, 0, halfH - progress * 2 * halfH],
        0xffff99,
        "sensor",
      );
    }
    const position = {
      lens: [0.15, 0.3, 0.25],
      iris: [0.15, -0.35, -0.2],
      shutter: [shutterX, -0.45, 0.28],
      sensor: [sensorX, -0.4, -0.25],
      filter: [sensorX, -0.45, 0.15],
      processor: [sensorX - 0.1, 0, -0.48],
      body: [sensorX / 2, 0.45, 0.4],
    };
    caption(g, PARTS[part][0], position[part], "#ffd28b", 0.14);
    if (part !== "sensor" && part !== "filter")
      caption(g, "INVERTED SENSOR", [sensorX, 0, -0.62], "#9bd9ee", 0.12);
    return g;
  }, [
    optics,
    sensorW,
    part,
    cutaway,
    rays,
    stage,
    k1,
    shutterOpen,
    capture,
    Math.floor(progress * 10),
  ]);
  useEffect(() => {
    const canvas = preview.current,
      ctx = canvas.getContext("2d"),
      W = 600,
      H = 400;
    ctx.fillStyle = "#101c27";
    ctx.fillRect(0, 0, W, H);
    const exposure = Math.min(3, optics.exposure),
      blur = Math.min(
        18,
        (Math.sqrt(optics.blurPx ** 2 + optics.airyPx ** 2) * W) / 6000,
      );
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(-1, -1);
    ctx.filter = `blur(${blur.toFixed(2)}px)`;
    const scale = (((optics.sensorDistance / optics.u) * 120) / sensorW) * W;
    const samples = stage === "exposure" ? 12 : 1,
      motion = (optics.motionPx * W) / 6000;
    for (let sample = 0; sample < samples; sample++) {
      const shift = (sample / Math.max(1, samples - 1) - 0.5) * motion;
      ctx.globalAlpha = 1 / samples;
      ctx.fillStyle = `rgb(${Math.min(255, 210 * exposure)},${Math.min(255, 156 * exposure)},${Math.min(255, 88 * exposure)})`;
      ctx.beginPath();
      ctx.moveTo(shift, -scale);
      ctx.lineTo(shift + scale * 0.4, -scale * 0.4);
      ctx.lineTo(shift + scale * 0.15, -scale * 0.4);
      ctx.lineTo(shift + scale * 0.15, scale);
      ctx.lineTo(shift - scale * 0.15, scale);
      ctx.lineTo(shift - scale * 0.15, -scale * 0.4);
      ctx.lineTo(shift - scale * 0.4, -scale * 0.4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    if (stage === "calibration") {
      ctx.strokeStyle = "#74c6da";
      ctx.lineWidth = 1;
      for (let i = -4; i <= 4; i++)
        for (const horizontal of [false, true]) {
          ctx.beginPath();
          for (let j = -40; j <= 40; j++) {
            const a = i / 4,
              b = j / 40,
              x = ((horizontal ? b : a) * sensorW) / 2 / f,
              y = ((horizontal ? a : b) * sensorW) / 3 / f,
              [dx, dy] = distort(x, y, k1);
            const u = W / 2 + ((dx * f) / sensorW) * W,
              v = H / 2 + ((dy * f) / ((sensorW * 2) / 3)) * H;
            j === -40 ? ctx.moveTo(u, v) : ctx.lineTo(u, v);
          }
          ctx.stroke();
        }
    }
    ctx.strokeStyle = "#ffffff30";
    ctx.beginPath();
    ctx.moveTo(W / 2 - 12, H / 2);
    ctx.lineTo(W / 2 + 12, H / 2);
    ctx.moveTo(W / 2, H / 2 - 12);
    ctx.lineTo(W / 2, H / 2 + 12);
    ctx.stroke();
    ctx.fillStyle = "#c8dae3";
    ctx.font = "12px monospace";
    ctx.fillText("INVERTED SENSOR · illustrative preview", 16, 24);
    if (stage === "exposure") {
      ctx.fillStyle = "#9cb6c2";
      ctx.fillText(
        "Motion blur shown · rolling-shutter displacement in readout",
        16,
        H - 18,
      );
    }
  }, [optics, sensorW, stage, k1]);
  const captureImage = () => {
    setCapture(performance.now());
    setShutterOpen(true);
  };
  return (
    <PhotoLab
      name="How a camera works"
      title="From a ray of light to a photograph."
      intro="Orbit an interactive 3D camera cutaway. Trace light through the pupil, focus an inverted image, and connect exposure, pixels and calibration to measurable effects."
      notebook={
        <>
          <h3>The complete imaging chain</h3>
          <ol>
            <li>
              Scene radiance enters an entrance pupil; the lens refracts light
              to form a real image.
            </li>
            <li>
              Focus determines the lens-to-sensor distance. An aperture limits
              the ray cone and balances depth of field against diffraction.
            </li>
            <li>
              A shutter or electronic gate controls integration time. Motion
              during integration blurs detail; sequential row timing can distort
              moving objects.
            </li>
            <li>
              Photodiodes convert detected photons to electrons. A colour filter
              array, microlenses, quantum efficiency, dark current, shot noise,
              read noise and saturation govern real sensor data.
            </li>
            <li>
              Readout electronics apply gain and analog-to-digital conversion.
              Demosaicing, white balance, tone mapping and compression produce a
              display photograph. Raising ISO does not increase incoming
              photons.
            </li>
            <li>
              Calibration relates object-space rays to pixel coordinates: focal
              length, principal point and lens distortion are interior
              orientation; position and attitude are exterior orientation.
              Bundle adjustment estimates their consistent relationship across
              images.
            </li>
          </ol>
          <h3>Equations, conventions and units</h3>
          <p>
            Thin lens: 1/f = 1/u + 1/v, with optical distances in millimetres.
            Focus fixes sensor distance s = f·ufocus/(ufocus−f). The signed
            transverse magnification is −v/u. A ray through pupil height h
            reaches the sensor at h + (−v·H/u−h)·s/v. At focus all pupil rays
            meet; otherwise their spread is the defocus circle D·|s−v|/v.
          </p>
          <p>
            Entrance pupil D = f/N. Relative exposure index ∝ t·ISO/N²; this is
            an output-brightness index with constant illumination and
            transmission, not calibrated electrons or noise. Airy-disc
            first-zero diameter ≈ 2.44λNeff with λ = 550 nm and paraxial
            image-space Neff = s/D (approaching N at infinity). Pixel pitch =
            sensor width / 6000. Geometric horizontal FOV is 2atan(sensor
            width/(2s)). Defocus and diffraction are different: the preview
            combines their scales into an illustrative Gaussian blur, not a
            physical point-spread function.
          </p>
          <p>
            For lateral speed V at depth u, image motion ≈ V·s/u. Multiply by
            exposure time for motion blur and by top-to-bottom row delay for
            rolling-shutter displacement, then divide by pixel pitch. The
            preview shows exposure motion blur; rolling displacement is
            calculated, not rendered. Radial calibration uses x′ = x(1 + k₁r²),
            y′ = y(1 + k₁r²), with x,y normalised by focal length; k₁ is
            dimensionless. Tangential and higher-order distortion are omitted.
          </p>
          <h3>Try it</h3>
          <ol>
            <li>
              Set object and focus to the same distance. All pupil rays should
              meet on the sensor.
            </li>
            <li>
              Move only the focus distance; close the aperture to reduce
              defocus, then observe the increasing diffraction diameter.
            </li>
            <li>
              Double ISO or exposure time: the output-brightness index doubles,
              but only exposure time collects more light. Shorten exposure to
              reduce motion blur.
            </li>
            <li>
              Vary k₁ and inspect curved grid lines. Calibration can estimate
              distortion; it does not make the lens physically distortion-free.
            </li>
          </ol>
          <h3>What this model does not simulate</h3>
          <p>
            The object distance, lens thickness, housing and some annotations
            are visually exaggerated; this is not a dimensionally faithful
            camera CAD model. The pupil and sensor share a consistent transverse
            scale. Real compound optics, aberrations, focus breathing,
            wavelength-dependent coatings, radiometry, photon noise, sensor
            saturation, demosaicing and JPEG processing are explained but not
            quantitatively simulated. Aperture, defocus, motion, FOV and
            distortion readouts use the declared ideal equations.
            Capture/readout animation is slowed to 1.2 seconds, independent of
            the actual exposure and row times. Further reading: Hecht, Optics;
            Szeliski, Computer Vision: Algorithms and Applications; EMVA 1288
            sensor-characterisation standard.
          </p>
        </>
      }
    >
      <MethodTabs tabs={STAGES} value={stage} onChange={setStage} />
      <div className="photo-workspace">
        <aside className="photo-controls">
          <Panel tag="01 / CONFIGURE" title="Lens & scene">
            <Slider
              id="camera-focal"
              label="Focal length"
              value={f}
              display={f + " mm"}
              min={24}
              max={85}
              onChange={setF}
            />
            <Slider
              id="camera-object"
              label="Object distance"
              value={objectM}
              display={objectM.toFixed(1) + " m"}
              min={0.5}
              max={10}
              step={0.1}
              onChange={setObjectM}
            />
            <Slider
              id="camera-focus"
              label="Focus distance"
              value={focusM}
              display={focusM.toFixed(1) + " m"}
              min={0.5}
              max={10}
              step={0.1}
              onChange={setFocusM}
            />
            <Slider
              id="camera-aperture"
              label="Aperture f-number"
              value={fNumber}
              display={"f/" + fNumber.toFixed(1)}
              min={1.4}
              max={16}
              step={0.1}
              onChange={setFNumber}
            />
            <label className="photo-select">
              Sensor format
              <select
                value={sensorW}
                onChange={(e) => setSensorW(+e.target.value)}
              >
                <option value={36}>Full frame · 36 × 24 mm</option>
                <option value={23.5}>APS-C · 23.5 × 15.7 mm</option>
              </select>
            </label>
            <button onClick={() => setFocusM(objectM)}>
              Focus on the object
            </button>
          </Panel>
          <Panel tag="EXPOSURE & READOUT" title="Time, gain & motion">
            <Slider
              id="camera-shutter"
              label="Exposure time"
              value={shutterDen}
              display={"1/" + shutterDen + " s"}
              min={30}
              max={2000}
              step={5}
              onChange={setShutterDen}
            />
            <Slider
              id="camera-iso"
              label="ISO gain"
              value={iso}
              display={"ISO " + iso}
              min={100}
              max={3200}
              step={100}
              onChange={setIso}
            />
            <Slider
              id="camera-speed"
              label="Lateral scene speed"
              value={speed}
              display={speed.toFixed(1) + " m/s"}
              min={0}
              max={10}
              step={0.1}
              onChange={setSpeed}
            />
            <Slider
              id="camera-readout"
              label="Top-to-bottom row delay"
              value={readoutMs}
              display={readoutMs + " ms"}
              min={0}
              max={50}
              onChange={setReadoutMs}
            />
            {stage === "calibration" && (
              <Slider
                id="camera-k1"
                label="Radial distortion k₁"
                value={k1}
                display={k1.toFixed(2)}
                min={-0.6}
                max={0.6}
                step={0.02}
                onChange={setK1}
              />
            )}
          </Panel>
        </aside>
        <div className="photo-instruments">
          <Panel
            tag="INTERACTIVE 3D CUTAWAY"
            title="Explore the optical path"
            className="photo-stage"
          >
            <PhotoLabScene
              build={build}
              label="Orbitable camera cutaway with lens, aperture, shutter, inverted sensor, processor and object-to-sensor rays. Click a component or use the component buttons."
              initial={[2.1, -3, 1.6]}
              target={[0.4, 0, 0.1]}
              closeup={{ position: [0.3, -1.2, 0.65], target: [-0.25, 0, 0] }}
              onSelect={setPart}
            />
            <div className="photo-stage-key">
              Object distance compressed · pupil and sensor share a transverse
              scale · labels schematic
            </div>
          </Panel>
          <div className="photo-part-buttons">
            {Object.entries(PARTS).map(([id, [name]]) => (
              <button
                key={id}
                aria-pressed={part === id}
                onClick={() => setPart(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <Panel tag="SELECTED COMPONENT" title={PARTS[part][0]}>
            <p>{PARTS[part][1]}</p>
            <div className="photo-inline">
              <label className="photo-check">
                <input
                  type="checkbox"
                  checked={cutaway}
                  onChange={(e) => setCutaway(e.target.checked)}
                />
                Cutaway housing
              </label>
              <label className="photo-check">
                <input
                  type="checkbox"
                  checked={rays}
                  onChange={(e) => setRays(e.target.checked)}
                />
                Trace pupil rays
              </label>
              <label className="photo-check">
                <input
                  type="checkbox"
                  checked={shutterOpen}
                  onChange={(e) => setShutterOpen(e.target.checked)}
                />
                Hold shutter open for inspection
              </label>
            </div>
          </Panel>
          <Panel
            tag="PREDICTED SENSOR IMAGE"
            title="Light is sampled, not simply copied"
          >
            <canvas
              ref={preview}
              width="600"
              height="400"
              role="img"
              aria-label="Inverted sensor image with illustrative defocus, exposure, motion blur and calibration grid."
            />
            <div className="photo-actions">
              <button
                id="camera-capture"
                className="photo-primary"
                onClick={captureImage}
                disabled={capture && progress < 1}
              >
                Capture / animate row readout
              </button>
              <span role="status">
                {!capture
                  ? "Live predicted preview"
                  : progress < 1
                    ? "Reading rows · animation slowed"
                    : `Readout complete · actual exposure ${(1000 / shutterDen).toFixed(2)} ms, row delay ${readoutMs} ms`}
              </span>
            </div>
            <p className="photo-note">
              Brightness is a relative exposure index, not calibrated
              radiometry. Blur is illustrative. Rolling-shutter displacement is
              a readout below, not a rendered shear.
            </p>
          </Panel>
        </div>
        <aside className="photo-diagnostics">
          <Panel
            tag="02 / READ THE OPTICS"
            title={
              optics.blurPx < 1
                ? "Geometric focus reached"
                : "Sensor misses best focus"
            }
          >
            <div id="camera-blur" className="photo-result">
              {optics.blurPx.toFixed(2)}
              <small>px</small>
            </div>
            <p className="photo-note">
              Geometric defocus-circle diameter · diffraction remains at focus
            </p>
            <dl>
              <Metric
                label="Best image distance v"
                value={optics.v.toFixed(2)}
                unit="mm"
              />
              <Metric
                label="Current sensor distance s"
                value={optics.sensorDistance.toFixed(2)}
                unit="mm"
              />
              <Metric
                label="Entrance-pupil diameter"
                value={optics.diameter.toFixed(2)}
                unit="mm"
              />
              <Metric
                label="Magnification (inverted)"
                value={optics.magnification.toFixed(4)}
              />
              <Metric
                label="Horizontal field of view"
                value={optics.fov.toFixed(1)}
                unit="°"
              />
              <Metric
                label="Pixel pitch · 6000 across"
                value={(optics.pitch * 1000).toFixed(2)}
                unit="µm"
              />
              <Metric
                label="Airy first-zero diameter"
                value={optics.airyPx.toFixed(2)}
                unit="px"
              />
            </dl>
          </Panel>
          <Panel tag="03 / READ THE SENSOR" title="Exposure is not sensitivity">
            <dl>
              <Metric
                label="Relative output exposure index"
                value={optics.exposure.toFixed(2)}
                unit="×"
              />
              <Metric
                label="Exposure motion blur"
                value={optics.motionPx.toFixed(1)}
                unit="px"
              />
              <Metric
                label="Rolling-row displacement"
                value={optics.rollingPx.toFixed(1)}
                unit="px"
              />
            </dl>
            <p className="photo-alert">
              A smaller aperture reduces defocus but increases diffraction.
              Higher ISO increases output gain, not incoming light. Short
              exposure reduces motion blur; row delay causes a different
              distortion.
            </p>
            <a href={import.meta.env.BASE_URL + "?simulation=block-adjustment"}>
              Connect camera calibration to bundle adjustment →
            </a>
          </Panel>
        </aside>
      </div>
    </PhotoLab>
  );
}
