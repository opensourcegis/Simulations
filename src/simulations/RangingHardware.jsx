import { useId, useState } from "react";
import { RANGING_INSTRUMENT } from "./ranging-model.js";

const PARTS = [
  [
    "driver",
    "Pulse driver",
    "A clocked current driver releases a short electrical pulse into the laser diode. In phase mode it modulates optical intensity continuously; it does not sweep the optical carrier frequency.",
  ],
  [
    "laser",
    "905 nm laser diode",
    "The semiconductor emits near-infrared light, invisible to the human eye. Cyan is a teaching colour, not the actual wavelength. Pulse energy stays at 100 nJ as pulse width changes, so a longer pulse has lower peak power.",
  ],
  [
    "collimator",
    "Collimator & reference tap",
    "Collimating optics reduce beam divergence. A small pick-off sends light to a reference photodiode, starting the flight-time measurement from actual optical emission rather than the driver command.",
  ],
  [
    "objective",
    "Receiver objective",
    "A separate telescope collects a tiny fraction of the diffusely reflected light and focuses it toward the detector. The target does not send all the light back. Doubling aperture area doubles the collected signal.",
  ],
  [
    "filter",
    "905 nm bandpass filter",
    "The filter rejects much of the out-of-band sunlight. In-band background still passes, generates shot noise, and can hide a weak echo. The background control represents the remaining photoelectron rate.",
  ],
  [
    "detector",
    "Photodiode & amplifier",
    "A silicon photodiode converts absorbed photons to electrons. The transimpedance amplifier converts the weak current to voltage; finite bandwidth broadens the pulse. This model includes signal/background shot noise and input-referred electronics noise, but not APD avalanche gain.",
  ],
  [
    "timing",
    "ADC, clock & range processor",
    "The digitised waveform supplies a matched-filter arrival-time estimate. A six-to-one expected SNR gate accepts or rejects the return. A 100 ps timestamp bin and 80 ps clock jitter limit precision; a calibrated 12 ns internal delay is removed. In AMCW mode synchronous I/Q demodulation measures phase instead.",
  ],
];

export default function RangingHardware({
  mode,
  progress,
  active,
  measured,
  budget,
  aperture,
  distance,
  onFire,
}) {
  const [selected, setSelected] = useState("collimator");
  const id = useId().replace(/:/g, "");
  const part = PARTS.find((p) => p[0] === selected);
  const phase = mode !== "pulsed";
  const state = phase
    ? "Continuous intensity modulation"
    : active
      ? progress < 0.08
        ? "01 / Optical emission · START"
        : progress < 0.5
          ? "02 / Outbound flight"
          : progress < 0.58
            ? "03 / Diffuse target reflection"
            : progress < 0.94
              ? "04 / Return light collection"
              : "05 / Waveform processing"
      : measured
        ? measured.detected
          ? "06 / Valid return · range reported"
          : "06 / No valid return · below SNR gate"
        : "Ready · fire a pulse to follow the signal";
  const workingParts = phase
    ? [
        "driver",
        "laser",
        "collimator",
        "objective",
        "filter",
        "detector",
        "timing",
      ]
    : active
      ? progress < 0.08
        ? ["driver", "laser", "collimator", "timing"]
        : progress > 0.88
          ? ["objective", "filter", "detector", "timing"]
          : ["timing"]
      : measured?.detected
        ? ["timing"]
        : [];
  const hot = (key) =>
    `rng-part${selected === key ? " selected" : ""}${workingParts.includes(key) ? " working" : ""}`;
  const highlight = (key, x, y, w, h) => (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx="9"
      className={hot(key)}
      onClick={() => setSelected(key)}
    />
  );
  const dotX =
    progress < 0.5
      ? 590 + progress * 2 * 410
      : 1000 - (progress - 0.5) * 2 * 410;
  const dotY = progress < 0.5 ? 145 : 145 + (progress - 0.5) * 2 * 110;
  return (
    <section className="rng-hardware" aria-labelledby="rng-hardware-title">
      <div className="rng-hardware-heading">
        <div>
          <span className="rng-eyebrow">INSIDE THE INSTRUMENT</span>
          <h2 id="rng-hardware-title">From a photon to a distance.</h2>
          <p>
            A fixed, dual-aperture laser rangefinder · optical cutaway and
            signal chain
          </p>
        </div>
        <div className="rng-hardware-toolbar">
          <span className="rng-hardware-badge">905 nm · R = {distance} m</span>
          {mode === "pulsed" && (
            <button id="rng-hardware-fire" onClick={onFire}>
              Fire &amp; follow the pulse →
            </button>
          )}
        </div>
      </div>
      <div
        className="rng-hardware-scroll"
        tabIndex="0"
        role="region"
        aria-label="Instrument cutaway, scroll horizontally on small screens. Use the component buttons below to inspect parts."
      >
        <svg
          viewBox="0 0 1120 410"
          role="img"
          aria-labelledby={`${id}-title ${id}-desc`}
        >
          <title id={`${id}-title`}>
            Laser rangefinder optical and electronic components
          </title>
          <desc id={`${id}-desc`}>
            Pulse driver to laser diode, collimator and reference photodiode.
            Return light passes through the receiver objective, bandpass filter
            and photodiode to the amplifier, digitiser and timing processor.
            Optical and electrical paths are distinguished by colour.
          </desc>
          <defs>
            <linearGradient id={`${id}-shell`} x2="0" y2="1">
              <stop stopColor="#52636c" />
              <stop offset="1" stopColor="#253640" />
            </linearGradient>
            <linearGradient id={`${id}-glass`}>
              <stop stopColor="#58cde5" stopOpacity=".15" />
              <stop offset=".5" stopColor="#c7f5ff" stopOpacity=".8" />
              <stop offset="1" stopColor="#58cde5" stopOpacity=".2" />
            </linearGradient>
            <pattern
              id={`${id}-pcb`}
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M0 8h14v16M8 0v15h16"
                stroke="#598577"
                strokeWidth=".6"
                fill="none"
              />
            </pattern>
          </defs>
          <rect width="1120" height="410" fill="#0d1820" />
          <path d="M45 345H1075" stroke="#2a3e46" />
          <path d="M660 75v240" stroke="#334a52" strokeDasharray="4 7" />
          <text x="690" y="62" className="rng-svg-micro">
            FREE-SPACE PATH · COMPRESSED SCALE
          </text>
          <rect
            x="34"
            y="68"
            width="562"
            height="276"
            rx="22"
            fill={`url(#${id}-shell)`}
            stroke="#83949b"
          />
          <rect
            x="51"
            y="87"
            width="524"
            height="237"
            rx="11"
            fill="#15252b"
            stroke="#4c626b"
          />
          <path d="M61 97h504v217H61z" fill={`url(#${id}-pcb)`} opacity=".4" />
          {[55, 573].flatMap((x) =>
            [89, 322].map((y) => (
              <g key={`${x}-${y}`}>
                <circle cx={x} cy={y} r="4" fill="#94a4a5" />
                <path d={`M${x - 2} ${y}h4`} stroke="#23333a" />
              </g>
            )),
          )}
          <text x="74" y="114" className="rng-svg-micro">
            TRANSMITTER
          </text>
          <text x="74" y="218" className="rng-svg-micro">
            RECEIVER
          </text>
          <path
            d="M145 288V145H200M390 197v110H145M367 255H148V288"
            fill="none"
            stroke="#88d2a3"
            strokeWidth="2"
            strokeDasharray="5 4"
          />
          <rect
            x="83"
            y="275"
            width="96"
            height="43"
            rx="4"
            fill="#243438"
            stroke="#7e9986"
          />
          <rect x="105" y="284" width="51" height="24" rx="2" fill="#101a20" />
          <text x="131" y="300" textAnchor="middle" className="rng-svg-chip">
            {phase ? "I/Q DSP" : "ADC / TDC"}
          </text>
          <rect
            x="197"
            y="129"
            width="63"
            height="34"
            rx="3"
            fill="#273c44"
            stroke="#7c959b"
          />
          <text x="228" y="150" textAnchor="middle" className="rng-svg-chip">
            DRIVER
          </text>
          <path d="M260 145H300" stroke="#88d2a3" strokeWidth="2" />
          <rect
            x="300"
            y="130"
            width="43"
            height="29"
            rx="5"
            fill="#a7a4a0"
            stroke="#e0e1d6"
          />
          <path d="M310 164v12m20-12v12" stroke="#d1bf7b" strokeWidth="3" />
          <rect x="337" y="136" width="10" height="17" fill="#b9e3e7" />
          <rect
            x="456"
            y="120"
            width="71"
            height="50"
            rx="9"
            fill="#31434b"
            stroke="#7b959f"
          />
          <ellipse
            cx="488"
            cy="145"
            rx="9"
            ry="28"
            fill={`url(#${id}-glass)`}
            stroke="#81d8ee"
          />
          <path
            d="M347 140L488 131L590 138L1000 131V159L590 152L488 159L347 150z"
            fill="#57d5fa"
            opacity={phase || (active && progress < 0.58) ? 0.2 : 0.06}
          />
          <path
            d="M347 145H1000"
            stroke="#60d8ff"
            strokeWidth="2"
            opacity={phase || (active && progress < 0.58) ? 0.9 : 0.25}
          />
          <path d="M381 133l18 24" stroke="#cae5ed" strokeWidth="4" />
          <path d="M390 145v49" stroke="#60d8ff" strokeWidth="2" />
          <rect
            x="379"
            y="188"
            width="23"
            height="18"
            rx="3"
            fill="#414e54"
            stroke="#abb8b7"
          />
          <text x="414" y="201" className="rng-svg-micro">
            REFERENCE PD
          </text>
          <rect
            x="553"
            y="121"
            width="48"
            height="48"
            rx="6"
            fill="#41545d"
            stroke="#90a1a5"
          />
          <rect
            x="582"
            y="124"
            width="7"
            height="42"
            rx="3"
            fill={`url(#${id}-glass)`}
          />
          <path
            d="M1000 145L577 225V285z"
            fill="#ffb45e"
            opacity={phase || (active && progress > 0.5) ? 0.12 : 0.035}
          />
          <path
            d="M577 225L370 255L577 285M577 255H370"
            fill="none"
            stroke="#ffb45e"
            strokeWidth="1.6"
            opacity=".75"
          />
          <path
            d="M1000 145L577 225M1000 145L577 285"
            stroke="#ffb45e"
            opacity=".6"
          />
          <rect
            x="537"
            y="214"
            width="62"
            height="82"
            rx="9"
            fill="#354b55"
            stroke="#7b959f"
          />
          <ellipse
            cx="568"
            cy="255"
            rx="12"
            ry={22 + aperture * 0.22}
            fill={`url(#${id}-glass)`}
            stroke="#8de0ec"
          />
          <rect
            x="479"
            y="224"
            width="9"
            height="62"
            rx="2"
            fill="#a98dde"
            fillOpacity=".6"
            stroke="#d2c0ff"
          />
          <ellipse
            cx="422"
            cy="255"
            rx="7"
            ry="23"
            fill={`url(#${id}-glass)`}
            stroke="#8de0ec"
          />
          <rect
            x="355"
            y="240"
            width="22"
            height="30"
            rx="3"
            fill="#aaa19a"
            stroke="#e7d9bb"
          />
          <rect x="368" y="247" width="5" height="16" fill="#bd6f44" />
          <path d="M355 255h-35" stroke="#88d2a3" strokeWidth="2" />
          <path d="M292 239v32l28-16z" fill="#293c43" stroke="#9cb7a2" />
          <path d="M292 255h-53" stroke="#88d2a3" strokeWidth="2" />
          <text x="259" y="292" className="rng-svg-micro">
            TIA / ADC
          </text>
          <text x="731" y="124" className="rng-svg-path" fill="#60d8ff">
            TX · COLLIMATED BEAM →
          </text>
          <text x="738" y="245" className="rng-svg-path" fill="#ffb45e">
            ← SMALL COLLECTED FRACTION
          </text>
          <rect
            x="1000"
            y="100"
            width="26"
            height="202"
            fill="#927b61"
            stroke="#b7a187"
          />
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d={`M1002 ${109 + i * 16}l22 9`}
              stroke="#b6a184"
              opacity=".5"
            />
          ))}
          <ellipse
            cx="1000"
            cy="145"
            rx="4"
            ry="20"
            fill="#a2e6ee"
            opacity=".6"
          />
          {[
            [-40, -30],
            [-52, 2],
            [-27, 45],
            [-18, -68],
            [-52, -15],
            [-18, 68],
          ].map(([dx, dy], i) => (
            <path
              key={i}
              d={`M1000 145l${dx} ${dy}`}
              stroke="#ffb45e"
              opacity=".4"
            />
          ))}
          <text x="1012" y="81" textAnchor="middle" className="rng-svg-label">
            DIFFUSE TARGET
          </text>
          <text x="699" y="318" className="rng-svg-micro">
            MOST REFLECTED LIGHT MISSES THE RECEIVER
          </text>
          <path d="M603 362H996M603 356v12M996 356v12" stroke="#7c9ca8" />
          <text x="800" y="381" textAnchor="middle" className="rng-svg-label">
            R · one-way range
          </text>
          <text x="63" y="373" className="rng-svg-micro" fill="#88d2a3">
            DASHED GREEN · ELECTRICAL / TIMING
          </text>
          {active && (
            <circle
              cx={dotX}
              cy={dotY}
              r="7"
              fill={progress < 0.5 ? "#60d8ff" : "#ffb45e"}
              stroke="#fff"
              strokeWidth="2"
            />
          )}
          {highlight("driver", 190, 121, 77, 51)}
          {highlight("laser", 291, 120, 64, 63)}
          {highlight("collimator", 374, 118, 158, 92)}
          {highlight("objective", 530, 207, 75, 97)}
          {highlight("filter", 468, 217, 31, 77)}
          {highlight("detector", 275, 230, 107, 48)}
          {highlight("timing", 76, 269, 109, 55)}
        </svg>
      </div>
      <div className="rng-hardware-status" role="status">
        <span className={active || phase ? "rng-led active" : "rng-led"} />
        {state}
        <small>
          Light and elapsed time slowed; dimensions and receiver baseline
          exaggerated.
        </small>
      </div>
      <div className="rng-component-browser">
        <div
          className="rng-part-buttons"
          role="group"
          aria-label="Inspect instrument components"
        >
          {PARTS.map(([key, name], i) => (
            <button
              key={key}
              aria-pressed={selected === key}
              onClick={() => setSelected(key)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {name}
            </button>
          ))}
        </div>
        <div className="rng-part-explanation" aria-live="polite">
          <span className="rng-eyebrow">
            COMPONENT / {String(PARTS.indexOf(part) + 1).padStart(2, "0")}
          </span>
          <h3>{part[1]}</h3>
          <p>{part[2]}</p>
          <p className="rng-component-reading">
            {mode === "pulsed" ? (
              <>
                Expected signal <b>{budget.electrons.toFixed(0)} e⁻</b> · SNR{" "}
                <b>{budget.snr.toFixed(1)}</b> / {RANGING_INSTRUMENT.minimumSnr}{" "}
                acceptance gate
              </>
            ) : (
              "Phase modes below retain ideal reference/return signals; the noisy receiver model applies to pulse timing."
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
