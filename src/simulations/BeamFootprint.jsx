import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './simulation.css';
import './native.css';
import './beam.css';

// ---------------------------------------------------------------------------
// Laser Beam Divergence & Footprint  (NIGST — Principles of LiDAR).
//
// A LiDAR transmitter emits a narrow beam with a small divergence angle γ. The
// patch it illuminates is the footprint, whose diameter grows with range:
//     d = d0 + R·γ           (γ in radians; R = slant range)
// For an airborne scanner at height H pointed θ off-nadir over flat ground:
//     R = H / cosθ           → d = d0 + Hγ/cosθ
// The round beam meets the tilted ground as an ELLIPSE — the same beam spreads
// over a larger, oblique footprint as θ grows:
//     minor (cross-track) b = d ,  major (along-range) a = d / cosθ
//     area = π·a·b/4 = π H²γ² / (4 cos³θ)   ,  elongation a/b = 1/cosθ
// Bigger footprint → coarser detail, energy spread thinner (weaker return) and
// the echo is stretched in time (poorer range precision); at grazing angles the
// return can be lost entirely.
// ---------------------------------------------------------------------------

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const D2R = Math.PI / 180;
const WORLD_H = 4.6; // sensor height in world units (schematic)

// true geometry (metres)
function geom(H, gmrad, thetaDeg, d0mm) {
  const th = thetaDeg * D2R; const R = H / Math.cos(th);
  const d = d0mm / 1000 + R * (gmrad / 1000); // beam diameter at target (m)
  const minor = d; const major = d / Math.cos(th);
  const area = (Math.PI * major * minor) / 4;
  return { R, d, minor, major, area, elong: 1 / Math.cos(th), th };
}

function labelSprite(text, color = '#eaf3ec') {
  const pad = 14; const font = 'bold 30px system-ui';
  const mc = document.createElement('canvas').getContext('2d'); mc.font = font;
  const w = Math.ceil(mc.measureText(text).width + pad * 2); const h = 46; const s = 2;
  const cv = document.createElement('canvas'); cv.width = w * s; cv.height = h * s; const x = cv.getContext('2d'); x.scale(s, s);
  x.fillStyle = 'rgba(12,22,18,.72)'; x.beginPath(); x.roundRect(0, 0, w, h, 9); x.fill();
  x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(w / 72, h / 72, 1); sp.renderOrder = 10; return sp;
}

function buildBeam(H, gmrad, thetaDeg, d0mm, mats) {
  const grp = new THREE.Group();
  const g = geom(H, gmrad, thetaDeg, d0mm);
  const th = g.th; const dir = new THREE.Vector3(Math.sin(th), -Math.cos(th), 0); // beam direction
  const sensor = new THREE.Vector3(0, WORLD_H, 0);
  const worldR = WORLD_H / Math.cos(th); // beam length in world units
  const hit = new THREE.Vector3(WORLD_H * Math.tan(th), 0, 0);
  // footprint scaled for visibility: minor→world, capped
  const wMinor = clamp(g.minor * 0.62, 0.14, 3.0); const wMajor = wMinor / Math.cos(th);

  // beam cone (apex at sensor, base = perpendicular circle of radius wMinor/2)
  const cone = new THREE.Mesh(new THREE.ConeGeometry(wMinor / 2, worldR, 40, 1, true), mats.cone);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
  cone.quaternion.copy(q); cone.position.copy(sensor).addScaledVector(dir, worldR / 2);
  grp.add(cone);
  // beam axis line
  const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([sensor, hit]), mats.axis); grp.add(axis);

  // ground footprint ellipse (filled disc + ring), elongated along x (range dir)
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), mats.foot);
  disc.rotation.x = -Math.PI / 2; disc.scale.set(wMajor * 2, wMinor * 2, 1); disc.position.copy(hit); disc.position.y = 0.012; grp.add(disc);
  const ringPts = []; for (let k = 0; k <= 64; k += 1) { const a = (k / 64) * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * wMajor, 0.02, Math.sin(a) * wMinor)); }
  const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts.map((p) => p.clone().add(hit).setY(0.02))), mats.ring); grp.add(ring);
  // nadir circle (what the footprint would be at θ=0) for contrast
  const nPts = []; const rN = clamp(g.d * 0.62, 0.14, 3.0); for (let k = 0; k <= 48; k += 1) { const a = (k / 48) * Math.PI * 2; nPts.push(new THREE.Vector3(Math.cos(a) * rN, 0.02, Math.sin(a) * rN)); }
  const ncircle = new THREE.Line(new THREE.BufferGeometry().setFromPoints(nPts), mats.nadirC); grp.add(ncircle);

  // sensor (scanner) box
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.32, 0.6), mats.sensor); box.position.copy(sensor); grp.add(box);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 20), mats.lens); lens.position.copy(sensor).add(new THREE.Vector3(0, -0.2, 0)); grp.add(lens);
  // nadir reference (vertical dashed)
  const nad = new THREE.Line(new THREE.BufferGeometry().setFromPoints([sensor, new THREE.Vector3(0, 0, 0)]), mats.nadir); grp.add(nad);

  // labels
  const lH = labelSprite(`H ${H} m`, '#bfe3c9'); lH.position.set(-0.7, WORLD_H / 2, 0); grp.add(lH);
  const lTh = labelSprite(`θ ${thetaDeg}°`, '#ffd8a0'); lTh.position.set(hit.x * 0.5 + 0.2, 0.55, 0.2); grp.add(lTh);
  const lF = labelSprite(`${g.major < 1 ? (g.major * 100).toFixed(0) + ' cm' : g.major.toFixed(2) + ' m'} × ${g.minor < 1 ? (g.minor * 100).toFixed(0) + ' cm' : g.minor.toFixed(2) + ' m'}`, '#ffb0a0');
  lF.position.set(hit.x, 0.5, wMinor + 0.5); grp.add(lF);
  return grp;
}

function gridPlane() {
  const grp = new THREE.Group();
  const grid = new THREE.GridHelper(24, 24, 0x2f5a3f, 0x1c3a29); grp.add(grid);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.MeshBasicMaterial({ color: 0x0e2018, transparent: true, opacity: 0.55 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.01; grp.add(ground);
  return grp;
}

export default function BeamFootprint() {
  const [H, setH] = useState(1000);
  const [gmrad, setG] = useState(0.5);
  const [theta, setTheta] = useState(15);
  const [d0, setD0] = useState(15);
  const [spin, setSpin] = useState(true);

  const mountRef = useRef(null); const three = useRef(null); const modelRef = useRef(null);
  const insetRef = useRef(null); const cH = useRef(null); const cA = useRef(null);

  useEffect(() => {
    const mount = mountRef.current; if (!mount) return undefined;
    const W = mount.clientWidth; const Ht = mount.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / Ht, 0.1, 100); camera.position.set(6.5, 5.2, 8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, Ht); mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.target.set(1, 1.4, 0); controls.minDistance = 3; controls.maxDistance = 26;
    scene.add(new THREE.AmbientLight(0xffffff, 0.9)); const dir = new THREE.DirectionalLight(0xffffff, 0.5); dir.position.set(5, 8, 6); scene.add(dir);
    scene.add(gridPlane());
    const mats = {
      cone: new THREE.MeshBasicMaterial({ color: 0xff5a3a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
      axis: new THREE.LineBasicMaterial({ color: 0xff7a4a }),
      foot: new THREE.MeshBasicMaterial({ color: 0xff6a4a, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
      ring: new THREE.LineBasicMaterial({ color: 0xffd85e }),
      nadirC: new THREE.LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.55 }),
      sensor: new THREE.MeshPhongMaterial({ color: 0xe8eff5 }),
      lens: new THREE.MeshPhongMaterial({ color: 0x3a4a5a }),
      nadir: new THREE.LineDashedMaterial({ color: 0x8fb0c8, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.6 }),
    };
    three.current = { scene, camera, renderer, controls, mats, raf: 0, disposed: false };
    modelRef.current = buildBeam(H, gmrad, theta, d0, mats); modelRef.current.traverse((o) => { if (o.computeLineDistances) o.computeLineDistances(); }); scene.add(modelRef.current);
    const loop = () => { const t = three.current; if (!t || t.disposed) return; t.raf = requestAnimationFrame(loop); if (spinRef.current && modelRef.current) modelRef.current.rotation.y += 0.004; t.controls.update(); t.renderer.render(t.scene, t.camera); };
    loop();
    const onResize = () => { const t = three.current; if (!t) return; const w = mount.clientWidth; const h = mount.clientHeight; t.camera.aspect = w / h; t.camera.updateProjectionMatrix(); t.renderer.setSize(w, h); };
    window.addEventListener('resize', onResize);
    return () => { const t = three.current; t.disposed = true; cancelAnimationFrame(t.raf); window.removeEventListener('resize', onResize); controls.dispose(); renderer.dispose(); if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); three.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spinRef = useRef(spin); spinRef.current = spin;
  useEffect(() => {
    const t = three.current; if (!t) return;
    if (modelRef.current) { t.scene.remove(modelRef.current); modelRef.current.traverse((o) => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); }
    const grp = buildBeam(H, gmrad, theta, d0, t.mats); grp.traverse((o) => { if (o.computeLineDistances) o.computeLineDistances(); });
    modelRef.current = grp; t.scene.add(grp);
  }, [H, gmrad, theta, d0]);

  const g = geom(H, gmrad, theta, d0);
  const gNadir = geom(H, gmrad, 0, d0);
  const exag = Math.round(clamp(g.minor * 0.62, 0.14, 3.0) / (g.minor * WORLD_H / H)); // true visual magnification

  // 2D inset (to scale): nadir circle vs tilted ellipse
  useEffect(() => {
    const cv = insetRef.current; if (!cv) return; const ctx = cv.getContext('2d'); const S = cv.width; ctx.clearRect(0, 0, S, S); ctx.fillStyle = '#0c1826'; ctx.fillRect(0, 0, S, S);
    const cx = S / 2; const cy = S / 2; const maxDim = Math.max(g.major, gNadir.d) * 1.25; const pxpm = (S * 0.42) / maxDim;
    // grid ring scale
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1; [0.25, 0.5, 0.75, 1].forEach((f) => { ctx.beginPath(); ctx.arc(cx, cy, S * 0.42 * f, 0, 7); ctx.stroke(); });
    // nadir circle
    ctx.strokeStyle = 'rgba(90,209,255,.7)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(cx, cy, gNadir.d / 2 * pxpm, 0, 7); ctx.stroke();
    // ellipse (major along x)
    ctx.fillStyle = 'rgba(255,106,74,.28)'; ctx.strokeStyle = '#ffb703'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, g.major / 2 * pxpm, g.minor / 2 * pxpm, 0, 0, 7); ctx.fill(); ctx.stroke();
    // axes labels
    ctx.fillStyle = '#ffca5f'; ctx.font = '11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`${g.major < 1 ? (g.major * 100).toFixed(0) + ' cm' : g.major.toFixed(2) + ' m'} along-range`, cx, cy - g.minor / 2 * pxpm - 8);
    ctx.save(); ctx.translate(cx + g.major / 2 * pxpm + 12, cy); ctx.rotate(-Math.PI / 2); ctx.fillStyle = '#ff8f6b'; ctx.fillText(`${g.minor < 1 ? (g.minor * 100).toFixed(0) + ' cm' : g.minor.toFixed(2) + ' m'}`, 0, 0); ctx.restore();
    ctx.fillStyle = '#5ad1ff'; ctx.textAlign = 'left'; ctx.fillText('nadir (θ=0)', 8, S - 10);
  }, [H, gmrad, theta, d0]);

  // charts: diameter vs height, area vs angle
  useEffect(() => {
    const draw = (cv, fn, xmax, cur, curY, ylab, color, xlab) => {
      if (!cv) return; const ctx = cv.getContext('2d'); const W2 = cv.width; const H2 = cv.height; ctx.clearRect(0, 0, W2, H2); ctx.fillStyle = '#0c1826'; ctx.fillRect(0, 0, W2, H2);
      const x0 = 34; const x1 = W2 - 10; const y0 = 12; const y1 = H2 - 20; let ymax = 0; const N = 60;
      const ys = []; for (let k = 0; k <= N; k += 1) { const xx = (k / N) * xmax; const v = fn(xx); ys.push(v); ymax = Math.max(ymax, v); }
      ymax = Math.max(ymax, curY) * 1.1;
      ctx.strokeStyle = '#5c7488'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
      ys.forEach((v, k) => { const X = x0 + (k / N) * (x1 - x0); const Y = y1 - (v / ymax) * (y1 - y0); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
      const cX = x0 + (cur / xmax) * (x1 - x0); const cY = y1 - (curY / ymax) * (y1 - y0);
      ctx.fillStyle = '#ffd85e'; ctx.beginPath(); ctx.arc(cX, cY, 4, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,216,94,.4)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cX, cY); ctx.lineTo(cX, y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#8fa9c0'; ctx.font = '9px system-ui'; ctx.textAlign = 'left'; ctx.fillText(ylab, x0 - 30, y0 + 6); ctx.textAlign = 'right'; ctx.fillText(xlab, x1, y1 + 14);
    };
    draw(cH.current, (h) => (h * (gmrad / 1000)) / Math.cos(theta * D2R), 3000, H, g.minor, 'd (m)', '#5ad1ff', 'height H (m)');
    draw(cA.current, (t) => (Math.PI * (H * gmrad / 1000) ** 2) / (4 * Math.cos(t * D2R) ** 3), 65, theta, g.area, 'area (m²)', '#ff8f6b', 'scan angle θ (°)');
  }, [H, gmrad, theta, d0]);

  const fmt = (m) => (m < 1 ? `${(m * 100).toFixed(1)} cm` : `${m.toFixed(2)} m`);
  const relE = (gNadir.area / g.area);

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Laser Beam Divergence &amp; Footprint <span className="native-badge">Native React</span></h1>
          <span className="sub">How the LiDAR spot grows with height and divergence — and stretches into an ellipse off-nadir</span>
        </div>
        <span className="score-chip">footprint <b>{fmt(g.major)} × {fmt(g.minor)}</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> The diverging beam &amp; ground footprint <small>&mdash; drag to orbit</small></h2>
            <div className="beam-stage" ref={mountRef}>
              <div className="beam-badge">R = <b>{(g.R).toFixed(0)} m</b> · spot <b>{fmt(g.d)}</b></div>
              <div className="beam-exag">footprint scaled ×{exag} for clarity — see readouts for true size</div>
              <div className="beam-hint">drag = orbit · scroll = zoom</div>
            </div>
            <div className="beam-legend">
              <span><i className="beam-sw" style={{ background: '#ff5a3a' }} /> laser beam cone (divergence γ)</span>
              <span><i className="beam-sw" style={{ background: '#ff6a4a' }} /> ground footprint ellipse</span>
              <span><i className="beam-sw" style={{ background: '#5ad1ff' }} /> nadir spot (θ=0)</span>
              <span><i className="beam-sw" style={{ background: '#8fb0c8' }} /> nadir reference</span>
            </div>
            <div className="beam-toolbar">
              <label><input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> auto-rotate</label>
              <button className="beam-btn" onClick={() => { const t = three.current; if (t) { t.camera.position.set(6.5, 5.2, 8); t.controls.target.set(1, 1.4, 0); } }}>reset view</button>
            </div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">2</span> Footprint to scale <small>&mdash; nadir circle vs oblique ellipse</small></h2>
            <div className="beam-row">
              <figure className="beam-inset"><canvas ref={insetRef} width={230} height={230} /><figcaption>circle (θ=0) → ellipse, elongated ×{g.elong.toFixed(2)} along range</figcaption></figure>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div><span>slant range R = H/cosθ</span><b>{g.R.toFixed(0)} m</b></div>
                  <div><span>beam spot d = d₀+Rγ</span><b>{fmt(g.d)}</b></div>
                  <div><span>minor (cross-track)</span><b>{fmt(g.minor)}</b></div>
                  <div><span>major (along-range)</span><b className={g.elong > 1.6 ? 'orange' : ''}>{fmt(g.major)}</b></div>
                  <div><span>footprint area</span><b>{g.area < 1 ? `${(g.area * 1e4).toFixed(0)} cm²` : `${g.area.toFixed(2)} m²`}</b></div>
                  <div><span>rel. energy density</span><b className={relE < 0.5 ? 'orange' : ''}>{(relE * 100).toFixed(0)}%</b></div>
                </div>
                <div className="beam-note" style={{ marginTop: 8 }}>The circular beam meets tilted ground as an <b>ellipse</b>: it keeps width <b>b = d</b> across-track but stretches to <b>a = d/cosθ</b> along the range direction. Off-nadir the spot also sits farther away (R = H/cosθ), so it grows twice over.</div>
              </div>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">3</span> Controls &amp; response</h2>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>flying height / range H <b>{H} m</b><input type="range" min="30" max="3000" step="10" value={H} onChange={(e) => setH(Number(e.target.value))} /></label>
              <label>beam divergence γ <b>{gmrad.toFixed(2)} mrad</b><input type="range" min="0.1" max="3" step="0.05" value={gmrad} onChange={(e) => setG(Number(e.target.value))} /></label>
              <label>scan / incidence angle θ <b>{theta}°</b><input type="range" min="0" max="60" step="1" value={theta} onChange={(e) => setTheta(Number(e.target.value))} /></label>
              <label>exit aperture d₀ <b>{d0} mm</b><input type="range" min="0" max="120" step="1" value={d0} onChange={(e) => setD0(Number(e.target.value))} /></label>
            </div>
            <div className="beam-charts">
              <figure><canvas ref={cH} width={280} height={150} /><figcaption>spot d grows <b>linearly</b> with height (d = Hγ/cosθ)</figcaption></figure>
              <figure><canvas ref={cA} width={280} height={150} /><figcaption>footprint area ∝ <b>1/cos³θ</b> — blows up off-nadir</figcaption></figure>
            </div>
            <div className="equation">d = d₀ + R·γ &nbsp;·&nbsp; R = H/cosθ &nbsp;·&nbsp; ellipse a = d/cosθ, b = d &nbsp;·&nbsp; area = π·H²γ² / (4 cos³θ)</div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">4</span> Why it matters</h2>
            <div className="rect-summary">
              <b>Divergence, footprint &amp; incidence angle</b>
              <p>
                A LiDAR beam is not a perfect ray — it spreads at a small <b>divergence angle γ</b> (typically 0.1–1 mrad), so the
                illuminated <b>footprint</b> grows with range: <b>d = d₀ + R·γ</b>. Fly higher and every spot gets bigger,
                coarsening the effective ground resolution. Steer the beam <b>off-nadir</b> (or hit a slope) and two things happen:
                the spot is farther away (R = H/cosθ), and the round beam projects onto the tilted surface as an <b>ellipse</b>
                stretched by <b>1/cosθ</b> along the range direction. The same pulse energy is now spread over a larger, oblique
                patch, so the return is <b>weaker</b> and the echo is <b>stretched in time</b>, degrading range precision — and at
                <b> grazing angles the return can be lost entirely</b>. This is why façades, steep cuttings and the far edges of a
                wide scan swath are under-sampled, and why surveys use narrow divergence, sensible flying heights and overlapping
                flight lines to keep footprints small and returns strong.
              </p>
            </div>
            <div className="beam-src">Source: NIGST — Principles of LiDAR, Module&nbsp;1: Laser–Target Interaction &amp; LiDAR Components.</div>
          </section>
        </div>
      </div>
    </div>
  );
}
