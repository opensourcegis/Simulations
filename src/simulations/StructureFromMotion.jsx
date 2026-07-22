import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './sfm.css';
import {
  buildScene, initialCameras, solve, project, INTRINSICS, NUM_CAMERAS, ANCHOR_COUNT, helpers,
} from './sfmSolver.js';

const { sub, add, scale, lookAt, matVec, normalize, matTVec } = helpers;

// Edges of the stylised "monument" so both the truth and the reconstruction
// read as a recognisable little building in the 3D view.
const EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0], // base ring
  [4, 5], [5, 6], [6, 7], [7, 4], // eave ring
  [0, 4], [1, 5], [2, 6], [3, 7], // walls
  [4, 8], [5, 8], [6, 8], [7, 8], // roof
];

const VIEW_W = 640;
const VIEW_H = 540;

// ---------------------------------------------------------------------------
// 3D orbit projector: eye orbits the scene centre, looking inward.
// ---------------------------------------------------------------------------
function makeProjector(orbit) {
  const center = [0, 0, 1.8];
  const ca = Math.cos(orbit.az); const sa = Math.sin(orbit.az);
  const ce = Math.cos(orbit.el); const se = Math.sin(orbit.el);
  const eye = [center[0] + orbit.dist * ce * sa, center[1] - orbit.dist * ce * ca, center[2] + orbit.dist * se];
  const R = lookAt(eye, center, [0, 0, 1]);
  const f = VIEW_W * 0.82;
  return (X) => {
    const Xc = matVec(R, sub(X, eye));
    if (Xc[2] <= 0.15) return null;
    return [VIEW_W / 2 + f * Xc[0] / Xc[2], VIEW_H / 2 + f * Xc[1] / Xc[2], Xc[2]];
  };
}

// World-space frustum corners for a camera, pushed out to distance L.
function frustumCorners(cam, L) {
  const cornersPx = [[0, 0], [INTRINSICS.width, 0], [INTRINSICS.width, INTRINSICS.height], [0, INTRINSICS.height]];
  return cornersPx.map(([u, v]) => {
    const dirCam = normalize([(u - INTRINSICS.cx) / INTRINSICS.f, (v - INTRINSICS.cy) / INTRINSICS.f, 1]);
    return add(cam.t, scale(matTVec(cam.R, dirCam), L));
  });
}

function line(ctx, p, q, color, width = 1) {
  if (!p || !q) return;
  ctx.strokeStyle = color; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
}

function drawFrustum(ctx, proj, cam, color, fill, L) {
  const apex = proj(cam.t);
  const corners = frustumCorners(cam, L).map(proj);
  if (!apex || corners.some((c) => !c)) return;
  ctx.fillStyle = fill;
  ctx.beginPath();
  corners.forEach((c, i) => (i ? ctx.lineTo(c[0], c[1]) : ctx.moveTo(c[0], c[1])));
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 4; i += 1) {
    line(ctx, apex, corners[i], color, 1.4);
    line(ctx, corners[i], corners[(i + 1) % 4], color, 1.4);
  }
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(apex[0], apex[1], 3.2, 0, Math.PI * 2); ctx.fill();
}

function render3D(canvas, scene, solution, orbit, opts) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#111d29'); g.addColorStop(1, '#0a1119');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const proj = makeProjector(orbit);

  // Ground grid (z = 0).
  ctx.lineWidth = 1;
  for (let x = -12; x <= 12; x += 3) {
    line(ctx, proj([x, -12, 0]), proj([x, 12, 0]), 'rgba(90,120,150,.16)');
    line(ctx, proj([-12, x, 0]), proj([12, x, 0]), 'rgba(90,120,150,.16)');
  }

  // Ground-truth building wireframe (faint) — the target structure.
  if (opts.showTruth) {
    EDGES.forEach(([a, b]) => line(ctx, proj(scene.points[a].pos), proj(scene.points[b].pos), 'rgba(150,175,200,.28)', 1));
  }
  // Reconstructed wireframe from triangulated points.
  EDGES.forEach(([a, b]) => {
    const pa = solution.points[a]; const pb = solution.points[b];
    if (pa && pb) line(ctx, proj(pa), proj(pb), 'rgba(126,211,33,.55)', 1.6);
  });

  // Camera frustums.
  solution.cameras.forEach((cam, i) => {
    const gt = scene.cameras[i];
    if (opts.showTruth && !cam.anchored) {
      drawFrustum(ctx, proj, gt, 'rgba(150,175,200,.35)', 'rgba(150,175,200,.05)', 2.4);
    }
    let color = '#2ec6a8'; let fill = 'rgba(46,198,168,.10)';
    if (cam.anchored) { color = '#f5a623'; fill = 'rgba(245,166,35,.12)'; }
    else if (!cam.reliable) { color = '#e6463b'; fill = 'rgba(230,70,59,.10)'; }
    drawFrustum(ctx, proj, cam, color, fill, 2.6);
    // Residual line: estimated -> ground-truth centre.
    if (!cam.anchored && cam.reliable) {
      line(ctx, proj(cam.t), proj(gt.t), 'rgba(46,198,168,.5)', 1);
    }
  });

  // Feature points: hollow truth marker + filled reconstruction + error link.
  scene.points.forEach((pt) => {
    const truth = proj(pt.pos);
    if (opts.showTruth && truth) {
      ctx.strokeStyle = 'rgba(170,190,210,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(truth[0], truth[1], 3.5, 0, Math.PI * 2); ctx.stroke();
    }
    const rec = solution.points[pt.id];
    if (rec) {
      const p = proj(rec);
      if (p) {
        if (truth) line(ctx, p, truth, 'rgba(230,70,59,.5)', 1);
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(p[0], p[1], 4, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// One of the ten source images.
// ---------------------------------------------------------------------------
function renderShot(canvas, scene, camIndex, selected) {
  const ctx = canvas.getContext('2d');
  const { width, height } = INTRINSICS;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(90,120,150,.14)'; ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 0; y <= height; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

  const obs = scene.observations[camIndex];
  scene.points.forEach((pt) => {
    const uv = obs[pt.id];
    if (!uv) return;
    const on = selected.has(pt.id);
    ctx.beginPath(); ctx.arc(uv[0], uv[1], on ? 5 : 3, 0, Math.PI * 2);
    ctx.fillStyle = on ? pt.color : 'rgba(150,170,190,.5)';
    ctx.fill();
    if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); }
  });
}

const SEED = 7;

export default function StructureFromMotion() {
  const [noisePx, setNoisePx] = useState(0.5);
  const scene = useMemo(() => buildScene(SEED, noisePx), [noisePx]);
  const initCams = useMemo(() => initialCameras(scene), [scene]);

  const strongIds = useMemo(() => scene.points.filter((p) => p.quality === 'strong').map((p) => p.id), [scene]);
  const [selected, setSelected] = useState(() => new Set([0, 1, 2, 4, 8]));
  const [orbit, setOrbit] = useState({ az: 0.7, el: 0.5, dist: 34 });
  const [showTruth, setShowTruth] = useState(true);

  const solution = useMemo(() => solve(scene, [...selected], initCams), [scene, selected, initCams]);

  const view3dRef = useRef(null);
  const shotRefs = useRef([]);
  const drag = useRef(null);

  const toggle = useCallback((id) => {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);

  // View counts per feature (how many of the 10 images see it).
  const viewCounts = useMemo(() => scene.points.map((pt) => scene.observations.reduce((n, o) => n + (o[pt.id] ? 1 : 0), 0)), [scene]);

  useEffect(() => { render3D(view3dRef.current, scene, solution, orbit, { showTruth }); }, [scene, solution, orbit, showTruth]);
  useEffect(() => { scene.cameras.forEach((_, i) => renderShot(shotRefs.current[i], scene, i, selected)); }, [scene, selected]);

  const onShotClick = (camIndex) => (e) => {
    const canvas = shotRefs.current[camIndex];
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * INTRINSICS.width / r.width;
    const y = (e.clientY - r.top) * INTRINSICS.height / r.height;
    const obs = scene.observations[camIndex];
    let best = null; let bestD = 11;
    scene.points.forEach((pt) => {
      const uv = obs[pt.id]; if (!uv) return;
      const d = Math.hypot(uv[0] - x, uv[1] - y);
      if (d < bestD) { bestD = d; best = pt.id; }
    });
    if (best !== null) toggle(best);
  };

  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setOrbit((o) => ({ ...o, az: o.az + dx * 0.008, el: Math.max(-0.2, Math.min(1.35, o.el + dy * 0.006)) }));
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e) => { setOrbit((o) => ({ ...o, dist: Math.max(18, Math.min(60, o.dist + e.deltaY * 0.03)) })); };

  const m = solution.metrics;
  const enough = m.localised === m.totalToLocalise;
  const hasAmbiguous = [...selected].some((id) => scene.points[id].quality === 'ambiguous');
  let quality = 'idle'; let qualityText = 'Select at least four distinctive features that every camera can see, then the images will find their positions.';
  if (m.localised === 0 && selected.size > 0) {
    quality = 'warn';
    qualityText = `Only ${selected.size} feature${selected.size === 1 ? '' : 's'} selected — a camera needs four or more matched points to be resected. Add more.`;
  } else if (enough && hasAmbiguous) {
    quality = 'warn';
    qualityText = 'All cameras localised, but ambiguous "repeated-texture" features are injecting mismatches — notice the higher reprojection error. Deselect them for a cleaner solve.';
  } else if (enough) {
    quality = 'good';
    qualityText = `All ${m.totalToLocalise} free cameras localised. Adding more well-spread, distinctive features keeps averaging out detector noise — pose error is down to ${m.poseError.toFixed(2)} m.`;
  } else if (m.localised > 0) {
    quality = 'warn';
    qualityText = `${m.localised} of ${m.totalToLocalise} cameras localised. Some cameras still lack four confident matches.`;
  }

  const fmt = (v, unit) => (v == null ? '—' : `${v.toFixed(2)}${unit}`);

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Structure from Motion <span className="native-badge">Native React</span></h1>
          <span className="sub">Pick matching features across ten photos &rarr; recover every camera&rsquo;s position &amp; orientation in 3D</span>
        </div>
        <span className="score-chip">Localised: <b>{m.localised}/{m.totalToLocalise}</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> The ten photographs <small>&mdash; click a dot to match / unmatch that feature</small></h2>
            <div className="sfm-gallery">
              {scene.cameras.map((cam, i) => {
                const est = solution.cameras[i];
                const state = est.anchored ? 'REF' : est.reliable ? 'SET' : '?';
                return (
                  <div className={`sfm-shot ${est.anchored ? 'ref' : est.reliable ? 'solved' : 'lost'}`} key={i}>
                    <span className="sfm-shot-tag">#{i + 1} {state}</span>
                    <canvas
                      ref={(el) => { shotRefs.current[i] = el; }}
                      width={INTRINSICS.width}
                      height={INTRINSICS.height}
                      onClick={onShotClick(i)}
                    />
                  </div>
                );
              })}
            </div>
            <p style={{ margin: '9px 0 0', fontSize: 12, color: '#7d8fa1' }}>
              <b>#1</b> and <b>#2</b> are reference cameras (known pose). The rest start with an unknown, rough guess and are solved from your matches.
            </p>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">2</span> Feature catalogue <small>&mdash; which detections to trust as tie points</small></h2>
            <div className="sfm-actions">
              <button className="sfm-btn primary" onClick={() => setSelected(new Set(strongIds))}>Select all strong</button>
              <button className="sfm-btn" onClick={() => setSelected(new Set(scene.points.map((p) => p.id)))}>Select every detection</button>
              <button className="sfm-btn" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
            <div className="sfm-features">
              {scene.points.map((pt) => (
                <button className={`sfm-feat ${selected.has(pt.id) ? 'on' : ''}`} key={pt.id} onClick={() => toggle(pt.id)}>
                  <span className="sfm-swatch" style={{ background: pt.color }} />
                  <b>{pt.label}</b>
                  <span className="sfm-meta">
                    <span className={`sfm-badge ${pt.quality}`}>{pt.quality}</span>
                    <span className="sfm-views">seen in {viewCounts[pt.id]}/{NUM_CAMERAS}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className={`sfm-quality ${quality}`}>{qualityText}</div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">3</span> Recovered 3D scene <small>&mdash; drag to orbit, scroll to zoom</small></h2>
            <canvas
              ref={view3dRef}
              className="sfm-view3d"
              width={VIEW_W}
              height={VIEW_H}
              onMouseDown={onDown}
              onMouseMove={onMove}
              onMouseUp={onUp}
              onMouseLeave={onUp}
              onWheel={onWheel}
            />
            <div className="sfm-legend">
              <span><i className="sfm-bar" style={{ background: '#f5a623' }} /> reference camera</span>
              <span><i className="sfm-bar" style={{ background: '#2ec6a8' }} /> solved camera</span>
              <span><i className="sfm-bar" style={{ background: '#e6463b' }} /> not localised</span>
              <span><i className="sfm-dot" style={{ background: '#7ed321' }} /> reconstructed point</span>
              <span><i className="sfm-dot" style={{ border: '1px solid #aab', background: 'transparent' }} /> ground truth</span>
            </div>
            <div className="sfm-toolbar">
              <label><input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} /> show ground truth</label>
              <label>detector noise
                <input type="range" min="0" max="2" step="0.1" value={noisePx} onChange={(e) => setNoisePx(Number(e.target.value))} />
                <b style={{ fontFamily: 'monospace' }}>{noisePx.toFixed(1)} px</b>
              </label>
              <button className="sfm-btn" onClick={() => setOrbit({ az: 0.7, el: 0.5, dist: 34 })}>reset view</button>
            </div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">4</span> Reconstruction quality</h2>
            <div className="readouts">
              <div><span>tie points</span><b>{selected.size}</b></div>
              <div><span>cameras set</span><b>{m.localised}/{m.totalToLocalise}</b></div>
              <div><span>reproj. error</span><b className={m.reproError > 1 ? 'orange' : ''}>{fmt(m.reproError, ' px')}</b></div>
              <div><span>pose error</span><b className={m.poseError > 0.6 ? 'orange' : ''}>{fmt(m.poseError, ' m')}</b></div>
            </div>
            <div className="rect-summary">
              <b>How Structure from Motion works here</b>
              <p>
                Each matched feature is a ray from a camera into the world. Where rays from two known cameras cross, a 3D
                point is <b>triangulated</b>. Once four or more of those points are visible in an unknown photo, the camera&rsquo;s
                position and orientation are recovered by <b>resection</b> — and the newly placed camera helps triangulate more
                points. Repeating this bundle drives every image into a single, consistent 3D reconstruction.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
