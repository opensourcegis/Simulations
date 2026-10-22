import { Component, lazy, Suspense, useState } from "react";
import Thumbnail from "./SimulationThumbnail.jsx";

const SIMULATION_LOADERS = {
  ortho: lazy(() => import("./simulations/OrthoRectification.jsx")),
  sfm: lazy(() => import("./simulations/StructureFromMotion.jsx")),
  "aerial-triangulation": lazy(
    () => import("./simulations/AerialTriangulation.jsx"),
  ),
  "lidar-ranging": lazy(() => import("./simulations/LidarRanging.jsx")),
  "lidar-scanning": lazy(() => import("./simulations/LidarScanning.jsx")),
  "adaptive-tin": lazy(() => import("./simulations/AdaptiveTIN.jsx")),
  "block-adjustment": lazy(() => import("./simulations/BlockAdjustment.jsx")),
  "camera-working": lazy(() => import("./simulations/CameraLab.jsx")),
  boresight: lazy(() => import("./simulations/Boresight.jsx")),
  gnss: lazy(() => import("./simulations/Gnss.jsx")),
  gpr: lazy(() => import("./simulations/Gpr.jsx")),
  "building-lod": lazy(() => import("./simulations/BuildingLod.jsx")),
  gsd: lazy(() => import("./simulations/Gsd.jsx")),
  snell: lazy(() => import("./simulations/Snell.jsx")),
  "map-projections": lazy(() => import("./simulations/MapProjections.jsx")),
  sar: lazy(() => import("./simulations/SarImaging.jsx")),
  "iot-twin": lazy(() => import("./simulations/IotDigitalTwin.jsx")),
  "beam-footprint": lazy(() => import("./simulations/BeamFootprint.jsx")),
  imu: lazy(() => import("./simulations/ImuLab.jsx")),
  "sbet-trajectory": lazy(() => import("./simulations/SbetTrajectory.jsx")),
  "least-squares": lazy(
    () => import("./simulations/LeastSquaresAdjustment.jsx"),
  ),
};

function simulatorHref(path) {
  return `${import.meta.env.BASE_URL}${path}`;
}

const simulators = [
  {
    title: "LiDAR Ranging",
    category: "LiDAR",
    level: "Beginner",
    description:
      "Measure pulse travel time, convert delay to range, and compare phase-based ranging and multi-frequency ambiguity resolution.",
    tags: ["Time of flight", "Phase / CW", "Multi-frequency", "Ambiguity"],
    path: "?simulation=lidar-ranging",
    kind: "ranging",
  },
  {
    title: "LiDAR Scan Patterns — 3D",
    category: "LiDAR",
    level: "Beginner",
    description:
      "Fly a survey UAS through six steering patterns, intersect visible 3D surfaces, inspect occlusion and build a time-ordered point cloud.",
    tags: ["3D scan geometry", "First-surface returns", "Point pattern"],
    path: "?simulation=lidar-scanning",
    kind: "scanning",
    status: "Native React",
  },
  {
    title: "Beam & Target Interaction",
    category: "LiDAR",
    level: "Intermediate",
    description:
      "Follow a laser pulse through reflection, absorption, transmission, and scatter across different surfaces and targets.",
    tags: ["Energy balance", "Signal strength", "Multi-return"],
    path: "games/lidar-interaction/",
    kind: "interaction",
  },
  {
    title: "Survey Mission Designer",
    category: "Flight planning",
    level: "Beginner",
    description:
      "Choose a payload, take-off point and flight-block entry. Balance GSD or point density against overlap, obstacles, wind and endurance.",
    tags: ["Flight planning", "Terrain", "Coverage"],
    path: "games/survey-mission-designer/",
    kind: "survey",
  },
  {
    title: "Aerial Triangulation",
    category: "Photogrammetry",
    level: "Intermediate",
    description:
      "Plan a six-image aerial block over terrain and buildings, measure matching details, intersect rays, run weighted adjustment, and inspect independent checkpoint errors.",
    tags: [
      "Flight strips",
      "Image measurements",
      "Ray intersection",
      "Survey QA",
    ],
    path: "?simulation=aerial-triangulation",
    kind: "triangulation",
    status: "Native React",
  },
  {
    title: "Structure from Motion",
    category: "Photogrammetry",
    level: "Advanced",
    description:
      "Recover cameras and sparse points from synthetic image matches. Test RANSAC, parallax, incremental registration and relative scale.",
    tags: ["Essential matrix", "RANSAC", "Reconstruction", "Relative scale"],
    path: "?simulation=sfm",
    kind: "sfm",
  },
  {
    title: "Bundle Block Adjustment",
    category: "Photogrammetry",
    level: "Advanced",
    description:
      "Jointly adjust camera poses, tie points and calibration. Compare image residuals with independent checkpoints and test control geometry.",
    tags: [
      "Weighted least squares",
      "Calibration",
      "Control uncertainty",
      "Checkpoints",
    ],
    path: "?simulation=block-adjustment",
    kind: "block",
  },
  {
    title: "How a Camera Works — 3D",
    category: "Photogrammetry",
    level: "Beginner",
    description:
      "Follow light from lens to sensor. Compare focus, diffraction, exposure and rolling-shutter readout without confusing pixel size with optical resolution.",
    tags: [
      "Camera anatomy",
      "Focus & diffraction",
      "Exposure & readout",
      "Calibration",
    ],
    path: "?simulation=camera-working",
    kind: "camera",
  },
  {
    title: "True Ortho-Rectification",
    category: "Photogrammetry",
    level: "Intermediate",
    description:
      "Probe relief displacement and project buildings onto a datum to understand how true orthophotos remove lean and occlusions.",
    tags: ["Relief displacement", "DSM vs DTM", "True ortho"],
    path: "games/ortho-rectification/",
    kind: "ortho",
    status: "Original",
  },
  {
    title: "Adaptive TIN Ground Filter",
    category: "LiDAR",
    level: "Intermediate",
    description:
      "Build a seed TIN, test each candidate against its current facet, and watch accepted points retriangulate the surface. Investigate classification errors.",
    tags: [
      "Seed selection",
      "Delaunay TIN",
      "Distance & angle",
      "Ground classification",
    ],
    path: "?simulation=adaptive-tin",
    kind: "tin",
  },
  {
    title: "Boresight & Lever-Arm",
    category: "LiDAR",
    level: "Advanced",
    description:
      "Transform a recorded laser measurement into ground coordinates. Separate lever-arm translation from boresight rotation using opposing strips.",
    tags: [
      "Direct georeferencing",
      "Lever arm",
      "Timing offsets",
      "Opposing strips",
    ],
    path: "?simulation=boresight",
    kind: "boresight",
  },
  {
    title: "GNSS Positioning",
    category: "Positioning",
    level: "Intermediate",
    description:
      "Separate code range, clock bias and carrier ambiguity. Compute an east-coordinate solution, cancel clocks with double differences, and test a supplied integer hypothesis against residuals.",
    tags: [
      "Code & clock",
      "Carrier ambiguity",
      "Double differences",
      "Conditional precision",
    ],
    path: "?simulation=gnss",
    kind: "gnss",
    status: "Native React",
  },
  {
    title: "Inside an IMU — 3D",
    category: "Positioning",
    level: "Beginner",
    description:
      "Inspect a proof mass and vibrating gyro. Predict specific force and angular rate, integrate attitude, and test bias and gravity aiding.",
    tags: ["Specific force", "MEMS gyroscope", "Attitude", "Bias & drift"],
    path: "?simulation=imu",
    kind: "imu",
  },
  {
    title: "Least-Squares Adjustment",
    category: "Positioning",
    level: "Intermediate",
    description:
      "Adjust levelling and GNSS observations. Trace numeric substitutions, matrices, residuals, datum constraints, covariance and quality tests.",
    tags: [
      "Levelling & GNSS",
      "Worked calculations",
      "Weights & covariance",
      "Quality tests",
    ],
    path: "?simulation=least-squares",
    kind: "adjustment",
  },
  {
    title: "SBET Trajectory & Kalman Filter",
    category: "LiDAR",
    level: "Advanced",
    description:
      "Fuse IMU and GNSS, inspect Kalman updates, test outages and backward smoothing, then use the time-tagged trajectory for LiDAR georeferencing.",
    tags: [
      "GNSS / INS fusion",
      "Kalman covariance",
      "RTS smoothing",
      "Synchronization",
    ],
    path: "?simulation=sbet-trajectory",
    kind: "sbet",
  },
  {
    title: "Ground-Penetrating Radar",
    category: "Radar",
    level: "Intermediate",
    description:
      "Connect pulse propagation to a recorded trace and diffraction hyperbola. Infer depth and see why an incorrect soil velocity gives an incorrect answer.",
    tags: ["Two-way time", "A-scan & B-scan", "Hyperbola", "Soil velocity"],
    path: "?simulation=gpr",
    kind: "gpr",
  },
  {
    title: "Building Levels of Detail",
    category: "Photogrammetry",
    level: "Intermediate",
    description:
      "Compare footprint, block, roof and architectural exterior models. Choose detail for an application and distinguish geometric detail from survey accuracy.",
    tags: [
      "Levels of detail",
      "3D city models",
      "Generalisation",
      "Model scope",
    ],
    path: "?simulation=building-lod",
    kind: "lod",
  },
  {
    title: "Ground Sampling Distance",
    category: "Photogrammetry",
    level: "Beginner",
    description:
      "Project native pixels onto sloping terrain, inspect oblique near/far footprints, and distinguish sampling distance from diffraction, motion blur, subpixel alignment and sensor noise.",
    tags: [
      "Oblique GSD",
      "Terrain slope",
      "Native pixel sampling",
      "Optics & motion",
    ],
    path: "?simulation=gsd",
    kind: "gsd",
    status: "Native React",
  },
  {
    title: "Snell’s Law & Camera Optics",
    category: "Photogrammetry",
    level: "Beginner",
    description:
      "Predict refraction and total internal reflection. Calculate thin-lens focal length, then investigate the radial distortion camera calibration must model.",
    tags: [
      "Snell’s law",
      "Critical angle",
      "Lensmaker equation",
      "Radial distortion",
    ],
    path: "?simulation=snell",
    kind: "snell",
  },
  {
    title: "Map Projections",
    category: "Cartography",
    level: "Beginner",
    description:
      "Compare seven spherical projections. Inspect equal-radius circles, local area factors and polygon shape to distinguish conformal, equal-area and equidistant properties.",
    tags: [
      "Spherical projections",
      "Local distortion",
      "Tissot circles",
      "Map properties",
    ],
    path: "?simulation=map-projections",
    kind: "mapproj",
  },
  {
    title: "Synthetic Aperture Radar",
    category: "Radar",
    level: "Advanced",
    description:
      "Relate side-looking geometry, chirp bandwidth and Doppler history to ideal range and azimuth resolution. Separate theoretical responses from a processed radar image.",
    tags: ["Pulse compression", "Synthetic aperture", "Doppler", "Resolution"],
    path: "?simulation=sar",
    kind: "sar",
  },
  {
    title: "IoT Digital Twin",
    category: "IoT",
    level: "Intermediate",
    description:
      "Trace simulated telemetry through a delayed network to rule-based feedback. Inject faults and distinguish sample age, state mismatch and control response.",
    tags: [
      "Telemetry pipeline",
      "Latency & loss",
      "State estimation",
      "Feedback control",
    ],
    path: "?simulation=iot-twin",
    kind: "iot",
  },
  {
    title: "Laser Beam Divergence & Footprint",
    category: "LiDAR",
    level: "Beginner",
    description:
      "Calculate beam diameter and the oblique ground ellipse. Separate footprint size from sample spacing, and inspect the effect of height, divergence and incidence.",
    tags: [
      "Beam divergence",
      "Footprint area",
      "Incidence angle",
      "Slant range",
    ],
    path: "?simulation=beam-footprint",
    kind: "beam",
  },
];

function SimulatorCard({ simulator }) {
  return (
    <a className="card" href={simulatorHref(simulator.path)}>
      <div className="thumb">
        <Thumbnail kind={simulator.kind} />
      </div>
      <div className="card-body">
        <div className="card-top">
          <span className="eyebrow-cat">{simulator.category}</span>
          <span className={`level ${simulator.level.toLowerCase()}`}>
            {simulator.level}
          </span>
        </div>
        <h3>{simulator.title}</h3>
        <p>{simulator.description}</p>
        <span className="go">
          Open simulator <span className="arrow">&rarr;</span>
        </span>
      </div>
    </a>
  );
}

const CATEGORIES = [
  "All",
  "LiDAR",
  "Photogrammetry",
  "Positioning",
  "Flight planning",
  "Cartography",
  "Radar",
  "IoT",
];

function Landing() {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = simulators.filter((s) => {
    if (filter !== "All" && s.category !== filter) return false;
    if (!q) return true;
    const hay =
      `${s.title} ${s.category} ${s.level} ${s.description} ${(s.tags || []).join(" ")}`.toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });

  return (
    <>
      <nav className="site-nav">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 3 L21 19 H3 Z" fill="#fff" opacity=".92" />
              <circle cx="12" cy="15" r="2.4" fill="#0f8a4d" />
            </svg>
          </span>
          <span className="brand-name">
            Geo<b>Sim</b> Labs
          </span>
          <span className="brand-tag">interactive geospatial training</span>
        </a>
        <div className="nav-links">
          <a href="#simulators">Simulators</a>
          <a
            className="nav-cta"
            href="https://github.com/opensourcegis/Simulations"
          >
            GitHub &#8599;
          </a>
        </div>
      </nav>

      <main className="wrap">
        <header className="hero">
          <h1>Geospatial simulations</h1>
          <p className="lead">
            Explore surveying and remote sensing. Change a setting, inspect the
            result, and understand the theory.
          </p>
        </header>

        <div className="section-head" id="simulators">
          <h2>Simulators</h2>
          <div className="search">
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M20 20 L16 16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <input
              type="text"
              value={query}
              placeholder="Search simulators…"
              aria-label="Search simulators"
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                className="search-clear"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                &times;
              </button>
            )}
          </div>
          <div className="filters">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                className={`filter ${filter === c ? "active" : ""}`}
                onClick={() => setFilter(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {shown.length > 0 ? (
          <div className="grid">
            {shown.map((s) => (
              <SimulatorCard key={s.title} simulator={s} />
            ))}
          </div>
        ) : (
          <p className="no-results">
            No simulators match <b>“{query}”</b>
            {filter !== "All" ? (
              <>
                {" "}
                in <b>{filter}</b>
              </>
            ) : null}
            .{" "}
            <button
              className="link-btn"
              onClick={() => {
                setQuery("");
                setFilter("All");
              }}
            >
              Clear
            </button>
          </p>
        )}

        <footer>
          <span>GeoSim Labs — browser-based geospatial simulators.</span>
          <span className="spacer" />
          <a href="https://github.com/opensourcegis/Simulations">
            Source on GitHub &rarr;
          </a>
        </footer>
      </main>
    </>
  );
}

class SimulationBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="sim-loading" role="alert">
          <h1>The laboratory could not start</h1>
          <p>
            Reload to retry. For 3D lessons, check that WebGL and hardware
            acceleration are available in your browser.
          </p>
          <p>
            <a href={window.location.href}>Reload this laboratory</a> ·{" "}
            <a href={import.meta.env.BASE_URL}>All laboratories</a>
          </p>
        </main>
      );
    return this.props.children;
  }
}
function SimulationLoader({ id }) {
  const LazySimulator = SIMULATION_LOADERS[id];
  return (
    <SimulationBoundary>
      <Suspense
        fallback={
          <div className="sim-loading" role="status">
            Loading simulator…
          </div>
        }
      >
        <LazySimulator />
      </Suspense>
    </SimulationBoundary>
  );
}

export default function App() {
  const simulation = new URLSearchParams(window.location.search).get(
    "simulation",
  );
  if (simulation && SIMULATION_LOADERS[simulation]) {
    return <SimulationLoader id={simulation} />;
  }
  return <Landing />;
}
