import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './simulation.css';
import './native.css';
import './gsd.css';

// ---------------------------------------------------------------------------
// Ground Sampling Distance (GSD).
//
// An aerial camera at flying height H, with a lens of focal length f and a
// sensor whose pixels have pitch p (= sensor width / pixels-across), images a
// patch of ground. By similar triangles through the lens (pinhole model), one
// pixel maps to a square of ground of side:
//
//     GSD = p · H / f  =  (sensor_width · H) / (pixels · f)
//
// The scene shows a small block of ground GSD-cells, the lens, and the matching
// block of sensor pixels, with the light of each ground cell converging through
// the lens onto one (inverted) pixel.
// ---------------------------------------------------------------------------

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Number of pixels shown per side of the block — grows with the resolution
// slider (the sensor size stays fixed; more pixels just divide it more finely).
const gridM = (pixels) => clamp(Math.round(pixels / 650), 3, 12);

// Standard digital-camera sensor sizes (sensor WIDTH in mm, native aspect ratio
// W/H). Ordered largest → smallest, as in the classic sensor-comparison chart.
const SENSORS = [
  { label: 'Full-frame', sub: '36 × 24 mm', w: 36.0, aspect: 3 / 2 },
  { label: 'APS-C', sub: '1.5× crop', w: 23.5, aspect: 3 / 2 },
  { label: 'APS-C', sub: '1.6× crop', w: 22.3, aspect: 3 / 2 },
  { label: 'Four Thirds', sub: '2× crop', w: 17.3, aspect: 4 / 3 },
  { label: '1″ Type', sub: '2.7× crop', w: 13.2, aspect: 4 / 3 },
  { label: '1/1.7″', sub: '4.6× crop', w: 7.6, aspect: 4 / 3 },
  { label: '1/2.5″', sub: '6.0× crop', w: 5.76, aspect: 4 / 3 },
];
// Resolution choices in megapixels; pixels-across = √(MP · aspect).
const MPS = [16, 20.1, 24, 48];
const pixelsAcross = (mp, aspect) => Math.round(Math.sqrt(mp * 1e6 * aspect));

function computeGsd(f, H, sensorW, pixels) {
  const pitchUm = (sensorW / pixels) * 1000; // µm
  const gsdCm = (sensorW * H) / (pixels * f) * 100; // cm / pixel
  const footprintM = (sensorW * H) / f; // full-width ground coverage (m)
  return { pitchUm, gsdCm, footprintM };
}

// ---- ground check-marker imaging -----------------------------------------
// Pattern value at (u,v) in [0,1]²: 0 = black, 1 = white.
function patternVal(target, u, v) {
  if (target === 'bowtie') { const du = u - 0.5; const dv = v - 0.5; return Math.abs(du) >= Math.abs(dv) ? 0 : 1; }
  return (u < 0.5) === (v < 0.5) ? 0 : 1; // 2×2 checkerboard
}
let gCache = 0; let gHave = false;
function gauss() { // standard normal (Box–Muller, cached pair)
  if (gHave) { gHave = false; return gCache; }
  let a = 0; let b = 0; while (a === 0) a = Math.random(); while (b === 0) b = Math.random();
  const r = Math.sqrt(-2 * Math.log(a)); gCache = r * Math.sin(2 * Math.PI * b); gHave = true;
  return r * Math.cos(2 * Math.PI * b);
}
// The crisp physical target on the ground.
function drawGround(cv, target) {
  const ctx = cv.getContext('2d'); const W = cv.width; const img = ctx.createImageData(W, W); const d = img.data;
  for (let py = 0; py < W; py += 1) for (let px = 0; px < W; px += 1) {
    const c = patternVal(target, (px + 0.5) / W, (py + 0.5) / W) * 255;
    const p = (py * W + px) * 4; d[p] = c; d[p + 1] = c; d[p + 2] = c; d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}
// The photo: the target sampled at the current GSD (each pixel box-averages a
// GSD patch of ground) with shot noise that grows as the pixel pitch shrinks
// (smaller pixels catch less light → lower SNR).
function drawCaptured(cv, target, targetM, gsdM, pitchUm) {
  const n = clamp(Math.round(targetM / gsdM), 1, 200); // sensor pixels across the target
  // The canvas buffer IS the sensor grid: one buffer pixel per sensor pixel.
  // CSS (image-rendering:pixelated) upscales it to 200px, so each sensor pixel
  // shows as a crisp block — few big blocks at coarse GSD, sharp when GSD is fine.
  cv.width = n; cv.height = n;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(n, n); const d = img.data;
  const sigma = 0.05 * (5 / pitchUm); const s = 3; // noise ∝ 1/pitch; 3×3 box-average
  for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) {
    let sum = 0;
    for (let a = 0; a < s; a += 1) for (let b = 0; b < s; b += 1) sum += patternVal(target, (i + (a + 0.5) / s) / n, (j + (b + 0.5) / s) / n);
    const val = clamp(sum / (s * s) + gauss() * sigma, 0, 1); const c = Math.round(val * 255);
    const p = (j * n + i) * 4; d[p] = c; d[p + 1] = c; d[p + 2] = c; d[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function label(text, color = '#16202c', bg = 'rgba(255,255,255,0.88)') {
  const font = 'bold 27px system-ui'; const pad = 20;
  const meas = document.createElement('canvas').getContext('2d'); meas.font = font;
  const W = Math.ceil(meas.measureText(text).width + pad * 2); const Hh = 64;
  const c = document.createElement('canvas'); const s = 2; c.width = W * s; c.height = Hh * s;
  const x = c.getContext('2d'); x.scale(s, s);
  x.fillStyle = bg; x.beginPath(); x.roundRect(1, 2, W - 2, Hh - 4, 12); x.fill();
  x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, W / 2, Hh / 2);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(W / 100, Hh / 100, 1); spr.renderOrder = 10;
  return spr;
}

// A filled M×M grid plane (in the XZ plane) at height y, with grid lines and
// one highlighted cell (hi = [i, j] or null).
function gridPlane(size, M, y, faceMat, lineMat, hiMat, hi) {
  const g = new THREE.Group();
  const cell = size / M; const half = size / 2;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), faceMat);
  plane.rotation.x = -Math.PI / 2; plane.position.y = y; g.add(plane);
  const pts = [];
  for (let i = 0; i <= M; i += 1) {
    const t = -half + i * cell;
    pts.push(-half, y + 0.01, t, half, y + 0.01, t);
    pts.push(t, y + 0.01, -half, t, y + 0.01, half);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, lineMat));
  if (hi) {
    const [i, j] = hi;
    const q = new THREE.Mesh(new THREE.PlaneGeometry(cell * 0.94, cell * 0.94), hiMat);
    q.rotation.x = -Math.PI / 2; q.position.set(-half + (i + 0.5) * cell, y + 0.02, -half + (j + 0.5) * cell); g.add(q);
  }
  return g;
}

// A small arrow (shaft + cone) pointing up (+Y) or down (−Y).
function arrowMesh(h, mat, up) {
  const grp = new THREE.Group();
  const s = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h * 0.78, 10), mat); s.position.y = (up ? 1 : -1) * h * 0.39;
  const t = new THREE.Mesh(new THREE.ConeGeometry(0.1, h * 0.28, 14), mat); t.position.y = (up ? 1 : -1) * h * 0.9; if (!up) t.rotation.x = Math.PI;
  grp.add(s, t); return grp;
}

function buildScene(f, H, sensorW, pixels, sel, mats) {
  const g = new THREE.Group();
  const { gsdCm, footprintM } = computeGsd(f, H, sensorW, pixels);
  const M = gridM(pixels);                          // pixels per side ∝ resolution

  // Thin-lens layout (compressed): ground object at y=0, lens at gY, real
  // image on the sensor at gY+sY. Diagram magnification m = sY/gY (the true
  // f/H is far smaller, so the sensor is drawn hugely exaggerated).
  const gY = clamp(2.8 + H / 55, 3.2, 6.4);       // object → lens distance ∝ H
  const sY = clamp(1.0 + f / 60, 1.1, 2.6);       // lens → image distance ∝ f
  // Block sizes depend only on the physical footprint (sensor width, H, f) —
  // NOT on resolution. More resolution just adds more/finer pixels (M ↑).
  const groundSize = clamp(1.35 * Math.cbrt(footprintM), 1.6, 6.2); // ∝ ground footprint
  const mag = sY / gY;                             // sensor is the reduced, inverted image
  const sensorSize = groundSize * mag;             // ∝ sensor width, fixed vs resolution
  const lensY = gY; const sensorY = gY + sY;
  const lensP = new THREE.Vector3(0, lensY, 0);
  const hiI = clamp(sel.i, 0, M - 1); const hiJ = clamp(sel.j, 0, M - 1); // selected pixel

  // optical axis (dashed) + ground context plane
  const gp = new THREE.Mesh(new THREE.CircleGeometry(40, 48), mats.ground); gp.rotation.x = -Math.PI / 2; gp.position.y = -0.03; g.add(gp);
  const axisG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, sensorY + 0.5, 0)]);
  const axis = new THREE.Line(axisG, mats.axis); axis.computeLineDistances(); g.add(axis);

  // ground GSD grid (object) + small sensor grid (inverted real image)
  g.add(gridPlane(groundSize, M, 0.02, mats.groundFace, mats.line, mats.groundHi, [hiI, hiJ]));
  g.add(gridPlane(sensorSize, M, sensorY, mats.sensorFace, mats.lineS, mats.sensorHi, [M - 1 - hiI, M - 1 - hiJ]));

  // small biconvex lens (thin oblate glass) + rim
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.8, 28, 18), mats.glass); lens.scale.set(1, 0.24, 1); lens.position.copy(lensP); g.add(lens);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.04, 12, 40), mats.rim); rim.rotation.x = Math.PI / 2; rim.position.copy(lensP); g.add(rim);
  // focal points at ±f from the lens (image forms ~at the focal plane)
  [-1, 1].forEach((s) => { const fp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), mats.focal); fp.position.set(0, lensY + s * sY, 0); g.add(fp); });

  // Focus on ONE selected pixel: the light of its ground GSD cell fills the
  // lens and converges to that single (inverted) pixel. Object & real-image
  // arrows make the inversion explicit.
  const cellG = groundSize / M; const halfG = groundSize / 2;
  const gcx = -halfG + (hiI + 0.5) * cellG; const gcz = -halfG + (hiJ + 0.5) * cellG;
  const ah = Math.min(cellG * 1.05, 0.9);
  const oArrow = arrowMesh(ah, mats.obj, true); oArrow.position.set(gcx, 0, gcz); g.add(oArrow);
  const iArrow = arrowMesh(ah * mag, mats.obj, false); iArrow.position.set(-gcx * mag, sensorY, -gcz * mag); g.add(iArrow);

  // corner rays: ground cell corners → through the lens → matching pixel corners
  const gC = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => new THREE.Vector3(gcx + sx * cellG / 2, 0.05, gcz + sz * cellG / 2));
  const sC = gC.map((c) => new THREE.Vector3(-c.x * mag, sensorY, -c.z * mag)); // inverted image corners
  const rays = [];
  gC.forEach((c, k) => { rays.push(c.x, c.y, c.z, lensP.x, lensP.y, lensP.z, lensP.x, lensP.y, lensP.z, sC[k].x, sC[k].y, sC[k].z); });
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(rays, 3));
  g.add(new THREE.LineSegments(hg, mats.rayHi));

  // translucent double-cone (ground cell → lens → pixel)
  const coneV = [];
  for (let k = 0; k < 4; k += 1) { const a = gC[k]; const b = gC[(k + 1) % 4]; coneV.push(a.x, a.y, a.z, b.x, b.y, b.z, lensP.x, lensP.y, lensP.z); }
  for (let k = 0; k < 4; k += 1) { const a = sC[k]; const b = sC[(k + 1) % 4]; coneV.push(a.x, a.y, a.z, b.x, b.y, b.z, lensP.x, lensP.y, lensP.z); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(coneV, 3)); cg.computeVertexNormals();
  g.add(new THREE.Mesh(cg, mats.cone));

  // labels
  const l1 = label('real image (sensor) ×20', '#1d3b57'); l1.position.set(0, sensorY + 0.7, 0); g.add(l1);
  const l2 = label(`lens · f = ${f.toFixed(0)} mm`, '#7a4a00'); l2.position.set(1.8, lensY + 0.1, 0); g.add(l2);
  const l3 = label(`1 px → GSD = ${gsdCm.toFixed(2)} cm`, '#0f5a34'); l3.position.set(gcx, ah + 0.6, gcz); g.add(l3);
  const l4 = label(`object · H = ${H.toFixed(0)} m`, '#334'); l4.position.set(-groundSize / 2 - 1.6, lensY / 2, 0); g.add(l4);

  return g;
}

function disposeGroup(group) { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); }

export default function Gsd() {
  const [f, setF] = useState(50);
  const [H, setH] = useState(100);
  const [si, setSi] = useState(0); // sensor size index (default: full-frame)
  const [mp, setMp] = useState(24); // resolution in megapixels
  const sensor = SENSORS[si];
  const sensorW = sensor.w;
  const pixels = pixelsAcross(mp, sensor.aspect);
  const [sel, setSel] = useState({ i: 1, j: 3 });
  const [spin, setSpin] = useState(true);
  const [target, setTarget] = useState('check');
  const [targetM, setTargetM] = useState(2);
  const M = gridM(pixels);

  const mountRef = useRef(null); const three = useRef(null);
  const groundRef = useRef(null); const imgRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const w = mount.clientWidth; const h = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdfe7ef); scene.fog = new THREE.Fog(0xdfe7ef, 40, 90);
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.4, 500); camera.position.set(7.5, 4.6, 8.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.target.set(0, 3.7, 0);
    controls.minDistance = 5; controls.maxDistance = 40; controls.maxPolarAngle = Math.PI * 0.54;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.9;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6b2, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(10, 20, 8); scene.add(sun);

    const mats = {
      ground: new THREE.MeshStandardMaterial({ color: 0xe7ecf1, roughness: 1 }),
      groundFace: new THREE.MeshStandardMaterial({ color: 0xbfe3c9, roughness: 0.95, transparent: true, opacity: 0.85 }),
      groundHi: new THREE.MeshStandardMaterial({ color: 0xffd85e, roughness: 0.7, emissive: 0x5a4a00, emissiveIntensity: 0.4 }),
      sensorFace: new THREE.MeshStandardMaterial({ color: 0x274b6e, roughness: 0.5, metalness: 0.2 }),
      sensorHi: new THREE.MeshStandardMaterial({ color: 0xffd85e, roughness: 0.5, emissive: 0x6a5500, emissiveIntensity: 0.6 }),
      line: new THREE.LineBasicMaterial({ color: 0x2f7a4b, transparent: true, opacity: 0.75 }),
      lineS: new THREE.LineBasicMaterial({ color: 0x6f93b4, transparent: true, opacity: 0.9 }),
      glass: new THREE.MeshStandardMaterial({ color: 0xbcd8ee, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
      rim: new THREE.MeshStandardMaterial({ color: 0x6c86a0, roughness: 0.5 }),
      focal: new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.5 }),
      obj: new THREE.MeshStandardMaterial({ color: 0x2e9e4f, roughness: 0.6 }),
      axis: new THREE.LineDashedMaterial({ color: 0x9aa7b4, dashSize: 0.16, gapSize: 0.13, transparent: true, opacity: 0.8 }),
      rayHi: new THREE.LineBasicMaterial({ color: 0xe8443a }),
      cone: new THREE.MeshBasicMaterial({ color: 0xe8544a, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }),
    };

    three.current = { renderer, scene, camera, controls, mats, modelRef: { current: null } };
    let raf = 0; const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); }; loop();
    const onResize = () => { const W = mount.clientWidth; const Hh = mount.clientHeight; camera.aspect = W / Hh; camera.updateProjectionMatrix(); renderer.setSize(W, Hh); };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); controls.dispose();
      if (three.current.modelRef.current) disposeGroup(three.current.modelRef.current);
      Object.values(mats).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); three.current = null;
    };
  }, []);

  useEffect(() => {
    const t = three.current; if (!t) return;
    if (t.modelRef.current) { t.scene.remove(t.modelRef.current); disposeGroup(t.modelRef.current); }
    const grp = buildScene(f, H, sensorW, pixels, sel, t.mats); t.scene.add(grp); t.modelRef.current = grp;
  }, [f, H, si, mp, sel]);

  useEffect(() => { const t = three.current; if (t) t.controls.autoRotate = spin; }, [spin]);
  useEffect(() => { setSel((s) => (s.i < M && s.j < M ? s : { i: Math.min(s.i, M - 1), j: Math.min(s.j, M - 1) })); }, [M]);
  useEffect(() => {
    const gg = computeGsd(f, H, sensorW, pixels);
    if (groundRef.current) drawGround(groundRef.current, target);
    if (imgRef.current) drawCaptured(imgRef.current, target, targetM, gg.gsdCm / 100, gg.pitchUm);
  }, [target, targetM, f, H, si, mp]);
  const resetView = () => { const t = three.current; if (!t) return; t.camera.position.set(7.5, 4.6, 8.5); t.controls.target.set(0, 3.7, 0); };

  const { pitchUm, gsdCm, footprintM } = computeGsd(f, H, sensorW, pixels);
  const nAcross = clamp(Math.round(targetM / (gsdCm / 100)), 1, 200);

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Ground Sampling Distance <span className="native-badge">Native React</span></h1>
          <span className="sub">How one sensor pixel maps to a patch of ground through the lens — and what sets its size</span>
        </div>
        <span className="score-chip">GSD = <b>{gsdCm.toFixed(2)} cm/px</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> Sensor → lens → ground <small>&mdash; drag to orbit, scroll to zoom</small></h2>
            <div className="gsd-stage" ref={mountRef}>
              <div className="gsd-badge">GSD = <b>{gsdCm.toFixed(2)} cm</b> / pixel</div>
              <div className="gsd-hint">drag = orbit · scroll = zoom</div>
            </div>
            <div className="gsd-legend">
              <span><i className="gsd-sw" style={{ background: '#bfe3c9' }} /> object · ground GSD grid</span>
              <span><i className="gsd-sw" style={{ background: '#bcd8ee' }} /> lens (focal length f)</span>
              <span><i className="gsd-sw" style={{ background: '#274b6e' }} /> sensor · real image (×20)</span>
              <span><i className="gsd-sw" style={{ background: '#e8443a' }} /> light rays</span>
              <span><i className="gsd-sw" style={{ background: '#ffd85e' }} /> one pixel &harr; one GSD cell</span>
            </div>
            <div className="gsd-toolbar">
              <label><input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> auto-rotate (360°)</label>
              <button className="gsd-btn" onClick={resetView}>reset view</button>
            </div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">2</span> The check-marker in the photo <small>&mdash; sampled at this GSD</small></h2>
            <div className="gsd-targets">
              <button className={`gsd-tbtn ${target === 'check' ? 'on' : ''}`} onClick={() => setTarget('check')}>▦ Checkerboard</button>
              <button className={`gsd-tbtn ${target === 'bowtie' ? 'on' : ''}`} onClick={() => setTarget('bowtie')}>⧗ Bowtie</button>
              <label className="gsd-tsize">target size <b>{targetM.toFixed(1)} m</b><input type="range" min="0.3" max="4" step="0.1" value={targetM} onChange={(e) => setTargetM(Number(e.target.value))} /></label>
            </div>
            <div className="gsd-imgrow">
              <figure><canvas ref={groundRef} width={200} height={200} /><figcaption><b>on the ground</b> · {targetM.toFixed(1)} m target</figcaption></figure>
              <figure><canvas ref={imgRef} width={200} height={200} /><figcaption><b>in the image</b> · {nAcross} px across · pitch {pitchUm.toFixed(1)} µm</figcaption></figure>
            </div>
            <div className="gsd-note">Each photo pixel averages a <b>GSD-sized</b> patch of ground, so the marker is only readable when it spans several pixels (GSD ≪ target). Fly <b>higher</b> or shorten the <b>lens</b> → GSD grows → the pattern smears toward grey. <b>Smaller pixels</b> (more resolution / smaller sensor) sample finer but each collects <b>less light</b>, so the photo gets <b>noisier</b>.</div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">3</span> Camera &amp; flight</h2>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>focal length f <b>{f.toFixed(0)} mm</b><input type="range" min="16" max="80" step="1" value={f} onChange={(e) => setF(Number(e.target.value))} /></label>
              <label>flying height H <b>{H.toFixed(0)} m</b><input type="range" min="20" max="300" step="5" value={H} onChange={(e) => setH(Number(e.target.value))} /></label>
            </div>

            <div className="gsd-sub">Sensor size <span style={{ textTransform: 'none', color: '#9aa7b4', fontWeight: 400 }}>({sensorW.toFixed(2)} mm wide)</span></div>
            <div className="gsd-presets">
              {SENSORS.map((s, k) => (
                <button key={`${s.label}-${s.sub}`} className={`gsd-pbtn ${si === k ? 'on' : ''}`} onClick={() => setSi(k)}>
                  <b>{s.label}</b><span>{s.sub}</span>
                </button>
              ))}
            </div>

            <div className="gsd-sub">Resolution <span style={{ textTransform: 'none', color: '#9aa7b4', fontWeight: 400 }}>({pixels.toLocaleString()} px across)</span></div>
            <div className="gsd-presets">
              {MPS.map((m) => (
                <button key={m} className={`gsd-pbtn wide ${mp === m ? 'on' : ''}`} onClick={() => setMp(m)}><b>{m} MP</b></button>
              ))}
            </div>

            <div className="gsd-sub">Trace one pixel &mdash; pick a ground cell <span style={{ textTransform: 'none', color: '#9aa7b4', fontWeight: 400 }}>({M}×{M} shown)</span></div>
            <div className="gsd-pick" style={{ gridTemplateColumns: `repeat(${M}, 1fr)`, maxWidth: `${Math.min(260, M * 34)}px` }}>
              {Array.from({ length: M }, (_, r) => Array.from({ length: M }, (_, c) => (
                <button key={`${r}-${c}`} className={`gsd-px ${sel.i === c && sel.j === r ? 'on' : ''}`} onClick={() => setSel({ i: c, j: r })} aria-label={`cell ${c},${r}`} />
              )))}
            </div>

            <div className="gsd-eq">
              pixel pitch&nbsp; p = sensor width / pixels-across = {sensorW.toFixed(2)} mm / {pixels.toLocaleString()} ({mp} MP) = <b>{pitchUm.toFixed(2)} µm</b><br />
              <span className="big">GSD = <b>p · H / f</b> = {pitchUm.toFixed(2)} µm · {H} m / {f} mm = <b>{gsdCm.toFixed(2)} cm/px</b></span>
            </div>

            <div className="readouts" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <div><span>pixel pitch p</span><b>{pitchUm.toFixed(2)} µm</b></div>
              <div><span>GSD</span><b>{gsdCm.toFixed(2)} cm</b></div>
              <div><span>ground footprint</span><b>{footprintM.toFixed(1)} m</b></div>
              <div><span>magnification f/H</span><b>1:{(H / (f / 1000)).toFixed(0)}</b></div>
            </div>

            <div className="gsd-sub">How GSD responds</div>
            <div className="gsd-note">
              GSD is the size of ground that <b>one pixel</b> sees, so smaller is sharper. From <b>GSD = p·H/f</b>:
              flying <b>higher (↑H)</b> or using a <b>shorter lens (↓f)</b> makes each pixel cover more ground → <b>coarser</b>;
              a <b>longer lens (↑f)</b> or <b>smaller pixels</b> (more resolution / smaller pitch) makes it <b>finer</b>. The lens
              sets the magnification f/H — the ground block in the view is that magnification larger than the pixel block.
            </div>

            <div className="rect-summary">
              <b>Why GSD matters</b>
              <p>
                Every ground cell in the grid focuses its light through the lens onto exactly <b>one pixel</b> (the image is
                flipped, so opposite corners map across). The side of that cell is the <b>Ground Sampling Distance</b>. It is the
                practical resolution of an aerial or drone survey: a 2&nbsp;cm GSD means the smallest thing one pixel can resolve is
                about 2&nbsp;cm on the ground. Mission planning trades <b>height</b> and <b>lens</b> against the GSD you need.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
