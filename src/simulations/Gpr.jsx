import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './gpr.css';

// ---------------------------------------------------------------------------
// Ground-Penetrating Radar (GPR).
//
// The antenna radiates a continuous electromagnetic wave into the ground as
// expanding wavefronts (not a single ray). A buried object re-radiates a
// return wave that spreads back to the surface. The receiver records the
// amplitude it sees over time — the A-scan wiggle — where the echo lands at
// the two-way travel time t = 2R/v (R = slant range, v = c/√εr). Move the GPR
// and each A-scan's echo sits at a different time; stacked side by side the
// wiggles' echoes trace out a hyperbola, whose apex time gives the depth
// d = v·t0/2.
// ---------------------------------------------------------------------------

const C = 0.2998; // speed of light, metres per nanosecond
const L = 4.0; // survey line length (m)
const D = 2.0; // displayed depth (m)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const vel = (epsr) => C / Math.sqrt(epsr); // m/ns
const twoWay = (x, obj, v) => (2 * Math.hypot(x - obj.x0, obj.depth)) / v; // ns

// A short oscillatory wave packet (a few cycles) — what one GPR echo looks
// like in time. τ, w in ns.
function packet(tau, w = 1.5) { return Math.cos(2 * Math.PI * 0.5 * tau) * Math.exp(-(tau * tau) / (w * w)); }
// The amplitude the receiver sees at antenna position x and listen-time `time`.
function amplitude(x, time, objs, v) {
  let a = 0.85 * packet(time - 1.5); // direct / surface coupling near t≈0
  for (const o of objs) { const R = Math.hypot(x - o.x0, o.depth); a += (1.1 / (1 + 0.9 * R)) * packet(time - (2 * R) / v); }
  return a;
}

// ---- cross-section geometry ----
const CW = 560; const CH = 360; const ML = 44; const MR = 16; const SURF = 96; const MB = 20;
const sxC = (x) => ML + (x / L) * (CW - ML - MR);
const szC = (d) => SURF + (d / D) * (CH - SURF - MB);
const PPM = (CW - ML - MR) / L; // pixels per metre (≈ isotropic with depth scale)

// ---- radargram + A-scan geometry ----
const RW = 640; const RH = 360; const RT = 26; const RB = 26;
const AX0 = 40; const AW = 118; const AXC = AX0 + AW / 2; // A-scan strip
const BL = AX0 + AW + 40; const RR = 14; // B-scan starts here
const plotW = RW - RR - BL; const plotH = RH - RT - RB;
const rx = (x) => BL + (x / L) * plotW;

function computeTmax(objs, v) { let t = 8; objs.forEach((o) => { const off = Math.max(o.x0, L - o.x0); t = Math.max(t, (2 * Math.hypot(off, o.depth)) / v); }); return t * 1.08; }

function drawCross(ctx, st, anim) {
  const { objs, epsr, antX, mode } = st; const v = vel(epsr); const tmax = computeTmax(objs, v);
  ctx.clearRect(0, 0, CW, CH);
  const air = ctx.createLinearGradient(0, 0, 0, SURF); air.addColorStop(0, '#0e1a27'); air.addColorStop(1, '#122232');
  ctx.fillStyle = air; ctx.fillRect(0, 0, CW, SURF);
  const gnd = ctx.createLinearGradient(0, SURF, 0, CH); gnd.addColorStop(0, '#3a2c1f'); gnd.addColorStop(1, '#241a12');
  ctx.fillStyle = gnd; ctx.fillRect(0, SURF, CW, CH - SURF);

  const ax = sxC(antX); const ay = SURF;

  // ---- Continuous wavefronts (clipped to the ground) ----
  ctx.save(); ctx.beginPath(); ctx.rect(0, SURF, CW, CH - SURF); ctx.clip();
  const NF = 3; // a train of wavefronts → continuous wave
  for (let k = 0; k < NF; k += 1) {
    const ph = ((anim.scan - k / NF) % 1 + 1) % 1; const tau = ph * tmax; const path = v * tau; // metres travelled
    const bright = k === 0;
    // outgoing wave: expanding semicircle from the antenna
    const rd = path * PPM;
    if (rd > 2 && rd < 640) { ctx.strokeStyle = bright ? 'rgba(246,200,95,.95)' : 'rgba(246,200,95,.32)'; ctx.lineWidth = bright ? 2.6 : 1.4; ctx.beginPath(); ctx.arc(ax, ay, rd, 0, Math.PI, false); ctx.stroke(); }
    // return wave: expanding circle from each object once the wave has reached it
    objs.forEach((o) => { const ox = sxC(o.x0); const oy = szC(o.depth); const R = Math.hypot(o.x0 - antX, o.depth); if (path > R) { const ru = (path - R) * PPM; if (ru < 640) { ctx.strokeStyle = bright ? 'rgba(126,224,196,.95)' : 'rgba(126,224,196,.34)'; ctx.lineWidth = bright ? 2.4 : 1.3; ctx.beginPath(); ctx.arc(ox, oy, ru, 0, Math.PI * 2); ctx.stroke(); } } });
  }
  ctx.restore();

  // surface line + labels
  ctx.strokeStyle = '#c9a06a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, SURF); ctx.lineTo(CW, SURF); ctx.stroke();
  ctx.fillStyle = '#8fd0ff'; ctx.font = '600 11px system-ui'; ctx.fillText('air', 8, 18);
  ctx.fillStyle = '#d7b98c'; ctx.fillText(`soil  εr = ${epsr.toFixed(1)}   v = ${v.toFixed(3)} m/ns`, 8, SURF + 16);

  // objects + depth markers
  objs.forEach((o) => {
    const ox = sxC(o.x0); const oy = szC(o.depth);
    ctx.strokeStyle = 'rgba(126,224,196,.45)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(ox, SURF); ctx.lineTo(ox, oy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#8b6b4a'; ctx.strokeStyle = '#d7b98c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, oy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8c79a'; ctx.beginPath(); ctx.arc(ox - 3, oy - 3, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7ee0c4'; ctx.font = '600 10px system-ui'; ctx.fillText(`d = ${o.depth.toFixed(2)} m`, ox + 14, (SURF + oy) / 2);
  });

  // antenna (Tx/Rx) + faint trail in sweep mode
  const drawAnt = (x, main) => { const px = sxC(x); ctx.fillStyle = main ? '#f6c85f' : 'rgba(246,200,95,.35)'; ctx.fillRect(px - 16, SURF - 20, 32, 15); ctx.strokeStyle = '#1a1206'; ctx.lineWidth = 1.5; ctx.strokeRect(px - 16, SURF - 20, 32, 15); if (main) { ctx.fillStyle = '#16202c'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Tx/Rx', px, SURF - 9); ctx.textAlign = 'left'; } };
  if (mode === 'bscan') for (let x = 0; x <= antX + 1e-6; x += L / 26) drawAnt(x, false);
  drawAnt(antX, true);
  ctx.fillStyle = '#f6c85f'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('GPR antenna', ax, SURF - 26); ctx.textAlign = 'left';

  if (mode === 'trace') {
    const R = Math.hypot(objs[0].x0 - antX, objs[0].depth); const t2 = twoWay(antX, objs[0], v);
    ctx.fillStyle = '#f6c85f'; ctx.font = '600 11px system-ui'; ctx.fillText(`slant range R = ${R.toFixed(2)} m`, 8, CH - 26);
    ctx.fillStyle = '#7ee0c4'; ctx.fillText(`echo returns at t = 2R/v = ${t2.toFixed(1)} ns`, 8, CH - 10);
  }
}

function drawRadar(ctx, st, anim) {
  const { objs, epsr, antX, mode, fitEpsr, fitT0, fitX0, showFit } = st; const v = vel(epsr);
  ctx.clearRect(0, 0, RW, RH); ctx.fillStyle = '#0b131d'; ctx.fillRect(0, 0, RW, RH);
  const tmax = computeTmax(objs, v); const py = (t) => RT + (t / tmax) * plotH;
  const revealX = mode === 'bscan' ? antX : L;

  // ---- B-scan image (per-column wave packets) ----
  const img = ctx.createImageData(plotW, plotH); const data = img.data; const bg = [11, 19, 29];
  for (let ix = 0; ix < plotW; ix += 1) {
    const x = (ix / plotW) * L; const recorded = x <= revealX + 1e-6;
    for (let iy = 0; iy < plotH; iy += 1) {
      const amp = recorded ? amplitude(x, (iy / plotH) * tmax, objs, v) : 0;
      let r; let g; let b;
      if (amp >= 0) { const k = Math.min(1, amp); r = bg[0] + k * (247 - bg[0]); g = bg[1] + k * (188 - bg[1]); b = bg[2] + k * (96 - bg[2]); }
      else { const k = Math.min(1, -amp); r = bg[0] + k * (44 - bg[0]); g = bg[1] + k * (150 - bg[1]); b = bg[2] + k * (196 - bg[2]); }
      const p = (iy * plotW + ix) * 4; data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, BL, RT);
  ctx.strokeStyle = '#2b3947'; ctx.lineWidth = 1; ctx.strokeRect(BL, RT, plotW, plotH); ctx.strokeRect(AX0, RT, AW, plotH);

  // shared time axis
  ctx.fillStyle = '#7d8fa1'; ctx.font = '600 10px system-ui';
  ctx.save(); ctx.translate(12, RT + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('two-way time (ns)', 0, 0); ctx.restore();
  for (let t = 0; t <= tmax; t += tmax > 40 ? 10 : 5) { const y = py(t); ctx.fillStyle = '#56677a'; ctx.fillText(t.toFixed(0), 22, y + 3); ctx.strokeStyle = 'rgba(90,120,150,.14)'; ctx.beginPath(); ctx.moveTo(BL, y); ctx.lineTo(BL + plotW, y); ctx.stroke(); }
  ctx.fillStyle = '#7d8fa1'; ctx.textAlign = 'center'; ctx.fillText('received trace', AXC, RH - 8); ctx.fillText('antenna position along line (m)', BL + plotW / 2, RH - 8); ctx.textAlign = 'left';

  // ---- A-scan wiggle for the current antenna position ----
  const halfW = AW * 0.44; const NS = 300;
  ctx.strokeStyle = '#33414f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(AXC, RT); ctx.lineTo(AXC, RT + plotH); ctx.stroke();
  for (let i = 0; i < NS; i += 1) { const t = (i / NS) * tmax; const a = clamp(amplitude(antX, t, objs, v) / 1.2, -1, 1); const y = py(t); ctx.strokeStyle = a >= 0 ? 'rgba(247,188,96,.75)' : 'rgba(60,180,196,.6)'; ctx.beginPath(); ctx.moveTo(AXC, y); ctx.lineTo(AXC + a * halfW, y); ctx.stroke(); }
  ctx.strokeStyle = '#e8eff5'; ctx.lineWidth = 1.3; ctx.beginPath(); for (let i = 0; i <= NS; i += 1) { const t = (i / NS) * tmax; const a = clamp(amplitude(antX, t, objs, v) / 1.2, -1, 1); const X = AXC + a * halfW; const y = py(t); if (i === 0) ctx.moveTo(X, y); else ctx.lineTo(X, y); } ctx.stroke();
  // mark the echo on the A-scan
  objs.forEach((o) => { const te = twoWay(antX, o, v); if (te <= tmax) { const y = py(te); ctx.fillStyle = '#7ee0c4'; ctx.beginPath(); ctx.moveTo(AX0 - 2, y); ctx.lineTo(AX0 - 9, y - 4); ctx.lineTo(AX0 - 9, y + 4); ctx.closePath(); ctx.fill(); if (mode === 'trace') { ctx.fillStyle = '#8fe6cf'; ctx.font = '600 9px system-ui'; ctx.fillText(`echo ${te.toFixed(0)} ns`, AX0 - 6, y - 8); } } });

  // ---- recording head: receiver sampling amplitude over time ----
  const tau = anim.scan * tmax; const yr = py(tau);
  ctx.strokeStyle = 'rgba(246,200,95,.85)'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(AX0, yr); ctx.lineTo(AX0 + AW, yr); ctx.stroke(); ctx.setLineDash([]);
  const aNow = clamp(amplitude(antX, tau, objs, v) / 1.2, -1, 1); ctx.fillStyle = '#f6c85f'; ctx.beginPath(); ctx.arc(AXC + aNow * halfW, yr, 3.2, 0, Math.PI * 2); ctx.fill();

  // ---- hyperbola overlays (theory) ----
  objs.forEach((o) => {
    ctx.strokeStyle = 'rgba(56,189,248,.9)'; ctx.lineWidth = 2; ctx.beginPath(); let started = false;
    for (let x = 0; x <= L + 1e-6; x += L / 240) { if (x > revealX + 1e-6) break; const t = twoWay(x, o, v); const X = rx(x); const Y = py(t); if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y); }
    ctx.stroke();
    const t0 = twoWay(o.x0, o, v); if (o.x0 <= revealX + 1e-6) { const AXp = rx(o.x0); const AYp = py(t0); ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(AXp, AYp, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8fd0ff'; ctx.font = '600 10px system-ui'; ctx.fillText(`apex t0 = ${t0.toFixed(1)} ns`, AXp + 7, AYp - 4); }
  });

  // current-trace cursor in the B-scan, tied to the A-scan
  if (mode !== 'depth') { const X = rx(clamp(antX, 0, L)); ctx.strokeStyle = 'rgba(246,200,95,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X, RT); ctx.lineTo(X, RT + plotH); ctx.stroke(); ctx.setLineDash([]);
    objs.forEach((o) => { const te = twoWay(antX, o, v); if (te <= tmax && antX <= revealX + 1e-6) { const Y = py(te); ctx.strokeStyle = 'rgba(126,224,196,.8)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(AXC, Y); ctx.lineTo(X, Y); ctx.stroke(); ctx.setLineDash([]); } }); }

  // ---- depth-mode fitted hyperbola ----
  if (mode === 'depth' && showFit) {
    const vf = vel(fitEpsr); ctx.strokeStyle = '#ff7a59'; ctx.lineWidth = 2.2; ctx.setLineDash([6, 5]); ctx.beginPath(); let started = false;
    for (let x = 0; x <= L + 1e-6; x += L / 240) { const t = Math.hypot(fitT0, (2 * (x - fitX0)) / vf); const X = rx(x); const Y = py(t); if (t > tmax) { started = false; continue; } if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y); }
    ctx.stroke(); ctx.setLineDash([]); const AXp = rx(fitX0); const AYp = py(fitT0); ctx.fillStyle = '#ff7a59'; ctx.beginPath(); ctx.arc(AXp, AYp, 4, 0, Math.PI * 2); ctx.fill();
  }
}

const MODES = [
  { id: 'trace', label: '1 · Wave out & back' },
  { id: 'bscan', label: '2 · Move the GPR' },
  { id: 'depth', label: '3 · Depth from hyperbola' },
];

export default function Gpr() {
  const [mode, setMode] = useState('trace');
  const [epsr, setEpsr] = useState(9);
  const [depth1, setDepth1] = useState(0.8);
  const [antX, setAntX] = useState(1.6);
  const [playing, setPlaying] = useState(false);
  const [fitEpsr, setFitEpsr] = useState(4);
  const [fitT0, setFitT0] = useState(12);

  const crossRef = useRef(null); const radarRef = useRef(null);
  const anim = useRef({ scan: 0 }); const raf = useRef(0); const last = useRef(0);

  const OBJ1 = { x0: 1.6, depth: depth1 };
  const v = vel(epsr);
  const t0True = twoWay(OBJ1.x0, OBJ1, v);
  const vFit = vel(fitEpsr); const depthEst = (vFit * fitT0) / 2; const depthErr = Math.abs(depthEst - depth1);

  const P = useRef({});
  P.current = { mode, epsr, antX, depth1, playing, fitEpsr, fitT0 };

  useEffect(() => {
    last.current = 0;
    const tick = (ts) => {
      const dt = last.current ? Math.min(0.05, (ts - last.current) / 1000) : 0; last.current = ts;
      anim.current.scan = (anim.current.scan + dt / 3) % 1;
      const p = P.current;
      if (p.mode === 'bscan' && p.playing) setAntX((x) => (x + dt * (L / 7) >= L ? L : x + dt * (L / 7)));
      const o1 = { x0: 1.6, depth: p.depth1 }; const o2 = { x0: 3.0, depth: 1.35 };
      const st = { objs: p.mode === 'bscan' ? [o1, o2] : [o1], epsr: p.epsr, antX: p.antX, mode: p.mode, fitEpsr: p.fitEpsr, fitT0: p.fitT0, fitX0: o1.x0, showFit: p.mode === 'depth' };
      if (crossRef.current) drawCross(crossRef.current.getContext('2d'), st, anim.current);
      if (radarRef.current) drawRadar(radarRef.current.getContext('2d'), st, anim.current);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  useEffect(() => { if (mode === 'bscan' && playing && antX >= L) setPlaying(false); }, [antX, playing, mode]);

  const pickMode = (m) => { setMode(m); setPlaying(false); if (m === 'bscan') setAntX(0); if (m === 'trace') setAntX(1.6); };
  const startSweep = () => { setAntX(0); setPlaying(true); };

  const onCross = (e) => {
    if (mode === 'depth') return; if (mode === 'bscan' && playing) return;
    const rect = e.currentTarget.getBoundingClientRect(); const px = (e.clientX - rect.left) * (CW / rect.width);
    setAntX(clamp(((px - ML) / (CW - ML - MR)) * L, 0, L));
  };
  const dragging = useRef(false);
  const onPointerDown = (e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); onCross(e); };
  const onPointerMove = (e) => { if (dragging.current) onCross(e); };
  const onPointerUp = (e) => { dragging.current = false; e.currentTarget.releasePointerCapture?.(e.pointerId); };

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Ground-Penetrating Radar <span className="native-badge">Native React</span></h1>
          <span className="sub">A continuous wave spreads out, reflects, and returns — the receiver captures it, and moving the GPR draws the hyperbola</span>
        </div>
        <span className="score-chip">v = c/&radic;&epsilon;r = <b>{v.toFixed(3)} m/ns</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <div className="gpr-modes">
              {MODES.map((m) => (
                <button key={m.id} className={`gpr-seg ${mode === m.id ? 'on' : ''}`} onClick={() => pickMode(m.id)}>{m.label}</button>
              ))}
            </div>
            <h2><span className="stepno">A</span> Ground cross-section <small>&mdash; {mode === 'trace' ? 'drag the antenna; watch the wave spread out & come back' : mode === 'bscan' ? 'the antenna sweeps; the wave follows it' : 'the object we will locate'}</small></h2>
            <canvas ref={crossRef} className="gpr-canvas gpr-cross" width={CW} height={CH}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
            <div className="gpr-legend">
              <span><i className="gpr-dot" style={{ background: '#f6c85f' }} /> outgoing wavefronts (Tx)</span>
              <span><i className="gpr-dot" style={{ background: '#7ee0c4' }} /> return wavefronts (Rx)</span>
              <span><i className="gpr-dot" style={{ background: '#8b6b4a' }} /> buried object</span>
              <span><i className="gpr-line" style={{ borderColor: '#38bdf8' }} /> hyperbola t(x)</span>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">B</span> Received trace &amp; radargram <small>&mdash; the A-scan wiggle is one column; stacking them builds the B-scan</small></h2>
            <canvas ref={radarRef} className="gpr-canvas" width={RW} height={RH} />

            {mode === 'trace' && (
              <>
                <div className="gpr-sub">Antenna &amp; soil</div>
                <div className="control-grid">
                  <label>antenna position <b>{antX.toFixed(2)} m</b><input type="range" min="0" max={L} step="0.02" value={antX} onChange={(e) => setAntX(Number(e.target.value))} /></label>
                  <label>object depth <b>{depth1.toFixed(2)} m</b><input type="range" min="0.3" max="1.7" step="0.05" value={depth1} onChange={(e) => setDepth1(Number(e.target.value))} /></label>
                  <label>soil permittivity εr <b>{epsr.toFixed(1)}</b><input type="range" min="1" max="25" step="0.5" value={epsr} onChange={(e) => setEpsr(Number(e.target.value))} /></label>
                </div>
                <div className="gpr-eq">The wave spreads as circles, not a line. Its echo is captured at <b>t = 2R/v</b> (R = &radic;((x&minus;x₀)²+d²)) → here t = <b>{twoWay(antX, OBJ1, v).toFixed(1)} ns</b>. The moving yellow line is the receiver sampling the trace over time.</div>
                <div className="gpr-note">The antenna sends a <b>continuous wave</b> that expands into the ground; the object re-radiates a <b>return wave</b> back to the surface. The receiver records amplitude vs time — the <b>A-scan wiggle</b> on the left of the radargram. The echo packet sits <b>lower (later)</b> when the antenna is off to the side (bigger R) and <b>highest (earliest)</b> right above the object.</div>
              </>
            )}

            {mode === 'bscan' && (
              <>
                <div className="gpr-btnrow">
                  <button className="gpr-btn primary" onClick={startSweep}>▶ move the GPR</button>
                  <button className="gpr-btn ghost" onClick={() => { setPlaying(false); setAntX(0); }}>reset</button>
                  <span style={{ fontSize: 12, color: '#7d8fa1' }}>position {antX.toFixed(2)} / {L.toFixed(1)} m</span>
                </div>
                <div className="gpr-sub">Soil</div>
                <div className="control-grid">
                  <label>object depth <b>{depth1.toFixed(2)} m</b><input type="range" min="0.3" max="1.7" step="0.05" value={depth1} onChange={(e) => setDepth1(Number(e.target.value))} /></label>
                  <label>soil permittivity εr <b>{epsr.toFixed(1)}</b><input type="range" min="1" max="25" step="0.5" value={epsr} onChange={(e) => setEpsr(Number(e.target.value))} /></label>
                </div>
                <div className="gpr-eq"><b>t(x) = (2/v)·&radic;(d² + (x&minus;x₀)²)</b> — as the GPR moves, the A-scan echo (green tie-line) traces this hyperbola, apex at (x₀, t₀ = 2d/v)</div>
                <div className="gpr-note">Watch the left A-scan as the GPR moves: the echo packet slides <b>up then down</b> in time. Each trace is dropped into the radargram as a column, so the echoes line up into a <b>hyperbola</b> (one per object) — that is exactly how the parabola-shape is formed. It is <b>not</b> the object’s shape; it is the changing round-trip time.</div>
              </>
            )}

            {mode === 'depth' && (
              <>
                <div className="gpr-sub">Fit the hyperbola → get depth</div>
                <div className="control-grid">
                  <label>guessed εr <b>{fitEpsr.toFixed(1)}</b><input type="range" min="1" max="25" step="0.5" value={fitEpsr} onChange={(e) => setFitEpsr(Number(e.target.value))} /></label>
                  <label>apex time t₀ <b>{fitT0.toFixed(1)} ns</b><input type="range" min="4" max="40" step="0.5" value={fitT0} onChange={(e) => setFitT0(Number(e.target.value))} /></label>
                </div>
                <div className="gpr-btnrow">
                  <button className="gpr-btn primary" onClick={() => { setFitEpsr(epsr); setFitT0(t0True); }}>auto-fit</button>
                  <span style={{ fontSize: 12, color: '#7d8fa1' }}>match the dashed curve to the blue one</span>
                </div>
                <div className="readouts" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
                  <div><span>fit velocity v</span><b>{vFit.toFixed(3)}</b></div>
                  <div><span>apex t₀</span><b>{fitT0.toFixed(1)} ns</b></div>
                  <div><span>depth d = v·t₀/2</span><b>{depthEst.toFixed(2)} m</b></div>
                  <div><span>error vs truth</span><b className={depthErr > 0.1 ? 'orange' : ''}>{(depthErr * 100).toFixed(0)} cm</b></div>
                </div>
                <div className="gpr-eq">apex fixes <b>t₀</b> → depth d = v·t₀/2 &nbsp; · &nbsp; the limbs’ curvature fixes <b>v</b> (steeper = slower soil).</div>
                <div className={`gpr-note ${depthErr <= 0.1 ? 'good' : ''}`}>{depthErr <= 0.1 ? <>Matched. With the right velocity and apex, <b>d = v·t₀/2 = {depthEst.toFixed(2)} m</b> — the depth read straight off the radargram.</> : <>Adjust the velocity (curve width) and apex time until the dashed fit lies on the blue hyperbola, then read <b>d = v·t₀/2</b>.</>}</div>
              </>
            )}

            <div className="rect-summary">
              <b>Wave out → wave back → captured trace → hyperbola → depth</b>
              <p>
                GPR (radar — radio waves penetrate soil) radiates a <b>continuous wave</b> as expanding wavefronts; a buried
                object sends a <b>return wave</b> up to the receiver, which records amplitude over time as the <b>A-scan</b>. The
                echo lands at <b>t = 2R/v</b> (v = c/&radic;εr). Moving the antenna changes R, so the echo time changes — the
                stacked traces form a <b>hyperbola</b> whose apex gives the depth <b>d = v·t₀/2</b>.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
