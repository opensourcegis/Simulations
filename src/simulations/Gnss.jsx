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

const PANEL_W = 700; const PANEL_H = 220;
// Carrier wave + fractional phase + candidate-range comb (ambiguity).
function drawPhase(ctx, { frac, t }) {
  ctx.clearRect(0, 0, PANEL_W, PANEL_H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, PANEL_W, PANEL_H);
  const left = 20; const right = PANEL_W - 20; const midY = 66; const A = 34; const cycles = 6; const per = (right - left) / cycles;
  // carrier
  ctx.strokeStyle = '#5ad1ff'; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = left; x <= right; x += 2) { const ph = (x - left) / per * TAU - t * 2; const y = midY - A * Math.sin(ph); if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.stroke();
  // one wavelength marker
  ctx.strokeStyle = '#f6c85f'; ctx.lineWidth = 1.4; const mx = left + per * 1;
  ctx.beginPath(); ctx.moveTo(mx, midY - A - 12); ctx.lineTo(mx + per, midY - A - 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mx, midY - A - 16); ctx.lineTo(mx, midY - A - 8); ctx.moveTo(mx + per, midY - A - 16); ctx.lineTo(mx + per, midY - A - 8); ctx.stroke();
  ctx.fillStyle = '#f6c85f'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('λ = 19.03 cm', mx + per / 2, midY - A - 18);
  // measured fractional phase marker
  const fx = left + (2 + frac) * per;
  ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(fx, midY - A - 4); ctx.lineTo(fx, midY + A + 4); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#4ade80'; ctx.fillText(`measured φ = ${(frac).toFixed(3)} cyc`, fx, midY + A + 20);
  ctx.textAlign = 'left';

  // candidate-range comb (ambiguity): ticks spaced λ, all consistent with φ
  const cy2 = 168; const cl = 40; const cr = PANEL_W - 20;
  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(cl, cy2); ctx.lineTo(cr, cy2); ctx.stroke();
  ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  const n = 9; const sp = (cr - cl) / n;
  for (let k = 0; k <= n; k += 1) {
    const x = cl + k * sp; ctx.strokeStyle = 'rgba(90,209,255,.75)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, cy2); ctx.lineTo(x, cy2 - 26); ctx.stroke();
    ctx.fillStyle = '#8ea3b5'; ctx.fillText(`N${k > n / 2 ? '+' : k < n / 2 ? '−' : ''}${k === n / 2 ? '' : Math.abs(k - n / 2)}`, x, cy2 + 14);
  }
  ctx.fillStyle = '#cdd9e3'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('range = (N + φ) · λ  — φ known to mm, but which whole cycle N?  →  each tick is a valid candidate', cl, cy2 - 34);
  ctx.textAlign = 'left';
}

const COMB_W = 700; const COMB_H = 300;
// Multi-satellite phase candidate-position combs; they align at one longitude.
function drawComb(ctx, { sats, roverX, codeRx, resolve }) {
  ctx.clearRect(0, 0, COMB_W, COMB_H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, COMB_W, COMB_H);
  const left = 60; const right = COMB_W - 20; const HALF = 2.2; // metres window around truth
  const X = (m) => left + ((m - (roverX - HALF)) / (2 * HALF)) * (right - left);
  const laneTop = 34; const laneH = 34; const gap = 14;

  ctx.fillStyle = '#8ea3b5'; ctx.font = '10.5px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('each satellite: possible rover longitudes one carrier cycle apart — only one column lines up for all', left - 4, 16);

  const fixed = resolve >= 1;
  sats.forEach((s, i) => {
    const y = laneTop + i * (laneH + gap); const ux = Math.abs((s.Sx - roverX) / Math.hypot(s.Sx - roverX, s.Sy));
    const dx = LAMBDA / ux; // longitude spacing for one cycle
    ctx.fillStyle = s.color; ctx.font = '600 10px system-ui'; ctx.textAlign = 'right'; ctx.fillText(`G${s.prn}`, left - 8, y + laneH / 2 + 3);
    ctx.textAlign = 'left'; ctx.fillStyle = '#7d8fa1'; ctx.font = '9px ui-monospace,monospace'; ctx.fillText(`${(dx * 100).toFixed(0)}cm`, left - 30, y + laneH / 2 + 14);
    ctx.strokeStyle = 'rgba(140,163,181,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, y + laneH); ctx.lineTo(right, y + laneH); ctx.stroke();
    for (let k = -30; k <= 30; k += 1) {
      const m = roverX + k * dx; if (m < roverX - HALF || m > roverX + HALF) continue;
      const x = X(m); const isTruth = k === 0;
      ctx.strokeStyle = isTruth && fixed ? '#4ade80' : s.color; ctx.globalAlpha = isTruth && fixed ? 1 : 0.7;
      ctx.lineWidth = isTruth && fixed ? 2.4 : 1.3;
      ctx.beginPath(); ctx.moveTo(x, y + laneH); ctx.lineTo(x, y + (isTruth && fixed ? 2 : laneH - 22)); ctx.stroke(); ctx.globalAlpha = 1;
    }
  });

  const bottom = laneTop + sats.length * (laneH + gap);
  // code position marker + uncertainty
  ctx.fillStyle = 'rgba(227,116,0,.14)';
  const bw = X(codeRx + 1.2) - X(codeRx - 1.2);
  ctx.fillRect(X(codeRx - 1.2), laneTop - 6, bw, bottom - laneTop);
  ctx.strokeStyle = '#e37400'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(codeRx), laneTop - 10); ctx.lineTo(X(codeRx), bottom); ctx.stroke();
  ctx.fillStyle = '#e37400'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('code ±m', X(codeRx), laneTop - 12);

  // resolve scan / consensus line
  if (resolve > 0 && resolve < 1) {
    const scanX = X(roverX - HALF) + (X(roverX + HALF) - X(roverX - HALF)) * resolve;
    ctx.strokeStyle = 'rgba(126,224,196,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(scanX, laneTop - 6); ctx.lineTo(scanX, bottom); ctx.stroke(); ctx.setLineDash([]);
  }
  if (fixed) {
    ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(roverX), laneTop - 8); ctx.lineTo(X(roverX), bottom + 4); ctx.stroke();
    ctx.fillStyle = '#4ade80'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('FIXED', X(roverX), bottom + 18);
  }
  // axis
  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let m = -2; m <= 2; m += 1) { const x = X(roverX + m); ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x, bottom + 4); ctx.stroke(); ctx.fillText(`${m > 0 ? '+' : ''}${m} m`, x, bottom + 28); }
  ctx.textAlign = 'left';
}

export default function Gnss() {
  const [step, setStep] = useState('signals');
  const [roverOffset, setRoverOffset] = useState(6);
  const [numSat, setNumSat] = useState(5);
  const [codeNoise, setCodeNoise] = useState(2.5);
  const [showBase, setShowBase] = useState(true);
  const [sel, setSel] = useState(0);

  const skyRef = useRef(null); const phaseRef = useRef(null); const combRef = useRef(null);
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

  params.current = { step, sats: data.sats, showBase, sel, roverX: roverOffset, codeRx: data.code.Rx };

  useEffect(() => {
    let raf; const t0 = performance.now();
    const loop = (now) => {
      const p = params.current; const t = (now - t0) / 1000;
      if (p.step === 'signals' && skyRef.current) drawSky(skyRef.current.getContext('2d'), { sats: p.sats, showBase: p.showBase, sel: p.sel, t });
      if (p.step === 'phase' && phaseRef.current) drawPhase(phaseRef.current.getContext('2d'), { frac: p.sats[p.sel].phaseFrac, t });
      if (p.step === 'rtk' && combRef.current) {
        const ra = resolveAnim.current; let resolve = ra.done ? 1 : 0;
        if (ra.playing) { const pr = (now - ra.start) / 1400; if (pr >= 1) { ra.playing = false; ra.done = true; resolve = 1; } else resolve = pr; }
        drawComb(combRef.current.getContext('2d'), { sats: p.sats, roverX: p.roverX, codeRx: p.codeRx, resolve });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop); return () => cancelAnimationFrame(raf);
  }, []);

  const codeErr = data.code.Rx - roverOffset;
  const rtkErr = 0.012; // cm-level once ambiguities are fixed
  const play = () => { resolveAnim.current = { playing: true, start: performance.now(), done: false }; };
  useEffect(() => { resolveAnim.current = { playing: false, start: 0, done: false }; }, [numSat, roverOffset, codeNoise]);

  const step2Idx = ['signals', 'phase', 'rtk'].indexOf(step) + 1;

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>GNSS Positioning <span className="native-badge">Native React</span></h1>
          <span className="sub">From satellite signals to a centimetre longitude: code ranging, carrier phase &amp; RTK ambiguity resolution</span>
        </div>
        <span className="score-chip">rover λ: <b>{lonStr(roverOffset, 7)}&deg;E</b></span>
      </header>

      <div className="gn-modes">
        <button className={`gn-seg ${step === 'signals' ? 'on' : ''}`} onClick={() => setStep('signals')}>1 · Signals &amp; code ranging</button>
        <button className={`gn-seg ${step === 'phase' ? 'on' : ''}`} onClick={() => setStep('phase')}>2 · Carrier phase &amp; ambiguity</button>
        <button className={`gn-seg ${step === 'rtk' ? 'on' : ''}`} onClick={() => setStep('rtk')}>3 · Differential GPS (RTK)</button>
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
              <h2><span className="stepno">1</span> Carrier-phase measurement <small>&mdash; satellite G{data.sats[sel].prn}</small></h2>
              <canvas ref={phaseRef} className="gn-canvas" width={PANEL_W} height={PANEL_H} />
              <div className="control-grid">
                <label>Which satellite <b>G{data.sats[sel].prn}</b><input type="range" min="0" max={numSat - 1} step="1" value={sel} onChange={(e) => setSel(Number(e.target.value))} /></label>
                <label>Rover position <b>{roverOffset.toFixed(2)} m</b><input type="range" min="-15" max="15" step="0.1" value={roverOffset} onChange={(e) => setRoverOffset(Number(e.target.value))} /></label>
              </div>
              <div className="gn-legend">
                <span><i className="gn-dot" style={{ background: '#5ad1ff' }} /> L1 carrier (λ = 19 cm)</span>
                <span><i className="gn-dot" style={{ background: '#4ade80' }} /> measured phase φ</span>
              </div>
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">2</span> Precise, but ambiguous</h2>
              <div className="gn-eq">Φ = (N + φ) · λ<br />φ = <b>{data.sats[sel].phaseFrac.toFixed(3)} cyc</b> &nbsp; λ = 19.03 cm &nbsp; N = <b>?</b></div>
              <div className="gn-note">The receiver can track the <b>fractional phase</b> φ of the 19 cm carrier to about <b>1 % of a cycle ≈ 2 mm</b> — a hundred times finer than the code. But it can&rsquo;t tell how many <b>whole</b> wavelengths N lie between satellite and antenna. Every candidate range (N + φ)·λ, spaced 19 cm apart, fits equally well.</div>
              <div className="gn-sub">The two observables</div>
              <table className="gn-tbl">
                <thead><tr><th>Observable</th><th>Precision</th><th>Ambiguous?</th></tr></thead>
                <tbody>
                  <tr><td>Code pseudorange</td><td>~1–3 m</td><td>no</td></tr>
                  <tr><td>Carrier phase</td><td>~2 mm</td><td>yes (integer N)</td></tr>
                </tbody>
              </table>
              <div className="gn-note good">The trick: the code fixes the <b>rough</b> range, so it says roughly which cycle N you are in. Finding the exact integer N — <b>&ldquo;fixing the ambiguity&rdquo;</b> — is done with a base station in step 3.</div>
            </section>
          </div>
        </div>
      ) : (
        <div className="sim-layout" key="rtk">
          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">1</span> Resolving the whole-cycle count <small>&mdash; where all satellites agree</small></h2>
              <canvas ref={combRef} className="gn-canvas" width={COMB_W} height={COMB_H} />
              <div className="gn-btnrow">
                <button className="gn-btn primary" onClick={play}>▶ Resolve ambiguity</button>
                <span className="gn-chk">each satellite&rsquo;s cycles land at different spacings — they coincide at just one longitude</span>
              </div>
              <div className="control-grid" style={{ marginTop: 8 }}>
                <label>Rover position <b>{roverOffset.toFixed(2)} m</b><input type="range" min="-15" max="15" step="0.1" value={roverOffset} onChange={(e) => setRoverOffset(Number(e.target.value))} /></label>
                <label>Code (P-code) noise <b>{codeNoise.toFixed(1)} m</b><input type="range" min="0.2" max="6" step="0.1" value={codeNoise} onChange={(e) => setCodeNoise(Number(e.target.value))} /></label>
              </div>
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">2</span> Differential GPS &amp; the rover longitude</h2>
              <div className="gn-note">A <b>base station</b> at a known point sees the same satellites with the same errors. <b>Differencing</b> rover − base cancels the satellite-clock and atmosphere errors; <b>double-differencing</b> between two satellites also cancels the receiver clocks, leaving a clean geometric equation with <b>integer</b> ambiguities.</div>
              <div className="gn-eq">∇Δφ = <b>∇Δρ</b>/λ + <b>N</b><sub>int</sub><br />rover − base, sat<sub>i</sub> − sat<sub>j</sub> &rArr; N is a whole number</div>
              <div className="gn-note">With the errors gone, the code position (good to ~1 m) plus the way each satellite&rsquo;s 19 cm cycles fall at <b>different longitude spacings</b> leaves only <b>one</b> integer set where every satellite agrees — that column is the fix.</div>
              <div className="gn-sub">Longitude of the rover</div>
              <div className="gn-lon">
                <div className="gn-lonrow"><span>truth</span><b style={{ color: '#16202c' }}>{lonStr(roverOffset)}&deg;E</b></div>
                <div className="gn-lonrow code"><span>code only (±{Math.abs(codeErr).toFixed(1)} m)</span><b>{lonStr(data.code.Rx)}&deg;E</b></div>
                <div className="gn-lonrow rtk"><span>RTK fixed (±{(rtkErr * 100).toFixed(0)} cm)</span><b>{lonStr(roverOffset + rtkErr * (noise[0] || 0.3))}&deg;E</b></div>
              </div>
              <div className="gn-note good">Fixing the integers collapses the metre-level code solution to a <b>centimetre</b> one — the extra decimal places of longitude that surveying depends on.</div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
