import { useEffect, useRef, useState } from 'react';
import './simulation.css';
import './native.css';
import './ranging.css';
import LidarLearningPanel from './LidarLearningPanel.jsx';
import RangingHardware from './RangingHardware.jsx';
import { rangingBudget, simulateRangingShot, shotNormal, RANGING_INSTRUMENT } from './ranging-model.js';
import { LIGHT_SPEED, roundTripNs, phaseMeasurement, pulseAmbiguity } from '../../games/shared/lidar-physics.js';

const C = LIGHT_SPEED;
const DMAX = 300; // metres (full-scale of the scene)
const SCENE_W = 700; const SCENE_H = 300;
const TIME_W = 700; const TIME_H = 200;

const tofNs = roundTripNs;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

// Optical intensity envelope, not a visible oscillating optical carrier.
function wavePacket(ctx, cx, yBase, color, amp, half) {
  ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.beginPath();
  for (let x = -half; x <= half; x += 2) {
    const env = Math.exp(-((x / (half * 0.55)) ** 2));
    const y = yBase - amp * env;
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
function drawPulseScene(ctx, { distance, prog, active, budget, shot }) {
  ctx.clearRect(0, 0, SCENE_W, SCENE_H);
  const g = ctx.createLinearGradient(0, 0, 0, SCENE_H);
  g.addColorStop(0, '#0e1e2e'); g.addColorStop(1, '#0a1420');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SCENE_W, SCENE_H);
  const y = 150; const sensorX = 70;
  const targetX = sensorX + 18 + (distance / DMAX) * 540;

  ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, y + 60); ctx.lineTo(SCENE_W - 20, y + 60); ctx.stroke();
  ctx.fillStyle = '#7d8fa1'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let d = 0; d <= DMAX; d += 50) { const x = sensorX + 18 + (d / DMAX) * 540; ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.beginPath(); ctx.moveTo(x, y + 55); ctx.lineTo(x, y + 65); ctx.stroke(); ctx.fillStyle = '#7d8fa1'; ctx.fillText(`${d}`, x, y + 80); }
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
    wavePacket(ctx, px, y, outbound ? '#5ad1ff' : '#ffae4d', outbound ? 20 : clamp(budget.snr, 3, 18), 22);
    if (!outbound) { ctx.fillStyle = '#ffae4d'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('return echo', px, y - 44); ctx.textAlign = 'left'; }
    if (outbound && frac > 0.9) { ctx.strokeStyle = 'rgba(255,174,77,.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(targetX, y, 10 + (frac - 0.9) * 200, 0, TAU); ctx.stroke(); }
  }

  const t = prog * budget.flightNs;
  ctx.fillStyle = '#dbe9f2'; ctx.font = '700 20px "Segoe UI", system-ui'; ctx.textAlign = 'left';
  ctx.fillText(`t = ${t.toFixed(0)} ns`, 44, 42);
  ctx.fillStyle = '#7ee0c4'; ctx.font = '600 13px system-ui';
  ctx.fillText(prog >= 1 ? shot?.detected ? `valid return → R = ${shot.range.toFixed(2)} m` : 'no valid return · insufficient signal-to-noise ratio' : 'range unknown until a valid return is processed', 44, 64);
}

// Pulsed timing diagram: transmitted + received wave packets on a time axis.
function drawPulseTiming(ctx, { prog, active, budget, shot }) {
  ctx.clearRect(0, 0, TIME_W, TIME_H);
  ctx.fillStyle = '#0e1620'; ctx.fillRect(0, 0, TIME_W, TIME_H);
  const left = 60; const right = TIME_W - 24; const top = 26;
  const tMax = tofNs(DMAX) * 1.05 + RANGING_INSTRUMENT.systemDelayNs;
  const X = (ns) => left + (ns / tMax) * (right - left);
  ctx.fillStyle = '#8ea3b5'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  for (let ns = 0; ns <= tMax; ns += 400) { const x = X(ns); ctx.strokeStyle = 'rgba(140,163,181,.16)'; ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, TIME_H - 24); ctx.stroke(); ctx.fillStyle = '#8ea3b5'; ctx.fillText(`${ns}`, x, TIME_H - 10); }
  ctx.textAlign = 'left'; ctx.fillText('raw time (ns)', right - 78, TIME_H - 10);
  const finished = prog >= 1;
  const center = shot?.rawDelayNs ?? budget.flightNs + RANGING_INSTRUMENT.systemDelayNs;
  const sigmaPx = Math.max(1.4, budget.echoFwhmNs / 2.355 / tMax * (right-left));
  ctx.fillStyle = '#5ad1ff'; ctx.fillText('TX', 18, 70);
  ctx.fillStyle = '#ffae4d'; ctx.fillText('RX', 18, 144);
  for (const y of [72,145]) { ctx.strokeStyle = '#3e515e'; ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke(); }
  const curve = (base, cx, amplitude, color, noise = false) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    for (let x = left; x <= right; x += .5) {
      // Trace is illustrative input-referred noise; acceptance uses expected
      // matched-filter SNR, not a crossing of these display samples.
      const jitter = noise ? shotNormal((shot?.seed ?? 1)*7919 + Math.round(x*2))*2.5 : 0;
      const yy = base - amplitude*Math.exp(-.5*((x-cx)/sigmaPx)**2) + jitter;
      if (x === left) ctx.moveTo(x,yy); else ctx.lineTo(x,yy);
    }
    ctx.stroke();
  };
  curve(72, X(0), 35, '#5ad1ff');
  ctx.globalAlpha = finished ? 1 : .3;
  curve(145, X(center), Math.min(48,budget.snr*2.5), '#ffae4d', finished);
  ctx.globalAlpha = 1;
  ctx.fillStyle = finished ? '#dbe9f2' : '#8ea3b5'; ctx.font = '600 11px system-ui';
  ctx.fillText(finished ? shot?.detected ? `Raw timestamp ${center.toFixed(1)} ns · subtract 12 ns internal delay` : `No valid return · SNR ${budget.snr.toFixed(1)} < ${RANGING_INSTRUMENT.minimumSnr}` : 'Expected RX (guide only) · no captured measurement', left, 20);
  if (active && prog < 1) { ctx.strokeStyle = '#7ee0c4'; ctx.setLineDash([4,4]); ctx.beginPath(); ctx.moveTo(X(prog*budget.flightNs),top); ctx.lineTo(X(prog*budget.flightNs),176); ctx.stroke(); ctx.setLineDash([]); }
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
  const sensorX = 70; const emitterX = sensorX + 18; const targetX = emitterX + (distance / DMAX) * 540;
  const pxPerM = 540 / DMAX; const lambdaPx = lambda * pxPerM;
  const outY = 116; const backY = 190;

  // ruler
  ctx.fillStyle = '#7d8fa1'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(120,150,175,.25)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(40, 250); ctx.lineTo(SCENE_W - 20, 250); ctx.stroke();
  for (let d = 0; d <= DMAX; d += 50) { const x = emitterX + (d / DMAX) * 540; ctx.beginPath(); ctx.moveTo(x, 245); ctx.lineTo(x, 255); ctx.stroke(); ctx.fillText(`${d}`, x, 268); }
  ctx.textAlign = 'left'; ctx.fillText('m', SCENE_W - 40, 268);

  const sineAlong = (yBase, x0, x1, color, phase, dir) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.beginPath();
    const step = x1 > x0 ? 3 : -3;
    for (let x = x0; dir > 0 ? x <= x1 : x >= x1; x += step) {
      const pathLength = dir > 0 ? x - emitterX : 2 * (targetX - emitterX) - (x - emitterX);
      const y = yBase - 13 * Math.sin(phase - (TAU / lambdaPx) * pathLength);
      if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  // outgoing (cyan) above, returning (orange) below — returning carries the full round-trip phase
  sineAlong(outY, sensorX + 18, targetX, '#5ad1ff', theta, 1);
  sineAlong(backY, targetX, emitterX, '#ffae4d', theta, -1);

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
  const x0 = left + ((TAU - theta % TAU) % TAU) / TAU * periodPx;
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
function buildTones(n) { const t = []; for (let i = 0; i < n; i += 1) { const unamb = (DMAX * 1.2) / (6 ** i); t.push({ f: C / (2 * unamb), unamb }); } return t; }

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
  const lab = finalDone ? `ideal R ≈ ${R.toFixed(2)} m; ±3° phase → ±${(precision / 2).toFixed(2)} m` : `tone ${activeTone + 1} · ${(tones[activeTone].f / 1e6).toFixed(activeTone === 0 ? 2 : 1)} MHz → window ${width < 10 ? width.toFixed(2) : width.toFixed(0)} m`;
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
  const [reflectivity, setReflectivity] = useState(35);
  const [aperture, setAperture] = useState(30);
  const [ambient, setAmbient] = useState(25);
  const [extinction, setExtinction] = useState(0.15);
  const [airIndex, setAirIndex] = useState(1.00027);
  const [playback, setPlayback] = useState({ progress: 0, active: false });
  const [motion, setMotion] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const sceneRef = useRef(null); const chartRef = useRef(null); const combRef = useRef(null);
  const ladderRef = useRef(null); const narrowRef = useRef(null);
  const params = useRef({}); const anim = useRef({ active: false, start: 0, prog: 0 });
  const combAnim = useRef({ playing: false, start: 0 });
  const multiAnim = useRef({ playing: false, start: 0 });
  const shotSeed = useRef(0), lastPlaybackUpdate = useRef(0);
  const budget = rangingBudget({ distance, pulseWidth, reflectivity, aperture, ambient, extinction, airIndex });
  params.current = { mode, distance, speed, continuous, pulseWidth, fMod, nTones, motion, reflectivity, aperture, ambient, extinction, airIndex, budget };

  const fire = () => { setMeasured(null); setPlayback({ progress: 0, active: true }); anim.current = { active: true, start: performance.now(), prog: 0, shot: simulateRangingShot(params.current, ++shotSeed.current) }; };
  const playComb = () => { combAnim.current = { playing: true, start: performance.now() }; };
  const playResolve = () => { multiAnim.current = { playing: true, start: performance.now() }; };

  useEffect(() => {
    setMeasured(null);
    setPlayback({ progress: 0, active: false });
    anim.current = { active: false, start: 0, prog: 0 };
  }, [distance, mode, pulseWidth, reflectivity, aperture, ambient, extinction, airIndex]);

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
          if (a.prog >= 1) { setMeasured(a.shot); if (p.continuous) { a.start = now; a.prog = 0; a.shot = simulateRangingShot(p, ++shotSeed.current); } else { a.active = false; } }
          if (now - lastPlaybackUpdate.current > 85 || !a.active) { setPlayback({ progress: a.prog, active: a.active }); lastPlaybackUpdate.current = now; }
        }
        if (sc) drawPulseScene(sc.getContext('2d'), { distance: p.distance, prog: a.prog, active: a.active, budget: p.budget, shot: a.shot });
        if (ch) drawPulseTiming(ch.getContext('2d'), { prog: a.prog, active: a.active, budget: p.budget, shot: a.shot });
      } else {
        const f = p.fMod * 1e6; const lambda = C / f; const unamb = lambda / 2;
        const ratio = p.distance / unamb; const Nn = Math.floor(ratio); const fr = ratio - Nn;
        const phi = fr * TAU;
        const theta = p.motion ? (now * 0.0018 * p.speed) % TAU : 0;
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
  const tof = budget.flightNs; const oneWay = tof / 2;
  const rangeRes = C / airIndex * (pulseWidth * 1e-9) / 2;
  const { limit: rMax, ambiguous, apparentRange } = pulseAmbiguity(distance, prf);
  // Phase readouts (fine tone)
  const { wavelength: lambda, interval: unamb, cycles: N, phaseDegrees: phiDeg, remainder: rPhase } = phaseMeasurement(distance, fMod);
  const frac = phiDeg / 360;
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
    <div className="rng-lab">
      <header className="rng-header"><a href={import.meta.env.BASE_URL}><span className="rng-brand" aria-hidden="true">⌁</span> GEOSIM <span>/</span> All laboratories</a><span className="rng-lab-id">REMOTE SENSING · LAB 01 / 06</span></header>
      <div className="rng-intro"><div><p className="rng-eyebrow">THE RANGING LAB</p><h1>Light travels. Distance follows.</h1><p>Look inside the optics. Follow the electronics. Find out when a returning pulse can actually become a measurement.</p></div><div className="rng-constant">c = 299,792,458 m/s<small>PULSE MODE · v = c / n IN AIR</small></div></div>
      <div className="rng-modebar">
        <div className="rng-modes" role="tablist" aria-label="Ranging method" onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const buttons = [...event.currentTarget.querySelectorAll('button')];
          const index = buttons.indexOf(document.activeElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
          buttons[next].click(); buttons[next].focus();
        }}>
          {[['pulsed','01','Pulse timing'],['phase','02','Phase comparison'],['multi','03','Multi-frequency']].map(([key,number,title]) => <button key={key} id={'rng-tab-'+key} role="tab" aria-selected={mode === key} aria-controls="rng-workspace" tabIndex={mode === key ? 0 : -1} className={mode === key ? 'on' : ''} onClick={() => setMode(key)}><span>{number}</span>{title}</button>)}
        </div>
        <span className="rng-model-note">FIXED HEAD · NEAR-COAXIAL FAR-FIELD MODEL</span>
      </div>
      <RangingHardware mode={mode} progress={playback.progress} active={playback.active} measured={measured} budget={budget} aperture={aperture} distance={distance} onFire={fire} />
      <main id="rng-workspace" className="rng-workspace" role="tabpanel" aria-labelledby={'rng-tab-'+mode} key={mode}>
        <aside className="rng-controls" aria-label="Experiment configuration">
          <section className="rng-panel">
            <h2><span>01 / CONFIGURE</span>Set the experiment</h2>
            <label className="rng-control">Target distance <b>{distance} m</b><input id="rng-distance" type="range" min="10" max={DMAX} step="1" value={distance} onChange={e => setDistance(Number(e.target.value))} /></label>
            {mode === 'pulsed' ? <>
              <label className="rng-control">Pulse width <b>{pulseWidth} ns</b><input id="rng-width" type="range" min="1" max="40" step="1" value={pulseWidth} onChange={e => setPulseWidth(Number(e.target.value))} /></label>
              <label className="rng-control">Periodic PRF <b>{prf} kHz</b><input id="rng-prf" type="range" min="10" max="1000" step="5" value={prf} onChange={e => setPrf(Number(e.target.value))} /></label>
              <p className="rng-hint">PRF is a separate periodic-pulse ambiguity calculation; the animation traces one pulse.</p>
            </> : mode === 'phase' ? <label className="rng-control">Modulation frequency <b>{fMod} MHz</b><input id="rng-frequency" type="range" min="1" max="30" step="1" value={fMod} onChange={e => setFMod(Number(e.target.value))} /></label>
              : <label className="rng-control">Modulation tones <b>{nTones}</b><input id="rng-tones" type="range" min="2" max="4" step="1" value={nTones} onChange={e => setNTones(Number(e.target.value))} /></label>}
          </section>
          {mode === 'pulsed' && <section className="rng-panel">
            <h2><span>RECEIVER &amp; ENVIRONMENT</span>Will the echo survive?</h2>
            <label className="rng-control">Target reflectance <b>{reflectivity}%</b><input id="rng-reflectivity" type="range" min="1" max="90" step="1" value={reflectivity} onChange={e => setReflectivity(Number(e.target.value))} /></label>
            <label className="rng-control">Receiver aperture <b>{aperture} mm</b><input id="rng-aperture" type="range" min="10" max="80" step="1" value={aperture} onChange={e => setAperture(Number(e.target.value))} /></label>
            <label className="rng-control">In-band background <b>{ambient} e⁻/ns*</b><input id="rng-ambient" type="range" min="0" max="150" step="1" value={ambient} onChange={e => setAmbient(Number(e.target.value))} /></label>
            <label className="rng-control">Atmospheric extinction <b>{extinction.toFixed(2)} km⁻¹</b><input id="rng-extinction" type="range" min="0" max="4" step="0.05" value={extinction} onChange={e => setExtinction(Number(e.target.value))} /></label>
            <label className="rng-control">Air refractive index <b>{airIndex.toFixed(5)}</b><input id="rng-air-index" type="range" min="1" max="1.0004" step="0.00001" value={airIndex} onChange={e => setAirIndex(Number(e.target.value))} /></label>
            <p className="rng-hint">*Background rate at 30 mm aperture, after the optical filter; scales with collecting area. A large, normal-incidence diffuse target fills the beam. Pulse energy is fixed at 100 nJ; the small optical reference tap is included in the assumed optical efficiency.</p>
          </section>}
          <section className="rng-panel">
            <h2><span>02 / OBSERVE</span>{mode === 'pulsed' ? 'Launch the pulse' : mode === 'phase' ? 'Follow the modulation' : 'Resolve the cycles'}</h2>
            {mode === 'pulsed' ? <>
              <button className="rng-action" id="rng-fire" onClick={fire}>Fire a pulse →</button>
              <label className="rng-check"><input type="checkbox" checked={continuous} onChange={e => setContinuous(e.target.checked)} /> Repeat pulses</label>
            </> : mode === 'phase' ? <button className="rng-action secondary" aria-pressed={!motion} onClick={() => setMotion(!motion)}>{motion ? 'Pause wave motion' : 'Play wave motion'}</button> : <button className="rng-action" onClick={playResolve}>Resolve coarse → fine</button>}
            {mode !== 'multi' && <label className="rng-control">Playback speed <b>{speed.toFixed(1)}×</b><input id="rng-speed" type="range" min="0.3" max="4" step="0.1" value={speed} onChange={e => setSpeed(Number(e.target.value))} /></label>}
            <p className="rng-hint">Motion is slowed dramatically. Diagram dimensions and wave heights are schematic, not physical light speed or received power.</p>
          </section>
          <section className="rng-prompt"><span className="rng-eyebrow">TRY THIS</span><p>{mode === 'pulsed' ? 'Move the target to 300 m and fire. Then enlarge the receiver aperture. Can a stronger echo recover a valid range?' : mode === 'phase' ? 'Raise the frequency. How many more possible ranges share the same phase?' : 'Add a tone. What shrinks: the overall range or the finest uncertainty window?'}</p></section>
        </aside>
        <div className="rng-instruments">
          <section className="rng-panel rng-stage">
            <h2><span>LIVE VIEW</span>{mode === 'pulsed' ? 'The round trip' : mode === 'phase' ? 'Outward wave. Returning wave.' : 'The modulation ladder'}<small>{mode === 'multi' ? 'Coarse tones cover the scene; fine tones repeat.' : 'TX → target → RX · range is the one-way path'}</small></h2>
            {mode === 'multi' ? <canvas ref={ladderRef} className="rng-canvas" width={660} height={ladderH} role="img" aria-label="Modulation phase ramps for each tone with a marker at the target distance." /> : <canvas ref={sceneRef} className="rng-canvas" width={SCENE_W} height={SCENE_H} role="img" aria-label={mode === 'pulsed' ? 'Fixed LiDAR sensor sends a pulse to the target and receives an echo.' : 'Outgoing and returning modulation waves accumulate phase over the round trip.'} />}
            <div className="rng-legend"><span><i style={{background:'#5ad1ff'}} />{mode === 'multi' ? 'fine phase' : 'transmitted signal'}</span><span><i style={{background:'#ffae4d'}} />{mode === 'multi' ? 'coarse phase' : 'return signal'}</span><span>R = {distance} m</span></div>
          </section>
          <section className="rng-panel rng-trace">
            <h2><span>{mode === 'multi' ? 'CYCLE RESOLUTION' : 'RECEIVER TRACE'}</span>{mode === 'pulsed' ? 'Measure the delay' : mode === 'phase' ? 'Compare the phase' : 'Narrow the range window'}</h2>
            {mode === 'multi' ? <canvas ref={narrowRef} className="rng-canvas" width={660} height={110} role="img" aria-label="Illustrative range window narrows with each modulation tone." /> : <canvas ref={chartRef} className="rng-canvas" width={TIME_W} height={TIME_H} role="img" aria-label={mode === 'pulsed' ? 'Transmitted and received pulses on a round-trip time axis.' : 'Reference and received sinusoids with a phase-lag bracket and phasor.'} />}
            <p className="rng-caption">{mode === 'pulsed' ? 'TX and RX use separate gain scales. The captured RX has illustrative, shot-seeded input noise; peaks are display-clipped and at least 3 pixels wide. Acceptance uses the expected matched-filter SNR, not a crossing of the plotted noise samples. The timestamp includes a calibrated 12 ns internal delay.' : mode === 'phase' ? 'These are metre-scale AMCW modulation waves, not optical carrier waves. Phase repeats every 360°; the missing integer cycle must be resolved separately.' : 'Windows are centred on the known synthetic target. They illustrate cycle selection and an assumed ±3° phase error, not a noisy range estimator.'}</p>
          </section>
          {mode === 'phase' && <section className="rng-panel rng-trace"><h2><span>DISAMBIGUATION</span>Which whole cycle?</h2><div className="rng-comb-action"><button className="rng-action secondary" onClick={playComb}>Animate the calculation</button><span>0.45 MHz coarse tone → {unambCoarse.toFixed(0)} m interval</span></div><canvas ref={combRef} className="rng-canvas" width={COMB_W} height={COMB_H} role="img" aria-label="Fine-phase candidate ranges with a coarse estimate selecting the correct cycle." /><p className="rng-caption">N = round(Rcoarse / (λ/2) − Δφ/360°) = {Ncalc}. The coarse estimate must select the correct fine cycle; here it is ideal and unambiguous across the scene.</p></section>}
        </div>
        <aside className="rng-diagnostics" aria-label="Measurements and interpretation">
          <section className="rng-panel">
            <h2><span>03 / READ THE RESULT</span>{mode === 'pulsed' ? 'Time becomes distance' : mode === 'phase' ? 'Phase gives a remainder' : 'Coarse meets fine'}</h2>
            <div className="rng-result" id="rng-result">{mode === 'pulsed' ? (measured?.detected ? measured.range.toFixed(2) : '—') : mode === 'phase' ? rPhase.toFixed(2) : distance.toFixed(2)}<small>m</small></div>
            <p className="rng-result-label" id="rng-detection" role="status">{mode === 'pulsed' ? measured ? measured.detected ? 'Last shot · valid return (includes timing noise)' : 'No valid return · expected SNR below 6' : 'Awaiting a new valid return' : mode === 'phase' ? 'Phase-only remainder · not full range' : 'Ideal reconstructed range'}</p>
            <div className="rng-equation">{mode === 'pulsed' ? 'R = c · (tRAW − tCAL) / (2n)' : mode === 'phase' ? 'R = (N + Δφ/360°) · λ/2' : 'Coarse cycle + fine phase'}</div>
            <dl className="rng-metrics">
              {mode === 'pulsed' ? <><div><dt>Expected round-trip Δt</dt><dd>{tof.toFixed(1)} ns</dd></div><div><dt>Expected one-way time</dt><dd>{oneWay.toFixed(1)} ns</dd></div><div><dt>Expected signal electrons</dt><dd id="rng-electrons">{budget.electrons.toFixed(0)} e⁻</dd></div><div><dt>Expected SNR / gate</dt><dd id="rng-snr">{budget.snr.toFixed(1)} / 6</dd></div><div><dt>Two-way transmission</dt><dd>{(budget.transmission*100).toFixed(1)}%</dd></div><div><dt>Captured raw timestamp</dt><dd>{measured?.rawDelayNs?.toFixed(1) ?? '—'} ns</dd></div><div><dt>Internal delay removed</dt><dd>12.0 ns</dd></div><div><dt>Timestamp bin / clock jitter</dt><dd>100 / 80 ps</dd></div><div><dt>Approx. range σ, if detected</dt><dd>{budget.detected ? `${(budget.rangeSigmaM*100).toFixed(1)} cm` : 'Below gate'}</dd></div><div><dt>Pulse-limited scale cτ/(2n)</dt><dd>{rangeRes.toFixed(2)} m</dd></div></> : mode === 'phase' ? <><div><dt>Phase shift Δφ</dt><dd>{phiDeg.toFixed(1)}°</dd></div><div><dt>Modulation wavelength</dt><dd>{lambda.toFixed(2)} m</dd></div><div><dt>Ambiguity interval λ/2</dt><dd>{unamb.toFixed(2)} m</dd></div><div><dt>Range per degree</dt><dd>{(phasePrecision*100).toFixed(1)} cm</dd></div><div><dt>Resolved whole cycles N</dt><dd>{Ncalc}</dd></div><div><dt>With ideal coarse tone</dt><dd>{((Ncalc+frac)*unamb).toFixed(2)} m</dd></div></> : <><div><dt>Coarsest interval</dt><dd>{tones[0].unamb.toFixed(0)} m</dd></div><div><dt>Fine bound, assuming ±3°</dt><dd>±{(finePrecision/2).toFixed(3)} m</dd></div></>}
            </dl>
          </section>
          <section className="rng-panel">
            <h2><span>INTERPRETATION</span>{mode === 'pulsed' ? 'Do not confuse the scales' : mode === 'phase' ? 'The missing integer' : 'The tone ladder'}</h2>
            {mode === 'pulsed' ? <><p className="rng-hint"><b>Why divide by two?</b> The light travels out and back: total path ≈ 2R. The two apertures are separated in the drawing; their small physical baseline is neglected at 10–300 m.</p><p className="rng-hint"><b>Precision is not resolution.</b> The pulse-limited scale concerns echo separation. A fitted peak can have much finer timing precision. The displayed σ is an approximate Gaussian timing model, not an accuracy guarantee.</p><p className="rng-hint"><b>Calibration matters.</b> The air index changes travel speed. Without removing the 12 ns instrument delay, range would be biased by about 1.8 m. Timing noise gives a different captured range on each shot.</p><div className={'rng-alert '+(ambiguous ? 'warning' : '')} role="status"><b>{ambiguous ? 'Pulse identity is ambiguous' : 'Within one pulse interval'}</b><span>Vacuum reference Rmax = {rMax.toFixed(2)} m</span><span>Vacuum periodic apparent R = {apparentRange.toFixed(2)} m</span></div><p className="rng-hint">The periodic ambiguity example and both phase modes retain the vacuum approximation. Single-pulse timing uses the selected air index. The model omits multiple scattering, finite-target interception, saturation, dead time and calibrated weather/sunlight spectra.</p></>
              : mode === 'phase' ? <><p className="rng-hint">The same fine phase occurs at {rPhase.toFixed(2)} m, {(rPhase+unamb).toFixed(2)} m, and further intervals. Phase alone does not observe N.</p><p className="rng-hint">A coarse tone with interval {unambCoarse.toFixed(0)} m identifies the fine cycle. Its error must be less than about ±{(unamb/2).toFixed(2)} m to choose the nearest correct candidate.</p><p className="rng-hint">This is AMCW phase ranging, not FMCW beat-frequency ranging. Real precision depends on phase noise and calibration.</p></>
              : <><div className="rng-tone-table"><div><b>Tone</b><b>λ/2</b><b>Phase</b></div>{tones.map((t,i) => <div key={t.f}><span>{(t.f/1e6).toFixed(i===0 ? 2 : 1)} MHz</span><span>{t.unamb.toFixed(2)} m</span><span>{((distance/t.unamb)%1*360).toFixed(1)}°</span></div>)}</div><p className="rng-hint">The {tones[0].unamb.toFixed(0)} m coarsest interval exceeds the full 0–{DMAX} m scene. Higher frequencies refine the phase fraction only after the correct cycle is chosen.</p><p className="rng-hint">The ±3° assumption is illustrative. More tones alone do not guarantee precision or absolute accuracy.</p></>}
          </section>
        </aside>
      </main>
      <details className="rng-notebook"><summary><span><span className="rng-eyebrow">THE LAB NOTEBOOK</span>Understand the physics</span><span>Experiments, self-checks &amp; references ＋</span></summary>
        <LidarLearningPanel topic="ranging" workedExample={mode === 'multi'
        ? `${nTones} illustrative tones: the coarsest interval is ${tones[0].unamb.toFixed(0)} m, exceeding the ${DMAX} m scene; the finest interval is ${tones.at(-1).unamb.toFixed(3)} m. An assumed ±3° phase error maps to ±${(finePrecision / 2).toFixed(3)} m only after the correct cycle is identified.`
        : mode === 'pulsed'
        ? `In pulse mode, Δt = 2 × n × ${distance} / ${C} = ${tof.toFixed(2)} ns with n = ${airIndex.toFixed(5)}; cτ/(2n) = ${rangeRes.toFixed(3)} m. Expected receiver SNR = ${budget.snr.toFixed(1)}; the acceptance gate is 6. The separate vacuum PRF example at ${prf} kHz gives Rmax = ${rMax.toFixed(2)} m${ambiguous ? ` and an untagged-pulse apparent range of ${apparentRange.toFixed(2)} m` : ', beyond this target'}.`
        : `At ${fMod} MHz: λmod/2 = ${unamb.toFixed(3)} m; Δφ = ${phiDeg.toFixed(2)}°; R = (${N} + ${(frac).toFixed(4)}) × ${unamb.toFixed(3)} = ${distance} m. Phase alone does not observe N.`}
        onExperiment={(id) => { if (id === 'phase') { setMode('phase'); setDistance(120); setFMod(10); } else { setMode('pulsed'); setDistance(id === 'timing' ? 150 : 220); setPrf(id === 'timing' ? 100 : 1000); setPulseWidth(10); } }} />
      </details>
      <footer className="rng-footer"><span>GEOSIM / RANGING LAB</span><span>Make a prediction. Change one variable. Measure the return.</span></footer>
    </div>
  );
}
