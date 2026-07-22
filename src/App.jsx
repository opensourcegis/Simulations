const simulators = [
  {
    title: 'Survey Mission Designer',
    description: 'Plan a drone survey over terrain, place control points and obstructions, and explore the trade-offs behind a robust flight plan.',
    tags: ['Flight planning', 'Terrain', 'Obstructions', 'Coverage'],
    path: 'games/survey-mission-designer/',
    tone: 'terrain',
    icon: '⌁',
  },
  {
    title: 'Aerial Triangulation',
    description: 'Build an image block, measure tie points, and see how bundle adjustment turns overlapping photographs into a connected survey.',
    tags: ['Image block', 'Tie points', 'Bundle adjustment'],
    path: 'games/aerial-triangulation/',
    tone: 'photogrammetry',
    icon: '＋',
  },
  {
    title: 'LiDAR Scan Patterns',
    description: 'Compare six real beam-steering mechanisms and watch their ground patterns build up as a drone moves across the map.',
    tags: ['Scan mechanisms', 'Point pattern', 'Coverage'],
    path: 'games/lidar-scanning/',
    tone: 'lidar',
    icon: '✦',
  },
  {
    title: 'Beam & Target Interaction',
    description: 'Follow a laser pulse through reflection, absorption, transmission, and scatter across different surfaces and targets.',
    tags: ['Energy balance', 'Signal strength', 'Multi-return'],
    path: 'games/lidar-interaction/',
    tone: 'signal',
    icon: '╱',
  },
  {
    title: 'True Ortho-Rectification',
    description: 'Probe relief displacement and project buildings onto a datum to understand how true orthophotos remove lean and occlusions.',
    tags: ['Relief displacement', 'DSM vs DTM', 'True ortho'],
    path: 'games/ortho-rectification/',
    tone: 'ortho',
    icon: '▣',
  },
];

function SimulatorCard({ simulator }) {
  return (
    <a className="card" href={simulator.path}>
      <div className={`thumb ${simulator.tone}`} aria-hidden="true">
        <span className="thumb-grid" />
        <span className="thumb-icon">{simulator.icon}</span>
        <span className="pill live">● Playable</span>
      </div>
      <div className="card-body">
        <h3>{simulator.title}</h3>
        <p>{simulator.description}</p>
        <div className="tags">
          {simulator.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
        </div>
        <span className="go">Open simulator <span className="arrow">→</span></span>
      </div>
    </a>
  );
}

export default function App() {
  return (
    <main className="wrap">
      <header className="hero">
        <p className="eyebrow">▲ NIGST · P&amp;RS Division</p>
        <h1><em>Simulation-based training</em> for surveyors.</h1>
        <p>
          Training simulators from the Photogrammetry &amp; Remote Sensing division,
          National Institute for Geo-informatics Science &amp; Technology (NIGST).
          Everything runs in the browser — nothing to install, no accounts, and
          your progress stays on your own device.
        </p>
      </header>

      <div className="section-head"><h2>Simulators</h2><span className="rule" /></div>
      <div className="grid">{simulators.map((simulator) => <SimulatorCard key={simulator.title} simulator={simulator} />)}</div>

      <footer>
        <span>P&amp;RS Division · NIGST — Survey of India.</span>
        <span className="spacer" />
        <a href="https://github.com/opensourcegis/Simulations">Source on GitHub →</a>
      </footer>
    </main>
  );
}
