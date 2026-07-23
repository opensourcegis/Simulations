import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './ranging.css';

const C = 299792458; // speed of light, m/s
const DMAX = 300; // metres (full-scale of the scene)
const SCENE_W = 700; const SCENE_H = 300;
const TIME_W = 700; const TIME_H = 200;

const tofNs = (R) => (2 * R / C) * 1e9; // round-trip time in nanoseconds
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// A short oscillating wave packet (sine under a Gaussian envelope) — used so the
// outgoing pulse and the returning echo actually look like waves.
function wavePacket(ctx, cx, yBase, color, amp, half, k, phase = 0) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.beginPath();
  for (let x = -half; x <= half; x += 2) {
    const env = Math.exp(-((x / (half * 0.55)) ** 2));
    const y = yBase - amp * env * Math.sin(x * k + phase);
    const px = cx + x;
    if (x === -half) ctx.moveTo(px, y); else ctx.lineTo(px, y);
  }
  ctx.stroke();
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(cx, yBase, 4, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// PULSED (time-of-flight) scene.  prog: 0..1 over one round trip.
// ---------------------------------------------------------------------------
function drawPulseScene(ctx, { distance, prog, active }) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const g = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  g.addColorStop(0, '#0e1e2e'); g.addColorStop(1, '#0a1420');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  const y = 150; const sensorX = 70;
  const targetX = sensorX + (distance / DMAX) * 560;

  ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, y + 60); ctx.lineTo(SCENE_W - 20, y + 60); ctx.stroke();
  ctx.fillStyle = '#7d8fa1'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let d = 0; d <= DMAX; d += 50) { const x = sensorX + (d / DMAX) * 560; ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.beginPath(); ctx.moveTo(x, y + 55); ctx.lineTo(x, y + 65); ctx.stroke(); ctx.fillStyle = '#7d8fa1'; ctx.fillText(`${d}`, x, y + 80); }
  ctx.textAlign = 'left'; ctx.fillText('m', SCENE_W - 40, y + 80);

  ctx.strokeStyle = 'rgba(90,200,232,.22)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sensorX + 18, y); ctx.lineTo(targetX, y); ctx.stroke(); ctx.setLineDash([]);

  ctx.fillStyle = '#5b6b7a'; ctx.fillRect(targetX, y - 42, 16, 90);
  ctx.fillStyle = '#41505e'; ctx.fillRect(targetX + 16, y - 42, 6, 90);
  ctx.fillStyle = '#8ea3b5'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('target', targetX + 8, y - 52); ctx.textAlign = 'left';

  ctx.fillStyle = '#e8eff5'; ctx.strokeStyle = '#0b2434'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(sensorX - 34, y - 20, 52, 40, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#55c8e8'; ctx.beginPath(); ctx.arc(sensorX + 16, y, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0b2434'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('LiDAR', sensorX - 8, y + 4); ctx.textAlign = 'left';

  if (active) {
    const outbound = prog < 0.5;
    const frac = outbound ? prog / 0.5 : 1 - (prog - 0.5) / 0.5;
    const px = sensorX + 18 + frac * (targetX - sensorX - 18);
    wavePacket(ctx, px, y, outbound ? '#5ad1ff' : '#ffae4d', 15, 34, 0.5, prog * 40);
    if (!outbound) { ctx.fillStyle = '#ffae4d'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('return echo', px, y - 44); ctx.textAlign = 'left'; }
    if (outbound && frac > 0.9) { ctx.strokeStyle = 'rgba(255,174,77,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(targetX, y, 10 + (frac - 0.9) * 200, 0, TAU); ctx.stroke(); }
  }

  const t = prog * tofNs(distance);
  ctx.fillStyle = '#dbe9f2'; ctx.font = '700 20px "Segoe UI", system-ui'; ctx.textAlign = 'left';
  ctx.fillText(`t = ${t.toFixed(0)} ns`, 44, 42);
  ctx.fillStyle = '#7ee0c4'; ctx.font = '600 13px system-ui';
  ctx.fillText(`range = c · t / 2 = ${(C * (t * 1e-9) / 2).toFixed(1)} m`, 44, 64);
}

// Pulsed timing diagram: transmitted + received wave packets on a time axis.
function drawPulseTiming(ctx, { distance, prog, active, pulseWidth }) {
  ctx.clearRect(0, 0, TIME_W, TIME_H);
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, TIME_W, TIME_H);
  const left = 60; const right = TIME_W - 24; const mid = TIME_H / 2 + 6; const top = 30;
  const tMax = tofNs(DMAX) * 1.05;
  const X = (ns) => left + (ns / tMax) * (right - left);

  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(left, mid); ctx.lineTo(right, mid); ctx.stroke();
  ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let ns = 0; ns <= tMax; ns += 400) { const x = X(ns); ctx.strokeStyle = 'rgba(140,163,181,.16)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, TIME_H - 24); ctx.stroke(); ctx.fillStyle = '#8ea3b5'; ctx.fillText(`${ns}`, x, TIME_H - 10); }
  ctx.textAlign = 'left'; ctx.fillText('time (ns)', right - 54, TIME_H - 10);

  const half = clamp((pulseWidth / tMax) * (right - left) * 1.6, 10, 60);
  const packet = (cx, color, label) => { wavePacket(ctx, cx, mid, color, 30, half, 0.36); ctx.fillStyle = color; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, cx, top - 8); ctx.textAlign = 'left'; };

  const tof = tofNs(distance);
  packet(X(0), '#5ad1ff', 'TX (emitted)');
  const nowNs = prog * tof;
  if (!active || prog >= 1) packet(X(tof), '#ffae4d', 'RX (return wave)');
  else if (prog > 0.5) { ctx.globalAlpha = (prog - 0.5) / 0.5; packet(X(nowNs), '#ffae4d', 'RX (return wave)'); ctx.globalAlpha = 1; }

  if (!active || prog >= 1) {
    ctx.strokeStyle = '#f6c85f'; ctx.lineWidth = 1.5; const yb = top - 2;
    ctx.beginPath(); ctx.moveTo(X(0), yb); ctx.lineTo(X(tof), yb); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0), yb - 4); ctx.lineTo(X(0), yb + 4); ctx.moveTo(X(tof), yb - 4); ctx.lineTo(X(tof), yb + 4); ctx.stroke();
    ctx.fillStyle = '#f6c85f'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`Δt = ${tof.toFixed(0)} ns`, (X(0) + X(tof)) / 2, yb - 5); ctx.textAlign = 'left';
  }
  if (active && prog < 1) { ctx.strokeStyle = 'rgba(126,224,196,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(nowNs), top); ctx.lineTo(X(nowNs), TIME_H - 24); ctx.stroke(); ctx.setLineDash([]); }
}

// ---------------------------------------------------------------------------
// CONTINUOUS-WAVE (phase) scene: an unbroken modulation wave runs out to the
// target and the reflected wave runs back, so the round trip spans 2R/λ cycles.
// ---------------------------------------------------------------------------
function drawCwScene(ctx, { distance, lambda, theta }) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const g = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  g.addColorStop(0, '#0e1e2e'); g.addColorStop(1, '#0a1420');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  const sensorX = 70; const targetX = sensorX + (distance / DMAX) * 560;
  const pxPerM = 560 / DMAX; const lambdaPx = lambda * pxPerM;
  const outY = 116; const backY = 190;

  // ruler
  ctx.fillStyle = '#7d8fa1'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 250); ctx.lineTo(SCENE_W - 20, 250); ctx.stroke();
  for (let d = 0; d <= DMAX; d += 50) { const x = sensorX + (d / DMAX) * 560; ctx.beginPath(); ctx.moveTo(x, 245); ctx.lineTo(x, 255); ctx.stroke(); ctx.fillText(`${d}`, x, 268); }
  ctx.textAlign = 'left'; ctx.fillText('m', SCENE_W - 40, 268);

  const sineAlong = (yBase, x0, x1, color, phase, dir) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.beginPath();
    const step = x1 > x0 ? 3 : -3;
    for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += step) {
      const y = yBase - 13 * Math.sin((TAU / lambdaPx) * (x - sensorX) - dir * phase);
      if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  // outgoing (cyan) above, returning (orange) below — returning carries the full round-trip phase
  sineAlong(outY, sensorX + 18, targetX, '#5ad1ff', theta, 1);
  const roundTripPhase = theta + (TAU / lambdaPx) * 2 * (targetX - sensorX - 18);
  sineAlong(backY, targetX, sensorX + 18, '#ffae4d', roundTripPhase, -1);

  // wavelength marker
  if (lambdaPx < 520 && targetX - sensorX - 18 > lambdaPx) {
    ctx.strokeStyle = 'rgba(246,200,95,.9)'; ctx.lineWidth = 1.4;
    const mx = sensorX + 40;
    ctx.beginPath(); ctx.moveTo(mx, outY - 22); ctx.lineTo(mx + lambdaPx, outY - 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, outY - 26); ctx.lineTo(mx, outY - 18); ctx.moveTo(mx + lambdaPx, outY - 26); ctx.lineTo(mx + lambdaPx, outY - 18); ctx.stroke();
    ctx.fillStyle = '#f6c85f'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('λ', mx + lambdaPx / 2, outY - 28); ctx.textAlign = 'left';
  }

  // target + sensor
  ctx.fillStyle = '#5b6b7a'; ctx.fillRect(targetX, 96, 16, 118);
  ctx.fillStyle = '#41505e'; ctx.fillRect(targetX + 16, 96, 6, 118);
  ctx.fillStyle = '#e8eff5'; ctx.strokeStyle = '#0b2434'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(sensorX - 34, 133, 52, 44, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0b2434'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('LiDAR', sensorX - 8, 158); ctx.textAlign = 'left';
  ctx.fillStyle = '#5ad1ff'; ctx.font = '600 11px system-ui'; ctx.fillText('transmitted →', sensorX + 26, outY - 2);
  ctx.fillStyle = '#ffae4d'; ctx.fillText('← reflected (return wave)', sensorX + 26, backY + 24);

  const cycles = 2 * distance / lambda;
  ctx.fillStyle = '#dbe9f2'; ctx.font = '700 15px "Segoe UI", system-ui';
  ctx.fillText(`round trip 2R = ${cycles.toFixed(2)} × λ`, 44, 34);
}

// CW phase chart: reference (TX) and received (RX) sinusoids with Δφ + phasor.
function drawPhaseChart(ctx, { phi, theta }) {
  ctx.clearRect(0, 0, TIME_W, TIME_H);
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, TIME_W, TIME_H);
  const left = 54; const right = TIME_W - 150; const mid = TIME_H / 2; const A = 46;
  const cycles = 2.4; const periodPx = (right - left) / cycles;
  const k = TAU / periodPx;

  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(left, mid); ctx.lineTo(right, mid); ctx.stroke();

  const wave = (phase, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); for (let x = left; x <= right; x += 2) { const y = mid - A * Math.sin(k * (x - left) + theta - phase); if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); };
  wave(0, '#5ad1ff', 2.6); // TX reference
  wave(phi, '#ffae4d', 2.6); // RX, lagging by φ

  // Δφ bracket between a TX zero-crossing (rising) and the RX one
  const shiftPx = (phi / TAU) * periodPx;
  const x0 = left + periodPx * 0.5;
  ctx.strokeStyle = '#f6c85f'; ctx.lineWidth = 1.5; const yb = mid + A + 16;
  ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x0 + shiftPx, yb); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, yb - 4); ctx.lineTo(x0, yb + 4); ctx.moveTo(x0 + shiftPx, yb - 4); ctx.lineTo(x0 + shiftPx, yb + 4); ctx.stroke();
  ctx.fillStyle = '#f6c85f'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(`Δφ = ${(phi * 180 / Math.PI).toFixed(0)}°`, x0 + shiftPx / 2, yb + 16); ctx.textAlign = 'left';

  ctx.fillStyle = '#5ad1ff'; ctx.font = '600 11px system-ui'; ctx.fillText('TX reference', left, 16);
  ctx.fillStyle = '#ffae4d'; ctx.fillText('RX received (phase-shifted)', left + 92, 16);

  // phasor
  const cx = right + 66; const cy = mid; const r = 46;
  ctx.strokeStyle = 'rgba(140,163,181,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  const arrow = (ang, color) => { const ex = cx + r * Math.cos(ang); const ey = cy - r * Math.sin(ang); ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, TAU); ctx.fill(); };
  arrow(theta, '#5ad1ff'); arrow(theta - phi, '#ffae4d');
  ctx.strokeStyle = 'rgba(246,200,95,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 15, -theta, -(theta - phi), phi <= 0); ctx.stroke();
  ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('phasor', cx, cy + r + 15); ctx.textAlign = 'left';
}

// Ambiguity-resolution number line: the fine tone allows a comb of candidate
// ranges (every λ/2); the coarse tone's unambiguous estimate picks the right
// one, which is exactly how the integer N is found.
const COMB_W = 640; const COMB_H = 150;
function drawComb(ctx, { unambFine, fracFine, coarseR, N }) {
  ctx.clearRect(0, 0, COMB_W, COMB_H);
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, COMB_W, COMB_H);
  const left = 44; const right = COMB_W - 20; const baseY = COMB_H - 30;
  const X = (m) => left + (m / DMAX) * (right - left);

  ctx.fillStyle = '#8ea3b5'; ctx.font = '10.5px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('cyan: possible ranges from fine phase (spaced λ/2)', left, 15);
  ctx.fillStyle = '#ffae4d'; ctx.fillText('orange: coarse estimate selects one', left + 316, 15);

  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(left, baseY); ctx.lineTo(right, baseY); ctx.stroke();
  ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let d = 0; d <= DMAX; d += 50) { const x = X(d); ctx.strokeStyle = 'rgba(140,163,181,.2)'; ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, baseY + 5); ctx.stroke(); ctx.fillStyle = '#8ea3b5'; ctx.fillText(`${d}`, x, baseY + 17); }
  ctx.textAlign = 'left'; ctx.fillText('m', right - 6, baseY + 17);

  // coarse estimate + its uncertainty band (±λ_fine/4): exactly one candidate lands inside
  const bandHalf = unambFine * 0.5;
  const bx0 = X(Math.max(0, coarseR - bandHalf)); const bx1 = X(Math.min(DMAX, coarseR + bandHalf));
  ctx.fillStyle = 'rgba(255,174,77,.14)'; ctx.fillRect(bx0, baseY - 66, bx1 - bx0, 66);
  ctx.strokeStyle = '#ffae4d'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(coarseR), baseY - 70); ctx.lineTo(X(coarseR), baseY); ctx.stroke();
  ctx.fillStyle = '#ffae4d'; ctx.beginPath(); ctx.moveTo(X(coarseR), baseY - 70); ctx.lineTo(X(coarseR) - 5, baseY - 80); ctx.lineTo(X(coarseR) + 5, baseY - 80); ctx.closePath(); ctx.fill();
  ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`coarse R ≈ ${coarseR.toFixed(0)} m`, X(coarseR), baseY - 84); ctx.textAlign = 'left';

  const maxN = Math.floor((DMAX - fracFine * unambFine) / unambFine);
  for (let n = 0; n <= maxN; n += 1) {
    const Rn = (n + fracFine) * unambFine; const x = X(Rn); const hit = n === N;
    ctx.strokeStyle = hit ? '#4ade80' : 'rgba(90,209,255,.65)'; ctx.lineWidth = hit ? 2.6 : 1.2;
    ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, baseY - (hit ? 52 : 18)); ctx.stroke();
    if (hit) { ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(x, baseY - 52, 3.5, 0, TAU); ctx.fill(); ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`N=${n}`, x, baseY - 58); ctx.textAlign = 'left'; }
  }
}

export default function LidarRanging() {
  const [mode, setMode] = useState('pulsed'); // 'pulsed' | 'phase'
  const [distance, setDistance] = useState(120);
  const [speed, setSpeed] = useState(1);
  const [continuous, setContinuous] = useState(false);
  const [pulseWidth, setPulseWidth] = useState(10); // ns
  const [prf, setPrf] = useState(100); // kHz
  const [fMod, setFMod] = useState(13); // MHz (CW modulation frequency)
  const [measured, setMeasured] = useState(null);

  const sceneRef = useRef(null); const chartRef = useRef(null); const combRef = useRef(null);
  const params = useRef({}); const anim = useRef({ active: false, start: 0, prog: 0 });
  params.current = { mode, distance, speed, continuous, pulseWidth, fMod };

  const fire = () => { anim.current = { active: true, start: performance.now(), prog: 0 }; };

  useEffect(() => {
    let raf;
    const loop = (now) => {
      const p = params.current; const a = anim.current;
      const sc = sceneRef.current; const ch = chartRef.current;
      if (p.mode === 'pulsed') {
        if (a.active) {
          const dur = (0.7 + (p.distance / DMAX) * 3.0) / p.speed;
          a.prog = clamp((now - a.start) / (dur * 1000), 0, 1);
          if (a.prog >= 1) { const tof = tofNs(p.distance); setMeasured({ range: C * (tof * 1e-9) / 2 }); if (p.continuous) { a.start = now; a.prog = 0; } else { a.active = false; } }
        }
        if (sc) drawPulseScene(sc.getContext('2d'), { distance: p.distance, prog: a.prog, active: a.active });
        if (ch) drawPulseTiming(ch.getContext('2d'), { distance: p.distance, prog: a.prog, active: a.active, pulseWidth: p.pulseWidth });
      } else {
        const f = p.fMod * 1e6; const lambda = C / f;
        const phi = ((2 * TAU * p.distance / lambda) % TAU + TAU) % TAU;
        const theta = (now * 0.0018 * p.speed) % TAU;
        if (sc) drawCwScene(sc.getContext('2d'), { distance: p.distance, lambda, theta });
        if (ch) drawPhaseChart(ch.getContext('2d'), { phi, theta });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Pulsed readouts
  const tof = tofNs(distance); const oneWay = tof / 2;
  const rangeRes = C * (pulseWidth * 1e-9) / 2;
  const rMax = C / (2 * prf * 1e3);
  // Phase readouts (fine tone)
  const f = fMod * 1e6; const lambda = C / f; const unamb = lambda / 2;
  const ratio = distance / unamb; const N = Math.floor(ratio); const frac = ratio - N;
  const phiDeg = frac * 360; const rPhase = frac * unamb; // ambiguous (phase-only) range
  const phasePrecision = unamb / 360; // metres per degree of phase
  // Coarse tone used to resolve N: λ/2 spans the whole scene, so it is unambiguous.
  const F_COARSE = 0.45e6; const lambdaCoarse = C / F_COARSE; const unambCoarse = lambdaCoarse / 2;
  const phiCoarseDeg = (distance / unambCoarse) * 360; // no wrap: distance < unambCoarse
  const coarseR = (phiCoarseDeg / 360) * unambCoarse; // = distance (coarse, unambiguous)
  const Ncalc = Math.round(coarseR / unamb - frac);

  useEffect(() => {
    if (mode === 'phase' && combRef.current) drawComb(combRef.current.getContext('2d'), { unambFine: unamb, fracFine: frac, coarseR, N: Ncalc });
  }, [mode, distance, fMod, unamb, frac, coarseR, Ncalc]);

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>LiDAR Ranging <span className="native-badge">Native React</span></h1>
          <span className="sub">Two ways to turn light into distance: pulse timing and continuous-wave phase</span>
        </div>
        <span className="score-chip">c &#8776; <b>3&times;10&#8312; m/s</b></span>
      </header>

      <div className="rng-modes">
        <button className={`rng-seg ${mode === 'pulsed' ? 'on' : ''}`} onClick={() => setMode('pulsed')}>Pulsed &mdash; time of flight</button>
        <button className={`rng-seg ${mode === 'phase' ? 'on' : ''}`} onClick={() => setMode('phase')}>Continuous wave &mdash; phase</button>
      </div>

      {mode === 'pulsed' ? (
        <div className="sim-layout">
          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">1</span> Fire a pulse <small>&mdash; watch it travel out and the wave return</small></h2>
              <canvas ref={sceneRef} className="rng-canvas" width={SCENE_W} height={SCENE_H} />
              <div className="rng-fire">
                <button className="rng-btn" onClick={fire}>▶ Fire pulse</button>
                <label className="rng-chk"><input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} /> continuous</label>
                <span style={{ flex: 1 }} />
                <label className="rng-chk">slow-mo<input type="range" min="0.3" max="4" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ accentColor: '#0f8a4d' }} /></label>
              </div>
              <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Target distance R <b>{distance} m</b><input type="range" min="10" max={DMAX} step="1" value={distance} onChange={(e) => setDistance(Number(e.target.value))} /></label>
              </div>
              <div className="rng-legend">
                <span><i className="rng-swatch" style={{ background: '#5ad1ff' }} /> outgoing pulse</span>
                <span><i className="rng-swatch" style={{ background: '#ffae4d' }} /> returning echo wave</span>
                <span><i className="rng-swatch" style={{ background: '#7ee0c4' }} /> live range estimate</span>
              </div>
            </section>

            <section className="sim-panel">
              <h2><span className="stepno">2</span> Timing measurement <small>&mdash; the transmitted &amp; return waveforms</small></h2>
              <canvas ref={chartRef} className="rng-canvas" width={TIME_W} height={TIME_H} />
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                <div><span>round-trip Δt</span><b>{tof.toFixed(0)} ns</b></div>
                <div><span>one-way time</span><b>{oneWay.toFixed(0)} ns</b></div>
                <div><span>measured range</span><b className="orange">{measured ? measured.range.toFixed(1) : '—'} m</b></div>
              </div>
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">3</span> The ranging equation</h2>
              <div className="equation big">R = c &middot; Δt / 2</div>
              <div className="equation big">R = 3&times;10&#8312; &middot; {(tof * 1e-9).toExponential(2)} / 2 = <b>{distance.toFixed(1)} m</b></div>
              <div className="rng-note"><b>Why divide by two?</b> The clock measures the <b>round trip</b> — out to the target and back — so the light travels <b>2R</b>. Halving the total path gives the one-way distance. Light covers ~0.3 m per nanosecond, so a 1 ns timing error is a 15 cm range error.</div>
              <div className="rng-sub">Range resolution</div>
              <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Pulse width τ <b>{pulseWidth} ns</b><input type="range" min="1" max="40" step="1" value={pulseWidth} onChange={(e) => setPulseWidth(Number(e.target.value))} /></label>
              </div>
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                <div><span>ΔR = c·τ / 2</span><b>{rangeRes.toFixed(2)} m</b></div>
                <div><span>meaning</span><b style={{ fontSize: 12 }}>closest separable</b></div>
              </div>
              <div className="rng-note"><b>Shorter pulses see finer detail.</b> Two surfaces closer than ΔR return overlapping echoes the sensor can&rsquo;t separate.</div>
              <div className="rng-sub">Maximum unambiguous range</div>
              <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Pulse rate (PRF) <b>{prf} kHz</b><input type="range" min="10" max="400" step="5" value={prf} onChange={(e) => setPrf(Number(e.target.value))} /></label>
              </div>
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                <div><span>R_max = c / (2·PRF)</span><b>{rMax >= 1000 ? `${(rMax / 1000).toFixed(2)} km` : `${rMax.toFixed(0)} m`}</b></div>
                <div><span>target R</span><b className={distance > rMax ? 'orange' : ''}>{distance} m</b></div>
              </div>
              <div className="rng-note"><b>Fire too fast and range wraps.</b> If the next pulse leaves before the last echo returns, the sensor can&rsquo;t tell which pulse an echo belongs to.</div>
            </section>
          </div>
        </div>
      ) : (
        <div className="sim-layout">
          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">1</span> Continuous modulated wave <small>&mdash; it runs to the target and back</small></h2>
              <canvas ref={sceneRef} className="rng-canvas" width={SCENE_W} height={SCENE_H} />
              <div className="control-grid">
                <label>Target distance R <b>{distance} m</b><input type="range" min="10" max={DMAX} step="1" value={distance} onChange={(e) => setDistance(Number(e.target.value))} /></label>
                <label>Modulation frequency f <b>{fMod} MHz</b><input type="range" min="1" max="30" step="1" value={fMod} onChange={(e) => setFMod(Number(e.target.value))} /></label>
              </div>
              <div className="rng-legend">
                <span><i className="rng-swatch" style={{ background: '#5ad1ff' }} /> transmitted wave</span>
                <span><i className="rng-swatch" style={{ background: '#ffae4d' }} /> reflected return wave</span>
                <span>λ = c / f = <b style={{ fontFamily: 'monospace', color: '#16202c' }}>{lambda.toFixed(1)} m</b></span>
              </div>
            </section>

            <section className="sim-panel">
              <h2><span className="stepno">2</span> Phase measurement <small>&mdash; the return lags the reference by Δφ</small></h2>
              <canvas ref={chartRef} className="rng-canvas" width={TIME_W} height={TIME_H} />
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                <div><span>phase shift Δφ</span><b>{phiDeg.toFixed(0)}°</b></div>
                <div><span>wavelength λ</span><b>{lambda.toFixed(1)} m</b></div>
                <div><span>unambiguous λ/2</span><b>{unamb.toFixed(1)} m</b></div>
              </div>
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">3</span> Distance from phase</h2>
              <div className="equation big">Δφ = 2π · (2R / λ)</div>
              <div className="equation big">R = (Δφ / 2π) · (λ / 2) = <b>{rPhase.toFixed(2)} m</b> <span style={{ color: '#7d8fa1' }}>+ N · {unamb.toFixed(1)} m</span></div>
              <div className="rng-note"><b>Phase gives the fraction of a wavelength.</b> The receiver compares the returned modulation to the transmitted reference and measures the phase lag Δφ. That lag pins the distance to a fraction of λ/2 — here <b>{(phiDeg / 360).toFixed(3)}</b> of {unamb.toFixed(1)} m = <b>{rPhase.toFixed(2)} m</b> — with very fine precision (≈ {(phasePrecision * 100).toFixed(1)} cm per degree).</div>

              <div className="rng-sub">How is N calculated? — a second, coarse tone</div>
              <div className="rng-note">
                Phase alone repeats every <b>λ/2 = {unamb.toFixed(1)} m</b>, so it can&rsquo;t tell {rPhase.toFixed(1)} m from {(rPhase + unamb).toFixed(1)} m from {(rPhase + 2 * unamb).toFixed(1)} m… To find <b>N</b>, the sensor adds a <b>coarse modulation tone</b> whose half-wavelength is longer than the whole measurement range, so its phase is <b>unambiguous</b> — a rough distance that tells you which fine cycle you&rsquo;re in.
              </div>
              <canvas ref={combRef} className="rng-canvas" width={COMB_W} height={COMB_H} />
              <div className="equation big" style={{ marginTop: 10 }}>coarse f = 0.45 MHz → λ/2 = {unambCoarse.toFixed(0)} m → R<sub>coarse</sub> ≈ {coarseR.toFixed(1)} m</div>
              <div className="equation big">N = round( R<sub>coarse</sub> / (λ/2) − Δφ/360° ) = round( {(coarseR / unamb).toFixed(2)} − {(frac).toFixed(3)} ) = <b>{Ncalc}</b></div>
              <div className="equation big">R = (N + Δφ/360°) · λ/2 = ({Ncalc} + {(frac).toFixed(3)}) · {unamb.toFixed(2)} = <b>{((Ncalc + frac) * unamb).toFixed(2)} m</b></div>
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                <div><span>coarse R (fixes N)</span><b>{coarseR.toFixed(0)} m</b></div>
                <div><span>whole cycles N</span><b>{Ncalc}</b></div>
                <div><span>fine R (precise)</span><b className="orange">{((Ncalc + frac) * unamb).toFixed(2)} m</b></div>
              </div>
              <div className="rng-note">
                The coarse reading only has to be accurate to within <b>±λ/4 = {(unamb / 2).toFixed(1)} m</b> — just enough to pick the right cyan tick above. The fine tone then supplies the precise fraction (≈ {(phasePrecision * 100).toFixed(1)} cm per degree). <b>Higher fine f → finer precision but more candidate cycles to disambiguate.</b>
              </div>
              <div className="rng-note" style={{ borderLeftColor: '#0f8a4d' }}><b>Pulsed vs phase.</b> Pulsed timing handles long, unambiguous ranges directly; continuous-wave phase gives millimetre-level precision but must resolve N — often with several modulation frequencies, coarse-to-fine.</div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
