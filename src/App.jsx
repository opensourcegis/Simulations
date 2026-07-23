import { useState } from 'react';
import OrthoRectification from './simulations/OrthoRectification.jsx';
import StructureFromMotion from './simulations/StructureFromMotion.jsx';
import LidarRanging from './simulations/LidarRanging.jsx';

const simulators = [
  { title: 'LiDAR Ranging', category: 'LiDAR', level: 'Beginner', description: 'Turn light into distance two ways: time a laser pulse’s round trip (R = c·t / 2), or read the phase shift of a continuous modulated wave — and see why phase is precise but ambiguous.', tags: ['Time of flight', 'Phase / CW', 'Ambiguity', 'Range resolution'], path: '?simulation=lidar-ranging', kind: 'ranging', status: 'Native React' },
  { title: 'LiDAR Scan Patterns', category: 'LiDAR', level: 'Beginner', description: 'Compare six real beam-steering mechanisms and watch their ground patterns build up as a drone moves across the map.', tags: ['Scan mechanisms', 'Point pattern', 'Coverage'], path: 'games/lidar-scanning/', kind: 'scanning' },
  { title: 'Beam & Target Interaction', category: 'LiDAR', level: 'Intermediate', description: 'Follow a laser pulse through reflection, absorption, transmission, and scatter across different surfaces and targets.', tags: ['Energy balance', 'Signal strength', 'Multi-return'], path: 'games/lidar-interaction/', kind: 'interaction' },
  { title: 'Survey Mission Designer', category: 'Flight planning', level: 'Beginner', description: 'Plan a drone survey over terrain, place control points and obstructions, and explore the trade-offs behind a robust flight plan.', tags: ['Flight planning', 'Terrain', 'Coverage'], path: 'games/survey-mission-designer/', kind: 'survey' },
  { title: 'Aerial Triangulation', category: 'Photogrammetry', level: 'Intermediate', description: 'Build an image block, measure tie points, and see how bundle adjustment turns overlapping photographs into a connected survey.', tags: ['Image block', 'Tie points', 'Bundle adjustment'], path: 'games/aerial-triangulation/', kind: 'triangulation' },
  { title: 'Structure from Motion', category: 'Photogrammetry', level: 'Advanced', description: 'Match the same corner of a 3D object across photographs and watch triangulation and resection recover each camera’s position and orientation.', tags: ['Feature matching', 'Camera pose', '3D reconstruction'], path: '?simulation=sfm', kind: 'sfm', status: 'Native React' },
  { title: 'True Ortho-Rectification', category: 'Photogrammetry', level: 'Intermediate', description: 'Probe relief displacement and project buildings onto a datum to understand how true orthophotos remove lean and occlusions.', tags: ['Relief displacement', 'DSM vs DTM', 'True ortho'], path: 'games/ortho-rectification/', kind: 'ortho', status: 'Original' },
  { title: 'True Ortho-Rectification — React', category: 'Photogrammetry', level: 'Intermediate', description: 'React migration workspace for the same rectification renderer, with the original interaction model preserved while the engine is split into React modules.', tags: ['React migration', 'Canvas engine', 'DSM vs DTM'], path: '?simulation=ortho', kind: 'ortho', status: 'React preview' },
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

const CATEGORIES = ['All', 'LiDAR', 'Photogrammetry', 'Flight planning'];

function Landing() {
  const [filter, setFilter] = useState('All');
  const shown = filter === 'All' ? simulators : simulators.filter((s) => s.category === filter);

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
          <div className="filters">
            {CATEGORIES.map((c) => <button key={c} className={`filter ${filter === c ? 'active' : ''}`} onClick={() => setFilter(c)}>{c}</button>)}
          </div>
        </div>

        <div className="grid">{shown.map((s) => <SimulatorCard key={s.title} simulator={s} />)}</div>

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
  return <Landing />;
}
