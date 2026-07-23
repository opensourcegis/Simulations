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
  // Main Tab State: 'single' (Single Photo & 3 GCP Rule) vs 'block' (Full Block Adjustment)
  const [activeTab, setActiveTab] = useState('single');

  // Tab 1: Single Photo State
  const [singleGcps, setSingleGcps] = useState(3); // 1 to 6 GCPs
  const [singleSelfCalib, setSingleSelfCalib] = useState(false);

  // Tab 2: Full Block Parameters
  const [numStrips, setNumStrips] = useState(2);
  const [photosPerStrip, setPhotosPerStrip] = useState(4);
  const [endLap, setEndLap] = useState(70);
  const [sideLap, setSideLap] = useState(40);
  const [numGcps, setNumGcps] = useState(4);
  const [tieDensity, setTieDensity] = useState(25);
  const [selfCalibration, setSelfCalibration] = useState(false);

  // 3D View Controls
  const [view3D, setView3D] = useState(true);
  const [yawAngle, setYawAngle] = useState(45);
  const [pitchAngle, setPitchAngle] = useState(35);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [showRays, setShowRays] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);

  // Solver Animation State
  const [solverStep, setSolverStep] = useState(0);
  const [isSolving, setIsSolving] = useState(false);

  // Animation Frame Ref for Smooth Light Rays & Laser Pulses
  const animFrameRef = useRef(null);
  const animTimeRef = useRef(0);
  const canvasRef = useRef(null);

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

  // Continuous Animation Loop (Light Ray Pulses & Laser Beams)
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

        // Dark gradient background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
        bgGrad.addColorStop(0, '#070f19');
        bgGrad.addColorStop(1, '#0e1d2e');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        const radYaw = (yawAngle * Math.PI) / 180;
        const radPitch = (pitchAngle * Math.PI) / 180;
        const cosY = Math.cos(radYaw), sinY = Math.sin(radYaw);
        const cosP = Math.cos(radPitch), sinP = Math.sin(radPitch);

        const project3D = (x, y, z) => {
          if (!view3D) {
            const margin = 50;
            const px = margin + (x / 100) * (width - 2 * margin);
            const py = margin + (y / 100) * (height - 2 * margin);
            return { px, py, depth: y };
          }
          const cx = 50, cy = 50, cz = 15;
          const dx = x - cx, dy = y - cy, dz = z - cz;

          const rx = dx * cosY - dy * sinY;
          const ry = dx * sinY + dy * cosY;
          const rz = dz * cosP - ry * sinP;
          const rDepth = ry * cosP + dz * sinP;

          const scale = ((width - 150) / 140) * zoomScale;
          const px = width / 2 + rx * scale;
          const py = height / 2 + 35 - rz * scale * 1.25;
          return { px, py, depth: rDepth };
        };

        if (activeTab === 'single') {
          // =========================================================================
          // TAB 1: Single Photo & 3 GCP Collinearity Animation
          // =========================================================================
          // Ground Plane Grid
          const pG0 = project3D(0, 0, 0), pG1 = project3D(100, 0, 0), pG2 = project3D(100, 100, 0), pG3 = project3D(0, 100, 0);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
          ctx.beginPath();
          ctx.moveTo(pG0.px, pG0.py); ctx.lineTo(pG1.px, pG1.py); ctx.lineTo(pG2.px, pG2.py); ctx.lineTo(pG3.px, pG3.py);
          ctx.closePath(); ctx.fill();

          ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
          ctx.lineWidth = 1.5; ctx.stroke();

          // Camera Center Position C1
          const camX = 50, camY = 50, camZ = 40;
          const camProj = project3D(camX, camY, camZ);

          // Camera Uncertainty Error Cone (if GCPs < 3)
          if (singleGcps < 3) {
            const errRadius = (3 - singleGcps) * 16;
            ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(camProj.px, camProj.py, errRadius, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();

            ctx.fillStyle = '#ef4444';
            ctx.font = '600 11px system-ui';
            ctx.textAlign = 'center';
            ctx.fillText(`⚠️ Pose Uncertainty Cone (r = ${singleGcps * 2 - 6})`, camProj.px, camProj.py - errRadius - 8);
          }

          // Single Camera Pyramid Cones
          const fW = 32, fH = 26;
          const fp0 = project3D(camX - fW / 2, camY - fH / 2, 0);
          const fp1 = project3D(camX + fW / 2, camY - fH / 2, 0);
          const fp2 = project3D(camX + fW / 2, camY + fH / 2, 0);
          const fp3 = project3D(camX - fW / 2, camY + fH / 2, 0);

          ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.2;

          [fp0, fp1, fp2, fp3].forEach((fp) => {
            ctx.beginPath(); ctx.moveTo(camProj.px, camProj.py); ctx.lineTo(fp.px, fp.py); ctx.stroke();
          });

          ctx.beginPath();
          ctx.moveTo(fp0.px, fp0.py); ctx.lineTo(fp1.px, fp1.py); ctx.lineTo(fp2.px, fp2.py); ctx.lineTo(fp3.px, fp3.py);
          ctx.closePath(); ctx.fill(); ctx.stroke();

          // Camera Center Node
          ctx.fillStyle = '#38bdf8'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(camProj.px, camProj.py, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#ffffff'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'center';
          ctx.fillText('Camera C1 (Xc, Yc, Zc, ω, φ, κ)', camProj.px, camProj.py - 12);

          // Single Photo GCP Locations
          const gcpLocations = [
            { x: 30, y: 32 }, { x: 70, y: 32 }, { x: 70, y: 68 },
            { x: 30, y: 68 }, { x: 50, y: 32 }, { x: 50, y: 68 },
          ];

          for (let g = 0; g < singleGcps; g++) {
            const gcp = gcpLocations[g];
            const gcpProj = project3D(gcp.x, gcp.y, 0);

            // Animated Laser Pulse along Ray
            ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.moveTo(camProj.px, camProj.py); ctx.lineTo(gcpProj.px, gcpProj.py); ctx.stroke();

            // Animated Traveling Pulse Ring
            const pFrac = (t * 0.8 + g * 0.35) % 1.0;
            const pulsePx = camProj.px + (gcpProj.px - camProj.px) * pFrac;
            const pulsePy = camProj.py + (gcpProj.py - camProj.py) * pFrac;
            ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(pulsePx, pulsePy, 4, 0, Math.PI * 2); ctx.fill();

            // GCP Target Ring ⊙
            ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(gcpProj.px, gcpProj.py, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(gcpProj.px, gcpProj.py, 2.5, 0, Math.PI * 2); ctx.fill();

            ctx.fillStyle = '#fbbf24'; ctx.font = '600 10px system-ui'; ctx.textAlign = 'center';
            ctx.fillText(`GCP-${g + 1} (2 eq)`, gcpProj.px, gcpProj.py - 10);
          }

        } else {
          // =========================================================================
          // TAB 2: Full Block Adjustment & Overlap Efficiency Animation
          // =========================================================================
          const pG0 = project3D(0, 0, 0), pG1 = project3D(100, 0, 0), pG2 = project3D(100, 100, 0), pG3 = project3D(0, 100, 0);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
          ctx.beginPath();
          ctx.moveTo(pG0.px, pG0.py); ctx.lineTo(pG1.px, pG1.py); ctx.lineTo(pG2.px, pG2.py); ctx.lineTo(pG3.px, pG3.py);
          ctx.closePath(); ctx.fill();

          // Overlap Heatmap
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

          // Cameras & Flight Strips
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

          // Tie Points with Animated Pulse
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

          // GCP Markers
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

          // Cameras & Rays
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
    singleGcps,
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
          <strong>📸 Tab 1: Single Photo Collinearity &amp; 3 GCP Rule</strong>
          <span>Learn why 1 single photo requires at least 3 GCPs (6 equations for 6 EO parameters)</span>
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
            <h2>
              <span className="stepno">1</span>
              {activeTab === 'single' ? ' Single Camera Collinearity & GCP Ray-Tracing' : ' 3D Flight Block & Overlap Ray-Tracing'}
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

            <canvas ref={canvasRef} className="block-view3d" width={700} height={400} />

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
              <span>
                <i className="block-swatch" style={{ background: '#38bdf8' }} /> Camera Center (C1)
              </span>
              <span>
                <i className="block-swatch" style={{ background: '#f59e0b' }} /> Ground Control Points ({activeTab === 'single' ? singleGcps : numGcps} GCPs)
              </span>
              {activeTab === 'block' && (
                <span>
                  <i className="block-swatch" style={{ background: '#34d399' }} /> Tie Points (~{stats.numTiePoints})
                </span>
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

        {/* Right Column: Interactive Tab Content & Mathematics */}
        <div className="sim-col">
          {activeTab === 'single' ? (
            /* ========================================================================= */
            /* TAB 1 CONTENT: SINGLE PHOTO COLLINEARITY & 3 GCP RULE                     */
            /* ========================================================================= */
            <>
              <section className="sim-panel">
                <h2>
                  <span className="stepno">2</span> Single Photo Collinearity &amp; 3 GCP Rule
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

                {/* Math Equation Balance Cards for Single Photo */}
                <div className="eq-balance-grid" style={{ marginTop: 14 }}>
                  <div className="eq-card">
                    <h3>Unknowns (N_unk)</h3>
                    <div className="eq-main-val" style={{ color: '#ef4444' }}>
                      {singleUnkCount}
                    </div>
                    <ul>
                      <li>EO (Position + Attitude): <b>6</b> (Xc,Yc,Zc, ω,φ,κ)</li>
                      <li>IO (Focal length/distortion): <b>{singleSelfCalib ? 7 : 0}</b></li>
                    </ul>
                  </div>

                  <div className="eq-card">
                    <h3>Observations (N_obs)</h3>
                    <div className="eq-main-val" style={{ color: '#3b82f6' }}>
                      {singleEqCount}
                    </div>
                    <ul>
                      <li>Collinearity Equations: <b>{singleEqCount}</b> (2 per GCP)</li>
                      <li>Measured GCPs: <b>{singleGcps}</b></li>
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

                {/* Educational Explanation Box */}
                <div className="block-summary-box" style={{ marginTop: 14 }}>
                  <strong>🎯 Why Exactly 3 GCPs are Minimum Required for a Single Photo:</strong>
                  <p>
                    Each camera pose in 3D space has <b>6 degrees of freedom (Exterior Orientation)</b>:
                    3 spatial coordinates <code>(Xc, Yc, Zc)</code> and 3 rotation angles <code>(roll ω, pitch φ, yaw κ)</code>.
                  </p>
                  <p>
                    Every GCP measured on the photograph produces <b>2 collinearity observation equations</b> (image x and image y).
                  </p>
                  <ul>
                    <li><b>1 GCP (2 equations)</b>: 2 equations &lt; 6 unknowns &rarr; <code>r = -4</code> (Underdetermined! Camera position &amp; tilt remain completely unknown).</li>
                    <li><b>2 GCPs (4 equations)</b>: 4 equations &lt; 6 unknowns &rarr; <code>r = -2</code> (Underdetermined! Camera scale &amp; rotation remain free to swing).</li>
                    <li><b>3 GCPs (6 equations)</b>: 6 equations = 6 unknowns &rarr; <code>r = 0</code> (<b>EXACTLY DETERMINED</b>! Solves all 6 EO parameters perfectly!).</li>
                    <li><b>4+ GCPs (8+ equations)</b>: 8 equations &gt; 6 unknowns &rarr; <code>r = +2</code> (<b>OVERDETERMINED</b>! Enables Gauss-Markov least-squares error minimization).</li>
                  </ul>
                </div>
              </section>

              {/* Formula & Calculation Box */}
              <section className="sim-panel">
                <h2>
                  <span className="stepno">3</span> Collinearity Formulas &amp; Arithmetic Breakdown
                </h2>

                <div className="math-formula-box">
                  <div style={{ color: '#38bdf8', fontWeight: 600, marginBottom: 4 }}>
                    Single-Photo Collinearity Equations:
                  </div>
                  <div>x - x₀ = -f · [ m₁₁(X - X_c) + m₁₂(Y - Y_c) + m₁₃(Z - Z_c) ] / [ m₃₁(X - X_c) + m₃₂(Y - Y_c) + m₃₃(Z - Z_c) ]</div>
                  <div>y - y₀ = -f · [ m₂₁(X - X_c) + m₂₂(Y - Y_c) + m₂₃(Z - Z_c) ] / [ m₃₁(X - X_c) + m₃₂(Y - Y_c) + m₃₃(Z - Z_c) ]</div>
                </div>

                <div className="math-step-calc">
                  <strong>🧮 Single-Photo System Solvability Calculation:</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>GCP Count</th>
                        <th>Collinearity Equations (N_obs)</th>
                        <th>EO Unknowns (N_unk)</th>
                        <th>Redundancy (r)</th>
                        <th>Solvability Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: singleGcps === 1 ? '#fef2f2' : undefined }}>
                        <td>1 GCP</td>
                        <td>1 × 2 = 2 equations</td>
                        <td>6 parameters</td>
                        <td><b style={{ color: '#ef4444' }}>-4 (Underdetermined)</b></td>
                        <td>❌ Camera pose floating/unsolvable</td>
                      </tr>
                      <tr style={{ background: singleGcps === 2 ? '#fef2f2' : undefined }}>
                        <td>2 GCPs</td>
                        <td>2 × 2 = 4 equations</td>
                        <td>6 parameters</td>
                        <td><b style={{ color: '#ef4444' }}>-2 (Underdetermined)</b></td>
                        <td>❌ Scale &amp; rotation unconstrained</td>
                      </tr>
                      <tr style={{ background: singleGcps === 3 ? '#f0faf4' : undefined, fontWeight: 700 }}>
                        <td>3 GCPs</td>
                        <td>3 × 2 = 6 equations</td>
                        <td>6 parameters</td>
                        <td><b style={{ color: '#10b981' }}>0 (Exactly Determined)</b></td>
                        <td>✅ Minimal 3D resection solution</td>
                      </tr>
                      <tr style={{ background: singleGcps >= 4 ? '#eff6ff' : undefined }}>
                        <td>4+ GCPs</td>
                        <td>{singleGcps} × 2 = {singleEqCount} equations</td>
                        <td>6 parameters</td>
                        <td><b style={{ color: '#3b82f6' }}>+{singleEqCount - 6} (Overdetermined)</b></td>
                        <td>✅ Robust least-squares bundle solution</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          ) : (
            /* ========================================================================= */
            /* TAB 2 CONTENT: FULL BLOCK ADJUSTMENT & OVERLAP EFFICIENCY                 */
            /* ========================================================================= */
            <>
              {/* Section 3: Equation & Redundancy Math Engine */}
              <section className="sim-panel">
                <h2>
                  <span className="stepno">3</span> Photogrammetric Equation &amp; Redundancy Balance
                </h2>

                <div className="eq-balance-grid">
                  <div className="eq-card">
                    <h3>Unknowns (N_unk)</h3>
                    <div className="eq-main-val" style={{ color: '#ef4444' }}>
                      {stats.totalUnknowns}
                    </div>
                    <ul>
                      <li>EO (Camera Poses): <b>{stats.eoUnknowns}</b> (6 × {stats.numPhotos})</li>
                      <li>IO (Calib. Params): <b>{stats.ioUnknowns}</b> ({selfCalibration ? 'Self-Calib' : 'Known'})</li>
                      <li>Tie Points 3D (X,Y,Z): <b>{stats.tiePtUnknowns}</b> (3 × {stats.numTiePoints})</li>
                    </ul>
                  </div>

                  <div className="eq-card">
                    <h3>Observations (N_obs)</h3>
                    <div className="eq-main-val" style={{ color: '#3b82f6' }}>
                      {stats.totalObservations}
                    </div>
                    <ul>
                      <li>Tie Point Images: <b>{stats.tiePointObsCount}</b> (2 × ~{stats.avgRaysPerTiePoint} rays)</li>
                      <li>GCP Image Obs: <b>{stats.gcpObsCount}</b> ({numGcps} GCPs)</li>
                    </ul>
                  </div>

                  <div className="eq-card">
                    <h3>Redundancy (r = N_obs - N_unk)</h3>
                    <div
                      className="eq-main-val"
                      style={{ color: stats.redundancy >= 20 ? '#10b981' : stats.redundancy >= 0 ? '#f59e0b' : '#ef4444' }}
                    >
                      {stats.redundancy >= 0 ? `+${stats.redundancy}` : stats.redundancy}
                    </div>
                    <ul>
                      <li>Degrees of Freedom: <b>{stats.redundancy}</b></li>
                      <li>Status: <b>{stats.status}</b></li>
                    </ul>
                  </div>
                </div>

                {/* Educational Insight Box */}
                <div className="block-summary-box">
                  <strong>💡 Overlap &amp; Tie Point Efficiency Principle:</strong>
                  <p>
                    Without photo overlap, a block of {stats.numPhotos} photos would require <b>{stats.minGcpWithoutOverlap} GCPs</b> (3 GCPs per photo).
                  </p>
                  <p>
                    By adding <b>{endLap}% End-Lap</b> and <b>{sideLap}% Side-Lap</b>, overlapping photos observe common <b>Tie Points</b> across 3 to 4 photos.
                    Each tie point adds ~{Math.round(stats.avgRaysPerTiePoint * 2)} equations for only 3 unknowns, adding <b>+{Math.round(stats.avgRaysPerTiePoint * 2 - 3)} degrees of freedom</b> to the block.
                    This multi-ray network locks all photos into a rigid block, reducing the minimum required GCPs for the entire block from <b>{stats.minGcpWithoutOverlap} down to just {stats.minGcpRequiredBlock} GCPs</b>!
                  </p>
                </div>

                {/* Worked Arithmetic Calculation Breakdown Table */}
                <div className="math-step-calc" style={{ marginTop: 12 }}>
                  <strong>🧮 Live Variable &amp; Equation Arithmetic Breakdown:</strong>
                  <table>
                    <thead>
                      <tr>
                        <th>Variable / Term</th>
                        <th>Formula</th>
                        <th>Calculated Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td><b>EO Unknowns (N_EO)</b></td>
                        <td>N_photos × 6 = {stats.numPhotos} × 6</td>
                        <td><b>{stats.eoUnknowns} parameters</b> (3 position + 3 orientation per photo)</td>
                      </tr>
                      <tr>
                        <td><b>IO Unknowns (N_IO)</b></td>
                        <td>{selfCalibration ? 'Self-Calib (f, x₀, y₀, K₁, K₂, P₁, P₂)' : 'Known Lab Calibration'}</td>
                        <td><b>{stats.ioUnknowns} parameters</b></td>
                      </tr>
                      <tr>
                        <td><b>Tie Point Unknowns (N_Tie3D)</b></td>
                        <td>N_tie × 3 = {stats.numTiePoints} × 3</td>
                        <td><b>{stats.tiePtUnknowns} ground coords</b> (X, Y, Z per point)</td>
                      </tr>
                      <tr style={{ background: '#fef2f2', fontWeight: 600 }}>
                        <td><b>TOTAL UNKNOWNS (N_unk)</b></td>
                        <td>N_EO + N_IO + N_Tie3D = {stats.eoUnknowns} + {stats.ioUnknowns} + {stats.tiePtUnknowns}</td>
                        <td><b style={{ color: '#ef4444' }}>{stats.totalUnknowns} Unknowns</b></td>
                      </tr>
                      <tr>
                        <td><b>Tie Point Image Equations</b></td>
                        <td>N_tie × avgRays × 2 = {stats.numTiePoints} × {stats.avgRaysPerTiePoint} × 2</td>
                        <td><b>{stats.tiePointObsCount} equations</b> (2 per ray observation)</td>
                      </tr>
                      <tr>
                        <td><b>GCP Observation Equations</b></td>
                        <td>N_gcp × obsPerPhoto × 2 = {numGcps} × {Math.min(stats.numPhotos, Math.max(2, Math.round(stats.numPhotos * 0.4)))} × 2</td>
                        <td><b>{stats.gcpObsCount} equations</b></td>
                      </tr>
                      <tr style={{ background: '#eff6ff', fontWeight: 600 }}>
                        <td><b>TOTAL OBSERVATIONS (N_obs)</b></td>
                        <td>N_Obs_Tie + N_Obs_GCP = {stats.tiePointObsCount} + {stats.gcpObsCount}</td>
                        <td><b style={{ color: '#3b82f6' }}>{stats.totalObservations} Equations</b></td>
                      </tr>
                      <tr style={{ background: '#f0faf4', fontWeight: 700 }}>
                        <td><b>REDUNDANCY (r = DOF)</b></td>
                        <td>N_obs - N_unk = {stats.totalObservations} - {stats.totalUnknowns}</td>
                        <td><b style={{ color: stats.redundancy >= 0 ? '#10b981' : '#ef4444' }}>+{stats.redundancy} Degrees of Freedom</b></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Section 4: Block Configuration Sliders */}
              <section className="sim-panel">
                <h2>
                  <span className="stepno">4</span> Block &amp; Camera Configuration Sliders
                </h2>

                <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
                  <label>
                    Flight Strips (N_strips): <b>{numStrips}</b>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="1"
                      value={numStrips}
                      onChange={(e) => {
                        setNumStrips(Number(e.target.value));
                        setSolverStep(0);
                      }}
                    />
                  </label>

                  <label>
                    Photos per Strip (N_photos): <b>{photosPerStrip}</b>
                    <input
                      type="range"
                      min="2"
                      max="6"
                      step="1"
                      value={photosPerStrip}
                      onChange={(e) => {
                        setPhotosPerStrip(Number(e.target.value));
                        setSolverStep(0);
                      }}
                    />
                  </label>

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
