import { groundPixelRay, groundRayDetails, localGsd } from "./gsd-model.js";
import { useState } from "react";
import GsdSimilarTriangles from "./GsdSimilarTriangles.jsx";
import "./gsd-workbench.css";
const cm = (v) => (Number.isFinite(v) ? (v * 100).toFixed(2) : "—");
export default function GsdGeometry({
  camera,
  footprint,
  u,
  v,
  cell,
  onSelect,
}) {
  const [projectionView, setProjectionView] = useState("similar");
  const H = camera.height - camera.elevation,
    ray = groundRayDetails(camera, u, v),
    gradient = ray.gradient;
  const samples = Array.from({ length: 9 }, (_, i) =>
    localGsd(camera, Math.floor((camera.width * (i + 0.5)) / 9) + 0.5, v),
  );
  const maxSample = Math.max(0.01, ...samples.filter(Boolean).map((s) => s.gx));
  const validEdge = [
    groundPixelRay(camera, 0, v),
    groundPixelRay(camera, camera.width, v),
  ].filter(Boolean);
  const span = Math.max(H * 1.25, 40),
    xmin = -span * 0.45,
    xmax = span * 1.7;
  const low =
      Math.min(
        camera.elevation + gradient * xmin,
        camera.elevation + gradient * xmax,
        camera.elevation,
      ) -
      H * 0.12,
    high =
      Math.max(
        camera.height,
        camera.elevation + gradient * xmin,
        camera.elevation + gradient * xmax,
      ) +
      H * 0.15;
  const scale = Math.min(620 / (xmax - xmin), 230 / (high - low)),
    offsetX = 60 + (620 - (xmax - xmin) * scale) / 2,
    X = (x) => offsetX + (x - xmin) * scale,
    Z = (z) => 275 - (z - low) * scale;
  const corners = footprint?.corners.map((p) => {
    const delta = p.map((value, i) => value - footprint.center[i]);
    return [
      delta[0] * Math.cos((camera.slope * Math.PI) / 180) +
        delta[2] * Math.sin((camera.slope * Math.PI) / 180),
      delta[1],
    ];
  });
  const pixelSpan = corners
    ? Math.max(...corners.flatMap((p) => p.map(Math.abs))) * 2.6
    : 1;
  const pixelPath = corners
    ?.map(
      (p) =>
        `${90 + (p[0] / pixelSpan) * 140},${90 - (p[1] / pixelSpan) * 140}`,
    )
    .join(" ");
  const sourceX = X(0),
    sourceZ = Z(camera.height),
    outside =
      footprint && (footprint.center[0] < xmin || footprint.center[0] > xmax);
  return (
    <section
      className="gsd-geometry"
      aria-label="GSD geometry and live calculation"
    >
      <div className="gsd-calculation-grid">
        <article>
          <span>1 / SENSOR SAMPLING</span>
          <h3>Pixel pitch</h3>
          <code>p = sensor width / columns</code>
          <strong id="gsd-pitch-calculation">
            {camera.sensorW} mm / {camera.width.toLocaleString()} ={" "}
            {camera.pitchMm.toFixed(6)} mm
          </strong>
          <p>
            {(camera.pitchMm * 1000).toFixed(2)} µm per native pixel. Sensor
            dimensions and image resolution—not megapixels alone—set pitch.
          </p>
        </article>
        <article>
          <span>2 / NADIR REFERENCE</span>
          <h3>Similar triangles</h3>
          <code>GSD₀ = (H − E) p / f</code>
          <strong id="gsd-reference-calculation">
            {H.toFixed(1)} m × {camera.pitchMm.toFixed(6)} / {camera.f} ={" "}
            {cm(camera.nominal)} cm/px
          </strong>
          <p>
            Only the level-camera, horizontal-plane reference. The mm units
            cancel. Tilt and slope require actual ray intersections.
          </p>
        </article>
        <article>
          <span>3 / ACTUAL SELECTED PIXEL</span>
          <h3>Intersect four corner rays</h3>
          <code>GSDu = (|AB| + |DC|) / 2</code>
          <strong id="gsd-actual-calculation">
            {footprint
              ? `${cm(footprint.gx)} × ${cm(footprint.gy)} cm/px`
              : "No forward ground intersection"}
          </strong>
          <p>
            Measured on the sloping surface, not a horizontal map. The local
            footprint can differ across an oblique image.
          </p>
        </article>
      </div>
      <div
        className="gsd-projection-switch"
        role="group"
        aria-label="Projection explanation"
      >
        <button
          id="gsd-show-similar"
          aria-pressed={projectionView === "similar"}
          onClick={() => setProjectionView("similar")}
        >
          Similar triangles & sensor
        </button>
        <button
          id="gsd-show-actual"
          aria-pressed={projectionView === "actual"}
          onClick={() => setProjectionView("actual")}
        >
          Actual tilt & slope
        </button>
      </div>
      {projectionView === "similar" ? (
        <GsdSimilarTriangles camera={camera} />
      ) : (
        <div className="gsd-projection-grid">
          <figure className="gsd-ray-section">
            <figcaption>
              Projection geometry · XZ view with equal axis scale
            </figcaption>
            <svg
              viewBox="0 0 760 320"
              role="img"
              aria-label="True-scale XZ projection of camera and image-edge rays onto the selected sloping terrain plane"
            >
              <defs>
                <clipPath id="gsd-projection-clip">
                  <rect x="30" y="25" width="700" height="260" />
                </clipPath>
              </defs>
              <g clipPath="url(#gsd-projection-clip)">
                <path
                  d={`M${X(xmin)} ${Z(camera.elevation + gradient * xmin)}L${X(xmax)} ${Z(camera.elevation + gradient * xmax)}L${X(xmax)} 300H${X(xmin)}Z`}
                  fill="#e5eadb"
                />
                <path
                  d={`M${X(xmin)} ${Z(camera.elevation + gradient * xmin)}L${X(xmax)} ${Z(camera.elevation + gradient * xmax)}`}
                  stroke="#5c7755"
                  strokeWidth="2"
                />
                {validEdge.map((p, i) => (
                  <path
                    key={i}
                    d={`M${sourceX} ${sourceZ}L${X(p[0])} ${Z(p[2])}`}
                    stroke="#9eb9bc"
                    strokeWidth="1.5"
                    fill="none"
                  />
                ))}
                {ray.hit && (
                  <path
                    d={`M${sourceX} ${sourceZ}L${X(ray.hit[0])} ${Z(ray.hit[2])}`}
                    stroke="#b98437"
                    strokeWidth="2.5"
                  />
                )}
                <path
                  d={`M${sourceX} ${sourceZ}V${Z(camera.elevation)}`}
                  stroke="#819291"
                  strokeDasharray="4 4"
                />
                <circle cx={sourceX} cy={sourceZ} r="5" fill="#2d5657" />
                {ray.hit && (
                  <circle
                    cx={X(ray.hit[0])}
                    cy={Z(ray.hit[2])}
                    r="4"
                    fill="#b98437"
                  />
                )}
              </g>
              <text
                x={sourceX + 12}
                y={sourceZ - 8}
                fontSize="12"
                fill="#2d5657"
              >
                Optical centre · {camera.tilt}° tilt
              </text>
              <text
                x={sourceX - 10}
                y={(sourceZ + Z(camera.elevation)) / 2}
                textAnchor="end"
                fontSize="11"
                fill="#62726a"
              >
                H − E = {H.toFixed(1)} m
              </text>
              <text x="44" y="310" fontSize="11" fill="#62726a">
                Ground: Z = {camera.elevation} + tan({camera.slope}°) X · X
                horizontal, Z vertical
              </text>
              <text x="44" y="24" fontSize="10" fill="#7c897d">
                Gold: selected ray · pale: image-width boundary rays
              </text>
            </svg>
            <p>
              Side projection only; the full footprint calculation retains Y.{" "}
              {outside
                ? "The selected hit is beyond the plotted extent; its numerical coordinates are not clamped."
                : !ray.hit
                  ? "This ray has no forward plane intersection; no footprint is invented."
                  : "The pixel is too small to draw at survey scale—its true shape is shown separately."}
            </p>
          </figure>
          <figure className="gsd-native-footprint">
            <figcaption>One native pixel · surface-tangent view</figcaption>
            <svg
              viewBox="0 0 180 180"
              role="img"
              aria-label="Actual shape of one selected native pixel on the terrain tangent plane"
            >
              {corners ? (
                <>
                  <polygon
                    points={pixelPath}
                    fill="#f0e2bd"
                    stroke="#ac7b35"
                    strokeWidth="2"
                  />
                  {corners.map((p, i) => (
                    <text
                      key={i}
                      x={90 + (p[0] / pixelSpan) * 140 + 5}
                      y={90 - (p[1] / pixelSpan) * 140 - 6}
                      fontSize="11"
                      fill="#8d642b"
                    >
                      {["A", "B", "C", "D"][i]}
                    </text>
                  ))}
                </>
              ) : (
                <text
                  x="90"
                  y="90"
                  textAnchor="middle"
                  fontSize="11"
                  fill="#8d642b"
                >
                  No footprint
                </text>
              )}
            </svg>
            <strong>
              {cm(footprint?.gx)} × {cm(footprint?.gy)} cm
            </strong>
            <p>
              Zoomed to fit, with equal tangent-axis scale. Area:{" "}
              {footprint ? (footprint.area * 10000).toFixed(3) : "—"} cm². This
              is not a grouped image region.
            </p>
          </figure>
        </div>
      )}
      <div className="gsd-position-profile">
        <div>
          <strong>Sampling changes across the image</strong>
          <span>Same camera and pixel pitch · click a column to inspect</span>
        </div>
        <div className="gsd-sampling-bars">
          {samples.map((s, i) => (
            <button
              key={i}
              aria-pressed={cell[0] === i}
              aria-label={`Inspect image column ${i + 1}`}
              onClick={() => onSelect([i, cell[1]])}
            >
              <span
                style={{
                  height: s
                    ? `${Math.max(3, (s.gx / maxSample) * 48)}px`
                    : "3px",
                }}
              />
              <b>{cm(s?.gx)}</b>
            </button>
          ))}
        </div>
        <p>
          Local along-image-u sampling, cm/px. Invalid rays are shown as —, not
          clamped to a plausible GSD.
        </p>
      </div>
      <details className="gsd-ray-math">
        <summary>
          Show the actual ray–plane calculation and corner coordinates
        </summary>
        <div className="gsd-math-detail">
          <code>P(t) = [0, 0, H] + t d</code>
          <code>d = [{ray.direction.map((n) => n.toFixed(6)).join(", ")}]</code>
          <code>t = (E − H) / (dZ − tan(slope) dX)</code>
          <code id="gsd-ray-substitution">
            t = ({camera.elevation} − {camera.height}) /{" "}
            {ray.denominator.toFixed(6)} ={" "}
            {ray.t == null ? "no forward hit" : ray.t.toFixed(4) + " m"}
          </code>
          <p>
            d is not a unit vector: t is a parameter, not slant range. The
            denominator must be negative and the camera above terrain. Slant
            range = t ‖d‖.
          </p>
          <code>
            Pixel centre (u, v) = ({u.toFixed(1)}, {v.toFixed(1)})
          </code>
          {footprint?.corners.map((p, i) => (
            <code key={i}>
              {["A", "B", "C", "D"][i]} = [
              {p.map((n) => n.toFixed(6)).join(", ")}] m
            </code>
          ))}
          <p>
            The four native corner rays use u ± 0.5 and v ± 0.5. Opposite 3D
            edge lengths are averaged for GSDu/GSDv; two 3D triangle areas give
            the footprint area.
          </p>
        </div>
      </details>
    </section>
  );
}
