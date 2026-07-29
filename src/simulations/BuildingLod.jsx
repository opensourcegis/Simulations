import { Fragment, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './simulation.css';
import './native.css';
import './lod.css';

// ---------------------------------------------------------------------------
// Building LOD explorer.
//
// The source model is the FZK "AC20-Institute-Var-2.ifc" office building.
// Rather than render its ~1,200 raw BREP elements, we read its key measures
// (≈42 × 16 m footprint, 3 above-ground storeys of 3 m, pitched roof, 206
// windows, 77 doors) and rebuild it procedurally at the sixteen refined LODs
// of Biljecki, Ledoux & Stoter (2016) — LOD0..3 down the rows, and four
// geometric-refinement variants x.0..x.3 across the columns.
// ---------------------------------------------------------------------------

// Building measures extracted from the IFC.
const FACTS = { footprint: '42 × 16 m', storeys: 3, eaves: 9, windows: 206, doors: 77, walls: 121 };
const FLOOR_H = 3; const EAVE = 9;

// Massing for a given refinement variant (0..3): each entry is one block of
// the building, articulated more as the variant increases (single box → L →
// with entrance → with a stair tower). Centred on the origin, X is the long
// axis, Z the depth.
function massing(variant) {
  const main = { cx: -6, cz: 0, w: 30, d: 16, h: 9, rh: 3.6 };
  if (variant === 0) return [{ cx: 0, cz: 0, w: 42, d: 16, h: 9, rh: 3.8 }];
  if (variant === 1) return [main, { cx: 16, cz: 3, w: 12, d: 10, h: 6, rh: 2.6 }];
  if (variant === 2) return [main, { cx: 16, cz: 3, w: 12, d: 10, h: 6, rh: 2.6 }, { cx: -17, cz: -10, w: 8, d: 6, h: 4, rh: 1.9 }];
  return [main, { cx: 16, cz: 3, w: 12, d: 10, h: 6, rh: 2.6 }, { cx: -17, cz: -10, w: 8, d: 6, h: 4, rh: 1.9 }, { cx: 4, cz: -9, w: 6, d: 5, h: 11, rh: 0 }];
}

const COL = {
  lodBlue: 0x4aa3e0, wall: 0xd9dde3, roof: 0xb83b2e, glass: 0x2f5f8f, door: 0x5b3f27,
  trim: 0x9aa3ad, chimney: 0x6b7078, ground: 0xe7ecf1,
};

function box(w, h, d, x, y, z, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }

// A gable roof for a block of footprint w×d, ridge along the long axis, base
// at y=0 (the group is positioned at eave height by the caller).
function gableRoof(w, d, rh, mat) {
  const hw = w / 2; const hd = d / 2; const along = w >= d; // ridge along X if long in X
  const g = new THREE.BufferGeometry();
  let v;
  if (along) {
    v = [
      [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-hw, rh, 0], [hw, rh, 0],
    ];
    const f = [[0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [1, 2, 5], [0, 4, 3]];
    g.setAttribute('position', new THREE.Float32BufferAttribute(f.flat().flatMap((i) => v[i]), 3));
  } else {
    v = [
      [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [0, rh, -hd], [0, rh, hd],
    ];
    const f = [[0, 4, 5], [0, 5, 3], [1, 2, 5], [1, 5, 4], [0, 1, 4], [3, 5, 2]];
    g.setAttribute('position', new THREE.Float32BufferAttribute(f.flat().flatMap((i) => v[i]), 3));
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// Rows of windows (and ground-floor doors) on the long facades of a block.
function addOpenings(group, m, mats, variant) {
  const floors = Math.max(1, Math.round(m.h / FLOOR_H));
  const wW = 1.3; const wH = 1.5; const recess = variant >= 1 ? 0.18 : 0.06;
  const spacing = 3.2; const count = Math.max(1, Math.floor((m.w - 2) / spacing));
  const start = -((count - 1) * spacing) / 2;
  [-1, 1].forEach((side) => {
    const z = m.cz + side * (m.d / 2);
    for (let f = 0; f < floors; f += 1) {
      const y = f * FLOOR_H + 1.6;
      for (let i = 0; i < count; i += 1) {
        const x = m.cx + start + i * spacing;
        // ground-floor centre door on the front (-Z) facade
        if (f === 0 && side === -1 && Math.abs(start + i * spacing) < 0.1) {
          group.add(box(1.3, 2.3, 0.14, x, 1.15, z - side * 0.02, mats.door));
          continue;
        }
        if (variant >= 1) group.add(box(wW + 0.34, wH + 0.34, 0.1, x, y, z - side * 0.02, mats.trim)); // frame
        const g = box(wW, wH, 0.12, x, y, z - side * recess, mats.glass); group.add(g);
        if (variant >= 2 && f > 0) group.add(box(wW + 0.5, 0.12, 0.5, x, y - wH / 2 - 0.15, z - side * 0.28, mats.trim)); // sill / balcony
      }
    }
  });
}

// Small dormers / chimney on the main roof for the richer variants.
function addRoofDetail(group, m, mats, variant) {
  if (m.rh <= 0) return;
  const nD = variant >= 3 ? 3 : variant >= 1 ? 2 : 0;
  const front = m.cz + m.d / 2;
  for (let i = 0; i < nD; i += 1) {
    const x = m.cx + (i - (nD - 1) / 2) * 6;
    const y = m.h + m.rh * 0.42;
    const d = box(1.7, 1.4, 1.7, x, y, front - 1.3, mats.wall); group.add(d);
    group.add(box(1.3, 1.0, 0.1, x, y, front - 0.5, mats.glass));
    const cap = gableRoof(1.9, 1.9, 0.9, mats.roof); cap.position.set(x, y + 0.7, front - 1.3); group.add(cap);
  }
  if (variant >= 2) { const cx = m.cx - m.w / 2 + 3; group.add(box(0.9, 2.2, 0.9, cx, m.h + m.rh + 0.4, m.cz, mats.chimney)); }
}

function buildModel(lod, variant, mats) {
  const group = new THREE.Group();
  const masses = massing(variant);

  masses.forEach((m) => {
    if (lod === 0) {
      // Flat plates: footprint at ground, roof-edge outline at eave height.
      const foot = box(m.w, 0.12, m.d, m.cx, 0.06, m.cz, mats.lod); group.add(foot);
      const eaveP = box(m.w, 0.12, m.d, m.cx, m.h, m.cz, mats.lodT); group.add(eaveP);
      return;
    }
    if (lod === 1) {
      // Extruded block, flat top (LOD1).
      group.add(box(m.w, m.h, m.d, m.cx, m.h / 2, m.cz, mats.lod));
      return;
    }
    // LOD2 & LOD3: solid walls + pitched roof.
    group.add(box(m.w, m.h, m.d, m.cx, m.h / 2, m.cz, mats.wall));
    if (m.rh > 0) { const r = gableRoof(m.w, m.d, m.rh, mats.roof); r.position.set(m.cx, m.h, m.cz); group.add(r); }
    else group.add(box(m.w + 0.4, 0.3, m.d + 0.4, m.cx, m.h + 0.15, m.cz, mats.trim)); // flat-roof parapet (tower)
    addRoofDetail(group, m, mats, variant);
    if (lod === 3) addOpenings(group, m, mats, variant);
  });

  // outline edges to read the massing clearly
  masses.forEach((m) => {
    if (lod >= 2) return;
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(m.w, lod === 0 ? 0.12 : m.h, m.d));
    const ln = new THREE.LineSegments(eg, mats.edge); ln.position.set(m.cx, lod === 0 ? 0.06 : m.h / 2, m.cz); group.add(ln);
  });
  return group;
}

function disposeGroup(group) {
  group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}

const LABELS = ['footprint & roof-edge', 'extruded block', 'roof shapes', 'windows & doors'];
const DESCRIPTIONS = [
  'LOD0 — a 2.5D representation: horizontal footprint and roof-edge polygons only, with no volume. The x.0→x.3 variants refine the outline from a single rectangle to the articulated plan.',
  'LOD1 — a prismatic block model: the footprint extruded to a single height with a flat top. Variants add wings and stepped heights, but still no roof shape.',
  'LOD2 — the generalised exterior with a real roof shape (here a pitched roof) plus superstructures such as dormers and chimneys. Walls and roof are distinct surfaces, but the facade is closed.',
  'LOD3 — the detailed architectural exterior: openings appear as recessed windows and doors, with frames, sills/balconies and materials added across the x.0→x.3 variants.',
];

export default function BuildingLod() {
  const [lod, setLod] = useState(2);
  const [variant, setVariant] = useState(0);
  const [spin, setSpin] = useState(true);

  const mountRef = useRef(null);
  const three = useRef(null); // { renderer, scene, camera, controls, mats, modelRef }

  // one-time scene setup
  useEffect(() => {
    const mount = mountRef.current; const w = mount.clientWidth; const h = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe7ef);
    scene.fog = new THREE.Fog(0xdfe7ef, 120, 260);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.5, 2000);
    camera.position.set(52, 34, 56);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.target.set(0, 5, 0);
    controls.minDistance = 20; controls.maxDistance = 160; controls.maxPolarAngle = Math.PI * 0.495;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.9;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6b2, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(40, 70, 30); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd4ea, 0.5); fill.position.set(-40, 25, -30); scene.add(fill);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 64), new THREE.MeshStandardMaterial({ color: COL.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
    const grid = new THREE.GridHelper(160, 40, 0xc2ccd6, 0xd6dee7); grid.position.y = 0; scene.add(grid);

    const mats = {
      lod: new THREE.MeshStandardMaterial({ color: COL.lodBlue, roughness: 0.55, metalness: 0.0 }),
      lodT: new THREE.MeshStandardMaterial({ color: COL.lodBlue, transparent: true, opacity: 0.55, roughness: 0.5 }),
      wall: new THREE.MeshStandardMaterial({ color: COL.wall, roughness: 0.9 }),
      roof: new THREE.MeshStandardMaterial({ color: COL.roof, roughness: 0.75, side: THREE.DoubleSide }),
      glass: new THREE.MeshStandardMaterial({ color: COL.glass, roughness: 0.25, metalness: 0.1, emissive: 0x14263a, emissiveIntensity: 0.5 }),
      door: new THREE.MeshStandardMaterial({ color: COL.door, roughness: 0.7 }),
      trim: new THREE.MeshStandardMaterial({ color: COL.trim, roughness: 0.85 }),
      chimney: new THREE.MeshStandardMaterial({ color: COL.chimney, roughness: 0.9 }),
      edge: new THREE.LineBasicMaterial({ color: 0x2a5f86, transparent: true, opacity: 0.55 }),
    };

    three.current = { renderer, scene, camera, controls, mats, modelRef: { current: null } };

    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    const onResize = () => { const W = mount.clientWidth; const H = mount.clientHeight; camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('resize', onResize);
      controls.dispose(); if (three.current.modelRef.current) disposeGroup(three.current.modelRef.current);
      Object.values(mats).forEach((m) => m.dispose()); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // rebuild the model when LOD / variant changes
  useEffect(() => {
    const t = three.current; if (!t) return;
    if (t.modelRef.current) { t.scene.remove(t.modelRef.current); disposeGroup(t.modelRef.current); }
    const g = buildModel(lod, variant, t.mats); t.scene.add(g); t.modelRef.current = g;
  }, [lod, variant]);

  useEffect(() => { const t = three.current; if (t) t.controls.autoRotate = spin; }, [spin]);

  const resetView = () => { const t = three.current; if (!t) return; t.camera.position.set(52, 34, 56); t.controls.target.set(0, 5, 0); };

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Building LODs from IFC <span className="native-badge">Native React</span></h1>
          <span className="sub">Simplify an IFC office building into the 16 refined Levels of Detail — orbit each in 3D</span>
        </div>
        <span className="score-chip">viewing: <b>LOD{lod}.{variant}</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> 360° viewer <small>&mdash; drag to orbit, scroll to zoom</small></h2>
            <div className="lod-stage" ref={mountRef}>
              <div className="lod-badge">LOD{lod}.{variant} <small>· {LABELS[lod]}</small></div>
              <div className="lod-hint">drag = orbit · scroll = zoom</div>
            </div>
            <div className="lod-legend">
              <span><i className="lod-sw" style={{ background: '#4aa3e0' }} /> LOD0/1 mass</span>
              <span><i className="lod-sw" style={{ background: '#d9dde3' }} /> wall</span>
              <span><i className="lod-sw" style={{ background: '#b83b2e' }} /> roof</span>
              <span><i className="lod-sw" style={{ background: '#2f5f8f' }} /> window glass</span>
              <span><i className="lod-sw" style={{ background: '#5b3f27' }} /> door</span>
            </div>
            <div className="lod-toolbar">
              <label><input type="checkbox" checked={spin} onChange={(e) => setSpin(e.target.checked)} /> auto-rotate (360°)</label>
              <button className="lod-btn" onClick={resetView}>reset view</button>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">2</span> Pick a Level of Detail</h2>
            <div className="lod-grid">
              <div className="lod-h" />
              {[0, 1, 2, 3].map((c) => <div key={c} className="lod-h">LOD x.{c}</div>)}
              {[0, 1, 2, 3].map((r) => (
                <Fragment key={`row${r}`}>
                  <div className="lod-h lod-rowh">LOD{r}</div>
                  {[0, 1, 2, 3].map((c) => (
                    <button key={`${r}.${c}`} className={`lod-cell ${lod === r && variant === c ? 'on' : ''}`} onClick={() => { setLod(r); setVariant(c); }}>
                      LOD{r}.{c}<small>{c === 0 ? 'simplest' : c === 3 ? 'most detailed' : `variant ${c}`}</small>
                    </button>
                  ))}
                </Fragment>
              ))}
            </div>

            <div className="lod-sub">Source building (from IFC)</div>
            <div className="lod-facts">
              <div><span>footprint</span><b>{FACTS.footprint}</b></div>
              <div><span>storeys</span><b>{FACTS.storeys} + base</b></div>
              <div><span>eaves height</span><b>{FACTS.eaves} m</b></div>
              <div><span>windows</span><b>{FACTS.windows}</b></div>
            </div>

            <div className="lod-desc"><b>LOD{lod}.{variant}</b> — {DESCRIPTIONS[lod]}</div>

            <div className="rect-summary">
              <b>What a Level of Detail means</b>
              <p>
                The IFC file <code>AC20-Institute-Var-2.ifc</code> holds the full building (121 walls, 206 windows, 77 doors).
                For city-scale 3D models you rarely need all of it — you pick a <b>Level of Detail</b>. Following
                Biljecki, Ledoux &amp; Stoter (2016), the rows step up the geometry — <b>LOD0</b> flat polygons, <b>LOD1</b> a
                block, <b>LOD2</b> a roof, <b>LOD3</b> an openings-level exterior — while the columns <b>x.0→x.3</b> refine the
                footprint, massing and detail within each level. Each cell is generated by simplifying the same building.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
