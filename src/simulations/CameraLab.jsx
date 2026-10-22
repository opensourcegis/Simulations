import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PhotoLabScene from "./PhotoLabScene.jsx";
import { buildCameraScene } from "./camera-scene.js";
import { renderCameraImage } from "./camera-image.js";
import { SENSOR_MODEL } from "./camera-sensor-model.js";
import { PhotoLab, Panel, Slider, Metric, MethodTabs, Controls } from "./PhotoLabUI.jsx";
import Disclosure from './Disclosure.jsx';
import { cameraOptics } from "./photogrammetry-model.js";

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
    "The housing and sensor remain fixed. Focusing moves the equivalent lens principal plane relative to the sensor; real lenses commonly move internal groups. The barrel and glass are an anatomical model, not a reverse-engineered lens prescription.",
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
    [progress, setProgress] = useState(0),
    [lightEV, setLightEV] = useState(12),
    [noise, setNoise] = useState(true),
    [snapshot, setSnapshot] = useState(null),
    [showSnapshot, setShowSnapshot] = useState(false),
    [upright, setUpright] = useState(true);
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
  const imageSettings = useMemo(
    () => ({
      f,
      objectM,
      focusM,
      fNumber,
      sensorW,
      shutter: 1 / shutterDen,
      iso,
      speed,
      readoutMs,
      k1,
      lightEV,
      noise,
      shutterOpen,
      seed: 17,
    }),
    [
      f,
      objectM,
      focusM,
      fNumber,
      sensorW,
      shutterDen,
      iso,
      speed,
      readoutMs,
      k1,
      lightEV,
      noise,
      shutterOpen,
    ],
  );
  const liveImage = useMemo(
    () => renderCameraImage(imageSettings),
    [imageSettings],
  );
  const shownImage = showSnapshot && snapshot ? snapshot : liveImage;
  const build = useCallback(
    () =>
      buildCameraScene({
        optics,
        objectM,
        f,
        focusM,
        fNumber,
        sensorW,
        part,
        cutaway,
        rays,
        shutterOpen,
        progress,
        capture,
        image: liveImage,
        partName: PARTS[part][0],
      }),
    [
      optics,
      objectM,
      f,
      focusM,
      fNumber,
      sensorW,
      part,
      cutaway,
      rays,
      shutterOpen,
      capture,
      liveImage,
    ],
  );
  useEffect(() => {
    const c = preview.current,
      ctx = c.getContext("2d");
    ctx.fillStyle = "#070b0e";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    if (upright) {
      ctx.translate(c.width, c.height);
      ctx.scale(-1, -1);
    }
    const fraction = showSnapshot && capture && progress < 1 ? progress : 1;
    const rows = Math.floor(c.height * fraction);
    if (rows > 0)
      ctx.drawImage(
        shownImage.canvas,
        0,
        0,
        c.width,
        rows,
        0,
        0,
        c.width,
        rows,
      );
    ctx.restore();
  }, [shownImage, upright, showSnapshot, capture, Math.floor(progress * 20)]);
  const captureImage = () => {
    setSnapshot(
      renderCameraImage({
        ...imageSettings,
        seed: Math.floor(performance.now()),
        shutterOpen: true,
      }),
    );
    setShowSnapshot(true);
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
            transmission. The separate sensor model converts scene radiance to
            expected electrons using an explicitly illustrative reference, with
            pixel-area and finite-conjugate aperture corrections. Airy-disc
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
            preview integrates five exposure-time samples per row and renders
            rolling displacement at each object's depth. Radial calibration uses
            x′ = x(1 + k₁r²), y′ = y(1 + k₁r²), with x,y normalised by focal
            length; k₁ is dimensionless. Tangential and higher-order distortion
            are omitted.
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
            wavelength-dependent coatings, exact radiometry, demosaicing and
            JPEG processing are not simulated. Shot noise is Poisson below 25
            electrons and a Gaussian approximation above that, followed by
            3-electron Gaussian read noise, 20,000-electron full-well clipping,
            ISO gain and 12-bit quantisation. These constants are illustrative,
            not camera specifications. Colour channels approximate an RGB
            response, not a physical Bayer reconstruction. The preview samples
            representative photosites at display resolution rather than
            simulating every one of the 6000 sensor columns. Defocus is a
            Gaussian disc-moment approximation, not a compound-lens PSF.
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
          <Controls>
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
          <Panel tag="EXPOSURE & READOUT" title="Exposure & readout settings" collapsible defaultOpen={stage === 'exposure'}>
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
            <Slider
              id="camera-light"
              label="Scene illumination (relative EV)"
              value={lightEV}
              display={"EV " + lightEV}
              min={7}
              max={15}
              step={0.5}
              onChange={setLightEV}
            />
            <label className="photo-check">
              <input
                id="camera-noise"
                type="checkbox"
                checked={noise}
                onChange={(e) => setNoise(e.target.checked)}
              />
              Shot noise + 3 e⁻ read noise
            </label>
            {stage === "calibration" && (
              <Slider
                id="camera-k1"
                label="Radial distortion k₁"
                value={k1}
                display={k1.toFixed(2)}
                min={-0.18}
                max={0.25}
                step={0.02}
                onChange={setK1}
              />
            )}
          </Panel>
          </Controls>
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
              initial={[3.0, -4, 2.0]}
              target={[0.8, 0, 0.1]}
              closeup={{ position: [0.3, -1.2, 0.65], target: [-0.25, 0, 0] }}
              onSelect={setPart}
              onFrame={(group, now) => {
                const scan = group.userData.readout;
                if (scan) {
                  const t = capture ? Math.min(1, (now - capture) / 1200) : 1;
                  scan.visible = t < 1;
                  scan.position.z = (sensorW / 300) * (1 - 2 * t);
                }
              }}
            />
            <div className="photo-stage-key">
              Fixed sensor · moving focus group · object space compressed · ray
              markers schematic
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
            tag={
              showSnapshot
                ? "RETAINED CAPTURE"
                : "LIVE VIEW · THREE SCENE DEPTHS"
            }
            title={
              upright ? "Processed upright image" : "Inverted sensor image"
            }
            className="camera-preview-panel"
            collapsible defaultOpen={stage === "exposure"}
          >
            <canvas
              ref={preview}
              width="600"
              height="400"
              role="img"
              id="camera-image"
              aria-label="Scene with a near ball, focus target and background, with depth-dependent blur, exposure noise and rolling shutter."
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
              {snapshot && (
                <button
                  id="camera-live"
                  onClick={() => setShowSnapshot(!showSnapshot)}
                >
                  {showSnapshot
                    ? "Return to live view"
                    : "Show retained capture"}
                </button>
              )}
              <label className="photo-check">
                <input
                  type="checkbox"
                  checked={upright}
                  onChange={(e) => setUpright(e.target.checked)}
                />
                Processed upright orientation
              </label>
              <span role="status">
                {!showSnapshot
                  ? shutterOpen
                    ? "Live predicted preview"
                    : "Shutter closed · dark frame / read noise"
                  : progress < 1
                    ? "Reading rows · animation slowed"
                    : `Readout complete · retained 1/${Math.round(1 / (snapshot?.settings.shutter || 1 / shutterDen))} s, ISO ${snapshot?.settings.iso || iso}`}
              </span>
            </div>
            <p className="photo-note">
              Near ball, focus board and background have different depth blur.
              Moving image rows are integrated at different times, so rolling
              shutter is rendered. The exposure model includes photon
              statistics, read noise, full-well clipping and 12-bit conversion
              using illustrative sensor constants. A retained capture does not
              change when controls change; the 3D sensor continues to show the
              live setup.
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
            <Disclosure title="Detailed optical measurements" defaultOpen={stage === 'focus'}>
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
              <Metric label="Sensor position in body" value="Fixed" />
              <Metric
                label="Entrance-pupil diameter"
                value={optics.diameter.toFixed(2)}
                unit="mm"
              />
              <Metric
                label="Best-focus magnification"
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
            </Disclosure>
          </Panel>
          <Panel tag="03 / READ THE SENSOR" title="Sensor measurements & exposure" collapsible defaultOpen={stage === 'exposure'}>
            <dl>
              <Metric
                label="Mid-grey collected charge (live)"
                value={liveImage.midGrayElectrons.toFixed(0)}
                unit="e⁻"
              />
              <Metric
                label="Clipped pixels in shown frame"
                value={shownImage.clippedPercent.toFixed(1)}
                unit="%"
              />
              <Metric
                label="Model full-well / ADC"
                value={SENSOR_MODEL.fullWell + " e⁻ / 12 bit"}
              />
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
