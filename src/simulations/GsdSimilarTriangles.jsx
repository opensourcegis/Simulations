import { nadirGsdReference } from "./gsd-model.js";

// Each triangle is scaled isotropically, but the sensor and ground halves have
// independent magnifications. This preserves ray angles without pretending a
// millimetre-sized camera can be drawn at the same scale as a survey site.
export default function GsdSimilarTriangles({ camera }) {
  const reference = nadirGsdReference(camera);
  const cx = 205,
    cy = 160,
    sensorDepth = 100;
  const groundDepth = Math.min(180, 150 / Math.tan(reference.halfAngle));
  const sensorHalf = sensorDepth * Math.tan(reference.halfAngle);
  const groundHalf = groundDepth * Math.tan(reference.halfAngle);
  const sy = cy - sensorDepth,
    gy = cy + groundDepth;
  const bodyHalf = Math.max(60, sensorHalf + 16);
  const ratio = (reference.agl * 1000) / camera.f;
  const differs = camera.tilt !== 0 || camera.slope !== 0;
  const angleX = 29 * Math.sin(reference.halfAngle);
  const angleY = 29 * Math.cos(reference.halfAngle);
  return (
    <section
      className="gsd-similarity"
      id="gsd-similar-triangles"
      aria-label="Sensor and ground similar triangles for the nadir reference"
    >
      <div className="gsd-similarity-heading">
        <div>
          <strong>See both sides of the lens</strong>
          <span>
            Parallel sensor and level ground → equal angles → similar triangles
          </span>
        </div>
        <b>NADIR REFERENCE</b>
      </div>
      <div className="gsd-similarity-layout">
        <figure className="gsd-camera-triangles">
          <svg
            viewBox="0 0 440 430"
            role="img"
            aria-label="Camera cutaway with CMOS sensor behind an equivalent lens, an inverted sensor triangle and its similar ground triangle"
          >
            <defs>
              <linearGradient id="gsd-camera-metal" x2="1" y2="1">
                <stop stopColor="#e4e9e7" />
                <stop offset=".5" stopColor="#f7f9f7" />
                <stop offset="1" stopColor="#bcc9c7" />
              </linearGradient>
              <linearGradient id="gsd-sensor-silicon" x2="0" y2="1">
                <stop stopColor="#859aab" />
                <stop offset="1" stopColor="#364d65" />
              </linearGradient>
            </defs>
            <rect
              x={cx - bodyHalf}
              y={sy - 17}
              width={bodyHalf * 2}
              height="50"
              rx="8"
              fill="url(#gsd-camera-metal)"
              stroke="#8a9e9a"
            />
            <path
              d={`M${cx - bodyHalf + 9} ${sy - 6}H${cx + bodyHalf - 9}`}
              stroke="#7f9777"
              strokeWidth="7"
            />
            {[0, 1, 2, 3].map((i) => (
              <circle
                key={i}
                cx={cx - bodyHalf + 7 + (i % 2) * (bodyHalf * 2 - 14)}
                cy={sy - 10 + Math.floor(i / 2) * 35}
                r="2"
                fill="#849793"
              />
            ))}
            <rect
              x={cx - 31}
              y={sy + 33}
              width="62"
              height={cy - sy - 18}
              rx="5"
              fill="#e2e9e83b"
              stroke="#9cafad"
            />
            {[0, 1, 2].map((i) => (
              <path
                key={i}
                d={`M${cx - 31} ${cy - 28 + i * 6}h8 M${cx + 23} ${cy - 28 + i * 6}h8`}
                stroke="#849b98"
                strokeWidth="2"
              />
            ))}
            <path
              d={`M${cx - sensorHalf} ${sy}L${cx} ${cy}L${cx + sensorHalf} ${sy}Z`}
              fill="#84b5c128"
            />
            <path
              d={`M${cx - groundHalf} ${gy}L${cx} ${cy}L${cx + groundHalf} ${gy}Z`}
              fill="#d6b77928"
            />
            <path
              d={`M${cx} 36V${gy}`}
              stroke="#93a6a0"
              strokeDasharray="4 5"
            />
            <path
              d={`M${cx - sensorHalf} ${sy}L${cx} ${cy}L${cx + groundHalf} ${gy}`}
              fill="none"
              stroke="#5394a5"
              strokeWidth="1.8"
            />
            <path
              d={`M${cx + sensorHalf} ${sy}L${cx} ${cy}L${cx - groundHalf} ${gy}`}
              fill="none"
              stroke="#b58a42"
              strokeWidth="1.8"
            />
            <rect
              id="gsd-sensor-plane"
              x={cx - sensorHalf}
              y={sy - 4}
              width={sensorHalf * 2}
              height="8"
              rx="1"
              fill="url(#gsd-sensor-silicon)"
              stroke="#385769"
            />
            {Array.from({ length: 13 }, (_, i) => (
              <path
                key={i}
                d={`M${cx - sensorHalf + (i * sensorHalf) / 6} ${sy - 3}v6`}
                stroke="#c2d3df"
                strokeWidth=".6"
              />
            ))}
            <path
              d={`M${cx - 24} ${cy}Q${cx} ${cy - 12} ${cx + 24} ${cy}Q${cx} ${cy + 12} ${cx - 24} ${cy}`}
              fill="#b9dce2b3"
              stroke="#51828b"
            />
            <circle cx={cx} cy={cy} r="3" fill="#355d61" />
            <path d={`M87 ${cy}H${cx - 34}`} stroke="#8fa49e" />
            <text x="28" y={cy - 8} className="gsd-svg-small">
              Lens
            </text>
            <text x="28" y={cy + 12} className="gsd-svg-small">
              centre O
            </text>
            <path
              d={`M${cx - angleX} ${cy - angleY}A29 29 0 0 1 ${cx + angleX} ${cy - angleY} M${cx + angleX} ${cy + angleY}A29 29 0 0 1 ${cx - angleX} ${cy + angleY}`}
              stroke="#5e7970"
              fill="none"
            />
            <text x={cx + 9} y={cy - 37} className="gsd-svg-label">
              θ
            </text>
            <text x={cx - 17} y={cy + 45} className="gsd-svg-label">
              θ
            </text>
            <path
              d={`M${cx - sensorHalf} 24H${cx + sensorHalf} M${cx - sensorHalf} 19V29 M${cx + sensorHalf} 19V29`}
              stroke="#587e8c"
            />
            <text x={cx} y="14" textAnchor="middle" className="gsd-svg-label">
              Sensor width W = {camera.sensorW} mm
            </text>
            <text x={cx + sensorHalf + 10} y={sy + 5} className="gsd-svg-small">
              CMOS
            </text>
            <text
              x={cx - sensorHalf - 8}
              y={sy + 16}
              textAnchor="end"
              className="gsd-svg-small"
            >
              B
            </text>
            <text x={cx + sensorHalf + 8} y={sy + 16} className="gsd-svg-small">
              A
            </text>
            <path
              d={`M377 ${sy}V${cy} M372 ${sy}h10 M372 ${cy}h10`}
              stroke="#5e8190"
            />
            <text
              x="365"
              y={(sy + cy) / 2 - 6}
              textAnchor="end"
              className="gsd-svg-small"
            >
              f = {camera.f} mm
            </text>
            <text
              x="365"
              y={(sy + cy) / 2 + 10}
              textAnchor="end"
              className="gsd-svg-small"
            >
              sensor to O
            </text>
            <path d={`M377 ${cy}V${gy} M372 ${gy}h10`} stroke="#8d805e" />
            <text
              x="365"
              y={(cy + gy) / 2 - 6}
              textAnchor="end"
              className="gsd-svg-small"
            >
              H − E
            </text>
            <text
              x="365"
              y={(cy + gy) / 2 + 11}
              textAnchor="end"
              className="gsd-svg-label"
            >
              {reference.agl.toFixed(1)} m
            </text>
            <path d={`M25 ${gy}H407V${gy + 17}H25Z`} fill="#e3e9d9" />
            <path d={`M25 ${gy}H407`} stroke="#738664" strokeWidth="2" />
            <text
              x={cx - groundHalf}
              y={gy - 9}
              textAnchor="middle"
              className="gsd-svg-small"
            >
              A
            </text>
            <text
              x={cx + groundHalf}
              y={gy - 9}
              textAnchor="middle"
              className="gsd-svg-small"
            >
              B
            </text>
            <path
              d={`M${cx - groundHalf} ${gy + 30}H${cx + groundHalf} M${cx - groundHalf} ${gy + 25}v10 M${cx + groundHalf} ${gy + 25}v10`}
              stroke="#a2864c"
            />
            <text
              x={cx}
              y={gy + 49}
              textAnchor="middle"
              className="gsd-svg-label"
              id="gsd-reference-swath"
            >
              Ground width Wg = {reference.groundWidth.toFixed(2)} m
            </text>
            <text x={cx} y="416" textAnchor="middle" className="gsd-svg-small">
              Camera cross-section · independent sensor / ground zoom
            </text>
          </svg>
          <figcaption>
            Light travels ground → lens → sensor. O is the equivalent projection
            centre; rays cross there, inverting A–B. The real multi-element lens
            is reduced to this calibrated pinhole model.
          </figcaption>
        </figure>
        <div className="gsd-similarity-explanation">
          <figure className="gsd-photosite-detail">
            <figcaption>A small part of the sensor · enlarged</figcaption>
            <svg
              viewBox="0 0 300 132"
              role="img"
              aria-label="Enlarged CMOS sensor array with one photosite pitch marked, representative cells rather than the entire sensor"
            >
              <rect
                x="28"
                y="35"
                width="244"
                height="76"
                rx="7"
                fill="#476e65"
                stroke="#2d554b"
              />
              <rect
                x="43"
                y="43"
                width="214"
                height="60"
                rx="3"
                fill="#283a48"
              />
              {Array.from({ length: 40 }, (_, i) => {
                const x = 51 + (i % 10) * 20,
                  y = 48 + Math.floor(i / 10) * 12;
                return (
                  <g key={i}>
                    <rect
                      x={x}
                      y={y}
                      width="18"
                      height="10"
                      rx="2"
                      fill={
                        i === 14 ? "#d4ac59" : i % 2 ? "#688991" : "#889aa4"
                      }
                      stroke={i === 14 ? "#f6d898" : "#b5c5c7"}
                      strokeWidth=".6"
                    />
                    <ellipse
                      cx={x + 9}
                      cy={y + 5}
                      rx="5.5"
                      ry="3.2"
                      fill="#e6f0ed"
                      opacity=".25"
                    />
                  </g>
                );
              })}
              <path
                d="M131 28H151 M131 23V33 M151 23V33 M141 28V58"
                fill="none"
                stroke="#ac7b35"
              />
              <text
                x="150"
                y="15"
                textAnchor="middle"
                className="gsd-svg-label"
              >
                p = {(camera.pitchMm * 1000).toFixed(2)} µm
              </text>
              <text
                x="150"
                y="127"
                textAnchor="middle"
                className="gsd-svg-small"
              >
                One pitch = one sample · representative cells
              </text>
            </svg>
          </figure>
          <ol>
            <li>
              <b>Match the two triangles.</b>
              <span>
                Sensor and ground are parallel. The angles θ at O are vertically
                opposite.
              </span>
              <code>W / f = Wg / (H − E)</code>
            </li>
            <li>
              <b>Divide both widths by the column count.</b>
              <span>
                {camera.width.toLocaleString()} columns: p = W/N and GSD₀ =
                Wg/N.
              </span>
              <code>p / f = GSD₀ / (H − E)</code>
            </li>
            <li>
              <b>Use the same length units.</b>
              <code id="gsd-similarity-ratio">
                {(reference.agl * 1000).toFixed(0)} mm / {camera.f} mm ={" "}
                {ratio.toFixed(1)}
              </code>
              <code id="gsd-similarity-result">
                {(camera.pitchMm * 1000).toFixed(2)} µm × {ratio.toFixed(1)} ={" "}
                {(reference.gsd * 100).toFixed(2)} cm/px
              </code>
            </li>
          </ol>
        </div>
      </div>
      <p className="gsd-similarity-scope">
        The two triangles use independent magnifications, preserving their
        angles; sensor millimetres and ground metres are not drawn at one common
        scale. f is the calibrated image-space principal distance (approximated
        by focal length at aerial distances), not the lens barrel length.{" "}
        {differs
          ? "Your tilt/slope settings are not applied to this nadir reference. Switch to “Actual tilt & slope” for the current ray intersections."
          : "For this level, nadir geometry, the actual pixel footprint agrees with the similar-triangle result."}
      </p>
    </section>
  );
}
