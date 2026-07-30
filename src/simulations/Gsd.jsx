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
const M = 6; // shown block: 6×6 pixels and their 6×6 ground cells

function computeGsd(f, H, sensorW, pixels) {
  const pitchUm = (sensorW / pixels) * 1000; // µm
  const gsdCm = (sensorW * H) / (pixels * f) * 100; // cm / pixel
  const footprintM = (sensorW * H) / f; // full-width ground coverage (m)
  return { pitchUm, gsdCm, footprintM };
}

function label(text, color = '#16202c', bg = 'rgba(255,255,255,0.88)') {
  const c = document.createElement('canvas'); const s = 2; c.width = 260 * s; c.height = 66 * s;
  const x = c.getContext('2d'); x.scale(s, s);
  x.fillStyle = bg; x.beginPath(); x.roundRect(2, 2, 256, 62, 12); x.fill();
  x.fillStyle = color; x.font = 'bold 27px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 130, 33);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 4;
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(2.6, 0.66, 1); spr.renderOrder = 10;
  return spr;
}

// A filled M×M grid plane (in the XZ plane) at height y, with grid lines and
// one highlighted cell (hi = [i, j] or null).
function gridPlane(size, y, faceMat, lineMat, hiMat, hi) {
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

function cellCenter(size, i, j, y) { const cell = size / M; const half = size / 2; return [-half + (i + 0.5) * cell, y, -half + (j + 0.5) * cell]; }

function buildScene(f, H, sensorW, pixels, mats) {
  const g = new THREE.Group();
  const { gsdCm } = computeGsd(f, H, sensorW, pixels);

  // Schematic layout: ground at y=0, lens at gY, sensor at gY+sY.
  const gY = clamp(2.6 + H / 45, 3, 7);          // lens height ∝ flying height
  const sY = clamp(0.7 + f / 55, 0.8, 2.4);      // sensor distance behind lens ∝ focal length
  const groundSize = clamp(2.3 * Math.cbrt(gsdCm), 1.1, 6.4); // ground block ∝ GSD (one pixel's coverage)
  const sensorSize = 2.1;                         // sensor block — the chip is a constant size
  const lensY = gY; const sensorY = gY + sY;
  const lensP = new THREE.Vector3(0, lensY, 0);
  const hiI = 4; const hiJ = 4;                    // highlighted pixel / ground cell

  // ground plane (context) + GSD grid block
  const gp = new THREE.Mesh(new THREE.CircleGeometry(40, 48), mats.ground); gp.rotation.x = -Math.PI / 2; gp.position.y = -0.03; g.add(gp);
  g.add(gridPlane(groundSize, 0.02, mats.groundFace, mats.line, mats.groundHi, [hiI, hiJ]));
  // sensor grid block (inverted image → highlight opposite corner)
  g.add(gridPlane(sensorSize, sensorY, mats.sensorFace, mats.lineS, mats.sensorHi, [M - 1 - hiI, M - 1 - hiJ]));

  // lens (ring) + camera body
  const lens = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.14, 16, 40), mats.lens); lens.rotation.x = Math.PI / 2; lens.position.copy(lensP); g.add(lens);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.8, 32), mats.glass); glass.rotation.x = -Math.PI / 2; glass.position.set(0, lensY, 0); g.add(glass);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.78, sY, 28), mats.body);
  barrel.position.set(0, lensY + sY / 2, 0); g.add(barrel);

  // rays: every ground cell → lens → its (inverted) sensor pixel
  const base = []; const hiPts = [];
  for (let i = 0; i < M; i += 1) for (let j = 0; j < M; j += 1) {
    const gc = cellCenter(groundSize, i, j, 0.05);
    const sc = cellCenter(sensorSize, M - 1 - i, M - 1 - j, sensorY - 0.02);
    const arr = (i === hiI && j === hiJ) ? hiPts : base;
    arr.push(gc[0], gc[1], gc[2], lensP.x, lensP.y, lensP.z);
    arr.push(lensP.x, lensP.y, lensP.z, sc[0], sc[1], sc[2]);
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
  g.add(new THREE.LineSegments(bg, mats.ray));

  // the highlighted pixel's light cone: 4 corner rays ground-cell → lens → pixel
  const cellG = groundSize / M; const halfG = groundSize / 2; const cellS = sensorSize / M; const halfS = sensorSize / 2;
  const gcx = -halfG + (hiI + 0.5) * cellG; const gcz = -halfG + (hiJ + 0.5) * cellG;
  const scx = -halfS + (M - 1 - hiI + 0.5) * cellS; const scz = -halfS + (M - 1 - hiJ + 0.5) * cellS;
  const gCorners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => new THREE.Vector3(gcx + sx * cellG / 2, 0.06, gcz + sz * cellG / 2));
  const sCorners = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => new THREE.Vector3(scx + sx * cellS / 2, sensorY - 0.02, scz + sz * cellS / 2));
  // translucent double-cone faces (ground→lens and lens→sensor)
  const coneV = [];
  for (let k = 0; k < 4; k += 1) { const a = gCorners[k]; const b = gCorners[(k + 1) % 4]; coneV.push(a.x, a.y, a.z, b.x, b.y, b.z, lensP.x, lensP.y, lensP.z); }
  for (let k = 0; k < 4; k += 1) { const a = sCorners[k]; const b = sCorners[(k + 1) % 4]; coneV.push(a.x, a.y, a.z, b.x, b.y, b.z, lensP.x, lensP.y, lensP.z); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(coneV, 3)); cg.computeVertexNormals();
  g.add(new THREE.Mesh(cg, mats.cone));
  hiPts.length = 0;
  gCorners.forEach((c) => { hiPts.push(c.x, c.y, c.z, lensP.x, lensP.y, lensP.z); });
  sCorners.forEach((c) => { hiPts.push(lensP.x, lensP.y, lensP.z, c.x, c.y, c.z); });
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(hiPts, 3));
  g.add(new THREE.LineSegments(hg, mats.rayHi));

  // labels
  const l1 = label('sensor — pixels', '#1d3b57'); l1.position.set(0, sensorY + 0.8, 0); g.add(l1);
  const l2 = label(`lens  f = ${f.toFixed(0)} mm`, '#7a4a00'); l2.position.set(1.9, lensY + 0.2, 0); g.add(l2);
  const l3 = label(`ground · 1 px = GSD = ${gsdCm.toFixed(2)} cm`, '#0f5a34'); l3.position.set(gcx, 0.9, gcz); l3.scale.set(3.0, 0.76, 1); g.add(l3);
  const l4 = label(`H = ${H.toFixed(0)} m`, '#334'); l4.position.set(-groundSize / 2 - 1.4, lensY / 2, 0); g.add(l4);

  return g;
}

function disposeGroup(group) { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); }); }

export default function Gsd() {
  const [f, setF] = useState(50);
  const [H, setH] = useState(100);
  const [sensorW, setSensorW] = useState(17.3);
  const [pixels, setPixels] = useState(4000);
  const [spin, setSpin] = useState(true);

  const mountRef = useRef(null); const three = useRef(null);

  useEffect(() => {
    const mount = mountRef.current; const w = mount.clientWidth; const h = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdfe7ef); scene.fog = new THREE.Fog(0xdfe7ef, 40, 90);
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.4, 500); camera.position.set(11, 7, 12);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.target.set(0, 3.2, 0);
    controls.minDistance = 6; controls.maxDistance = 45; controls.maxPolarAngle = Math.PI * 0.52;
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
      lineS: new THREE.LineBasicMaterial({ color: 0x9fc0e0, transparent: true, opacity: 0.85 }),
      lens: new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.4, metalness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x8fbfe0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
      body: new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.7 }),
      ray: new THREE.LineBasicMaterial({ color: 0xf6b74a, transparent: true, opacity: 0.28 }),
      rayHi: new THREE.LineBasicMaterial({ color: 0xffcf3a }),
      cone: new THREE.MeshBasicMaterial({ color: 0xffd85e, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
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
    const grp = buildScene(f, H, sensorW, pixels, t.mats); t.scene.add(grp); t.modelRef.current = grp;
  }, [f, H, sensorW, pixels]);

  useEffect(() => { const t = three.current; if (t) t.controls.autoRotate = spin; }, [spin]);
  const resetView = () => { const t = three.current; if (!t) return; t.camera.position.set(11, 7, 12); t.controls.target.set(0, 3.2, 0); };

  const { pitchUm, gsdCm, footprintM } = computeGsd(f, H, sensorW, pixels);

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
              <span><i className="gsd-sw" style={{ background: '#274b6e' }} /> sensor pixels</span>
              <span><i className="gsd-sw" style={{ background: '#2a2f36' }} /> lens (focal length f)</span>
              <span><i className="gsd-sw" style={{ background: '#bfe3c9' }} /> ground GSD grid</span>
              <span><i className="gsd-sw" style={{ background: '#ffd85e' }} /> one pixel &harr; one GSD cell</span>
            </div>
            <div className="gsd-toolbar">
              <label><input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> auto-rotate (360°)</label>
              <button className="gsd-btn" onClick={resetView}>reset view</button>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">2</span> Camera &amp; flight</h2>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>focal length f <b>{f.toFixed(0)} mm</b><input type="range" min="10" max="120" step="1" value={f} onChange={(e) => setF(Number(e.target.value))} /></label>
              <label>flying height H <b>{H.toFixed(0)} m</b><input type="range" min="20" max="300" step="5" value={H} onChange={(e) => setH(Number(e.target.value))} /></label>
              <label>sensor width <b>{sensorW.toFixed(1)} mm</b><input type="range" min="6" max="36" step="0.1" value={sensorW} onChange={(e) => setSensorW(Number(e.target.value))} /></label>
              <label>resolution <b>{pixels} px</b><input type="range" min="1500" max="8000" step="100" value={pixels} onChange={(e) => setPixels(Number(e.target.value))} /></label>
            </div>

            <div className="gsd-eq">
              pixel pitch&nbsp; p = sensor width / pixels = <b>{pitchUm.toFixed(2)} µm</b><br />
              <span className="big">GSD = <b>p · H / f</b> = {(pitchUm / 1000).toFixed(3)} mm · {H} m / {f} mm = <b>{gsdCm.toFixed(2)} cm/px</b></span>
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
