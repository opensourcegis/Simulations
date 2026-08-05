import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import earthUrl from '../assets/earth.jpg';
import './simulation.css';
import './native.css';
import './mapproj.css';

// ---------------------------------------------------------------------------
// Map Projections — wrap the round Earth onto a flat sheet.
//
// A projection is a rule (φ,λ) → (x,y). No flat map keeps shape, area and
// distance all true at once, so every projection is a compromise built on a
// developable surface — a cylinder, a cone, or a plane — that "unrolls" flat.
// A light at the globe's centre casts the graticule outward onto that surface;
// Tissot's indicatrices (equal circles on the globe) show where it stretches.
// ---------------------------------------------------------------------------

const R = 2;                       // globe radius (world units)
const HALF_W = 3.3; const HALF_H = 1.95; // target flat-map half-extents
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// φ,λ in radians → 3D point on the sphere (λ=0 faces +Z).
function sphereXYZ(phi, lam, rad = R) {
  const c = Math.cos(phi);
  return [rad * c * Math.sin(lam), rad * Math.sin(phi), rad * c * Math.cos(lam)];
}

// ---- projections (forward: φ,λ radians → [x,y] natural units) --------------
function pEquirect(phi, lam) { return [lam, phi]; }
function pMercator(phi, lam) { const p = clamp(phi, -1.5359, 1.5359); return [lam, Math.log(Math.tan(Math.PI / 4 + p / 2))]; }
function pUTM(phi, lam) { // transverse Mercator (UTM's underlying projection), central meridian 0
  const B = clamp(Math.cos(phi) * Math.sin(lam), -0.9995, 0.9995);
  return [0.5 * Math.log((1 + B) / (1 - B)), Math.atan2(Math.tan(phi), Math.cos(lam))];
}
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
const LC_P1 = 20 * D2R; const LC_P2 = 50 * D2R;
const LC_N = Math.log(Math.cos(LC_P1) / Math.cos(LC_P2)) / Math.log(Math.tan(Math.PI / 4 + LC_P2 / 2) / Math.tan(Math.PI / 4 + LC_P1 / 2));
const LC_F = (Math.cos(LC_P1) * Math.pow(Math.tan(Math.PI / 4 + LC_P1 / 2), LC_N)) / LC_N;
function pLambert(phi, lam) {
  const p = clamp(phi, -78 * D2R, 89.5 * D2R);
  const rho = LC_F / Math.pow(Math.tan(Math.PI / 4 + p / 2), LC_N);
  const th = LC_N * lam;
  return [rho * Math.sin(th), LC_F - rho * Math.cos(th)];
}
function pAzimuthal(phi, lam) { const rho = Math.PI / 2 - phi; return [rho * Math.sin(lam), -rho * Math.cos(lam)]; }

const PROJECTIONS = [
  { id: 'mercator', name: 'Mercator', family: 'Cylindrical', surface: 'cylinder', prop: 'conformal', fn: pMercator, fitLat: 80, blurb: 'A cylinder around the equator. Keeps angles & shapes (great for navigation) but blows up area toward the poles — Greenland looks as big as Africa.' },
  { id: 'utm', name: 'UTM · Transverse Mercator', family: 'Cylindrical (transverse)', surface: 'cylinderT', prop: 'conformal', fn: pUTM, band: 18, blurb: 'A cylinder wrapped around a meridian, not the equator. Distortion stays tiny only near the central meridian, so UTM never maps the whole world — it slices it into 60 narrow 6°-wide zones (scale 0.9996). Here we project just one strip of a few zones; each is nearly true.' },
  { id: 'equirect', name: 'Equirectangular', family: 'Cylindrical', surface: 'cylinder', prop: 'equidistant', fn: pEquirect, blurb: 'The simplest rule: x = longitude, y = latitude. True scale along meridians but stretches east–west away from the equator.' },
  { id: 'mollweide', name: 'Mollweide', family: 'Pseudocylindrical', surface: 'cylinder', prop: 'equalarea', fn: pMollweide, blurb: 'An ellipse with curved meridians. Every region keeps its true relative area, so it is a favourite for thematic world maps; shapes shear near the edges.' },
  { id: 'albers', name: 'Albers Conic', family: 'Conic', surface: 'cone', prop: 'equalarea', fn: pAlbers, blurb: 'A cone on two standard parallels (20°/50°). Equal-area with low distortion across a mid-latitude band — the classic choice for country & continent maps.' },
  { id: 'lambert', name: 'Lambert Conic', family: 'Conic', surface: 'cone', prop: 'conformal', fn: pLambert, blurb: 'The conformal cone (same 20°/50° parallels). Keeps shapes & angles true across a mid-latitude band — the standard for aeronautical charts and many national grids.' },
  { id: 'azimuthal', name: 'Azimuthal Equidistant', family: 'Planar', surface: 'plane', prop: 'equidistant', fn: pAzimuthal, blurb: 'A plane touching the pole. All distances & directions FROM the centre are true — used for polar and range maps — but the far hemisphere stretches around the rim.' },
];

// ---- graticule / tissot / polygon as segment-pair vertex lists -------------
// `band` (deg) restricts content to a ±band longitude strip (used by UTM zones).
function meridiansParallels(band) {
  const segs = []; const B = band || 180; const mstep = band ? 6 : 30;
  const pushLine = (pts) => { for (let i = 0; i < pts.length - 1; i += 1) { segs.push(pts[i], pts[i + 1]); } };
  for (let lon = -B; lon <= B; lon += mstep) { const pts = []; for (let lat = -88; lat <= 88; lat += 4) pts.push({ phi: lat * D2R, lam: lon * D2R }); pushLine(pts); }
  for (let lat = -60; lat <= 60; lat += 30) { const pts = []; for (let lon = -B; lon <= B; lon += 3) pts.push({ phi: lat * D2R, lam: lon * D2R }); pushLine(pts); }
  return segs;
}
function tissotSegs(band) {
  const segs = []; const delta = 6 * D2R; const K = 26;
  const centers = [];
  const lonC = band ? [-Math.round(band * 0.6), 0, Math.round(band * 0.6)] : [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  for (let lat = -60; lat <= 60; lat += 30) lonC.forEach((lon) => centers.push([lat * D2R, lon * D2R]));
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
function polygonSegs(poly, band) {
  if (poly.length < 2) return [];
  const cl = (lo) => (band ? clamp(lo, -band + 0.5, band - 0.5) : lo); // keep on the strip
  const segs = []; const STEP = 10; const loop = [...poly, poly[0]];
  for (let e = 0; e < loop.length - 1; e += 1) {
    const [la1, lo1] = loop[e]; const [la2, lo2] = loop[e + 1]; let prev = null;
    for (let s = 0; s <= STEP; s += 1) {
      const f = s / STEP;
      const v = { phi: (la1 + (la2 - la1) * f) * D2R, lam: cl(lo1 + (lo2 - lo1) * f) * D2R };
      if (prev) segs.push(prev, v); prev = v;
    }
  }
  return segs;
}

function fitTransform(fn, fitLat = 90, lonLim = 180) {
  let minX = 1e9; let maxX = -1e9; let minY = 1e9; let maxY = -1e9;
  let hasSample = false;
  for (let lat = -fitLat; lat <= fitLat; lat += 5) for (let lon = -lonLim; lon <= lonLim; lon += Math.max(2, lonLim / 18)) {
    const [x, y] = fn(lat * D2R, lon * D2R);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    hasSample = true;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (!hasSample || minX >= maxX || minY >= maxY) {
    return { scale: 1, midX: 0, midY: 0 };
  }
  const s = Math.min((2 * HALF_W) / (maxX - minX), (2 * HALF_H) / (maxY - minY));
  return { scale: s, midX: (minX + maxX) / 2, midY: (minY + maxY) / 2 };
}
const flatXY = (fn, tr, phi, lam) => { const [x, y] = fn(phi, lam); return [(x - tr.midX) * tr.scale, (y - tr.midY) * tr.scale]; };

function areaScale(fn, latDeg) {
  const d = 1e-4; const phi = latDeg * D2R; const lam = 0;
  const p0 = fn(phi, lam); const px = fn(phi, lam + d); const py = fn(phi + d, lam);
  const det = Math.abs(((px[0] - p0[0]) / d) * ((py[1] - p0[1]) / d) - ((py[0] - p0[0]) / d) * ((px[1] - p0[1]) / d));
  return det / Math.max(Math.cos(phi), 1e-4);
}
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

function disposeObject3D(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}

// align the equirectangular texture: full globe, or a ±band° longitude strip
function applyTexBand(tex, band) {
  tex.wrapS = THREE.RepeatWrapping;
  if (band) { tex.repeat.x = (2 * band) / 360; tex.offset.x = 0.5 - band / 360; } else { tex.repeat.x = 1; tex.offset.x = 0.25; }
  tex.needsUpdate = true;
}

export default function MapProjections() {
  const [projId, setProjId] = useState('mercator');
  const [unfold, setUnfold] = useState(0);
  const [drawMode, setDrawMode] = useState(false);
  const [poly, setPoly] = useState([[8, -18], [8, 38], [56, 38], [56, -18]]);

  const mountRef = useRef(null);
  const unfoldSliderRef = useRef(null);
  const G = useRef(null);
  const unfoldRef = useRef(unfold); unfoldRef.current = unfold;
  const drawRef = useRef(drawMode); drawRef.current = drawMode;
  const dirtyRef = useRef(true);
  const playRef = useRef(null);
  const polyRef = useRef(poly); polyRef.current = poly;

  const proj = PROJECTIONS.find((p) => p.id === projId);
  const projRef = useRef(proj); projRef.current = proj;

  useEffect(() => {
    const mount = mountRef.current; if (!mount) return undefined;
    const W = mount.clientWidth; const H = mount.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100); camera.position.set(0, 0, 7.2);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(W, H);
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.09; controls.minDistance = 2.3; controls.maxDistance = 20; controls.zoomSpeed = 1.1;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.45); dir.position.set(4, 6, 8); scene.add(dir);

    const group = new THREE.Group(); scene.add(group);

    // rough textured Earth — morphs from globe to flat map
    // trim the caps (±88°) so pole vertices don't pile up under cylindrical projections
    const earthGeo = new THREE.SphereGeometry(R, 96, 64, 0, Math.PI * 2, 2 * D2R, 176 * D2R);
    const pos = earthGeo.attributes.position; const NV = pos.count;
    const vLL = new Float32Array(NV * 2); const vSph = new Float32Array(NV * 3);
    for (let i = 0; i < NV; i += 1) {
      const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
      const phi = Math.asin(clamp(y / R, -1, 1)); const lam = Math.atan2(x, z);
      vLL[i * 2] = phi; vLL[i * 2 + 1] = lam; vSph[i * 3] = x; vSph[i * 3 + 1] = y; vSph[i * 3 + 2] = z;
    }
    const earthMat = new THREE.MeshPhongMaterial({ color: 0x8ba0b8, shininess: 6, side: THREE.DoubleSide });
    const earth = new THREE.Mesh(earthGeo, earthMat);
    group.add(earth);
    // faint full-globe wireframe kept round for context when only a strip is projected
    const ctxSphere = new THREE.Mesh(new THREE.SphereGeometry(R * 0.992, 36, 24), new THREE.MeshBasicMaterial({ color: 0x2c516f, wireframe: true, transparent: true, opacity: 0.16 }));
    ctxSphere.visible = false; group.add(ctxSphere);
    // real NASA Blue Marble satellite texture (bundled) — align image Greenwich to λ=0 (+Z)
    new THREE.TextureLoader().load(earthUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      applyTexBand(tex, projRef.current.band);
      earthMat.map = tex; earthMat.color.set(0xffffff); earthMat.needsUpdate = true;
      if (G.current) G.current.tex = tex;
    });

    // thick graticule / tissot / polygon (fat lines) that morph to the projection
    const mkFat = (segs, color, px, op) => {
      const geo = new LineSegmentsGeometry();
      const mat = new LineMaterial({ color, linewidth: px, transparent: true, opacity: op, dashed: false });
      mat.resolution.set(W, H);
      const obj = new LineSegments2(geo, mat); obj.frustumCulled = false; obj.renderOrder = 3; group.add(obj);
      return { obj, geo, mat, ll: segs };
    };
    const grat = mkFat(meridiansParallels(), 0xcfe6ff, 3.2, 0.9);
    const tiss = mkFat(tissotSegs(), 0xffb703, 3, 0.96);
    const pol = mkFat(polygonSegs([[8, -18], [8, 38], [56, 38], [56, -18]]), 0x35d07f, 4.5, 1);

    // projection optics: light at globe centre + developable surface + rays
    const optics = new THREE.Group(); group.add(optics);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), bulbMat); optics.add(bulb);
    const plight = new THREE.PointLight(0xfff2c0, 6, 20); optics.add(plight);
    const rayMat = new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.5 });
    const rays = new THREE.LineSegments(new THREE.BufferGeometry(), rayMat); rays.frustumCulled = false; optics.add(rays);
    const surfMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, wireframe: true, transparent: true, opacity: 0.32 });
    let surf = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 5, 40, 1, true), surfMat); optics.add(surf);

    G.current = {
      scene, camera, renderer, controls, group, earth, earthGeo, vLL, vSph, NV, ctxSphere, tex: null,
      grat, tiss, pol, optics, bulb, plight, rays, surf, surfMat, rayMat, bulbMat, curBand: 0,
      fnNow: proj.fn, tr: fitTransform(proj.fn, proj.fitLat, proj.band || 180), angle: 0, lastT: -1, raf: 0, disposed: false,
    };
    buildOptics(proj);
    applyMorph(0);

    const ray = new THREE.Raycaster(); const ptr = new THREE.Vector2();
    const onDown = (ev) => {
      if (!drawRef.current) return;
      const r = renderer.domElement.getBoundingClientRect();
      ptr.x = ((ev.clientX - r.left) / r.width) * 2 - 1; ptr.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObject(G.current.earth, false)[0]; if (!hit) return;
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
      if (playRef.current) {
        const pl = playRef.current; const k = clamp((now - pl.start) / pl.dur, 0, 1);
        const val = pl.from + (pl.to - pl.from) * k;
        unfoldRef.current = val;
        if (unfoldSliderRef.current) unfoldSliderRef.current.value = String(val);
        dirtyRef.current = true;
        if (k >= 1) {
          playRef.current = null;
          setUnfold(val);
        }
      }
      const tRaw = clamp(unfoldRef.current, 0, 1); const t = easeInOut(tRaw);
      if (!drawRef.current && tRaw < 0.25) g.angle += dt * 0.26;
      if (tRaw > 0.6) g.angle += (0 - g.angle) * Math.min(1, dt * 3);
      g.group.rotation.y = g.angle;
      g.optics.visible = tRaw < 0.985;
      if (g.ctxSphere.visible) g.ctxSphere.material.opacity = 0.16 * clamp(1 - t * 1.4, 0, 1);
      if (dirtyRef.current || Math.abs(t - g.lastT) > 1e-4) { applyMorph(t); g.lastT = t; dirtyRef.current = false; }
      g.controls.update(); g.renderer.render(g.scene, g.camera);
    };
    loop();

    const onResize = () => {
      const g = G.current; if (!g) return; const w = mount.clientWidth; const h = mount.clientHeight;
      g.camera.aspect = w / h; g.camera.updateProjectionMatrix(); g.renderer.setSize(w, h);
      [g.grat, g.tiss, g.pol].forEach((s) => s.mat.resolution.set(w, h));
    };
    window.addEventListener('resize', onResize);

    return () => {
      const g = G.current; if (!g) return;
      g.disposed = true; cancelAnimationFrame(g.raf);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onDown);
      controls.dispose();
      disposeObject3D(g.scene);
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      G.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // write positions for a fat-line set at morph t (sphere just outside globe, flat just in front)
  function fillFat(set, t) {
    const g = G.current; const fn = g.fnNow; const tr = g.tr; const arr = new Float32Array(set.ll.length * 3);
    for (let i = 0; i < set.ll.length; i += 1) {
      const { phi, lam } = set.ll[i];
      const s = sphereXYZ(phi, lam, R * 1.004); const f = flatXY(fn, tr, phi, lam);
      const fy = clamp(f[1], -HALF_H, HALF_H); // fold overflow (e.g. Mercator caps) onto the edge
      arr[i * 3] = s[0] + (f[0] - s[0]) * t;
      arr[i * 3 + 1] = s[1] + (fy - s[1]) * t;
      arr[i * 3 + 2] = s[2] + (0.008 - s[2]) * t;
    }
    set.geo.setPositions(arr);
  }
  function applyMorph(t) {
    const g = G.current; if (!g) return; const fn = g.fnNow; const tr = g.tr;
    // Earth mesh vertices
    const pos = g.earth.geometry.attributes.position;
    for (let i = 0; i < g.NV; i += 1) {
      const phi = g.vLL[i * 2]; const lam = g.vLL[i * 2 + 1];
      const sx = g.vSph[i * 3]; const sy = g.vSph[i * 3 + 1]; const sz = g.vSph[i * 3 + 2];
      const f = flatXY(fn, tr, phi, lam);
      const fy = clamp(f[1], -HALF_H, HALF_H); // fold overflow (e.g. Mercator caps) onto the edge
      pos.setXYZ(i, sx + (f[0] - sx) * t, sy + (fy - sy) * t, sz + (0 - sz) * t);
    }
    pos.needsUpdate = true; g.earth.geometry.computeVertexNormals();
    fillFat(g.grat, t); fillFat(g.tiss, t); fillFat(g.pol, t);
    // fade optics
    const fade = clamp(1 - t / 0.85, 0, 1);
    g.surfMat.opacity = 0.32 * fade; g.rayMat.opacity = 0.5 * fade; g.bulbMat.opacity = fade;
  }
  // build the developable surface + rays for the active projection family
  function buildOptics(p) {
    const g = G.current; if (!g) return;
    g.optics.remove(g.surf); g.surf.geometry.dispose();
    let mesh;
    if (p.surface === 'cone') { mesh = new THREE.Mesh(new THREE.ConeGeometry(R * 1.7, 3.4, 44, 1, true), g.surfMat); mesh.position.y = 0.5; }
    else if (p.surface === 'plane') { mesh = new THREE.Mesh(new THREE.CircleGeometry(R * 1.7, 48), g.surfMat); mesh.rotation.x = -Math.PI / 2; mesh.position.y = R * 1.02; }
    else { mesh = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.02, 5.2, 44, 1, true), g.surfMat); if (p.surface === 'cylinderT') mesh.rotation.z = Math.PI / 2; }
    g.optics.add(mesh); g.surf = mesh;
    // rays from centre through graticule nodes out to 1.6R
    const pts = [];
    for (let lat = -60; lat <= 60; lat += 30) for (let lon = -150; lon <= 150; lon += 30) {
      const s = sphereXYZ(lat * D2R, lon * D2R, 1); pts.push(0, 0, 0, s[0] * R * 1.62, s[1] * R * 1.62, s[2] * R * 1.62);
    }
    g.rays.geometry.dispose(); const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.rays.geometry = rg;
  }

  // swap the earth to a ±band° gore (and filtered graticule) when the projection needs a strip
  function rebuildForBand(band) {
    const g = G.current; if (!g) return; const b = band || 0;
    if (g.curBand !== b) {
      const phiStart = band ? Math.PI / 2 - band * D2R : 0;
      const phiLen = band ? 2 * band * D2R : Math.PI * 2;
      const geo = new THREE.SphereGeometry(R, band ? 64 : 96, 64, phiStart, phiLen, 2 * D2R, 176 * D2R);
      const p = geo.attributes.position; const NV = p.count;
      const vLL = new Float32Array(NV * 2); const vSph = new Float32Array(NV * 3);
      for (let i = 0; i < NV; i += 1) {
        const x = p.getX(i); const y = p.getY(i); const z = p.getZ(i);
        vLL[i * 2] = Math.asin(clamp(y / R, -1, 1)); vLL[i * 2 + 1] = Math.atan2(x, z);
        vSph[i * 3] = x; vSph[i * 3 + 1] = y; vSph[i * 3 + 2] = z;
      }
      g.earth.geometry.dispose(); g.earth.geometry = geo; g.vLL = vLL; g.vSph = vSph; g.NV = NV;
      if (g.tex) applyTexBand(g.tex, band);
      g.grat.ll = meridiansParallels(band); g.tiss.ll = tissotSegs(band);
      g.ctxSphere.visible = !!band; g.curBand = b;
    }
    g.pol.ll = polygonSegs(polyRef.current, band);
  }

  useEffect(() => {
    const g = G.current; if (!g) return;
    g.fnNow = proj.fn; g.tr = fitTransform(proj.fn, proj.fitLat, proj.band || 180);
    rebuildForBand(proj.band); buildOptics(proj); dirtyRef.current = true;
    /* eslint-disable-next-line */
  }, [projId]);
  useEffect(() => {
    const g = G.current; if (!g) return;
    const segs = polygonSegs(poly, projRef.current.band); g.pol.ll = segs;
    if (segs.length === 0) g.pol.geo.setPositions(new Float32Array(6)); // empty
    dirtyRef.current = true;
  }, [poly]);
  useEffect(() => { if (drawMode) { playRef.current = null; setUnfold(0); unfoldRef.current = 0; const g = G.current; if (g) g.angle = 0; dirtyRef.current = true; } }, [drawMode]);

  const playUnfold = () => { const from = unfoldRef.current > 0.5 ? 1 : 0; playRef.current = { from, to: from < 0.5 ? 1 : 0, start: performance.now(), dur: 2400 }; };

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
          <span className="sub">Unwrap the round Earth onto a flat map — see the projection light, the surface, and the stretch</span>
        </div>
        <span className="score-chip">{proj.name} · <b>{proj.prop}</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> The globe, unwrapping <small>&mdash; drag to orbit · scroll to zoom in</small></h2>
            <div className={`mp-stage ${drawMode ? 'draw' : ''}`} ref={mountRef}>
              <div className="mp-badge">{proj.name} · <b>{proj.family}</b></div>
              <div className="mp-hint">{drawMode ? 'click the globe to add polygon points' : 'drag = orbit · scroll = zoom in'}</div>
            </div>
            <div className="mp-unfold">
              <button className="mp-btn go" onClick={playUnfold}>▶ Unfold / re-wrap</button>
              <span>globe</span>
              <input ref={unfoldSliderRef} type="range" min="0" max="1" step="0.01" value={unfold} onChange={(e) => { playRef.current = null; const val = Number(e.target.value); unfoldRef.current = val; setUnfold(val); dirtyRef.current = true; }} />
              <span>flat map</span>
            </div>
            <div className="mp-tools">
              <button className={`mp-btn ${drawMode ? 'go' : ''}`} onClick={() => setDrawMode((d) => !d)}>{drawMode ? '✓ drawing — click globe' : '✎ draw polygon'}</button>
              <button className="mp-btn" onClick={() => setPoly([])}>clear</button>
              <button className="mp-btn" onClick={() => setPoly([[8, -18], [8, 38], [56, 38], [56, -18]])}>reset polygon</button>
            </div>
            <div className="mp-legend">
              <span><i className="mp-sw" style={{ background: '#cfe6ff' }} /> graticule (lat/lon grid)</span>
              <span><i className="mp-sw" style={{ background: '#ffb703' }} /> Tissot circles (distortion)</span>
              <span><i className="mp-sw" style={{ background: '#35d07f' }} /> your polygon</span>
              <span><i className="mp-sw" style={{ background: '#9fd0ff' }} /> developable surface + light rays</span>
            </div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">2</span> Choose a projection <small>&mdash; seven, four surfaces</small></h2>
            <div className="mp-projs">
              {PROJECTIONS.map((p) => (
                <button key={p.id} className={`mp-pbtn ${projId === p.id ? 'on' : ''}`} onClick={() => setProjId(p.id)}>
                  <b>{p.name}</b><span>{p.family} · {p.prop}</span>
                </button>
              ))}
            </div>
            <div className="mp-surface">
              <SurfaceIcon surface={proj.surface} />
              <div>
                <span className={`mp-prop ${proj.prop}`}>{proj.prop}</span>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#56677a', lineHeight: 1.5 }}>{proj.blurb}</p>
              </div>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <div><span>surface</span><b style={{ fontSize: 12 }}>{proj.family}</b></div>
              <div><span>preserves</span><b style={{ fontSize: 12 }}>{proj.prop}</b></div>
              <div><span>area @ polygon</span><b className={aCentroid > 1.6 || aCentroid < 0.62 ? 'orange' : ''}>{aCentroid.toFixed(2)}×</b></div>
              <div><span>area @ 60°</span><b className={a60 > 1.6 || a60 < 0.62 ? 'orange' : ''}>{a60.toFixed(2)}×</b></div>
            </div>
            <div className="equation">a light at the globe&rsquo;s centre casts each point onto the surface · area distortion = |det J| / cosφ (vs. equator): 1.00× true, &gt;1 enlarged, &lt;1 shrunk</div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">3</span> Why it matters</h2>
            <div className="rect-summary">
              <b>You can flatten the sphere, but not for free</b>
              <p>
                Wrap a <b>cylinder</b>, <b>cone</b> or <b>plane</b> around the globe, shine a light from the centre, and trace the
                shadows of the graticule onto it — then unroll it flat. Where the surface <b>touches</b> the globe distortion is
                near zero; it grows with distance from that line or point. A projection can keep <b>shape</b> (conformal — Mercator,
                UTM, Lambert), <b>area</b> (equal-area — Mollweide, Albers) or <b>distance</b> from a point (equidistant), but never
                all at once. Watch the <b>Tissot circles</b>: conformal maps keep them circular yet swell them with latitude;
                equal-area maps hold their area but squash them into ellipses. <b>UTM</b> shows why we cut the world into narrow
                zones — the transverse cylinder is almost perfect near its central meridian and hopeless far from it. Draw your own
                <b> polygon</b> and switch projections to watch the same region stretch, shear and change size.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function SurfaceIcon({ surface }) {
  const s = { width: 96, height: 96 };
  if (surface === 'cylinder') return (
    <svg {...s} viewBox="0 0 96 96" aria-label="cylinder around globe">
      <ellipse cx="48" cy="48" rx="26" ry="26" fill="rgba(21,101,192,.12)" stroke="#7fa8d0" strokeWidth="2" />
      <ellipse cx="48" cy="48" rx="30" ry="40" fill="none" stroke="#e0a800" strokeWidth="2.5" />
      <line x1="18" y1="48" x2="78" y2="48" stroke="#0f8a4d" strokeWidth="2.5" />
      <circle cx="48" cy="48" r="2.5" fill="#ffcf4d" /><line x1="48" y1="48" x2="70" y2="34" stroke="#ffcf4d" strokeWidth="1.2" />
    </svg>
  );
  if (surface === 'cylinderT') return (
    <svg {...s} viewBox="0 0 96 96" aria-label="transverse cylinder">
      <ellipse cx="48" cy="48" rx="26" ry="26" fill="rgba(21,101,192,.12)" stroke="#7fa8d0" strokeWidth="2" />
      <ellipse cx="48" cy="48" rx="40" ry="30" fill="none" stroke="#e0a800" strokeWidth="2.5" />
      <line x1="48" y1="18" x2="48" y2="78" stroke="#0f8a4d" strokeWidth="2.5" />
      <circle cx="48" cy="48" r="2.5" fill="#ffcf4d" />
    </svg>
  );
  if (surface === 'cone') return (
    <svg {...s} viewBox="0 0 96 96" aria-label="cone on globe">
      <ellipse cx="48" cy="54" rx="24" ry="24" fill="rgba(15,138,77,.12)" stroke="#7fa8d0" strokeWidth="2" />
      <path d="M48 6 L82 74 L14 74 Z" fill="none" stroke="#e0a800" strokeWidth="2.5" />
      <line x1="22" y1="47" x2="74" y2="47" stroke="#0f8a4d" strokeWidth="2.5" />
      <circle cx="48" cy="54" r="2.5" fill="#ffcf4d" />
    </svg>
  );
  return (
    <svg {...s} viewBox="0 0 96 96" aria-label="plane at pole">
      <ellipse cx="48" cy="56" rx="24" ry="24" fill="rgba(232,141,0,.10)" stroke="#7fa8d0" strokeWidth="2" />
      <line x1="10" y1="30" x2="86" y2="30" stroke="#e0a800" strokeWidth="2.5" />
      <circle cx="48" cy="30" r="3.5" fill="#0f8a4d" />
      <circle cx="48" cy="56" r="2.5" fill="#ffcf4d" /><line x1="48" y1="56" x2="48" y2="30" stroke="#ffcf4d" strokeWidth="1.2" />
    </svg>
  );
}
