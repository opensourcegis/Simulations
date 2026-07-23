import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './ranging.css';

const C = 299792458; // speed of light, m/s
const DMAX = 300; // metres (full-scale of the scene)
const SCENE_W = 700; const SCENE_H = 300;
const TIME_W = 700; const TIME_H = 200;

const tofNs = (R) => (2 * R / C) * 1e9; // round-trip time in nanoseconds
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// A short oscillating wave packet (sine under a Gaussian envelope) — used so the
// outgoing pulse and the returning echo actually look like waves.
function wavePacket(ctx, cx, yBase, color, amp, half, k, phase = 0) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.beginPath();
  for (let x = -half; x <= half; x += 2) {
    const env = Math.exp(-((x / (half * 0.55)) ** 2));
    const y = yBase - amp * env * Math.sin(x * k + phase);
    const px = cx + x;
    if (x === -half) ctx.moveTo(px, y); else ctx.lineTo(px, y);
  }
  ctx.stroke();
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.arc(cx, yBase, 4, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// PULSED (time-of-flight) scene.  prog: 0..1 over one round trip.
// ---------------------------------------------------------------------------
function drawPulseScene(ctx, { distance, prog, active }) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const g = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  g.addColorStop(0, '#0e1e2e'); g.addColorStop(1, '#0a1420');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  const y = 150; const sensorX = 70;
  const targetX = sensorX + (distance / DMAX) * 560;

  ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, y + 60); ctx.lineTo(SCENE_W - 20, y + 60); ctx.stroke();
  ctx.fillStyle = '#7d8fa1'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let d = 0; d <= DMAX; d += 50) { const x = sensorX + (d / DMAX) * 560; ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.beginPath(); ctx.moveTo(x, y + 55); ctx.lineTo(x, y + 65); ctx.stroke(); ctx.fillStyle = '#7d8fa1'; ctx.fillText(`${d}`, x, y + 80); }
  ctx.textAlign = 'left'; ctx.fillText('m', SCENE_W - 40, y + 80);

  ctx.strokeStyle = 'rgba(90,200,232,.22)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sensorX + 18, y); ctx.lineTo(targetX, y); ctx.stroke(); ctx.setLineDash([]);

  ctx.fillStyle = '#5b6b7a'; ctx.fillRect(targetX, y - 42, 16, 90);
  ctx.fillStyle = '#41505e'; ctx.fillRect(targetX + 16, y - 42, 6, 90);
  ctx.fillStyle = '#8ea3b5'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('target', targetX + 8, y - 52); ctx.textAlign = 'left';

  ctx.fillStyle = '#e8eff5'; ctx.strokeStyle = '#0b2434'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(sensorX - 34, y - 20, 52, 40, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#55c8e8'; ctx.beginPath(); ctx.arc(sensorX + 16, y, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0b2434'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('LiDAR', sensorX - 8, y + 4); ctx.textAlign = 'left';

  if (active) {
    const outbound = prog < 0.5;
    const frac = outbound ? prog / 0.5 : 1 - (prog - 0.5) / 0.5;
    const px = sensorX + 18 + frac * (targetX - sensorX - 18);
    wavePacket(ctx, px, y, outbound ? '#5ad1ff' : '#ffae4d', 15, 34, 0.5, prog * 40);
    if (!outbound) { ctx.fillStyle = '#ffae4d'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('return echo', px, y - 44); ctx.textAlign = 'left'; }
    if (outbound && frac > 0.9) { ctx.strokeStyle = 'rgba(255,174,77,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(targetX, y, 10 + (frac - 0.9) * 200, 0, TAU); ctx.stroke(); }
  }

  const t = prog * tofNs(distance);
  ctx.fillStyle = '#dbe9f2'; ctx.font = '700 20px "Segoe UI", system-ui'; ctx.textAlign = 'left';
  ctx.fillText(`t = ${t.toFixed(0)} ns`, 44, 42);
  ctx.fillStyle = '#7ee0c4'; ctx.font = '600 13px system-ui';
  ctx.fillText(`range = c · t / 2 = ${(C * (t * 1e-9) / 2).toFixed(1)} m`, 44, 64);
}

// Pulsed timing diagram: transmitted + received wave packets on a time axis.
function drawPulseTiming(ctx, { distance, prog, active, pulseWidth }) {
  ctx.clearRect(0, 0, TIME_W, TIME_H);
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, TIME_W, TIME_H);
  const left = 60; const right = TIME_W - 24; const mid = TIME_H / 2 + 6; const top = 30;
  const tMax = tofNs(DMAX) * 1.05;
  const X = (ns) => left + (ns / tMax) * (right - left);

  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(left, mid); ctx.lineTo(right, mid); ctx.stroke();
  ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let ns = 0; ns <= tMax; ns += 400) { const x = X(ns); ctx.strokeStyle = 'rgba(140,163,181,.16)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, TIME_H - 24); ctx.stroke(); ctx.fillStyle = '#8ea3b5'; ctx.fillText(`${ns}`, x, TIME_H - 10); }
  ctx.textAlign = 'left'; ctx.fillText('time (ns)', right - 54, TIME_H - 10);

  const half = clamp((pulseWidth / tMax) * (right - left) * 1.6, 10, 60);
  const packet = (cx, color, label) => { wavePacket(ctx, cx, mid, color, 30, half, 0.36); ctx.fillStyle = color; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(label, cx, top - 8); ctx.textAlign = 'left'; };

  const tof = tofNs(distance);
  packet(X(0), '#5ad1ff', 'TX (emitted)');
  const nowNs = prog * tof;
  if (!active || prog >= 1) packet(X(tof), '#ffae4d', 'RX (return wave)');
  else if (prog > 0.5) { ctx.globalAlpha = (prog - 0.5) / 0.5; packet(X(nowNs), '#ffae4d', 'RX (return wave)'); ctx.globalAlpha = 1; }

  if (!active || prog >= 1) {
    ctx.strokeStyle = '#f6c85f'; ctx.lineWidth = 1.5; const yb = top - 2;
    ctx.beginPath(); ctx.moveTo(X(0), yb); ctx.lineTo(X(tof), yb); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(0), yb - 4); ctx.lineTo(X(0), yb + 4); ctx.moveTo(X(tof), yb - 4); ctx.lineTo(X(tof), yb + 4); ctx.stroke();
    ctx.fillStyle = '#f6c85f'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(`Δt = ${tof.toFixed(0)} ns`, (X(0) + X(tof)) / 2, yb - 5); ctx.textAlign = 'left';
  }
  if (active && prog < 1) { ctx.strokeStyle = 'rgba(126,224,196,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(X(nowNs), top); ctx.lineTo(X(nowNs), TIME_H - 24); ctx.stroke(); ctx.setLineDash([]); }
}

// ---------------------------------------------------------------------------
// CONTINUOUS-WAVE (phase) scene: an unbroken modulation wave runs out to the
// target and the reflected wave runs back, so the round trip spans 2R/λ cycles.
// ---------------------------------------------------------------------------
function drawCwScene(ctx, { distance, lambda, theta }) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const g = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  g.addColorStop(0, '#0e1e2e'); g.addColorStop(1, '#0a1420');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  const sensorX = 70; const targetX = sensorX + (distance / DMAX) * 560;
  const pxPerM = 560 / DMAX; const lambdaPx = lambda * pxPerM;
  const outY = 116; const backY = 190;

  // ruler
  ctx.fillStyle = '#7d8fa1'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 250); ctx.lineTo(SCENE_W - 20, 250); ctx.stroke();
  for (let d = 0; d <= DMAX; d += 50) { const x = sensorX + (d / DMAX) * 560; ctx.beginPath(); ctx.moveTo(x, 245); ctx.lineTo(x, 255); ctx.stroke(); ctx.fillText(`${d}`, x, 268); }
  ctx.textAlign = 'left'; ctx.fillText('m', SCENE_W - 40, 268);

  const sineAlong = (yBase, x0, x1, color, phase, dir) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.beginPath();
    const step = x1 > x0 ? 3 : -3;
    for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += step) {
      const y = yBase - 13 * Math.sin((TAU / lambdaPx) * (x - sensorX) - dir * phase);
      if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  // outgoing (cyan) above, returning (orange) below — returning carries the full round-trip phase
  sineAlong(outY, sensorX + 18, targetX, '#5ad1ff', theta, 1);
  const roundTripPhase = theta + (TAU / lambdaPx) * 2 * (targetX - sensorX - 18);
  sineAlong(backY, targetX, sensorX + 18, '#ffae4d', roundTripPhase, -1);

  // wavelength marker
  if (lambdaPx < 520 && targetX - sensorX - 18 > lambdaPx) {
    ctx.strokeStyle = 'rgba(246,200,95,.9)'; ctx.lineWidth = 1.4;
    const mx = sensorX + 40;
    ctx.beginPath(); ctx.moveTo(mx, outY - 22); ctx.lineTo(mx + lambdaPx, outY - 22); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(mx, outY - 26); ctx.lineTo(mx, outY - 18); ctx.moveTo(mx + lambdaPx, outY - 26); ctx.lineTo(mx + lambdaPx, outY - 18); ctx.stroke();
    ctx.fillStyle = '#f6c85f'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('λ', mx + lambdaPx / 2, outY - 28); ctx.textAlign = 'left';
  }

  // target + sensor
  ctx.fillStyle = '#5b6b7a'; ctx.fillRect(targetX, 96, 16, 118);
  ctx.fillStyle = '#41505e'; ctx.fillRect(targetX + 16, 96, 6, 118);
  ctx.fillStyle = '#e8eff5'; ctx.strokeStyle = '#0b2434'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.roundRect(sensorX - 34, 133, 52, 44, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0b2434'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('LiDAR', sensorX - 8, 158); ctx.textAlign = 'left';
  ctx.fillStyle = '#5ad1ff'; ctx.font = '600 11px system-ui'; ctx.fillText('transmitted →', sensorX + 26, outY - 2);
  ctx.fillStyle = '#ffae4d'; ctx.fillText('← reflected (return wave)', sensorX + 26, backY + 24);

  const cycles = 2 * distance / lambda;
  ctx.fillStyle = '#dbe9f2'; ctx.font = '700 15px "Segoe UI", system-ui';
  ctx.fillText(`round trip 2R = ${cycles.toFixed(2)} × λ`, 44, 34);
}

// CW phase chart: reference (TX) and received (RX) sinusoids with Δφ + phasor.
function drawPhaseChart(ctx, { phi, theta }) {
  ctx.clearRect(0, 0, TIME_W, TIME_H);
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, TIME_W, TIME_H);
  const left = 54; const right = TIME_W - 150; const mid = TIME_H / 2; const A = 46;
  const cycles = 2.4; const periodPx = (right - left) / cycles;
  const k = TAU / periodPx;

  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(left, mid); ctx.lineTo(right, mid); ctx.stroke();

  const wave = (phase, color, w) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); for (let x = left; x <= right; x += 2) { const y = mid - A * Math.sin(k * (x - left) + theta - phase); if (x === left) ctx.moveTo(x, y); else ctx.lineTo(x, y); } ctx.stroke(); };
  wave(0, '#5ad1ff', 2.6); // TX reference
  wave(phi, '#ffae4d', 2.6); // RX, lagging by φ

  // Δφ bracket between a TX zero-crossing (rising) and the RX one
  const shiftPx = (phi / TAU) * periodPx;
  const x0 = left + periodPx * 0.5;
  ctx.strokeStyle = '#f6c85f'; ctx.lineWidth = 1.5; const yb = mid + A + 16;
  ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x0 + shiftPx, yb); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0, yb - 4); ctx.lineTo(x0, yb + 4); ctx.moveTo(x0 + shiftPx, yb - 4); ctx.lineTo(x0 + shiftPx, yb + 4); ctx.stroke();
  ctx.fillStyle = '#f6c85f'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(`Δφ = ${(phi * 180 / Math.PI).toFixed(0)}°`, x0 + shiftPx / 2, yb + 16); ctx.textAlign = 'left';

  ctx.fillStyle = '#5ad1ff'; ctx.font = '600 11px system-ui'; ctx.fillText('TX reference', left, 16);
  ctx.fillStyle = '#ffae4d'; ctx.fillText('RX received (phase-shifted)', left + 92, 16);

  // phasor
  const cx = right + 66; const cy = mid; const r = 46;
  ctx.strokeStyle = 'rgba(140,163,181,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  const arrow = (ang, color) => { const ex = cx + r * Math.cos(ang); const ey = cy - r * Math.sin(ang); ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex, ey, 3.2, 0, TAU); ctx.fill(); };
  arrow(theta, '#5ad1ff'); arrow(theta - phi, '#ffae4d');
  ctx.strokeStyle = 'rgba(246,200,95,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 15, -theta, -(theta - phi), phi <= 0); ctx.stroke();
  ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.textAlign = 'center'; ctx.fillText('phasor', cx, cy + r + 15); ctx.textAlign = 'left';
}

// Ambiguity-resolution number line: the fine tone allows a comb of candidate
// ranges (every λ/2); the coarse tone's unambiguous estimate picks the right
// one, which is exactly how the integer N is found.
const COMB_W = 640; const COMB_H = 150;
// Animatable comb. When markerR is null it shows the finished result (all
// candidates lit, N revealed); during the animation the marker sweeps out from
// 0, candidates light as it passes and countN ticks up until it snaps to N.
function drawComb(ctx, o) {
  const u = o.unambFine; const fr = o.fracFine; const coarseR = o.coarseR; const N = o.N;
  const coarseVisible = o.coarseVisible ?? 1;
  const markerR = o.markerR === undefined ? null : o.markerR;
  const revealN = o.revealN ?? true;
  const pulse = o.pulse ?? 0;
  ctx.clearRect(0, 0, COMB_W, COMB_H);
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, COMB_W, COMB_H);
  const left = 44; const right = COMB_W - 20; const baseY = COMB_H - 30;
  const X = (m) => left + (m / DMAX) * (right - left);

  ctx.fillStyle = '#8ea3b5'; ctx.font = '10.5px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('cyan: candidate ranges from fine phase (every λ/2)', left, 14);
  ctx.fillStyle = '#ffae4d'; ctx.fillText('orange: coarse estimate', left + 328, 14);

  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(left, baseY); ctx.lineTo(right, baseY); ctx.stroke();
  ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let d = 0; d <= DMAX; d += 50) { const x = X(d); ctx.strokeStyle = 'rgba(140,163,181,.2)'; ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, baseY + 5); ctx.stroke(); ctx.fillStyle = '#8ea3b5'; ctx.fillText(`${d}`, x, baseY + 17); }
  ctx.textAlign = 'left'; ctx.fillText('m', right - 6, baseY + 17);

  // candidate comb
  const maxN = Math.floor((DMAX - fr * u) / u);
  for (let n = 0; n <= maxN; n += 1) {
    const Rn = (n + fr) * u; const x = X(Rn); const isN = n === N;
    const passed = markerR === null ? true : Rn <= markerR + 0.001;
    let color; let h;
    if (isN && revealN) { color = '#4ade80'; h = 52; }
    else if (passed) { color = 'rgba(90,209,255,.8)'; h = 20; }
    else { color = 'rgba(120,150,175,.3)'; h = 12; }
    ctx.strokeStyle = color; ctx.lineWidth = isN && revealN ? 2.6 : 1.2;
    ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, baseY - h * (isN && revealN ? 1 + 0.14 * pulse : 1)); ctx.stroke();
    if (isN && revealN) { ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.arc(x, baseY - 52, 3.5 + pulse * 1.6, 0, TAU); ctx.fill(); ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`N=${n}`, x, baseY - 60); ctx.textAlign = 'left'; }
  }

  // coarse estimate + ±λ/4 band (grows in with coarseVisible)
  if (coarseVisible > 0.01) {
    ctx.globalAlpha = coarseVisible;
    const bandHalf = u * 0.5;
    const bx0 = X(Math.max(0, coarseR - bandHalf)); const bx1 = X(Math.min(DMAX, coarseR + bandHalf));
    ctx.fillStyle = 'rgba(255,174,77,.14)'; ctx.fillRect(bx0, baseY - 66, bx1 - bx0, 66);
    ctx.strokeStyle = '#ffae4d'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(coarseR), baseY - 70); ctx.lineTo(X(coarseR), baseY); ctx.stroke();
    ctx.fillStyle = '#ffae4d'; ctx.beginPath(); ctx.moveTo(X(coarseR), baseY - 70); ctx.lineTo(X(coarseR) - 5, baseY - 80); ctx.lineTo(X(coarseR) + 5, baseY - 80); ctx.closePath(); ctx.fill();
    ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`coarse R ≈ ${coarseR.toFixed(0)} m`, X(coarseR), baseY - 84); ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // sweeping counter marker
  if (markerR !== null) {
    const x = X(markerR);
    ctx.strokeStyle = 'rgba(126,224,196,.9)'; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(x, baseY); ctx.lineTo(x, 24); ctx.stroke(); ctx.setLineDash([]);
    const label = o.countN === null ? 'counting…' : `N = ${o.countN}`;
    ctx.font = '700 14px "Segoe UI", system-ui'; const w = ctx.measureText(label).width + 14;
    const bx = clamp(x - w / 2, 2, COMB_W - w - 2);
    ctx.fillStyle = 'rgba(10,17,24,.9)'; ctx.strokeStyle = '#7ee0c4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx, 6, w, 20, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#7ee0c4'; ctx.textAlign = 'center'; ctx.fillText(label, bx + w / 2, 21); ctx.textAlign = 'left';
  }
}

// ---------------------------------------------------------------------------
// MULTI-FREQUENCY: a ladder of modulation tones that together cover the whole
// range with precision. The coarsest tone's half-wavelength spans the entire
// measurement range (unambiguous); each finer tone repeats 6× more often,
// adding precision while the coarser tones tell it which cycle it is in.
// ---------------------------------------------------------------------------
const LADDER_COLORS = ['#ff9f45', '#f6c85f', '#5ad1ff', '#7ee0c4'];
function buildTones(n) { const t = []; for (let i = 0; i < n; i += 1) { const unamb = DMAX / (6 ** i); t.push({ f: C / (2 * unamb), unamb }); } return t; }

function drawLadder(ctx, W, H, tones, R, activeTone, win) {
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, W, H);
  const left = 112; const right = W - 16; const top = 28; const laneH = 40; const gap = 18;
  const X = (r) => left + (r / DMAX) * (right - left);
  const lastBottom = top + (tones.length - 1) * (laneH + gap) + laneH;

  if (win) { ctx.fillStyle = 'rgba(126,224,196,.10)'; ctx.fillRect(X(win.lo), top - 6, Math.max(2, X(win.hi) - X(win.lo)), lastBottom - top + 12); }

  ctx.fillStyle = '#8ea3b5'; ctx.font = '10.5px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('phase each tone reads (0–360°) across the whole range — coarse ramps once, finer tones repeat', left - 4, 15);

  tones.forEach((tone, i) => {
    const y0 = top + i * (laneH + gap); const y1 = y0 + laneH; const col = LADDER_COLORS[i] || '#5ad1ff';
    if (activeTone === i) { ctx.fillStyle = 'rgba(126,224,196,.09)'; ctx.fillRect(left, y0 - 4, right - left, laneH + 8); }
    ctx.strokeStyle = 'rgba(140,163,181,.16)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(left, y1); ctx.lineTo(right, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(left, y0); ctx.lineTo(right, y0); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); let prev = null;
    for (let px = 0; px <= right - left; px += 2) { const r = (px / (right - left)) * DMAX; const ph = (r / tone.unamb) % 1; const x = left + px; const y = y1 - ph * laneH; if (prev === null || ph < prev) ctx.moveTo(x, y); else ctx.lineTo(x, y); prev = ph; }
    ctx.stroke();
    const phR = (R / tone.unamb) % 1; const dy = y1 - phR * laneH;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(R), dy, 4.5, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.textAlign = 'right'; ctx.fillStyle = '#dbe9f2'; ctx.font = '600 11px system-ui'; ctx.fillText(`${(tone.f / 1e6).toFixed(tone.f < 1e6 ? 2 : 1)} MHz`, left - 12, y0 + 15);
    ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.fillText(`λ/2 = ${tone.unamb >= 10 ? tone.unamb.toFixed(0) : tone.unamb.toFixed(1)} m`, left - 12, y0 + 30);
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(140,163,181,.7)'; ctx.font = '9px system-ui'; ctx.fillText('360', left + 3, y0 + 9); ctx.fillText('0', left + 3, y1 - 2);
  });

  ctx.strokeStyle = 'rgba(126,224,196,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(X(R), top - 6); ctx.lineTo(X(R), lastBottom + 20); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let d = 0; d <= DMAX; d += 50) { const x = X(d); ctx.strokeStyle = 'rgba(140,163,181,.25)'; ctx.beginPath(); ctx.moveTo(x, lastBottom + 16); ctx.lineTo(x, lastBottom + 20); ctx.stroke(); ctx.fillStyle = '#8ea3b5'; ctx.fillText(`${d}`, x, lastBottom + 32); }
  ctx.textAlign = 'left'; ctx.fillText('true range (m)', right - 74, lastBottom + 32);
}

function drawNarrow(ctx, W, H, tones, R, win, activeTone, finalDone) {
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, W, H);
  const left = 44; const right = W - 20; const y = H - 28;
  const X = (r) => left + (r / DMAX) * (right - left);
  const precision = tones[tones.length - 1].unamb / 60;
  ctx.strokeStyle = 'rgba(140,163,181,.5)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let d = 0; d <= DMAX; d += 50) { const x = X(d); ctx.strokeStyle = 'rgba(140,163,181,.2)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 5); ctx.stroke(); ctx.fillStyle = '#8ea3b5'; ctx.fillText(`${d}`, x, y + 16); }
  ctx.textAlign = 'left'; ctx.fillText('m', right - 6, y + 16);
  const w = win || { lo: R - precision / 2, hi: R + precision / 2 };
  const lo = Math.max(0, w.lo); const hi = Math.min(DMAX, w.hi);
  const col = finalDone ? '#4ade80' : '#7ee0c4';
  ctx.fillStyle = finalDone ? 'rgba(74,222,128,.16)' : 'rgba(126,224,196,.16)';
  ctx.fillRect(X(lo), y - 44, Math.max(2, X(hi) - X(lo)), 44);
  ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.strokeRect(X(lo), y - 44, Math.max(2, X(hi) - X(lo)), 44);
  ctx.beginPath(); ctx.moveTo(X(R), y - 48); ctx.lineTo(X(R), y); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(R), y - 48, 4, 0, TAU); ctx.fill();
  const width = hi - lo;
  const lab = finalDone ? `resolved ≈ ${R.toFixed(2)} m  (±${(precision / 2).toFixed(2)} m)` : `tone ${activeTone + 1} · ${(tones[activeTone].f / 1e6).toFixed(activeTone === 0 ? 2 : 1)} MHz → window ${width < 10 ? width.toFixed(2) : width.toFixed(0)} m`;
  ctx.font = '600 12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = col;
  ctx.fillText(lab, clamp(X((lo + hi) / 2), 90, W - 90), y - 52); ctx.textAlign = 'left';
}

export default function LidarRanging() {
  const [mode, setMode] = useState('pulsed'); // 'pulsed' | 'phase'
  const [distance, setDistance] = useState(120);
  const [speed, setSpeed] = useState(1);
  const [continuous, setContinuous] = useState(false);
  const [pulseWidth, setPulseWidth] = useState(10); // ns
  const [prf, setPrf] = useState(100); // kHz
  const [fMod, setFMod] = useState(13); // MHz (CW modulation frequency)
  const [nTones, setNTones] = useState(3); // multi-frequency ladder size
  const [measured, setMeasured] = useState(null);

  const sceneRef = useRef(null); const chartRef = useRef(null); const combRef = useRef(null);
  const ladderRef = useRef(null); const narrowRef = useRef(null);
  const params = useRef({}); const anim = useRef({ active: false, start: 0, prog: 0 });
  const combAnim = useRef({ playing: false, start: 0 });
  const multiAnim = useRef({ playing: false, start: 0 });
  params.current = { mode, distance, speed, continuous, pulseWidth, fMod, nTones };

  const fire = () => { anim.current = { active: true, start: performance.now(), prog: 0 }; };
  const playComb = () => { combAnim.current = { playing: true, start: performance.now() }; };
  const playResolve = () => { multiAnim.current = { playing: true, start: performance.now() }; };

  useEffect(() => {
    let raf;
    const loop = (now) => {
      const p = params.current; const a = anim.current;
      const sc = sceneRef.current; const ch = chartRef.current;
      if (p.mode === 'multi') {
        const tones = buildTones(p.nTones); const n = tones.length;
        const precision = tones[n - 1].unamb / 60;
        const wEnd = (i) => (i + 1 < n ? tones[i + 1].unamb : precision);
        const ma = multiAnim.current;
        let activeTone = -1; let win = null; let finalDone = true;
        if (ma.playing) {
          finalDone = false;
          const per = 1.15; const prog = (now - ma.start) / 1000; const stage = Math.floor(prog / per);
          if (stage >= n) { ma.playing = false; win = { lo: p.distance - precision / 2, hi: p.distance + precision / 2 }; finalDone = true; }
          else {
            activeTone = stage;
            const tIn = (prog - stage * per) / per; const e = tIn < 0.5 ? 2 * tIn * tIn : 1 - ((-2 * tIn + 2) ** 2) / 2;
            const wStart = stage === 0 ? DMAX : wEnd(stage - 1); const cur = wStart + (wEnd(stage) - wStart) * e;
            win = { lo: p.distance - cur / 2, hi: p.distance + cur / 2 };
          }
        }
        const lr = ladderRef.current; const nr = narrowRef.current;
        if (lr) drawLadder(lr.getContext('2d'), lr.width, lr.height, tones, p.distance, activeTone, win);
        if (nr) drawNarrow(nr.getContext('2d'), nr.width, nr.height, tones, p.distance, win, activeTone, finalDone);
        raf = requestAnimationFrame(loop); return;
      }
      if (p.mode === 'pulsed') {
        if (a.active) {
          const dur = (0.7 + (p.distance / DMAX) * 3.0) / p.speed;
          a.prog = clamp((now - a.start) / (dur * 1000), 0, 1);
          if (a.prog >= 1) { const tof = tofNs(p.distance); setMeasured({ range: C * (tof * 1e-9) / 2 }); if (p.continuous) { a.start = now; a.prog = 0; } else { a.active = false; } }
        }
        if (sc) drawPulseScene(sc.getContext('2d'), { distance: p.distance, prog: a.prog, active: a.active });
        if (ch) drawPulseTiming(ch.getContext('2d'), { distance: p.distance, prog: a.prog, active: a.active, pulseWidth: p.pulseWidth });
      } else {
        const f = p.fMod * 1e6; const lambda = C / f; const unamb = lambda / 2;
        const ratio = p.distance / unamb; const Nn = Math.floor(ratio); const fr = ratio - Nn;
        const phi = fr * TAU;
        const theta = (now * 0.0018 * p.speed) % TAU;
        if (sc) drawCwScene(sc.getContext('2d'), { distance: p.distance, lambda, theta });
        if (ch) drawPhaseChart(ch.getContext('2d'), { phi, theta });
        const cb = combRef.current;
        if (cb) {
          const base = { unambFine: unamb, fracFine: fr, coarseR: p.distance, N: Nn };
          const ca = combAnim.current;
          if (ca.playing) {
            const prog = (now - ca.start) / 1000;
            let o;
            if (prog < 0.9) o = { ...base, coarseVisible: prog / 0.9, markerR: 0, countN: null, revealN: false };
            else if (prog < 2.7) { const t = (prog - 0.9) / 1.8; const markerR = t * p.distance; let c = null; for (let n = 0; n <= Nn; n += 1) if ((n + fr) * unamb <= markerR) c = n; o = { ...base, coarseVisible: 1, markerR, countN: c, revealN: false }; }
            else { o = { ...base, coarseVisible: 1, markerR: null, countN: Nn, revealN: true, pulse: Math.abs(Math.sin((prog - 2.7) * 4)) }; }
            drawComb(cb.getContext('2d'), o);
            if (prog > 4.2) ca.playing = false;
          } else {
            drawComb(cb.getContext('2d'), { ...base, coarseVisible: 1, markerR: null, countN: Nn, revealN: true, pulse: 0 });
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Pulsed readouts
  const tof = tofNs(distance); const oneWay = tof / 2;
  const rangeRes = C * (pulseWidth * 1e-9) / 2;
  const rMax = C / (2 * prf * 1e3);
  // Phase readouts (fine tone)
  const f = fMod * 1e6; const lambda = C / f; const unamb = lambda / 2;
  const ratio = distance / unamb; const N = Math.floor(ratio); const frac = ratio - N;
  const phiDeg = frac * 360; const rPhase = frac * unamb; // ambiguous (phase-only) range
  const phasePrecision = unamb / 360; // metres per degree of phase
  // Coarse tone used to resolve N: λ/2 spans the whole scene, so it is unambiguous.
  const F_COARSE = 0.45e6; const lambdaCoarse = C / F_COARSE; const unambCoarse = lambdaCoarse / 2;
  const phiCoarseDeg = (distance / unambCoarse) * 360; // no wrap: distance < unambCoarse
  const coarseR = (phiCoarseDeg / 360) * unambCoarse; // = distance (coarse, unambiguous)
  const Ncalc = Math.round(coarseR / unamb - frac);
  // Multi-frequency ladder readouts
  const tones = buildTones(nTones);
  const ladderH = 28 + nTones * (40 + 18) + 24;
  const finePrecision = tones[nTones - 1].unamb / 60;

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>&larr; All simulators</a>
        <div className="title-block">
          <h1>LiDAR Ranging <span className="native-badge">Native React</span></h1>
          <span className="sub">Turning light into distance: pulse timing, continuous-wave phase, and multi-frequency modulation</span>
        </div>
        <span className="score-chip">c &#8776; <b>3&times;10&#8312; m/s</b></span>
      </header>

      <div className="rng-modes">
        <button className={`rng-seg ${mode === 'pulsed' ? 'on' : ''}`} onClick={() => setMode('pulsed')}>Pulsed &mdash; time of flight</button>
        <button className={`rng-seg ${mode === 'phase' ? 'on' : ''}`} onClick={() => setMode('phase')}>Continuous wave &mdash; phase</button>
        <button className={`rng-seg ${mode === 'multi' ? 'on' : ''}`} onClick={() => setMode('multi')}>Multi-frequency &mdash; full range</button>
      </div>

      {mode === 'pulsed' ? (
        <div className="sim-layout" key="pulsed">
          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">1</span> Fire a pulse <small>&mdash; watch it travel out and the wave return</small></h2>
              <canvas ref={sceneRef} className="rng-canvas" width={SCENE_W} height={SCENE_H} />
              <div className="rng-fire">
                <button className="rng-btn" onClick={fire}>▶ Fire pulse</button>
                <label className="rng-chk"><input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} /> continuous</label>
                <span style={{ flex: 1 }} />
                <label className="rng-chk">slow-mo<input type="range" min="0.3" max="4" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} style={{ accentColor: '#0f8a4d' }} /></label>
              </div>
              <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Target distance R <b>{distance} m</b><input type="range" min="10" max={DMAX} step="1" value={distance} onChange={(e) => setDistance(Number(e.target.value))} /></label>
              </div>
              <div className="rng-legend">
                <span><i className="rng-swatch" style={{ background: '#5ad1ff' }} /> outgoing pulse</span>
                <span><i className="rng-swatch" style={{ background: '#ffae4d' }} /> returning echo wave</span>
                <span><i className="rng-swatch" style={{ background: '#7ee0c4' }} /> live range estimate</span>
              </div>
            </section>

            <section className="sim-panel">
              <h2><span className="stepno">2</span> Timing measurement <small>&mdash; the transmitted &amp; return waveforms</small></h2>
              <canvas ref={chartRef} className="rng-canvas" width={TIME_W} height={TIME_H} />
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                <div><span>round-trip Δt</span><b>{tof.toFixed(0)} ns</b></div>
                <div><span>one-way time</span><b>{oneWay.toFixed(0)} ns</b></div>
                <div><span>measured range</span><b className="orange">{measured ? measured.range.toFixed(1) : '—'} m</b></div>
              </div>
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">3</span> The ranging equation</h2>
              <div className="equation big">R = c &middot; Δt / 2</div>
              <div className="equation big">R = 3&times;10&#8312; &middot; {(tof * 1e-9).toExponential(2)} / 2 = <b>{distance.toFixed(1)} m</b></div>
              <div className="rng-note"><b>Why divide by two?</b> The clock measures the <b>round trip</b> — out to the target and back — so the light travels <b>2R</b>. Halving the total path gives the one-way distance. Light covers ~0.3 m per nanosecond, so a 1 ns timing error is a 15 cm range error.</div>
              <div className="rng-sub">Range resolution</div>
              <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Pulse width τ <b>{pulseWidth} ns</b><input type="range" min="1" max="40" step="1" value={pulseWidth} onChange={(e) => setPulseWidth(Number(e.target.value))} /></label>
              </div>
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                <div><span>ΔR = c·τ / 2</span><b>{rangeRes.toFixed(2)} m</b></div>
                <div><span>meaning</span><b style={{ fontSize: 12 }}>closest separable</b></div>
              </div>
              <div className="rng-note"><b>Shorter pulses see finer detail.</b> Two surfaces closer than ΔR return overlapping echoes the sensor can&rsquo;t separate.</div>
              <div className="rng-sub">Maximum unambiguous range</div>
              <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
                <label>Pulse rate (PRF) <b>{prf} kHz</b><input type="range" min="10" max="400" step="5" value={prf} onChange={(e) => setPrf(Number(e.target.value))} /></label>
              </div>
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                <div><span>R_max = c / (2·PRF)</span><b>{rMax >= 1000 ? `${(rMax / 1000).toFixed(2)} km` : `${rMax.toFixed(0)} m`}</b></div>
                <div><span>target R</span><b className={distance > rMax ? 'orange' : ''}>{distance} m</b></div>
              </div>
              <div className="rng-note"><b>Fire too fast and range wraps.</b> If the next pulse leaves before the last echo returns, the sensor can&rsquo;t tell which pulse an echo belongs to.</div>
            </section>
          </div>
        </div>
      ) : mode === 'phase' ? (
        <div className="sim-layout" key="phase">
          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">1</span> Continuous modulated wave <small>&mdash; it runs to the target and back</small></h2>
              <canvas ref={sceneRef} className="rng-canvas" width={SCENE_W} height={SCENE_H} />
              <div className="control-grid">
                <label>Target distance R <b>{distance} m</b><input type="range" min="10" max={DMAX} step="1" value={distance} onChange={(e) => setDistance(Number(e.target.value))} /></label>
                <label>Modulation frequency f <b>{fMod} MHz</b><input type="range" min="1" max="30" step="1" value={fMod} onChange={(e) => setFMod(Number(e.target.value))} /></label>
              </div>
              <div className="rng-legend">
                <span><i className="rng-swatch" style={{ background: '#5ad1ff' }} /> transmitted wave</span>
                <span><i className="rng-swatch" style={{ background: '#ffae4d' }} /> reflected return wave</span>
                <span>λ = c / f = <b style={{ fontFamily: 'monospace', color: '#16202c' }}>{lambda.toFixed(1)} m</b></span>
              </div>
            </section>

            <section className="sim-panel">
              <h2><span className="stepno">2</span> Phase measurement <small>&mdash; the return lags the reference by Δφ</small></h2>
              <canvas ref={chartRef} className="rng-canvas" width={TIME_W} height={TIME_H} />
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                <div><span>phase shift Δφ</span><b>{phiDeg.toFixed(0)}°</b></div>
                <div><span>wavelength λ</span><b>{lambda.toFixed(1)} m</b></div>
                <div><span>unambiguous λ/2</span><b>{unamb.toFixed(1)} m</b></div>
              </div>
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">3</span> Distance from phase</h2>
              <div className="equation big">Δφ = 2π · (2R / λ)</div>
              <div className="equation big">R = (Δφ / 2π) · (λ / 2) = <b>{rPhase.toFixed(2)} m</b> <span style={{ color: '#7d8fa1' }}>+ N · {unamb.toFixed(1)} m</span></div>
              <div className="rng-note"><b>Phase gives the fraction of a wavelength.</b> The receiver compares the returned modulation to the transmitted reference and measures the phase lag Δφ. That lag pins the distance to a fraction of λ/2 — here <b>{(phiDeg / 360).toFixed(3)}</b> of {unamb.toFixed(1)} m = <b>{rPhase.toFixed(2)} m</b> — with very fine precision (≈ {(phasePrecision * 100).toFixed(1)} cm per degree).</div>

              <div className="rng-sub">How is N calculated? — a second, coarse tone</div>
              <div className="rng-note">
                Phase alone repeats every <b>λ/2 = {unamb.toFixed(1)} m</b>, so it can&rsquo;t tell {rPhase.toFixed(1)} m from {(rPhase + unamb).toFixed(1)} m from {(rPhase + 2 * unamb).toFixed(1)} m… To find <b>N</b>, the sensor adds a <b>coarse modulation tone</b> whose half-wavelength is longer than the whole measurement range, so its phase is <b>unambiguous</b> — a rough distance that tells you which fine cycle you&rsquo;re in.
              </div>
              <div className="rng-fire" style={{ marginTop: 0, marginBottom: 8 }}>
                <button className="rng-btn ghost" onClick={playComb}>▶ Animate the calculation</button>
                <span className="rng-chk">coarse estimate sweeps out, counting whole λ/2 cycles up to N</span>
              </div>
              <canvas ref={combRef} className="rng-canvas" width={COMB_W} height={COMB_H} />
              <div className="equation big" style={{ marginTop: 10 }}>coarse f = 0.45 MHz → λ/2 = {unambCoarse.toFixed(0)} m → R<sub>coarse</sub> ≈ {coarseR.toFixed(1)} m</div>
              <div className="equation big">N = round( R<sub>coarse</sub> / (λ/2) − Δφ/360° ) = round( {(coarseR / unamb).toFixed(2)} − {(frac).toFixed(3)} ) = <b>{Ncalc}</b></div>
              <div className="equation big">R = (N + Δφ/360°) · λ/2 = ({Ncalc} + {(frac).toFixed(3)}) · {unamb.toFixed(2)} = <b>{((Ncalc + frac) * unamb).toFixed(2)} m</b></div>
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                <div><span>coarse R (fixes N)</span><b>{coarseR.toFixed(0)} m</b></div>
                <div><span>whole cycles N</span><b>{Ncalc}</b></div>
                <div><span>fine R (precise)</span><b className="orange">{((Ncalc + frac) * unamb).toFixed(2)} m</b></div>
              </div>
              <div className="rng-note">
                The coarse reading only has to be accurate to within <b>±λ/4 = {(unamb / 2).toFixed(1)} m</b> — just enough to pick the right cyan tick above. The fine tone then supplies the precise fraction (≈ {(phasePrecision * 100).toFixed(1)} cm per degree). <b>Higher fine f → finer precision but more candidate cycles to disambiguate.</b>
              </div>
              <div className="rng-note" style={{ borderLeftColor: '#0f8a4d' }}><b>Pulsed vs phase.</b> Pulsed timing handles long, unambiguous ranges directly; continuous-wave phase gives millimetre-level precision but must resolve N — often with several modulation frequencies, coarse-to-fine.</div>
            </section>
          </div>
        </div>
      ) : (
        <div className="sim-layout" key="multi">
          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">1</span> Modulation ladder <small>&mdash; each tone&rsquo;s phase across the whole range</small></h2>
              <canvas ref={ladderRef} className="rng-canvas" width={660} height={ladderH} />
              <div className="control-grid">
                <label>Target distance R <b>{distance} m</b><input type="range" min="10" max={DMAX} step="1" value={distance} onChange={(e) => setDistance(Number(e.target.value))} /></label>
                <label>Modulation tones <b>{nTones}</b><input type="range" min="2" max="4" step="1" value={nTones} onChange={(e) => setNTones(Number(e.target.value))} /></label>
              </div>
              <div className="rng-legend">
                <span><i className="rng-swatch" style={{ background: '#ff9f45' }} /> coarse (covers whole range)</span>
                <span><i className="rng-swatch" style={{ background: '#5ad1ff' }} /> fine (precise)</span>
                <span>read the dot on each ramp at R = <b style={{ fontFamily: 'monospace', color: '#16202c' }}>{distance} m</b></span>
              </div>
            </section>

            <section className="sim-panel">
              <h2><span className="stepno">2</span> Coarse-to-fine narrowing <small>&mdash; each tone shrinks the window</small></h2>
              <div className="rng-fire" style={{ marginTop: 0, marginBottom: 8 }}>
                <button className="rng-btn ghost" onClick={playResolve}>▶ Resolve coarse → fine</button>
                <span className="rng-chk">the coarse tone locates R across the whole range; finer tones refine it</span>
              </div>
              <canvas ref={narrowRef} className="rng-canvas" width={660} height={110} />
            </section>
          </div>

          <div className="sim-col">
            <section className="sim-panel">
              <h2><span className="stepno">3</span> Why several modulation frequencies?</h2>
              <div className="rng-note">
                A single tone can&rsquo;t do both jobs: a <b>low</b> frequency has a long λ/2 that spans the whole range (so its phase is <b>unambiguous</b>) but reads range coarsely, while a <b>high</b> frequency reads finely but its phase <b>wraps</b> many times. Sending a <b>ladder of frequencies</b> gets both — the coarse tone says roughly where you are, and each finer tone sharpens it while the coarser one tells it which cycle it is in.
              </div>
              <div className="rng-sub">The tone ladder</div>
              {tones.map((t, i) => (
                <div className="readouts" key={i} style={{ gridTemplateColumns: '1.1fr 1fr 1fr', marginBottom: 6 }}>
                  <div><span>{i === 0 ? 'coarse' : i === nTones - 1 ? 'finest' : `tone ${i + 1}`}</span><b style={{ color: LADDER_COLORS[i] }}>{(t.f / 1e6).toFixed(t.f < 1e6 ? 2 : 1)} MHz</b></div>
                  <div><span>unambiguous λ/2</span><b>{t.unamb >= 10 ? t.unamb.toFixed(0) : t.unamb.toFixed(1)} m</b></div>
                  <div><span>phase at R</span><b>{(((distance / t.unamb) % 1) * 360).toFixed(0)}°</b></div>
                </div>
              ))}
              <div className="readouts" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
                <div><span>whole range covered</span><b>0 – {DMAX} m</b></div>
                <div><span>final precision</span><b className="orange">± {(finePrecision / 2).toFixed(2)} m</b></div>
              </div>
              <div className="rng-note">
                Here the coarsest tone (<b>{(tones[0].f / 1e6).toFixed(2)} MHz</b>, λ/2 = {tones[0].unamb.toFixed(0)} m) is unambiguous across the entire <b>0–{DMAX} m</b> range, and the {nTones} tones together pin the target to about <b>±{(finePrecision / 2).toFixed(2)} m</b> — a range-to-precision ratio of roughly <b>{Math.round(DMAX / finePrecision).toLocaleString()}:1</b>. Add tones for finer results.
              </div>
              <div className="rng-note" style={{ borderLeftColor: '#0f8a4d' }}><b>In practice</b> this is how phase-based rangefinders and AMCW LiDAR reach millimetre precision over long ranges: two or more modulation frequencies (or a synthetic “beat” wavelength), measured coarse-to-fine.</div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
