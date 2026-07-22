import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './sfm.css';
import {
  buildScene, initialCameras, solve, project, MESH,
  INTRINSICS, NUM_CAMERAS, ANCHOR_COUNT, helpers,
} from './sfmSolver.js';

const { sub, add, scale, lookAt, matVec, normalize, dot } = helpers;

const VIEW_W = 640;
const VIEW_H = 520;
const LIGHT = normalize([-0.3, -0.55, 0.9]);

// Unique undirected edges of the house mesh, for drawing the reconstruction.
const EDGES = (() => {
  const set = new Set();
  const out = [];
  MESH.faces.forEach((f) => {
    for (let i = 0; i < f.idx.length; i += 1) {
      const a = f.idx[i]; const b = f.idx[(i + 1) % f.idx.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!set.has(key)) { set.add(key); out.push([a, b]); }
    }
  });
  return out;
})();

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shadeColor(hex, s, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${Math.round(r * s)},${Math.round(g * s)},${Math.round(b * s)},${alpha})`;
}

// Draw the house mesh with a given projector + eye position (painter's order,
// back-face culled, Lambert-shaded). Used for both the photos and the 3D view.
function drawMesh(ctx, proj, eye, alpha, edgeColor) {
  const faces = MESH.faces.map((f) => {
    const depth = helpers.norm(sub(f.centroid, eye));
    const front = dot(f.normal, sub(eye, f.centroid)) > 0;
    return { f, depth, front };
  }).sort((a, b) => b.depth - a.depth);
  faces.forEach(({ f, front }) => {
    if (!front) return;
    const pts = f.idx.map((i) => proj(MESH.vertices[i]));
    if (pts.some((p) => !p)) return;
    const s = 0.35 + 0.65 * Math.max(0, dot(f.normal, LIGHT));
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fillStyle = shadeColor(f.color, s, alpha);
    ctx.fill();
    ctx.strokeStyle = edgeColor; ctx.lineWidth = 1; ctx.stroke();
  });
}

// ---------------------------------------------------------------------------
// One photograph: a rendered view of the house from a camera, with detected
// corners overlaid and the learner's matches highlighted.
// ---------------------------------------------------------------------------
function renderPhoto(canvas, scene, ci, activeId, assigned, hoverId, reveal) {
  const ctx = canvas.getContext('2d');
  const { width, height } = INTRINSICS;
  const cam = scene.cameras[ci];
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#243447'); g.addColorStop(1, '#151f2b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  // ground plane hint
  ctx.fillStyle = 'rgba(20,30,40,.55)';
  const gp = [[-9, -9, 0], [9, -9, 0], [9, 9, 0], [-9, 9, 0]].map((X) => project(cam, X));
  if (gp.every((p) => p)) { ctx.beginPath(); gp.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); }

  const proj = (X) => project(cam, X);
  drawMesh(ctx, proj, cam.t, 1, 'rgba(20,14,10,.5)');

  const pixels = scene.keypointPixels[ci];
  const camAssign = assigned[ci] || {};
  // reveal: faint ring on the active feature's true corner
  if (reveal && pixels[activeId]) {
    const [u, v] = pixels[activeId];
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(u, v, 9, 0, Math.PI * 2); ctx.stroke();
  }
  scene.keypoints.forEach((kp) => {
    const px = pixels[kp.id];
    if (!px) return;
    const [u, v] = px;
    const assignedTo = camAssign[kp.id]; // featureId this corner is matched to, if any
    const isActiveMatch = assignedTo === activeId;
    if (assignedTo != null) {
      const wrong = assignedTo !== kp.id;
      ctx.beginPath(); ctx.arc(u, v, isActiveMatch ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = scene.keypoints[assignedTo].color; ctx.fill();
      ctx.strokeStyle = isActiveMatch ? '#fff' : 'rgba(255,255,255,.6)';
      ctx.lineWidth = isActiveMatch ? 2 : 1; ctx.stroke();
      if (wrong) { ctx.strokeStyle = '#ff3b30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(u - 4, v - 4); ctx.lineTo(u + 4, v + 4); ctx.moveTo(u + 4, v - 4); ctx.lineTo(u - 4, v + 4); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.arc(u, v, hoverId === kp.id ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = hoverId === kp.id ? '#fff' : 'rgba(180,200,220,.7)'; ctx.fill();
    }
  });
}

// ---------------------------------------------------------------------------
// 3D reconstruction view.
// ---------------------------------------------------------------------------
function makeProjector(orbit) {
  const center = MESH.center;
  const ca = Math.cos(orbit.az); const sa = Math.sin(orbit.az);
  const ce = Math.cos(orbit.el); const se = Math.sin(orbit.el);
  const eye = [center[0] + orbit.dist * ce * sa, center[1] - orbit.dist * ce * ca, center[2] + orbit.dist * se];
  const R = lookAt(eye, center, [0, 0, 1]);
  const f = VIEW_W * 0.85;
  const proj = (X) => {
    const Xc = matVec(R, sub(X, eye));
    if (Xc[2] <= 0.15) return null;
    return [VIEW_W / 2 + f * Xc[0] / Xc[2], VIEW_H / 2 + f * Xc[1] / Xc[2], Xc[2]];
  };
  return { proj, eye };
}

function frustumCorners(cam, L) {
  return [[0, 0], [INTRINSICS.width, 0], [INTRINSICS.width, INTRINSICS.height], [0, INTRINSICS.height]].map(([u, v]) => {
    const dirCam = normalize([(u - INTRINSICS.cx) / INTRINSICS.f, (v - INTRINSICS.cy) / INTRINSICS.f, 1]);
    return add(cam.t, scale(helpers.matTVec(cam.R, dirCam), L));
  });
}
function line(ctx, p, q, color, w = 1) { if (!p || !q) return; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); }
function drawFrustum(ctx, proj, cam, color, fill, L) {
  const apex = proj(cam.t);
  const corners = frustumCorners(cam, L).map(proj);
  if (!apex || corners.some((c) => !c)) return;
  ctx.fillStyle = fill; ctx.beginPath();
  corners.forEach((c, i) => (i ? ctx.lineTo(c[0], c[1]) : ctx.moveTo(c[0], c[1])));
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 4; i += 1) { line(ctx, apex, corners[i], color, 1.4); line(ctx, corners[i], corners[(i + 1) % 4], color, 1.4); }
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(apex[0], apex[1], 3.4, 0, Math.PI * 2); ctx.fill();
}

function render3D(canvas, scene, solution, orbit, showTruth) {
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#111d29'); g.addColorStop(1, '#0a1119');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const { proj, eye } = makeProjector(orbit);

  for (let x = -12; x <= 12; x += 3) {
    line(ctx, proj([x, -12, 0]), proj([x, 12, 0]), 'rgba(90,120,150,.14)');
    line(ctx, proj([-12, x, 0]), proj([12, x, 0]), 'rgba(90,120,150,.14)');
  }
  if (showTruth) drawMesh(ctx, proj, eye, 0.5, 'rgba(30,20,14,.5)');

  // Reconstructed structure (edges + colored points, with error links to truth).
  EDGES.forEach(([a, b]) => {
    const pa = solution.points[a]; const pb = solution.points[b];
    if (pa && pb) line(ctx, proj(pa), proj(pb), 'rgba(126,211,33,.6)', 1.6);
  });

  solution.cameras.forEach((cam, i) => {
    const gt = scene.cameras[i];
    if (showTruth && !cam.anchored) drawFrustum(ctx, proj, gt, 'rgba(150,175,200,.32)', 'rgba(150,175,200,.04)', 2.6);
    let color = '#2ec6a8'; let fill = 'rgba(46,198,168,.10)';
    if (cam.anchored) { color = '#f5a623'; fill = 'rgba(245,166,35,.12)'; }
    else if (!cam.reliable) { color = '#e6463b'; fill = 'rgba(230,70,59,.10)'; }
    drawFrustum(ctx, proj, cam, color, fill, 2.8);
    if (!cam.anchored && cam.reliable) line(ctx, proj(cam.t), proj(gt.t), 'rgba(46,198,168,.5)', 1);
  });

  scene.keypoints.forEach((kp) => {
    const truth = proj(kp.pos);
    if (showTruth && truth) { ctx.strokeStyle = 'rgba(180,200,220,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(truth[0], truth[1], 3.4, 0, Math.PI * 2); ctx.stroke(); }
    const rec = solution.points[kp.id];
    if (rec) {
      const p = proj(rec);
      if (p) {
        if (truth) line(ctx, p, truth, 'rgba(230,70,59,.5)', 1);
        ctx.fillStyle = kp.color; ctx.beginPath(); ctx.arc(p[0], p[1], 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  });
}

// ---------------------------------------------------------------------------
const SEED = 7;

export default function StructureFromMotion() {
  const [noisePx, setNoisePx] = useState(0.5);
  const scene = useMemo(() => buildScene(SEED, noisePx), [noisePx]);
  const initCams = useMemo(() => initialCameras(scene), [scene]);

  // matches[featureId][camIndex] = vertexId the learner clicked as the match.
  const [matches, setMatches] = useState({});
  const [activeId, setActiveId] = useState(0);
  const [hover, setHover] = useState(null); // { ci, vertexId }
  const [reveal, setReveal] = useState(false);
  const [orbit, setOrbit] = useState({ az: 0.7, el: 0.5, dist: 42 });
  const [showTruth, setShowTruth] = useState(true);

  const view3dRef = useRef(null);
  const photoRefs = useRef([]);
  const drag = useRef(null);

  // camera -> { vertexId -> featureId } assignment, derived from matches.
  const assigned = useMemo(() => {
    const out = {};
    Object.keys(matches).forEach((fid) => {
      const per = matches[fid];
      Object.keys(per).forEach((ci) => {
        (out[ci] = out[ci] || {})[per[ci]] = Number(fid);
      });
    });
    return out;
  }, [matches]);

  // Build solver tracks from the matches (pixels of the clicked corners).
  const tracks = useMemo(() => scene.keypoints.map((kp) => {
    const per = matches[kp.id];
    if (!per) return null;
    const obs = {};
    Object.keys(per).forEach((ci) => { const px = scene.keypointPixels[ci][per[ci]]; if (px) obs[ci] = px; });
    return Object.keys(obs).length ? { featureId: kp.id, obs } : null;
  }).filter(Boolean), [scene, matches]);

  const solution = useMemo(() => solve(scene, tracks, initCams), [scene, tracks, initCams]);

  useEffect(() => { render3D(view3dRef.current, scene, solution, orbit, showTruth); }, [scene, solution, orbit, showTruth]);
  useEffect(() => {
    scene.cameras.forEach((_, i) => renderPhoto(photoRefs.current[i], scene, i, activeId, assigned, hover && hover.ci === i ? hover.vertexId : null, reveal));
  }, [scene, activeId, assigned, hover, reveal]);

  const nearestCorner = (ci, e) => {
    const canvas = photoRefs.current[ci];
    const r = canvas.getBoundingClientRect();
    const x = (e.clientX - r.left) * INTRINSICS.width / r.width;
    const y = (e.clientY - r.top) * INTRINSICS.height / r.height;
    const pixels = scene.keypointPixels[ci];
    let best = null; let bestD = 13;
    scene.keypoints.forEach((kp) => { const px = pixels[kp.id]; if (!px) return; const d = Math.hypot(px[0] - x, px[1] - y); if (d < bestD) { bestD = d; best = kp.id; } });
    return best;
  };

  const onPhotoClick = (ci) => (e) => {
    const vid = nearestCorner(ci, e);
    if (vid == null) return;
    setMatches((prev) => {
      const per = { ...(prev[activeId] || {}) };
      if (per[ci] === vid) delete per[ci]; else per[ci] = vid;
      return { ...prev, [activeId]: per };
    });
  };
  const onPhotoMove = (ci) => (e) => {
    const vid = nearestCorner(ci, e);
    setHover((h) => (h && h.ci === ci && h.vertexId === vid ? h : (vid == null ? null : { ci, vertexId: vid })));
  };

  const autoMatchActive = () => setMatches((prev) => {
    const per = { ...(prev[activeId] || {}) };
    scene.cameras.forEach((_, ci) => { if (scene.keypointPixels[ci][activeId]) per[ci] = activeId; });
    return { ...prev, [activeId]: per };
  });
  const autoMatchAll = () => {
    const next = {};
    scene.keypoints.forEach((kp) => { const per = {}; scene.cameras.forEach((_, ci) => { if (scene.keypointPixels[ci][kp.id]) per[ci] = kp.id; }); next[kp.id] = per; });
    setMatches(next);
  };

  const onDown = (e) => { drag.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x; const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    setOrbit((o) => ({ ...o, az: o.az + dx * 0.008, el: Math.max(-0.15, Math.min(1.4, o.el + dy * 0.006)) }));
  };
  const onUp = () => { drag.current = null; };
  const onWheel = (e) => { setOrbit((o) => ({ ...o, dist: Math.max(24, Math.min(70, o.dist + e.deltaY * 0.04)) })); };

  const m = solution.metrics;
  const totalMatches = Object.values(matches).reduce((n, per) => n + Object.keys(per).length, 0);
  const wrongMatches = Object.keys(matches).reduce((n, fid) => n + Object.keys(matches[fid]).filter((ci) => matches[fid][ci] !== Number(fid)).length, 0);
  const activeCount = matches[activeId] ? Object.keys(matches[activeId]).length : 0;

  let quality = 'idle';
  let qualityText = 'Pick a corner below, then click that same corner in each photo. Match a handful of corners and the cameras will lock into place.';
  if (totalMatches > 0 && m.localised === 0) { quality = 'warn'; qualityText = `${totalMatches} match${totalMatches === 1 ? '' : 'es'} so far — a camera needs four or more matched corners before its pose can be solved. Keep matching.`; }
  else if (m.localised === m.totalToLocalise && wrongMatches === 0) { quality = 'good'; qualityText = `All ${m.totalToLocalise} unknown cameras solved from your matches — pose error ${m.poseError.toFixed(2)} m. More correct matches keep averaging out detector noise.`; }
  else if (wrongMatches > 0) { quality = 'warn'; qualityText = `${wrongMatches} mismatched corner${wrongMatches === 1 ? '' : 's'} (red ✕) are inconsistent with the geometry and are pulling cameras off — notice the reprojection error. Fix them for a clean solve.`; }
  else if (m.localised > 0) { quality = 'warn'; qualityText = `${m.localised} of ${m.totalToLocalise} cameras solved. The rest still lack four confident matches.`; }

  const fmt = (v, unit) => (v == null ? '—' : `${v.toFixed(2)}${unit}`);
  const active = scene.keypoints[activeId];

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Structure from Motion <span className="native-badge">Native React</span></h1>
          <span className="sub">Match the same corner of a 3D object across photos &rarr; recover every camera&rsquo;s position &amp; orientation</span>
        </div>
        <span className="score-chip">Cameras solved: <b>{m.localised}/{m.totalToLocalise}</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> Choose a feature to match</h2>
            <div className="sfm-palette">
              {scene.keypoints.map((kp) => {
                const cnt = matches[kp.id] ? Object.keys(matches[kp.id]).length : 0;
                return (
                  <button key={kp.id} className={`sfm-chip ${activeId === kp.id ? 'on' : ''}`} onClick={() => setActiveId(kp.id)}>
                    <span className="sfm-swatch" style={{ background: kp.color }} />
                    <span className="sfm-chip-text"><b>{kp.label}</b><small>{cnt ? `matched ×${cnt}` : 'unmatched'}</small></span>
                  </button>
                );
              })}
            </div>
            <p className="sfm-hint">
              Active feature: <span className="sfm-swatch inline" style={{ background: active.color }} /> <b>{active.label}</b> &mdash; matched in <b>{activeCount}</b> photo{activeCount === 1 ? '' : 's'}.
              Click it in the photos below (click again to remove).
            </p>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">2</span> The photographs <small>&mdash; #1 &amp; #2 are the known reference pair</small></h2>
            <div className="sfm-gallery">
              {scene.cameras.map((cam, i) => {
                const est = solution.cameras[i];
                const cls = est.anchored ? 'ref' : est.reliable ? 'solved' : 'lost';
                const state = est.anchored ? 'REF' : est.reliable ? 'SOLVED' : 'unsolved';
                const count = Object.keys(assigned[i] || {}).length;
                return (
                  <div className={`sfm-shot ${cls}`} key={i}>
                    <span className="sfm-shot-tag">#{i + 1} · {state}</span>
                    <span className="sfm-shot-count">{count} matched</span>
                    <canvas
                      ref={(el) => { photoRefs.current[i] = el; }}
                      width={INTRINSICS.width}
                      height={INTRINSICS.height}
                      onClick={onPhotoClick(i)}
                      onMouseMove={onPhotoMove(i)}
                      onMouseLeave={() => setHover(null)}
                    />
                  </div>
                );
              })}
            </div>
            <div className="sfm-actions">
              <button className="sfm-btn" onClick={autoMatchActive}>Auto-match this feature</button>
              <button className="sfm-btn primary" onClick={autoMatchAll}>Auto-match everything (demo)</button>
              <button className="sfm-btn" onClick={() => setMatches({})}>Clear</button>
              <label className="sfm-inline-check"><input type="checkbox" checked={reveal} onChange={(e) => setReveal(e.target.checked)} /> reveal correct corner</label>
            </div>
            <div className={`sfm-quality ${quality}`}>{qualityText}</div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">3</span> Recovered cameras &amp; 3D object <small>&mdash; drag to orbit, scroll to zoom</small></h2>
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
              <span><i className="sfm-bar" style={{ background: '#e6463b' }} /> unsolved (rough guess)</span>
              <span><i className="sfm-dot" style={{ background: '#7ed321' }} /> reconstructed corner</span>
              <span><i className="sfm-dot" style={{ border: '1px solid #aab', background: 'transparent' }} /> ground truth</span>
            </div>
            <div className="sfm-toolbar">
              <label><input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} /> show ground truth</label>
              <label>detector noise
                <input type="range" min="0" max="2" step="0.1" value={noisePx} onChange={(e) => setNoisePx(Number(e.target.value))} />
                <b style={{ fontFamily: 'monospace' }}>{noisePx.toFixed(1)} px</b>
              </label>
              <button className="sfm-btn" onClick={() => setOrbit({ az: 0.7, el: 0.5, dist: 42 })}>reset view</button>
            </div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">4</span> Reconstruction quality</h2>
            <div className="readouts">
              <div><span>matches</span><b>{totalMatches}{wrongMatches ? <em className="orange"> ({wrongMatches}✕)</em> : ''}</b></div>
              <div><span>cameras solved</span><b>{m.localised}/{m.totalToLocalise}</b></div>
              <div><span>reproj. error</span><b className={m.reproError > 1.5 ? 'orange' : ''}>{fmt(m.reproError, ' px')}</b></div>
              <div><span>pose error</span><b className={m.poseError > 0.8 ? 'orange' : ''}>{fmt(m.poseError, ' m')}</b></div>
            </div>
            <div className="rect-summary">
              <b>How Structure from Motion works here</b>
              <p>
                Every match is a ray from a camera through a corner of the object. Where rays from the two known
                reference cameras cross, that corner is <b>triangulated</b> in 3D. Once four or more triangulated corners
                are matched in an unknown photo, that camera&rsquo;s position and orientation are recovered by
                <b> resection</b> — and each newly placed camera helps triangulate more corners. Repeating this bundles
                every photo into one consistent reconstruction; a wrong match injects an inconsistent ray and pulls the
                cameras away from the truth.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
