import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './boresight.css';
import LidarLearningPanel from './LidarLearningPanel.jsx';
import GeoreferencingExperiment from './GeoreferencingExperiment.jsx';
import { eulerAxes, boresightComparison } from '../../games/shared/lidar-physics.js';

// ---------------------------------------------------------------------------
// Small 3D helpers (vec3 + rotation), plus an orbit projector.
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => { const n = norm(a) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
const DEG = Math.PI / 180;

// Rotation matrix (world <- body) from roll(X) pitch(Y) yaw(Z), in degrees.
// Returned as three world-space column vectors [xAxis, yAxis, zAxis].
// --- Reference frames ------------------------------------------------------
// Site of the survey, used only to orient the ECEF triad realistically.
const LAT = 13 * DEG; const LON = 77.5 * DEG;
// Local navigation frame is NED (X=North, Y=East, Z=Down). Map an NED vector
// into scene coordinates (scene X=North/forward, +Y=left, +Z=up).
const navToScene = (v) => [v[0], -v[1], -v[2]];
// IMU = local nav frame: North, East, Nadir(down), expressed in scene axes.
const NAV_AXES = [navToScene([1, 0, 0]), navToScene([0, 1, 0]), navToScene([0, 0, 1])];
// LiDAR = nav frame rotated by the boresight roll/pitch/yaw.
const lidarAxes = (roll, pitch, yaw) => eulerAxes(roll, pitch, yaw).map(navToScene);
// Compose a body vector through a set of world-column axes.
const toWorld = (axes, v) => add(add(scale(axes[0], v[0]), scale(axes[1], v[1])), scale(axes[2], v[2]));
// Rigid-body rotation for the drone attitude the IMU records. `att` is the
// aircraft roll/pitch/yaw about the nav (NED) axes; this returns a function
// that rotates any scene-space (body) vector by that attitude. Identity at 0.
function makeAttitude(att) {
  const ned = eulerAxes(att[0], att[1], att[2]);
  return (v) => navToScene(toWorld(ned, navToScene(v)));
}
// GPS antenna triad = the ECEF axes. Compute each ECEF axis direction in NED
// at (lat,lon), then map into scene coordinates.
function ecefAxes(lat, lon) {
  const sf = Math.sin(lat); const cf = Math.cos(lat); const sl = Math.sin(lon); const cl = Math.cos(lon);
  const Xe = [-sf * cl, -sl, -cf * cl]; // ECEF X in NED
  const Ye = [-sf * sl, cl, -cf * sl]; // ECEF Y in NED
  const Ze = [cf, 0, -sf]; // ECEF Z in NED (spin axis)
  return [navToScene(Xe), navToScene(Ye), navToScene(Ze)];
}

const VIEW_W = 700; const VIEW_H = 560;
function makeProjector(orbit) {
  const center = [0, 0, -1.0];
  const ca = Math.cos(orbit.az); const sa = Math.sin(orbit.az);
  const ce = Math.cos(orbit.el); const se = Math.sin(orbit.el);
  const eye = [center[0] + orbit.dist * ce * sa, center[1] - orbit.dist * ce * ca, center[2] + orbit.dist * se];
  const fwd = normalize(sub(center, eye));
  let right = normalize(cross(fwd, [0, 0, 1])); if (!isFinite(right[0])) right = [1, 0, 0];
  const up = cross(right, fwd);
  const f = VIEW_W * 0.9;
  const proj = (P) => {
    const d = sub(P, eye); const x = dot(d, right); const y = dot(d, up); const z = dot(d, fwd);
    if (z <= 0.05) return null;
    return [VIEW_W / 2 + f * x / z, VIEW_H / 2 - f * y / z, z];
  };
  return { proj, eye };
}

function line(ctx, p, q, color, w = 1, dash = null) {
  if (!p || !q) return;
  ctx.strokeStyle = color; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); if (dash) ctx.setLineDash([]);
}
function label(ctx, p, text, color, dx = 6, dy = -6, font = '600 12px system-ui') {
  if (!p) return; ctx.fillStyle = color; ctx.font = font; ctx.fillText(text, p[0] + dx, p[1] + dy);
}
function arrow3(ctx, proj, from, to, color, w = 2, text = null) {
  const a = proj(from); const b = proj(to); if (!a || !b) return;
  line(ctx, a, b, color, w);
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]); const h = 9;
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
  ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - h * Math.cos(ang - 0.4), b[1] - h * Math.sin(ang - 0.4));
  ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - h * Math.cos(ang + 0.4), b[1] - h * Math.sin(ang + 0.4));
  ctx.stroke();
  if (text) label(ctx, b, text, color);
}
// An axis triad at `origin`; `names` labels the three axes (null hides labels).
function triad(ctx, proj, origin, axes, len, alpha, names) {
  const cols = [`rgba(230,70,59,${alpha})`, `rgba(46,160,90,${alpha})`, `rgba(60,130,246,${alpha})`];
  for (let i = 0; i < 3; i += 1) {
    const tip = add(origin, scale(axes[i], len));
    arrow3(ctx, proj, origin, tip, cols[i], 2.2, names ? names[i] : null);
  }
}

// ---------------------------------------------------------------------------
const SENSORS = {
  gps: { label: 'GPS antenna', color: '#f59e0b', bore: false },
  scanner: { label: 'LiDAR', color: '#38bdf8', bore: true },
};

const DEFAULTS = {
  gps: { arm: [-0.9, 0.0, 1.05], bore: [0, 0, 0] }, // antenna on top of the fuselage, behind the wing
  scanner: { arm: [0.7, 0.0, -0.8], bore: [4, -3, 5] }, // laser scanner under the belly, looking down
};

// A transparent fixed-wing drone, in IMU body coordinates (X forward/nose,
// Y left, Z up). Built as a lofted fuselage tube plus wing/tail/fin quads so it
// can be drawn see-through (faint fills + wireframe) with the sensors visible
// inside it.
const DRONE = (() => {
  const sides = 8;
  const stations = [
    { x: 3.25, r: 0.08 }, { x: 2.5, r: 0.4 }, { x: 1.3, r: 0.58 }, { x: 0.0, r: 0.6 },
    { x: -1.3, r: 0.5 }, { x: -2.5, r: 0.32 }, { x: -3.25, r: 0.1 },
  ];
  const rings = stations.map((st) => Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2; return [st.x, st.r * Math.cos(a), st.r * Math.sin(a)];
  }));
  const faces = []; const edges = [];
  rings.forEach((ring) => { for (let i = 0; i < sides; i += 1) edges.push([ring[i], ring[(i + 1) % sides]]); });
  for (let s = 0; s < rings.length - 1; s += 1) {
    for (let i = 0; i < sides; i += 1) {
      faces.push({ pts: [rings[s][i], rings[s][(i + 1) % sides], rings[s + 1][(i + 1) % sides], rings[s + 1][i]], kind: 'body' });
      edges.push([rings[s][i], rings[s + 1][i]]);
    }
  }
  const wingR = [[1.5, 0.35, 0.06], [0.3, 0.35, 0.06], [0.65, 3.7, 0.06], [1.05, 3.7, 0.06]];
  const wingL = wingR.map((p) => [p[0], -p[1], p[2]]);
  const hzR = [[-2.4, 0.2, 0.02], [-3.15, 0.2, 0.02], [-3.05, 1.5, 0.02], [-2.55, 1.5, 0.02]];
  const hzL = hzR.map((p) => [p[0], -p[1], p[2]]);
  const fin = [[-2.4, 0, 0.1], [-3.15, 0, 0.1], [-3.15, 0, 1.15], [-2.55, 0, 0.95]];
  [wingR, wingL, hzR, hzL].forEach((q) => faces.push({ pts: q, kind: 'wing' }));
  faces.push({ pts: fin, kind: 'fin' });
  [wingR, wingL, hzR, hzL, fin].forEach((q) => { for (let i = 0; i < q.length; i += 1) edges.push([q[i], q[(i + 1) % q.length]]); });
  return { faces, edges, propX: 3.32, propR: 1.05 };
})();

const DRONE_FILL = { body: 'rgba(150,180,210,0.05)', wing: 'rgba(150,180,210,0.11)', fin: 'rgba(150,180,210,0.11)' };

function drawDrone(ctx, proj, eye, xf) {
  const P = (p) => proj(xf(p)); // project a body point after applying the attitude
  DRONE.faces.map((f) => ({ f, depth: norm(sub(scale(f.pts.reduce((s, p) => add(s, xf(p)), [0, 0, 0]), 1 / f.pts.length), eye)) }))
    .sort((a, b) => b.depth - a.depth)
    .forEach(({ f }) => {
      const pr = f.pts.map(P); if (pr.some((p) => !p)) return;
      ctx.beginPath(); pr.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.fillStyle = DRONE_FILL[f.kind] || DRONE_FILL.body; ctx.fill();
    });
  ctx.strokeStyle = 'rgba(178,202,226,0.5)'; ctx.lineWidth = 1;
  DRONE.edges.forEach(([a, b]) => { const pa = P(a); const pb = P(b); if (pa && pb) { ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); } });
  // propeller: dashed arc + blades + hub
  const hub = [DRONE.propX, 0, 0];
  ctx.strokeStyle = 'rgba(178,202,226,0.35)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i <= 24; i += 1) { const a = i / 24 * Math.PI * 2; const p = P([DRONE.propX, DRONE.propR * Math.cos(a), DRONE.propR * Math.sin(a)]); if (p) (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(198,216,236,0.75)'; ctx.lineWidth = 2.4;
  for (let b = 0; b < 3; b += 1) { const a = b * Math.PI * 2 / 3; const ph = P(hub); const pt = P([DRONE.propX, DRONE.propR * Math.cos(a), DRONE.propR * Math.sin(a)]); if (ph && pt) { ctx.beginPath(); ctx.moveTo(ph[0], ph[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); } }
  const ph = P(hub); if (ph) { ctx.fillStyle = '#c6d6e2'; ctx.beginPath(); ctx.arc(ph[0], ph[1], 3, 0, Math.PI * 2); ctx.fill(); label(ctx, ph, 'propeller', 'rgba(198,214,226,.7)', 6, -8, '600 10px system-ui'); }
}

function render(canvas, state) {
  const { orbit, arms, bores, att, height, scanAngle, showArms, showGhost, showLaser, sel } = state;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#111d29'); g.addColorStop(1, '#0a1119');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const { proj, eye } = makeProjector(orbit);
  const groundZ = -height;

  // The drone attitude the IMU records — a rigid-body rotation of the whole
  // platform (drone, IMU body frame, GPS antenna & LiDAR positions/axes).
  const rot = makeAttitude(att);

  // Ground plane grid (the fixed nav/world frame — it does NOT rotate).
  for (let i = -8; i <= 8; i += 2) {
    line(ctx, proj([i, -8, groundZ]), proj([i, 8, groundZ]), 'rgba(90,120,150,.16)');
    line(ctx, proj([-8, i, groundZ]), proj([8, i, groundZ]), 'rgba(90,120,150,.16)');
  }

  // Transparent fixed-wing drone, rotated by the attitude.
  drawDrone(ctx, proj, eye, rot);

  // Rigid platform: every mount rotates with the drone about the IMU origin.
  const gpsPos = rot(arms.gps); const scanPos = rot(arms.scanner);

  // Lever arm: the vector that physically ties the GPS antenna to the LiDAR.
  if (showArms) {
    arrow3(ctx, proj, gpsPos, scanPos, '#c084fc', 2.6);
    const armVec = sub(scanPos, gpsPos);
    label(ctx, proj(scale(add(gpsPos, scanPos), 0.5)), `lever arm = ${norm(armVec).toFixed(2)} m`, '#c084fc', 8, -6, '700 11px system-ui');
  }

  // Fixed nav reference at the IMU origin — faint True North / East / Nadir.
  triad(ctx, proj, [0, 0, 0], NAV_AXES, 1.7, 0.3, ['N', 'E', 'Nadir']);
  // IMU body triad — rotates with the drone; its offset from the nav frame IS
  // the roll/pitch/yaw the IMU records.
  const imuAxes = eulerAxes(att[0], att[1], att[2]).map(navToScene);
  triad(ctx, proj, [0, 0, 0], imuAxes, 1.7, 0.95, ['Xᵦ', 'Yᵦ', 'Zᵦ']);
  const oI = proj([0, 0, 0]);
  if (oI) { ctx.fillStyle = '#e8eff5'; ctx.beginPath(); ctx.arc(oI[0], oI[1], 4, 0, Math.PI * 2); ctx.fill(); label(ctx, oI, 'IMU (records R/P/Y)', '#e8eff5', 8, 16); }

  // GPS antenna: earth-fixed ECEF triad (orientation does NOT rotate with the
  // drone); only the mount point rides along.
  triad(ctx, proj, gpsPos, ecefAxes(LAT, LON), sel === 'gps' ? 1.5 : 1.0, sel === 'gps' ? 0.9 : 0.55, ['Xₑ', 'Yₑ', 'Zₑ']);
  const pg = proj(gpsPos);
  if (pg) {
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(pg[0], pg[1] - 2, 15, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(pg[0], pg[1], sel === 'gps' ? 5.5 : 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a1119'; ctx.lineWidth = 1.5; ctx.stroke();
    label(ctx, pg, 'GPS antenna (ECEF)', '#f59e0b', 9, sel === 'gps' ? 20 : 14, sel === 'gps' ? '700 12px system-ui' : '600 10px system-ui');
  }

  // LiDAR = IMU body frame ∘ boresight, all carried by the attitude. The faint
  // ghost shows the IMU body axes at the scanner, so the boresight offset shows.
  const scanAxes = lidarAxes(...bores.scanner).map(rot); // attitude ∘ boresight
  if (showGhost) triad(ctx, proj, scanPos, imuAxes, 1.2, 0.28, null);
  triad(ctx, proj, scanPos, scanAxes, sel === 'scanner' ? 1.6 : 1.1, sel === 'scanner' ? 0.95 : 0.6, ['Xₛ', 'Yₛ', 'Zₛ']);
  const ps = proj(scanPos);
  if (ps) {
    ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(ps[0], ps[1], sel === 'scanner' ? 5.5 : 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a1119'; ctx.lineWidth = 1.5; ctx.stroke();
    label(ctx, ps, 'LiDAR', '#38bdf8', 9, sel === 'scanner' ? 20 : 14, sel === 'scanner' ? '700 12px system-ui' : '600 10px system-ui');
  }

  // Compare calibrated and uncalibrated endpoints using the same measured range.
  if (showLaser) {
    const comparison = boresightComparison(height, arms.scanner, att, bores.scanner, scanAngle);
    if (comparison) {
      const { actualHit, uncalibratedHit, horizontalError, verticalError } = comparison;
      line(ctx, proj(scanPos), proj(actualHit), '#ff6a5a', 2.6);
      line(ctx, proj(scanPos), proj(uncalibratedHit), '#f6c85f', 1.5, [5, 5]);
      for (const [point, color, text, dy] of [[actualHit, '#7ee0c4', 'calibrated ground point', -8], [uncalibratedHit, '#f6c85f', 'boresight omitted', 18]]) {
        const p = proj(point);
        if (p) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill(); label(ctx, p, text, color, 7, dy, '600 10px system-ui'); }
      }
      line(ctx, proj(actualHit), proj(uncalibratedHit), '#f6c85f', 2);
      label(ctx, proj(scale(add(actualHit, uncalibratedHit), 0.5)), `Δhorizontal ${horizontalError.toFixed(2)} m; Δz ${verticalError.toFixed(2)} m`, '#f6c85f', 6, -24, '600 10px system-ui');
    } else {
      label(ctx, proj(scanPos), 'no forward intersection with ground', '#ffb09a', 7, 32);
    }
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Boresight() {
  const [orbit, setOrbit] = useState({ az: -0.6, el: 0.28, dist: 20 });
  const [arms, setArms] = useState({ gps: DEFAULTS.gps.arm.slice(), scanner: DEFAULTS.scanner.arm.slice() });
  const [bores, setBores] = useState({ scanner: DEFAULTS.scanner.bore.slice() });
  const [att, setAtt] = useState([12, -6, 15]); // drone attitude the IMU records
  const [height, setHeight] = useState(6);
  const [scanAngle, setScanAngle] = useState(0);
  const [sel, setSel] = useState('scanner');
  const [showArms, setShowArms] = useState(true);
  const [showGhost, setShowGhost] = useState(true);
  const [showLaser, setShowLaser] = useState(true);

  const canvasRef = useRef(null); const drag = useRef(null);

  useEffect(() => {
    render(canvasRef.current, { orbit, arms, bores, att, height, scanAngle, showArms, showGhost, showLaser, sel });
  }, [orbit, arms, bores, att, height, scanAngle, showArms, showGhost, showLaser, sel]);

  const setArm = (key, i) => (e) => setArms((p) => { const a = { ...p, [key]: p[key].slice() }; a[key][i] = Number(e.target.value); return a; });
  const setBore = (key, i) => (e) => setBores((p) => { const b = { ...p, [key]: p[key].slice() }; b[key][i] = Number(e.target.value); return b; });
  const setAt = (i) => (e) => setAtt((p) => { const a = p.slice(); a[i] = Number(e.target.value); return a; });

  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y; drag.current = { x: e.clientX, y: e.clientY };
    setOrbit((o) => ({ ...o, az: o.az - dx * 0.008, el: clamp(o.el + dy * 0.006, -0.2, 1.4) }));
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e) => setOrbit((o) => ({ ...o, dist: clamp(o.dist + e.deltaY * 0.02, 5, 40) }));

  const reset = () => { setArms({ gps: DEFAULTS.gps.arm.slice(), scanner: DEFAULTS.scanner.arm.slice() }); setBores({ scanner: DEFAULTS.scanner.bore.slice() }); };
  const zeroBore = () => setBores((p) => ({ scanner: sel === 'scanner' ? [0, 0, 0] : p.scanner }));

  // Readouts and canvas share the same measured-range comparison.
  const comparison = boresightComparison(height, arms.scanner, att, bores.scanner, scanAngle);
  const groundErr = comparison?.horizontalError ?? 0;
  const [aRoll, aPitch, aYaw] = att; // drone attitude the IMU records
  const leverArm = norm(sub(arms.scanner, arms.gps)); // antenna → LiDAR
  const s = SENSORS[sel]; const arm = arms[sel];

  const AXES = ['X', 'Y', 'Z'];
  const RPY = ['roll (X)', 'pitch (Y)', 'yaw (Z)'];

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Boresight &amp; Lever-Arm <span className="native-badge">Native React</span></h1>
          <span className="sub">Direct georeferencing: rotate the drone — the LiDAR rotates with it and the IMU records roll/pitch/yaw</span>
        </div>
        <span className="score-chip">IMU records: <b>{aRoll.toFixed(0)}° / {aPitch.toFixed(0)}° / {aYaw.toFixed(0)}°</b></span>
      </header>

      <GeoreferencingExperiment arms={arms} attitude={att} boresight={bores.scanner}/>
      <LidarLearningPanel topic="boresight"
        workedExample={comparison ? `Measured slant range ρ = ${comparison.range.toFixed(3)} m; scanner height = ${comparison.sensorHeight.toFixed(3)} m. Omitting boresight shifts the same-range endpoint by Δhorizontal = ${(comparison.horizontalError * 100).toFixed(2)} cm and Δz = ${(comparison.verticalError * 100).toFixed(2)} cm. Attitude is included in both endpoints.` : 'The selected scanner position or ray has no forward ground intersection. Restore a higher platform or a downward-looking ray.'}
        onExperiment={(id) => { setSel('scanner'); setAtt(id === 'zero' ? [12, -6, 15] : [0, 0, 0]); setBores({ scanner: id === 'zero' ? [0, 0, 0] : [0, 0, 10] }); setScanAngle(id === 'yaw-scan' ? 30 : 0); setHeight(6); }} />

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> Sensor assembly <small>&mdash; drag to orbit, scroll to zoom</small></h2>
            <canvas ref={canvasRef} className="bs-view3d" width={VIEW_W} height={VIEW_H}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel} />
            <div className="bs-legend">
              <span><i className="bs-dot" style={{ background: '#e8eff5' }} /> IMU body (rotates) vs faint N/E/Nadir</span>
              <span><i className="bs-dot" style={{ background: '#f59e0b' }} /> GPS antenna — ECEF axes</span>
              <span><i className="bs-dot" style={{ background: '#38bdf8' }} /> LiDAR — rotates with the drone</span>
              <span><i className="bs-line" style={{ borderColor: '#c084fc' }} /> lever arm (antenna→LiDAR)</span>
              <span><i className="bs-line" style={{ borderColor: '#ff6a5a', borderStyle: 'solid' }} /> laser ray</span>
            </div>
            <div className="bs-toolbar">
              <label><input type="checkbox" checked={showArms} onChange={(e) => setShowArms(e.target.checked)} /> lever-arm vector</label>
              <label><input type="checkbox" checked={showGhost} onChange={(e) => setShowGhost(e.target.checked)} /> IMU-body ghost axes</label>
              <label><input type="checkbox" checked={showLaser} onChange={(e) => setShowLaser(e.target.checked)} /> laser &amp; ground error</label>
              <button className="bs-btn" onClick={() => setOrbit({ az: -0.6, el: 0.28, dist: 20 })}>reset view</button>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">2</span> Fly the drone <small>&mdash; the IMU records this attitude</small></h2>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              {['roll', 'pitch', 'yaw'].map((nm, i) => (
                <label key={nm}>{nm} <b>{att[i].toFixed(0)}&deg;</b><input type="range" min="-30" max="30" step="1" value={att[i]} onChange={setAt(i)} /></label>
              ))}
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div><span>IMU roll</span><b>{aRoll.toFixed(0)}&deg;</b></div>
              <div><span>IMU pitch</span><b>{aPitch.toFixed(0)}&deg;</b></div>
              <div><span>IMU yaw</span><b>{aYaw.toFixed(0)}&deg;</b></div>
            </div>
            <div className="bs-toolbar">
              <button className="bs-btn" onClick={() => setAtt([0, 0, 0])}>level flight (0/0/0)</button>
            </div>
            <div className="bs-note">
              Rotating the drone turns the rigid platform, beam and antenna about the IMU. Direct georeferencing <b>uses</b> the measured attitude to transform the observed ray into the mapping frame; it does not turn the actual ground hit into a nadir hit. Both plotted endpoints use that attitude, and differ only in whether the boresight calibration is applied.
            </div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">3</span> Edit a component</h2>
            <div className="bs-seg">
              {Object.keys(SENSORS).map((k) => (
                <button key={k} className={`bs-segbtn ${sel === k ? 'on' : ''}`} onClick={() => setSel(k)}>
                  <i className="bs-swatch" style={{ background: SENSORS[k].color }} />{SENSORS[k].label}
                </button>
              ))}
            </div>

            <div className="bs-sub">Mounting offset from IMU: X forward, Y left, Z up (metres)</div>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              {AXES.map((ax, i) => (
                <label key={ax}>{ax} <b>{arm[i].toFixed(2)}</b><input type="range" min="-4" max="4" step="0.05" value={arm[i]} onChange={setArm(sel, i)} /></label>
              ))}
            </div>
            <div className="bs-eq">antenna → LiDAR lever arm |a<sub>gps→ls</sub>| = <b>{leverArm.toFixed(2)} m</b></div>

            {s.bore ? (
              <>
                <div className="bs-sub">Boresight — LiDAR roll / pitch / yaw vs the IMU (deg, exaggerated)</div>
                <div className="control-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  {RPY.map((nm, i) => (
                    <label key={nm}>{nm} <b>{bores[sel][i]}&deg;</b><input type="range" min="-15" max="15" step="0.5" value={bores[sel][i]} onChange={setBore(sel, i)} /></label>
                  ))}
                </div>
                <button className="bs-btn" style={{ marginTop: 8 }} onClick={zeroBore}>zero this boresight</button>
              </>
            ) : (
              <div className="bs-note">The antenna is modelled as one phase-centre <b>point</b>. Its drawn ECEF triad is an Earth-coordinate reference, not the antenna&rsquo;s physical orientation. Antenna orientation and phase-centre variations matter in real systems but are omitted here.</div>
            )}

            <div className="bs-sub">Flying height &amp; impact</div>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>height above ground <b>{height} m</b><input type="range" min="2" max="12" step="0.5" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label>
              <label>scanner off-axis angle <b>{scanAngle}°</b><input type="range" min="-45" max="45" step="1" value={scanAngle} onChange={(e) => setScanAngle(Number(e.target.value))} /></label>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div><span>horizontal endpoint error</span><b className={groundErr > 0.3 ? 'orange' : ''}>{comparison ? `${(groundErr * 100).toFixed(1)} cm` : 'no hit'}</b></div>
              <div><span>vertical endpoint error Δz</span><b>{comparison ? `${(comparison.verticalError * 100).toFixed(1)} cm` : 'no hit'}</b></div>
              <div><span>measured slant range ρ</span><b>{comparison ? `${comparison.range.toFixed(2)} m` : 'no hit'}</b></div>
            </div>

            <div className="rect-summary">
              <b>Use attitude and boresight; neither can be silently omitted</b>
              <p>
                Rotate the drone and the whole rigid platform — the <b>IMU body frame</b>, the <b>GPS antenna</b> and the
                <b> LiDAR</b> — swings together. The <b>IMU records</b> that motion as <b>roll / pitch / yaw</b> against the fixed
                <b> North / East / Down</b> navigation frame. The <b>boresight</b> is a separate scanner-to-body rotation that must also be calibrated and applied.
                The display compares the <b>same measured range</b> with and without that rotation. A pure yaw misalignment leaves a nadir ray unchanged, but shifts an off-axis ray.
                The <b>lever arm</b> is a translation expressed in a declared body frame; it must be rotated with the platform before adding it to a world position.
              </p>
            </div>
            <div className={`bs-note ${groundErr > 0.3 ? 'warn' : ''}`}>
              <b>xₑ = x<sub>GNSS,e</sub> + R<sub>e←n</sub> R<sub>n←b</sub> (ℓ<sub>GNSS→scanner,b</sub> + R<sub>b←s</sub> ρ uₛ)</b>. The arrows declare source and destination frames. Apply scanner direction uₛ, boresight R<sub>b←s</sub>, body-frame lever arm, measured attitude and navigation-to-Earth rotation in that order. The small-angle scale ρ·δβ is a sensitivity estimate, not a full error budget.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
