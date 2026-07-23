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
  // End-lap (forward) & side-lap (lateral) determine how many photos view each ground zone
  const endOverlapRatio = endLap / 100;
  const sideOverlapRatio = sideLap / 100;

  // Average rays per tie point based on overlaps
  let avgRaysPerTiePoint = 2.0;
  if (endOverlapRatio >= 0.6 && sideOverlapRatio >= 0.3) {
    avgRaysPerTiePoint = 3.8 + (endOverlapRatio - 0.6) * 4 + (sideOverlapRatio - 0.3) * 3;
  } else if (endOverlapRatio >= 0.5) {
    avgRaysPerTiePoint = 2.4 + (endOverlapRatio - 0.5) * 3;
  }
  avgRaysPerTiePoint = Number(Math.min(numPhotos, avgRaysPerTiePoint).toFixed(2));

  // Estimate total unique Tie Points in the block
  const numTiePoints = Math.round(numPhotos * tieDensity * (1 - endOverlapRatio * 0.4 - sideOverlapRatio * 0.3));

  // Unknown 3D ground coordinates for Tie Points: 3 per point (X, Y, Z)
  const tiePtUnknowns = numTiePoints * 3;

  // Total Unknowns
  const totalUnknowns = eoUnknowns + ioUnknowns + tiePtUnknowns;

  // 4. Observations (Collinearity Equations):
  // Each measured image point (x, y) yields 2 equations
  const tiePointObsCount = Math.round(numTiePoints * avgRaysPerTiePoint * 2);

  // Each GCP observed in average ~3.0 photos gives 2 image equations per photo
  const gcpObsPerPhoto = Math.min(numPhotos, Math.max(2, Math.round(numPhotos * 0.4)));
  const gcpObsCount = numGcps * gcpObsPerPhoto * 2;

  // Total Collinearity Equations
  const totalObservations = tiePointObsCount + gcpObsCount;

  // 5. System Redundancy (Degrees of Freedom): r = N_obs - N_unk
  const redundancy = totalObservations - totalUnknowns;

  // Minimum GCPs required for whole block vs without tie points
  const minGcpRequiredBlock = selfCalibration ? 4 : 3;
  const minGcpWithoutOverlap = numPhotos * 3; // 3 GCPs per independent photo

  // Solvability status
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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function BlockAdjustment() {
  // Flight Block Parameters
  const [numStrips, setNumStrips] = useState(2);
  const [photosPerStrip, setPhotosPerStrip] = useState(4);
  const [endLap, setEndLap] = useState(70); // % Forward overlap
  const [sideLap, setSideLap] = useState(40); // % Lateral overlap
  const [numGcps, setNumGcps] = useState(4);
  const [tieDensity, setTieDensity] = useState(25);
  const [selfCalibration, setSelfCalibration] = useState(false);

  // View & Simulation State
  const [view3D, setView3D] = useState(true);
  const [yawAngle, setYawAngle] = useState(45);
  const [pitchAngle, setPitchAngle] = useState(35);
  const [zoomScale, setZoomScale] = useState(1.0);
  const [showRays, setShowRays] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);

  // Solver Iteration Simulation State
  const [solverStep, setSolverStep] = useState(0);
  const [isSolving, setIsSolving] = useState(false);

  const canvasRef = useRef(null);

  // Calculate mathematical parameters balance
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

  // Solver iterations (RMS Error simulation)
  const solverHistory = useMemo(() => {
    const history = [];
    const maxSteps = 8;
    const initialRms = 8.5 + (selfCalibration ? 3.2 : 0) + (stats.status === 'UNSOLVABLE' ? 12 : 0);
    const targetRms = stats.status === 'UNSOLVABLE' ? 14.5 : 0.35 + (selfCalibration ? 0.1 : 0);

    for (let k = 0; k <= maxSteps; k++) {
      const progress = k / maxSteps;
      // Exponential decay curve for least-squares reprojection error
      const rms = Number((targetRms + (initialRms - targetRms) * Math.exp(-progress * 4.5)).toFixed(2));
      const deltaEo = Number((0.8 * Math.exp(-progress * 3.8)).toFixed(3));
      const delta3d = Number((1.4 * Math.exp(-progress * 3.5)).toFixed(3));

      history.push({ step: k, rms, deltaEo, delta3d });
    }
    return history;
  }, [stats.status, selfCalibration]);

  // Handle Bundle Adjustment auto-run simulation
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

  // Render 3D Scene / 2D Plan View on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Dark slate gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#09121d');
    bgGrad.addColorStop(1, '#0e1d2e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 3D Isometric Projection Setup
    const radYaw = (yawAngle * Math.PI) / 180;
    const radPitch = (pitchAngle * Math.PI) / 180;
    const cosY = Math.cos(radYaw), sinY = Math.sin(radYaw);
    const cosP = Math.cos(radPitch), sinP = Math.sin(radPitch);

    const project3D = (x, y, z) => {
      if (!view3D) {
        // 2D Top Plan View
        const margin = 50;
        const px = margin + (x / 100) * (width - 2 * margin);
        const py = margin + (y / 100) * (height - 2 * margin);
        return { px, py, depth: y };
      }

      // 3D Orbit View
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

    // 1. Draw Ground Plane & Overlap Heatmap Grid
    const groundZ = 0;
    const pG0 = project3D(0, 0, groundZ);
    const pG1 = project3D(100, 0, groundZ);
    const pG2 = project3D(100, 100, groundZ);
    const pG3 = project3D(0, 100, groundZ);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.beginPath();
    ctx.moveTo(pG0.px, pG0.py);
    ctx.lineTo(pG1.px, pG1.py);
    ctx.lineTo(pG2.px, pG2.py);
    ctx.lineTo(pG3.px, pG3.py);
    ctx.closePath();
    ctx.fill();

    // Draw Overlap Coverage Heatmap on Ground
    if (showHeatmap) {
      const gridRes = 8;
      const cellW = 100 / gridRes;
      const cellH = 100 / gridRes;

      for (let gx = 0; gx < gridRes; gx++) {
        for (let gy = 0; gy < gridRes; gy++) {
          const cx = (gx + 0.5) * cellW;
          const cy = (gy + 0.5) * cellH;

          // Estimate overlap count at (cx, cy)
          let overlapCount = 0;
          const photoW = 35 * (1 + (100 - endLap) / 100);
          const photoH = 35 * (1 + (100 - sideLap) / 100);

          for (let s = 0; s < numStrips; s++) {
            for (let p = 0; p < photosPerStrip; p++) {
              const camX = 15 + p * (70 / Math.max(1, photosPerStrip - 1));
              const camY = 20 + s * (60 / Math.max(1, numStrips - 1));
              if (Math.abs(cx - camX) < photoW / 2 && Math.abs(cy - camY) < photoH / 2) {
                overlapCount++;
              }
            }
          }

          let color = 'rgba(30, 58, 138, 0.15)'; // 1x overlap (Blue)
          if (overlapCount === 2) color = 'rgba(14, 165, 233, 0.25)'; // 2x overlap (Cyan)
          else if (overlapCount === 3) color = 'rgba(16, 185, 129, 0.35)'; // 3x overlap (Green)
          else if (overlapCount >= 4) color = 'rgba(245, 158, 11, 0.45)'; // 4x+ overlap (Gold)

          const c0 = project3D(gx * cellW, gy * cellH, 0);
          const c1 = project3D((gx + 1) * cellW, gy * cellH, 0);
          const c2 = project3D((gx + 1) * cellW, (gy + 1) * cellH, 0);
          const c3 = project3D(gx * cellW, (gy + 1) * cellH, 0);

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.moveTo(c0.px, c0.py);
          ctx.lineTo(c1.px, c1.py);
          ctx.lineTo(c2.px, c2.py);
          ctx.lineTo(c3.px, c3.py);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Ground Outline
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 2. Compute Camera Locations & Flight Lines
    const flightHeight = 35;
    const cameraPoses = [];

    for (let s = 0; s < numStrips; s++) {
      const stripY = 20 + s * (60 / Math.max(1, numStrips - 1));
      const stripPoints = [];

      for (let p = 0; p < photosPerStrip; p++) {
        const camX = 15 + p * (70 / Math.max(1, photosPerStrip - 1));
        const camZ = flightHeight;
        cameraPoses.push({ id: s * photosPerStrip + p, strip: s, photo: p, x: camX, y: stripY, z: camZ });
        stripPoints.push(project3D(camX, stripY, camZ));
      }

      // Draw Flight Strip Line
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      stripPoints.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.px, pt.py);
        else ctx.lineTo(pt.px, pt.py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 3. Generate & Draw Tie Points & GCPs on Terrain
    const tiePoints = [];
    const seed = 123;
    const pseudoRand = (i) => Math.sin(i * 9999 + seed) - Math.floor(Math.sin(i * 9999 + seed));

    for (let t = 0; t < Math.min(60, stats.numTiePoints); t++) {
      const tx = 10 + pseudoRand(t * 3) * 80;
      const ty = 15 + pseudoRand(t * 3 + 1) * 70;
      const tz = 0;
      tiePoints.push({ x: tx, y: ty, z: tz });
    }

    // Draw Tie Points (Glowing Cyan Dots)
    tiePoints.forEach((pt) => {
      const proj = project3D(pt.x, pt.y, pt.z);
      ctx.fillStyle = '#34d399';
      ctx.shadowColor = '#34d399';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(proj.px, proj.py, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Generate & Draw GCP Markers (Gold Target Circles ⊙)
    const gcps = [];
    const gcpCoords = [
      { x: 12, y: 15 }, { x: 88, y: 15 }, { x: 88, y: 85 }, { x: 12, y: 85 },
      { x: 50, y: 15 }, { x: 50, y: 85 }, { x: 12, y: 50 }, { x: 88, y: 50 },
      { x: 35, y: 35 }, { x: 65, y: 35 }, { x: 35, y: 65 }, { x: 65, y: 65 },
    ];

    for (let g = 0; g < Math.min(numGcps, gcpCoords.length); g++) {
      gcps.push(gcpCoords[g]);
    }

    gcps.forEach((gcp, idx) => {
      const proj = project3D(gcp.x, gcp.y, 0);
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;

      // GCP Target Mark
      ctx.beginPath();
      ctx.arc(proj.px, proj.py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(proj.px, proj.py, 2, 0, Math.PI * 2);
      ctx.fill();

      // GCP Label
      ctx.fillStyle = '#fbbf24';
      ctx.font = '600 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`GCP-${idx + 1}`, proj.px, proj.py - 9);
    });

    // 4. Draw Camera Cones & Ray Tracing Lines
    cameraPoses.forEach((cam) => {
      const camProj = project3D(cam.x, cam.y, cam.z);

      // Camera Frustum Ground Footprint
      const fW = 20;
      const fH = 20;
      const fp0 = project3D(cam.x - fW / 2, cam.y - fH / 2, 0);
      const fp1 = project3D(cam.x + fW / 2, cam.y - fH / 2, 0);
      const fp2 = project3D(cam.x + fW / 2, cam.y + fH / 2, 0);
      const fp3 = project3D(cam.x - fW / 2, cam.y + fH / 2, 0);

      // Draw Image Plane Cone
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(camProj.px, camProj.py);
      ctx.lineTo(fp0.px, fp0.py);
      ctx.lineTo(fp1.px, fp1.py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(camProj.px, camProj.py);
      ctx.lineTo(fp1.px, fp1.py);
      ctx.lineTo(fp2.px, fp2.py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(camProj.px, camProj.py);
      ctx.lineTo(fp2.px, fp2.py);
      ctx.lineTo(fp3.px, fp3.py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(camProj.px, camProj.py);
      ctx.lineTo(fp3.px, fp3.py);
      ctx.lineTo(fp0.px, fp0.py);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Camera Center Node
      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(camProj.px, camProj.py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Camera Label
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '600 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`C${cam.id + 1}`, camProj.px, camProj.py - 8);

      // Draw Ray-Tracing Lines from Camera to selected Tie Points & GCPs
      if (showRays) {
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.25)';
        ctx.lineWidth = 0.8;

        tiePoints.forEach((tp) => {
          if (Math.hypot(tp.x - cam.x, tp.y - cam.y) < 28) {
            const tpProj = project3D(tp.x, tp.y, tp.z);
            ctx.beginPath();
            ctx.moveTo(camProj.px, camProj.py);
            ctx.lineTo(tpProj.px, tpProj.py);
            ctx.stroke();
          }
        });

        // Rays to GCPs
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
        ctx.lineWidth = 1;
        gcps.forEach((gcp) => {
          if (Math.hypot(gcp.x - cam.x, gcp.y - cam.y) < 32) {
            const gcpProj = project3D(gcp.x, gcp.y, 0);
            ctx.beginPath();
            ctx.moveTo(camProj.px, camProj.py);
            ctx.lineTo(gcpProj.px, gcpProj.py);
            ctx.stroke();
          }
        });
      }
    });

  }, [
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

        {/* System Solvability Status Badge */}
        <span className={`solvability-badge ${stats.status.toLowerCase()}`}>
          {stats.status === 'STABLE' && `✅ STABLE & OVERDETERMINED (r = +${stats.redundancy})`}
          {stats.status === 'CRITICAL' && `⚠️ CRITICAL REDUNDANCY (r = +${stats.redundancy})`}
          {stats.status === 'UNSOLVABLE' && `❌ UNSOLVABLE (r = ${stats.redundancy})`}
        </span>
      </header>

      <div className="sim-layout">
        {/* Left Column: 3D Block View & Camera Frustums */}
        <div className="sim-col">
          <section className="sim-panel">
            <h2>
              <span className="stepno">1</span> 3D Flight Block &amp; Overlap Ray-Tracing Visualizer
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

            <canvas
              ref={canvasRef}
              className="block-view3d"
              width={700}
              height={400}
            />

            {/* 3D View Controls & Toggles */}
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
            </div>

            {/* Legend */}
            <div className="block-legend">
              <span>
                <i className="block-swatch" style={{ background: '#38bdf8' }} /> Camera Centers ({stats.numPhotos} photos)
              </span>
              <span>
                <i className="block-swatch" style={{ background: '#34d399' }} /> Overlap Tie Points (~{stats.numTiePoints})
              </span>
              <span>
                <i className="block-swatch" style={{ background: '#f59e0b' }} /> Ground Control Points (GCPs: {numGcps})
              </span>
              <span>
                <i className="block-swatch" style={{ background: 'rgba(16, 185, 129, 0.4)' }} /> 3x+ Overlap Zone
              </span>
            </div>
          </section>

          {/* Section 2: Iterative Bundle Adjustment Solver Simulation */}
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 10, fontSize: 12, color: '#475569' }}>
                <div>
                  Mean EO Update (ΔEO): <b>{solverHistory[solverStep].deltaEo} m/rad</b>
                </div>
                <div>
                  Mean 3D Point Correction (ΔXYZ): <b>{solverHistory[solverStep].delta3d} m</b>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Mathematical Parameter Balance & System Controls */}
        <div className="sim-col">
          {/* Section 3: Equation & Redundancy Math Engine */}
          <section className="sim-panel">
            <h2>
              <span className="stepno">3</span> Photogrammetric Equation &amp; Redundancy Balance
            </h2>

            <div className="eq-balance-grid">
              {/* Unknowns Card */}
              <div className="eq-card">
                <h3>Unknowns (N_unk)</h3>
                <div className="eq-main-val" style={{ color: '#ef4444' }}>
                  {stats.totalUnknowns}
                </div>
                <ul>
                  <li>
                    EO (Camera Poses): <b>{stats.eoUnknowns}</b> (6 × {stats.numPhotos})
                  </li>
                  <li>
                    IO (Calib. Params): <b>{stats.ioUnknowns}</b> ({selfCalibration ? 'Self-Calib' : 'Known'})
                  </li>
                  <li>
                    Tie Points 3D (X,Y,Z): <b>{stats.tiePtUnknowns}</b> (3 × {stats.numTiePoints})
                  </li>
                </ul>
              </div>

              {/* Observations Card */}
              <div className="eq-card">
                <h3>Observations (N_obs)</h3>
                <div className="eq-main-val" style={{ color: '#3b82f6' }}>
                  {stats.totalObservations}
                </div>
                <ul>
                  <li>
                    Tie Point Images: <b>{stats.tiePointObsCount}</b> (2 × ~{stats.avgRaysPerTiePoint} rays)
                  </li>
                  <li>
                    GCP Image Obs: <b>{stats.gcpObsCount}</b> ({numGcps} GCPs)
                  </li>
                </ul>
              </div>

              {/* Redundancy Card */}
              <div className="eq-card">
                <h3>Redundancy (r = N_obs - N_unk)</h3>
                <div
                  className="eq-main-val"
                  style={{ color: stats.redundancy >= 20 ? '#10b981' : stats.redundancy >= 0 ? '#f59e0b' : '#ef4444' }}
                >
                  {stats.redundancy >= 0 ? `+${stats.redundancy}` : stats.redundancy}
                </div>
                <ul>
                  <li>
                    Degrees of Freedom: <b>{stats.redundancy}</b>
                  </li>
                  <li>
                    Status: <b>{stats.status}</b>
                  </li>
                </ul>
              </div>
            </div>

            {/* Educational Insight Box */}
            <div className="block-summary-box">
              <strong>💡 Overlap &amp; Tie Point Efficiency Principle:</strong>
              <p>
                A single un-overlapped photo has 6 EO unknowns and requires at least <b>3 GCPs</b> (6 equations).
                Without photo overlap, a block of {stats.numPhotos} photos would require <b>{stats.minGcpWithoutOverlap} GCPs</b>!
              </p>
              <p>
                By adding <b>{endLap}% End-Lap</b> and <b>{sideLap}% Side-Lap</b>, overlapping photos observe common <b>Tie Points</b> across 3 to 4 photos.
                Each tie point adds ~{Math.round(stats.avgRaysPerTiePoint * 2)} equations for only 3 unknowns, adding <b>+{Math.round(stats.avgRaysPerTiePoint * 2 - 3)} degrees of freedom</b> to the block.
                This multi-ray network locks all photos into a rigid block, reducing the minimum required GCPs for the entire block from <b>{stats.minGcpWithoutOverlap} down to just {stats.minGcpRequiredBlock} GCPs</b>!
              </p>
            </div>
          </section>

          {/* Section 4: Interactive Parameter Controls */}
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
                  Enable In-Flight Self-Calibration (+7 IO Unknowns: f, x₀, y₀, K₁, K₂, P₁, P₂)
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
