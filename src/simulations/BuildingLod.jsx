import { Fragment, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './simulation.css';
import './native.css';
import './lod.css';

// ---------------------------------------------------------------------------
// Levels of Detail (LOD) explorer for a residential building, following the
// refined 4×4 LOD grid (Biljecki, Ledoux & Stoter 2016): LOD0 flat surfaces,
// LOD1 block models, LOD2 roof shapes, LOD3 the architectural exterior — with
// four refinement variants x.0..x.3 in each row. Each cell is generated in 3D.
// ---------------------------------------------------------------------------

const COL = {
  lod: 0x4aa8e0, lodT: 0x2f79ad, wall: 0xdfe2e6, roof: 0xcc3a2f, glass: 0x3f6fa8,
  door: 0x6b4a2e, trim: 0xc3cad2, wood: 0xb98a4e, chimney: 0x7a7f86, ground: 0xe7ecf1,
};

// Building dimensions (metres). Main gabled block + a lower right wing.
const ME = 5; const MR = 3;       // main eave / ridge-above-eave
const WE = 3; const WR = 1.6;     // wing eave / ridge

function box(w, h, d, x, y, z, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; }

// Gable roof for a w×d footprint (w = x span, d = z span), base at y=0.
// Ridge runs along the longer axis unless ridgeAlong is 'x' or 'z'.
function gableRoof(w, d, rh, mat, ridgeAlong = null) {
  const alongX = (ridgeAlong ?? (w >= d ? 'x' : 'z')) === 'x';
  const hw = w / 2; const hd = d / 2;
  const g = new THREE.BufferGeometry(); let v; let f;
  if (alongX) {
    v = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-hw, rh, 0], [hw, rh, 0]];
    f = [[0, 1, 5], [0, 5, 4], [3, 4, 5], [3, 5, 2], [1, 2, 5], [0, 4, 3]];
  } else {
    v = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [0, rh, -hd], [0, rh, hd]];
    f = [[0, 4, 5], [0, 5, 3], [1, 2, 5], [1, 5, 4], [0, 1, 4], [3, 5, 2]];
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(f.flat().flatMap((i) => v[i]), 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// Flat eave lips projecting past each wall face at eave height (visible overhang).
function addRoofOverhangSkirt(g, cx, cz, w, d, eaveY, ov, mat) {
  if (ov <= 0) return;
  const hw = w / 2;
  const hd = d / 2;
  const lip = 0.16;
  const y = eaveY - lip / 2;
  g.add(box(w + 2 * ov, lip, ov, cx, y, cz - hd - ov / 2, mat)); // front (-z)
  g.add(box(w + 2 * ov, lip, ov, cx, y, cz + hd + ov / 2, mat)); // rear (+z)
  g.add(box(ov, lip, d + 2 * ov, cx - hw - ov / 2, y, cz, mat)); // left (-x)
  g.add(box(ov, lip, d + 2 * ov, cx + hw + ov / 2, y, cz, mat)); // right (+x)
}

// Extend roof footprint equally on all sides when eaves project past walls.
function roofFootprint(w, d, ov) {
  return { w: w + 2 * ov, d: d + 2 * ov };
}

// ---- LOD0 : flat footprint / roof-edge surfaces --------------------------
function buildLod0(g, variant, mats) {
  const ground = variant === 0 ? [[13, 7, 2, 0]] : [[9, 7, 0, 0], [4, 4, 6.5, 0]];
  ground.forEach(([w, d, cx, cz]) => g.add(box(w, 0.12, d, cx, 0.06, cz, mats.lod)));
  if (variant >= 2) {
    const roof = variant === 3 ? [[9.8, 7.8, 0, 0], [4.6, 4.6, 6.5, 0]] : [[9, 7, 0, 0], [4, 4, 6.5, 0]];
    roof.forEach(([w, d, cx, cz]) => g.add(box(w, 0.12, d, cx, ME, cz, mats.lodT)));
    if (variant === 3) g.add(box(3, 0.12, 1.6, 0.5, ME + 1.1, -0.5, mats.lodT)); // broken roof-overhang piece
  }
}

// ---- LOD1 : extruded block models ---------------------------------------
function buildLod1(g, variant, mats) {
  const m = mats.lod;
  if (variant === 0) { g.add(box(13, ME, 7, 2, ME / 2, 0, m)); return; }
  g.add(box(9, ME, 7, 0, ME / 2, 0, m)); // main block
  if (variant === 1) { g.add(box(4, ME, 4, 6.5, ME / 2, 0, m)); return; } // wing at same height
  g.add(box(4, WE, 4, 6.5, WE / 2, 0, m)); // wing lower (segmented heights)
  if (variant === 3) g.add(box(3, 3, 2.4, -2, 1.5, -4.3, m)); // annex / extension
}

// ---- shared house pieces --------------------------------------------------
function addDormers(g, n, mats, ov = 0) {
  const frontZ = -3.5; const inset = 1.6; const zc = frontZ + inset; const cheekW = 1.5; const cheekD = 1.4;
  const surfY = ME + MR * (inset / 3.5);
  const capY = surfY + 1.05;
  for (let i = 0; i < n; i += 1) {
    const x = (i - (n - 1) / 2) * 3;
    g.add(box(cheekW, 1.2, cheekD, x, surfY + 0.45, zc, mats.wall));
    g.add(box(1.0, 0.75, 0.1, x, surfY + 0.45, zc - cheekD / 2 + 0.06, mats.glass));
    if (ov > 0) addRoofOverhangSkirt(g, x, zc, cheekW, cheekD, capY, ov, mats.roof);
    const capRf = roofFootprint(1.7, 1.6, ov);
    const cap = gableRoof(capRf.w, capRf.d, 0.55, mats.roof);
    cap.position.set(x, capY, zc);
    g.add(cap);
  }
}

function addWindow(g, x, y, z, mats, w = 1.1, h = 1.4) {
  g.add(box(w + 0.28, h + 0.28, 0.08, x, y, z - 0.02, mats.trim)); // frame
  g.add(box(w, h, 0.1, x, y, z - 0.16, mats.glass)); // recessed glass
  g.add(box(w + 0.24, 0.09, 0.16, x, y - h / 2 - 0.08, z - 0.05, mats.trim)); // sill
}

function addWindows(g, mats, full) {
  const z = -3.51;
  const lower = [-3.2, -1.6, 1.6, 3.2]; // ground row (centre left for the door)
  lower.forEach((x) => addWindow(g, x, 1.7, z, mats));
  if (full) {
    [-3.2, -1.6, 0, 1.6, 3.2].forEach((x) => addWindow(g, x, 3.7, z, mats)); // upper row
    addWindow(g, 0, 6.0, z + 1.2, mats, 1.0, 1.0); // gable window
  }
  addWindow(g, 6.5, 1.5, -2.01, mats, 1.0, 1.2); // wing front window
}

function addBalcony(g, mats, railings) {
  // Main facade only — under the upper window at x = 1.6, left of the entrance porch (x ≤ 0.8).
  const x = 1.6;
  const winY = 3.7;
  const winH = 1.4;
  const y = winY - winH / 2 - 0.08; // slab at window-sill height
  const wallZ = -3.5;
  const slabW = 1.25;
  const slabDepth = 0.9;
  const hw = slabW / 2;
  const slabZ = wallZ - slabDepth / 2;
  const railFrontZ = wallZ - slabDepth;
  g.add(box(slabW, 0.14, slabDepth, x, y, slabZ, mats.trim)); // slab
  if (railings) {
    g.add(box(slabW, 0.08, 0.08, x, y + 0.85, railFrontZ, mats.trim)); // top rail
    g.add(box(0.08, 0.85, slabDepth, x - hw, y + 0.42, slabZ, mats.trim));
    g.add(box(0.08, 0.85, slabDepth, x + hw, y + 0.42, slabZ, mats.trim));
    for (let bx = -0.45; bx <= 0.45; bx += 0.23) g.add(box(0.05, 0.85, 0.05, x + bx, y + 0.42, railFrontZ, mats.trim)); // balusters
  }
}

// ---- LOD2 & LOD3 : real house --------------------------------------------
function buildHouse(g, lod, variant, mats) {
  const hasOverhang = (lod === 2 && variant === 3) || (lod === 3 && variant >= 2);
  const ov = hasOverhang ? 0.35 : 0;
  // main block
  g.add(box(9, ME, 7, 0, ME / 2, 0, mats.wall));
  if (ov > 0) addRoofOverhangSkirt(g, 0, 0, 9, 7, ME, ov, mats.roof);
  const mainRf = roofFootprint(9, 7, ov);
  const mr = gableRoof(mainRf.w, mainRf.d, MR, mats.roof);
  mr.position.set(0, ME, 0);
  g.add(mr);
  // lower right wing
  g.add(box(4, WE, 4, 6.5, WE / 2, 0, mats.wall));
  if (ov > 0) addRoofOverhangSkirt(g, 6.5, 0, 4, 4, WE, ov, mats.roof);
  const wingRf = roofFootprint(4, 4, ov);
  const wr = gableRoof(wingRf.w, wingRf.d, WR, mats.roof);
  wr.position.set(6.5, WE, 0);
  g.add(wr);

  const chimney = (lod === 2 && variant >= 1) || lod === 3;
  const entrance = (lod === 2 && variant >= 1) || lod === 3;
  const dormers = (lod === 2 && variant >= 2) || lod === 3;
  const nDorm = 2; // always two dormers
  const windows = lod === 3;
  const fullWindows = lod === 3 && variant >= 1;
  const roofEquip = (lod === 2 && variant >= 3) || (lod === 3 && variant >= 2);
  const canopy = lod === 3 && variant >= 2;
  const balcony = lod === 3 && variant >= 2;
  const railings = lod === 3 && variant >= 3;
  const wood = lod === 3 && variant >= 3;

  if (chimney) g.add(box(0.7, 2.2, 0.7, -2.6, 6.6, 0.6, mats.chimney));
  if (entrance) { // small front entrance block (porch) — ridge runs front-to-back above the door
    const porchW = 2.6; const porchD = 2; const porchCx = -0.5; const porchCz = -4.3; const porchEave = 3;
    g.add(box(porchW, porchEave, porchD, porchCx, porchEave / 2, porchCz, mats.wall));
    if (ov > 0) addRoofOverhangSkirt(g, porchCx, porchCz, porchW, porchD, porchEave, ov, mats.roof);
    const porchRf = roofFootprint(porchW, porchD, ov);
    const er = gableRoof(porchRf.w, porchRf.d, 1, mats.roof, 'z');
    er.position.set(porchCx, porchEave, porchCz);
    g.add(er);
  }
  if (dormers) addDormers(g, nDorm, mats, ov);
  if (roofEquip) { g.add(box(1.3, 0.25, 1.7, 2.4, ME + 0.5, 1.4, mats.glass)); g.add(box(0.5, 0.9, 0.5, 3.2, ME + MR * 0.55, 0.4, mats.chimney)); }
  if (windows) addWindows(g, mats, fullWindows);
  if (wood) g.add(box(4.02, WE, 0.08, 6.5, WE / 2, -2.02, mats.wood)); // wood-clad wing facade
  // door — a LOD3 feature only (LOD2 has no openings)
  if (lod === 3) g.add(box(1.3, 2.4, 0.16, -0.5, 1.2, entrance ? -5.32 : -3.55, mats.door));
  if (canopy) g.add(box(2.4, 0.16, 1.1, -0.5, 2.75, -5.7, mats.trim));
  if (balcony) addBalcony(g, mats, railings);
}

function buildModel(lod, variant, mats) {
  const g = new THREE.Group();
  if (lod === 0) buildLod0(g, variant, mats);
  else if (lod === 1) buildLod1(g, variant, mats);
  else buildHouse(g, lod, variant, mats);
  return g;
}

function disposeGroup(group) { group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }

const ROW_LABEL = ['footprint (flat surfaces)', 'block model', 'roof shapes', 'architectural exterior'];
// The 16 cells, exactly per the supplied table.
const TABLE = {
  '0.0': ['2D building footprint', 'Building footprint polygon only', 'Height, roof shape, walls, textures, openings'],
  '0.1': ['Refined footprint', 'More accurate footprint outline', 'Height, roof geometry, walls'],
  '0.2': ['Multi-surface footprint', 'Separate roof and ground surfaces', 'Vertical walls, building volume'],
  '0.3': ['Detailed roof footprint', 'Roof overhangs and complex roof outline', 'Building volume, façade details'],
  '1.0': ['Simple block model', 'Extruded building volume with flat roof', 'Roof shape, dormers, façade details'],
  '1.1': ['Improved block', 'Building block with refined roof outline', 'Detailed roof geometry, windows, doors'],
  '1.2': ['Segmented volume', 'Multiple connected building blocks representing different heights', 'Roof structures, façade openings'],
  '1.3': ['Complex block', 'Additional volume elements such as extensions or annexes', 'Roof details, façade semantics'],
  '2.0': ['Roof geometry', 'True roof shape and building form', 'Windows, doors, balconies, façade details'],
  '2.1': ['Basic exterior features', 'Simple exterior protrusions (chimneys, entrance blocks)', 'Windows, roof furniture'],
  '2.2': ['Detailed roof', 'Dormers, skylights, roof structures', 'Detailed façade elements'],
  '2.3': ['Highly refined exterior shell', 'Multiple roof structures and exterior projections', 'Individual windows, balconies, façade textures'],
  '3.0': ['Architectural exterior', 'Detailed walls, roof, windows, doors', 'Interior spaces'],
  '3.1': ['Exterior with façade openings', 'Accurate windows, doors, façade segmentation', 'Interior rooms, furniture'],
  '3.2': ['Detailed architectural model', 'Balconies, canopies, roof structures, façade details', 'Interior geometry'],
  '3.3': ['Highly detailed exterior', 'Complete architectural exterior including railings, fine façade elements, detailed roof equipment', 'Interior rooms and building systems'],
};

export default function BuildingLod() {
  const [lod, setLod] = useState(2);
  const [variant, setVariant] = useState(0);
  const [spin, setSpin] = useState(true);

  const mountRef = useRef(null);
  const three = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const w = mount.clientWidth; const h = mount.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio)); renderer.setSize(w, h);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfe7ef); scene.fog = new THREE.Fog(0xdfe7ef, 55, 130);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.4, 1000);
    camera.position.set(15, 10, -16);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.target.set(2, 3, 0);
    controls.minDistance = 8; controls.maxDistance = 70; controls.maxPolarAngle = Math.PI * 0.495;
    controls.autoRotate = true; controls.autoRotateSpeed = 0.9;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa6b2, 1.05));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(18, 30, -12); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xbcd4ea, 0.5); fill.position.set(-16, 12, 14); scene.add(fill);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(90, 64), new THREE.MeshStandardMaterial({ color: COL.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; scene.add(ground);
    scene.add(new THREE.GridHelper(100, 40, 0xc2ccd6, 0xd6dee7));

    const mats = {
      lod: new THREE.MeshStandardMaterial({ color: COL.lod, roughness: 0.55 }),
      lodT: new THREE.MeshStandardMaterial({ color: COL.lodT, transparent: true, opacity: 0.6, roughness: 0.5 }),
      wall: new THREE.MeshStandardMaterial({ color: COL.wall, roughness: 0.9 }),
      roof: new THREE.MeshStandardMaterial({ color: COL.roof, roughness: 0.75, side: THREE.DoubleSide }),
      glass: new THREE.MeshStandardMaterial({ color: COL.glass, roughness: 0.25, metalness: 0.1, emissive: 0x14263a, emissiveIntensity: 0.5 }),
      door: new THREE.MeshStandardMaterial({ color: COL.door, roughness: 0.7 }),
      trim: new THREE.MeshStandardMaterial({ color: COL.trim, roughness: 0.85 }),
      wood: new THREE.MeshStandardMaterial({ color: COL.wood, roughness: 0.85 }),
      chimney: new THREE.MeshStandardMaterial({ color: COL.chimney, roughness: 0.9 }),
    };

    three.current = { renderer, scene, camera, controls, mats, modelRef: { current: null } };

    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    const onResize = () => { const W = mount.clientWidth; const H = mount.clientHeight; camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H); };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); controls.dispose();
      if (three.current.modelRef.current) disposeGroup(three.current.modelRef.current);
      Object.values(mats).forEach((m) => m.dispose()); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  useEffect(() => {
    const t = three.current; if (!t) return;
    if (t.modelRef.current) { t.scene.remove(t.modelRef.current); disposeGroup(t.modelRef.current); }
    const grp = buildModel(lod, variant, t.mats); t.scene.add(grp); t.modelRef.current = grp;
  }, [lod, variant]);

  useEffect(() => { const t = three.current; if (t) t.controls.autoRotate = spin; }, [spin]);

  const resetView = () => { const t = three.current; if (!t) return; t.camera.position.set(15, 10, -16); t.controls.target.set(2, 3, 0); };

  const cell = TABLE[`${lod}.${variant}`];

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Building Levels of Detail <span className="native-badge">Native React</span></h1>
          <span className="sub">A residential building across the 16 refined LODs — footprint, block, roof, architecture — viewable in 3D</span>
        </div>
        <span className="score-chip">viewing: <b>LOD{lod}.{variant}</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> 3D viewer <small>&mdash; drag to orbit, scroll to zoom</small></h2>
            <div className="lod-stage" ref={mountRef}>
              <div className="lod-badge">LOD{lod}.{variant} <small>· {cell[0]}</small></div>
              <div className="lod-hint">drag = orbit · scroll = zoom</div>
            </div>
            <div className="lod-legend">
              <span><i className="lod-sw" style={{ background: '#4aa8e0' }} /> flat surface (LOD0/1)</span>
              <span><i className="lod-sw" style={{ background: '#dfe2e6' }} /> wall</span>
              <span><i className="lod-sw" style={{ background: '#cc3a2f' }} /> roof</span>
              <span><i className="lod-sw" style={{ background: '#3f6fa8' }} /> window</span>
              <span><i className="lod-sw" style={{ background: '#6b4a2e' }} /> door</span>
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
                  <div className="lod-h">LOD{r}</div>
                  {[0, 1, 2, 3].map((c) => (
                    <button key={`${r}.${c}`} className={`lod-cell ${lod === r && variant === c ? 'on' : ''}`} onClick={() => { setLod(r); setVariant(c); }}>
                      LOD{r}.{c}<small>{TABLE[`${r}.${c}`][0]}</small>
                    </button>
                  ))}
                </Fragment>
              ))}
            </div>

            <div className="lod-desc"><b>LOD{lod}.{variant} — {cell[0]}.</b> This row is the <b>{ROW_LABEL[lod]}</b> level; the columns x.0→x.3 refine it.</div>
            <div className="lod-inc">
              <div className="yes"><span>Included</span>{cell[1]}</div>
              <div className="no"><span>Not included</span>{cell[2]}</div>
            </div>

            <div className="rect-summary">
              <b>What a Level of Detail means</b>
              <p>
                The same building is represented at increasing detail. Down the rows the geometry grows — <b>LOD0</b> flat
                footprint/roof surfaces, <b>LOD1</b> an extruded block, <b>LOD2</b> the true roof shape, <b>LOD3</b> the full
                architectural exterior (windows, doors, dormers, balconies). Across the columns <b>x.0→x.3</b> each level is
                refined further. Pick any cell and orbit it in 3D.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
