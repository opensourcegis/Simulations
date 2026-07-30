import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './sar.css';

// ---------------------------------------------------------------------------
// Synthetic Aperture Radar (SAR).
//
// A side-looking radar on a moving platform sends microwave chirps and records
// the echoes. Two tricks turn a small antenna into a sharp imager:
//  • RANGE — a long frequency-swept pulse (chirp) is match-filtered on receive
//    (pulse compression) → range resolution δR = c / (2·B), set by bandwidth B.
//  • AZIMUTH — as the platform flies past a target it stays in the beam for a
//    long stretch; combining all those echoes synthesises an aperture of length
//    L = λ·R / D, giving azimuth resolution δaz = D / 2 — independent of range
//    and wavelength. Equivalently, the target's Doppler history is a chirp that
//    is match-filtered just like the range pulse.
// ---------------------------------------------------------------------------

const C = 3e8;
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BANDS = [
  { id: 'X', name: 'X-band', f: 9.65, lam: C / 9.65e9 },
  { id: 'C', name: 'C-band', f: 5.405, lam: C / 5.405e9 },
  { id: 'L', name: 'L-band', f: 1.275, lam: C / 1.275e9 },
];

// ---- drawing helpers ------------------------------------------------------
function line(ctx, x1, y1, x2, y2, color, w = 2, dash) {
  ctx.strokeStyle = color; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.setLineDash([]);
}
function arrow(ctx, x1, y1, x2, y2, color, w = 2) {
  line(ctx, x1, y1, x2, y2, color, w); const a = Math.atan2(y2 - y1, x2 - x1); const h = 8 + w;
  ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - h * Math.cos(a - 0.4), y2 - h * Math.sin(a - 0.4));
  ctx.lineTo(x2 - h * Math.cos(a + 0.4), y2 - h * Math.sin(a + 0.4));
  ctx.closePath(); ctx.fill();
}
function txt(ctx, s, x, y, color, font = '600 13px system-ui', align = 'left') {
  ctx.fillStyle = color; ctx.font = font; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
}
function bg(ctx, W, H, top = '#0b1622', bot = '#0e1c2b') {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

// (1) side-looking imaging geometry in the range (elevation) plane
function drawGeometry(cv, Hkm, thetaDeg, bwDeg) {
  const ctx = cv.getContext('2d'); const W = cv.width; const H = cv.height; ctx.clearRect(0, 0, W, H); bg(ctx, W, H);
  const px = 96; const py = 60; const gy = H - 46; const vspan = gy - py; // platform→ground pixels
  ctx.fillStyle = '#26333f'; ctx.fillRect(0, gy, W, H - gy); line(ctx, 0, gy, W, gy, '#5c7488', 2);
  line(ctx, px, py, px, gy, 'rgba(219,233,242,.4)', 1.4, [6, 6]); txt(ctx, 'nadir', px + 6, py + 12, 'rgba(219,233,242,.6)', '11px system-ui');
  // platform
  ctx.fillStyle = '#e8eff5'; ctx.beginPath(); ctx.roundRect(px - 20, py - 11, 40, 22, 5); ctx.fill();
  ctx.fillStyle = '#5ad1ff'; ctx.fillRect(px - 30, py - 3, 8, 6); ctx.fillRect(px + 22, py - 3, 8, 6); // panels
  txt(ctx, '⊗ flight (azimuth)', px + 34, py - 2, '#9be3b0', '11px system-ui');
  const near = thetaDeg - bwDeg / 2; const far = thetaDeg + bwDeg / 2;
  const gx = (ang) => px + vspan * Math.tan(ang * D2R);
  const xn = gx(near); const xf = gx(far); const xc = gx(thetaDeg);
  // beam
  ctx.fillStyle = 'rgba(90,209,255,.16)'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(xn, gy); ctx.lineTo(xf, gy); ctx.closePath(); ctx.fill();
  line(ctx, px, py, xn, gy, '#5ad1ff', 1.6); line(ctx, px, py, xf, gy, '#5ad1ff', 1.6);
  arrow(ctx, px, py, xc, gy, '#ffb703', 2.4); // slant range
  // swath bracket
  line(ctx, xn, gy + 10, xf, gy + 10, '#ffd27a', 2); line(ctx, xn, gy + 6, xn, gy + 14, '#ffd27a', 2); line(ctx, xf, gy + 6, xf, gy + 14, '#ffd27a', 2);
  txt(ctx, 'swath', (xn + xf) / 2, gy + 24, '#ffd27a', '600 12px system-ui', 'center');
  txt(ctx, 'near', xn, gy - 8, '#8fe3ff', '11px system-ui', 'center'); txt(ctx, 'far', xf, gy - 8, '#8fe3ff', '11px system-ui', 'center');
  // incidence angle arc at swath centre
  ctx.strokeStyle = '#ffb703'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(xc, gy, 30, -Math.PI / 2, -Math.PI / 2 + thetaDeg * D2R); ctx.stroke();
  line(ctx, xc, gy, xc, gy - 40, 'rgba(255,255,255,.25)', 1, [4, 4]);
  txt(ctx, `θ ${thetaDeg.toFixed(0)}°`, xc + 12, gy - 22, '#ffca5f', '600 12px system-ui');
  txt(ctx, `H = ${Hkm.toFixed(0)} km`, px, 24, '#bcd3e6', '600 13px system-ui', 'center');
  txt(ctx, `slant R = ${(Hkm / Math.cos(thetaDeg * D2R)).toFixed(0)} km`, (px + xc) / 2 + 20, (py + gy) / 2 - 8, '#ffca5f', '600 12px system-ui', 'center');
}

// (2) range resolution by pulse compression of a linear-FM chirp
function drawChirp(cv, Bmhz, sepM) {
  const ctx = cv.getContext('2d'); const W = cv.width; const H = cv.height; ctx.clearRect(0, 0, W, H); bg(ctx, W, H);
  const res = 150 / Bmhz; // slant-range resolution (m) = c/2B
  const x0 = 60; const x1 = W - 20; const pw = x1 - x0;
  // transmitted chirp (row 1)
  const drawWave = (yc, amp, phase, color, xa, xb) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = xa; x <= xb; x += 1) { const u = (x - xa) / (xb - xa); const y = yc - amp * Math.sin(phase(u)); x === xa ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  };
  const cyc0 = 3; const cyc1 = 3 + Bmhz / 90; // more bandwidth → steeper frequency ramp
  const chirpPhase = (u) => 2 * Math.PI * (cyc0 * u + 0.5 * (cyc1 - cyc0) * u * u);
  txt(ctx, 'transmit chirp (LFM)', x0, 20, '#8fe3ff', '600 12px system-ui');
  drawWave(46, 15, chirpPhase, '#5ad1ff', x0, x1);
  txt(ctx, `τ · bandwidth B = ${Bmhz.toFixed(0)} MHz`, x1, 20, '#7d9ab0', '11px system-ui', 'right');
  // two overlapping echoes (row 2)
  txt(ctx, 'echoes from 2 targets', x0, 92, '#8fe3ff', '600 12px system-ui');
  const sepPx = clamp(sepM / (Math.max(sepM * 2.6, res * 5)) * pw, 6, pw * 0.4);
  drawWave(120, 11, chirpPhase, 'rgba(126,224,196,.85)', x0, x1 - sepPx);
  drawWave(120, 11, chirpPhase, 'rgba(255,183,3,.7)', x0 + sepPx, x1);
  // matched-filter output: two sincs (row 3)
  const axY = H - 40; const span = Math.max(sepM * 2.6, res * 5); const pxpm = pw / span;
  line(ctx, x0, axY, x1, axY, '#5c7488', 1.5);
  txt(ctx, 'after matched filter (pulse compression)', x0, axY - 78, '#8fe3ff', '600 12px system-ui');
  const cx1 = x0 + (span / 2 - sepM / 2) * pxpm; const cx2 = x0 + (span / 2 + sepM / 2) * pxpm;
  const sinc = (cx, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.beginPath();
    for (let x = x0; x <= x1; x += 1) { const dm = (x - cx) / pxpm; const a = Math.PI * dm / res; const s = a === 0 ? 1 : Math.sin(a) / a; const y = axY - Math.abs(s) * 60; x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  };
  sinc(cx1, '#7ee0c4'); sinc(cx2, '#ffb703');
  const resolved = sepM >= res;
  txt(ctx, `δR = c/2B = ${res.toFixed(2)} m`, x0, axY + 20, '#ffca5f', '600 12px system-ui');
  txt(ctx, `targets ${sepM.toFixed(1)} m apart → ${resolved ? 'RESOLVED' : 'merged'}`, x1, axY + 20, resolved ? '#7ee0c4' : '#ff8f6b', '700 12px system-ui', 'right');
}

// (3) azimuth resolution from the synthetic aperture (top view)
function drawAperture(cv, Dm, lam, Rkm) {
  const ctx = cv.getContext('2d'); const W = cv.width; const H = cv.height; ctx.clearRect(0, 0, W, H); bg(ctx, W, H);
  const R = Rkm * 1000; const foot = (lam * R) / Dm; // beam footprint on ground = synthetic aperture length (m)
  const flightY = 40; const groundY = H - 60; const cx = W / 2;
  // flight line
  arrow(ctx, 40, flightY, W - 30, flightY, '#9be3b0', 2); txt(ctx, 'flight path (azimuth)', 44, flightY - 12, '#9be3b0', '11px system-ui');
  // target
  ctx.fillStyle = '#ffb703'; ctx.beginPath(); ctx.arc(cx, groundY, 5, 0, 7); ctx.fill(); txt(ctx, 'point target', cx + 10, groundY + 4, '#ffca5f', '11px system-ui');
  // synthetic aperture: platform positions that still see the target
  const half = W * 0.30; // schematic half-length of the aperture on screen
  for (let k = -3; k <= 3; k += 1) {
    const x = cx + (k / 3) * half; const edge = k === -3 || k === 3;
    ctx.fillStyle = edge ? '#5ad1ff' : 'rgba(90,209,255,.5)'; ctx.fillRect(x - 4, flightY - 3, 8, 6);
    line(ctx, x, flightY + 4, cx, groundY, edge ? 'rgba(90,209,255,.55)' : 'rgba(90,209,255,.18)', edge ? 1.6 : 1);
  }
  // aperture bracket
  line(ctx, cx - half, flightY - 26, cx + half, flightY - 26, '#5ad1ff', 2);
  line(ctx, cx - half, flightY - 30, cx - half, flightY - 22, '#5ad1ff', 2); line(ctx, cx + half, flightY - 30, cx + half, flightY - 22, '#5ad1ff', 2);
  txt(ctx, `synthetic aperture  L = λR/D = ${foot > 1000 ? `${(foot / 1000).toFixed(1)} km` : `${foot.toFixed(0)} m`}`, cx, flightY - 38, '#8fe3ff', '600 12px system-ui', 'center');
  // resolution comparison
  txt(ctx, `real-aperture blur λR/D ≈ ${foot > 1000 ? `${(foot / 1000).toFixed(1)} km` : `${foot.toFixed(0)} m`}`, cx, groundY + 30, '#ff8f6b', '600 12px system-ui', 'center');
  txt(ctx, `SAR azimuth res δaz = D/2 = ${(Dm / 2).toFixed(1)} m`, cx, groundY + 50, '#7ee0c4', '700 13px system-ui', 'center');
  txt(ctx, `antenna D = ${Dm.toFixed(0)} m · R = ${Rkm.toFixed(0)} km`, W - 20, groundY + 50, '#7d9ab0', '11px system-ui', 'right');
}

// (4) azimuth Doppler history — a chirp that is match-filtered
function drawDoppler(cv, v, R0km, lam) {
  const ctx = cv.getContext('2d'); const W = cv.width; const H = cv.height; ctx.clearRect(0, 0, W, H); bg(ctx, W, H);
  const R0 = R0km * 1000; const fdot = (2 * v * v) / (lam * R0); // Doppler rate (Hz/s)
  const x0 = 56; const x1 = W - 20; const midY = H / 2;
  // axes
  line(ctx, x0, midY, x1, midY, '#5c7488', 1.5); line(ctx, (x0 + x1) / 2, 30, (x0 + x1) / 2, H - 30, 'rgba(219,233,242,.3)', 1, [5, 5]);
  txt(ctx, 'Doppler', x0 - 4, 26, '#8fe3ff', '600 12px system-ui'); txt(ctx, 'azimuth time →', x1, midY + 16, '#7d9ab0', '11px system-ui', 'right');
  txt(ctx, '+f (approaching)', x0, 40, '#7d9ab0', '10px system-ui'); txt(ctx, '−f (receding)', x0, H - 32, '#7d9ab0', '10px system-ui');
  // linear Doppler ramp through zero at closest approach
  arrow(ctx, x0 + 10, 44, x1 - 10, H - 44, '#ffb703', 2.6);
  ctx.fillStyle = '#7ee0c4'; ctx.beginPath(); ctx.arc((x0 + x1) / 2, midY, 5, 0, 7); ctx.fill();
  txt(ctx, 'zero Doppler = closest approach', (x0 + x1) / 2 + 8, midY - 14, '#9be3b0', '11px system-ui');
  txt(ctx, `Doppler rate ≈ 2v²/λR = ${fdot.toFixed(0)} Hz/s`, x0, H - 14, '#ffca5f', '600 12px system-ui');
  txt(ctx, `v = ${v.toFixed(0)} m/s · R = ${R0km.toFixed(0)} km`, x1, H - 14, '#7d9ab0', '11px system-ui', 'right');
}

export default function SarImaging() {
  const [Hkm, setHkm] = useState(693);
  const [theta, setTheta] = useState(35);
  const [bandId, setBandId] = useState('C');
  const [D, setD] = useState(10);
  const [v, setV] = useState(7000);
  const [B, setB] = useState(300);
  const [sep, setSep] = useState(1.2);

  const band = BANDS.find((b) => b.id === bandId); const lam = band.lam;
  const bw = 4; // elevation beamwidth (deg) for the swath
  const Rkm = Hkm / Math.cos(theta * D2R);

  const gRef = useRef(null); const cRef = useRef(null); const aRef = useRef(null); const dRef = useRef(null);
  useEffect(() => { if (gRef.current) drawGeometry(gRef.current, Hkm, theta, bw); }, [Hkm, theta]);
  useEffect(() => { if (cRef.current) drawChirp(cRef.current, B, sep); }, [B, sep]);
  useEffect(() => { if (aRef.current) drawAperture(aRef.current, D, lam, Rkm); }, [D, lam, Rkm]);
  useEffect(() => { if (dRef.current) drawDoppler(dRef.current, v, Rkm, lam); }, [v, Rkm, lam]);

  const dR = 150 / B; const foot = (lam * Rkm * 1000) / D; const dAz = D / 2;

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>Synthetic Aperture Radar <span className="native-badge">Native React</span></h1>
          <span className="sub">How a small side-looking radar builds a sharp all-weather image — range chirps and a synthesised aperture</span>
        </div>
        <span className="score-chip">{band.name} · δaz <b>{dAz.toFixed(1)} m</b></span>
      </header>

      <div className="sim-layout">
        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">1</span> Side-looking geometry <small>&mdash; range / swath</small></h2>
            <canvas ref={gRef} className="sim-canvas section-canvas" width={720} height={340} />
            <div className="sar-bands"><span style={{ width: '100%', fontSize: 11, color: '#7d8fa1', textTransform: 'uppercase', letterSpacing: '.6px' }}>Radar band (wavelength λ)</span>
              {BANDS.map((b) => (<button key={b.id} className={`sar-bbtn ${bandId === b.id ? 'on' : ''}`} onClick={() => setBandId(b.id)}><b>{b.name}</b><span>{(b.lam * 100).toFixed(1)} cm</span></button>))}
            </div>
            <div className="control-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>altitude H <b>{Hkm.toFixed(0)} km</b><input type="range" min="4" max="800" step="1" value={Hkm} onChange={(e) => setHkm(Number(e.target.value))} /></label>
              <label>look / incidence θ <b>{theta.toFixed(0)}°</b><input type="range" min="18" max="52" step="1" value={theta} onChange={(e) => setTheta(Number(e.target.value))} /></label>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
              <div><span>slant range R</span><b>{Rkm.toFixed(0)} km</b></div>
              <div><span>incidence θ</span><b>{theta.toFixed(0)}°</b></div>
              <div><span>ground δR</span><b>{(dR / Math.sin(theta * D2R)).toFixed(2)} m</b></div>
              <div><span>wavelength λ</span><b>{(lam * 100).toFixed(1)} cm</b></div>
            </div>
            <div className="sar-note">Radar is <b>active</b> (its own illumination) and uses <b>microwaves</b>, so it images day or night and sees through cloud, smoke and rain. It must look <b>to the side</b> — a nadir-looking radar could not tell left from right, and range alone orders the echoes across the <b>swath</b> from near to far range.</div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">3</span> Azimuth resolution — the synthetic aperture <small>&mdash; δaz = D/2</small></h2>
            <canvas ref={aRef} className="sim-canvas section-canvas" width={720} height={330} />
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>antenna length D <b>{D.toFixed(0)} m</b><input type="range" min="1" max="15" step="0.5" value={D} onChange={(e) => setD(Number(e.target.value))} /></label>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              <div><span>beam footprint λR/D</span><b>{foot > 1000 ? `${(foot / 1000).toFixed(1)} km` : `${foot.toFixed(0)} m`}</b></div>
              <div><span>real-aperture res</span><b className="orange">{foot > 1000 ? `${(foot / 1000).toFixed(1)} km` : `${foot.toFixed(0)} m`}</b></div>
              <div><span>SAR δaz = D/2</span><b>{dAz.toFixed(1)} m</b></div>
            </div>
            <div className="sar-note">The real beam is wide (λR/D), so a real-aperture radar would smear a target over kilometres. But the target sits in the beam across the whole <b>synthetic aperture L = λR/D</b>; coherently combining those echoes sharpens azimuth to <b>δaz = D/2</b> — remarkably, a <b>smaller</b> antenna gives <b>finer</b> resolution, and it does not depend on range or wavelength.</div>
          </section>
        </div>

        <div className="sim-col">
          <section className="sim-panel">
            <h2><span className="stepno">2</span> Range resolution — pulse compression <small>&mdash; δR = c/2B</small></h2>
            <canvas ref={cRef} className="sim-canvas section-canvas" width={720} height={360} />
            <div className="control-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>bandwidth B <b>{B.toFixed(0)} MHz</b><input type="range" min="20" max="1200" step="10" value={B} onChange={(e) => setB(Number(e.target.value))} /></label>
              <label>target spacing <b>{sep.toFixed(1)} m</b><input type="range" min="0.2" max="12" step="0.1" value={sep} onChange={(e) => setSep(Number(e.target.value))} /></label>
            </div>
            <div className="equation">transmit long chirp (bandwidth B) → matched filter on receive → narrow peak of width δR = c/2B = {dR.toFixed(2)} m · resolves targets ≥ that apart with full pulse energy</div>
            <div className="sar-note">A short pulse would need enormous peak power. Instead SAR sends a long <b>linear-FM chirp</b> and <b>match-filters</b> the echo (pulse compression), collapsing it to a sharp spike. Range resolution depends only on <b>bandwidth B</b>, not pulse length — more bandwidth, finer range.</div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">4</span> Doppler history <small>&mdash; azimuth is a chirp too</small></h2>
            <canvas ref={dRef} className="sim-canvas section-canvas" width={720} height={230} />
            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>platform speed v <b>{v.toFixed(0)} m/s</b><input type="range" min="120" max="7700" step="20" value={v} onChange={(e) => setV(Number(e.target.value))} /></label>
            </div>
            <div className="sar-note">As the platform flies past, the target&rsquo;s range first shortens then lengthens, so its echo&rsquo;s <b>Doppler shifts linearly</b> from + to − through zero at closest approach — an <b>azimuth chirp</b>. Match-filtering this Doppler history (azimuth compression) is exactly what synthesises the aperture; the two compressions together form the focused image.</div>
          </section>

          <section className="sim-panel">
            <h2><span className="stepno">5</span> All the other aspects</h2>
            <div className="sar-modes">
              <div className="sar-mode"><b>Imaging modes</b><span>Stripmap (fixed beam), Spotlight (steer to stare → finest azimuth), ScanSAR/TOPS (sweep elevation → wide swath, coarser res).</span></div>
              <div className="sar-mode"><b>Polarimetry</b><span>Transmit/receive H &amp; V (HH, HV, VH, VV) — scattering type reveals surfaces, volume (vegetation) and double-bounce (buildings).</span></div>
              <div className="sar-mode"><b>Geometric distortion</b><span>Side-looking + range ordering give foreshortening, layover (tops before bases) and radar shadow on slopes.</span></div>
              <div className="sar-mode"><b>Speckle</b><span>Coherent summation of many scatterers gives salt-and-pepper speckle; multi-looking / filtering trades resolution for smoothness.</span></div>
              <div className="sar-mode"><b>InSAR &amp; DInSAR</b><span>Phase between two passes → elevation (DEMs); phase change → mm-scale ground deformation (quakes, subsidence).</span></div>
              <div className="sar-mode"><b>Applications</b><span>All-weather mapping, ships &amp; ice, floods, agriculture, forestry biomass, disaster and deformation monitoring.</span></div>
            </div>
            <div className="rect-summary">
              <b>Why SAR is powerful</b>
              <p>
                A radar antenna only metres long, flown along a track, behaves like an antenna <b>kilometres</b> long. Range detail
                comes from <b>bandwidth</b> (chirp + pulse compression, δR = c/2B); azimuth detail comes from the <b>Doppler
                history</b> collected along the flight, synthesising an aperture for δaz = D/2. Because it supplies its own microwave
                illumination, SAR works in darkness and through cloud — and its <b>phase</b> is so stable that repeat passes measure
                terrain height and ground motion to the millimetre.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
