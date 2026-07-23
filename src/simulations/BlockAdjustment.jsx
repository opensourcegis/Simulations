import React, { useState, useMemo, useRef, useEffect } from 'react';
import './simulation.css';
import './block.css';

// ---------------------------------------------------------------------------
// Block Adjustment Math Helper & Parameter Solver Engine
// ---------------------------------------------------------------------------
function computeBlockParams(numStrips, photosPerStrip, endLap, sideLap, numGcps, tieDensity, selfCalibration) {
  const numPhotos = numStrips * photosPerStrip;

  // 1. Exterior Orientation (EO) Unknowns: 6 per photo (Xc, Yc, Zc, omega, phi, kappa)
  const eoUnknowns = numPhotos * 6;

  // 2. Interior Orientation (IO) Unknowns: 0 if pre-calibrated, 7 if self-calibration (f, x0, y0, K1, K2, P1, P2)
  const ioUnknowns = selfCalibration ? 7 : 0;

  // 3. Estimate Overlap & Tie Points:
  const endOverlapRatio = endLap / 100;
  const sideOverlapRatio = sideLap / 100;

  let avgRaysPerTiePoint = 2.0;
  if (endOverlapRatio >= 0.6 && sideOverlapRatio >= 0.3) {
    avgRaysPerTiePoint = 3.8 + (endOverlapRatio - 0.6) * 4 + (sideOverlapRatio - 0.3) * 3;
  } else if (endOverlapRatio >= 0.5) {
    avgRaysPerTiePoint = 2.4 + (endOverlapRatio - 0.5) * 3;
  }
  avgRaysPerTiePoint = Number(Math.min(numPhotos, avgRaysPerTiePoint).toFixed(2));

  const numTiePoints = Math.round(numPhotos * tieDensity * (1 - endOverlapRatio * 0.4 - sideOverlapRatio * 0.3));
  const tiePtUnknowns = numTiePoints * 3;
  const totalUnknowns = eoUnknowns + ioUnknowns + tiePtUnknowns;

  const tiePointObsCount = Math.round(numTiePoints * avgRaysPerTiePoint * 2);
  const gcpObsPerPhoto = Math.min(numPhotos, Math.max(2, Math.round(numPhotos * 0.4)));
  const gcpObsCount = numGcps * gcpObsPerPhoto * 2;
  const totalObservations = tiePointObsCount + gcpObsCount;

  const redundancy = totalObservations - totalUnknowns;

  const minGcpRequiredBlock = selfCalibration ? 4 : 3;
  const minGcpWithoutOverlap = numPhotos * 3;

  let status = 'STABLE';
  if (numGcps < minGcpRequiredBlock || redundancy < 0) {
    status = 'UNSOLVABLE';
  } else if (redundancy < 20) {
    status = 'CRITICAL';
  }

  return {
    numPhotos,
    eoUnknowns,
    ioUnknowns,
    numTiePoints,
    tiePtUnknowns,
    totalUnknowns,
    avgRaysPerTiePoint,
    tiePointObsCount,
    gcpObsCount,
    totalObservations,
    redundancy,
    minGcpRequiredBlock,
    minGcpWithoutOverlap,
    status,
  };
}

export default function BlockAdjustment() {
  // Main Tab State: 'single' (Single Photo) vs 'block' (Full Block Adjustment)
  const [activeTab, setActiveTab] = useState('single');

  // Sub-Tab State inside Tab 1: 'diagram' (Ray & Variables) vs 'gcp' (3 GCP Rule & Solvability)
  const [subTab, setSubTab] = useState('diagram');

  // Collapsible Accordion State
  const [showDerivation, setShowDerivation] = useState(false);
  const [showArithmetic, setShowArithmetic] = useState(false);

  // Tab 1: Single Photo State
  const [singleGcps, setSingleGcps] = useState(3); // 1 to 6 GCPs
  const [singleSelfCalib, setSingleSelfCalib] = useState(false);
  const [showAxesProjections, setShowAxesProjections] = useState(true);

  // Tab 2: Full Block Parameters (fixed block layout)
  const numStrips = 2;
  const photosPerStrip = 4;
  const [endLap, setEndLap] = useState(70);
  const [sideLap, setSideLap] = useState(40);
  const [numGcps, setNumGcps] = useState(4);
  const [tieDensity, setTieDensity] = useState(25);
  const [selfCalibration, setSelfCalibration] = useState(false);

  // 3D View Controls
  const [view3D, setView3D] = useState(true);
  const [yawAngle, setYawAngle] = useState(42);
  const [pitchAngle, setPitchAngle] = useState(32);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [showRays, setShowRays] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);

  // Solver Animation State
  const [solverStep, setSolverStep] = useState(0);
  const [isSolving, setIsSolving] = useState(false);

  // Animation Frame Ref
  const animFrameRef = useRef(null);
  const animTimeRef = useRef(0);
  const canvasRef = useRef(null);

  // Drag-to-rotate state
  const isDraggingRef = useRef(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  // Wire pointer events on the canvas for drag-rotate & scroll-zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e) => {
      isDraggingRef.current = true;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e) => {
      if (!isDraggingRef.current || !view3D) return;
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      setYawAngle((prev) => (prev - dx * 0.6 + 360) % 360);
      setPitchAngle((prev) => Math.max(10, Math.min(85, prev + dy * 0.4)));
    };
    const onPointerUp = () => {
      isDraggingRef.current = false;
    };
    const onWheel = (e) => {
      e.preventDefault();
      setZoomScale((prev) => Math.max(0.6, Math.min(2.0, prev - e.deltaY * 0.001)));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [view3D]);

  // Calculate mathematical parameters balance for full block
  const stats = useMemo(() => {
    return computeBlockParams(
      numStrips,
      photosPerStrip,
      endLap,
      sideLap,
      numGcps,
      tieDensity,
      selfCalibration
    );
  }, [numStrips, photosPerStrip, endLap, sideLap, numGcps, tieDensity, selfCalibration]);

  // Solver iterations simulation
  const solverHistory = useMemo(() => {
    const history = [];
    const maxSteps = 8;
    const initialRms = 8.5 + (selfCalibration ? 3.2 : 0) + (stats.status === 'UNSOLVABLE' ? 12 : 0);
    const targetRms = stats.status === 'UNSOLVABLE' ? 14.5 : 0.35 + (selfCalibration ? 0.1 : 0);

    for (let k = 0; k <= maxSteps; k++) {
      const progress = k / maxSteps;
      const rms = Number((targetRms + (initialRms - targetRms) * Math.exp(-progress * 4.5)).toFixed(2));
      const deltaEo = Number((0.8 * Math.exp(-progress * 3.8)).toFixed(3));
      const delta3d = Number((1.4 * Math.exp(-progress * 3.5)).toFixed(3));
      history.push({ step: k, rms, deltaEo, delta3d });
    }
    return history;
  }, [stats.status, selfCalibration]);

  useEffect(() => {
    let timer;
    if (isSolving) {
      timer = setInterval(() => {
        setSolverStep((prev) => {
          if (prev >= solverHistory.length - 1) {
            setIsSolving(false);
            return prev;
          }
          return prev + 1;
        });
      }, 350);
    }
    return () => clearInterval(timer);
  }, [isSolving, solverHistory.length]);

  // Continuous Animation Loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      animTimeRef.current += 0.025;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const t = animTimeRef.current;

        ctx.clearRect(0, 0, width, height);

        const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
        bgGrad.addColorStop(0, '#070f19');
        bgGrad.addColorStop(1, '#0c1a2b');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        const radYaw = (yawAngle * Math.PI) / 180;
        const radPitch = (pitchAngle * Math.PI) / 180;
        const cosY = Math.cos(radYaw), sinY = Math.sin(radYaw);
        const cosP = Math.cos(radPitch), sinP = Math.sin(radPitch);

        const project3D = (x, y, z) => {
          if (!view3D) {
            const margin = 60;
            const px = margin + (x / 100) * (width - 2 * margin);
            const py = margin + (y / 100) * (height - 2 * margin);
            return { px, py, depth: y };
          }
          const cx = 45, cy = 45, cz = 18;
          const dx = x - cx, dy = y - cy, dz = z - cz;

          const rx = dx * cosY - dy * sinY;
          const ry = dx * sinY + dy * cosY;
          const rz = dz * cosP - ry * sinP;
          const rDepth = ry * cosP + dz * sinP;

          const scale = ((width - 160) / 130) * zoomScale;
          const px = width / 2 - 20 + rx * scale;
          const py = height / 2 + 40 - rz * scale * 1.25;
          return { px, py, depth: rDepth };
        };

        if (activeTab === 'single') {
          if (subTab === 'diagram') {
            // =========================================================================
            // 3D COLLINEARITY GEOMETRY DIAGRAM (L - a - A)
            // =========================================================================
            const orig = project3D(0, 0, 0);
            const xAxis = project3D(100, 0, 0);
            const yAxis = project3D(0, 100, 0);
            const zAxis = project3D(0, 0, 60);

            ctx.strokeStyle = '#64748b'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(orig.px, orig.py); ctx.lineTo(xAxis.px, xAxis.py); ctx.stroke();
            ctx.fillStyle = '#94a3b8'; ctx.font = '700 13px system-ui';
            ctx.fillText('X (Ground)', xAxis.px + 8, xAxis.py + 4);

            ctx.beginPath(); ctx.moveTo(orig.px, orig.py); ctx.lineTo(yAxis.px, yAxis.py); ctx.stroke();
            ctx.fillText('Y (Ground)', yAxis.px - 25, yAxis.py + 16);

            ctx.beginPath(); ctx.moveTo(orig.px, orig.py); ctx.lineTo(zAxis.px, zAxis.py); ctx.stroke();
            ctx.fillText('Z (Height)', zAxis.px - 6, zAxis.py - 10);

            const pG0 = project3D(0, 0, 0), pG1 = project3D(100, 0, 0), pG2 = project3D(100, 100, 0), pG3 = project3D(0, 100, 0);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
            ctx.beginPath();
            ctx.moveTo(pG0.px, pG0.py); ctx.lineTo(pG1.px, pG1.py); ctx.lineTo(pG2.px, pG2.py); ctx.lineTo(pG3.px, pG3.py);
            ctx.closePath(); ctx.fill();

            const XL = 42, YL = 45, ZL = 48;
            const projL = project3D(XL, YL, ZL);
            const projL_ground = project3D(XL, YL, 0);

            if (showAxesProjections) {
              ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'; ctx.lineWidth = 1;
              const pXL = project3D(XL, 0, 0);
              const pYL = project3D(0, YL, 0);

              ctx.beginPath(); ctx.moveTo(pXL.px, pXL.py); ctx.lineTo(projL_ground.px, projL_ground.py); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(pYL.px, pYL.py); ctx.lineTo(projL_ground.px, projL_ground.py); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(projL_ground.px, projL_ground.py); ctx.lineTo(projL.px, projL.py); ctx.stroke();
              ctx.setLineDash([]);

              ctx.fillStyle = '#38bdf8'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
              ctx.fillText('XL', (pXL.px + projL_ground.px) / 2, (pXL.py + projL_ground.py) / 2 + 12);
              ctx.fillText('YL', (pYL.px + projL_ground.px) / 2 - 10, (pYL.py + projL_ground.py) / 2);
              ctx.fillText('ZL (Flying Height)', projL.px + 40, (projL.py + projL_ground.py) / 2);
            }

            const fDistance = 14;
            const pOrigin = project3D(XL, YL, ZL - fDistance);

            const pw = 28, ph = 22;
            const pf0 = project3D(XL - pw / 2, YL - ph / 2, ZL - fDistance);
            const pf1 = project3D(XL + pw / 2, YL - ph / 2, ZL - fDistance);
            const pf2 = project3D(XL + pw / 2, YL + ph / 2, ZL - fDistance);
            const pf3 = project3D(XL - pw / 2, YL + ph / 2, ZL - fDistance);

            ctx.fillStyle = 'rgba(30, 58, 138, 0.45)'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(pf0.px, pf0.py); ctx.lineTo(pf1.px, pf1.py); ctx.lineTo(pf2.px, pf2.py); ctx.lineTo(pf3.px, pf3.py);
            ctx.closePath(); ctx.fill(); ctx.stroke();

            // Image Plane Axes x_a, y_a — use proper 3D midpoints so they sit on the plane
            const midLeft  = project3D(XL - pw / 2, YL, ZL - fDistance);  // midpoint of left edge
            const midRight = project3D(XL + pw / 2, YL, ZL - fDistance);  // midpoint of right edge
            const midTop   = project3D(XL, YL - ph / 2, ZL - fDistance);  // midpoint of top edge
            const midBot   = project3D(XL, YL + ph / 2, ZL - fDistance);  // midpoint of bottom edge

            ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 1.2;
            // x_a axis (left edge midpoint → right edge midpoint)
            ctx.beginPath(); ctx.moveTo(midLeft.px, midLeft.py); ctx.lineTo(midRight.px, midRight.py); ctx.stroke();
            // y_a axis (top edge midpoint → bottom edge midpoint)
            ctx.beginPath(); ctx.moveTo(midTop.px, midTop.py); ctx.lineTo(midBot.px, midBot.py); ctx.stroke();

            ctx.fillStyle = '#93c5fd'; ctx.font = '600 10px system-ui';
            ctx.fillText('x_a', midRight.px + 4, midRight.py); ctx.fillText('y_a', midBot.px, midBot.py + 10);

            ctx.fillStyle = '#60a5fa'; ctx.beginPath(); ctx.arc(pOrigin.px, pOrigin.py, 3.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillText('o (Principal Point)', pOrigin.px - 45, pOrigin.py + 12);

            ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(projL.px, projL.py); ctx.lineTo(pOrigin.px, pOrigin.py); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#fbbf24'; ctx.font = '700 11px system-ui';
            ctx.fillText('f (Focal Length)', (projL.px + pOrigin.px) / 2 + 25, (projL.py + pOrigin.py) / 2);

            ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
            ctx.beginPath(); ctx.moveTo(projL.px, projL.py); ctx.lineTo(projL_ground.px, projL_ground.py); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#94a3b8'; ctx.fillText('n (Nadir)', projL_ground.px - 18, projL_ground.py + 14);

            const XA = 78, YA = 75, ZA = 10;
            const projA = project3D(XA, YA, ZA);
            const projA_ground = project3D(XA, YA, 0);

            if (showAxesProjections) {
              ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)'; ctx.lineWidth = 1;
              const pXA = project3D(XA, 0, 0); const pYA = project3D(0, YA, 0);
              ctx.beginPath(); ctx.moveTo(pXA.px, pXA.py); ctx.lineTo(projA_ground.px, projA_ground.py); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(pYA.px, pYA.py); ctx.lineTo(projA_ground.px, projA_ground.py); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(projA_ground.px, projA_ground.py); ctx.lineTo(projA.px, projA.py); ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = '#fbbf24'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
              ctx.fillText('XA', (pXA.px + projA_ground.px) / 2, (pXA.py + projA_ground.py) / 2 + 10);
              ctx.fillText('YA', (pYA.px + projA_ground.px) / 2 + 10, (pYA.py + projA_ground.py) / 2);
              ctx.fillText('ZA', projA.px + 12, (projA.py + projA_ground.py) / 2);
            }

            const t_photo = fDistance / (ZL - ZA);
            const pt_a_3d = { x: XL + (XA - XL) * t_photo, y: YL + (YA - YL) * t_photo, z: ZL - fDistance };
            const proj_a = project3D(pt_a_3d.x, pt_a_3d.y, pt_a_3d.z);

            ctx.fillStyle = '#34d399'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(proj_a.px, proj_a.py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#34d399'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'left';
            ctx.fillText('a (Image Pt: xa, ya)', proj_a.px + 8, proj_a.py - 4);

            ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(projA.px, projA.py, 6.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(projA.px, projA.py, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fbbf24'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'left';
            ctx.fillText('A (Ground Pt: XA, YA, ZA)', projA.px + 10, projA.py + 4);

            ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2.5; ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.moveTo(projL.px, projL.py); ctx.lineTo(projA.px, projA.py); ctx.stroke();
            ctx.shadowBlur = 0;

            const pFrac = (t * 0.7) % 1.0;
            const pulsePx = projL.px + (projA.px - projL.px) * pFrac;
            const pulsePy = projL.py + (projA.py - projL.py) * pFrac;
            ctx.fillStyle = '#60a5fa'; ctx.beginPath(); ctx.arc(pulsePx, pulsePy, 5, 0, Math.PI * 2); ctx.fill();

            ctx.fillStyle = '#38bdf8'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(projL.px, projL.py, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center';
            ctx.fillText('L (Perspective Center: XL, YL, ZL)', projL.px, projL.py - 12);

          } else {
            // =========================================================================
            // SINGLE CAMERA GCP RAYS VIEW
            // =========================================================================
            const pG0 = project3D(0, 0, 0), pG1 = project3D(100, 0, 0), pG2 = project3D(100, 100, 0), pG3 = project3D(0, 100, 0);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
            ctx.beginPath(); ctx.moveTo(pG0.px, pG0.py); ctx.lineTo(pG1.px, pG1.py); ctx.lineTo(pG2.px, pG2.py); ctx.lineTo(pG3.px, pG3.py);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'; ctx.lineWidth = 1.5; ctx.stroke();

            const camX = 50, camY = 50, camZ = 40;
            const camProj = project3D(camX, camY, camZ);

            if (singleGcps < 3) {
              const errRadius = (3 - singleGcps) * 16;
              ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'; ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)'; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.arc(camProj.px, camProj.py, errRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
              ctx.fillStyle = '#ef4444'; ctx.font = '600 11px system-ui'; ctx.textAlign = 'center';
              ctx.fillText(`⚠️ Pose Uncertainty Cone (r = ${singleGcps * 2 - 6})`, camProj.px, camProj.py - errRadius - 8);
            }

            const fW = 32, fH = 26;
            const fp0 = project3D(camX - fW / 2, camY - fH / 2, 0), fp1 = project3D(camX + fW / 2, camY - fH / 2, 0);
            const fp2 = project3D(camX + fW / 2, camY + fH / 2, 0), fp3 = project3D(camX - fW / 2, camY + fH / 2, 0);

            ctx.fillStyle = 'rgba(56, 189, 248, 0.12)'; ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.2;
            [fp0, fp1, fp2, fp3].forEach((fp) => {
              ctx.beginPath(); ctx.moveTo(camProj.px, camProj.py); ctx.lineTo(fp.px, fp.py); ctx.stroke();
            });

            ctx.beginPath(); ctx.moveTo(fp0.px, fp0.py); ctx.lineTo(fp1.px, fp1.py); ctx.lineTo(fp2.px, fp2.py); ctx.lineTo(fp3.px, fp3.py);
            ctx.closePath(); ctx.fill(); ctx.stroke();

            ctx.fillStyle = '#38bdf8'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(camProj.px, camProj.py, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
            ctx.fillText('Camera C1 (Xc, Yc, Zc, ω, φ, κ)', camProj.px, camProj.py - 12);

            // GCPs must lie inside the camera footprint (34..66 x, 37..63 y)
            const gcpLocations = [
              { x: 38, y: 41 }, { x: 62, y: 41 }, { x: 62, y: 59 },
              { x: 38, y: 59 }, { x: 50, y: 41 }, { x: 50, y: 59 },
            ];

            for (let g = 0; g < singleGcps; g++) {
              const gcp = gcpLocations[g];
              const gcpProj = project3D(gcp.x, gcp.y, 0);
              ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.8;
              ctx.beginPath(); ctx.moveTo(camProj.px, camProj.py); ctx.lineTo(gcpProj.px, gcpProj.py); ctx.stroke();

              const pFrac = (t * 0.8 + g * 0.35) % 1.0;
              const pulsePx = camProj.px + (gcpProj.px - camProj.px) * pFrac;
              const pulsePy = camProj.py + (gcpProj.py - camProj.py) * pFrac;
              ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(pulsePx, pulsePy, 4, 0, Math.PI * 2); ctx.fill();

              ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.arc(gcpProj.px, gcpProj.py, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
              ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(gcpProj.px, gcpProj.py, 2.5, 0, Math.PI * 2); ctx.fill();

              ctx.fillStyle = '#fbbf24'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
              ctx.fillText(`GCP-${g + 1} (2 eq)`, gcpProj.px, gcpProj.py - 10);
            }
          }
        } else {
          // =========================================================================
          // TAB 2: FULL BLOCK ADJUSTMENT ANIMATION
          // =========================================================================
          const pG0 = project3D(0, 0, 0), pG1 = project3D(100, 0, 0), pG2 = project3D(100, 100, 0), pG3 = project3D(0, 100, 0);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
          ctx.beginPath();
          ctx.moveTo(pG0.px, pG0.py); ctx.lineTo(pG1.px, pG1.py); ctx.lineTo(pG2.px, pG2.py); ctx.lineTo(pG3.px, pG3.py);
          ctx.closePath(); ctx.fill();

          if (showHeatmap) {
            const gridRes = 8;
            const cellW = 100 / gridRes, cellH = 100 / gridRes;

            for (let gx = 0; gx < gridRes; gx++) {
              for (let gy = 0; gy < gridRes; gy++) {
                const cx = (gx + 0.5) * cellW;
                const cy = (gy + 0.5) * cellH;

                let overlapCount = 0;
                const photoW = 35 * (1 + (100 - endLap) / 100);
                const photoH = 35 * (1 + (100 - sideLap) / 100);

                for (let s = 0; s < numStrips; s++) {
                  for (let p = 0; p < photosPerStrip; p++) {
                    const camX = 15 + p * (70 / Math.max(1, photosPerStrip - 1));
                    const camY = 20 + s * (60 / Math.max(1, numStrips - 1));
                    if (Math.abs(cx - camX) < photoW / 2 && Math.abs(cy - camY) < photoH / 2) overlapCount++;
                  }
                }

                let color = 'rgba(30, 58, 138, 0.15)';
                if (overlapCount === 2) color = 'rgba(14, 165, 233, 0.25)';
                else if (overlapCount === 3) color = 'rgba(16, 185, 129, 0.35)';
                else if (overlapCount >= 4) color = 'rgba(245, 158, 11, 0.45)';

                const c0 = project3D(gx * cellW, gy * cellH, 0);
                const c1 = project3D((gx + 1) * cellW, gy * cellH, 0);
                const c2 = project3D((gx + 1) * cellW, (gy + 1) * cellH, 0);
                const c3 = project3D(gx * cellW, (gy + 1) * cellH, 0);

                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(c0.px, c0.py); ctx.lineTo(c1.px, c1.py); ctx.lineTo(c2.px, c2.py); ctx.lineTo(c3.px, c3.py);
                ctx.closePath(); ctx.fill();
              }
            }
          }

          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)'; ctx.lineWidth = 1.5; ctx.stroke();

          const flightHeight = 35;
          const cameraPoses = [];

          for (let s = 0; s < numStrips; s++) {
            const stripY = 20 + s * (60 / Math.max(1, numStrips - 1));
            const stripPoints = [];

            for (let p = 0; p < photosPerStrip; p++) {
              const camX = 15 + p * (70 / Math.max(1, photosPerStrip - 1));
              cameraPoses.push({ id: s * photosPerStrip + p, strip: s, photo: p, x: camX, y: stripY, z: flightHeight });
              stripPoints.push(project3D(camX, stripY, flightHeight));
            }

            ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
            ctx.beginPath();
            stripPoints.forEach((pt, idx) => {
              if (idx === 0) ctx.moveTo(pt.px, pt.py); else ctx.lineTo(pt.px, pt.py);
            });
            ctx.stroke(); ctx.setLineDash([]);
          }

          const tiePoints = [];
          const seed = 123;
          const pseudoRand = (i) => Math.sin(i * 9999 + seed) - Math.floor(Math.sin(i * 9999 + seed));

          for (let tIdx = 0; tIdx < Math.min(60, stats.numTiePoints); tIdx++) {
            const tx = 10 + pseudoRand(tIdx * 3) * 80;
            const ty = 15 + pseudoRand(tIdx * 3 + 1) * 70;
            tiePoints.push({ x: tx, y: ty, z: 0 });
          }

          tiePoints.forEach((pt, idx) => {
            const proj = project3D(pt.x, pt.y, pt.z);
            const pulse = (Math.sin(t * 3 + idx) + 1) / 2;
            ctx.fillStyle = '#34d399'; ctx.shadowColor = '#34d399'; ctx.shadowBlur = 4 + pulse * 6;
            ctx.beginPath(); ctx.arc(proj.px, proj.py, 2.5 + pulse * 1.2, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
          });

          const gcps = [];
          const gcpCoords = [
            { x: 12, y: 15 }, { x: 88, y: 15 }, { x: 88, y: 85 }, { x: 12, y: 85 },
            { x: 50, y: 15 }, { x: 50, y: 85 }, { x: 12, y: 50 }, { x: 88, y: 50 },
            { x: 35, y: 35 }, { x: 65, y: 35 }, { x: 35, y: 65 }, { x: 65, y: 65 },
          ];
          for (let g = 0; g < Math.min(numGcps, gcpCoords.length); g++) gcps.push(gcpCoords[g]);

          gcps.forEach((gcp, idx) => {
            const proj = project3D(gcp.x, gcp.y, 0);
            ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(proj.px, proj.py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(proj.px, proj.py, 2, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fbbf24'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
            ctx.fillText(`GCP-${idx + 1}`, proj.px, proj.py - 9);
          });

          cameraPoses.forEach((cam) => {
            const camProj = project3D(cam.x, cam.y, cam.z);

            const fW = 20, fH = 20;
            const fp0 = project3D(cam.x - fW / 2, cam.y - fH / 2, 0);
            const fp1 = project3D(cam.x + fW / 2, cam.y - fH / 2, 0);
            const fp2 = project3D(cam.x + fW / 2, cam.y + fH / 2, 0);
            const fp3 = project3D(cam.x - fW / 2, cam.y + fH / 2, 0);

            ctx.fillStyle = 'rgba(56, 189, 248, 0.12)'; ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)'; ctx.lineWidth = 1;
            [fp0, fp1, fp2, fp3].forEach((fp) => {
              ctx.beginPath(); ctx.moveTo(camProj.px, camProj.py); ctx.lineTo(fp.px, fp.py); ctx.stroke();
            });

            ctx.fillStyle = '#38bdf8'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(camProj.px, camProj.py, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

            if (showRays) {
              ctx.strokeStyle = 'rgba(52, 211, 153, 0.2)'; ctx.lineWidth = 0.8;
              tiePoints.forEach((tp) => {
                if (Math.hypot(tp.x - cam.x, tp.y - cam.y) < 28) {
                  const tpProj = project3D(tp.x, tp.y, tp.z);
                  ctx.beginPath(); ctx.moveTo(camProj.px, camProj.py); ctx.lineTo(tpProj.px, tpProj.py); ctx.stroke();
                }
              });
            }
          });
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    activeTab,
    subTab,
    singleGcps,
    showAxesProjections,
    numStrips,
    photosPerStrip,
    endLap,
    sideLap,
    numGcps,
    stats,
    view3D,
    yawAngle,
    pitchAngle,
    zoomScale,
    showRays,
    showHeatmap,
  ]);

  const currentRms = solverHistory[solverStep].rms;

  // Single Photo Redundancy
  const singleEqCount = singleGcps * 2;
  const singleUnkCount = 6 + (singleSelfCalib ? 7 : 0);
  const singleRedundancy = singleEqCount - singleUnkCount;

  return (
    <div className="sim-app">
      {/* Top Header Navigation */}
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>
          &larr; Back to Simulators
        </a>
        <div className="title-block">
          <h1>Bundle Block Adjustment &amp; Photogrammetric Parameter Estimation</h1>
          <span className="sub">
            Interior Orientation (IO), Exterior Orientation (EO), Ground Control Points (GCPs) &amp; Overlap Collinearity Equations
          </span>
        </div>

        <span className={`solvability-badge ${activeTab === 'single' ? (singleRedundancy >= 0 ? 'stable' : 'unsolvable') : stats.status.toLowerCase()}`}>
          {activeTab === 'single'
            ? singleRedundancy >= 0
              ? `✅ 3+ GCPs — EXACTLY/OVERDETERMINED (r = +${singleRedundancy})`
              : `❌ < 3 GCPs — UNDERDETERMINED (r = ${singleRedundancy})`
            : stats.status === 'STABLE'
            ? `✅ STABLE & OVERDETERMINED (r = +${stats.redundancy})`
            : stats.status === 'CRITICAL'
            ? `⚠️ CRITICAL REDUNDANCY (r = +${stats.redundancy})`
            : `❌ UNSOLVABLE (r = ${stats.redundancy})`}
        </span>
      </header>

      {/* Main Mode Navigation Switcher Tabs */}
      <div className="tab-switcher">
        <button
          className={`tab-button ${activeTab === 'single' ? 'active' : ''}`}
          onClick={() => setActiveTab('single')}
        >
          <strong>📸 Tab 1: Single Photo Collinearity Geometry &amp; 3 GCP Rule</strong>
          <span>Examine ray L-a-A, photo plane, variables (L, f, o, n, a, A), and 3 GCP requirement</span>
        </button>

        <button
          className={`tab-button ${activeTab === 'block' ? 'active' : ''}`}
          onClick={() => setActiveTab('block')}
        >
          <strong>🗺️ Tab 2: Full Block Adjustment &amp; Overlap Efficiency</strong>
          <span>Explore how photo overlap &amp; tie points reduce GCP requirements for the entire block</span>
        </button>
      </div>

      <div className="sim-layout">
        {/* Left Column: 3D Animated Canvas View */}
        <div className="sim-col">
          <section className="sim-panel">
            {activeTab === 'single' && (
              <div className="sub-pill-container">
                <button
                  className={`sub-pill-btn ${subTab === 'diagram' ? 'active' : ''}`}
                  onClick={() => setSubTab('diagram')}
                >
                  📐 3D Collinearity Diagram (L - a - A)
                </button>
                <button
                  className={`sub-pill-btn ${subTab === 'gcp' ? 'active' : ''}`}
                  onClick={() => setSubTab('gcp')}
                >
                  🎯 Single Photo 3 GCP Rule Demo
                </button>
              </div>
            )}

            <h2>
              <span className="stepno">1</span>
              {activeTab === 'single'
                ? subTab === 'diagram'
                  ? ' Collinearity Geometry Diagram (L - a - A)'
                  : ' Single Camera GCP Ray-Tracing'
                : ' 3D Flight Block & Overlap Ray-Tracing'}
              <small style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  className="tin-btn secondary"
                  style={{ padding: '3px 8px', fontSize: 11 }}
                  onClick={() => setView3D(!view3D)}
                >
                  {view3D ? '📷 2D Plan View' : '🧊 3D Orbit View'}
                </button>
              </small>
            </h2>

            <canvas ref={canvasRef} className="block-view3d" width={700} height={420} />

            {/* 3D View Controls */}
            <div className="block-toolbar">
              {view3D && (
                <>
                  <label>
                    Orbit:
                    <input
                      type="range"
                      min="0"
                      max="360"
                      value={yawAngle}
                      onChange={(e) => setYawAngle(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Tilt:
                    <input
                      type="range"
                      min="10"
                      max="85"
                      value={pitchAngle}
                      onChange={(e) => setPitchAngle(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Zoom:
                    <input
                      type="range"
                      min="0.6"
                      max="2.0"
                      step="0.1"
                      value={zoomScale}
                      onChange={(e) => setZoomScale(Number(e.target.value))}
                    />
                  </label>
                </>
              )}

              {activeTab === 'single' && subTab === 'diagram' && (
                <label style={{ marginLeft: 'auto' }}>
                  <input
                    type="checkbox"
                    checked={showAxesProjections}
                    onChange={(e) => setShowAxesProjections(e.target.checked)}
                  />
                  Show XL, YL, ZL Projections
                </label>
              )}

              {activeTab === 'block' && (
                <>
                  <label style={{ marginLeft: 'auto' }}>
                    <input
                      type="checkbox"
                      checked={showRays}
                      onChange={(e) => setShowRays(e.target.checked)}
                    />
                    Show Light Rays
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={showHeatmap}
                      onChange={(e) => setShowHeatmap(e.target.checked)}
                    />
                    Overlap Heatmap
                  </label>
                </>
              )}
            </div>

            {/* Legend */}
            <div className="block-legend">
              {activeTab === 'single' ? (
                subTab === 'diagram' ? (
                  <>
                    <span>
                      <i className="block-swatch" style={{ background: '#38bdf8' }} /> L (Perspective Center)
                    </span>
                    <span>
                      <i className="block-swatch" style={{ background: '#34d399' }} /> a (Image Point: xa, ya)
                    </span>
                    <span>
                      <i className="block-swatch" style={{ background: '#f59e0b' }} /> A (Ground Point: XA, YA, ZA)
                    </span>
                    <span>
                      <i className="block-swatch" style={{ background: '#fbbf24' }} /> Line L-a-A (Collinearity Ray)
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      <i className="block-swatch" style={{ background: '#38bdf8' }} /> Camera Center (C1)
                    </span>
                    <span>
                      <i className="block-swatch" style={{ background: '#f59e0b' }} /> Ground Control Points ({singleGcps} GCPs)
                    </span>
                  </>
                )
              ) : (
                <>
                  <span>
                    <i className="block-swatch" style={{ background: '#38bdf8' }} /> Camera Centers ({stats.numPhotos} photos)
                  </span>
                  <span>
                    <i className="block-swatch" style={{ background: '#34d399' }} /> Tie Points (~{stats.numTiePoints})
                  </span>
                  <span>
                    <i className="block-swatch" style={{ background: '#f59e0b' }} /> GCPs ({numGcps})
                  </span>
                </>
              )}
            </div>
          </section>

          {/* Section 2: Iterative Bundle Adjustment Solver (Active in Tab 2) */}
          {activeTab === 'block' && (
            <section className="sim-panel">
              <h2>
                <span className="stepno">2</span> Gauss-Markov Least-Squares Bundle Adjustment Solver
              </h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  className="tin-btn primary"
                  onClick={() => {
                    setSolverStep(0);
                    setIsSolving(true);
                  }}
                  disabled={isSolving}
                >
                  {isSolving ? '⏳ Solving Normal Equations...' : '🚀 Run Bundle Adjustment'}
                </button>

                <button
                  className="tin-btn"
                  onClick={() => {
                    setIsSolving(false);
                    setSolverStep(0);
                  }}
                >
                  🔄 Reset Solver
                </button>

                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#56677a' }}>
                  Iteration <b>{solverStep}</b> / {solverHistory.length - 1}
                </span>
              </div>

              {/* RMS Reprojection Error Display */}
              <div style={{ marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#334155' }}>
                  <span>Reprojection RMS Error (σ₀):</span>
                  <span style={{ fontFamily: 'monospace', color: currentRms < 0.5 ? '#10b981' : currentRms < 2.0 ? '#f59e0b' : '#ef4444' }}>
                    {currentRms.toFixed(2)} pixels {currentRms < 0.5 && '✅ Sub-pixel Converged'}
                  </span>
                </div>

                <div className="residual-bar-container">
                  <div
                    className="residual-bar-fill"
                    style={{
                      width: `${Math.max(5, Math.min(100, (1 - currentRms / 15) * 100))}%`,
                      background: currentRms < 0.5 ? '#10b981' : currentRms < 2.0 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Clean Interactive Tab Content */}
        <div className="sim-col">
          {activeTab === 'single' ? (
            subTab === 'diagram' ? (
              /* SUB-TAB 1A: COLLINEARITY DIAGRAM & VARIABLES */
              <>
                <section className="sim-panel">
                  <h2>
                    <span className="stepno">2</span> Variable Definitions
                  </h2>

                  <div className="math-step-calc" style={{ marginTop: 4 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Definition</th>
                          <th>Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><b style={{ color: '#38bdf8' }}>L (X_L, Y_L, Z_L)</b></td>
                          <td>Perspective Center</td>
                          <td>Lens 3D position (3 EO parameters)</td>
                        </tr>
                        <tr>
                          <td><b style={{ color: '#fbbf24' }}>f</b></td>
                          <td>Focal Length</td>
                          <td>Distance from lens L to photo origin o</td>
                        </tr>
                        <tr>
                          <td><b style={{ color: '#60a5fa' }}>o (x₀, y₀)</b></td>
                          <td>Principal Point</td>
                          <td>Photo plane coordinate origin</td>
                        </tr>
                        <tr>
                          <td><b style={{ color: '#94a3b8' }}>n</b></td>
                          <td>Nadir Point</td>
                          <td>Plumb line intersection on photo plane</td>
                        </tr>
                        <tr>
                          <td><b style={{ color: '#34d399' }}>a (x_a, y_a)</b></td>
                          <td>Image Point</td>
                          <td>2D photo coordinates of target point</td>
                        </tr>
                        <tr>
                          <td><b style={{ color: '#a7f3d0' }}>(x'_a, y'_a, z'_a)</b></td>
                          <td>Rotated Image Pt</td>
                          <td>Point a in parallel system x'y'z'</td>
                        </tr>
                        <tr>
                          <td><b style={{ color: '#f59e0b' }}>A (X_A, Y_A, Z_A)</b></td>
                          <td>Ground Point</td>
                          <td>True 3D coordinates on terrain</td>
                        </tr>
                        <tr>
                          <td><b style={{ color: '#38bdf8' }}>Ray L-a-A</b></td>
                          <td><b>Collinearity Ray</b></td>
                          <td>L, a, and A lie on 1 straight line</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Collapsible Derivation Drawer */}
                  <button
                    className="accordion-toggle"
                    onClick={() => setShowDerivation(!showDerivation)}
                  >
                    <span>📖 {showDerivation ? 'Hide' : 'Show'} Step-by-Step Derivation Formulas</span>
                    <span>{showDerivation ? '▲' : '▼'}</span>
                  </button>

                  {showDerivation && (
                    <div className="block-summary-box" style={{ background: '#f8fafc', borderLeft: '4px solid #38bdf8', color: '#1e293b', marginTop: 8 }}>
                      <strong style={{ color: '#0f172a' }}>Step 1: Similar Triangles</strong>
                      <div style={{ fontFamily: 'monospace', background: '#0f172a', color: '#f8fafc', padding: '6px 10px', borderRadius: 6, margin: '4px 0', fontSize: 11 }}>
                        <div>x'_a = [ (X_A - X_L) / (Z_A - Z_L) ] · z'_a</div>
                        <div>y'_a = [ (Y_A - Y_L) / (Z_A - Z_L) ] · z'_a</div>
                      </div>

                      <strong style={{ color: '#0f172a', display: 'block', marginTop: 8 }}>Step 2: 3D Camera Rotation Matrix M (ω, φ, κ)</strong>
                      <div style={{ fontFamily: 'monospace', background: '#0f172a', color: '#f8fafc', padding: '6px 10px', borderRadius: 6, margin: '4px 0', fontSize: 11 }}>
                        <div>x_a = m₁₁ x'_a + m₁₂ y'_a + m₁₃ z'_a</div>
                        <div>y_a = m₂₁ x'_a + m₂₂ y'_a + m₂₃ z'_a</div>
                        <div>z_a = m₃₁ x'_a + m₃₂ y'_a + m₃₃ z'_a = -f</div>
                      </div>

                      <strong style={{ color: '#0f172a', display: 'block', marginTop: 8 }}>Step 3: Final Collinearity Equations</strong>
                      <div className="math-formula-box" style={{ marginTop: 4 }}>
                        <div style={{ color: '#34d399', fontWeight: 700, fontSize: 12 }}>
                          x_a = x₀ - f · [ m₁₁(X_A - X_L) + m₁₂(Y_A - Y_L) + m₁₃(Z_A - Z_L) ] / [ m₃₁(X_A - X_L) + m₃₂(Y_A - Y_L) + m₃₃(Z_A - Z_L) ]
                        </div>
                        <div style={{ color: '#34d399', fontWeight: 700, fontSize: 12, marginTop: 4 }}>
                          y_a = y₀ - f · [ m₂₁(X_A - X_L) + m₂₂(Y_A - Y_L) + m₂₃(Z_A - Z_L) ] / [ m₃₁(X_A - X_L) + m₃₂(Y_A - Y_L) + m₃₃(Z_A - Z_L) ]
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </>
            ) : (
              /* SUB-TAB 1B: SINGLE PHOTO 3 GCP RULE & SOLVABILITY */
              <>
                <section className="sim-panel">
                  <h2>
                    <span className="stepno">2</span> Single Photo 3 GCP Rule &amp; Controls
                  </h2>

                  <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
                    <label>
                      Ground Control Points (GCPs): <b>{singleGcps} GCPs</b>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        step="1"
                        value={singleGcps}
                        onChange={(e) => setSingleGcps(Number(e.target.value))}
                      />
                    </label>

                    <div className="check-row">
                      <label style={{ cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                        <input
                          type="checkbox"
                          checked={singleSelfCalib}
                          onChange={(e) => setSingleSelfCalib(e.target.checked)}
                        />
                        Enable Unknown Focal Length / Calibration (+7 IO Unknowns)
                      </label>
                    </div>
                  </div>

                  <div className="eq-balance-grid" style={{ marginTop: 14 }}>
                    <div className="eq-card">
                      <h3>Unknowns (N_unk)</h3>
                      <div className="eq-main-val" style={{ color: '#ef4444' }}>
                        {singleUnkCount}
                      </div>
                      <ul>
                        <li>EO (Position + Attitude): <b>6</b></li>
                        <li>IO (Distortion/Focal): <b>{singleSelfCalib ? 7 : 0}</b></li>
                      </ul>
                    </div>

                    <div className="eq-card">
                      <h3>Observations (N_obs)</h3>
                      <div className="eq-main-val" style={{ color: '#3b82f6' }}>
                        {singleEqCount}
                      </div>
                      <ul>
                        <li>Collinearity Eq: <b>{singleEqCount}</b> (2 per GCP)</li>
                      </ul>
                    </div>

                    <div className="eq-card">
                      <h3>Redundancy (r)</h3>
                      <div className="eq-main-val" style={{ color: singleRedundancy >= 0 ? '#10b981' : '#ef4444' }}>
                        {singleRedundancy >= 0 ? `+${singleRedundancy}` : singleRedundancy}
                      </div>
                      <ul>
                        <li>Status: <b>{singleRedundancy >= 0 ? 'SOLVABLE' : 'UNSOLVABLE'}</b></li>
                      </ul>
                    </div>
                  </div>

                  <div className="block-summary-box" style={{ marginTop: 14 }}>
                    <strong>🎯 Why Exactly 3 GCPs are Minimum Required:</strong>
                    <p>
                      Each camera pose has <b>6 degrees of freedom (EO)</b>: <code>(X_L, Y_L, Z_L, roll ω, pitch φ, yaw κ)</code>.
                    </p>
                    <p>
                      Each GCP produces <b>2 collinearity equations</b> (image x and y).
                    </p>
                    <ul>
                      <li><b>1 GCP (2 eq)</b>: 2 &lt; 6 &rarr; <code>r = -4</code> (Underdetermined! Camera position floats).</li>
                      <li><b>2 GCPs (4 eq)</b>: 4 &lt; 6 &rarr; <code>r = -2</code> (Underdetermined! Scale/tilt unconstrained).</li>
                      <li><b>3 GCPs (6 eq)</b>: 6 = 6 &rarr; <code>r = 0</code> (<b>EXACTLY DETERMINED</b>! Solves all 6 parameters).</li>
                      <li><b>4+ GCPs (8+ eq)</b>: 8 &gt; 6 &rarr; <code>r = +2</code> (<b>OVERDETERMINED</b>! Enables least-squares bundle).</li>
                    </ul>
                  </div>
                </section>
              </>
            )
          ) : (
            /* ========================================================================= */
            /* TAB 2 CONTENT: FULL BLOCK ADJUSTMENT & OVERLAP EFFICIENCY                 */
            /* ========================================================================= */
            <>
              <section className="sim-panel">
                <h2>
                  <span className="stepno">3</span> Equation Balance &amp; Block Redundancy
                </h2>

                <div className="eq-balance-grid">
                  <div className="eq-card">
                    <h3>Unknowns (N_unk)</h3>
                    <div className="eq-main-val" style={{ color: '#ef4444' }}>
                      {stats.totalUnknowns}
                    </div>
                    <ul>
                      <li>EO (Camera Poses): <b>{stats.eoUnknowns}</b> (6 × {stats.numPhotos})</li>
                      <li>IO (Calib): <b>{stats.ioUnknowns}</b> ({selfCalibration ? 'Self-Calib' : 'Known'})</li>
                      <li>Tie Points 3D: <b>{stats.tiePtUnknowns}</b> (3 × {stats.numTiePoints})</li>
                    </ul>
                  </div>

                  <div className="eq-card">
                    <h3>Observations (N_obs)</h3>
                    <div className="eq-main-val" style={{ color: '#3b82f6' }}>
                      {stats.totalObservations}
                    </div>
                    <ul>
                      <li>Tie Point Images: <b>{stats.tiePointObsCount}</b></li>
                      <li>GCP Image Obs: <b>{stats.gcpObsCount}</b> ({numGcps} GCPs)</li>
                    </ul>
                  </div>

                  <div className="eq-card">
                    <h3>Redundancy (r)</h3>
                    <div
                      className="eq-main-val"
                      style={{ color: stats.redundancy >= 20 ? '#10b981' : stats.redundancy >= 0 ? '#f59e0b' : '#ef4444' }}
                    >
                      {stats.redundancy >= 0 ? `+${stats.redundancy}` : stats.redundancy}
                    </div>
                    <ul>
                      <li>DOF: <b>{stats.redundancy}</b></li>
                      <li>Status: <b>{stats.status}</b></li>
                    </ul>
                  </div>
                </div>

                <div className="block-summary-box" style={{ marginTop: 12 }}>
                  <strong>💡 Overlap &amp; Tie Point Efficiency:</strong>
                  <p>
                    Without overlap, a block of {stats.numPhotos} photos would require <b>{stats.minGcpWithoutOverlap} GCPs</b> (3 GCPs per photo).
                  </p>
                  <p>
                    With <b>{endLap}% End-Lap</b> and <b>{sideLap}% Side-Lap</b>, shared <b>Tie Points</b> tie adjacent photos together.
                    This multi-ray network locks all photos into a rigid block, reducing required GCPs from <b>{stats.minGcpWithoutOverlap} down to just {stats.minGcpRequiredBlock} GCPs</b>!
                  </p>
                </div>

                {/* Collapsible Arithmetic Breakdown Drawer */}
                <button
                  className="accordion-toggle"
                  onClick={() => setShowArithmetic(!showArithmetic)}
                >
                  <span>🧮 {showArithmetic ? 'Hide' : 'Show'} Full Arithmetic Equation Breakdown Table</span>
                  <span>{showArithmetic ? '▲' : '▼'}</span>
                </button>

                {showArithmetic && (
                  <div className="math-step-calc" style={{ marginTop: 8 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Term</th>
                          <th>Formula</th>
                          <th>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><b>EO Unknowns</b></td>
                          <td>N_photos × 6 = {stats.numPhotos} × 6</td>
                          <td><b>{stats.eoUnknowns}</b></td>
                        </tr>
                        <tr>
                          <td><b>IO Unknowns</b></td>
                          <td>{selfCalibration ? 'Self-Calib (7 params)' : 'Known Lab Calibration'}</td>
                          <td><b>{stats.ioUnknowns}</b></td>
                        </tr>
                        <tr>
                          <td><b>Tie Pt Unknowns</b></td>
                          <td>N_tie × 3 = {stats.numTiePoints} × 3</td>
                          <td><b>{stats.tiePtUnknowns}</b></td>
                        </tr>
                        <tr style={{ background: '#fef2f2', fontWeight: 600 }}>
                          <td><b>TOTAL UNKNOWNS</b></td>
                          <td>N_EO + N_IO + N_Tie3D</td>
                          <td><b style={{ color: '#ef4444' }}>{stats.totalUnknowns}</b></td>
                        </tr>
                        <tr>
                          <td><b>Tie Pt Equations</b></td>
                          <td>N_tie × avgRays × 2</td>
                          <td><b>{stats.tiePointObsCount}</b></td>
                        </tr>
                        <tr>
                          <td><b>GCP Equations</b></td>
                          <td>N_gcp × obsPerPhoto × 2</td>
                          <td><b>{stats.gcpObsCount}</b></td>
                        </tr>
                        <tr style={{ background: '#eff6ff', fontWeight: 600 }}>
                          <td><b>TOTAL OBSERVATIONS</b></td>
                          <td>N_Obs_Tie + N_Obs_GCP</td>
                          <td><b style={{ color: '#3b82f6' }}>{stats.totalObservations}</b></td>
                        </tr>
                        <tr style={{ background: '#f0faf4', fontWeight: 700 }}>
                          <td><b>REDUNDANCY (r)</b></td>
                          <td>N_obs - N_unk</td>
                          <td><b style={{ color: stats.redundancy >= 0 ? '#10b981' : '#ef4444' }}>+{stats.redundancy} DOF</b></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="sim-panel">
                <h2>
                  <span className="stepno">4</span> Block Configuration
                </h2>

                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                  Fixed Block: <b>{numStrips} strips × {photosPerStrip} photos/strip = {stats.numPhotos} photos</b>
                </div>

                <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
                  <label>
                    End-Lap (Forward Overlap): <b>{endLap}%</b>
                    <input
                      type="range"
                      min="30"
                      max="90"
                      step="5"
                      value={endLap}
                      onChange={(e) => {
                        setEndLap(Number(e.target.value));
                        setSolverStep(0);
                      }}
                    />
                  </label>

                  <label>
                    Side-Lap (Lateral Overlap): <b>{sideLap}%</b>
                    <input
                      type="range"
                      min="0"
                      max="75"
                      step="5"
                      value={sideLap}
                      onChange={(e) => {
                        setSideLap(Number(e.target.value));
                        setSolverStep(0);
                      }}
                    />
                  </label>

                  <label>
                    Ground Control Points (GCPs): <b>{numGcps}</b>
                    <input
                      type="range"
                      min="0"
                      max="12"
                      step="1"
                      value={numGcps}
                      onChange={(e) => {
                        setNumGcps(Number(e.target.value));
                        setSolverStep(0);
                      }}
                    />
                  </label>

                  <label>
                    Tie Point Density per Photo: <b>{tieDensity} pts</b>
                    <input
                      type="range"
                      min="5"
                      max="50"
                      step="5"
                      value={tieDensity}
                      onChange={(e) => {
                        setTieDensity(Number(e.target.value));
                        setSolverStep(0);
                      }}
                    />
                  </label>

                  <div className="check-row" style={{ marginTop: 6 }}>
                    <label style={{ cursor: 'pointer', fontWeight: 600, color: '#334155' }}>
                      <input
                        type="checkbox"
                        checked={selfCalibration}
                        onChange={(e) => {
                          setSelfCalibration(e.target.checked);
                          setSolverStep(0);
                        }}
                      />
                      Enable In-Flight Self-Calibration (+7 IO Unknowns)
                    </label>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
