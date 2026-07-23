import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './ranging.css';

const C = 299792458; // speed of light, m/s
const DMAX = 300; // metres (full-scale of the scene)
const SCENE_W = 700; const SCENE_H = 300;
const TIME_W = 700; const TIME_H = 170;

const tofNs = (R) => (2 * R / C) * 1e9; // round-trip time in nanoseconds
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------------------
// Scene: sensor -> beam -> target, with an animated pulse and a live clock.
// `prog` is 0..1 over one round trip (0..0.5 outbound, 0.5..1 return).
// ---------------------------------------------------------------------------
function drawScene(ctx, { distance, prog, active }) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const g = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  g.addColorStop(0, '#0e1e2e'); g.addColorStop(1, '#0a1420');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SCENE_W, SCENE_H);

  const y = 150;
  const sensorX = 70;
  const targetX = sensorX + (distance / DMAX) * 560;

  // ground + ruler
  ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, y + 60); ctx.lineTo(SCENE_W - 20, y + 60); ctx.stroke();
  ctx.fillStyle = '#7d8fa1'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let d = 0; d <= DMAX; d += 50) {
    const x = sensorX + (d / DMAX) * 560;
    ctx.strokeStyle = 'rgba(120,150,175,.25)';
    ctx.beginPath(); ctx.moveTo(x, y + 55); ctx.lineTo(x, y + 65); ctx.stroke();
    ctx.fillText(`${d}`, x, y + 80);
  }
  ctx.textAlign = 'left'; ctx.fillText('m', SCENE_W - 40, y + 80);

  // beam baseline
  ctx.strokeStyle = 'rgba(90,200,232,.25)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sensorX + 18, y); ctx.lineTo(targetX, y); ctx.stroke(); ctx.setLineDash([]);

  // target (a wall)
  ctx.fillStyle = '#5b6b7a'; ctx.fillRect(targetX, y - 42, 16, 90);
  ctx.fillStyle = '#41505e'; ctx.fillRect(targetX + 16, y - 42, 6, 90);
  ctx.fillStyle = '#8ea3b5'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('target', targetX + 8, y - 52); ctx.textAlign = 'left';

  // sensor
  ctx.fillStyle = '#e8eff5'; ctx.strokeStyle = '#0b2434'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(sensorX - 34, y - 20, 52, 40, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#55c8e8'; ctx.beginPath(); ctx.arc(sensorX + 16, y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0b2434'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('LiDAR', sensorX - 8, y + 4); ctx.textAlign = 'left';

  // pulse
  if (active) {
    const outbound = prog < 0.5;
    const frac = outbound ? prog / 0.5 : 1 - (prog - 0.5) / 0.5;
    const px = sensorX + 18 + frac * (targetX - sensorX - 18);
    const color = outbound ? '#5ad1ff' : '#ffae4d';
    // trail
    const trailDir = outbound ? -1 : 1;
    const grd = ctx.createLinearGradient(px + trailDir * 46, 0, px, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, color);
    ctx.strokeStyle = grd; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(px + trailDir * 46, y); ctx.lineTo(px, y); ctx.stroke();
    // head glow
    ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(px, y, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    // emission / reflection rings
    if (outbound && frac < 0.12) { ctx.strokeStyle = 'rgba(90,209,255,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sensorX + 16, y, 10 + frac * 120, 0, Math.PI * 2); ctx.stroke(); }
    if (!outbound && frac > 0.88) { ctx.strokeStyle = 'rgba(255,174,77,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(targetX, y, 10 + (1 - frac) * 120, 0, Math.PI * 2); ctx.stroke(); }
  }

  // live clock
  const t = prog * tofNs(distance);
  ctx.fillStyle = '#dbe9f2'; ctx.font = '700 20px "Segoe UI", system-ui'; ctx.textAlign = 'left';
  ctx.fillText(`t = ${t.toFixed(0)} ns`, 44, 42);
  ctx.fillStyle = '#7ee0c4'; ctx.font = '600 13px system-ui';
  ctx.fillText(`range = c · t / 2 = ${(C * (t * 1e-9) / 2).toFixed(1)} m`, 44, 64);
}

// ---------------------------------------------------------------------------
// Timing diagram: transmitted pulse at t=0, received pulse at Δt = TOF,
// with a "now" cursor sweeping as the pulse flies.
// ---------------------------------------------------------------------------
function drawTiming(ctx, { distance, prog, active, pulseWidth }) {
  ctx.clearRect(0, 0, TIME_W, TIME_H);
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, TIME_W, TIME_H);
  const left = 60; const right = TIME_W - 24; const base = TIME_H - 34; const top = 26;
  const tMax = tofNs(DMAX) * 1.05; // ns full-scale
  const X = (ns) => left + (ns / tMax) * (right - left);

  // axis
  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(left, base); ctx.lineTo(right, base); ctx.stroke();
  ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let ns = 0; ns <= tMax; ns += 400) { const x = X(ns); ctx.strokeStyle = 'rgba(140,163,181,.18)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, base); ctx.stroke(); ctx.fillStyle = '#8ea3b5'; ctx.fillText(`${ns}`, x, base + 14); }
  ctx.textAlign = 'left'; ctx.fillText('time (ns)', right - 54, base + 26);

  const pulse = (cx, color, label) => {
    const w = clamp((pulseWidth / tMax) * (right - left), 3, 60);
    const grd = ctx.createLinearGradient(cx - w, 0, cx + w, 0);
    grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.5, color); grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.moveTo(cx - w, base);
    ctx.quadraticCurveTo(cx, top - 2, cx + w, base); ctx.closePath(); ctx.fill();
    ctx.fillStyle = color; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(label, cx, top - 6); ctx.textAlign = 'left';
  };

  const tof = tofNs(distance);
  pulse(X(0), '#5ad1ff', 'TX');
  const nowNs = prog * tof;
  // RX pulse appears once the echo has returned (prog >= 1) — or ghosted as it arrives
  if (!active || prog >= 1) pulse(X(tof), '#ffae4d', 'RX');
  else if (prog > 0.5) { ctx.globalAlpha = (prog - 0.5) / 0.5; pulse(X(nowNs), '#ffae4d', 'RX'); ctx.globalAlpha = 1; }

  // Δt bracket
  if (!active || prog >= 1) {
    ctx.strokeStyle = '#f6c85f'; ctx.lineWidth = 1.5;
    const yb = top + 6;
    ctx.beginPath(); ctx.moveTo(X(0), yb); ctx.lineTo(X(tof), yb); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0), yb - 4); ctx.lineTo(X(0), yb + 4); ctx.moveTo(X(tof), yb - 4); ctx.lineTo(X(tof), yb + 4); ctx.stroke();
    ctx.fillStyle = '#f6c85f'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`Δt = ${tof.toFixed(0)} ns`, (X(0) + X(tof)) / 2, yb - 6); ctx.textAlign = 'left';
  }

  // now cursor
  if (active && prog < 1) { ctx.strokeStyle = 'rgba(126,224,196,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(nowNs), top); ctx.lineTo(X(nowNs), base); ctx.stroke(); ctx.setLineDash([]); }
}

export default function LidarRanging() {
  const [distance, setDistance] = useState(120);
  const [speed, setSpeed] = useState(1); // slow-motion scale (higher = faster)
  const [continuous, setContinuous] = useState(false);
  const [pulseWidth, setPulseWidth] = useState(10); // ns
  const [prf, setPrf] = useState(100); // kHz
  const [measured, setMeasured] = useState(null); // last completed { tof, range }

  const sceneRef = useRef(null); const timeRef = useRef(null);
  const params = useRef({}); const anim = useRef({ active: false, start: 0, prog: 0 });
  params.current = { distance, speed, continuous, pulseWidth };

  const fire = () => { anim.current = { active: true, start: performance.now(), prog: 0 }; };

  // rAF loop: imperative drawing so the pulse is smooth without re-rendering React.
  useEffect(() => {
    let raf;
    const loop = (now) => {
      const p = params.current;
      const a = anim.current;
      if (a.active) {
        const realDuration = (0.7 + (p.distance / DMAX) * 3.0) / p.speed; // seconds
        a.prog = clamp((now - a.start) / (realDuration * 1000), 0, 1);
        if (a.prog >= 1) {
          const tof = tofNs(p.distance);
          setMeasured({ tof, range: C * (tof * 1e-9) / 2 });
          if (p.continuous) { a.start = now; a.prog = 0; } else { a.active = false; }
        }
      }
      const sc = sceneRef.current; const tc = timeRef.current;
      if (sc) drawScene(sc.getContext('2d'), { distance: p.distance, prog: a.prog, active: a.active });
      if (tc) drawTiming(tc.getContext('2d'), { distance: p.distance, prog: a.prog, active: a.active, pulseWidth: p.pulseWidth });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tof = tofNs(distance);
  const oneWay = tof / 2;
  const rangeRes = C * (pulseWidth * 1e-9) / 2; // metres
  const rMax = C / (2 * prf * 1e3); // metres

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>LiDAR Ranging <span className="native-badge">Native React</span></h1>
          <span className="sub">Time of flight &rarr; distance: how a laser rangefinder measures range from a light pulse</span>
        </div>
        <span className="score-chip">c &#8776; <b>3&times;10&#8312; m/s</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> Fire a pulse <small>&mdash; watch it travel to the target and back</small></h2>
            <canvas ref={sceneRef} className="rng-canvas" width={SCENE_W} height={SCENE_H} />
            <div className="rng-fire">
              <button className="rng-btn" onClick={fire}>▶ Fire pulse</button>
              <label className="rng-chk"><input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} /> continuous</label>
              <span style={{ flex: 1 }} />
              <label className="rng-chk">slow-mo
                <input type="range" min="0.3" max="4" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ accentColor: '#0f8a4d' }} />
              </label>
            </div>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>Target distance R <b>{distance} m</b><input type="range" min="10" max={DMAX} step="1" value={distance} onChange={(e) => setDistance(Number(e.target.value))} /></label>
            </div>
            <div className="rng-legend">
              <span><i className="rng-swatch" style={{ background: '#5ad1ff' }} /> outgoing pulse</span>
              <span><i className="rng-swatch" style={{ background: '#ffae4d' }} /> returning echo</span>
              <span><i className="rng-swatch" style={{ background: '#7ee0c4' }} /> live range estimate</span>
            </div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">2</span> Timing measurement <small>&mdash; the sensor times the round trip</small></h2>
            <canvas ref={timeRef} className="rng-canvas" width={TIME_W} height={TIME_H} />
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
            <div className="rng-note">
              <b>Why divide by two?</b> The clock measures the <b>round trip</b> — out to the target and back — so the light
              travels <b>2R</b>. Dividing the total path by two gives the one-way distance. Light covers about
              0.3 m every nanosecond, so timing must be extremely precise: a 1 ns error is a 15 cm range error.
            </div>

            <div className="rng-sub">Range resolution</div>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>Pulse width τ <b>{pulseWidth} ns</b><input type="range" min="1" max="40" step="1" value={pulseWidth} onChange={(e) => setPulseWidth(Number(e.target.value))} /></label>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <div><span>ΔR = c·τ / 2</span><b>{rangeRes.toFixed(2)} m</b></div>
              <div><span>meaning</span><b style={{ fontSize: 12 }}>closest separable</b></div>
            </div>
            <div className="rng-note"><b>Shorter pulses see finer detail.</b> Two surfaces closer than ΔR return overlapping echoes the sensor can&rsquo;t tell apart, so a narrower pulse τ resolves closer objects.</div>

            <div className="rng-sub">Maximum unambiguous range</div>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>Pulse rate (PRF) <b>{prf} kHz</b><input type="range" min="10" max="400" step="5" value={prf} onChange={(e) => setPrf(Number(e.target.value))} /></label>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <div><span>R_max = c / (2·PRF)</span><b>{rMax >= 1000 ? `${(rMax / 1000).toFixed(2)} km` : `${rMax.toFixed(0)} m`}</b></div>
              <div><span>target R</span><b className={distance > rMax ? 'orange' : ''}>{distance} m</b></div>
            </div>
            <div className="rng-note"><b>Fire too fast and range wraps around.</b> If the next pulse leaves before the last echo returns, the sensor can&rsquo;t tell which pulse an echo belongs to. A higher pulse rate gives more points but a shorter unambiguous range.</div>
          </section>
        </div>
      </div>
    </div>
  );
}
