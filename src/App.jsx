import { useState } from 'react';
import OrthoRectification from './simulations/OrthoRectification.jsx';
import StructureFromMotion from './simulations/StructureFromMotion.jsx';
import LidarRanging from './simulations/LidarRanging.jsx';
import AdaptiveTIN from './simulations/AdaptiveTIN.jsx';
import BlockAdjustment from './simulations/BlockAdjustment.jsx';
import Boresight from './simulations/Boresight.jsx';
import Gnss from './simulations/Gnss.jsx';
import Gpr from './simulations/Gpr.jsx';
import BuildingLod from './simulations/BuildingLod.jsx';
import Gsd from './simulations/Gsd.jsx';
import Snell from './simulations/Snell.jsx';
import MapProjections from './simulations/MapProjections.jsx';
import SarImaging from './simulations/SarImaging.jsx';
import IotDigitalTwin from './simulations/IotDigitalTwin.jsx';
import BeamFootprint from './simulations/BeamFootprint.jsx';

const simulators = [
  { title: 'LiDAR Ranging', category: 'LiDAR', level: 'Beginner', description: 'Turn light into distance three ways: time a laser pulse’s round trip (R = c·t / 2), read the phase of a continuous modulated wave, and combine multiple modulation frequencies to cover the whole range precisely.', tags: ['Time of flight', 'Phase / CW', 'Multi-frequency', 'Ambiguity'], path: '?simulation=lidar-ranging', kind: 'ranging', status: 'Native React' },
  { title: 'LiDAR Scan Patterns', category: 'LiDAR', level: 'Beginner', description: 'Compare six real beam-steering mechanisms and watch their ground patterns build up as a drone moves across the map.', tags: ['Scan mechanisms', 'Point pattern', 'Coverage'], path: 'games/lidar-scanning/', kind: 'scanning' },
  { title: 'Beam & Target Interaction', category: 'LiDAR', level: 'Intermediate', description: 'Follow a laser pulse through reflection, absorption, transmission, and scatter across different surfaces and targets.', tags: ['Energy balance', 'Signal strength', 'Multi-return'], path: 'games/lidar-interaction/', kind: 'interaction' },
  { title: 'Survey Mission Designer', category: 'Flight planning', level: 'Beginner', description: 'Plan a drone survey over terrain, place control points and obstructions, and explore the trade-offs behind a robust flight plan.', tags: ['Flight planning', 'Terrain', 'Coverage'], path: 'games/survey-mission-designer/', kind: 'survey' },
  { title: 'Aerial Triangulation', category: 'Photogrammetry', level: 'Intermediate', description: 'Build an image block, measure tie points, and see how bundle adjustment turns overlapping photographs into a connected survey.', tags: ['Image block', 'Tie points', 'Bundle adjustment'], path: 'games/aerial-triangulation/', kind: 'triangulation' },
  { title: 'Structure from Motion', category: 'Photogrammetry', level: 'Advanced', description: 'Match the same corner of a 3D object across photographs and watch triangulation and resection recover each camera’s position and orientation.', tags: ['Feature matching', 'Camera pose', '3D reconstruction'], path: '?simulation=sfm', kind: 'sfm', status: 'Native React' },
  { title: 'Bundle Block Adjustment', category: 'Photogrammetry', level: 'Advanced', description: 'Explore Interior & Exterior Orientation parameters, degrees of freedom, collinearity equations, and see how photo overlap & tie points reduce GCP requirements.', tags: ['IO & EO Parameters', 'Collinearity equations', 'Tie Points & GCPs', 'Redundancy & DOF', 'Least-squares bundle'], path: '?simulation=block-adjustment', kind: 'block', status: 'Native React' },
  { title: 'True Ortho-Rectification', category: 'Photogrammetry', level: 'Intermediate', description: 'Probe relief displacement and project buildings onto a datum to understand how true orthophotos remove lean and occlusions.', tags: ['Relief displacement', 'DSM vs DTM', 'True ortho'], path: 'games/ortho-rectification/', kind: 'ortho', status: 'Original' },
  { title: 'True Ortho-Rectification — React', category: 'Photogrammetry', level: 'Intermediate', description: 'React migration workspace for the same rectification renderer, with the original interaction model preserved while the engine is split into React modules.', tags: ['React migration', 'Canvas engine', 'DSM vs DTM'], path: '?simulation=ortho', kind: 'ortho', status: 'React preview' },
  { title: 'Adaptive TIN Ground Filter', category: 'LiDAR', level: 'Intermediate', description: 'Classify ground vs. non-ground points in LiDAR point clouds using Axelsson’s adaptive triangulated irregular network (TIN) algorithm with customizable distance and angle thresholds.', tags: ['Axelsson algorithm', 'Delaunay TIN', 'Ground classification', 'Point cloud', 'Iterative filtering'], path: '?simulation=adaptive-tin', kind: 'tin', status: 'Native React' },
  { title: 'Boresight & Lever-Arm', category: 'LiDAR', level: 'Advanced', description: 'Visualize direct-georeferencing frames in 3D: the GPS antenna aligned to the ECEF axes, the IMU to local North / East / Nadir, and the LiDAR rotated by its boresight roll/pitch/yaw — with the antenna→LiDAR lever arm and the ground error an uncalibrated boresight produces.', tags: ['Direct georeferencing', 'Lever arm', 'Boresight', 'IMU / GNSS', 'Sensor fusion'], path: '?simulation=boresight', kind: 'boresight', status: 'Native React' },
  { title: 'GNSS Positioning', category: 'Positioning', level: 'Advanced', description: 'Watch satellites broadcast signals, form code pseudoranges (ρ = c·Δt), measure the carrier phase, and use differential GPS to resolve the integer number of wavelengths — solving the rover’s longitude from metres down to centimetres.', tags: ['Pseudorange', 'Carrier phase', 'Integer ambiguity', 'Differential / RTK', 'Least squares'], path: '?simulation=gnss', kind: 'gnss', status: 'Native React' },
  { title: 'Ground-Penetrating Radar', category: 'LiDAR', level: 'Intermediate', description: 'See how a GPR antenna sends a pulse into the ground and times the echo (t = 2R/v), how stacking traces as it moves turns a buried object into a hyperbola, and how the hyperbola’s apex and shape give the object’s depth d = v·t₀/2.', tags: ['Two-way travel time', 'Radargram / B-scan', 'Hyperbola', 'Soil velocity εr', 'Depth estimation'], path: '?simulation=gpr', kind: 'gpr', status: 'Native React' },
  { title: 'Building Levels of Detail', category: 'Photogrammetry', level: 'Intermediate', description: 'Explore a residential building across the refined 16-cell LOD grid: LOD0 flat footprint surfaces, LOD1 extruded blocks, LOD2 true roof shapes, LOD3 the full architectural exterior with windows, dormers and balconies — each generated in 3D with the included/not-included detail spelled out.', tags: ['Levels of Detail', '3D city models', 'CityGML', 'Generalisation', 'Three.js'], path: '?simulation=building-lod', kind: 'lod', status: 'Native React' },
  { title: 'Ground Sampling Distance', category: 'Photogrammetry', level: 'Beginner', description: 'See in 3D how each sensor pixel maps to a patch of ground through the camera lens, and watch the Ground Sampling Distance GSD = p·H/f change as you adjust focal length, flying height, sensor size and resolution.', tags: ['GSD', 'Pixel pitch', 'Focal length', 'Flying height', 'Pinhole model'], path: '?simulation=gsd', kind: 'gsd', status: 'Native React' },
  { title: 'Snell’s Law & Camera Optics', category: 'Photogrammetry', level: 'Beginner', description: 'Bend a ray across an interface with Snell’s law n₁sinθ₁ = n₂sinθ₂ (with total internal reflection), see how a lens is stacked refraction that focuses light at f, and why real optics distort straight lines — the radial distortion photogrammetric calibration must remove.', tags: ['Snell’s law', 'Refraction', 'Lens & focal length', 'Radial distortion', 'Camera calibration'], path: '?simulation=snell', kind: 'snell', status: 'Native React' },
  { title: 'Map Projections', category: 'Cartography', level: 'Beginner', description: 'Spin a 3D globe and watch it unwrap onto a flat map five different ways — Mercator, Equirectangular, Mollweide, Albers Conic and Azimuthal. Draw your own polygon and see how its shape and area stretch as you switch projection, with Tissot indicatrices exposing the distortion.', tags: ['Projections', 'Mercator / Mollweide', 'Conic & azimuthal', 'Tissot distortion', 'Conformal vs equal-area'], path: '?simulation=map-projections', kind: 'mapproj', status: 'Native React' },
  { title: 'Synthetic Aperture Radar', category: 'Radar', level: 'Advanced', description: 'See how a side-looking radar builds a sharp all-weather image: the swath geometry, range resolution from chirp pulse-compression (δR = c/2B), the synthesised aperture that gives azimuth resolution δaz = D/2, the Doppler history, plus imaging modes, polarimetry, geometric distortion, speckle and InSAR.', tags: ['SAR', 'Chirp / pulse compression', 'Synthetic aperture', 'Doppler / azimuth', 'InSAR & polarimetry'], path: '?simulation=sar', kind: 'sar', status: 'Native React' },
  { title: 'IoT Digital Twin', category: 'IoT', level: 'Intermediate', description: 'Run a live smart factory where three machines stream sensor telemetry through an edge gateway and MQTT broker into a cloud digital twin that mirrors them, detects anomalies, predicts remaining life and closes the loop with actuation. Inject faults and watch the twin drift out of sync when you starve it of data.', tags: ['Digital twin', 'IoT telemetry', 'Edge & MQTT', 'Anomaly & RUL', 'Closed-loop control'], path: '?simulation=iot-twin', kind: 'iot', status: 'Native React' },
  { title: 'Laser Beam Divergence & Footprint', category: 'LiDAR', level: 'Beginner', description: 'See in 3D how a LiDAR beam spreads at its divergence angle γ, so the ground footprint grows with flying height (d = d₀ + R·γ) and stretches into an ellipse off-nadir (a = d/cosθ). Watch the spot size, elongation, area and return energy change as you adjust height, divergence and scan angle.', tags: ['Beam divergence', 'Footprint size', 'Incidence angle', 'Slant range', 'Ground resolution'], path: '?simulation=beam-footprint', kind: 'beam', status: 'Native React' },
];

function Grid({ id, tint = 'rgba(255,255,255,.06)' }) {
  return (
    <g stroke={tint} strokeWidth="1">
      {Array.from({ length: 9 }, (_, i) => <line key={`h${id}${i}`} x1="0" y1={40 * i} x2="640" y2={40 * i} />)}
      {Array.from({ length: 17 }, (_, i) => <line key={`v${id}${i}`} x1={40 * i} y1="0" x2={40 * i} y2="360" />)}
    </g>
  );
}

function Thumbnail({ kind }) {
  if (kind === 'gnss') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="GNSS positioning with satellites and a rover">
      <defs><linearGradient id="bg-gn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a1a30" /><stop offset="1" stopColor="#14202a" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-gn)" /><Grid id="gn" tint="rgba(255,255,255,.05)" />
      <rect y="300" width="640" height="60" fill="#26313b" /><line x1="0" y1="300" x2="640" y2="300" stroke="#4a5b68" strokeWidth="2" />
      {/* satellites + signal rings + LOS to rover */}
      {[[120, 70, '#5ad1ff'], [300, 46, '#f6c85f'], [520, 90, '#7ee0c4'], [470, 150, '#ff9f6b']].map(([x, y, c], i) => (
        <g key={i}>
          <line x1={x} y1={y} x2="320" y2="300" stroke={c} strokeWidth="2" opacity=".5" />
          <circle cx={x} cy={y} r="20" fill="none" stroke={c} strokeWidth="2" opacity=".5" />
          <circle cx={x} cy={y} r="34" fill="none" stroke={c} strokeWidth="1.5" opacity=".25" />
          <rect x={x - 7} y={y - 5} width="14" height="10" fill="#dbe9f2" /><rect x={x - 19} y={y - 3} width="9" height="6" fill={c} /><rect x={x + 10} y={y - 3} width="9" height="6" fill={c} />
        </g>
      ))}
      {/* rover */}
      <line x1="320" y1="300" x2="320" y2="278" stroke="#4ade80" strokeWidth="3" /><circle cx="320" cy="276" r="4" fill="#4ade80" />
      <text x="320" y="330" fill="#4ade80" fontSize="15" fontFamily="system-ui" fontWeight="700" textAnchor="middle">ROVER</text>
      <text x="120" y="345" fill="#8fd0ff" fontSize="16" fontFamily="ui-monospace,monospace" fontWeight="600">ρ = c·Δt</text>
      <text x="500" y="345" fill="#7ee0c4" fontSize="16" fontFamily="ui-monospace,monospace" fontWeight="600">(N+φ)·λ</text>
    </svg>
  );
  if (kind === 'gsd') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Ground sampling distance: sensor pixels, lens and ground grid">
      <defs><linearGradient id="bg-gsd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d1c2b" /><stop offset="1" stopColor="#13303f" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-gsd)" /><Grid id="gsd" tint="rgba(255,255,255,.05)" />
      {/* sensor grid (top) */}
      <g transform="translate(276 44)"><rect width="88" height="60" fill="#274b6e" stroke="#9fc0e0" strokeWidth="1.5" />{[1, 2, 3].map((i) => <line key={`sv${i}`} x1={i * 22} y1="0" x2={i * 22} y2="60" stroke="#9fc0e0" strokeWidth="1" />)}{[1, 2].map((i) => <line key={`sh${i}`} x1="0" y1={i * 20} x2="88" y2={i * 20} stroke="#9fc0e0" strokeWidth="1" />)}<rect x="44" y="20" width="22" height="20" fill="#ffd85e" /></g>
      {/* lens */}
      <ellipse cx="320" cy="176" rx="46" ry="15" fill="none" stroke="#cfe0ef" strokeWidth="4" /><ellipse cx="320" cy="176" rx="30" ry="9" fill="#8fbfe0" opacity=".5" />
      {/* rays converging at lens */}
      <g stroke="#f6b74a" strokeWidth="1.6" opacity=".55">
        <path d="M120 300 L320 176 L298 60" /><path d="M247 300 L320 176 L320 60" /><path d="M393 300 L320 176 L342 104" /><path d="M520 300 L320 176 L364 60" />
      </g>
      <path d="M247 300 L320 176 L342 104" stroke="#ffd85e" strokeWidth="2.6" fill="none" />
      {/* ground grid (bottom) */}
      <g transform="translate(150 288)"><rect width="340" height="60" fill="rgba(120,210,150,.25)" stroke="#7ed99a" strokeWidth="2" />{[1, 2, 3, 4, 5].map((i) => <line key={`gv${i}`} x1={i * 56.7} y1="0" x2={i * 56.7} y2="60" stroke="#7ed99a" strokeWidth="1.3" />)}<line x1="0" y1="30" x2="340" y2="30" stroke="#7ed99a" strokeWidth="1.3" /><rect x="113" y="0" width="57" height="30" fill="#ffd85e" opacity=".85" /></g>
      <text x="30" y="200" fill="#cfe0ef" fontSize="16" fontFamily="ui-monospace,monospace" fontWeight="600">GSD = p·H / f</text>
    </svg>
  );
  if (kind === 'beam') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="LiDAR beam diverging to an elliptical ground footprint">
      <defs>
        <linearGradient id="bg-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c1a12" /><stop offset="1" stopColor="#0a1420" /></linearGradient>
        <linearGradient id="cone-beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(255,90,58,.5)" /><stop offset="1" stopColor="rgba(255,90,58,.12)" /></linearGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg-beam)" /><Grid id="beam" tint="rgba(255,255,255,.05)" />
      {/* ground */}
      <rect y="292" width="640" height="68" fill="#0e2018" /><line x1="0" y1="292" x2="640" y2="292" stroke="#2f5a3f" strokeWidth="2" />
      {/* sensor */}
      <g transform="translate(250 58)"><rect x="-26" y="-13" width="52" height="26" rx="5" fill="#e8eff5" /><rect x="-10" y="13" width="20" height="8" fill="#3a4a5a" /></g>
      {/* nadir dashed */}
      <line x1="250" y1="58" x2="250" y2="292" stroke="#8fb0c8" strokeWidth="1.5" strokedasharray="6 5" opacity=".6" />
      {/* diverging tilted cone → ellipse */}
      <polygon points="250,64 452,292 372,292" fill="url(#cone-beam)" stroke="#ff7a4a" strokeWidth="2" />
      <ellipse cx="412" cy="292" rx="44" ry="12" fill="rgba(255,106,74,.45)" stroke="#ffd85e" strokeWidth="2.5" />
      {/* nadir spot */}
      <ellipse cx="250" cy="292" rx="16" ry="5" fill="none" stroke="#5ad1ff" strokeWidth="2" />
      {/* angle arc */}
      <path d="M250 120 A62 62 0 0 1 285 172" fill="none" stroke="#ffd8a0" strokeWidth="2" />
      <text x="270" y="150" fill="#ffd8a0" fontSize="15" fontFamily="system-ui" fontWeight="700">θ</text>
      <text x="150" y="180" fill="#bfe3c9" fontSize="15" fontFamily="ui-monospace,monospace" fontWeight="600">H</text>
      <text x="470" y="330" fill="#ffb0a0" fontSize="14" fontFamily="system-ui" fontWeight="600">elliptical footprint</text>
      <text x="26" y="30" fill="#cfe0d6" fontSize="17" fontFamily="ui-monospace,monospace" fontWeight="600">d = d₀ + R·γ</text>
    </svg>
  );
  if (kind === 'iot') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="IoT digital twin: machines streaming telemetry to a cloud twin">
      <defs><linearGradient id="bg-iot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c1826" /><stop offset="1" stopColor="#0a1420" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-iot)" /><Grid id="iot" tint="rgba(255,255,255,.05)" />
      {/* physical machines (left) */}
      <g>{[90, 190, 290].map((y, i) => (
        <g key={i}>
          <rect x="40" y={y - 22} width="70" height="44" rx="7" fill="#1b2b3c" stroke="#37506a" strokeWidth="2" />
          <circle cx="54" cy={y - 10} r="4" fill={i === 1 ? '#e0503b' : '#39c07a'} />
          <circle cx="98" cy={y - 12} r="4.5" fill="#5ad1ff" />
          <line x1="110" y1={y} x2="300" y2="180" stroke="rgba(90,209,255,.3)" strokeWidth="1.5" />
        </g>
      ))}</g>
      <text x="75" y="330" fill="#8fd0ff" fontSize="13" fontFamily="system-ui" fontWeight="700" textAnchor="middle">physical</text>
      {/* telemetry packets */}
      <g fill="#5ad1ff">{[[150, 120], [230, 150], [310, 178], [390, 176]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" />)}</g>
      {/* broker */}
      <g transform="translate(300 180)"><circle r="26" fill="rgba(201,179,255,.12)" stroke="#c9b3ff" strokeWidth="2" /><text y="6" fill="#c9b3ff" fontSize="22" textAnchor="middle">☁</text></g>
      {/* twin (right) */}
      <g transform="translate(470 180)">
        <rect x="0" y="-70" width="150" height="140" rx="12" fill="rgba(120,150,200,.10)" stroke="#4a6b8f" strokeWidth="2" />
        <rect x="8" y="-62" width="134" height="124" rx="8" fill="none" stroke="rgba(143,208,255,.25)" strokeWidth="1" strokeDasharray="3 3" />
        <text x="16" y="-44" fill="#bcd3e6" fontSize="12" fontFamily="system-ui" fontWeight="700">⌘ DIGITAL TWIN</text>
        <text x="16" y="-8" fill="#ff8f6b" fontSize="30" fontFamily="ui-monospace,monospace" fontWeight="700">82.4</text>
        <text x="92" y="-8" fill="#8fa9c0" fontSize="13" fontFamily="system-ui">°C</text>
        <text x="16" y="16" fill="#ffca5f" fontSize="13" fontFamily="ui-monospace,monospace">vib 9.1</text>
        <rect x="16" y="30" width="118" height="8" rx="3" fill="rgba(255,255,255,.1)" /><rect x="16" y="30" width="42" height="8" rx="3" fill="#e0503b" />
        <text x="16" y="56" fill="#e0503b" fontSize="12" fontFamily="system-ui" fontWeight="600">⚠ anomaly · RUL 210h</text>
      </g>
      {/* actuation return */}
      <path d="M470 250 Q300 300 110 250" fill="none" stroke="#ffb703" strokeWidth="2.5" strokeDasharray="7 6" />
      <text x="300" y="300" fill="#ffca5f" fontSize="13" fontFamily="system-ui" fontWeight="600" textAnchor="middle">actuation command</text>
    </svg>
  );
  if (kind === 'sar') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Synthetic aperture radar: a satellite side-looking at a ground swath">
      <defs><linearGradient id="bg-sar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0b1622" /><stop offset="1" stopColor="#0e1c2b" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-sar)" /><Grid id="sar" tint="rgba(255,255,255,.05)" />
      {/* ground + swath */}
      <rect y="300" width="640" height="60" fill="#26333f" /><line x1="0" y1="300" x2="640" y2="300" stroke="#5c7488" strokeWidth="2" />
      <polygon points="120,70 300,300 470,300" fill="rgba(90,209,255,.16)" stroke="#5ad1ff" strokeWidth="2" />
      {/* satellite + flight arrow */}
      <g transform="translate(120 70)"><rect x="-24" y="-13" width="48" height="26" rx="6" fill="#e8eff5" /><rect x="-36" y="-4" width="10" height="8" fill="#5ad1ff" /><rect x="26" y="-4" width="10" height="8" fill="#5ad1ff" /></g>
      <line x1="120" y1="40" x2="200" y2="40" stroke="#9be3b0" strokeWidth="3" /><path d="M196 34 L206 40 L196 46" fill="none" stroke="#9be3b0" strokeWidth="3" />
      <text x="210" y="40" fill="#9be3b0" fontSize="15" fontFamily="system-ui" fontWeight="600">azimuth</text>
      {/* slant range */}
      <line x1="120" y1="70" x2="385" y2="300" stroke="#ffb703" strokeWidth="3" />
      {/* swath bracket */}
      <line x1="300" y1="316" x2="470" y2="316" stroke="#ffd27a" strokeWidth="3" />
      <text x="385" y="336" fill="#ffd27a" fontSize="15" fontFamily="system-ui" fontWeight="600" textAnchor="middle">swath</text>
      {/* chirp */}
      <path d="M410 120 q8 -20 16 0 q7 18 14 0 q6 -16 12 0 q5 15 10 0 q4 -13 8 0 q4 12 7 0 q3 -10 6 0" fill="none" stroke="#5ad1ff" strokeWidth="2.5" transform="translate(60,0)" />
      <text x="500" y="150" fill="#8fe3ff" fontSize="15" fontFamily="ui-monospace,monospace" fontWeight="600" textAnchor="middle">chirp</text>
      <text x="30" y="30" fill="#bcd3e6" fontSize="17" fontFamily="ui-monospace,monospace" fontWeight="600">δaz = D/2 · δR = c/2B</text>
    </svg>
  );
  if (kind === 'mapproj') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="A 3D globe unwrapping into a flat world map">
      <defs><linearGradient id="bg-mp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#07101b" /><stop offset="1" stopColor="#0b1a2b" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-mp)" /><Grid id="mp" tint="rgba(255,255,255,.05)" />
      {/* globe */}
      <g transform="translate(168 180)">
        <circle r="96" fill="rgba(20,80,138,.5)" stroke="#7fb0dd" strokeWidth="2" />
        {[-60, -30, 0, 30, 60].map((la, i) => { const ry = 96 * Math.cos(la * Math.PI / 180); const cy = 96 * Math.sin(la * Math.PI / 180); return <ellipse key={i} cx="0" cy={-cy} rx="96" ry={Math.max(ry * 0.28, 3)} fill="none" stroke="#9fc4e6" strokeWidth="1.3" opacity=".6" />; })}
        {[-60, -20, 20, 60].map((lo, i) => <ellipse key={`m${i}`} cx="0" cy="0" rx={Math.max(96 * Math.abs(Math.sin(lo * Math.PI / 180)), 4)} ry="96" fill="none" stroke="#9fc4e6" strokeWidth="1.3" opacity=".5" />)}
        <ellipse cx="0" cy="-14" rx="34" ry="26" fill="none" stroke="#35d07f" strokeWidth="3" />
      </g>
      {/* arrow */}
      <g stroke="#f6c85f" strokeWidth="5" fill="none"><path d="M296 180 H344" /><path d="M334 168 L348 180 L334 192" /></g>
      {/* flat map with Tissot ellipses */}
      <g transform="translate(390 96)">
        <rect width="216" height="168" rx="4" fill="rgba(20,80,138,.28)" stroke="#7fb0dd" strokeWidth="2" />
        {[36, 84, 132, 180].map((x) => <line key={`v${x}`} x1={x} y1="0" x2={x} y2="168" stroke="#9fc4e6" strokeWidth="1" opacity=".5" />)}
        {[42, 84, 126].map((y) => <line key={`h${y}`} x1="0" y1={y} x2="216" y2={y} stroke="#9fc4e6" strokeWidth="1" opacity=".5" />)}
        {[42, 84, 126].map((y, r) => [36, 108, 180].map((x, c) => { const k = 1 + Math.abs(y - 84) / 48; return <ellipse key={`t${r}-${c}`} cx={x} cy={y} rx={7} ry={7 * k} fill="none" stroke="#ffb703" strokeWidth="2" />; }))}
        <path d="M70 40 H150 V96 H70 Z" fill="none" stroke="#35d07f" strokeWidth="3" />
      </g>
      <text x="320" y="336" fill="#bcd3e6" fontSize="16" fontFamily="system-ui" fontWeight="600" textAnchor="middle">globe → flat map · every projection stretches differently</text>
    </svg>
  );
  if (kind === 'snell') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Snell's law: a ray refracting across an interface into glass">
      <defs><linearGradient id="bg-sn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0d1c2b" /><stop offset="1" stopColor="#123047" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-sn)" /><Grid id="sn" tint="rgba(255,255,255,.05)" />
      {/* two media + interface */}
      <rect y="188" width="640" height="172" fill="rgba(90,150,210,.22)" />
      <line x1="0" y1="188" x2="640" y2="188" stroke="#dbe9f2" strokeWidth="3" />
      {/* normal */}
      <line x1="320" y1="44" x2="320" y2="332" stroke="rgba(219,233,242,.45)" strokeWidth="2" strokeDasharray="7 6" />
      {/* incident, reflected, refracted */}
      <line x1="150" y1="70" x2="320" y2="188" stroke="#5ad1ff" strokeWidth="4" />
      <line x1="320" y1="188" x2="470" y2="92" stroke="rgba(90,209,255,.35)" strokeWidth="2.5" />
      <line x1="320" y1="188" x2="430" y2="330" stroke="#ffb703" strokeWidth="4" />
      <circle cx="320" cy="188" r="5" fill="#fff" />
      {/* angle arcs */}
      <path d="M320 154 A34 34 0 0 0 296 168" fill="none" stroke="#5ad1ff" strokeWidth="2.5" />
      <path d="M320 222 A34 34 0 0 0 340 216" fill="none" stroke="#ffb703" strokeWidth="2.5" />
      <text x="256" y="150" fill="#8fe3ff" fontSize="18" fontFamily="system-ui" fontWeight="700">θ₁</text>
      <text x="356" y="238" fill="#ffca5f" fontSize="18" fontFamily="system-ui" fontWeight="700">θ₂</text>
      <text x="16" y="176" fill="#bcd3e6" fontSize="15" fontFamily="ui-monospace,monospace">n₁</text>
      <text x="16" y="214" fill="#bcd3e6" fontSize="15" fontFamily="ui-monospace,monospace">n₂</text>
      <text x="470" y="345" fill="#cfe0ef" fontSize="17" fontFamily="ui-monospace,monospace" fontWeight="600">n₁sinθ₁ = n₂sinθ₂</text>
    </svg>
  );
  if (kind === 'lod') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Building levels of detail from a footprint to a detailed house">
      <defs><linearGradient id="bg-lod" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f2233" /><stop offset="1" stopColor="#12303f" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-lod)" /><Grid id="lod" tint="rgba(255,255,255,.05)" />
      <g transform="translate(78 250)"><polygon points="-46,10 24,-14 66,4 -4,28" fill="#4aa8e0" opacity=".85" /><text x="10" y="58" fill="#8fd0ff" fontSize="15" fontFamily="system-ui" fontWeight="700" textAnchor="middle">LOD0</text></g>
      <g transform="translate(228 235)"><polygon points="-40,20 20,-2 20,-52 -40,-30" fill="#4aa8e0" /><polygon points="20,-2 58,12 58,-38 20,-52" fill="#3d8ec6" /><polygon points="-40,-30 20,-52 58,-38 -2,-58" fill="#67b6e8" /><text x="6" y="66" fill="#8fd0ff" fontSize="15" fontFamily="system-ui" fontWeight="700" textAnchor="middle">LOD1</text></g>
      <g transform="translate(398 235)"><polygon points="-40,22 18,2 18,-36 -40,-16" fill="#d9dde3" /><polygon points="18,2 56,16 56,-22 18,-36" fill="#b9c0c8" /><polygon points="-40,-16 -8,-54 46,-38 56,-22 18,-36 0,-58" fill="#cc3a2f" /><polygon points="-40,-16 0,-58 -8,-54" fill="#a5332a" /><text x="8" y="70" fill="#f6b7ae" fontSize="15" fontFamily="system-ui" fontWeight="700" textAnchor="middle">LOD2</text></g>
      <g transform="translate(556 235)"><polygon points="-40,22 18,2 18,-36 -40,-16" fill="#d9dde3" /><polygon points="18,2 56,16 56,-22 18,-36" fill="#b9c0c8" /><polygon points="-40,-16 -8,-54 46,-38 56,-22 18,-36 0,-58" fill="#cc3a2f" /><g fill="#3f6fa8"><rect x="-32" y="-6" width="9" height="12" /><rect x="-17" y="-9" width="9" height="12" /><rect x="-1" y="-12" width="9" height="12" /><rect x="30" y="-12" width="8" height="10" /><rect x="43" y="-8" width="8" height="10" /></g><rect x="-24" y="8" width="9" height="14" fill="#6b4a2e" /><text x="8" y="70" fill="#f6b7ae" fontSize="15" fontFamily="system-ui" fontWeight="700" textAnchor="middle">LOD3</text></g>
      <text x="320" y="34" fill="#cfe0ef" fontSize="17" fontFamily="system-ui" fontWeight="600" textAnchor="middle">One building · 16 Levels of Detail</text>
    </svg>
  );
  if (kind === 'gpr') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Ground-penetrating radar radargram with a hyperbola">
      <defs><linearGradient id="bg-gpr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0e1a27" /><stop offset="1" stopColor="#241a12" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-gpr)" />
      {/* surface + soil */}
      <rect y="96" width="640" height="264" fill="#2e2116" /><line x1="0" y1="96" x2="640" y2="96" stroke="#c9a06a" strokeWidth="3" />
      {/* antenna sweeping */}
      <g>{[120, 200, 280, 360, 440].map((x, i) => <rect key={i} x={x - 14} y="72" width="28" height="14" rx="2" fill={i === 2 ? '#f6c85f' : 'rgba(246,200,95,.4)'} />)}</g>
      {/* buried object + rays */}
      <circle cx="280" cy="250" r="14" fill="#8b6b4a" stroke="#d7b98c" strokeWidth="2" />
      <line x1="280" y1="86" x2="280" y2="236" stroke="#f6c85f" strokeWidth="2.5" />
      <line x1="200" y1="86" x2="280" y2="250" stroke="rgba(246,200,95,.6)" strokeWidth="2" />
      <line x1="360" y1="86" x2="280" y2="250" stroke="rgba(126,224,196,.7)" strokeWidth="2" />
      {/* hyperbola */}
      <path d="M120 300 Q280 150 440 300" fill="none" stroke="#38bdf8" strokeWidth="5" />
      <circle cx="280" cy="196" r="6" fill="#38bdf8" />
      <text x="300" y="188" fill="#8fd0ff" fontSize="17" fontFamily="system-ui" fontWeight="700">apex → depth</text>
      <text x="16" y="30" fill="#8fd0ff" fontSize="18" fontFamily="ui-monospace,monospace" fontWeight="600">t = 2R / v</text>
      <text x="470" y="345" fill="#f6c85f" fontSize="16" fontFamily="ui-monospace,monospace" fontWeight="600">d = v·t₀/2</text>
    </svg>
  );
  if (kind === 'boresight') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Boresight and lever-arm sensor integration">
      <defs><linearGradient id="bg-bor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c1a29" /><stop offset="1" stopColor="#122f47" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-bor)" /><Grid id="bor" tint="rgba(255,255,255,.05)" />
      {/* payload box */}
      <g stroke="#1e1a0a" strokeWidth="2">
        <polygon points="250,250 250,300 350,320 350,270" fill="#b58f3f" />
        <polygon points="250,250 350,270 430,240 330,222" fill="#d6c446" />
        <polygon points="350,270 350,320 430,290 430,240" fill="#c7ad3c" />
      </g>
      {/* IMU frame at box */}
      <g strokeWidth="3"><line x1="300" y1="272" x2="356" y2="272" stroke="#e6463b" /><line x1="300" y1="272" x2="330" y2="248" stroke="#2ea05a" /><line x1="300" y1="272" x2="300" y2="220" stroke="#3c82f6" /></g>
      <circle cx="300" cy="272" r="5" fill="#e8eff5" />
      {/* GPS antenna + lever arm */}
      <line x1="300" y1="272" x2="150" y2="96" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="8 6" />
      <ellipse cx="150" cy="92" rx="30" ry="11" fill="none" stroke="#f59e0b" strokeWidth="3" /><circle cx="150" cy="92" r="4" fill="#f59e0b" />
      {/* camera lever arm + tilted frame */}
      <line x1="300" y1="272" x2="470" y2="210" stroke="#a78bfa" strokeWidth="2.5" strokeDasharray="8 6" />
      <g strokeWidth="3" transform="rotate(12 470 210)"><line x1="470" y1="210" x2="516" y2="210" stroke="#e6463b" /><line x1="470" y1="210" x2="470" y2="166" stroke="#3c82f6" /></g>
      <circle cx="470" cy="210" r="4" fill="#a78bfa" />
      {/* laser ray to ground with boresight error */}
      <line x1="356" y1="286" x2="356" y2="340" stroke="#7ee0c4" strokeWidth="2" strokeDasharray="5 5" />
      <line x1="356" y1="286" x2="420" y2="342" stroke="#ff6a5a" strokeWidth="3" />
      <line x1="356" y1="342" x2="420" y2="342" stroke="#f6c85f" strokeWidth="3" />
      <text x="300" y="150" fill="#cfe0ef" fontSize="17" fontFamily="system-ui" fontWeight="600" transform="rotate(-32 300 150)">lever arm</text>
      <text x="470" y="330" fill="#f6c85f" fontSize="15" fontFamily="system-ui" fontWeight="600" textAnchor="middle">boresight error</text>
    </svg>
  );
  if (kind === 'block') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Bundle Block Adjustment simulation">
      <defs><linearGradient id="bg-blk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#09121d" /><stop offset="1" stopColor="#0e2a3f" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-blk)" /><Grid id="blk" tint="rgba(255,255,255,.05)" />
      {/* Flight lines */}
      <line x1="100" y1="110" x2="540" y2="110" stroke="#38bdf8" strokeWidth="3" strokeDasharray="8 6" />
      <line x1="100" y1="210" x2="540" y2="210" stroke="#38bdf8" strokeWidth="3" strokeDasharray="8 6" />
      {/* Overlap Zone Heatmap */}
      <rect x="180" y="80" width="280" height="160" fill="rgba(16,185,129,.2)" stroke="#10b981" strokeWidth="2" strokeDasharray="6 4" />
      {/* Cameras */}
      <g fill="#38bdf8" stroke="#ffffff" strokeWidth="2">
        <circle cx="160" cy="110" r="8" /><circle cx="320" cy="110" r="8" /><circle cx="480" cy="110" r="8" />
        <circle cx="160" cy="210" r="8" /><circle cx="320" cy="210" r="8" /><circle cx="480" cy="210" r="8" />
      </g>
      {/* Rays to GCPs */}
      <g stroke="rgba(245,158,11,.6)" strokeWidth="2">
        <line x1="160" y1="110" x2="220" y2="290" /><line x1="320" y1="110" x2="220" y2="290" />
        <line x1="320" y1="110" x2="420" y2="290" /><line x1="480" y1="110" x2="420" y2="290" />
      </g>
      {/* GCP Markers */}
      <g fill="#f59e0b" stroke="#ffffff" strokeWidth="2">
        <circle cx="220" cy="290" r="9" /><circle cx="420" cy="290" r="9" />
      </g>
      {/* Tie Points */}
      <g fill="#34d399">
        <circle cx="280" cy="160" r="5" /><circle cx="360" cy="160" r="5" /><circle cx="320" cy="180" r="5" />
      </g>
      <text x="320" y="340" fill="#38bdf8" fontSize="16" fontFamily="system-ui" fontWeight="600" textAnchor="middle">Bundle Block Adjustment (r = N_obs - N_unk)</text>
    </svg>
  );
  if (kind === 'tin') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Adaptive TIN ground classification">
      <defs><linearGradient id="bg-tin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#081826" /><stop offset="1" stopColor="#0e2a3f" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-tin)" /><Grid id="tin" tint="rgba(255,255,255,.05)" />
      {/* TIN Mesh Facets */}
      <g fill="rgba(16,185,129,.14)" stroke="#34d399" strokeWidth="2">
        <polygon points="120,280 240,220 340,290" />
        <polygon points="240,220 340,290 460,210" />
        <polygon points="340,290 460,210 540,280" />
        <polygon points="240,220 460,210 320,130" />
        <polygon points="120,280 240,220 180,160" />
        <polygon points="180,160 240,220 320,130" />
      </g>
      {/* Off-terrain building box & non-ground points */}
      <g fill="rgba(239,68,68,.2)" stroke="#ef4444" strokeWidth="2.5">
        <polygon points="360,150 440,150 460,110 380,110" />
        <line x1="360" y1="150" x2="360" y2="190" stroke="#ef4444" strokeWidth="2" />
        <line x1="440" y1="150" x2="440" y2="190" stroke="#ef4444" strokeWidth="2" />
      </g>
      <g fill="#ef4444">
        <circle cx="360" cy="110" r="5" /><circle cx="440" cy="110" r="5" /><circle cx="460" cy="110" r="5" /><circle cx="380" cy="110" r="5" />
        <circle cx="210" cy="110" r="5.5" /><circle cx="200" cy="90" r="5" /><circle cx="225" cy="80" r="6" />
      </g>
      {/* Ground TIN Seed Points */}
      <g fill="#10b981">
        <circle cx="120" cy="280" r="6" /><circle cx="240" cy="220" r="6" /><circle cx="340" cy="290" r="6" />
        <circle cx="460" cy="210" r="6" /><circle cx="540" cy="280" r="6" /><circle cx="320" cy="130" r="6" />
        <circle cx="180" cy="160" r="6" />
      </g>
      <g fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5">
        <circle cx="120" cy="280" r="4" /><circle cx="540" cy="280" r="4" /><circle cx="320" cy="130" r="4" />
      </g>
      <text x="320" y="335" fill="#a7f3d0" fontSize="17" fontFamily="system-ui" fontWeight="600" textAnchor="middle">Adaptive TIN Ground Filter</text>
    </svg>
  );
  if (kind === 'ranging') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="LiDAR ranging by time of flight">
      <defs><linearGradient id="bg-rng" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a2740" /><stop offset="1" stopColor="#123a5c" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-rng)" /><Grid id="rng" />
      <g transform="translate(96 150)"><rect x="-40" y="-26" width="70" height="52" rx="9" fill="#e8eff5" stroke="#0b2434" strokeWidth="5" /><circle cx="24" cy="0" r="12" fill="#5ad1ff" /></g>
      <rect x="470" y="104" width="22" height="120" rx="4" fill="#5b6b7a" stroke="#dbe9f2" strokeWidth="3" />
      <line x1="132" y1="150" x2="470" y2="150" stroke="#5ad1ff" strokeWidth="3" strokeDasharray="10 9" opacity=".55" />
      <g><circle cx="320" cy="150" r="11" fill="#5ad1ff" /><circle cx="320" cy="150" r="24" fill="none" stroke="#5ad1ff" strokeWidth="3" opacity=".5" /></g>
      <path d="M120 300 q34 -70 68 0" fill="none" stroke="#5ad1ff" strokeWidth="5" /><path d="M300 300 q34 -70 68 0" fill="none" stroke="#ffae4d" strokeWidth="5" />
      <g stroke="#f6c85f" strokeWidth="2.5"><line x1="154" y1="286" x2="334" y2="286" /><line x1="154" y1="280" x2="154" y2="292" /><line x1="334" y1="280" x2="334" y2="292" /></g>
      <text x="244" y="274" fill="#f6c85f" fontSize="20" fontFamily="system-ui" fontWeight="600" textAnchor="middle">Δt</text>
      <text x="470" y="330" fill="#bcd3e6" fontSize="19" fontFamily="system-ui" fontWeight="600" textAnchor="middle">R = c·t / 2</text>
    </svg>
  );
  if (kind === 'scanning') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="LiDAR scan pattern">
      <defs><linearGradient id="bg-scan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c2733" /><stop offset="1" stopColor="#123a4a" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-scan)" /><Grid id="scan" />
      <g transform="translate(320 64)"><rect x="-46" y="-22" width="92" height="44" rx="10" fill="#eef7f7" stroke="#102b3a" strokeWidth="5" /><circle cx="0" cy="24" r="11" fill="#f28d45" /></g>
      <g stroke="#66e2c4" strokeWidth="4" opacity=".7"><path d="M320 96 L110 300" /><path d="M320 96 L200 320" /><path d="M320 96 L300 330" /><path d="M320 96 L400 330" /><path d="M320 96 L500 320" /><path d="M320 96 L560 300" /></g>
      <g fill="#f6c85f">{Array.from({ length: 26 }, (_, i) => <circle key={i} cx={95 + ((i * 71) % 460)} cy={250 + ((i * 47) % 80)} r="4.5" />)}</g>
    </svg>
  );
  if (kind === 'interaction') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Laser beam interacting with a surface">
      <defs><linearGradient id="bg-int" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#241a2e" /><stop offset="1" stopColor="#3a2430" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-int)" /><Grid id="int" tint="rgba(255,255,255,.05)" />
      <rect y="250" width="640" height="110" fill="#4a3a44" /><line x1="0" y1="250" x2="640" y2="250" stroke="#caa9bd" strokeWidth="4" />
      <path d="M150 60 L320 250" stroke="#ff6a5a" strokeWidth="8" /><circle cx="320" cy="250" r="30" fill="#ff6a5a" opacity=".22" />
      <g stroke="#55c8e8" strokeWidth="4" opacity=".9"><path d="M320 250 L470 90" /><path d="M320 250 L400 74" /></g>
      <path d="M320 250 L330 340" stroke="#c8d64a" strokeWidth="6" /><path d="M320 250 L250 336" stroke="#c8d64a" strokeWidth="5" opacity=".8" />
      <g><rect x="500" y="120" width="18" height="120" rx="4" fill="#2a2130" stroke="#7d6b78" strokeWidth="2" /><rect x="500" y="180" width="18" height="60" rx="4" fill="#55c8e8" /></g>
    </svg>
  );
  if (kind === 'survey') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Drone survey flight plan over terrain">
      <defs><linearGradient id="bg-sur" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f2f2a" /><stop offset="1" stopColor="#14453a" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-sur)" /><Grid id="sur" tint="rgba(255,255,255,.05)" />
      <rect x="150" y="96" width="340" height="200" rx="10" fill="#2ec6a8" opacity=".12" stroke="#2ec6a8" strokeWidth="3" strokeDasharray="10 8" />
      <path d="M180 120 H460 M460 156 H180 M180 192 H460 M460 228 H180 M180 264 H460" fill="none" stroke="#8ff0d6" strokeWidth="4" opacity=".85" />
      <path d="M460 120 V156 M180 156 V192 M460 192 V228 M180 228 V264" fill="none" stroke="#8ff0d6" strokeWidth="4" opacity=".85" />
      <g transform="translate(320 60)" fill="#eafaf5" stroke="#0d2b24" strokeWidth="4"><rect x="-26" y="-9" width="52" height="18" rx="6" /><path d="M-40 -16 H-16 M16 -16 H40 M-40 16 H-16 M16 16 H40" fill="none" /><circle cy="14" r="6" fill="#f28d45" /></g>
      <circle cx="470" cy="110" r="15" fill="#ffd23f" /><path d="M470 110 l0 -22 M470 110 l16 8" stroke="#0f2f2a" strokeWidth="3" />
    </svg>
  );
  if (kind === 'triangulation') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Aerial triangulation image block">
      <defs><linearGradient id="bg-tri" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#17213f" /><stop offset="1" stopColor="#22305c" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-tri)" /><Grid id="tri" tint="rgba(255,255,255,.05)" />
      <g fill="rgba(231,241,243,.14)" stroke="#8fb8ff" strokeWidth="5"><rect x="78" y="66" width="150" height="108" rx="9" transform="rotate(-10 153 120)" /><rect x="246" y="44" width="150" height="108" rx="9" transform="rotate(4 321 98)" /><rect x="418" y="76" width="150" height="108" rx="9" transform="rotate(14 493 130)" /></g>
      <g fill="#f6c85f"><circle cx="153" cy="120" r="7" /><circle cx="321" cy="98" r="7" /><circle cx="493" cy="130" r="7" /><circle cx="250" cy="270" r="7" /><circle cx="380" cy="238" r="7" /><circle cx="470" cy="258" r="7" /></g>
      <g stroke="#f6c85f" strokeWidth="2.5" strokeDasharray="8 7" opacity=".85"><path d="M153 120 L250 270 M321 98 L250 270 M321 98 L380 238 M493 130 L380 238 M493 130 L470 258" /></g>
    </svg>
  );
  if (kind === 'sfm') return (
    <svg viewBox="0 0 640 360" role="img" aria-label="Structure from motion — cameras around a reconstructed object">
      <defs><linearGradient id="bg-sfm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0e2033" /><stop offset="1" stopColor="#123a3a" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-sfm)" /><Grid id="sfm" tint="rgba(255,255,255,.05)" />
      <g fill="rgba(126,211,33,.12)" stroke="#7ed321" strokeWidth="3"><path d="M250 250 L390 250 L400 178 L240 178 Z" /><path d="M240 178 L240 120 L320 82 L400 120 L400 178 Z" /></g>
      <g fill="#7ed321">{[[240, 178], [400, 178], [250, 250], [390, 250], [320, 82], [240, 120], [400, 120]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" />)}</g>
      <g fill="rgba(245,166,35,.2)" stroke="#f5a623" strokeWidth="3"><path d="M96 96 l30 -14 l0 30 l-30 14 Z" /><path d="M150 60 l30 -10 l0 28 l-30 10 Z" /></g>
      <g fill="rgba(46,198,168,.18)" stroke="#2ec6a8" strokeWidth="3">{[[300, 40], [430, 52], [540, 100], [96, 220]].map(([x, y], i) => <path key={i} d={`M${x} ${y} l28 -10 l0 26 l-28 10 Z`} />)}</g>
      <g stroke="rgba(46,198,168,.5)" strokeWidth="1.5" strokeDasharray="5 5"><line x1="125" y1="96" x2="300" y2="180" /><line x1="314" y1="52" x2="320" y2="130" /><line x1="540" y1="120" x2="400" y2="178" /></g>
    </svg>
  );
  return (
    <svg viewBox="0 0 640 360" role="img" aria-label="True orthophoto rectification">
      <defs><linearGradient id="bg-ort" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1c2530" /><stop offset="1" stopColor="#2a3947" /></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bg-ort)" /><Grid id="ort" tint="rgba(255,255,255,.05)" />
      <rect x="44" y="60" width="230" height="230" rx="12" fill="rgba(255,255,255,.04)" stroke="#6f8496" strokeWidth="3" />
      <rect x="366" y="60" width="230" height="230" rx="12" fill="rgba(255,255,255,.04)" stroke="#6f8496" strokeWidth="3" />
      <g fill="#d98a5f" stroke="#f6d3b4" strokeWidth="3"><path d="M96 250 L168 250 L214 186 L142 186 Z" /><path d="M168 250 L168 186 L214 122 L214 186 Z" /></g>
      <rect x="446" y="176" width="74" height="74" fill="#d98a5f" stroke="#f6d3b4" strokeWidth="3" />
      <g stroke="#f6c85f" strokeWidth="5" fill="none"><path d="M290 175 H350" /><path d="M340 163 L354 175 L340 187" /></g>
      <text x="159" y="322" fill="#c6d6e2" fontSize="18" fontFamily="system-ui" textAnchor="middle">perspective</text>
      <text x="481" y="322" fill="#c6d6e2" fontSize="18" fontFamily="system-ui" textAnchor="middle">true ortho</text>
    </svg>
  );
}

function SimulatorCard({ simulator }) {
  return (
    <a className="card" href={simulator.path}>
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
          <p className="eyebrow">&#9650; Learn by doing</p>
          <h1>Understand surveying &amp; remote sensing through <em>interactive simulators</em>.</h1>
          <p className="lead">Hands-on, browser-based lessons in LiDAR, photogrammetry and flight planning. Adjust the inputs, watch the geometry respond, and build real intuition — nothing to install and no sign-up.</p>
          <div className="stats">
            <div className="stat"><b>{simulators.length}</b><span>simulators</span></div>
            <div className="stat"><b>3</b><span>topic areas</span></div>
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

export default function App() {
  const simulation = new URLSearchParams(window.location.search).get('simulation');
  if (simulation === 'ortho') return <OrthoRectification />;
  if (simulation === 'sfm') return <StructureFromMotion />;
  if (simulation === 'lidar-ranging') return <LidarRanging />;
  if (simulation === 'adaptive-tin') return <AdaptiveTIN />;
  if (simulation === 'block-adjustment') return <BlockAdjustment />;
  if (simulation === 'boresight') return <Boresight />;
  if (simulation === 'gnss') return <Gnss />;
  if (simulation === 'gpr') return <Gpr />;
  if (simulation === 'building-lod') return <BuildingLod />;
  if (simulation === 'gsd') return <Gsd />;
  if (simulation === 'snell') return <Snell />;
  if (simulation === 'map-projections') return <MapProjections />;
  if (simulation === 'sar') return <SarImaging />;
  if (simulation === 'iot-twin') return <IotDigitalTwin />;
  if (simulation === 'beam-footprint') return <BeamFootprint />;
  return <Landing />;
}
