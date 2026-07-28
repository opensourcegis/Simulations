import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './gpr.css';

// ---------------------------------------------------------------------------
// Ground-Penetrating Radar (GPR).
//
// A GPR antenna is dragged along the surface. At every position it fires a
// short electromagnetic pulse straight down; buried objects reflect part of
// it back. The recorded two-way travel time t = 2R/v (R = slant range,
// v = c/√εr) is stamped into a vertical trace. Stacking the traces side by
// side builds the radargram (B-scan). A compact buried object shows up as a
// hyperbola, because R — and therefore t — is smallest right above it and
// grows as the antenna moves away. Its apex time gives the depth: d = v·t0/2.
// ---------------------------------------------------------------------------

const C = 0.2998; // speed of light, metres per nanosecond
const L = 4.0; // survey line length (m)
const D = 2.0; // displayed depth (m)

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const vel = (epsr) => C / Math.sqrt(epsr); // m/ns
// Ricker-style wavelet in time (τ, w in ns) — the shape of one GPR pulse.
function ricker(tau, w) { const s = tau / w; const q = s * s; return (1 - 2 * q) * Math.exp(-q); }

// Two-way travel time (ns) for antenna at x over an object at (x0, depth).
const twoWay = (x, obj, v) => (2 * Math.hypot(x - obj.x0, obj.depth)) / v;

// ---- cross-section geometry ----
const CW = 560; const CH = 360; const ML = 44; const MR = 16; const SURF = 96; const MB = 20;
const sxC = (x) => ML + (x / L) * (CW - ML - MR);
const szC = (d) => SURF + (d / D) * (CH - SURF - MB);

// ---- radargram geometry ----
const RW = 560; const RH = 360; const RL = 46; const RT = 26; const RR = 14; const RB = 26;
const rx = (x) => RL + (x / L) * (RW - RL - RR);

function drawCross(ctx, st, anim) {
  const { objs, epsr, antX, mode } = st; const v = vel(epsr);
  ctx.clearRect(0, 0, CW, CH);
  // air
  const air = ctx.createLinearGradient(0, 0, 0, SURF); air.addColorStop(0, '#0e1a27'); air.addColorStop(1, '#122232');
  ctx.fillStyle = air; ctx.fillRect(0, 0, CW, SURF);
  // ground
  const gnd = ctx.createLinearGradient(0, SURF, 0, CH); gnd.addColorStop(0, '#3a2c1f'); gnd.addColorStop(1, '#241a12');
  ctx.fillStyle = gnd; ctx.fillRect(0, SURF, CW, CH - SURF);
  ctx.fillStyle = 'rgba(210,180,140,.06)';
  for (let i = 0; i < 260; i += 1) { const gx = Math.random() * CW; const gy = SURF + Math.random() * (CH - SURF); ctx.fillRect(gx, gy, 1.3, 1.3); }
  // surface line
  ctx.strokeStyle = '#c9a06a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, SURF); ctx.lineTo(CW, SURF); ctx.stroke();
  ctx.fillStyle = '#8fd0ff'; ctx.font = '600 11px system-ui'; ctx.fillText('air', 8, 18);
  ctx.fillStyle = '#d7b98c'; ctx.fillText(`soil  εr = ${epsr.toFixed(1)}   v = ${v.toFixed(3)} m/ns`, 8, SURF + 16);

  // buried objects
  objs.forEach((o) => {
    const ox = sxC(o.x0); const oy = szC(o.depth);
    ctx.fillStyle = '#8b6b4a'; ctx.strokeStyle = '#d7b98c'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8c79a'; ctx.beginPath(); ctx.arc(ox - 3, oy - 3, 3.4, 0, Math.PI * 2); ctx.fill();
    // depth marker
    ctx.strokeStyle = 'rgba(126,224,196,.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(ox, SURF); ctx.lineTo(ox, oy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#7ee0c4'; ctx.font = '600 10px system-ui'; ctx.fillText(`d = ${o.depth.toFixed(2)} m`, ox + 6, (SURF + oy) / 2);
  });

  const drawAntenna = (x, main) => {
    const ax = sxC(x);
    ctx.fillStyle = main ? '#f6c85f' : 'rgba(246,200,95,.4)';
    ctx.fillRect(ax - 16, SURF - 20, 32, 15);
    ctx.strokeStyle = '#1a1206'; ctx.lineWidth = 1.5; ctx.strokeRect(ax - 16, SURF - 20, 32, 15);
    if (main) { ctx.fillStyle = '#16202c'; ctx.font = '700 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Tx/Rx', ax, SURF - 9); ctx.textAlign = 'left'; }
    return ax;
  };

  if (mode === 'bscan') {
    // faint trail of past antenna positions
    for (let x = 0; x <= antX + 1e-6; x += L / 26) drawAntenna(x, false);
  }
  const ax = drawAntenna(antX, true);
  if (mode === 'trace') { ctx.fillStyle = '#f6c85f'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('GPR antenna', ax, SURF - 26); ctx.textAlign = 'left'; }

  // Rays + wavefronts to each object from the current antenna position.
  objs.forEach((o) => {
    const ox = sxC(o.x0); const oy = szC(o.depth); const R = Math.hypot(o.x0 - antX, o.depth);
    ctx.strokeStyle = 'rgba(246,200,95,.85)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(ax, SURF); ctx.lineTo(ox, oy); ctx.stroke();
    ctx.strokeStyle = 'rgba(126,224,196,.85)'; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ax, SURF); ctx.stroke();
    if (mode === 'trace') {
      const t2 = twoWay(antX, o, v);
      const mid = [(ax + ox) / 2, (SURF + oy) / 2];
      ctx.fillStyle = '#f6c85f'; ctx.font = '600 10px system-ui';
      ctx.fillText(`R = ${R.toFixed(2)} m`, mid[0] + 6, mid[1]);
      ctx.fillStyle = '#7ee0c4'; ctx.fillText(`t = 2R/v = ${t2.toFixed(1)} ns`, ax + 8, SURF + 34);
      // expanding wavefront: down-going then reflected, driven by anim.ping (0..1)
      const ph = anim.ping;
      const pxPerM = (szC(o.depth) - SURF) / o.depth;
      if (ph < 0.5) { const rr = (ph / 0.5) * R * pxPerM; ctx.strokeStyle = 'rgba(246,200,95,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ax, SURF, rr, 0, Math.PI, false); ctx.stroke(); }
      else { const rr = ((ph - 0.5) / 0.5) * R * pxPerM; ctx.strokeStyle = 'rgba(126,224,196,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ox, oy, rr, 0, Math.PI * 2); ctx.stroke(); }
    }
  });
}

// Build the radargram image (per-column wavelets) into the canvas.
function drawRadar(ctx, st) {
  const { objs, epsr, antX, mode, fitEpsr, fitT0, fitX0, showFit } = st; const v = vel(epsr);
  ctx.clearRect(0, 0, RW, RH);
  ctx.fillStyle = '#0b131d'; ctx.fillRect(0, 0, RW, RH);
  // adaptive time axis so the full hyperbola limbs fit
  let tmax = 8;
  objs.forEach((o) => { const off = Math.max(o.x0, L - o.x0); tmax = Math.max(tmax, twoWay(o.x0 + off, o, v)); });
  tmax *= 1.08;
  const py = (t) => RT + (t / tmax) * (RH - RT - RB);
  const revealX = mode === 'bscan' ? antX : L; // in B-scan reveal only swept columns

  const plotW = RW - RL - RR; const plotH = RH - RT - RB;
  const img = ctx.createImageData(plotW, plotH); const data = img.data;
  const bg = [11, 19, 29];
  for (let ix = 0; ix < plotW; ix += 1) {
    const x = (ix / plotW) * L;
    const recorded = x <= revealX + 1e-6;
    for (let iy = 0; iy < plotH; iy += 1) {
      const time = (iy / plotH) * tmax;
      let amp = 0;
      if (recorded) {
        amp += 0.8 * ricker(time - 1.4, 1.1); // surface / direct wave
        for (const o of objs) { const R = Math.hypot(x - o.x0, o.depth); const spread = 1 / (1 + 0.9 * R); amp += 1.15 * spread * ricker(time - (2 * R) / v, 1.25); }
      }
      let r; let g; let b;
      if (amp >= 0) { const k = Math.min(1, amp); r = bg[0] + k * (247 - bg[0]); g = bg[1] + k * (188 - bg[1]); b = bg[2] + k * (96 - bg[2]); }
      else { const k = Math.min(1, -amp); r = bg[0] + k * (44 - bg[0]); g = bg[1] + k * (150 - bg[1]); b = bg[2] + k * (196 - bg[2]); }
      const p = (iy * plotW + ix) * 4; data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
  }
  ctx.putImageData(img, RL, RT);

  // axes + labels
  ctx.strokeStyle = '#2b3947'; ctx.lineWidth = 1; ctx.strokeRect(RL, RT, plotW, plotH);
  ctx.fillStyle = '#7d8fa1'; ctx.font = '600 10px system-ui';
  ctx.save(); ctx.translate(12, RT + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('two-way time (ns)', 0, 0); ctx.restore();
  ctx.textAlign = 'center'; ctx.fillText('antenna position along line (m)', RL + plotW / 2, RH - 8); ctx.textAlign = 'left';
  for (let t = 0; t <= tmax; t += tmax > 40 ? 10 : 5) { const y = py(t); ctx.fillStyle = '#56677a'; ctx.fillText(t.toFixed(0), 20, y + 3); ctx.strokeStyle = 'rgba(90,120,150,.18)'; ctx.beginPath(); ctx.moveTo(RL, y); ctx.lineTo(RL + plotW, y); ctx.stroke(); }

  // hyperbola overlay (theory) for each visible object
  objs.forEach((o) => {
    ctx.strokeStyle = 'rgba(56,189,248,.9)'; ctx.lineWidth = 2; ctx.beginPath(); let started = false;
    for (let x = 0; x <= L + 1e-6; x += L / 220) { if (x > revealX + 1e-6) break; const t = twoWay(x, o, v); const X = rx(x); const Y = py(t); if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y); }
    ctx.stroke();
    // apex
    const t0 = twoWay(o.x0, o, v); if (o.x0 <= revealX + 1e-6) { const AX = rx(o.x0); const AY = py(t0); ctx.fillStyle = '#38bdf8'; ctx.beginPath(); ctx.arc(AX, AY, 4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#8fd0ff'; ctx.font = '600 10px system-ui'; ctx.fillText(`apex  t0 = ${t0.toFixed(1)} ns`, AX + 7, AY - 4); }
  });

  // current-trace cursor (B-scan sweep, or the dragged antenna in trace mode)
  if ((mode === 'bscan' && antX < L) || mode === 'trace') {
    const X = rx(antX); ctx.strokeStyle = 'rgba(246,200,95,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(X, RT); ctx.lineTo(X, RT + plotH); ctx.stroke(); ctx.setLineDash([]);
    if (mode === 'trace') { const t = twoWay(antX, objs[0], v); const Y = py(t); ctx.fillStyle = '#7ee0c4'; ctx.beginPath(); ctx.arc(X, Y, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#0b131d'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#7ee0c4'; ctx.font = '600 10px system-ui'; ctx.fillText('this trace', X + 8, Y + 4); }
  }

  // depth-mode fitted hyperbola (dashed) from the user's velocity + apex guess
  if (mode === 'depth' && showFit) {
    const vf = vel(fitEpsr);
    ctx.strokeStyle = '#ff7a59'; ctx.lineWidth = 2.2; ctx.setLineDash([6, 5]); ctx.beginPath(); let started = false;
    for (let x = 0; x <= L + 1e-6; x += L / 220) { const t = Math.hypot(fitT0, (2 * (x - fitX0)) / vf); const X = rx(x); const Y = py(t); if (t > tmax) { started = false; continue; } if (!started) { ctx.moveTo(X, Y); started = true; } else ctx.lineTo(X, Y); }
    ctx.stroke(); ctx.setLineDash([]);
    const AX = rx(fitX0); const AY = py(fitT0); ctx.fillStyle = '#ff7a59'; ctx.beginPath(); ctx.arc(AX, AY, 4, 0, Math.PI * 2); ctx.fill();
  }
}

const MODES = [
  { id: 'trace', label: '1 · Transmit & receive' },
  { id: 'bscan', label: '2 · Build the radargram' },
  { id: 'depth', label: '3 · Depth from hyperbola' },
];

export default function Gpr() {
  const [mode, setMode] = useState('trace');
  const [epsr, setEpsr] = useState(9);
  const [depth1, setDepth1] = useState(0.8);
  const [antX, setAntX] = useState(1.6);
  const [playing, setPlaying] = useState(false);
  // depth-mode fit controls
  const [fitEpsr, setFitEpsr] = useState(4);
  const [fitT0, setFitT0] = useState(12);

  const crossRef = useRef(null); const radarRef = useRef(null);
  const anim = useRef({ ping: 0 }); const raf = useRef(0); const last = useRef(0);

  const OBJ1 = { x0: 1.6, depth: depth1 };
  const showFit = mode === 'depth';

  // Live params for the animation loop (avoids re-subscribing rAF each frame).
  const P = useRef({});
  P.current = { mode, epsr, antX, depth1, playing, fitEpsr, fitT0 };

  useEffect(() => {
    last.current = 0;
    const tick = (ts) => {
      const dt = last.current ? Math.min(0.05, (ts - last.current) / 1000) : 0; last.current = ts;
      const p = P.current;
      if (p.mode === 'trace') anim.current.ping = (anim.current.ping + dt / 2.4) % 1;
      if (p.mode === 'bscan' && p.playing) setAntX((x) => (x + dt * (L / 6) >= L ? L : x + dt * (L / 6)));
      const o1 = { x0: 1.6, depth: p.depth1 }; const o2 = { x0: 3.0, depth: 1.35 };
      const st = { objs: p.mode === 'bscan' ? [o1, o2] : [o1], epsr: p.epsr, antX: p.antX, mode: p.mode, fitEpsr: p.fitEpsr, fitT0: p.fitT0, fitX0: o1.x0, showFit: p.mode === 'depth' };
      if (crossRef.current) drawCross(crossRef.current.getContext('2d'), st, anim.current);
      if (radarRef.current) drawRadar(radarRef.current.getContext('2d'), st);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, []);

  // stop the sweep when it reaches the end
  useEffect(() => { if (mode === 'bscan' && playing && antX >= L) setPlaying(false); }, [antX, playing, mode]);

  const pickMode = (m) => { setMode(m); setPlaying(false); if (m === 'bscan') setAntX(0); if (m === 'trace') setAntX(1.6); };
  const startSweep = () => { setAntX(0); setPlaying(true); };

  // drag antenna on the cross-section (trace mode)
  const onCross = (e) => {
    if (mode !== 'trace' && !(mode === 'bscan' && !playing)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (CW / rect.width);
    setAntX(clamp(((px - ML) / (CW - ML - MR)) * L, 0, L));
  };
  const dragging = useRef(false);

  const v = vel(epsr);
  const t0True = twoWay(OBJ1.x0, OBJ1, v);
  const vFit = vel(fitEpsr);
  const depthEst = (vFit * fitT0) / 2;
  const depthErr = Math.abs(depthEst - depth1);

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Ground-Penetrating Radar <span className="native-badge">Native React</span></h1>
          <span className="sub">Send a pulse, time the echo, stack the traces into a radargram — and read depth off the hyperbola</span>
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
            <h2><span className="stepno">A</span> Ground cross-section <small>&mdash; {mode === 'trace' ? 'drag the antenna across the surface' : mode === 'bscan' ? 'the antenna sweeps the line' : 'the object we will locate'}</small></h2>
            <canvas ref={crossRef} className="gpr-canvas gpr-cross" width={CW} height={CH}
              onMouseDown={(e) => { dragging.current = true; onCross(e); }}
              onMouseMove={(e) => { if (dragging.current) onCross(e); }}
              onMouseUp={() => { dragging.current = false; }} onMouseLeave={() => { dragging.current = false; }} />
            <div className="gpr-legend">
              <span><i className="gpr-dot" style={{ background: '#f6c85f' }} /> transmitted pulse (Tx)</span>
              <span><i className="gpr-dot" style={{ background: '#7ee0c4' }} /> reflected echo (Rx)</span>
              <span><i className="gpr-dot" style={{ background: '#8b6b4a' }} /> buried object</span>
              <span><i className="gpr-line" style={{ borderColor: '#38bdf8' }} /> hyperbola t(x)</span>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">B</span> Radargram (B-scan) <small>&mdash; each column is one trace; time increases downward</small></h2>
            <canvas ref={radarRef} className="gpr-canvas" width={RW} height={RH} />

            {mode === 'trace' && (
              <>
                <div className="gpr-sub">Antenna &amp; soil</div>
                <div className="control-grid">
                  <label>antenna position <b>{antX.toFixed(2)} m</b><input type="range" min="0" max={L} step="0.02" value={antX} onChange={(e) => setAntX(Number(e.target.value))} /></label>
                  <label>object depth <b>{depth1.toFixed(2)} m</b><input type="range" min="0.3" max="1.7" step="0.05" value={depth1} onChange={(e) => setDepth1(Number(e.target.value))} /></label>
                  <label>soil permittivity εr <b>{epsr.toFixed(1)}</b><input type="range" min="1" max="25" step="0.5" value={epsr} onChange={(e) => setEpsr(Number(e.target.value))} /></label>
                </div>
                <div className="gpr-eq">R = &radic;((x&minus;x₀)² + d²) &nbsp;·&nbsp; <b>t = 2R / v</b> &nbsp;·&nbsp; v = c/&radic;εr = {v.toFixed(3)} m/ns → t = <b>{twoWay(antX, OBJ1, v).toFixed(1)} ns</b></div>
                <div className="gpr-note">One pulse goes down, one echo comes back. The recorded value is the <b>two-way travel time</b> t = 2R/v. Slide the antenna: t is <b>smallest directly above</b> the object (R = d) and grows on either side — that changing time is exactly what bends into a hyperbola in step 2.</div>
              </>
            )}

            {mode === 'bscan' && (
              <>
                <div className="gpr-btnrow">
                  <button className="gpr-btn primary" onClick={startSweep}>▶ sweep the line</button>
                  <button className="gpr-btn ghost" onClick={() => { setPlaying(false); setAntX(0); }}>reset</button>
                  <span style={{ fontSize: 12, color: '#7d8fa1' }}>position {antX.toFixed(2)} / {L.toFixed(1)} m</span>
                </div>
                <div className="gpr-sub">Soil</div>
                <div className="control-grid">
                  <label>object depth <b>{depth1.toFixed(2)} m</b><input type="range" min="0.3" max="1.7" step="0.05" value={depth1} onChange={(e) => setDepth1(Number(e.target.value))} /></label>
                  <label>soil permittivity εr <b>{epsr.toFixed(1)}</b><input type="range" min="1" max="25" step="0.5" value={epsr} onChange={(e) => setEpsr(Number(e.target.value))} /></label>
                </div>
                <div className="gpr-eq"><b>t(x) = (2/v)·&radic;(d² + (x&minus;x₀)²)</b> — a hyperbola with its apex at (x₀, t₀ = 2d/v)</div>
                <div className="gpr-note">Every antenna stop adds one vertical trace. A compact object is seen from many positions, so its echo is recorded early right above it and later to the sides — the traces line up into a <b>hyperbola</b> (two here, one per object). The apex sits <b>directly over the object</b>.</div>
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
                <div className="gpr-eq">apex fixes <b>t₀</b> → depth d = v·t₀/2 &nbsp; · &nbsp; the limbs’ curvature fixes <b>v</b> (steeper = slower soil). Equivalently t² = t₀² + (2·Δx/v)² is a straight line in t² vs Δx².</div>
                <div className={`gpr-note ${depthErr <= 0.1 ? 'good' : ''}`}>{depthErr <= 0.1 ? <>Matched. With the right velocity and apex, <b>d = v·t₀/2 = {depthEst.toFixed(2)} m</b> — the buried object’s depth read straight off the radargram.</> : <>Adjust the velocity (curve width) and apex time until the dashed fit lies on the blue hyperbola, then read <b>d = v·t₀/2</b>. Too fast a velocity over-estimates depth, too slow under-estimates it.</>}</div>
              </>
            )}

            <div className="rect-summary">
              <b>Send → receive → radargram → depth</b>
              <p>
                GPR (radar, not laser — radio waves penetrate soil) fires a short pulse at each spot and times the echo:
                <b> t = 2R/v</b>, with soil velocity <b>v = c/&radic;εr</b>. Stacking the traces as the antenna moves turns a
                buried object into a <b>hyperbola</b> whose apex sits above it. Reading the apex time and the soil velocity from
                the hyperbola’s shape gives the depth <b>d = v·t₀/2</b>.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
