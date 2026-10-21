import { lazy, Suspense, useState } from 'react';
import Thumbnail from './SimulationThumbnail.jsx';

const SIMULATION_LOADERS = {
  ortho: lazy(() => import('./simulations/OrthoRectification.jsx')),
  sfm: lazy(() => import('./simulations/StructureFromMotion.jsx')),
  'aerial-triangulation': lazy(() => import('./simulations/AerialTriangulation.jsx')),
  'lidar-ranging': lazy(() => import('./simulations/LidarRanging.jsx')),
  'lidar-scanning': lazy(() => import('./simulations/LidarScanning.jsx')),
  'adaptive-tin': lazy(() => import('./simulations/AdaptiveTIN.jsx')),
  'block-adjustment': lazy(() => import('./simulations/BlockAdjustment.jsx')),
  'camera-working': lazy(() => import('./simulations/CameraLab.jsx')),
  boresight: lazy(() => import('./simulations/Boresight.jsx')),
  gnss: lazy(() => import('./simulations/Gnss.jsx')),
  gpr: lazy(() => import('./simulations/Gpr.jsx')),
  'building-lod': lazy(() => import('./simulations/BuildingLod.jsx')),
  gsd: lazy(() => import('./simulations/Gsd.jsx')),
  snell: lazy(() => import('./simulations/Snell.jsx')),
  'map-projections': lazy(() => import('./simulations/MapProjections.jsx')),
  sar: lazy(() => import('./simulations/SarImaging.jsx')),
  'iot-twin': lazy(() => import('./simulations/IotDigitalTwin.jsx')),
  'beam-footprint': lazy(() => import('./simulations/BeamFootprint.jsx')),
};

function simulatorHref(path) {
  return `${import.meta.env.BASE_URL}${path.startsWith('?') ? path : path}`;
}

const simulators = [
  { title: 'LiDAR Ranging', category: 'LiDAR', level: 'Beginner', description: 'Turn light into distance three ways: time a laser pulse’s round trip (R = c·t / 2), read the phase of a continuous modulated wave, and combine multiple modulation frequencies to cover the whole range precisely.', tags: ['Time of flight', 'Phase / CW', 'Multi-frequency', 'Ambiguity'], path: '?simulation=lidar-ranging', kind: 'ranging', status: 'Native React' },
  { title: 'LiDAR Scan Patterns — 3D', category: 'LiDAR', level: 'Beginner', description: 'Fly a survey UAS through six steering patterns, intersect visible 3D surfaces, inspect occlusion and build a time-ordered point cloud.', tags: ['3D scan geometry', 'First-surface returns', 'Point pattern'], path: '?simulation=lidar-scanning', kind: 'scanning', status: 'Native React' },
  { title: 'Beam & Target Interaction', category: 'LiDAR', level: 'Intermediate', description: 'Follow a laser pulse through reflection, absorption, transmission, and scatter across different surfaces and targets.', tags: ['Energy balance', 'Signal strength', 'Multi-return'], path: 'games/lidar-interaction/', kind: 'interaction' },
  { title: 'Survey Mission Designer', category: 'Flight planning', level: 'Beginner', description: 'Plan a drone survey over terrain, place control points and obstructions, and explore the trade-offs behind a robust flight plan.', tags: ['Flight planning', 'Terrain', 'Coverage'], path: 'games/survey-mission-designer/', kind: 'survey' },
  { title: 'Aerial Triangulation', category: 'Photogrammetry', level: 'Intermediate', description: 'Plan a six-image aerial block over terrain and buildings, measure matching details, intersect rays, run weighted adjustment, and inspect independent checkpoint errors.', tags: ['Flight strips', 'Image measurements', 'Ray intersection', 'Survey QA'], path: '?simulation=aerial-triangulation', kind: 'triangulation', status: 'Native React' },
  { title: 'Structure from Motion', category: 'Photogrammetry', level: 'Advanced', description: 'Estimate camera poses from image coordinates using essential-matrix RANSAC, positive-depth triangulation, incremental resection and joint refinement—without known reference cameras.', tags: ['Essential matrix', 'RANSAC', 'Incremental reconstruction', 'Relative scale'], path: '?simulation=sfm', kind: 'sfm', status: 'Native React' },
  { title: 'Bundle Block Adjustment', category: 'Photogrammetry', level: 'Advanced', description: 'Jointly adjust aerial camera poses, 3D ties and calibration with weighted GCP/GNSS observations, robust image fitting and independent axis-wise checkpoint QA.', tags: ['Weighted least squares', 'Camera calibration', 'GCP & GNSS uncertainty', 'Checkpoints'], path: '?simulation=block-adjustment', kind: 'block', status: 'Native React' },
  { title: 'How a Camera Works — 3D', category: 'Photogrammetry', level: 'Beginner', description: 'Explore a 3D cutaway from lens and aperture to shutter, sensor and processor. Focus light rays, compare diffraction and defocus, set exposure, and understand pixel sampling, rolling shutter and calibration.', tags: ['3D camera anatomy', 'Thin-lens focus', 'Aperture & diffraction', 'Exposure & sensor', 'Calibration'], path: '?simulation=camera-working', kind: 'camera', status: 'Native React' },
  { title: 'True Ortho-Rectification', category: 'Photogrammetry', level: 'Intermediate', description: 'Probe relief displacement and project buildings onto a datum to understand how true orthophotos remove lean and occlusions.', tags: ['Relief displacement', 'DSM vs DTM', 'True ortho'], path: 'games/ortho-rectification/', kind: 'ortho', status: 'Original' },
  { title: 'True Ortho-Rectification — React', category: 'Photogrammetry', level: 'Intermediate', description: 'React migration workspace for the same rectification renderer, with the original interaction model preserved while the engine is split into React modules.', tags: ['React migration', 'Canvas engine', 'DSM vs DTM'], path: '?simulation=ortho', kind: 'ortho', status: 'React preview' },
  { title: 'Adaptive TIN Ground Filter', category: 'LiDAR', level: 'Intermediate', description: 'Classify ground vs. non-ground points in LiDAR point clouds using Axelsson’s adaptive triangulated irregular network (TIN) algorithm with customizable distance and angle thresholds.', tags: ['Axelsson algorithm', 'Delaunay TIN', 'Ground classification', 'Point cloud', 'Iterative filtering'], path: '?simulation=adaptive-tin', kind: 'tin', status: 'Native React' },
  { title: 'Boresight & Lever-Arm', category: 'LiDAR', level: 'Advanced', description: 'Compose antenna position, body-frame lever arm and scanner rotation. Compare survey-scale mounting, synchronization and range errors across opposite flight headings while preserving the same recorded laser range.', tags: ['Direct georeferencing', 'Lever arm', 'Timing offsets', 'Opposing strips'], path: '?simulation=boresight', kind: 'boresight', status: 'Native React' },
  { title: 'GNSS Positioning', category: 'Positioning', level: 'Advanced', description: 'Watch satellites broadcast signals, form code pseudoranges (ρ = c·Δt), measure the carrier phase, and use differential GPS to resolve the integer number of wavelengths — solving the rover’s longitude from metres down to centimetres.', tags: ['Pseudorange', 'Carrier phase', 'Integer ambiguity', 'Differential / RTK', 'Least squares'], path: '?simulation=gnss', kind: 'gnss', status: 'Native React' },
  { title: 'Ground-Penetrating Radar', category: 'Radar', level: 'Intermediate', description: 'See how a GPR antenna sends a pulse into the ground and times the echo (t = 2R/v), how stacking traces as it moves turns a buried object into a hyperbola, and how the hyperbola’s apex and shape give the object’s depth d = v·t₀/2.', tags: ['Two-way travel time', 'Radargram / B-scan', 'Hyperbola', 'Soil velocity εr', 'Depth estimation'], path: '?simulation=gpr', kind: 'gpr', status: 'Native React' },
  { title: 'Building Levels of Detail', category: 'Photogrammetry', level: 'Intermediate', description: 'Explore a residential building across the refined 16-cell LOD grid: LOD0 flat footprint surfaces, LOD1 extruded blocks, LOD2 true roof shapes, LOD3 the full architectural exterior with windows, dormers and balconies — each generated in 3D with the included/not-included detail spelled out.', tags: ['Levels of Detail', '3D city models', 'CityGML', 'Generalisation', 'Three.js'], path: '?simulation=building-lod', kind: 'lod', status: 'Native React' },
  { title: 'Ground Sampling Distance', category: 'Photogrammetry', level: 'Beginner', description: 'Project native pixels onto sloping terrain, inspect oblique near/far footprints, and distinguish sampling distance from diffraction, motion blur, subpixel alignment and sensor noise.', tags: ['Oblique GSD', 'Terrain slope', 'Native pixel sampling', 'Optics & motion'], path: '?simulation=gsd', kind: 'gsd', status: 'Native React' },
  { title: 'Snell’s Law & Camera Optics', category: 'Photogrammetry', level: 'Beginner', description: 'Bend a ray across an interface with Snell’s law n₁sinθ₁ = n₂sinθ₂ (with total internal reflection), see how a lens is stacked refraction that focuses light at f, and why real optics distort straight lines — the radial distortion photogrammetric calibration must remove.', tags: ['Snell’s law', 'Refraction', 'Lens & focal length', 'Radial distortion', 'Camera calibration'], path: '?simulation=snell', kind: 'snell', status: 'Native React' },
  { title: 'Map Projections', category: 'Cartography', level: 'Beginner', description: 'Spin a 3D globe and watch it unwrap onto a flat map five different ways — Mercator, Equirectangular, Mollweide, Albers Conic and Azimuthal. Draw your own polygon and see how its shape and area stretch as you switch projection, with Tissot indicatrices exposing the distortion.', tags: ['Projections', 'Mercator / Mollweide', 'Conic & azimuthal', 'Tissot distortion', 'Conformal vs equal-area'], path: '?simulation=map-projections', kind: 'mapproj', status: 'Native React' },
  { title: 'Synthetic Aperture Radar', category: 'Radar', level: 'Advanced', description: 'See how a side-looking radar builds a sharp all-weather image: the swath geometry, range resolution from chirp pulse-compression (δR = c/2B), the synthesised aperture that gives azimuth resolution δaz = D/2, the Doppler history, plus imaging modes, polarimetry, geometric distortion, speckle and InSAR.', tags: ['SAR', 'Chirp / pulse compression', 'Synthetic aperture', 'Doppler / azimuth', 'InSAR & polarimetry'], path: '?simulation=sar', kind: 'sar', status: 'Native React' },
  { title: 'IoT Digital Twin', category: 'IoT', level: 'Intermediate', description: 'Run a live smart factory where three machines stream sensor telemetry through an edge gateway and MQTT broker into a cloud digital twin that mirrors them, detects anomalies, predicts remaining life and closes the loop with actuation. Inject faults and watch the twin drift out of sync when you starve it of data.', tags: ['Digital twin', 'IoT telemetry', 'Edge & MQTT', 'Anomaly & RUL', 'Closed-loop control'], path: '?simulation=iot-twin', kind: 'iot', status: 'Native React' },
  { title: 'Laser Beam Divergence & Footprint', category: 'LiDAR', level: 'Beginner', description: 'See in 3D how a LiDAR beam spreads at its divergence angle γ, so the ground footprint grows with flying height (d = d₀ + R·γ) and stretches into an ellipse off-nadir (a = d/cosθ). Watch the spot size, elongation, area and return energy change as you adjust height, divergence and scan angle.', tags: ['Beam divergence', 'Footprint size', 'Incidence angle', 'Slant range', 'Ground resolution'], path: '?simulation=beam-footprint', kind: 'beam', status: 'Native React' },
];

function SimulatorCard({ simulator }) {
  return (
    <a className="card" href={simulatorHref(simulator.path)}>
      <div className="thumb"><Thumbnail kind={simulator.kind} /><span className="pill live">{simulator.status || 'Playable'}</span></div>
      <div className="card-body">
        <div className="card-top">
          <span className="eyebrow-cat">{simulator.category}</span>
          <span className={`level ${simulator.level.toLowerCase()}`}>{simulator.level}</span>
        </div>
        <h3>{simulator.title}</h3>
        <p>{simulator.description}</p>
        <div className="tags">{simulator.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>
        <span className="go">Open simulator <span className="arrow">&rarr;</span></span>
      </div>
    </a>
  );
}

const CATEGORIES = ['All', 'LiDAR', 'Photogrammetry', 'Positioning', 'Flight planning', 'Cartography', 'Radar', 'IoT'];
const TOPIC_AREAS = new Set(simulators.map((s) => s.category)).size;

function Landing() {
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const shown = simulators.filter((s) => {
    if (filter !== 'All' && s.category !== filter) return false;
    if (!q) return true;
    const hay = `${s.title} ${s.category} ${s.level} ${s.description} ${(s.tags || []).join(' ')}`.toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });

  return (
    <>
      <nav className="site-nav">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <span className="brand-mark">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 3 L21 19 H3 Z" fill="#fff" opacity=".92" /><circle cx="12" cy="15" r="2.4" fill="#0f8a4d" /></svg>
          </span>
          <span className="brand-name">Geo<b>Sim</b> Labs</span>
          <span className="brand-tag">interactive geospatial training</span>
        </a>
        <div className="nav-links">
          <a href="#simulators">Simulators</a>
          <a className="nav-cta" href="https://github.com/opensourcegis/Simulations">GitHub &#8599;</a>
        </div>
      </nav>

      <main className="wrap">
        <header className="hero">
          <h1>Understand surveying &amp; remote sensing through <em>interactive simulators</em>.</h1>
          <p className="lead">Hands-on, browser-based lessons in LiDAR, photogrammetry and flight planning. Adjust the inputs, watch the geometry respond, and build real intuition — nothing to install and no sign-up.</p>
          <div className="stats">
            <div className="stat"><b>{simulators.length}</b><span>simulators</span></div>
            <div className="stat"><b>{TOPIC_AREAS}</b><span>topic areas</span></div>
            <div className="stat"><b>100%</b><span>in your browser</span></div>
          </div>
        </header>

        <div className="section-head" id="simulators">
          <h2>Simulators</h2>
          <div className="search">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" /><path d="M20 20 L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <input type="text" value={query} placeholder="Search simulators…" aria-label="Search simulators" onChange={(e) => setQuery(e.target.value)} />
            {query && <button className="search-clear" aria-label="Clear search" onClick={() => setQuery('')}>&times;</button>}
          </div>
          <div className="filters">
            {CATEGORIES.map((c) => <button key={c} className={`filter ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>{c}</button>)}
          </div>
        </div>

        {shown.length > 0 ? (
          <div className="grid">{shown.map((s) => <SimulatorCard key={s.title} simulator={s} />)}</div>
        ) : (
          <p className="no-results">No simulators match <b>“{query}”</b>{filter !== 'All' ? <> in <b>{filter}</b></> : null}. <button className="link-btn" onClick={() => { setQuery(''); setFilter('All'); }}>Clear</button></p>
        )}

        <footer>
          <span>GeoSim Labs — browser-based geospatial simulators.</span>
          <span className="spacer" />
          <a href="https://github.com/opensourcegis/Simulations">Source on GitHub &rarr;</a>
        </footer>
      </main>
    </>
  );
}

function SimulationLoader({ id }) {
  const LazySimulator = SIMULATION_LOADERS[id];
  return (
    <Suspense fallback={<div className="sim-loading">Loading simulator…</div>}>
      <LazySimulator />
    </Suspense>
  );
}

export default function App() {
  const simulation = new URLSearchParams(window.location.search).get('simulation');
  if (simulation && SIMULATION_LOADERS[simulation]) {
    return <SimulationLoader id={simulation} />;
  }
  return <Landing />;
}
