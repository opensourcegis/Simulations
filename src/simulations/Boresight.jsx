import { useEffect, useMemo, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './boresight.css';

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
function eulerAxes(roll, pitch, yaw) {
  const cr = Math.cos(roll * DEG); const sr = Math.sin(roll * DEG);
  const cp = Math.cos(pitch * DEG); const sp = Math.sin(pitch * DEG);
  const cy = Math.cos(yaw * DEG); const sy = Math.sin(yaw * DEG);
  // R = Rz(yaw) Ry(pitch) Rx(roll); columns are the rotated body axes in world.
  const xAxis = [cy * cp, sy * cp, -sp];
  const yAxis = [cy * sp * sr - sy * cr, sy * sp * sr + cy * cr, cp * sr];
  const zAxis = [cy * sp * cr + sy * sr, sy * sp * cr - cy * sr, cp * cr];
  return [xAxis, yAxis, zAxis];
}
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

function drawDrone(ctx, proj, eye) {
  DRONE.faces.map((f) => ({ f, depth: norm(sub(scale(f.pts.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / f.pts.length), eye)) }))
    .sort((a, b) => b.depth - a.depth)
    .forEach(({ f }) => {
      const pr = f.pts.map(proj); if (pr.some((p) => !p)) return;
      ctx.beginPath(); pr.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.fillStyle = DRONE_FILL[f.kind] || DRONE_FILL.body; ctx.fill();
    });
  ctx.strokeStyle = 'rgba(178,202,226,0.5)'; ctx.lineWidth = 1;
  DRONE.edges.forEach(([a, b]) => { const pa = proj(a); const pb = proj(b); if (pa && pb) { ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke(); } });
  // propeller: dashed arc + blades + hub
  const hub = [DRONE.propX, 0, 0];
  ctx.strokeStyle = 'rgba(178,202,226,0.35)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i <= 24; i += 1) { const a = i / 24 * Math.PI * 2; const p = proj([DRONE.propX, DRONE.propR * Math.cos(a), DRONE.propR * Math.sin(a)]); if (p) (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(198,216,236,0.75)'; ctx.lineWidth = 2.4;
  for (let b = 0; b < 3; b += 1) { const a = b * Math.PI * 2 / 3; const ph = proj(hub); const pt = proj([DRONE.propX, DRONE.propR * Math.cos(a), DRONE.propR * Math.sin(a)]); if (ph && pt) { ctx.beginPath(); ctx.moveTo(ph[0], ph[1]); ctx.lineTo(pt[0], pt[1]); ctx.stroke(); } }
  const ph = proj(hub); if (ph) { ctx.fillStyle = '#c6d6e2'; ctx.beginPath(); ctx.arc(ph[0], ph[1], 3, 0, Math.PI * 2); ctx.fill(); label(ctx, ph, 'propeller', 'rgba(198,214,226,.7)', 6, -8, '600 10px system-ui'); }
}

function render(canvas, state) {
  const { orbit, arms, bores, height, showArms, showGhost, showLaser, sel } = state;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#111d29'); g.addColorStop(1, '#0a1119');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const { proj, eye } = makeProjector(orbit);
  const groundZ = -height;

  // Ground plane grid.
  for (let i = -8; i <= 8; i += 2) {
    line(ctx, proj([i, -8, groundZ]), proj([i, 8, groundZ]), 'rgba(90,120,150,.16)');
    line(ctx, proj([-8, i, groundZ]), proj([8, i, groundZ]), 'rgba(90,120,150,.16)');
  }

  // Transparent fixed-wing drone (wireframe + faint fills, so the sensors and
  // their vectors stay visible inside it).
  drawDrone(ctx, proj, eye);

  const gpsPos = arms.gps; const scanPos = arms.scanner;

  // Lever arm: the vector that physically ties the GPS antenna to the LiDAR.
  // (There is deliberately no antenna→IMU line — the arm we care about spans
  // the two sensors whose measurements must be fused.)
  if (showArms) {
    arrow3(ctx, proj, gpsPos, scanPos, '#c084fc', 2.6);
    const armVec = sub(scanPos, gpsPos);
    label(ctx, proj(scale(add(gpsPos, scanPos), 0.5)), `lever arm = ${norm(armVec).toFixed(2)} m`, '#c084fc', 8, -6, '700 11px system-ui');
  }

  // IMU triad = local navigation frame: True North, East, Nadir.
  triad(ctx, proj, [0, 0, 0], NAV_AXES, 1.8, 0.95, ['N', 'E', 'Nadir']);
  const oI = proj([0, 0, 0]);
  if (oI) { ctx.fillStyle = '#e8eff5'; ctx.beginPath(); ctx.arc(oI[0], oI[1], 4, 0, Math.PI * 2); ctx.fill(); label(ctx, oI, 'IMU (nav frame)', '#e8eff5', 8, 16); }

  // GPS antenna: its triad is aligned with the ECEF axes.
  triad(ctx, proj, gpsPos, ecefAxes(LAT, LON), sel === 'gps' ? 1.6 : 1.1, sel === 'gps' ? 0.95 : 0.6, ['Xₑ', 'Yₑ', 'Zₑ']);
  const pg = proj(gpsPos);
  if (pg) {
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(pg[0], pg[1] - 2, 15, 6, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(pg[0], pg[1], sel === 'gps' ? 5.5 : 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a1119'; ctx.lineWidth = 1.5; ctx.stroke();
    label(ctx, pg, 'GPS antenna (ECEF)', '#f59e0b', 9, sel === 'gps' ? 20 : 14, sel === 'gps' ? '700 12px system-ui' : '600 10px system-ui');
  }

  // LiDAR: nav frame rotated by the boresight roll/pitch/yaw. The faint ghost
  // shows the un-rotated nav axes so the boresight offset is visible.
  const scanAxes = lidarAxes(...bores.scanner);
  if (showGhost) triad(ctx, proj, scanPos, NAV_AXES, 1.2, 0.28, null);
  triad(ctx, proj, scanPos, scanAxes, sel === 'scanner' ? 1.6 : 1.1, sel === 'scanner' ? 0.95 : 0.6, ['Xₛ', 'Yₛ', 'Zₛ']);
  const ps = proj(scanPos);
  if (ps) {
    ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(ps[0], ps[1], sel === 'scanner' ? 5.5 : 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0a1119'; ctx.lineWidth = 1.5; ctx.stroke();
    label(ctx, ps, 'LiDAR (roll/pitch/yaw)', '#38bdf8', 9, sel === 'scanner' ? 20 : 14, sel === 'scanner' ? '700 12px system-ui' : '600 10px system-ui');
  }

  // Laser beam + boresight ground error.
  if (showLaser) {
    const sPos = scanPos;
    const beam = normalize(scanAxes[2]); // LiDAR "down" (Zₛ), tilted by boresight
    const nominal = [0, 0, -1]; // where it should point with zero boresight
    const tHit = (groundZ - sPos[2]) / beam[2];
    const tNom = (groundZ - sPos[2]) / nominal[2];
    if (tHit > 0 && tNom > 0) {
      const hit = add(sPos, scale(beam, tHit));
      const nomHit = add(sPos, scale(nominal, tNom));
      line(ctx, proj(sPos), proj(nomHit), 'rgba(126,224,196,.5)', 1.5, [5, 5]);
      line(ctx, proj(sPos), proj(hit), '#ff6a5a', 2.6);
      const ph = proj(hit); const pn = proj(nomHit);
      if (pn) { ctx.strokeStyle = '#7ee0c4'; ctx.beginPath(); ctx.arc(pn[0], pn[1], 5, 0, Math.PI * 2); ctx.stroke(); label(ctx, pn, 'true (nadir)', '#7ee0c4', 8, 16, '600 10px system-ui'); }
      if (ph) { ctx.fillStyle = '#ff6a5a'; ctx.beginPath(); ctx.arc(ph[0], ph[1], 5, 0, Math.PI * 2); ctx.fill(); label(ctx, ph, 'measured', '#ff6a5a', 8, 16, '600 10px system-ui'); }
      line(ctx, ph, pn, '#f6c85f', 2);
      const err = norm(sub([hit[0], hit[1], 0], [nomHit[0], nomHit[1], 0]));
      const em = proj(scale(add(hit, nomHit), 0.5));
      label(ctx, em, `ground error ≈ ${err.toFixed(2)} m`, '#f6c85f', 6, -6, '700 11px system-ui');
    }
  }
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export default function Boresight() {
  const [orbit, setOrbit] = useState({ az: -0.6, el: 0.28, dist: 20 });
  const [arms, setArms] = useState({ gps: DEFAULTS.gps.arm.slice(), scanner: DEFAULTS.scanner.arm.slice() });
  const [bores, setBores] = useState({ scanner: DEFAULTS.scanner.bore.slice() });
  const [height, setHeight] = useState(6);
  const [sel, setSel] = useState('scanner');
  const [showArms, setShowArms] = useState(true);
  const [showGhost, setShowGhost] = useState(true);
  const [showLaser, setShowLaser] = useState(true);

  const canvasRef = useRef(null); const drag = useRef(null);

  useEffect(() => {
    render(canvasRef.current, { orbit, arms, bores, height, showArms, showGhost, showLaser, sel });
  }, [orbit, arms, bores, height, showArms, showGhost, showLaser, sel]);

  const setArm = (key, i) => (e) => setArms((p) => { const a = { ...p, [key]: p[key].slice() }; a[key][i] = Number(e.target.value); return a; });
  const setBore = (key, i) => (e) => setBores((p) => { const b = { ...p, [key]: p[key].slice() }; b[key][i] = Number(e.target.value); return b; });

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

  // Boresight magnitude + ground error for the readouts (scanner).
  const boreMag = useMemo(() => {
    const beam = normalize(lidarAxes(...bores.scanner)[2]);
    return Math.acos(clamp(dot(beam, [0, 0, -1]), -1, 1)) / DEG;
  }, [bores.scanner]);
  const scannerH = height + arms.scanner[2]; // scanner's true height above ground (arm z is negative)
  const groundErr = scannerH * Math.tan(boreMag * DEG);
  const [roll, pitch, yaw] = bores.scanner;
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
          <span className="sub">Direct georeferencing: GPS antenna aligned to ECEF, IMU to North/Nadir, LiDAR by roll/pitch/yaw</span>
        </div>
        <span className="score-chip">nav frame: <b>North · East · Nadir</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> Sensor assembly <small>&mdash; drag to orbit, scroll to zoom</small></h2>
            <canvas ref={canvasRef} className="bs-view3d" width={VIEW_W} height={VIEW_H}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel} />
            <div className="bs-legend">
              <span><i className="bs-dot" style={{ background: '#e8eff5' }} /> IMU — N / E / Nadir</span>
              <span><i className="bs-dot" style={{ background: '#f59e0b' }} /> GPS antenna — ECEF axes</span>
              <span><i className="bs-dot" style={{ background: '#38bdf8' }} /> LiDAR — roll/pitch/yaw</span>
              <span><i className="bs-line" style={{ borderColor: '#c084fc' }} /> lever arm (antenna→LiDAR)</span>
              <span><i className="bs-line" style={{ borderColor: '#ff6a5a', borderStyle: 'solid' }} /> laser ray</span>
            </div>
            <div className="bs-toolbar">
              <label><input type="checkbox" checked={showArms} onChange={(e) => setShowArms(e.target.checked)} /> lever-arm vector</label>
              <label><input type="checkbox" checked={showGhost} onChange={(e) => setShowGhost(e.target.checked)} /> nav-aligned ghost axes</label>
              <label><input type="checkbox" checked={showLaser} onChange={(e) => setShowLaser(e.target.checked)} /> laser &amp; ground error</label>
              <button className="bs-btn" onClick={() => setOrbit({ az: -0.6, el: 0.28, dist: 20 })}>reset view</button>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">2</span> Edit a component</h2>
            <div className="bs-seg">
              {Object.keys(SENSORS).map((k) => (
                <button key={k} className={`bs-segbtn ${sel === k ? 'on' : ''}`} onClick={() => setSel(k)}>
                  <i className="bs-swatch" style={{ background: SENSORS[k].color }} />{SENSORS[k].label}
                </button>
              ))}
            </div>

            <div className="bs-sub">Mounting position — offset from the IMU (metres)</div>
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
              <div className="bs-note">The GPS antenna is a single phase-centre <b>point</b> with its triad locked to the <b>ECEF</b> axes — it has a lever arm but <b>no roll/pitch/yaw</b>, so there is no boresight for it.</div>
            )}

            <div className="bs-sub">LiDAR attitude (roll / pitch / yaw)</div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div><span>roll</span><b>{roll.toFixed(1)}&deg;</b></div>
              <div><span>pitch</span><b>{pitch.toFixed(1)}&deg;</b></div>
              <div><span>yaw</span><b>{yaw.toFixed(1)}&deg;</b></div>
            </div>

            <div className="bs-sub">Flying height &amp; impact</div>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>height above ground <b>{height} m</b><input type="range" min="2" max="12" step="0.5" value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div><span>boresight β</span><b>{boreMag.toFixed(2)}&deg;</b></div>
              <div><span>flying height H</span><b>{height} m</b></div>
              <div><span>ground error ≈ H·tanβ</span><b className={groundErr > 0.3 ? 'orange' : ''}>{(groundErr * 100).toFixed(0)} cm</b></div>
            </div>

            <div className="rect-summary">
              <b>Three frames, one measurement</b>
              <p>
                Each device advertises its own frame: the <b>GPS antenna</b> reports its phase-centre in <b>ECEF</b> axes,
                the <b>IMU</b> measures the aircraft's attitude in the local <b>North / East / Nadir</b> nav frame, and the
                <b> LiDAR</b> is bolted on with a small <b>roll / pitch / yaw</b> offset from the IMU — that offset is the
                <b> boresight</b>. The <b>lever arm</b> is the fixed <b>translation from the antenna to the LiDAR</b> (there is
                no line to the IMU — it is the two sensors whose measurements must be fused). Watch the laser ray: an
                uncalibrated boresight β turns into a ground error of about <b>H·tan β</b> — {(groundErr * 100).toFixed(0)} cm at {height} m here.
              </p>
            </div>
            <div className={`bs-note ${groundErr > 0.3 ? 'warn' : ''}`}>
              Georeferencing a laser point: <b>X<sub>ECEF</sub> = X<sub>GPS</sub> + R<sub>ECEF</sub><sup>nav</sup> · R<sub>nav</sub><sup>body</sup> · ( R<sub>bore</sub> · r<sub>scan</sub> + a<sub>gps→ls</sub> )</b> — the antenna→LiDAR lever arm shifts the origin, the boresight R<sub>bore</sub> rotates the ray into the IMU/nav frame, and R<sub>ECEF</sub><sup>nav</sup> lifts it into ECEF.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
