import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './snell.css';

// ---------------------------------------------------------------------------
// Snell's Law & Camera Optics — refraction from the photogrammetry viewpoint.
//
// 1. Refraction at one interface:   n1·sinθ1 = n2·sinθ2
//    A ray bends toward the normal entering a denser medium (n2 > n1) and away
//    from it entering a lighter one; past the critical angle it is totally
//    internally reflected.
// 2. A camera lens is stacked refraction: each curved glass surface refracts by
//    Snell's law, and together they bend a parallel bundle to the focal point at
//    distance f. The ray through the centre is (almost) undeviated — that is the
//    perspective projection centre the collinearity equations assume.
// 3. Real compound optics don't obey the ideal pinhole exactly, so straight
//    ground lines image as curves: radial lens distortion r' = r(1 + k1r² + …).
//    Photogrammetric camera calibration models it as part of interior orientation.
// ---------------------------------------------------------------------------

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

// Refractive indices of common media (n = c / v).
const MEDIA = [
  { name: 'Air', n: 1.0 },
  { name: 'Water', n: 1.33 },
  { name: 'Glass', n: 1.52 },
  { name: 'Dense glass', n: 1.72 },
];

function snell(n1, n2, t1deg) {
  const t1 = toRad(t1deg);
  const s2 = (n1 / n2) * Math.sin(t1);
  if (s2 > 1) return { tir: true, t2: null }; // total internal reflection
  return { tir: false, t2: toDeg(Math.asin(s2)) };
}
const criticalAngle = (n1, n2) => (n1 > n2 ? toDeg(Math.asin(n2 / n1)) : null);

// ---- drawing helpers ------------------------------------------------------
function arrow(ctx, x1, y1, x2, y2, color, w = 2.5) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1); const h = 9 + w;
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - h * Math.cos(a - 0.4), y2 - h * Math.sin(a - 0.4));
  ctx.lineTo(x2 - h * Math.cos(a + 0.4), y2 - h * Math.sin(a + 0.4));
  ctx.closePath(); ctx.fill();
}
function txt(ctx, s, x, y, color, font = '600 15px system-ui', align = 'left') {
  ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

// (1) Refraction at a single interface.
function drawInterface(cv, n1, n2, t1deg) {
  const ctx = cv.getContext('2d'); const W = cv.width; const H = cv.height;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2; const y0 = H * 0.54; const L = Math.min(W, H) * 0.42;
  // media tints (denser = stronger blue)
  ctx.fillStyle = `rgba(90,150,210,${0.05 + (n1 - 1) * 0.14})`; ctx.fillRect(0, 0, W, y0);
  ctx.fillStyle = `rgba(90,150,210,${0.05 + (n2 - 1) * 0.14})`; ctx.fillRect(0, y0, W, H - y0);
  // interface + normal
  ctx.strokeStyle = '#dbe9f2'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
  ctx.strokeStyle = 'rgba(219,233,242,.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.moveTo(cx, y0 - L - 20); ctx.lineTo(cx, y0 + L + 20); ctx.stroke(); ctx.setLineDash([]);
  txt(ctx, 'normal', cx + 8, y0 - L - 8, 'rgba(219,233,242,.6)', '12px system-ui');

  const t1 = toRad(t1deg);
  const { tir, t2 } = snell(n1, n2, t1deg);
  // incident ray (upper-left → P), arrow at P
  const ax = cx - L * Math.sin(t1); const ay = y0 - L * Math.cos(t1);
  arrow(ctx, ax, ay, cx, y0, '#5ad1ff', 3);
  // reflected ray (P → upper-right), faint (brighter under TIR)
  const rx = cx + L * Math.sin(t1); const ry = y0 - L * Math.cos(t1);
  arrow(ctx, cx, y0, rx, ry, tir ? '#5ad1ff' : 'rgba(90,209,255,.35)', tir ? 3 : 2);
  // refracted ray (P → lower-right) when it transmits
  if (!tir) {
    const t2r = toRad(t2);
    const bx = cx + L * Math.sin(t2r); const by = y0 + L * Math.cos(t2r);
    arrow(ctx, cx, y0, bx, by, '#ffb703', 3);
  }
  // angle arcs
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#5ad1ff';
  ctx.beginPath(); ctx.arc(cx, y0, 34, -Math.PI / 2 - t1, -Math.PI / 2, false); ctx.stroke();
  txt(ctx, `θ₁ ${t1deg.toFixed(0)}°`, cx - 46 - t1deg * 0.15, y0 - 46, '#8fe3ff', '600 14px system-ui', 'center');
  if (!tir) {
    const t2r = toRad(t2);
    ctx.strokeStyle = '#ffb703';
    ctx.beginPath(); ctx.arc(cx, y0, 34, Math.PI / 2 - t2r, Math.PI / 2, true); ctx.stroke();
    txt(ctx, `θ₂ ${t2.toFixed(1)}°`, cx + 40 + t2 * 0.2, y0 + 46, '#ffca5f', '600 14px system-ui', 'center');
  }
  // dot at incidence point
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, y0, 4, 0, 7); ctx.fill();
  // medium labels
  txt(ctx, `n₁ = ${n1.toFixed(2)}`, 12, 20, '#bcd3e6', '600 14px system-ui');
  txt(ctx, `n₂ = ${n2.toFixed(2)}`, 12, H - 18, '#bcd3e6', '600 14px system-ui');
  if (tir) {
    ctx.fillStyle = 'rgba(224,168,0,.9)'; ctx.fillRect(cx + 14, y0 + 14, 250, 26);
    txt(ctx, 'Total internal reflection', cx + 22, y0 + 27, '#3a2c00', '700 14px system-ui');
  }
}

// (2) A biconvex lens focuses a parallel bundle to F at focal length f.
function drawLens(cv, nglass) {
  const ctx = cv.getContext('2d'); const W = cv.width; const H = cv.height;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, W, H);
  const lx = W * 0.34; const cy = H / 2;
  // focal length shrinks as the glass bends light more strongly: f ∝ 1/(n−1)
  const fpx = clamp((W * 0.20) / (nglass - 1), W * 0.16, W * 0.62);
  const Fx = lx + fpx;
  // optical axis
  ctx.strokeStyle = 'rgba(219,233,242,.4)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]);
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke(); ctx.setLineDash([]);
  // lens body (two arcs → biconvex)
  const lh = H * 0.36; const bulge = 22;
  ctx.beginPath();
  ctx.moveTo(lx, cy - lh);
  ctx.quadraticCurveTo(lx + bulge, cy, lx, cy + lh);
  ctx.quadraticCurveTo(lx - bulge, cy, lx, cy - lh);
  ctx.closePath();
  ctx.fillStyle = 'rgba(143,191,224,.28)'; ctx.fill();
  ctx.strokeStyle = '#cfe0ef'; ctx.lineWidth = 2.5; ctx.stroke();
  // parallel rays → refract at lens → pass through F
  const hs = [-lh * 0.75, -lh * 0.4, lh * 0.4, lh * 0.75];
  hs.forEach((h) => {
    ctx.strokeStyle = '#5ad1ff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, cy + h); ctx.lineTo(lx, cy + h); ctx.stroke();
    arrow(ctx, lx, cy + h, Fx, cy, '#ffb703', 2);
    // continue past focus (diverging)
    const t = (W - Fx) / fpx;
    ctx.strokeStyle = 'rgba(255,183,3,.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(Fx, cy); ctx.lineTo(W, cy - h * t); ctx.stroke();
  });
  // chief ray through centre — undeviated (the projection centre)
  ctx.strokeStyle = '#7ed99a'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();
  // focal point + labels
  ctx.fillStyle = '#ffca5f'; ctx.beginPath(); ctx.arc(Fx, cy, 5, 0, 7); ctx.fill();
  txt(ctx, 'F', Fx, cy - 16, '#ffca5f', '700 16px system-ui', 'center');
  ctx.strokeStyle = 'rgba(255,202,95,.6)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(lx, cy + lh + 12); ctx.lineTo(Fx, cy + lh + 12); ctx.stroke(); ctx.setLineDash([]);
  txt(ctx, `focal length f  (n = ${nglass.toFixed(2)})`, (lx + Fx) / 2, cy + lh + 26, '#ffca5f', '600 13px system-ui', 'center');
  txt(ctx, 'each surface refracts by Snell', lx - 6, cy - lh - 8, '#bcd3e6', '12px system-ui', 'right');
  txt(ctx, 'centre ray: undeviated', W - 10, cy - 14, '#9be3b0', '12px system-ui', 'right');
}

// (3) Radial lens distortion: straight lines image as curves.
function drawDistortion(cv, k) {
  const ctx = cv.getContext('2d'); const W = cv.width; const H = cv.height;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, W, H);
  const cx = W / 2; const cy = H / 2; const N = 6; const step = (Math.min(W, H) * 0.72) / N;
  const Rmax = Math.hypot(N * step, N * step);
  const map = (gx, gy) => {
    const x = gx * step; const y = gy * step; const r = Math.hypot(x, y);
    const f = 1 + k * (r / Rmax) * (r / Rmax);
    return [cx + x * f, cy + y * f];
  };
  // ideal grid (faint, straight)
  ctx.strokeStyle = 'rgba(219,233,242,.18)'; ctx.lineWidth = 1;
  for (let i = -N; i <= N; i += 1) {
    ctx.beginPath(); ctx.moveTo(cx + i * step, cy - N * step); ctx.lineTo(cx + i * step, cy + N * step); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - N * step, cy + i * step); ctx.lineTo(cx + N * step, cy + i * step); ctx.stroke();
  }
  // distorted grid (bold, curved) — sample each line finely
  ctx.strokeStyle = '#5ad1ff'; ctx.lineWidth = 2;
  for (let i = -N; i <= N; i += 1) {
    ctx.beginPath();
    for (let j = -N; j <= N; j += 0.25) { const [px, py] = map(i, j); j === -N ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
    ctx.beginPath();
    for (let j = -N; j <= N; j += 0.25) { const [px, py] = map(j, i); j === -N ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
    ctx.stroke();
  }
  // one corner point: ideal vs distorted + Δr
  const [ix, iy] = [cx + N * step, cy + N * step];
  const [dx, dy] = map(N, N);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(ix, iy, 5, 0, 7); ctx.stroke();
  arrow(ctx, ix, iy, dx, dy, '#ffb703', 2);
  ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.arc(dx, dy, 4, 0, 7); ctx.fill();
  // principal point
  ctx.fillStyle = '#7ed99a'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 7); ctx.fill();
  txt(ctx, 'principal point', cx + 8, cy - 12, '#9be3b0', '12px system-ui');
  txt(ctx, k < -0.001 ? 'barrel' : k > 0.001 ? 'pincushion' : 'no distortion', 12, 20, '#8fe3ff', '600 14px system-ui');
  txt(ctx, 'Δr', (ix + dx) / 2 + 10, (iy + dy) / 2, '#ffca5f', '600 13px system-ui');
}

export default function Snell() {
  const [t1, setT1] = useState(40);
  const [n1i, setN1i] = useState(0); // Air
  const [n2i, setN2i] = useState(2); // Glass
  const [nglass, setNglass] = useState(1.52);
  const [kdist, setKdist] = useState(-0.22);

  const n1 = MEDIA[n1i].n; const n2 = MEDIA[n2i].n;
  const res = snell(n1, n2, t1);
  const tc = criticalAngle(n1, n2);
  const fRel = 1 / (nglass - 1); // relative focal length ∝ 1/(n−1)

  const c1 = useRef(null); const c2 = useRef(null); const c3 = useRef(null);
  useEffect(() => { if (c1.current) drawInterface(c1.current, n1, n2, t1); }, [n1, n2, t1]);
  useEffect(() => { if (c2.current) drawLens(c2.current, nglass); }, [nglass]);
  useEffect(() => { if (c3.current) drawDistortion(c3.current, kdist); }, [kdist]);

  const edgeShift = (Math.abs(kdist) * 100).toFixed(0);

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Snell&rsquo;s Law &amp; Camera Optics <span className="native-badge">Native React</span></h1>
          <span className="sub">How refraction bends light through a lens — and why photogrammetry must calibrate it</span>
        </div>
        <span className="score-chip">{res.tir ? 'TIR' : <>θ₂ = <b>{res.t2.toFixed(1)}°</b></>}</span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> Refraction at an interface <small>&mdash; n₁ sinθ₁ = n₂ sinθ₂</small></h2>
            <canvas ref={c1} className="sim-canvas section-canvas" width={720} height={520} />
            <div className="snell-media"><span className="snell-lab">Incoming medium n₁</span>
              {MEDIA.map((m, k) => (
                <button key={m.name} className={`snell-mbtn ${n1i === k ? 'on' : ''}`} onClick={() => setN1i(k)}><b>{m.name}</b><span>{m.n.toFixed(2)}</span></button>
              ))}
            </div>
            <div className="snell-media"><span className="snell-lab">Medium the ray enters n₂</span>
              {MEDIA.map((m, k) => (
                <button key={m.name} className={`snell-mbtn ${n2i === k ? 'on' : ''}`} onClick={() => setN2i(k)}><b>{m.name}</b><span>{m.n.toFixed(2)}</span></button>
              ))}
            </div>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>angle of incidence θ₁ <b>{t1.toFixed(0)}°</b><input type="range" min="0" max="89" step="1" value={t1} onChange={(e) => setT1(Number(e.target.value))} /></label>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <div><span>θ₂ refracted</span><b>{res.tir ? '—' : `${res.t2.toFixed(1)}°`}</b></div>
              <div><span>bends</span><b>{n2 > n1 ? 'to normal' : n2 < n1 ? 'from normal' : 'straight'}</b></div>
              <div><span>critical angle</span><b>{tc ? `${tc.toFixed(1)}°` : '—'}</b></div>
              <div><span>state</span><b className={res.tir ? 'orange' : ''}>{res.tir ? 'TIR' : 'refracts'}</b></div>
            </div>
            <div className="equation">n₁·sinθ₁ = n₂·sinθ₂ &nbsp;→&nbsp; θ₂ = asin( (n₁/n₂)·sinθ₁ ) = {res.tir ? 'undefined (total internal reflection)' : `${res.t2.toFixed(2)}°`}</div>
            {tc && (
              <div className="snell-tir">Going from denser to lighter glass (n₁ &gt; n₂), any θ₁ beyond the <b>critical angle {tc.toFixed(1)}°</b> is <b>totally internally reflected</b> — the basis of fibre optics and of light-guiding inside prisms.</div>
            )}
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">2</span> A lens is stacked refraction <small>&mdash; the projection centre</small></h2>
            <canvas ref={c2} className="sim-canvas section-canvas" width={720} height={360} />
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>lens glass index n <b>{nglass.toFixed(2)}</b><input type="range" min="1.30" max="1.90" step="0.01" value={nglass} onChange={(e) => setNglass(Number(e.target.value))} /></label>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div><span>focal length f</span><b>∝ {fRel.toFixed(2)}</b></div>
              <div><span>lens power</span><b>{(nglass - 1).toFixed(2)}×</b></div>
              <div><span>centre ray</span><b>undeviated</b></div>
            </div>
            <div className="snell-note">Every curved glass surface refracts the light by Snell&rsquo;s law; stacked together they focus a parallel bundle at the <b>focal length f</b>. Stronger glass (higher <b>n</b>) bends light more, so <b>f ∝ 1/(n−1)</b> shortens. The ray through the lens centre passes almost straight — that undeviated line is the <b>perspective projection centre</b> the collinearity equations assume.</div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">3</span> Why photogrammetry cares <small>&mdash; lens distortion</small></h2>
            <canvas ref={c3} className="sim-canvas section-canvas" width={720} height={430} />
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>radial distortion k₁ <b>{kdist.toFixed(2)}</b><input type="range" min="-0.35" max="0.35" step="0.01" value={kdist} onChange={(e) => setKdist(Number(e.target.value))} /></label>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div><span>pattern</span><b>{kdist < -0.001 ? 'barrel' : kdist > 0.001 ? 'pincushion' : 'none'}</b></div>
              <div><span>edge shift Δr</span><b>{edgeShift}%</b></div>
              <div><span>model</span><b>r(1+k₁r²)</b></div>
            </div>
            <div className="equation">image radius: r&#39; = r·(1 + k₁r² + k₂r⁴ + …) &nbsp;·&nbsp; the pinhole model assumes a straight ray; real optics depart from it</div>
            <div className="rect-summary">
              <b>From Snell&rsquo;s law to camera calibration</b>
              <p>
                Photogrammetry&rsquo;s <b>collinearity equations</b> assume the ground point, the projection centre and the image
                point lie on one <b>straight</b> line. But the image is formed by <b>refraction</b> through a stack of glass
                elements, and real optics never match the ideal pinhole perfectly: straight ground lines bow into curves
                (<b>barrel</b> or <b>pincushion</b> distortion). Camera <b>calibration</b> recovers the principal distance, the
                principal point and the radial/decentring distortion terms (k₁, k₂, p₁, p₂) — the <b>interior orientation</b> —
                so every measured pixel can be corrected back onto the straight ray Snell&rsquo;s law only approximates. The same
                refraction shifts apparent positions when shooting <b>through water or a glass port</b>, which underwater and
                through-window surveys must model explicitly.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
