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

// Unique undirected edges of the house corners, for drawing the reconstruction.
const EDGES = (() => {
  const set = new Set(); const out = [];
  MESH.faces.forEach((f) => {
    for (let i = 0; i < f.idx.length; i += 1) {
      const a = f.idx[i]; const b = f.idx[(i + 1) % f.idx.length];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!set.has(key)) { set.add(key); out.push([a, b]); }
    }
  });
  return out;
})();

function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function shadeColor(hex, s, alpha = 1) { const [r, g, b] = hexToRgb(hex); return `rgba(${Math.round(r * s)},${Math.round(g * s)},${Math.round(b * s)},${alpha})`; }

// Draw the house (structural faces + painted door/windows), painter-ordered,
// back-face culled, Lambert-shaded. Used for both the photos and the 3D view.
function drawMesh(ctx, proj, eye, alpha, edgeColor) {
  const faces = MESH.drawFaces.map((f) => ({
    f,
    depth: helpers.norm(sub(f.centroid, eye)),
    front: dot(f.normal, sub(eye, f.centroid)) > 0,
  })).sort((a, b) => b.depth - a.depth);
  faces.forEach(({ f, front }) => {
    if (!front) return;
    const pts = f.pts.map(proj);
    if (pts.some((p) => !p)) return;
    const s = 0.34 + 0.66 * Math.max(0, dot(f.normal, LIGHT));
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
function renderPhoto(canvas, scene, ci, activeId, assigned, hoverId, reveal, focus) {
  const ctx = canvas.getContext('2d');
  const { width, height } = INTRINSICS;
  const cam = scene.cameras[ci];
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, '#243447'); g.addColorStop(1, '#151f2b');
  ctx.fillStyle = g; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(20,30,40,.55)';
  const gp = [[-9, -9, 0], [9, -9, 0], [9, 9, 0], [-9, 9, 0]].map((X) => project(cam, X));
  if (gp.every((p) => p)) { ctx.beginPath(); gp.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); }

  drawMesh(ctx, (X) => project(cam, X), cam.t, 1, 'rgba(20,14,10,.5)');

  const pixels = scene.keypointPixels[ci];
  const camAssign = assigned[ci] || {};
  if (reveal && pixels[activeId]) {
    const [u, v] = pixels[activeId];
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(u, v, 9, 0, Math.PI * 2); ctx.stroke();
  }
  scene.keypoints.forEach((kp) => {
    const px = pixels[kp.id];
    if (!px) return;
    const [u, v] = px;
    const assignedTo = camAssign[kp.id];
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
  if (focus) { ctx.strokeStyle = '#ffcf3f'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, width - 3, height - 3); }
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
function drawFrustum(ctx, proj, cam, color, fill, L, emphasis) {
  const apex = proj(cam.t);
  const corners = frustumCorners(cam, L).map(proj);
  if (!apex || corners.some((c) => !c)) return;
  ctx.fillStyle = fill; ctx.beginPath();
  corners.forEach((c, i) => (i ? ctx.lineTo(c[0], c[1]) : ctx.moveTo(c[0], c[1])));
  ctx.closePath(); ctx.fill();
  for (let i = 0; i < 4; i += 1) { line(ctx, apex, corners[i], color, emphasis ? 2.4 : 1.4); line(ctx, corners[i], corners[(i + 1) % 4], color, emphasis ? 2.4 : 1.4); }
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(apex[0], apex[1], emphasis ? 4.5 : 3.4, 0, Math.PI * 2); ctx.fill();
  if (emphasis) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(apex[0], apex[1], 6.5, 0, Math.PI * 2); ctx.stroke(); }
}

function render3D(canvas, scene, solution, orbit, opts) {
  const { showTruth, showRays, focusCam, tracks } = opts;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, '#111d29'); g.addColorStop(1, '#0a1119');
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const { proj, eye } = makeProjector(orbit);

  for (let x = -12; x <= 12; x += 3) {
    line(ctx, proj([x, -12, 0]), proj([x, 12, 0]), 'rgba(90,120,150,.13)');
    line(ctx, proj([-12, x, 0]), proj([12, x, 0]), 'rgba(90,120,150,.13)');
  }
  if (showTruth) drawMesh(ctx, proj, eye, 0.55, 'rgba(30,20,14,.5)');

  EDGES.forEach(([a, b]) => {
    const pa = solution.points[a]; const pb = solution.points[b];
    if (pa && pb) line(ctx, proj(pa), proj(pb), 'rgba(126,211,33,.55)', 1.5);
  });

  // Triangulation / resection rays: camera centre -> reconstructed corner.
  if (showRays) {
    solution.cameras.forEach((cam, ci) => {
      if (!cam.anchored && !cam.reliable) return;
      const isFocus = ci === focusCam;
      const apex = proj(cam.t);
      if (!apex) return;
      tracks.forEach((track) => {
        if (!track.obs[ci]) return;
        const X = solution.points[track.featureId];
        if (!X) return;
        const p = proj(X);
        if (!p) return;
        const col = scene.keypoints[track.featureId].color;
        const [r, gg, bb] = hexToRgb(col);
        line(ctx, apex, p, `rgba(${r},${gg},${bb},${isFocus ? 0.85 : (focusCam == null ? 0.16 : 0.06)})`, isFocus ? 1.5 : 0.8);
      });
    });
  }

  // Adjustment trails: how each solved camera's centre was calculated
  // (initial guess -> Gauss-Newton iterates -> solved pose).
  solution.cameras.forEach((cam, ci) => {
    if (cam.anchored || !cam.reliable || !cam.trail || cam.trail.length < 2) return;
    const isFocus = ci === focusCam;
    if (focusCam != null && !isFocus) return; // only the focused camera's path, to stay legible
    const pts = cam.trail.map(proj);
    ctx.setLineDash([5, 4]);
    for (let i = 0; i < pts.length - 1; i += 1) line(ctx, pts[i], pts[i + 1], isFocus ? 'rgba(255,207,63,.95)' : 'rgba(255,207,63,.5)', isFocus ? 2 : 1.2);
    ctx.setLineDash([]);
    pts.forEach((p, i) => { if (!p || i === pts.length - 1) return; ctx.fillStyle = 'rgba(255,207,63,.9)'; ctx.beginPath(); ctx.arc(p[0], p[1], i === 0 ? 0 : 2.2, 0, Math.PI * 2); ctx.fill(); });
    const start = pts[0];
    if (start) {
      ctx.strokeStyle = '#ffcf3f'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(start[0], start[1], 5, 0, Math.PI * 2); ctx.stroke();
      if (isFocus) { ctx.fillStyle = '#ffcf3f'; ctx.font = '600 11px system-ui'; ctx.fillText('initial guess', start[0] + 8, start[1] - 6); }
    }
  });

  // Reconstructed corners (+ error link to ground truth).
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

  // Cameras: reference (gold) and solved (teal) only — unsolved cameras, whose
  // positions are still unknown, are not drawn.
  solution.cameras.forEach((cam, ci) => {
    if (!cam.anchored && !cam.reliable) return;
    const isFocus = ci === focusCam;
    if (showTruth && !cam.anchored) drawFrustum(ctx, proj, scene.cameras[ci], 'rgba(150,175,200,.3)', 'rgba(150,175,200,.04)', 2.6, false);
    let color = '#2ec6a8'; let fill = 'rgba(46,198,168,.10)';
    if (cam.anchored) { color = '#f5a623'; fill = 'rgba(245,166,35,.12)'; }
    drawFrustum(ctx, proj, cam, color, fill, 2.8, isFocus);
    if (!cam.anchored) line(ctx, proj(cam.t), proj(scene.cameras[ci].t), 'rgba(46,198,168,.5)', 1);
  });
}

// ---------------------------------------------------------------------------
const SEED = 7;

export default function StructureFromMotion() {
  const [noisePx, setNoisePx] = useState(0.5);
  const scene = useMemo(() => buildScene(SEED, noisePx), [noisePx]);
  const initCams = useMemo(() => initialCameras(scene), [scene]);

  const [matches, setMatches] = useState({});
  const [activeId, setActiveId] = useState(0);
  const [hover, setHover] = useState(null);
  const [reveal, setReveal] = useState(false);
  const [orbit, setOrbit] = useState({ az: 0.7, el: 0.5, dist: 42 });
  const [showTruth, setShowTruth] = useState(true);
  const [showRays, setShowRays] = useState(true);
  const [focusCam, setFocusCam] = useState(null);

  const view3dRef = useRef(null);
  const photoRefs = useRef([]);
  const drag = useRef(null);

  const assigned = useMemo(() => {
    const out = {};
    Object.keys(matches).forEach((fid) => {
      const per = matches[fid];
      Object.keys(per).forEach((ci) => { (out[ci] = out[ci] || {})[per[ci]] = Number(fid); });
    });
    return out;
  }, [matches]);

  const tracks = useMemo(() => scene.keypoints.map((kp) => {
    const per = matches[kp.id];
    if (!per) return null;
    const obs = {};
    Object.keys(per).forEach((ci) => { const px = scene.keypointPixels[ci][per[ci]]; if (px) obs[ci] = px; });
    return Object.keys(obs).length ? { featureId: kp.id, obs } : null;
  }).filter(Boolean), [scene, matches]);

  const solution = useMemo(() => solve(scene, tracks, initCams), [scene, tracks, initCams]);

  useEffect(() => { render3D(view3dRef.current, scene, solution, orbit, { showTruth, showRays, focusCam, tracks }); }, [scene, solution, orbit, showTruth, showRays, focusCam, tracks]);
  useEffect(() => {
    scene.cameras.forEach((_, i) => renderPhoto(photoRefs.current[i], scene, i, activeId, assigned, hover && hover.ci === i ? hover.vertexId : null, reveal, focusCam === i));
  }, [scene, activeId, assigned, hover, reveal, focusCam]);

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
  const onWheel = (e) => { e.preventDefault(); setOrbit((o) => ({ ...o, dist: Math.max(24, Math.min(70, o.dist + e.deltaY * 0.04)) })); };

  const m = solution.metrics;
  const totalMatches = Object.values(matches).reduce((n, per) => n + Object.keys(per).length, 0);
  const wrongMatches = Object.keys(matches).reduce((n, fid) => n + Object.keys(matches[fid]).filter((ci) => matches[fid][ci] !== Number(fid)).length, 0);
  const activeCount = matches[activeId] ? Object.keys(matches[activeId]).length : 0;

  // Per-camera reprojection error, for the inspection panel.
  const camReproj = (ci) => {
    let s = 0; let n = 0;
    tracks.forEach((track) => {
      const uv = track.obs[ci]; const X = solution.points[track.featureId];
      if (!uv || !X) return;
      const p = project(solution.cameras[ci], X);
      if (p) { s += Math.hypot(p[0] - uv[0], p[1] - uv[1]); n += 1; }
    });
    return n ? s / n : null;
  };

  let quality = 'idle';
  let qualityText = 'Pick a corner below, then click that same corner in each photo. Match a handful of corners and the cameras will lock into place.';
  if (totalMatches > 0 && m.localised === 0) { quality = 'warn'; qualityText = `${totalMatches} match${totalMatches === 1 ? '' : 'es'} so far — a camera needs four or more matched corners before its pose can be solved. Keep matching.`; }
  else if (m.localised === m.totalToLocalise && wrongMatches === 0) { quality = 'good'; qualityText = `All ${m.totalToLocalise} unknown cameras solved from your matches — pose error ${m.poseError.toFixed(2)} m. More correct matches keep averaging out detector noise.`; }
  else if (wrongMatches > 0) { quality = 'warn'; qualityText = `${wrongMatches} mismatched corner${wrongMatches === 1 ? '' : 's'} (red ✕) are inconsistent with the geometry and are pulling cameras off — notice the reprojection error. Fix them for a clean solve.`; }
  else if (m.localised > 0) { quality = 'warn'; qualityText = `${m.localised} of ${m.totalToLocalise} cameras solved. The rest still lack four confident matches.`; }

  const fmt = (v, unit) => (v == null ? '—' : `${v.toFixed(2)}${unit}`);
  const active = scene.keypoints[activeId];

  // Inspection panel content for the focused camera.
  const focus = focusCam == null ? null : solution.cameras[focusCam];
  let calc;
  if (!focus) calc = <span className="sfm-calc-hint">Select a camera above to see how its position was calculated by resection.</span>;
  else if (focus.anchored) calc = <span className="sfm-calc-hint"><b>Camera #{focusCam + 1}</b> is a reference camera — its pose is known and held fixed to anchor the reconstruction.</span>;
  else if (!focus.reliable) calc = <span className="sfm-calc-hint"><b>Camera #{focusCam + 1}</b> is not solved yet: it needs at least four matched corners that have already been triangulated. Match more corners in this photo.</span>;
  else calc = (
    <div className="sfm-calc-grid">
      <div><span>correspondences</span><b>{focus.corrUsed}</b></div>
      <div><span>resection iterations</span><b>{focus.iterations}</b></div>
      <div><span>initial guess offset</span><b>{focus.initialOffset.toFixed(2)} m</b></div>
      <div><span>solved offset</span><b className={focus.finalOffset > 0.8 ? 'orange' : ''}>{focus.finalOffset.toFixed(2)} m</b></div>
      <div><span>reprojection</span><b>{fmt(camReproj(focusCam), ' px')}</b></div>
      <div><span>status</span><b style={{ color: '#0f8a4d' }}>solved</b></div>
    </div>
  );

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
              <span><i className="sfm-bar" style={{ background: '#ffcf3f' }} /> adjustment path</span>
              <span><i className="sfm-dot" style={{ background: '#7ed321' }} /> reconstructed corner</span>
              <span><i className="sfm-dot" style={{ border: '1px solid #aab', background: 'transparent' }} /> ground truth</span>
            </div>
            <div className="sfm-toolbar">
              <label><input type="checkbox" checked={showRays} onChange={(e) => setShowRays(e.target.checked)} /> triangulation rays</label>
              <label><input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} /> show ground truth</label>
              <label>detector noise
                <input type="range" min="0" max="2" step="0.1" value={noisePx} onChange={(e) => setNoisePx(Number(e.target.value))} />
                <b style={{ fontFamily: 'monospace' }}>{noisePx.toFixed(1)} px</b>
              </label>
              <button className="sfm-btn" onClick={() => setOrbit({ az: 0.7, el: 0.5, dist: 42 })}>reset view</button>
            </div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">4</span> Inspect a camera&rsquo;s calculated position</h2>
            <div className="sfm-inspect">
              {scene.cameras.map((_, i) => {
                const est = solution.cameras[i];
                const st = est.anchored ? 'ref' : est.reliable ? 'solved' : 'lost';
                return (
                  <button key={i} className={`sfm-cambtn ${st} ${focusCam === i ? 'on' : ''}`} onClick={() => setFocusCam(focusCam === i ? null : i)}>#{i + 1}</button>
                );
              })}
            </div>
            <div className="sfm-calc">{calc}</div>
            <div className="readouts" style={{ marginTop: 10 }}>
              <div><span>matches</span><b>{totalMatches}{wrongMatches ? <em className="orange"> ({wrongMatches}✕)</em> : ''}</b></div>
              <div><span>cameras solved</span><b>{m.localised}/{m.totalToLocalise}</b></div>
              <div><span>reproj. error</span><b className={m.reproError > 1.5 ? 'orange' : ''}>{fmt(m.reproError, ' px')}</b></div>
              <div><span>pose error</span><b className={m.poseError > 0.8 ? 'orange' : ''}>{fmt(m.poseError, ' m')}</b></div>
            </div>
            <div className="rect-summary">
              <b>How a camera&rsquo;s position is calculated</b>
              <p>
                Rays from the two reference cameras cross to <b>triangulate</b> each matched corner in 3D (green rays and
                dots). An unknown camera&rsquo;s pose is then found by <b>resection</b>: starting from a rough guess, it is
                iteratively nudged (the amber <b>adjustment path</b>) until its rays pass through those 3D corners with the
                smallest reprojection error. Each newly solved camera adds more triangulated corners, so the solution grows
                until every photo is placed — a wrong match adds an inconsistent ray and pulls the pose away from the truth.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
