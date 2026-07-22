import { useEffect, useMemo, useRef, useState } from 'react';
import './simulation.css';

const WORLD = 400;
const BUILDINGS = [
  { x: 150, y: 150, w: 34, d: 26, h: 46, color: '#b0654a' },
  { x: 92, y: 236, w: 42, d: 22, h: 18, color: '#8a8f98' },
  { x: 212, y: 118, w: 26, d: 30, h: 26, color: '#a75c43' },
  { x: 250, y: 236, w: 30, d: 24, h: 14, color: '#7f8a94' },
  { x: 96, y: 96, w: 24, d: 20, h: 11, color: '#9a6a4e' },
  { x: 186, y: 288, w: 48, d: 20, h: 22, color: '#6e7a86' },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const terrain = (x, y) => Math.max(0, 22 * Math.exp(-(((x - 300) ** 2) + ((y - 110) ** 2)) / (2 * 72 ** 2)) + 1.5 * Math.sin(x / 70) + 1.5 * Math.cos(y / 85) + 1.5);
const buildingAt = (x, y) => BUILDINGS.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.d);

function drawSource(canvas, state, probe) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const scale = width / WORLD;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#16222e'; ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < WORLD; y += 20) for (let x = 0; x < WORLD; x += 20) {
    const shade = 82 + Math.round(55 * terrain(x + 10, y + 10) / 28);
    ctx.fillStyle = `rgb(${shade - 30},${shade},${shade - 20})`;
    ctx.fillRect(x * scale, y * scale, 20 * scale + 1, 20 * scale + 1);
  }
  ctx.strokeStyle = 'rgba(120,200,255,.38)'; ctx.lineWidth = 1;
  if (state.grid) for (let v = 0; v <= WORLD; v += 50) { ctx.beginPath(); ctx.moveTo(v * scale, 0); ctx.lineTo(v * scale, height); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, v * scale); ctx.lineTo(width, v * scale); ctx.stroke(); }
  BUILDINGS.forEach((b) => { ctx.fillStyle = b.color; ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.d * scale); ctx.fillStyle = 'rgba(255,235,205,.45)'; ctx.fillRect((b.x + 5) * scale, (b.y + 5) * scale, 5 * scale, 5 * scale); });
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.setLineDash([6, 5]); if (state.foot) BUILDINGS.forEach((b) => ctx.strokeRect(b.x * scale, b.y * scale, b.w * scale, b.d * scale)); ctx.setLineDash([]);
  ctx.strokeStyle = '#3fa9f5'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(probe.x * scale, probe.y * scale, 9, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(probe.x * scale - 14, probe.y * scale); ctx.lineTo(probe.x * scale + 14, probe.y * scale); ctx.moveTo(probe.x * scale, probe.y * scale - 14); ctx.lineTo(probe.x * scale, probe.y * scale + 14); ctx.stroke();
  ctx.fillStyle = '#e8f4ff'; ctx.font = '600 12px system-ui'; ctx.fillText('probe', probe.x * scale + 12, probe.y * scale - 10);
  ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(state.camX * scale, state.camY * scale, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText('camera', state.camX * scale + 10, state.camY * scale - 8);
}

function drawSection(canvas, state, probe, displacement) {
  const ctx = canvas.getContext('2d'); const { width, height } = canvas; ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, width, height);
  const baseline = height - 48; const top = 30; const sx = (s) => 35 + (s / 360) * (width - 70); const sy = (z) => baseline - (z / (state.H + 30)) * (baseline - top);
  ctx.strokeStyle = 'rgba(120,150,175,.2)'; ctx.lineWidth = 1; for (let z = 0; z <= state.H; z += 20) { ctx.beginPath(); ctx.moveTo(30, sy(z)); ctx.lineTo(width - 20, sy(z)); ctx.stroke(); ctx.fillStyle = '#8ea3b5'; ctx.font = '11px system-ui'; ctx.fillText(`${z} m`, 5, sy(z) + 4); }
  ctx.strokeStyle = '#7fa3c0'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(30, baseline); ctx.lineTo(width - 20, baseline); ctx.stroke();
  BUILDINGS.forEach((b) => { const x = sx(b.x); const w = (b.w / 360) * (width - 70); ctx.fillStyle = '#a86a52'; ctx.fillRect(x, sy(0) - 2, w, sy(0) - sy(b.h)); });
  const camS = sx(state.camX - probe.x + 180); const probeS = sx(180); const datumS = sx(180 + displacement); ctx.fillStyle = '#c9d9e6'; ctx.fillRect(camS - 22, sy(state.H) - 18, 44, 18); ctx.fillStyle = '#ff5a3c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(camS, sy(state.H)); ctx.lineTo(probeS, sy(22)); ctx.stroke(); ctx.setLineDash([5, 4]); ctx.strokeStyle = '#ff9d4d'; ctx.beginPath(); ctx.moveTo(probeS, sy(22)); ctx.lineTo(datumS, baseline); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = '#5fd07a'; ctx.beginPath(); ctx.moveTo(probeS, baseline); ctx.lineTo(probeS, sy(22)); ctx.stroke(); ctx.fillStyle = '#ff9d4d'; ctx.font = '600 12px system-ui'; ctx.fillText(`displacement ${displacement.toFixed(1)} m`, Math.min(probeS, datumS) - 25, baseline - 12);
}

function drawElevation(canvas, mode, selected) {
  const ctx = canvas.getContext('2d'); const { width, height } = canvas; const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const wx = (x / width) * WORLD; const wy = (y / height) * WORLD; const b = buildingAt(wx, wy); const z = mode === 'DSM' && b ? b.h + terrain(wx, wy) : terrain(wx, wy); const t = clamp(z / 60, 0, 1); const i = (y * width + x) * 4; image.data[i] = 55 + t * 180; image.data[i + 1] = 105 + t * 110; image.data[i + 2] = 75 + t * 80; image.data[i + 3] = 255; }
  ctx.putImageData(image, 0, 0); if (selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, width - 4, height - 4); }
}

export default function OrthoRectification() {
  const sourceRef = useRef(null); const sectionRef = useRef(null); const dtmRef = useRef(null); const dsmRef = useRef(null);
  const [state, setState] = useState({ H: 100, camX: 200, roll: 0, pitch: 0, grid: true, foot: true, mode: 'DSM' });
  const [probe, setProbe] = useState({ x: 167, y: 163 });
  const building = useMemo(() => buildingAt(probe.x, probe.y), [probe]);
  const probeHeight = terrain(probe.x, probe.y) + (building?.h || 0);
  const radial = Math.hypot(probe.x - state.camX, probe.y - 200);
  const displacement = radial * probeHeight / state.H;
  const update = (key) => (event) => setState((current) => ({ ...current, [key]: event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value) }));

  useEffect(() => { if (sourceRef.current) drawSource(sourceRef.current, state, probe); if (sectionRef.current) drawSection(sectionRef.current, state, probe, displacement); if (dtmRef.current) drawElevation(dtmRef.current, 'DTM', state.mode === 'DTM'); if (dsmRef.current) drawElevation(dsmRef.current, 'DSM', state.mode === 'DSM'); }, [state, probe, displacement]);
  const probeFromCanvas = (event) => { const rect = event.currentTarget.getBoundingClientRect(); setProbe({ x: clamp(((event.clientX - rect.left) / rect.width) * WORLD, 0, WORLD), y: clamp(((event.clientY - rect.top) / rect.height) * WORLD, 0, WORLD) }); };

  return <div className="sim-app"><header className="sim-topbar"><a className="back-link" href="../../">&larr; All simulators</a><div className="title-block"><h1>True Ortho-Rectification</h1><span className="sub">Tilted photo &rarr; elevation model &rarr; corrected map geometry</span></div><span className="score-chip">React migration: <b>active</b></span></header><div className="sim-layout"><div className="sim-col"><section className="sim-panel"><h2><span className="stepno">1</span> Source aerial photo <small>&mdash; click to probe</small></h2><canvas ref={sourceRef} className="sim-canvas" width="640" height="640" onClick={probeFromCanvas} /><div className="control-grid"><label>Flying height H <b>{state.H} m</b><input type="range" min="70" max="240" step="5" value={state.H} onChange={update('H')} /></label><label>Camera easting <b>{state.camX} m</b><input type="range" min="120" max="280" step="5" value={state.camX} onChange={update('camX')} /></label><label>Tilt roll <b>{state.roll}&deg;</b><input type="range" min="-14" max="14" value={state.roll} onChange={update('roll')} /></label><label>Tilt pitch <b>{state.pitch}&deg;</b><input type="range" min="-14" max="14" value={state.pitch} onChange={update('pitch')} /></label></div><div className="check-row"><label><input type="checkbox" checked={state.grid} onChange={update('grid')} /> 50 m map grid</label><label><input type="checkbox" checked={state.foot} onChange={update('foot')} /> footprints</label></div></section><section className="sim-panel"><h2><span className="stepno">2</span> Geometry at the probe <small>&mdash; drawn to scale</small></h2><canvas ref={sectionRef} className="sim-canvas section-canvas" width="640" height="380" /><div className="readouts"><div><span>radial r</span><b>{radial.toFixed(1)} m</b></div><div><span>height h</span><b>{probeHeight.toFixed(1)} m</b></div><div><span>flying H</span><b>{state.H} m</b></div><div><span>displacement d</span><b className="orange">{displacement.toFixed(1)} m</b></div></div><div className="equation">d = r &middot; h / H = {radial.toFixed(1)} &middot; {probeHeight.toFixed(1)} / {state.H}</div></section></div><div className="sim-col"><section className="sim-panel"><h2><span className="stepno">3</span> Elevation models <small>&mdash; what links image to ground</small></h2><div className="elevation-grid"><button className={state.mode === 'DTM' ? 'elevation selected' : 'elevation'} onClick={() => setState((s) => ({ ...s, mode: 'DTM' }))}><canvas ref={dtmRef} width="240" height="240" /><strong>DTM</strong><span>bare earth</span></button><button className={state.mode === 'DSM' ? 'elevation selected' : 'elevation'} onClick={() => setState((s) => ({ ...s, mode: 'DSM' }))}><canvas ref={dsmRef} width="240" height="240" /><strong>DSM</strong><span>earth + buildings</span></button></div></section><section className="sim-panel"><h2><span className="stepno">4</span> Rectify &mdash; project onto the datum</h2><div className="mode-list">{[['DATUM', 'No elevation', 'datum plane'], ['DTM', 'DTM', 'conventional orthophoto'], ['DSM', 'DSM', 'true orthophoto']].map(([mode, name, detail]) => <button key={mode} className={state.mode === mode ? 'rect-mode selected' : 'rect-mode'} onClick={() => setState((s) => ({ ...s, mode }))}><span className="mode-dot" /><span><b>{name}</b><small>{detail}</small></span></button>)}</div><div className="rect-summary"><b>{state.mode === 'DSM' ? 'TRUE orthophoto' : state.mode === 'DTM' ? 'Conventional orthophoto' : 'Datum projection'}</b><p>{state.mode === 'DSM' ? 'Building roofs are projected onto their true footprints using the surface model.' : state.mode === 'DTM' ? 'Relief is corrected, but buildings remain displaced because their heights are not represented.' : 'Every point is projected onto a flat plane, so terrain relief remains in the image geometry.'}</p></div></section></div></div></div>;
}
