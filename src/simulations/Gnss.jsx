import { useEffect, useMemo, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './gnss.css';

const C = 299792458; // m/s
const F_L1 = 1575.42e6; // GPS L1 Hz
const LAMBDA = C / F_L1; // ~0.19029 m
const D_ORBIT = 20200000; // GPS altitude, m
const LON0 = 77.5; // reference longitude (deg)
const LAT = 13; // deg
const M_PER_DEG = 111320 * Math.cos(LAT * Math.PI / 180); // metres per degree of longitude
const B_ROVER = 150000; // rover receiver clock bias, m (0.5 ms) — solved for
const TAU = Math.PI * 2;

const SATS = [
  { prn: 12, el: 78, side: 1, color: '#5ad1ff' },
  { prn: 24, el: 41, side: -1, color: '#7ee0c4' },
  { prn: 5, el: 60, side: -1, color: '#f6c85f' },
  { prn: 19, el: 30, side: 1, color: '#ff9f6b' },
  { prn: 2, el: 52, side: 1, color: '#c9a2ff' },
  { prn: 15, el: 24, side: -1, color: '#ff7aa8' },
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lonStr = (Rx, dp = 8) => (LON0 + Rx / M_PER_DEG).toFixed(dp);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Least-squares code (pseudorange) position: unknowns [Rx, clock b].
function solveCode(sats, rho) {
  let Rx = 0; let b = 0;
  for (let it = 0; it < 10; it += 1) {
    const JTJ = [[0, 0], [0, 0]]; const JTr = [0, 0];
    for (let i = 0; i < sats.length; i += 1) {
      const dx = sats[i].Sx - Rx; const r = Math.hypot(dx, sats[i].Sy);
      const H0 = -dx / r; const H1 = 1; const res = rho[i] - (r + b);
      JTJ[0][0] += H0 * H0; JTJ[0][1] += H0 * H1; JTJ[1][0] += H1 * H0; JTJ[1][1] += H1 * H1;
      JTr[0] += H0 * res; JTr[1] += H1 * res;
    }
    const det = JTJ[0][0] * JTJ[1][1] - JTJ[0][1] * JTJ[1][0];
    if (Math.abs(det) < 1e-9) break;
    const dRx = (JTr[0] * JTJ[1][1] - JTr[1] * JTJ[0][1]) / det;
    const db = (JTJ[0][0] * JTr[1] - JTJ[1][0] * JTr[0]) / det;
    Rx += dRx; b += db;
    if (Math.abs(dRx) < 1e-6) break;
  }
  return { Rx, b };
}

const SKY_W = 700; const SKY_H = 380;
// ---------------------------------------------------------------------------
// Sky scene: satellites broadcasting animated signals down to rover + base.
// ---------------------------------------------------------------------------
function drawSky(ctx, { sats, showBase, sel, t }) {
  const g = ctx.createLinearGradient(0, 0, 0, SKY_H);
  g.addColorStop(0, '#0a1a30'); g.addColorStop(0.7, '#0e2135'); g.addColorStop(1, '#14202a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SKY_W, SKY_H);
  // stars
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  for (let i = 0; i < 40; i += 1) { const x = (i * 137.5) % SKY_W; const y = (i * 61.8) % (SKY_H - 90); ctx.fillRect(x, y, 1.4, 1.4); }
  const gy = SKY_H - 58; const cx = 356;
  // ground
  ctx.fillStyle = '#26313b'; ctx.fillRect(0, gy, SKY_W, SKY_H - gy);
  ctx.strokeStyle = '#4a5b68'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(SKY_W, gy); ctx.stroke();

  const R0 = 250;
  const satScreen = sats.map((s) => [cx + s.side * Math.cos(s.el * Math.PI / 180) * R0, gy - Math.sin(s.el * Math.PI / 180) * R0]);
  const rover = [cx, gy]; const base = [cx - 120, gy];

  sats.forEach((s, i) => {
    const sp = satScreen[i]; const isSel = i === sel;
    // line of sight
    ctx.strokeStyle = isSel ? s.color : 'rgba(150,175,200,.28)'; ctx.lineWidth = isSel ? 1.8 : 1;
    ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(rover[0], rover[1]); ctx.stroke();
    // expanding signal wavefronts from the satellite
    for (let k = 0; k < 3; k += 1) {
      const rad = ((t * 46 + k * 40 + i * 13) % 130);
      ctx.strokeStyle = `rgba(${isSel ? '90,209,255' : '130,160,190'},${clamp(0.5 - rad / 260, 0, 0.5)})`;
      ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sp[0], sp[1], rad + 6, 0, TAU); ctx.stroke();
    }
    // signal pulse travelling to the rover
    const frac = ((t * 0.35 + i * 0.15) % 1);
    const px = sp[0] + (rover[0] - sp[0]) * frac; const py = sp[1] + (rover[1] - sp[1]) * frac;
    ctx.fillStyle = s.color; ctx.shadowColor = s.color; ctx.shadowBlur = isSel ? 12 : 6;
    ctx.beginPath(); ctx.arc(px, py, isSel ? 4 : 3, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    // satellite icon
    ctx.save(); ctx.translate(sp[0], sp[1]);
    ctx.fillStyle = '#dbe9f2'; ctx.fillRect(-6, -4, 12, 8);
    ctx.fillStyle = isSel ? s.color : '#6f93c0'; ctx.fillRect(-18, -3, 9, 6); ctx.fillRect(9, -3, 9, 6);
    ctx.restore();
    ctx.fillStyle = isSel ? '#fff' : '#9fb6cc'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`G${s.prn}`, sp[0], sp[1] - 12);
    ctx.font = '10px ui-monospace,monospace'; ctx.fillStyle = isSel ? s.color : 'rgba(180,200,220,.75)';
    ctx.fillText(`${(s.rho / 1000).toFixed(1)} km`, (sp[0] + rover[0]) / 2 + s.side * 26, (sp[1] + rover[1]) / 2);
    ctx.textAlign = 'left';
  });

  // rover + base
  const drawRx = (p, col, lab) => {
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - 16); ctx.stroke();
    ctx.beginPath(); ctx.arc(p[0], p[1] - 18, 3.2, 0, TAU); ctx.fillStyle = col; ctx.fill();
    ctx.fillStyle = col; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(lab, p[0], p[1] + 16); ctx.textAlign = 'left';
  };
  if (showBase) drawRx(base, '#f6c85f', 'BASE');
  drawRx(rover, '#4ade80', 'ROVER');
}

const PHZ_W = 700; const PHZ_H = 320;
// Circular phasor: what the receiver actually measures — the carrier phase of
// each satellite relative to the receiver's own replica (its clock). All
// phasors spin together at the carrier rate, so the fixed angular offsets are
// the measured phases.
function drawPhasor(ctx, { sats, t }) {
  ctx.clearRect(0, 0, PHZ_W, PHZ_H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, PHZ_W, PHZ_H);
  const cx = 205; const cy = 162; const R = 122;
  ctx.strokeStyle = 'rgba(140,163,181,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,163,181,.16)'; ctx.lineWidth = 1;
  for (let a = 0; a < 360; a += 30) { const r = a * Math.PI / 180; ctx.beginPath(); ctx.moveTo(cx + Math.cos(r) * (R - 7), cy - Math.sin(r) * (R - 7)); ctx.lineTo(cx + Math.cos(r) * R, cy - Math.sin(r) * R); ctx.stroke(); }
  ctx.fillStyle = '#7d8fa1'; ctx.font = '9px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('0°', cx + R + 11, cy + 3); ctx.fillText('90°', cx, cy - R - 6); ctx.fillText('180°', cx - R - 13, cy + 3); ctx.fillText('270°', cx, cy + R + 13);

  const base = t * 0.7;
  const vec = (ang, len, color, w) => { const ex = cx + Math.cos(ang) * len; const ey = cy - Math.sin(ang) * len; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke(); return [ex, ey]; };
  // satellites (spin together with the receiver replica; offsets = phases)
  sats.forEach((s, i) => {
    const ang = base - s.phaseFrac * TAU;
    const [ex, ey] = vec(ang, R - 6, s.color, 2.4);
    ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(ex, ey, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = s.color; ctx.globalAlpha = 0.45; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 24 + i * 8, -base, -ang, true); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = s.color; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`G${s.prn}`, cx + Math.cos(ang) * (R + 15), cy - Math.sin(ang) * (R + 15) + 3);
  });
  // receiver replica (clock) reference
  const [rx, ry] = vec(base, R - 6, '#e8eff5', 3);
  ctx.fillStyle = '#e8eff5'; ctx.beginPath(); ctx.arc(rx, ry, 4.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8eff5'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('RX replica', cx + Math.cos(base) * (R + 24), cy - Math.sin(base) * (R + 24) + 3);
  // clock glyph at centre
  ctx.fillStyle = '#0e1620'; ctx.strokeStyle = '#9fb6cc'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 5); ctx.moveTo(cx, cy); ctx.lineTo(cx + 3.5, cy + 1); ctx.stroke();

  // "what the receiver measures" list on the right
  const lx = 420;
  ctx.textAlign = 'left'; ctx.fillStyle = '#cdd9e3'; ctx.font = '600 12px system-ui'; ctx.fillText('what the receiver measures', lx, 26);
  ctx.fillStyle = '#7d8fa1'; ctx.font = '10px system-ui'; ctx.fillText('carrier phase of each satellite vs its clock', lx, 40);
  let ly = 66;
  sats.forEach((s) => {
    ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(lx + 5, ly - 4, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#dbe9f2'; ctx.font = '600 11px system-ui'; ctx.fillText(`G${s.prn}`, lx + 16, ly);
    ctx.fillStyle = '#9fb6cc'; ctx.font = '11px ui-monospace,monospace';
    ctx.fillText(`φ = ${(s.phaseFrac * 360).toFixed(0).padStart(3, ' ')}°  (${s.phaseFrac.toFixed(3)} cyc)`, lx + 54, ly);
    ctx.fillStyle = 'rgba(120,150,175,.22)'; ctx.fillRect(lx + 16, ly + 5, 232, 5);
    ctx.fillStyle = s.color; ctx.fillRect(lx + 16, ly + 5, 232 * s.phaseFrac, 5);
    ly += 40;
  });
  ctx.fillStyle = '#8ea3b5'; ctx.font = '9.5px system-ui'; ctx.fillText('a receiver-clock error rotates ALL vectors together', lx, ly + 4);
}

// One satellite: the receiver locks its replica to the incoming carrier and
// tracks the phase (PLL). Shows the two carriers overlaid + a phasor for the
// tracked phase.
const TRACK_W = 700; const TRACK_H = 168;
function drawTrack(ctx, { sat, phi, t }) {
  ctx.clearRect(0, 0, TRACK_W, TRACK_H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, TRACK_W, TRACK_H);
  const left = 20; const right = TRACK_W - 175; const mid = 84; const A = 40; const cycles = 5; const per = (right - left) / cycles;
  const scroll = t * 2.2;
  const carrier = (color, w, dash) => {
    ctx.strokeStyle = color; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash); ctx.beginPath();
    for (let x = left; x <= right; x += 2) { const ph = (x - left) / per * TAU - scroll; const y = mid - A * Math.sin(ph); if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); if (dash) ctx.setLineDash([]);
  };
  carrier(sat.color, 2.6, null); // incoming carrier
  carrier('rgba(232,239,245,.9)', 1.4, [5, 4]); // receiver replica, phase-locked
  // reference line where the fractional phase is read
  const refx = left + per * 1.5;
  ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(refx, 26); ctx.lineTo(refx, TRACK_H - 26); ctx.stroke(); ctx.setLineDash([]);
  const ry = mid - A * Math.sin((refx - left) / per * TAU - scroll);
  ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(refx, ry, 4, 0, TAU); ctx.fill();
  // phasor
  const cx = TRACK_W - 88; const cy = 84; const R = 54;
  ctx.strokeStyle = 'rgba(140,163,181,.4)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
  const ang = phi * TAU - scroll; const ex = cx + Math.cos(ang) * R; const ey = cy - Math.sin(ang) * R;
  ctx.strokeStyle = sat.color; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.fillStyle = sat.color; ctx.beginPath(); ctx.arc(ex, ey, 3.6, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8ea3b5'; ctx.font = '9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('tracked phase', cx, cy + R + 14); ctx.textAlign = 'left';
  // labels
  ctx.fillStyle = sat.color; ctx.font = '600 11px system-ui'; ctx.fillText(`incoming carrier  ·  G${sat.prn}`, left, 16);
  ctx.fillStyle = '#cfe0ef'; ctx.font = '11px system-ui'; ctx.fillText('receiver replica — phase-locked (PLL)', left, TRACK_H - 10);
  ctx.fillStyle = '#4ade80'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`φ = ${phi.toFixed(3)} cyc`, refx, 20); ctx.textAlign = 'left';
}

// One satellite: the carrier gives a comb of candidate ranges (λ apart); the
// rough code range picks the correct whole-cycle count N.
const NL_W = 700; const NL_H = 200;
function drawNline(ctx, { phi, codeRange, smoothed, Nest, color, resolve }) {
  ctx.clearRect(0, 0, NL_W, NL_H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, NL_W, NL_H);
  const left = 30; const right = NL_W - 24; const y = NL_H - 48; const WIN = 0.55; // metres half-window
  const X = (m) => left + ((m - (codeRange - WIN)) / (2 * WIN)) * (right - left);
  const fixed = resolve >= 1;
  ctx.fillStyle = '#cdd9e3'; ctx.font = '11px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('carrier → candidate ranges one wavelength (19 cm) apart;  the code range picks one → N', left - 6, 16);
  // code band + marker
  ctx.fillStyle = 'rgba(227,116,0,.16)'; ctx.fillRect(X(codeRange - smoothed), y - 74, X(codeRange + smoothed) - X(codeRange - smoothed), 74);
  ctx.strokeStyle = '#e37400'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(codeRange), y - 80); ctx.lineTo(X(codeRange), y); ctx.stroke();
  ctx.fillStyle = '#e37400'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('code range ρ', X(codeRange), y - 84);
  // candidates
  for (let k = -5; k <= 5; k += 1) {
    const m = (Nest + k + phi) * LAMBDA; if (m < codeRange - WIN || m > codeRange + WIN) continue;
    const x = X(m); const isN = k === 0;
    ctx.strokeStyle = isN && fixed ? '#4ade80' : color; ctx.lineWidth = isN && fixed ? 2.8 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - (isN && fixed ? 60 : 32)); ctx.stroke();
    if (isN && fixed) { ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(x, y - 60, 3.6, 0, TAU); ctx.fill(); }
    ctx.fillStyle = isN && fixed ? '#4ade80' : '#8ea3b5'; ctx.font = isN ? '700 10px system-ui' : '9.5px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(k === 0 ? 'N' : k > 0 ? `N+${k}` : `N${k}`, x, y + 15);
  }
  // scan line during resolve
  if (resolve > 0 && resolve < 1) { const sx = left + (right - left) * resolve; ctx.strokeStyle = 'rgba(126,224,196,.9)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx, y - 74); ctx.lineTo(sx, y); ctx.stroke(); ctx.setLineDash([]); }
  // axis
  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  ctx.textAlign = 'left'; ctx.fillStyle = '#7d8fa1'; ctx.font = '9px system-ui';
  ctx.fillText(`each tick = a whole number of wavelengths N   ·   window ±${(WIN * 100).toFixed(0)} cm around ρ`, left, NL_H - 14);
}

export default function Gnss() {
  const [step, setStep] = useState('signals');
  const [roverOffset, setRoverOffset] = useState(6);
  const [numSat, setNumSat] = useState(5);
  const [codeNoise, setCodeNoise] = useState(2.5);
  const [showBase, setShowBase] = useState(true);
  const [sel, setSel] = useState(0);

  const skyRef = useRef(null); const phaseRef = useRef(null); const trackRef = useRef(null); const nlineRef = useRef(null);
  const params = useRef({}); const resolveAnim = useRef({ playing: false, start: 0, done: false });

  // Deterministic per-satellite code noise so the solution is stable per input.
  const noise = useMemo(() => { const rng = mulberry32(99); return SATS.map(() => (rng() - 0.5) + (rng() - 0.5)); }, []);

  const data = useMemo(() => {
    const sats = SATS.slice(0, numSat).map((s, i) => {
      const Sx = s.side * Math.cos(s.el * Math.PI / 180) * D_ORBIT;
      const Sy = Math.sin(s.el * Math.PI / 180) * D_ORBIT;
      const r = Math.hypot(Sx - roverOffset, Sy);
      const rho = r + B_ROVER + noise[i] * codeNoise;
      const phaseFrac = (((r + B_ROVER) / LAMBDA) % 1 + 1) % 1;
      return { ...s, Sx, Sy, r, rho, phaseFrac };
    });
    const code = solveCode(sats, sats.map((s) => s.rho));
    return { sats, code };
  }, [numSat, roverOffset, codeNoise, noise]);

  // Focused satellite for step 3 (single-satellite N calculation). The code
  // range here is the clean, differenced range (clocks/atmosphere removed),
  // carrier-smoothed, so the whole-cycle count rounds out uniquely.
  const fs = data.sats[Math.min(sel, data.sats.length - 1)];
  const focusIdx = Math.min(sel, data.sats.length - 1);
  const smoothed = Math.max(0.03, codeNoise * 0.03);
  const codeRange = fs.r + noise[focusIdx] * smoothed;
  const Nest = Math.round(codeRange / LAMBDA - fs.phaseFrac);
  const fixedRange = (Nest + fs.phaseFrac) * LAMBDA;

  params.current = { step, sats: data.sats, showBase, sel, roverX: roverOffset, codeRx: data.code.Rx, focus: { sat: fs, phi: fs.phaseFrac, codeRange, smoothed, Nest } };

  useEffect(() => {
    let raf; const t0 = performance.now();
    const loop = (now) => {
      const p = params.current; const t = (now - t0) / 1000;
      if (p.step === 'signals' && skyRef.current) drawSky(skyRef.current.getContext('2d'), { sats: p.sats, showBase: p.showBase, sel: p.sel, t });
      if (p.step === 'phase' && phaseRef.current) drawPhasor(phaseRef.current.getContext('2d'), { sats: p.sats, t });
      if (p.step === 'rtk') {
        const ra = resolveAnim.current; let resolve = ra.done ? 1 : 0;
        if (ra.playing) { const pr = (now - ra.start) / 1400; if (pr >= 1) { ra.playing = false; ra.done = true; resolve = 1; } else resolve = pr; }
        if (trackRef.current) drawTrack(trackRef.current.getContext('2d'), { sat: p.focus.sat, phi: p.focus.phi, t });
        if (nlineRef.current) drawNline(nlineRef.current.getContext('2d'), { phi: p.focus.phi, codeRange: p.focus.codeRange, smoothed: p.focus.smoothed, Nest: p.focus.Nest, color: p.focus.sat.color, resolve });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, []);

  const codeErr = data.code.Rx - roverOffset;
  const rtkErr = 0.012; // cm-level once ambiguities are fixed
  const play = () => { resolveAnim.current = { playing: true, start: performance.now(), done: false }; };
  useEffect(() => { resolveAnim.current = { playing: false, start: 0, done: false }; }, [numSat, roverOffset, codeNoise, sel]);

  const step2Idx = ['signals', 'phase', 'rtk'].indexOf(step) + 1;

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>GNSS Positioning <span className="native-badge">Native React</span></h1>
          <span className="sub">From satellite signals to a centimetre longitude: code ranging, carrier phase &amp; double-differenced ambiguity resolution</span>
        </div>
        <span className="score-chip">rover λ: <b>{lonStr(roverOffset, 7)}&deg;E</b></span>
      </header>

      <div className="gn-modes">
        <button className={`gn-seg ${step === 'signals' ? 'on' : ''}`} onClick={() => setStep('signals')}>1 · Signals &amp; code ranging</button>
        <button className={`gn-seg ${step === 'phase' ? 'on' : ''}`} onClick={() => setStep('phase')}>2 · Carrier phase &amp; receiver clock</button>
        <button className={`gn-seg ${step === 'rtk' ? 'on' : ''}`} onClick={() => setStep('rtk')}>3 · Double-differenced ambiguity (N)</button>
      </div>

      {step === 'signals' ? (
        <div className="sim-layout" key="signals">
          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">1</span> Satellites &amp; signals <small>&mdash; each satellite broadcasts to the rover</small></h2>
              <canvas ref={skyRef} className="gn-canvas" width={SKY_W} height={SKY_H} />
              <div className="control-grid">
                <label>Rover position <b>{roverOffset.toFixed(2)} m</b><input type="range" min="-15" max="15" step="0.1" value={roverOffset} onChange={(e) => setRoverOffset(Number(e.target.value))} /></label>
                <label>Satellites in view <b>{numSat}</b><input type="range" min="4" max="6" step="1" value={numSat} onChange={(e) => { setNumSat(Number(e.target.value)); setSel((s) => Math.min(s, Number(e.target.value) - 1)); }} /></label>
                <label>Code (P-code) noise <b>{codeNoise.toFixed(1)} m</b><input type="range" min="0.2" max="6" step="0.1" value={codeNoise} onChange={(e) => setCodeNoise(Number(e.target.value))} /></label>
                <label className="gn-chk" style={{ alignSelf: 'end' }}><input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} /> show base station</label>
              </div>
              <div className="gn-legend">
                <span><i className="gn-dot" style={{ background: '#4ade80' }} /> rover (unknown)</span>
                <span><i className="gn-dot" style={{ background: '#f6c85f' }} /> base (known)</span>
                <span>click a row → highlight that satellite</span>
              </div>
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">2</span> From signal to range <small>&mdash; ρ = c · Δt</small></h2>
              <div className="gn-note">Each satellite sends a coded signal stamped with its transmit time. The receiver measures the travel time Δt and forms a <b>pseudorange</b> ρ = c · Δt. It is &ldquo;pseudo&rdquo; because the receiver clock is offset by an unknown bias — so a 4th satellite is needed to solve for position <b>and</b> clock.</div>
              <table className="gn-tbl">
                <thead><tr><th>Sat</th><th>Elev</th><th>Range r (km)</th><th>Pseudorange ρ (km)</th></tr></thead>
                <tbody>
                  {data.sats.map((s, i) => (
                    <tr key={s.prn} style={{ cursor: 'pointer', background: sel === i ? '#f0faf4' : 'transparent' }} onClick={() => setSel(i)}>
                      <td><span className="gn-prn" style={{ background: s.color }} />G{s.prn}</td>
                      <td>{s.el}&deg;</td>
                      <td>{(s.r / 1000).toFixed(3)}</td>
                      <td>{(s.rho / 1000).toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="gn-sub">Least-squares position (code only)</div>
              <div className="gn-eq">solve <b>[longitude, clock]</b> so every ρ<sub>i</sub> = |Sat<sub>i</sub> − Rover| + c·δt</div>
              <div className="gn-lon">
                <div className="gn-lonrow code"><span>code solution</span><b>{lonStr(data.code.Rx, 7)}&deg;E</b></div>
                <div className="gn-lonrow"><span>error vs truth</span><b style={{ color: Math.abs(codeErr) > 3 ? '#e6463b' : '#56677a' }}>{codeErr >= 0 ? '+' : ''}{codeErr.toFixed(2)} m</b></div>
              </div>
              <div className="gn-note">Code positioning is unambiguous but only <b>metre-level</b> — the P-code chip is long, so timing noise maps to metres. For survey accuracy we turn to the <b>carrier wave</b> &rarr; step 2.</div>
            </section>
          </div>
        </div>
      ) : step === 'phase' ? (
        <div className="sim-layout" key="phase">
          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">1</span> What the receiver receives <small>&mdash; carrier phase of every satellite at once</small></h2>
              <canvas ref={phaseRef} className="gn-canvas" width={PHZ_W} height={PHZ_H} />
              <div className="control-grid">
                <label>Rover position <b>{roverOffset.toFixed(2)} m</b><input type="range" min="-15" max="15" step="0.1" value={roverOffset} onChange={(e) => setRoverOffset(Number(e.target.value))} /></label>
                <label>Satellites in view <b>{numSat}</b><input type="range" min="4" max="6" step="1" value={numSat} onChange={(e) => { setNumSat(Number(e.target.value)); setSel((s) => Math.min(s, Number(e.target.value) - 1)); }} /></label>
              </div>
              <div className="gn-legend">
                <span><i className="gn-dot" style={{ background: '#e8eff5' }} /> receiver replica (clock)</span>
                <span>coloured vectors = each satellite&rsquo;s carrier</span>
                <span>angle from replica = measured phase φ</span>
              </div>
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">2</span> Carrier phase &amp; the receiver clock</h2>
              <div className="gn-note">The receiver generates its own copy of the carrier, driven by <b>its clock</b>. Correlating each incoming satellite signal against that replica gives the <b>phase difference</b> — the angle of each vector on the dial. All satellites are measured <b>at the same instant</b>, against the <b>same</b> receiver clock.</div>
              <div className="gn-eq">Φ<sub>i</sub> = (N<sub>i</sub> + φ<sub>i</sub>) · λ &nbsp; + &nbsp; c·δt<sub>rx</sub><br />φ known to <b>~2 mm</b> &nbsp; λ = 19.03 cm &nbsp; N = <b>?</b></div>
              <div className="gn-note">The fractional phase φ is measured to about <b>1 % of a cycle ≈ 2 mm</b> — a hundred times finer than the code — but the whole-cycle count <b>N</b> is unknown, and the <b>receiver-clock error δt</b> adds the <b>same</b> extra phase to every satellite.</div>
              <div className="gn-sub">The two observables</div>
              <table className="gn-tbl">
                <thead><tr><th>Observable</th><th>Precision</th><th>Ambiguous?</th></tr></thead>
                <tbody>
                  <tr><td>Code pseudorange</td><td>~1–3 m</td><td>no</td></tr>
                  <tr><td>Carrier phase</td><td>~2 mm</td><td>yes (integer N)</td></tr>
                </tbody>
              </table>
              <div className="gn-note good">Because the clock error is <b>common</b> to all satellites, <b>differencing</b> between satellites (and a base station) cancels it — and lets the integer N be found. That is <b>double differencing</b> &rarr; step 3.</div>
            </section>
          </div>
        </div>
      ) : (
        <div className="sim-layout" key="rtk">
          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">1</span> Tracking one satellite&rsquo;s carrier <small>&mdash; G{fs.prn}</small></h2>
              <canvas ref={trackRef} className="gn-canvas" width={TRACK_W} height={TRACK_H} />
              <div className="gn-legend">
                <span><i className="gn-dot" style={{ background: fs.color }} /> incoming carrier</span>
                <span><i className="gn-dot" style={{ background: '#e8eff5' }} /> receiver replica (locked)</span>
                <span><i className="gn-dot" style={{ background: '#4ade80' }} /> measured phase φ</span>
              </div>
              <div className="gn-sub" style={{ marginTop: 12 }}>Using the code range to find N</div>
              <canvas ref={nlineRef} className="gn-canvas" width={NL_W} height={NL_H} />
              <div className="gn-btnrow">
                <button className="gn-btn primary" onClick={play}>▶ Find N</button>
                <span className="gn-chk">the code range picks the nearest carrier cycle</span>
              </div>
              <div className="control-grid" style={{ marginTop: 8 }}>
                <label>Focus satellite <b>G{fs.prn}</b><input type="range" min="0" max={numSat - 1} step="1" value={focusIdx} onChange={(e) => setSel(Number(e.target.value))} /></label>
                <label>Code range noise <b>{smoothed >= 1 ? `${smoothed.toFixed(2)} m` : `${(smoothed * 100).toFixed(0)} cm`}</b><input type="range" min="0.2" max="6" step="0.1" value={codeNoise} onChange={(e) => setCodeNoise(Number(e.target.value))} /></label>
              </div>
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">2</span> How the phase is tracked &amp; N is found</h2>
              <div className="gn-note"><b>Tracking.</b> The receiver spins up a replica of the carrier and a phase-locked loop keeps it aligned with the incoming signal. It reads the <b>fractional phase</b> φ = <b>{fs.phaseFrac.toFixed(3)} cyc</b> to about <b>2 mm</b> and counts whole cycles as they slip by — but the number of cycles present when it first locked, the integer <b>N</b>, is unknown.</div>
              <div className="gn-eq">range R = (N + φ) · λ<br />so &nbsp; N = round( R / λ − φ )</div>
              <div className="gn-note"><b>Finding N.</b> The <b>code</b> gives a rough range ρ (here the clean, double-differenced range with clocks &amp; atmosphere removed, carrier-smoothed to a few cm). The true range must be a whole number of wavelengths plus φ, so the carrier lays down candidate ranges every <b>19 cm</b>; the one nearest ρ is the integer <b>N</b>.</div>
              <div className="gn-eq">N = round( <b>{codeRange.toFixed(2)}</b> / 0.1903 − {fs.phaseFrac.toFixed(3)} ) = <b>{Nest.toLocaleString()}</b><br />R = (N + φ)·λ = <b>{fixedRange.toFixed(3)} m</b></div>
              <div className="gn-sub">Longitude of the rover</div>
              <div className="gn-lon">
                <div className="gn-lonrow"><span>truth</span><b style={{ color: '#16202c' }}>{lonStr(roverOffset)}&deg;E</b></div>
                <div className="gn-lonrow code"><span>code only (±{Math.abs(codeErr).toFixed(1)} m)</span><b>{lonStr(data.code.Rx)}&deg;E</b></div>
                <div className="gn-lonrow rtk"><span>phase, N fixed (±{(rtkErr * 100).toFixed(0)} cm)</span><b>{lonStr(roverOffset + rtkErr * (noise[0] || 0.3))}&deg;E</b></div>
              </div>
              <div className="gn-note good">Repeating this for every satellite (a double-difference between satellites removes the receiver clock) fixes all the integers — then the millimetre carrier phase, not the metre-level code, sets the rover longitude.</div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
