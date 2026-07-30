import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './iot.css';

// ---------------------------------------------------------------------------
// IoT Digital Twin — a live smart-factory loop.
//
// Three physical machines run in real time. Sensors sample their state and
// publish telemetry that travels edge → MQTT broker → cloud, where a DIGITAL
// TWIN mirrors each machine, detects anomalies, predicts remaining life, and —
// with closed-loop control — sends actuation commands back down. Starve the
// twin of data (low sampling / high latency) and watch it drift out of sync.
// ---------------------------------------------------------------------------

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = () => Math.random() - 0.5;
const AMBIENT = 24; const TEMP_HI = 78; const VIB_HI = 8;

const DEFS = [
  { id: 'P-1', name: 'Coolant Pump', unit: 'bar' },
  { id: 'A-2', name: 'Air Handler', unit: 'kPa' },
  { id: 'C-3', name: 'Conveyor', unit: 'kW' },
];

function initModel() {
  const mk = () => ({ temp: 46 + rnd() * 4, vib: 2.4 + rnd(), load: 62, wear: 4, cooling: false, faults: { heat: false, bearing: false, surge: 0 } });
  const assets = DEFS.map(mk);
  const twin = DEFS.map(() => ({ temp: 46, vib: 2.4, load: 62, health: 96, tLast: 0, anom: 0, cmdCooling: false }));
  return {
    t: 0, assets, twin, packets: [], sampAcc: DEFS.map(() => 0),
    stats: { msgs: 0, delivered: 0, lost: 0, latSum: 0, latN: 0 }, msgWin: [],
    alerts: [], hist: DEFS.map(() => ({ p: [], t: [], cool: [] })), lastHist: 0,
  };
}

// physical dynamics for one machine over dt seconds
function stepAsset(a, dt) {
  const f = a.faults;
  if (f.surge > 0) { a.load = lerp(a.load, 100, clamp(dt * 3, 0, 1)); f.surge -= dt; } else a.load = lerp(a.load, 62, clamp(dt * 0.6, 0, 1));
  const heatFault = f.heat ? 34 : 0;
  const wearHeat = a.wear * 0.12;
  const target = AMBIENT + a.load * 0.34 + heatFault + wearHeat - (a.cooling ? 30 : 0);
  a.temp += (target - a.temp) * (1 - Math.exp(-dt / 7)) + rnd() * 0.25;
  const bearing = f.bearing ? 6 + a.wear * 0.12 : 0;
  a.vib = clamp(1.6 + a.load * 0.018 + a.wear * 0.05 + bearing + rnd() * 0.5, 0.3, 30);
  a.wear += dt * (0.02 + Math.max(0, a.temp - 72) * 0.006 + Math.max(0, a.vib - 6) * 0.02 + (f.bearing ? 0.05 : 0));
  a.wear = clamp(a.wear, 0, 100);
}

function pushAlert(M, kind, text) {
  const last = M.alerts[0];
  if (last && last.text === text && M.t - last.tRaw < 6) return; // dedupe
  M.alerts.unshift({ kind, text, tRaw: M.t, label: `${M.t.toFixed(0)}s` });
  if (M.alerts.length > 7) M.alerts.pop();
}

// deliver a telemetry reading into the twin + run analytics
function ingest(M, i, r, closed) {
  const tw = M.twin[i]; const d = DEFS[i];
  tw.temp = r.temp; tw.vib = r.vib; tw.load = r.load; tw.health = r.health; tw.tLast = M.t;
  const expected = AMBIENT + r.load * 0.34; tw.anom = Math.abs(r.temp - expected);
  if (r.temp > TEMP_HI) pushAlert(M, 'temp', `${d.id} ${d.name}: high temperature ${r.temp.toFixed(0)}°C`);
  if (r.vib > VIB_HI) pushAlert(M, 'vib', `${d.id} ${d.name}: high vibration ${r.vib.toFixed(1)} mm/s`);
  if (tw.anom > 16) pushAlert(M, 'anom', `${d.id}: anomaly — reading ${(tw.anom).toFixed(0)}°C above model`);
  if (r.health < 32) pushAlert(M, 'maint', `${d.id}: maintenance due (RUL ${(r.health * 7).toFixed(0)} h)`);
  // closed-loop actuation: twin decides cooling with hysteresis
  if (closed) {
    if (tw.temp > TEMP_HI && !tw.cmdCooling) { tw.cmdCooling = true; sendCommand(M, i, true); pushAlert(M, 'cmd', `${d.id}: twin → START cooling`); }
    else if (tw.temp < TEMP_HI - 12 && tw.cmdCooling) { tw.cmdCooling = false; sendCommand(M, i, false); pushAlert(M, 'ok', `${d.id}: twin → stop cooling`); }
  }
}

function sendCommand(M, i, on) { M.packets.push({ i, cmd: true, on, prog: 0, dur: 0.9, live: true }); }

// waypoints for lane i (telemetry left→right, command right→left offset)
function lanePath(i, cmd) {
  const y = 118 + i * 118 + (cmd ? 20 : 0);
  const xs = cmd ? [880, 610, 372, 168] : [168, 372, 610, 812];
  return xs.map((x) => [x, y]);
}
function alongPath(pts, p) {
  const seg = 1 / (pts.length - 1); let k = clamp(Math.floor(p / seg), 0, pts.length - 2); const local = (p - k * seg) / seg;
  return [lerp(pts[k][0], pts[k + 1][0], local), lerp(pts[k][1], pts[k + 1][1], local)];
}

function healthColor(h) { return h > 60 ? '#39c07a' : h > 32 ? '#e6a100' : '#e0503b'; }

// ---- drawing --------------------------------------------------------------
function drawStage(ctx, M, sel, W, H) {
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0c1826'); g.addColorStop(1, '#0a1420'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // column bands + headers
  const cols = [[40, 300, 'PHYSICAL ASSETS', '#8fd0ff'], [300, 470, 'EDGE GATEWAY', '#7ee0c4'], [470, 720, 'MQTT BROKER · CLOUD', '#c9b3ff'], [720, W - 12, 'DIGITAL TWIN', '#ffd27a']];
  cols.forEach(([x0, x1, label, c], idx) => {
    if (idx % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.015)'; ctx.fillRect(x0, 40, x1 - x0, H - 52); }
    ctx.fillStyle = c; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, (x0 + x1) / 2, 24);
  });
  // lanes
  for (let i = 0; i < 3; i += 1) {
    const pts = lanePath(i, false);
    ctx.strokeStyle = 'rgba(143,208,255,.16)'; ctx.lineWidth = 2; ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  }
  // gateway + broker nodes
  const nodeBox = (x, yTop, yBot, fill, stroke, label) => {
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.beginPath();
    ctx.roundRect(x - 26, yTop, 52, yBot - yTop, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = stroke; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, x, yBot - 8);
  };
  nodeBox(372, 92, 400, 'rgba(126,224,196,.10)', '#7ee0c4', 'EDGE');
  ctx.fillStyle = '#7ee0c4'; ctx.font = '16px system-ui'; ctx.fillText('⛃', 372, 110);
  nodeBox(610, 92, 400, 'rgba(201,179,255,.10)', '#c9b3ff', 'BROKER');
  ctx.fillStyle = '#c9b3ff'; ctx.font = '15px system-ui'; ctx.fillText('☁', 610, 110);
  ctx.font = '9px system-ui'; ctx.fillStyle = 'rgba(201,179,255,.7)';
  DEFS.forEach((d, i) => ctx.fillText(`topic/${d.id}`, 610, 128 + i * 118 - 34));

  const now = M.t;
  // physical machines + twin cards
  for (let i = 0; i < 3; i += 1) {
    const a = M.assets[i]; const tw = M.twin[i]; const d = DEFS[i]; const y = 118 + i * 118;
    const hot = clamp((a.temp - 55) / 40, 0, 1); const health = clamp(100 - a.wear, 0, 100);
    // physical machine (with heat glow + vibration jitter)
    const jx = a.vib > 4 ? rnd() * (a.vib - 4) * 0.5 : 0; const jy = a.vib > 4 ? rnd() * (a.vib - 4) * 0.5 : 0;
    const mx = 168 + jx; const my = y + jy;
    if (hot > 0.02) { const rg = ctx.createRadialGradient(mx, my, 4, mx, my, 52); rg.addColorStop(0, `rgba(255,90,50,${hot * 0.55})`); rg.addColorStop(1, 'rgba(255,90,50,0)'); ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(mx, my, 52, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#1b2b3c'; ctx.strokeStyle = i === sel ? '#ffd27a' : '#37506a'; ctx.lineWidth = i === sel ? 3 : 2;
    ctx.beginPath(); ctx.roundRect(mx - 40, my - 32, 80, 64, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = healthColor(health); ctx.beginPath(); ctx.arc(mx - 26, my - 18, 5, 0, 7); ctx.fill(); // status LED
    // sensor pulse
    const pulse = 3 + 2.4 * (0.5 + 0.5 * Math.sin(now * 6 + i));
    ctx.fillStyle = '#5ad1ff'; ctx.beginPath(); ctx.arc(mx + 28, my - 20, pulse, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(90,209,255,.4)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(mx + 28, my - 20, pulse + 4, 0, 7); ctx.stroke();
    ctx.fillStyle = '#dbe9f2'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(d.id, mx, my + 4);
    ctx.fillStyle = '#8fa9c0'; ctx.font = '9px system-ui'; ctx.fillText(d.name, mx, my + 18);
    if (a.cooling) { ctx.fillStyle = '#5ad1ff'; ctx.font = '9px system-ui'; ctx.fillText('❄ cooling', mx, my - 40); }
    ctx.fillStyle = '#ff8f6b'; ctx.font = '10px monospace'; ctx.textAlign = 'left'; ctx.fillText(`${a.temp.toFixed(0)}°C`, mx - 38, my + 44);
    ctx.fillStyle = '#ffca5f'; ctx.textAlign = 'right'; ctx.fillText(`${a.vib.toFixed(1)}mm/s`, mx + 38, my + 44);

    // twin card
    const tx = 812; const stale = now - tw.tLast; const health2 = tw.health; const alert = tw.temp > TEMP_HI || tw.vib > VIB_HI;
    ctx.fillStyle = 'rgba(120,150,200,.10)'; ctx.strokeStyle = alert ? '#e0503b' : (i === sel ? '#ffd27a' : '#4a6b8f'); ctx.lineWidth = i === sel || alert ? 3 : 2;
    ctx.beginPath(); ctx.roundRect(tx - 62, y - 40, 150, 80, 10); ctx.fill(); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(143,208,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(tx - 56, y - 34, 138, 68); ctx.setLineDash([]);
    ctx.fillStyle = '#bcd3e6'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`⌘ TWIN ${d.id}`, tx - 54, y - 24);
    ctx.fillStyle = '#ff8f6b'; ctx.font = '700 20px monospace'; ctx.fillText(`${tw.temp.toFixed(1)}`, tx - 54, y);
    ctx.fillStyle = '#8fa9c0'; ctx.font = '10px system-ui'; ctx.fillText('°C', tx - 12, y + 2);
    ctx.fillStyle = '#ffca5f'; ctx.font = '10px monospace'; ctx.fillText(`vib ${tw.vib.toFixed(1)}`, tx - 54, y + 18);
    // health/RUL bar
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(tx + 6, y - 2, 76, 7); ctx.fillStyle = healthColor(health2); ctx.fillRect(tx + 6, y - 2, 76 * health2 / 100, 7);
    ctx.fillStyle = '#8fa9c0'; ctx.font = '9px system-ui'; ctx.fillText(`RUL ${(health2 * 7).toFixed(0)}h`, tx + 6, y + 16);
    // sync freshness
    ctx.fillStyle = stale > 3 ? '#e0503b' : stale > 1.2 ? '#e6a100' : '#39c07a'; ctx.font = '9px monospace'; ctx.textAlign = 'right';
    ctx.fillText(`${stale < 60 ? `${stale.toFixed(1)}s ago` : '—'}`, tx + 82, y - 24);
  }

  // packets
  M.packets.forEach((pk) => {
    if (!pk.live) return;
    const pts = lanePath(pk.i, pk.cmd); const [x, yy] = alongPath(pts, clamp(pk.prog, 0, 1));
    if (pk.cmd) { ctx.fillStyle = '#ffb703'; ctx.strokeStyle = 'rgba(255,183,3,.4)'; } else { ctx.fillStyle = pk.willDeliver ? '#5ad1ff' : '#e0503b'; ctx.strokeStyle = 'rgba(90,209,255,.35)'; }
    ctx.beginPath(); ctx.arc(x, yy, 4.5, 0, 7); ctx.fill();
    ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, yy, 8, 0, 7); ctx.stroke();
    if (!pk.willDeliver && !pk.cmd && pk.prog > 0.55) { ctx.fillStyle = '#e0503b'; ctx.font = '9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('✕ lost', x, yy - 12); }
  });
}

function drawChart(ctx, M, sel, W, H) {
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0c1826'; ctx.fillRect(0, 0, W, H);
  const h = M.hist[sel]; const n = h.p.length; const x0 = 40; const x1 = W - 12; const y0 = 16; const y1 = H - 22;
  const lo = 20; const hi = 120; const Y = (v) => y1 - (clamp(v, lo, hi) - lo) / (hi - lo) * (y1 - y0);
  // threshold + cooling shading
  ctx.strokeStyle = 'rgba(224,80,59,.5)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0, Y(TEMP_HI)); ctx.lineTo(x1, Y(TEMP_HI)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#e0503b'; ctx.font = '9px system-ui'; ctx.textAlign = 'left'; ctx.fillText(`${TEMP_HI}°C limit`, x0 + 3, Y(TEMP_HI) - 6);
  if (n > 1) {
    const X = (k) => x0 + (k / (n - 1)) * (x1 - x0);
    for (let k = 0; k < n; k += 1) { if (h.cool[k]) { ctx.fillStyle = 'rgba(90,209,255,.10)'; ctx.fillRect(X(k) - 1, y0, (x1 - x0) / n + 2, y1 - y0); } }
    const plot = (arr, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); arr.forEach((v, k) => (k ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v)))); ctx.stroke(); };
    plot(h.p, '#ff8f6b', 2.2); plot(h.t, '#5ad1ff', 2);
  }
  ctx.fillStyle = '#8fa9c0'; ctx.font = '10px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('physical', x0 + 60, y0 + 8); ctx.fillStyle = '#ff8f6b'; ctx.fillRect(x0 + 44, y0 + 3, 12, 4);
  ctx.fillStyle = '#8fa9c0'; ctx.fillText('twin', x0 + 152, y0 + 8); ctx.fillStyle = '#5ad1ff'; ctx.fillRect(x0 + 136, y0 + 3, 12, 4);
  ctx.fillStyle = '#61748a'; ctx.font = '9px monospace'; ctx.textAlign = 'right'; ctx.fillText('120', x0 - 4, Y(120)); ctx.fillText('20', x0 - 4, Y(20));
}

export default function IotDigitalTwin() {
  const [sel, setSel] = useState(0);
  const [running, setRunning] = useState(true);
  const [closed, setClosed] = useState(true);
  const [samp, setSamp] = useState(2);
  const [lat, setLat] = useState(180);
  const [loss, setLoss] = useState(3);
  const [speed, setSpeed] = useState(1);
  const [ui, setUi] = useState({ rate: 0, lat: 0, sync: 0, inflight: 0, delivered: 0, lost: 0, alerts: [] });

  const stageRef = useRef(null); const chartRef = useRef(null); const M = useRef(initModel());
  const cfg = useRef({ sel, running, closed, samp, lat, loss, speed });
  cfg.current = { sel, running, closed, samp, lat, loss, speed };

  useEffect(() => {
    let raf = 0; let last = performance.now(); let uiAcc = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now(); let dtr = (now - last) / 1000; last = now; dtr = Math.min(dtr, 0.05);
      const c = cfg.current; const m = M.current;
      if (c.running) {
        const dt = dtr * c.speed; m.t += dt;
        for (let i = 0; i < 3; i += 1) stepAsset(m.assets[i], dt);
        // sampling → telemetry packets
        for (let i = 0; i < 3; i += 1) {
          m.sampAcc[i] += dt;
          if (m.sampAcc[i] >= 1 / c.samp) {
            m.sampAcc[i] = 0; const a = m.assets[i];
            const r = { temp: a.temp + rnd() * 0.6, vib: a.vib + rnd() * 0.3, load: a.load + rnd(), health: clamp(100 - a.wear, 0, 100) };
            const willDeliver = Math.random() * 100 >= c.loss;
            m.packets.push({ i, cmd: false, r, prog: 0, dur: clamp(c.lat / 1000 * 2 + 0.35, 0.35, 4), live: true, willDeliver });
            m.stats.msgs += 1; m.msgWin.push(m.t);
          }
        }
        // advance packets
        for (const pk of m.packets) {
          if (!pk.live) continue;
          pk.prog += dt / pk.dur;
          if (!pk.cmd && !pk.willDeliver && pk.prog >= 0.62) { pk.live = false; m.stats.lost += 1; }
          else if (pk.prog >= 1) {
            pk.live = false;
            if (pk.cmd) { m.assets[pk.i].cooling = pk.on; }
            else { m.stats.delivered += 1; m.stats.latN += 1; m.stats.latSum += pk.dur; ingest(m, pk.i, pk.r, c.closed); }
          }
        }
        if (m.packets.length > 400) m.packets = m.packets.filter((p) => p.live);
        // history buffers ~10 Hz
        if (m.t - m.lastHist > 0.1) {
          m.lastHist = m.t;
          for (let i = 0; i < 3; i += 1) { const h = m.hist[i]; h.p.push(m.assets[i].temp); h.t.push(m.twin[i].temp); h.cool.push(m.assets[i].cooling); if (h.p.length > 220) { h.p.shift(); h.t.shift(); h.cool.shift(); } }
        }
        m.msgWin = m.msgWin.filter((tt) => m.t - tt < 1.5);
      }
      // draw
      const s = stageRef.current; if (s) drawStage(s.getContext('2d'), m, c.sel, s.width, s.height);
      const ch = chartRef.current; if (ch) drawChart(ch.getContext('2d'), m, c.sel, ch.width, ch.height);
      // throttled UI snapshot
      uiAcc += dtr;
      if (uiAcc > 0.25) {
        uiAcc = 0; const st = m.stats;
        const sync = Math.abs(m.assets[c.sel].temp - m.twin[c.sel].temp);
        setUi({
          rate: m.msgWin.length / 1.5, lat: st.latN ? (st.latSum / st.latN) * 1000 : 0, sync,
          inflight: m.packets.filter((p) => p.live).length, delivered: st.delivered, lost: st.lost,
          alerts: m.alerts.slice(0, 6).map((al) => ({ ...al })),
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fault = (kind) => {
    const a = M.current.assets[sel];
    if (kind === 'clear') { a.faults = { heat: false, bearing: false, surge: 0 }; a.cooling = false; M.current.twin[sel].cmdCooling = false; }
    else if (kind === 'heat') a.faults.heat = true;
    else if (kind === 'bearing') a.faults.bearing = true;
    else if (kind === 'surge') a.faults.surge = 5;
  };

  const syncCls = ui.sync > 8 ? 'bad' : ui.sync > 3 ? 'warn' : 'good';
  const d = DEFS[sel];

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>IoT Digital Twin <span className="native-badge">Native React</span></h1>
          <span className="sub">A live smart factory: sensors → edge → MQTT → cloud twin → analytics → actuation</span>
        </div>
        <span className="score-chip">twin sync Δ <b>{ui.sync.toFixed(1)}°C</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> The live loop <small>&mdash; physical ⇄ digital twin</small></h2>
            <canvas ref={stageRef} className="iot-stage" width={980} height={520} />
            <div className="iot-legend">
              <span><i className="iot-sw" style={{ background: '#5ad1ff' }} /> telemetry packet</span>
              <span><i className="iot-sw" style={{ background: '#e0503b' }} /> dropped packet</span>
              <span><i className="iot-sw" style={{ background: '#ffb703' }} /> actuation command</span>
              <span><i className="iot-sw" style={{ background: '#39c07a' }} /> healthy</span>
              <span><i className="iot-sw" style={{ background: '#e0503b' }} /> alarm</span>
            </div>
            <div className="iot-toprow">
              <button className={`iot-btn ${running ? 'on' : ''}`} onClick={() => setRunning((r) => !r)}>{running ? '❚❚ pause' : '▶ run'}</button>
              <button className={`iot-btn ${closed ? 'on' : ''}`} onClick={() => setClosed((c) => !c)}>{closed ? '✓ closed-loop control' : 'open loop'}</button>
              <div className="iot-assets">
                {DEFS.map((a, i) => (<button key={a.id} className={`iot-abtn ${sel === i ? 'on' : ''}`} onClick={() => setSel(i)}><b>{a.id}</b><span>{a.name}</span></button>))}
              </div>
            </div>
            <div className="iot-faults">
              <span style={{ fontSize: 11, color: '#7d8fa1', alignSelf: 'center', marginRight: 2 }}>inject fault on <b>{d.id}</b>:</span>
              <button className="iot-btn" onClick={() => fault('heat')}>🔥 overheat</button>
              <button className="iot-btn" onClick={() => fault('bearing')}>⚙ bearing wear</button>
              <button className="iot-btn" onClick={() => fault('surge')}>⚡ load surge</button>
              <button className="iot-btn" onClick={() => fault('clear')}>✓ clear</button>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">2</span> Twin telemetry &amp; health <small>&mdash; {d.id} {d.name}</small></h2>
            <canvas ref={chartRef} className="iot-stage" width={560} height={180} style={{ height: 'auto' }} />
            <div className="iot-kpis">
              <div><span>msg rate</span><b>{ui.rate.toFixed(1)}/s</b></div>
              <div><span>avg latency</span><b className={ui.lat > 900 ? 'warn' : ''}>{ui.lat.toFixed(0)} ms</b></div>
              <div><span>twin sync Δ</span><b className={syncCls}>{ui.sync.toFixed(1)}°C</b></div>
              <div><span>in flight</span><b>{ui.inflight}</b></div>
              <div><span>delivered</span><b className="good">{ui.delivered}</b></div>
              <div><span>lost</span><b className={ui.lost > 0 ? 'bad' : ''}>{ui.lost}</b></div>
              <div><span>packet loss</span><b>{loss}%</b></div>
              <div><span>mode</span><b>{closed ? 'auto' : 'manual'}</b></div>
            </div>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>sampling rate <b>{samp.toFixed(1)} Hz</b><input type="range" min="0.2" max="10" step="0.1" value={samp} onChange={(e) => setSamp(Number(e.target.value))} /></label>
              <label>network latency <b>{lat} ms</b><input type="range" min="20" max="1500" step="10" value={lat} onChange={(e) => setLat(Number(e.target.value))} /></label>
              <label>packet loss <b>{loss}%</b><input type="range" min="0" max="30" step="1" value={loss} onChange={(e) => setLoss(Number(e.target.value))} /></label>
              <label>sim speed <b>{speed.toFixed(1)}×</b><input type="range" min="0.5" max="4" step="0.5" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} /></label>
            </div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">3</span> Twin analytics &amp; alerts</h2>
            <div className="iot-alerts">
              {ui.alerts.length === 0 ? <div className="iot-empty">All systems nominal — no alerts. Inject a fault to see the twin react.</div>
                : ui.alerts.map((al, k) => (
                  <div key={k} className={`iot-alert ${al.kind === 'cmd' || al.kind === 'ok' ? 'ok' : al.kind === 'anom' ? 'info' : ''}`}>
                    <b>{al.kind === 'temp' ? '🌡' : al.kind === 'vib' ? '📳' : al.kind === 'anom' ? '⚠' : al.kind === 'maint' ? '🔧' : al.kind === 'cmd' ? '🛠' : '✓'}</b>
                    <span>{al.text}</span><time>{al.label}</time>
                  </div>
                ))}
            </div>
            <div className="iot-note">Raise <b>latency</b> or drop <b>sampling</b> and the <b>twin sync Δ</b> grows — the twin is only as fresh as its data, so anomalies are caught later and control reacts slower. That gap is the core engineering trade-off of every digital twin.</div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">4</span> How IoT drives a digital twin</h2>
            <div className="iot-layers">
              <div className="iot-layer"><i style={{ background: '#5ad1ff' }}>①</i><div><b>Sense</b><span>Sensors on each asset sample temperature, vibration, load — turning physics into digital signals at a chosen rate.</span></div></div>
              <div className="iot-layer"><i style={{ background: '#7ee0c4' }}>②</i><div><b>Edge</b><span>A gateway aggregates, filters and timestamps readings close to the machine, cutting bandwidth and latency.</span></div></div>
              <div className="iot-layer"><i style={{ background: '#c9b3ff' }}>③</i><div><b>Connect</b><span>Lightweight pub/sub (MQTT) carries each device&rsquo;s topic to the cloud over the network — with real latency and loss.</span></div></div>
              <div className="iot-layer"><i style={{ background: '#ffd27a' }}>④</i><div><b>Twin</b><span>The cloud twin stores each asset&rsquo;s live state, runs rules &amp; ML to detect anomalies and predict remaining life (RUL).</span></div></div>
              <div className="iot-layer"><i style={{ background: '#39c07a' }}>⑤</i><div><b>Act</b><span>Insights flow back as commands (start cooling, throttle, schedule maintenance) — closing the loop, physical ⇄ digital.</span></div></div>
            </div>
            <div className="rect-summary">
              <b>What a digital twin really is</b>
              <p>
                A digital twin is a <b>living, data-driven replica</b> of a physical asset, kept in sync by a stream of IoT
                telemetry. It is more than a 3D model: it holds the asset&rsquo;s <b>current state</b>, its <b>history</b>, and
                <b> models</b> that turn raw sensor data into meaning — spotting an <b>anomaly</b> the moment a reading leaves its
                expected envelope, estimating <b>remaining useful life</b>, and running <b>what-if</b> scenarios. Because the link
                is two-way, the twin doesn&rsquo;t just watch — it <b>acts back</b> on the machine. The whole value rests on the IoT
                pipeline you can tune here: sample fast enough, keep latency low, and the twin faithfully mirrors reality.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
