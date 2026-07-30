import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './simulation.css';
import './native.css';
import './mapproj.css';

// ---------------------------------------------------------------------------
// Map Projections — wrap the round Earth onto a flat sheet.
//
// A projection is a rule (φ,λ) → (x,y). No flat map can keep shape, area and
// distance all true at once, so every projection is a compromise built on a
// developable surface — a cylinder, a cone, or a plane — that "unrolls" flat.
// Tissot's indicatrices (little circles that are equal on the globe) show where
// each projection stretches: they stay circles where angles are preserved and
// keep equal area where area is preserved.
// ---------------------------------------------------------------------------

const R = 2;                       // globe radius (world units)
const HALF_W = 3.3; const HALF_H = 1.95; // target flat-map half-extents
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// φ,λ in radians → 3D point on the sphere (λ=0 faces +Z).
function sphereXYZ(phi, lam) {
  const c = Math.cos(phi);
  return [R * c * Math.sin(lam), R * Math.sin(phi), R * c * Math.cos(lam)];
}

// ---- the five projections (forward: φ,λ radians → [x,y] natural units) -----
function pEquirect(phi, lam) { return [lam, phi]; }
function pMercator(phi, lam) { const p = clamp(phi, -1.4835, 1.4835); return [lam, Math.log(Math.tan(Math.PI / 4 + p / 2))]; }
function pMollweide(phi, lam) {
  let t = phi;
  for (let i = 0; i < 10; i += 1) { const den = 2 + 2 * Math.cos(2 * t); if (Math.abs(den) < 1e-6) break; t -= (2 * t + Math.sin(2 * t) - Math.PI * Math.sin(phi)) / den; }
  return [(2 * Math.SQRT2 / Math.PI) * lam * Math.cos(t), Math.SQRT2 * Math.sin(t)];
}
const AL_P1 = 20 * D2R; const AL_P2 = 50 * D2R;
const AL_N = (Math.sin(AL_P1) + Math.sin(AL_P2)) / 2;
const AL_C = Math.cos(AL_P1) ** 2 + 2 * AL_N * Math.sin(AL_P1);
const AL_R0 = Math.sqrt(AL_C) / AL_N;
function pAlbers(phi, lam) {
  const rho = Math.sqrt(Math.max(AL_C - 2 * AL_N * Math.sin(phi), 0)) / AL_N;
  const th = AL_N * lam;
  return [rho * Math.sin(th), AL_R0 - rho * Math.cos(th)];
}
function pAzimuthal(phi, lam) { const rho = Math.PI / 2 - phi; return [rho * Math.sin(lam), -rho * Math.cos(lam)]; }

const PROJECTIONS = [
  { id: 'mercator', name: 'Mercator', family: 'Cylindrical', prop: 'conformal', fn: pMercator, blurb: 'Wraps a cylinder around the equator. Keeps angles & shapes (great for navigation) but blows up area toward the poles — Greenland looks as big as Africa.' },
  { id: 'equirect', name: 'Equirectangular', family: 'Cylindrical', prop: 'equidistant', fn: pEquirect, blurb: 'The simplest rule: x = longitude, y = latitude. Meridians evenly spaced; true scale along meridians but stretches east–west away from the equator.' },
  { id: 'mollweide', name: 'Mollweide', family: 'Pseudocylindrical', prop: 'equalarea', fn: pMollweide, blurb: 'An ellipse with curved meridians. Every region keeps its true relative area, so it is a favourite for thematic world maps; shapes shear near the edges.' },
  { id: 'albers', name: 'Albers Conic', family: 'Conic', prop: 'equalarea', fn: pAlbers, blurb: 'A cone resting on two standard parallels (20°/50°). Equal-area and low distortion across a mid-latitude band — the classic choice for country & continent maps.' },
  { id: 'azimuthal', name: 'Azimuthal Equidistant', family: 'Planar', prop: 'equidistant', fn: pAzimuthal, blurb: 'A plane touching the pole. All distances & directions FROM the centre are true — used for polar and range maps — but the far hemisphere stretches around the rim.' },
];

// ---- geometry builders (each returns a flat list of {phi,lam} vertices laid
//      out as line segments — pairs of consecutive points) -------------------
function meridiansParallels() {
  const segs = [];
  const pushLine = (pts) => { for (let i = 0; i < pts.length - 1; i += 1) { segs.push(pts[i], pts[i + 1]); } };
  for (let lon = -180; lon <= 180; lon += 30) { const pts = []; for (let lat = -88; lat <= 88; lat += 4) pts.push({ phi: lat * D2R, lam: lon * D2R }); pushLine(pts); }
  for (let lat = -60; lat <= 60; lat += 30) { const pts = []; for (let lon = -180; lon <= 180; lon += 4) pts.push({ phi: lat * D2R, lam: lon * D2R }); pushLine(pts); }
  return segs;
}
function tissotSegs() {
  const segs = []; const delta = 6 * D2R; const K = 26;
  const centers = [];
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = -150; lon <= 150; lon += 30) centers.push([lat * D2R, lon * D2R]);
  centers.forEach(([p0, l0]) => {
    const ring = [];
    for (let k = 0; k <= K; k += 1) {
      const b = (k / K) * 2 * Math.PI;
      const phi = Math.asin(Math.sin(p0) * Math.cos(delta) + Math.cos(p0) * Math.sin(delta) * Math.cos(b));
      const lam = l0 + Math.atan2(Math.sin(b) * Math.sin(delta) * Math.cos(p0), Math.cos(delta) - Math.sin(p0) * Math.sin(phi));
      ring.push({ phi, lam });
    }
    for (let i = 0; i < ring.length - 1; i += 1) { segs.push(ring[i], ring[i + 1]); }
  });
  return segs;
}
// polygon (array of [latDeg,lonDeg]) → densified closed loop of segments
function polygonSegs(poly) {
  if (poly.length < 2) return [];
  const segs = []; const STEP = 10;
  const loop = [...poly, poly[0]];
  for (let e = 0; e < loop.length - 1; e += 1) {
    const [la1, lo1] = loop[e]; const [la2, lo2] = loop[e + 1];
    let prev = null;
    for (let s = 0; s <= STEP; s += 1) {
      const f = s / STEP;
      const v = { phi: (la1 + (la2 - la1) * f) * D2R, lam: (lo1 + (lo2 - lo1) * f) * D2R };
      if (prev) { segs.push(prev, v); }
      prev = v;
    }
  }
  return segs;
}

// fit a projection to the target box → {scale, midX, midY}
function fitTransform(fn) {
  let minX = 1e9; let maxX = -1e9; let minY = 1e9; let maxY = -1e9;
  for (let lat = -90; lat <= 90; lat += 5) for (let lon = -180; lon <= 180; lon += 10) {
    const [x, y] = fn(lat * D2R, lon * D2R);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const s = Math.min((2 * HALF_W) / (maxX - minX), (2 * HALF_H) / (maxY - minY));
  return { scale: s, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2 };
}
const flatXYZ = (fn, tr, phi, lam) => {
  const [x, y] = fn(phi, lam);
  return [(x - tr.midX) * tr.scale, (y - tr.midY) * tr.scale, 0];
};

// area distortion (|det J| / cosφ) relative to the equator reference
function areaScale(fn, latDeg) {
  const d = 1e-4; const phi = latDeg * D2R; const lam = 0;
  const p0 = fn(phi, lam); const px = fn(phi, lam + d); const py = fn(phi + d, lam);
  const det = Math.abs(((px[0] - p0[0]) / d) * ((py[1] - p0[1]) / d) - ((py[0] - p0[0]) / d) * ((px[1] - p0[1]) / d));
  return det / Math.max(Math.cos(phi), 1e-4);
}

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

export default function MapProjections() {
  const [projId, setProjId] = useState('mercator');
  const [unfold, setUnfold] = useState(0);
  const [autoRot, setAutoRot] = useState(true);
  const [drawMode, setDrawMode] = useState(false);
  const [poly, setPoly] = useState([[8, -18], [8, 38], [56, 38], [56, -18]]);

  const mountRef = useRef(null);
  const G = useRef(null);
  const projRef = useRef(projId); projRef.current = projId;
  const unfoldRef = useRef(unfold); unfoldRef.current = unfold;
  const autoRef = useRef(autoRot); autoRef.current = autoRot;
  const drawRef = useRef(drawMode); drawRef.current = drawMode;
  const playRef = useRef(null); // {from,to,start,dur}

  const proj = PROJECTIONS.find((p) => p.id === projId);

  // one-time scene setup
  useEffect(() => {
    const mount = mountRef.current; if (!mount) return undefined;
    const W = mount.clientWidth; const H = mount.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    camera.position.set(0, 0, 7.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.09; controls.minDistance = 3.4; controls.maxDistance = 16;

    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir = new THREE.DirectionalLight(0xffffff, 0.5); dir.position.set(4, 6, 8); scene.add(dir);

    const group = new THREE.Group(); scene.add(group);
    // translucent globe (fades as it flattens) — also the pick target
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(R * 0.995, 48, 32),
      new THREE.MeshPhongMaterial({ color: 0x14508a, transparent: true, opacity: 0.5, shininess: 30, depthWrite: false }),
    );
    sphere.renderOrder = -1;
    group.add(sphere);

    const mkLines = (segs, color, width, op = 1) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs.length * 3), 3));
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: op, linewidth: width });
      const obj = new THREE.LineSegments(geo, mat); obj.frustumCulled = false; group.add(obj);
      return { obj, ll: segs };
    };
    const grat = mkLines(meridiansParallels(), 0x9fc4e6, 1, 0.55);
    const tiss = mkLines(tissotSegs(), 0xffb703, 2, 0.95);
    const pol = mkLines(polygonSegs([[8, -18], [8, 38], [56, 38], [56, -18]]), 0x35d07f, 3, 1);

    G.current = { scene, camera, renderer, controls, group, sphere, grat, tiss, pol, tr: null, spin: 0, angle: 0, raf: 0, disposed: false };
    updateFlat();

    const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
    const onDown = (ev) => {
      if (!drawRef.current) return;
      const r = renderer.domElement.getBoundingClientRect();
      ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObject(sphere, false)[0]; if (!hit) return;
      const local = group.worldToLocal(hit.point.clone());
      const phi = Math.asin(clamp(local.y / R, -1, 1)); const lam = Math.atan2(local.x, local.z);
      setPoly((prev) => [...prev, [phi / D2R, lam / D2R]]);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);

    let last = performance.now();
    const loop = () => {
      const g = G.current; if (!g || g.disposed) return;
      g.raf = requestAnimationFrame(loop);
      const now = performance.now(); const dt = Math.min((now - last) / 1000, 0.05); last = now;
      // play animation drives unfold
      if (playRef.current) {
        const pl = playRef.current; const k = clamp((now - pl.start) / pl.dur, 0, 1);
        const val = pl.from + (pl.to - pl.from) * k; unfoldRef.current = val; setUnfold(val);
        if (k >= 1) playRef.current = null;
      }
      const t = easeInOut(clamp(unfoldRef.current, 0, 1));
      // spin only while nearly-round; ease rotation back to 0 as it flattens
      if (autoRef.current && !drawRef.current && unfoldRef.current < 0.25) g.angle += dt * 0.28;
      if (unfoldRef.current > 0.6) g.angle += (0 - g.angle) * Math.min(1, dt * 3);
      g.group.rotation.y = g.angle;
      g.sphere.material.opacity = 0.5 * (1 - t);
      g.sphere.visible = t < 0.995;
      morph(g.grat, t); morph(g.tiss, t); morph(g.pol, t);
      g.controls.update(); g.renderer.render(g.scene, g.camera);
    };
    loop();

    const onResize = () => {
      const g = G.current; if (!g) return; const w = mount.clientWidth; const h = mount.clientHeight;
      g.camera.aspect = w / h; g.camera.updateProjectionMatrix(); g.renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      const g = G.current; g.disposed = true; cancelAnimationFrame(g.raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      controls.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      G.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // write sphere→flat lerp into a line object's position buffer
  function morph(set, t) {
    const g = G.current; if (!g || !g.tr) return;
    const pos = set.obj.geometry.attributes.position; const arr = pos.array; const fn = g.fnNow; const tr = g.tr;
    for (let i = 0; i < set.ll.length; i += 1) {
      const { phi, lam } = set.ll[i];
      const s = sphereXYZ(phi, lam); const f = flatXYZ(fn, tr, phi, lam);
      arr[i * 3] = s[0] + (f[0] - s[0]) * t;
      arr[i * 3 + 1] = s[1] + (f[1] - s[1]) * t;
      arr[i * 3 + 2] = s[2] + (f[2] - s[2]) * t;
    }
    pos.needsUpdate = true;
  }
  // recompute the flat target for the active projection
  function updateFlat() {
    const g = G.current; if (!g) return;
    g.fnNow = proj.fn; g.tr = fitTransform(proj.fn);
  }

  // projection change → refit
  useEffect(() => { const g = G.current; if (!g) return; g.fnNow = proj.fn; g.tr = fitTransform(proj.fn); /* eslint-disable-next-line */ }, [projId]);

  // polygon change → rebuild that geometry
  useEffect(() => {
    const g = G.current; if (!g) return;
    const segs = polygonSegs(poly);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(segs.length, 1) * 3), 3));
    g.pol.obj.geometry.dispose(); g.pol.obj.geometry = geo; g.pol.ll = segs;
  }, [poly]);

  // entering draw mode → bring the globe fully round and stop spin
  useEffect(() => {
    if (drawMode) { playRef.current = null; setUnfold(0); unfoldRef.current = 0; const g = G.current; if (g) g.angle = 0; }
  }, [drawMode]);

  const playUnfold = () => { const from = unfoldRef.current > 0.5 ? 1 : 0; playRef.current = { from, to: from < 0.5 ? 1 : 0, start: performance.now(), dur: 2200 }; };

  // readouts
  const cLat = poly.length ? poly.reduce((a, p) => a + p[0], 0) / poly.length : 45;
  const ref = areaScale(proj.fn, 0);
  const aCentroid = areaScale(proj.fn, cLat) / ref;
  const a60 = areaScale(proj.fn, 60) / ref;

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Map Projections <span className="native-badge">Native React</span></h1>
          <span className="sub">Unwrap the round Earth onto a flat map — and watch every projection stretch it differently</span>
        </div>
        <span className="score-chip">{proj.name} · <b>{proj.prop}</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> The globe, unwrapping <small>&mdash; drag to orbit · scroll to zoom</small></h2>
            <div className={`mp-stage ${drawMode ? 'draw' : ''}`} ref={mountRef}>
              <div className="mp-badge">{proj.name} · <b>{proj.family}</b></div>
              <div className="mp-hint">{drawMode ? 'click the globe to add polygon points' : 'drag = orbit · scroll = zoom'}</div>
            </div>
            <div className="mp-unfold">
              <button className="mp-btn go" onClick={playUnfold}>▶ Unfold / re-wrap</button>
              <span>globe</span>
              <input type="range" min="0" max="1" step="0.01" value={unfold} onChange={(e) => { playRef.current = null; setUnfold(Number(e.target.value)); }} />
              <span>flat map</span>
            </div>
            <div className="mp-tools">
              <label><input type="checkbox" checked={autoRot} onChange={(e) => setAutoRot(e.target.checked)} /> auto-rotate</label>
              <button className={`mp-btn ${drawMode ? 'go' : ''}`} onClick={() => setDrawMode((d) => !d)}>{drawMode ? '✓ drawing — click globe' : '✎ draw polygon'}</button>
              <button className="mp-btn" onClick={() => setPoly([])}>clear polygon</button>
              <button className="mp-btn" onClick={() => setPoly([[8, -18], [8, 38], [56, 38], [56, -18]])}>reset polygon</button>
            </div>
            <div className="mp-legend">
              <span><i className="mp-sw" style={{ background: '#9fc4e6' }} /> graticule (lat/lon grid)</span>
              <span><i className="mp-sw" style={{ background: '#ffb703' }} /> Tissot circles (distortion)</span>
              <span><i className="mp-sw" style={{ background: '#35d07f' }} /> your polygon</span>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">2</span> Choose a projection <small>&mdash; five families</small></h2>
            <div className="mp-projs">
              {PROJECTIONS.map((p) => (
                <button key={p.id} className={`mp-pbtn ${projId === p.id ? 'on' : ''}`} onClick={() => setProjId(p.id)}>
                  <b>{p.name}</b><span>{p.family} · {p.prop}</span>
                </button>
              ))}
            </div>
            <div className="mp-surface">
              <SurfaceIcon family={proj.family} />
              <div>
                <span className={`mp-prop ${proj.prop === 'equalarea' ? 'equalarea' : proj.prop}`}>{proj.prop}</span>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#56677a', lineHeight: 1.5 }}>{proj.blurb}</p>
              </div>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <div><span>surface</span><b style={{ fontSize: 12 }}>{proj.family}</b></div>
              <div><span>preserves</span><b style={{ fontSize: 12 }}>{proj.prop}</b></div>
              <div><span>area @ polygon</span><b className={aCentroid > 1.6 || aCentroid < 0.62 ? 'orange' : ''}>{aCentroid.toFixed(2)}×</b></div>
              <div><span>area @ 60°</span><b className={a60 > 1.6 || a60 < 0.62 ? 'orange' : ''}>{a60.toFixed(2)}×</b></div>
            </div>
            <div className="equation">area distortion = |det J| / cosφ &nbsp;(relative to the equator) &nbsp;·&nbsp; 1.00× = true area, &gt;1 = enlarged, &lt;1 = shrunk</div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">3</span> Why it matters</h2>
            <div className="rect-summary">
              <b>You can flatten the sphere, but not for free</b>
              <p>
                The Earth is a curved surface; a sheet of paper is flat, so <b>something must give</b>. A projection can preserve
                <b> shape</b> (conformal, like Mercator), <b>area</b> (equal-area, like Mollweide &amp; Albers), or <b>distance</b>
                from a point (equidistant) — but never all three at once. Watch the <b>Tissot circles</b>: on a conformal map they
                stay circular (angles true) yet swell with latitude (area wrong); on an equal-area map they keep the same area but
                squash into ellipses (shape wrong). Draw your own <b>polygon</b> and switch projections to see the same region
                stretch, shear and change size. The <b>developable surface</b> — cylinder, cone or plane — decides where distortion
                is smallest: right along the line or point where the surface touches the globe. Pick the projection whose true
                zone matches your area of interest.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SurfaceIcon({ family }) {
  const s = { width: 96, height: 96 };
  if (family === 'Cylindrical') return (
    <svg {...s} viewBox="0 0 96 96" aria-label="cylinder around globe">
      <ellipse cx="48" cy="48" rx="26" ry="26" fill="rgba(21,101,192,.12)" stroke="#7fa8d0" strokeWidth="2" />
      <ellipse cx="48" cy="48" rx="30" ry="40" fill="none" stroke="#e0a800" strokeWidth="2.5" />
      <line x1="18" y1="48" x2="78" y2="48" stroke="#0f8a4d" strokeWidth="2.5" />
      <line x1="18" y1="8" x2="18" y2="88" stroke="#e0a800" strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="78" y1="8" x2="78" y2="88" stroke="#e0a800" strokeWidth="1.5" strokeDasharray="4 4" />
    </svg>
  );
  if (family === 'Pseudocylindrical') return (
    <svg {...s} viewBox="0 0 96 96" aria-label="pseudocylinder">
      <ellipse cx="48" cy="48" rx="26" ry="26" fill="rgba(15,138,77,.12)" stroke="#7fa8d0" strokeWidth="2" />
      <path d="M20 20 Q48 8 76 20 L76 76 Q48 88 20 76 Z" fill="none" stroke="#e0a800" strokeWidth="2.5" />
      <line x1="18" y1="48" x2="78" y2="48" stroke="#0f8a4d" strokeWidth="2.5" />
    </svg>
  );
  if (family === 'Conic') return (
    <svg {...s} viewBox="0 0 96 96" aria-label="cone on globe">
      <ellipse cx="48" cy="54" rx="24" ry="24" fill="rgba(15,138,77,.12)" stroke="#7fa8d0" strokeWidth="2" />
      <path d="M48 6 L82 74 L14 74 Z" fill="none" stroke="#e0a800" strokeWidth="2.5" />
      <line x1="22" y1="47" x2="74" y2="47" stroke="#0f8a4d" strokeWidth="2.5" />
    </svg>
  );
  return (
    <svg {...s} viewBox="0 0 96 96" aria-label="plane at pole">
      <ellipse cx="48" cy="56" rx="24" ry="24" fill="rgba(232,141,0,.10)" stroke="#7fa8d0" strokeWidth="2" />
      <line x1="10" y1="30" x2="86" y2="30" stroke="#e0a800" strokeWidth="2.5" />
      <circle cx="48" cy="30" r="3.5" fill="#0f8a4d" />
      <line x1="48" y1="30" x2="48" y2="32" stroke="#0f8a4d" strokeWidth="2" />
    </svg>
  );
}
