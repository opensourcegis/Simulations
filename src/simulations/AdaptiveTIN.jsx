import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './simulation.css';
import './native.css';
import './tin.css';
import LidarLearningPanel from './LidarLearningPanel.jsx';
import TinFieldView from './TinFieldView.jsx';
import { tinProfileSegment } from '../../games/shared/lidar-physics.js';
import { generateSceneData, computeAdaptiveTINHistory, tinTerrainQuality } from './tin-model.js';

// Numerical generation and classification are shared with regression tests.

// ---------------------------------------------------------------------------
// Extract 3D Triangles & Materials from loaded Three.js GLTF Models
// ---------------------------------------------------------------------------
function extractModelTriangles(model) {
  const triangles = [];
  if (!model) return triangles;

  try {
    const cloned = model.clone(true);
    cloned.updateMatrixWorld(true);

    cloned.traverse((child) => {
      if (child.isMesh && child.geometry) {
        try {
          const geo = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry;
          const posAttr = geo && geo.attributes ? geo.attributes.position : null;
          if (!posAttr) return;

          let matColor = '#60a5fa';
          if (child.material) {
            const mat = Array.isArray(child.material) ? child.material[0] : child.material;
            if (mat && mat.color && typeof mat.color.getHexString === 'function') {
              matColor = '#' + mat.color.getHexString();
            }
          }

          const matrix = child.matrixWorld;

          for (let i = 0; i < posAttr.count; i += 3) {
            const vA = new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyMatrix4(matrix);
            const vB = new THREE.Vector3(posAttr.getX(i + 1), posAttr.getY(i + 1), posAttr.getZ(i + 1)).applyMatrix4(matrix);
            const vC = new THREE.Vector3(posAttr.getX(i + 2), posAttr.getY(i + 2), posAttr.getZ(i + 2)).applyMatrix4(matrix);

            if (Number.isFinite(vA.x) && Number.isFinite(vB.x) && Number.isFinite(vC.x)) {
              triangles.push({
                a: { x: vA.x, y: vA.z, z: vA.y },
                b: { x: vB.x, y: vB.z, z: vB.y },
                c: { x: vC.x, y: vC.z, z: vC.y },
                color: matColor,
              });
            }
          }
        } catch (e) {
          // ignore single mesh extraction issue
        }
      }
    });
  } catch (err) {
    console.warn('Model extraction error:', err);
  }

  return triangles;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function AdaptiveTIN() {
  const [preset, setPreset] = useState('hills');
  const [gridSize, setGridSize] = useState(25);
  const [maxAngle, setMaxAngle] = useState(12);
  const [maxDist, setMaxDist] = useState(1.2);
  const [density, setDensity] = useState(320);
  const [noiseSigma,setNoiseSigma]=useState(.06),[penetration,setPenetration]=useState(.3),[removeLow,setRemoveLow]=useState(true),[adaptive,setAdaptive]=useState(true),[maxEdge,setMaxEdge]=useState(55);

  const [currentStep, setCurrentStep] = useState(0);
  const [view3D, setView3D] = useState(true);
  const [yawAngle, setYawAngle] = useState(45); // horizontal orbit degrees
  const [pitchAngle, setPitchAngle] = useState(35); // vertical tilt degrees
  const [zoomScale, setZoomScale] = useState(1.0); // 3D camera zoom
  const [show3DObjects, setShow3DObjects] = useState(true); // render 3D trees & buildings
  const [loaded3DModels, setLoaded3DModels] = useState({ tree: null, building: null });

  // Pre-cache extracted 3D model triangles
  const cachedModelTriangles = useMemo(() => {
    return {
      tree: extractModelTriangles(loaded3DModels.tree),
      building: extractModelTriangles(loaded3DModels.building),
    };
  }, [loaded3DModels]);

  // Load actual 3D GLB Models (tree.glb & building.glb)
  useEffect(() => {
    const loader = new GLTFLoader();
    const baseUrl = import.meta.env.BASE_URL || '/';

    Promise.all([
      loader.loadAsync(`${baseUrl}models/tree.glb`).catch((err) => {
        console.warn('Failed to load tree.glb:', err);
        return null;
      }),
      loader.loadAsync(`${baseUrl}models/building.glb`).catch((err) => {
        console.warn('Failed to load building.glb:', err);
        return null;
      }),
    ]).then(([treeGltf, buildingGltf]) => {
      setLoaded3DModels({
        tree: treeGltf ? treeGltf.scene : null,
        building: buildingGltf ? buildingGltf.scene : null,
      });
    });
  }, []);

  // Bottom Cross-Section Profile Controls
  const [sliceY, setSliceY] = useState(50);
  const [sliceWidth, setSliceWidth] = useState(12); // ± Y tolerance range
  const [profileZoom, setProfileZoom] = useState(1.0); // Profile X-axis zoom scale
  const [profilePanX, setProfilePanX] = useState(50); // Profile center X position
  const [syncSliceWithHover, setSyncSliceWithHover] = useState(true);

  const [hoveredPointId, setHoveredPointId] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, yaw: 45, pitch: 35 });

  const mainCanvasRef = useRef(null);
  const profileCanvasRef = useRef(null);

  // Generate Point Cloud & 3D Structures
  const { points, physicalObjects } = useMemo(() => {
    return generateSceneData(preset, density,{noiseSigma,penetration});
  }, [preset, density,noiseSigma,penetration]);

  // Compute Adaptive TIN algorithm iterations history
  const history = useMemo(() => {
    return computeAdaptiveTINHistory(points, gridSize, maxAngle, maxDist,{removeLow,adaptive,maxEdge,noiseSigma});
  }, [points, gridSize, maxAngle, maxDist,removeLow,adaptive,maxEdge,noiseSigma]);
  useEffect(()=>{setCurrentStep(0);setIsPlaying(false);},[points,gridSize,maxAngle,maxDist,removeLow,adaptive,maxEdge]);

  useEffect(() => {
    let timer;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev < history.length - 1) return prev + 1;
          setIsPlaying(false);
          return prev;
        });
      }, 1200);
    }
    return () => clearInterval(timer);
  }, [isPlaying, history.length]);

  const currentSnapshot = history[currentStep] || history[0];
  const terrainQuality=useMemo(()=>currentSnapshot?tinTerrainQuality(points,currentSnapshot,preset,maxEdge):null,[points,currentSnapshot,preset,maxEdge]);
  const pointsById = useMemo(() => {
    const map = new Map();
    points.forEach((p) => map.set(p.id, p));
    return map;
  }, [points]);

  const groundCount = currentSnapshot ? currentSnapshot.groundSet.size : 0;
  const nonGroundCount = points.length - groundCount;
  const trueGroundCount = points.filter(p => p.isTrueGround).length;
  const correctGroundCount = points.filter(p => p.isTrueGround && currentSnapshot?.groundSet.has(p.id)).length;
  const groundPrecision = groundCount ? 100 * correctGroundCount / groundCount : 0;
  const groundRecall = trueGroundCount ? 100 * correctGroundCount / trueGroundCount : 0;

  const accuracy = useMemo(() => {
    if (!currentSnapshot) return 0;
    let correct = 0;
    points.forEach((p) => {
      const isGroundInSnapshot = currentSnapshot.groundSet.has(p.id);
      if (isGroundInSnapshot === p.isTrueGround) correct++;
    });
    return ((correct / points.length) * 100).toFixed(1);
  }, [currentSnapshot, points]);

  const hoveredPoint = hoveredPointId !== null ? pointsById.get(hoveredPointId) : null;
  const hoveredEvaluation = useMemo(() => {
    if (!currentSnapshot || hoveredPointId === null) return null;
    return currentSnapshot.candidateEvaluations.find((e) => e.id === hoveredPointId);
  }, [currentSnapshot, hoveredPointId]);

  // Auto-sync slice Y position when user hovers a point
  useEffect(() => {
    if (syncSliceWithHover && hoveredPoint) {
      setSliceY(Math.round(hoveredPoint.y));
    }
  }, [hoveredPoint, syncSliceWithHover]);

  // ---------------------------------------------------------------------------
  // Canvas 1: 3D / 2D Main Renderer
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !currentSnapshot) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#071019');
    bgGrad.addColorStop(1, '#0c1b2b');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 3D Isometric / Orbit Transformation Matrix
    const radYaw = (yawAngle * Math.PI) / 180;
    const radPitch = (pitchAngle * Math.PI) / 180;

    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);

    const project3D = (x, y, z) => {
      if (!view3D) {
        const margin = 40;
        const px = margin + (x / 100) * (width - 2 * margin);
        const py = margin + (y / 100) * (height - 2 * margin);
        return { px, py, depth: y };
      }

      const cx = 50, cy = 50, cz = 15;
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;

      // Rotate Yaw around Z
      const rx = dx * cosY - dy * sinY;
      const ry = dx * sinY + dy * cosY;

      // Pitch Tilt around X
      const rz = dz * cosP - ry * sinP;
      const rDepth = ry * cosP + dz * sinP;

      const scale = ((width - 140) / 140) * zoomScale;
      const px = width / 2 + rx * scale;
      const py = height / 2 + 40 - rz * scale * 1.3;

      return { px, py, depth: rDepth };
    };

    // Draw Cross-Section Slice Line Indicator on Terrain
    const pSlice0 = project3D(0, sliceY, 0);
    const pSlice1 = project3D(100, sliceY, 0);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(pSlice0.px, pSlice0.py);
    ctx.lineTo(pSlice1.px, pSlice1.py);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(`Cross-Section Slice Line (Y = ${sliceY}m)`, pSlice0.px + 6, pSlice0.py - 6);
    // Draw 3D Physical Structures (Loaded 3D Models / Volumetric Models)
    if (show3DObjects && view3D) {
      physicalObjects.forEach((obj) => {
        const rawTris = obj.type === 'building' ? cachedModelTriangles.building : cachedModelTriangles.tree;

        if (rawTris && rawTris.length > 0) {
          const pos = obj.type === 'building'
            ? { x: (obj.x0 + obj.x1) / 2, y: (obj.y0 + obj.y1) / 2, z: obj.baseZ }
            : { x: obj.cx, y: obj.cy, z: obj.baseZ };

          const scale = obj.type === 'building'
            ? { x: (obj.x1 - obj.x0) / 6, y: (obj.y1 - obj.y0) / 5, z: (obj.roofZ - obj.baseZ) / 5 }
            : { x: obj.r / 2.2, y: obj.r / 2.2, z: obj.height / 6.4 };

          const tris = rawTris.map((tri) => {
            const a = { x: pos.x + tri.a.x * scale.x, y: pos.y + tri.a.y * scale.y, z: pos.z + tri.a.z * scale.z };
            const b = { x: pos.x + tri.b.x * scale.x, y: pos.y + tri.b.y * scale.y, z: pos.z + tri.b.z * scale.z };
            const c = { x: pos.x + tri.c.x * scale.x, y: pos.y + tri.c.y * scale.y, z: pos.z + tri.c.z * scale.z };

            const projA = project3D(a.x, a.y, a.z);
            const projB = project3D(b.x, b.y, b.z);
            const projC = project3D(c.x, c.y, c.z);

            return {
              a, b, c,
              projA, projB, projC,
              color: tri.color,
              depth: (projA.depth + projB.depth + projC.depth) / 3,
            };
          });

          tris.sort((t1, t2) => t1.depth - t2.depth);

          tris.forEach(({ a, b, c, color, projA, projB, projC }) => {
            const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
            const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const len = Math.hypot(nx, ny, nz) || 1;
            nx /= len; ny /= len; nz /= len;

            const intensity = 0.5 + 0.5 * Math.max(0, nx * 0.3 + ny * 0.4 + nz * 0.86);

            ctx.fillStyle = color;
            ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
            ctx.lineWidth = 0.8;
            ctx.globalAlpha = Math.min(1.0, 0.85 * intensity + 0.15);

            ctx.beginPath();
            ctx.moveTo(projA.px, projA.py);
            ctx.lineTo(projB.px, projB.py);
            ctx.lineTo(projC.px, projC.py);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.globalAlpha = 1.0;
          });

          // Model label
          const labelZ = obj.type === 'building' ? obj.roofZ : obj.baseZ + obj.height;
          const labelCenter = project3D(pos.x, pos.y, labelZ);
          ctx.fillStyle = obj.type === 'building' ? '#60a5fa' : '#a7f3d0';
          ctx.font = '600 11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(obj.label, labelCenter.px, labelCenter.py - 8);

        } else if (obj.type === 'building') {
          // Draw 3D Building Box with Shaded Wall Facades & Roof Slab
          const p0 = project3D(obj.x0, obj.y0, obj.baseZ);
          const p1 = project3D(obj.x1, obj.y0, obj.baseZ);
          const p2 = project3D(obj.x1, obj.y1, obj.baseZ);
          const p3 = project3D(obj.x0, obj.y1, obj.baseZ);

          const r0 = project3D(obj.x0, obj.y0, obj.roofZ);
          const r1 = project3D(obj.x1, obj.y0, obj.roofZ);
          const r2 = project3D(obj.x1, obj.y1, obj.roofZ);
          const r3 = project3D(obj.x0, obj.y1, obj.roofZ);

          const drawWall = (a, b, c, d, fillCol, strokeCol) => {
            ctx.fillStyle = fillCol;
            ctx.strokeStyle = strokeCol;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(a.px, a.py);
            ctx.lineTo(b.px, b.py);
            ctx.lineTo(c.px, c.py);
            ctx.lineTo(d.px, d.py);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          };

          // Draw building walls with directional depth lighting
          drawWall(p0, p1, r1, r0, 'rgba(30, 58, 138, 0.55)', 'rgba(147, 197, 253, 0.6)');
          drawWall(p1, p2, r2, r1, 'rgba(15, 23, 42, 0.65)', 'rgba(96, 165, 250, 0.5)');
          drawWall(p2, p3, r3, r2, 'rgba(30, 41, 59, 0.55)', 'rgba(96, 165, 250, 0.5)');
          drawWall(p3, p0, r0, r3, 'rgba(30, 58, 138, 0.45)', 'rgba(147, 197, 253, 0.6)');

          // Roof Slab Top Plane
          ctx.fillStyle = 'rgba(37, 99, 235, 0.65)';
          ctx.strokeStyle = 'rgba(191, 219, 254, 0.9)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(r0.px, r0.py);
          ctx.lineTo(r1.px, r1.py);
          ctx.lineTo(r2.px, r2.py);
          ctx.lineTo(r3.px, r3.py);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Building label above roof
          const roofCenter = project3D((obj.x0 + obj.x1) / 2, (obj.y0 + obj.y1) / 2, obj.roofZ);
          ctx.fillStyle = '#60a5fa';
          ctx.font = '600 11px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(obj.label, roofCenter.px, roofCenter.py - 8);

        } else if (obj.type === 'tree') {
          // Draw 3D Volumetric Tree (Solid Wooden Trunk + Multi-Layer Canopy)
          const baseP = project3D(obj.cx, obj.cy, obj.baseZ);
          const topP = project3D(obj.cx, obj.cy, obj.baseZ + obj.height);
          const midP = project3D(obj.cx, obj.cy, obj.baseZ + obj.height * 0.55);

          // Rotation-invariant screen canopy radius
          const scale = view3D ? ((width - 140) / 140) * zoomScale : ((width - 80) / 100);
          const canopyRad = Math.max(8, obj.r * scale);

          // Solid Wooden Trunk Cylinder Stem
          ctx.strokeStyle = 'rgba(120, 53, 15, 0.9)';
          ctx.lineWidth = Math.max(3, 4.5 * (scale / 4));
          ctx.beginPath();
          ctx.moveTo(baseP.px, baseP.py);
          ctx.lineTo(topP.px, topP.py);
          ctx.stroke();

          // Layer 1: Base Dark Forest Shadow Layer
          ctx.fillStyle = 'rgba(6, 78, 59, 0.75)';
          ctx.strokeStyle = 'rgba(4, 120, 87, 0.8)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(midP.px, midP.py, canopyRad, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Layer 2: Mid Emerald Foliage Layer
          ctx.fillStyle = 'rgba(4, 120, 87, 0.85)';
          ctx.beginPath();
          ctx.arc(topP.px, topP.py + canopyRad * 0.25, canopyRad * 0.85, 0, Math.PI * 2);
          ctx.fill();

          // Layer 3: Top Crown Highlight
          ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
          ctx.strokeStyle = 'rgba(167, 243, 208, 0.8)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(topP.px - canopyRad * 0.15, topP.py - canopyRad * 0.15, canopyRad * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // Draw Delaunay Triangles of current TIN
    ctx.lineWidth = 1.2;
    currentSnapshot.triangles.forEach(([idA, idB, idC]) => {
      const pA = pointsById.get(idA);
      const pB = pointsById.get(idB);
      const pC = pointsById.get(idC);
      if (!pA || !pB || !pC) return;

      const projA = project3D(pA.x, pA.y, pA.z);
      const projB = project3D(pB.x, pB.y, pB.z);
      const projC = project3D(pC.x, pC.y, pC.z);

      const avgZ = (pA.z + pB.z + pC.z) / 3;
      const alpha = 0.16 + Math.min(0.2, avgZ / 120);
      ctx.fillStyle = `rgba(180, 100, 30, ${alpha})`;

      ctx.beginPath();
      ctx.moveTo(projA.px, projA.py);
      ctx.lineTo(projB.px, projB.py);
      ctx.lineTo(projC.px, projC.py);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(217, 119, 6, 0.75)';
      ctx.stroke();
    });

    // Sort points by depth for proper rendering order
    const sortedPoints = [...points].map((p) => {
      const proj = project3D(p.x, p.y, p.z);
      return { p, proj, depth: proj.depth };
    });

    if (view3D) {
      sortedPoints.sort((a, b) => a.depth - b.depth);
    }

    // Draw Points (Smaller, Finer Point Cloud Dots)
    sortedPoints.forEach(({ p, proj }) => {
      const isGround = currentSnapshot.groundSet.has(p.id);
      const isSeed = currentSnapshot.seedSet.has(p.id);
      const isNewlyAdded = currentSnapshot.newlyAdded.includes(p.id);
      const isHovered = p.id === hoveredPointId;

      let radius = 2.0;
      let fillColor = '#94a3b8'; // Default Grey for all non-ground / unclassified points

      if (isSeed) {
        fillColor = '#f59e0b'; // Gold for Seed
        radius = 3.6;
      } else if (isGround) {
        fillColor = '#c48b49'; // Light Brown when marked as Ground
        radius = 2.6;
      } else {
        fillColor = '#94a3b8'; // Default Grey
        radius = 2.0;
      }
      if(currentSnapshot.excludedSet.has(p.id))fillColor='#ff737a';

      if (view3D && !isGround) {
        const groundProj = project3D(p.x, p.y, p.trueZ || 0);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(proj.px, proj.py);
        ctx.lineTo(groundProj.px, groundProj.py);
        ctx.stroke();
      }

      if (isNewlyAdded) {
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(proj.px, proj.py, radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = fillColor;
      ctx.beginPath();
      ctx.arc(proj.px, proj.py, radius, 0, Math.PI * 2);
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(proj.px, proj.py, radius + 6, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = '600 11px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`P#${p.id} (${p.z.toFixed(1)}m)`, proj.px, proj.py - 12);
      }
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(
      `Step ${currentStep} / ${history.length - 1}: ${
        currentStep === 0 ? 'Initial Grid Seeds' : `Densification Iteration ${currentStep}`
      }`,
      16,
      24
    );
  }, [
    currentSnapshot,
    points,
    view3D,
    yawAngle,
    pitchAngle,
    zoomScale,
    show3DObjects,
    physicalObjects,
    hoveredPointId,
    currentStep,
    history.length,
    pointsById,
    sliceY,
    cachedModelTriangles,
  ]);

  // ---------------------------------------------------------------------------
  // Canvas 2: Zoomable Cross-Section Elevation Profile (XZ Slice)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = profileCanvasRef.current;
    if (!canvas || !currentSnapshot) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1622';
    ctx.fillRect(0, 0, width, height);

    const margin = 45;
    const pW = width - 2 * margin;
    const pH = height - 2 * margin;

    // Filter points in current Y slice window
    const slicePoints = points.filter((p) => Math.abs(p.y - sliceY) <= sliceWidth);

    // Zoom & Pan transformation calculations for X-axis
    const visibleWidthX = 100 / profileZoom;
    const minX = Math.max(0, Math.min(100 - visibleWidthX, profilePanX - visibleWidthX / 2));
    const maxX = minX + visibleWidthX;

    const minZ = 0;
    const maxZ = 40;

    const toX = (x) => margin + ((x - minX) / (maxX - minX)) * pW;
    const toY = (z) => height - margin - ((z - minZ) / (maxZ - minZ)) * pH;

    // Draw Background Grid Lines & Scale Ticks
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(margin, height - margin);
    ctx.lineTo(width - margin, height - margin);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'center';

    const tickStep = profileZoom > 2 ? 5 : 10;
    for (let x = 0; x <= 100; x += tickStep) {
      if (x >= minX && x <= maxX) {
        const px = toX(x);
        ctx.beginPath();
        ctx.moveTo(px, height - margin);
        ctx.lineTo(px, height - margin + 4);
        ctx.stroke();
        ctx.fillText(`${x}m`, px, height - margin + 14);
      }
    }

    ctx.textAlign = 'right';
    for (let z = 0; z <= 40; z += 10) {
      const py = toY(z);
      ctx.beginPath();
      ctx.moveTo(margin - 4, py);
      ctx.lineTo(width - margin, py);
      ctx.stroke();
      ctx.fillText(`${z}m`, margin - 6, py + 3);
    }

    // Render 3D Objects Cross-Section Outlines in Profile (Buildings & Trees)
    physicalObjects.forEach((obj) => {
      if (obj.type === 'building' && sliceY >= obj.y0 && sliceY <= obj.y1) {
        const x0 = toX(obj.x0);
        const x1 = toX(obj.x1);
        const yBase = toY(obj.baseZ);
        const yRoof = toY(obj.roofZ);

        ctx.fillStyle = 'rgba(96, 165, 250, 0.15)';
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.fillRect(x0, yRoof, x1 - x0, yBase - yRoof);
        ctx.strokeRect(x0, yRoof, x1 - x0, yBase - yRoof);

        ctx.fillStyle = '#93c5fd';
        ctx.font = '600 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(obj.label, (x0 + x1) / 2, yRoof - 6);
      } else if (obj.type === 'tree' && Math.hypot(sliceY - obj.cy) < obj.r) {
        const cx = toX(obj.cx);
        const yBase = toY(obj.baseZ);
        const yTop = toY(obj.baseZ + obj.height);
        const rPx = (obj.r / (maxX - minX)) * pW;

        ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.6)';
        ctx.lineWidth = 1.5;

        // Tree canopy dome
        ctx.beginPath();
        ctx.arc(cx, yTop + rPx * 0.4, rPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Trunk
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, yBase);
        ctx.lineTo(cx, yTop);
        ctx.stroke();
      }
    });

    // Draw actual facet intersections, not a polyline joining nearby samples.
    const slicePointMap = new Map(points.map(p => [p.id, p]));
    const segments = currentSnapshot.triangles.map(ids => tinProfileSegment(ids.map(id => slicePointMap.get(id)), sliceY, maxDist)).filter(Boolean);
    for (const segment of segments) {
      ctx.strokeStyle = '#c48b49';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(toX(segment.start.x), toY(segment.start.z));
      ctx.lineTo(toX(segment.end.x), toY(segment.end.z));
      ctx.stroke();

      ctx.strokeStyle = 'rgba(217, 119, 6, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(toX(segment.start.x), toY(segment.start.z + sign * segment.verticalTolerance));
        ctx.lineTo(toX(segment.end.x), toY(segment.end.z + sign * segment.verticalTolerance));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Draw Points in Slice Window (Smaller Finer Dots)
    slicePoints.forEach((p) => {
      if (p.x < minX || p.x > maxX) return;
      const px = toX(p.x);
      const py = toY(p.z);
      const isGround = currentSnapshot.groundSet.has(p.id);
      const isSeed = currentSnapshot.seedSet.has(p.id);
      const isHovered = p.id === hoveredPointId;

      ctx.fillStyle = currentSnapshot.excludedSet.has(p.id)?'#ff737a':isSeed ? '#f59e0b' : isGround ? '#c48b49' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(px, py, isHovered ? 5 : 2.4, 0, Math.PI * 2);
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        const evaluation = currentSnapshot.candidateEvaluations.find(entry => entry.id === p.id);
        if (evaluation) {
          ctx.fillStyle = '#38bdf8';
          ctx.font = '600 11px system-ui';
          ctx.textAlign = 'left';
          ctx.fillText(`previous-facet test: d⊥ = ${evaluation.d} m`, px + 8, py - 12);
        }
      }
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(
      `Cross-Section Slice (Y = ${sliceY}m ± ${sliceWidth}m) — Zoom: ${profileZoom.toFixed(1)}x`,
      margin + 10,
      20
    );
  }, [
    currentSnapshot,
    points,
    physicalObjects,
    hoveredPoint,
    hoveredPointId,
    maxDist,
    sliceY,
    sliceWidth,
    profileZoom,
    profilePanX,
  ]);

  // Mouse Drag Orbiting Handlers for 3D View Canvas
  const handleMouseDown = (e) => {
    if (!view3D) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      yaw: yawAngle,
      pitch: pitchAngle,
    };
  };

  const handleMouseMove = (e) => {
    if (isDragging && view3D) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;

      let newYaw = (dragStartRef.current.yaw + dx * 0.5) % 360;
      if (newYaw < 0) newYaw += 360;

      let newPitch = Math.max(10, Math.min(85, dragStartRef.current.pitch + dy * 0.4));

      setYawAngle(Math.round(newYaw));
      setPitchAngle(Math.round(newPitch));
      return;
    }

    // Hover inspection
    const canvas = mainCanvasRef.current;
    if (!canvas || !currentSnapshot) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    const radYaw = (yawAngle * Math.PI) / 180;
    const radPitch = (pitchAngle * Math.PI) / 180;
    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);

    let closestId = null;
    let minDistSq = 18 * 18;

    points.forEach((p) => {
      let px, py;
      if (!view3D) {
        const margin = 40;
        px = margin + (p.x / 100) * (canvas.width - 2 * margin);
        py = margin + (p.y / 100) * (canvas.height - 2 * margin);
      } else {
        const dx = p.x - 50;
        const dy = p.y - 50;
        const dz = p.z - 15;
        const rx = dx * cosY - dy * sinY;
        const ry = dx * sinY + dy * cosY;
        const rz = dz * cosP - ry * sinP;
        const scale = ((canvas.width - 140) / 140) * zoomScale;
        px = canvas.width / 2 + rx * scale;
        py = canvas.height / 2 + 40 - rz * scale * 1.3;
      }

      const d2 = (mx - px) ** 2 + (my - py) ** 2;
      if (d2 < minDistSq) {
        minDistSq = d2;
        closestId = p.id;
      }
    });

    setHoveredPointId(closestId);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="sim-app">
      <header className="sim-topbar">
        <a className="back-link" href={import.meta.env.BASE_URL}>
          &larr; All simulators
        </a>
        <div className="title-block">
          <h1>
            Adaptive TIN Ground Classification <span className="native-badge">Progressive TIN teaching model</span>
          </h1>
          <span className="sub">
            Iterative triangulated irregular network densification for LiDAR point cloud ground filtering
          </span>
        </div>
        <span className="score-chip">
          Accuracy: <b>{accuracy}%</b>
        </span>
      </header>

      <LidarLearningPanel topic="tin"
        workedExample={`Step ${currentStep}: ${groundCount} points in the ground hypothesis; ${correctGroundCount} are true ground in this synthetic scene. Ground precision = ${groundPrecision.toFixed(1)}%; recall = ${groundRecall.toFixed(1)}%. Acceptance requires perpendicular distance ≤ ${maxDist} m AND facet-relative angle ≤ ${maxAngle}°. Truth labels evaluate the result; they do not decide acceptance.`}
        onExperiment={(id) => { setCurrentStep(0); setIsPlaying(false); setPreset(id === 'steep' ? 'steep' : 'hills'); setGridSize(25); setMaxAngle(id === 'strict' ? 4 : id === 'relaxed' ? 20 : 12); setMaxDist(id === 'strict' ? 0.3 : id === 'relaxed' ? 2.5 : 1.2); }} />

      {/* Preset Terrain Selector */}
      <div style={{ maxWidth: 1520, margin: '14px auto 0' }}>
        <div className="scenario-select" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <button
            className={`scenario-card ${preset === 'hills' ? 'active' : ''}`}
            onClick={() => {
              setPreset('hills');
              setCurrentStep(0);
            }}
          >
            <strong>Rolling terrain &amp; trees</strong>
            <span>Undulating ground with vegetation clusters and a building</span>
          </button>
          <button
            className={`scenario-card ${preset === 'steep' ? 'active' : ''}`}
            onClick={() => {
              setPreset('steep');
              setCurrentStep(0);
            }}
          >
            <strong>🧗 Steep Ridge & Slope</strong>
            <span>High elevation gradient testing maximum angle threshold behavior</span>
          </button>
          <button
            className={`scenario-card ${preset === 'urban' ? 'active' : ''}`}
            onClick={() => {
              setPreset('urban');
              setCurrentStep(0);
            }}
          >
            <strong>Urban block</strong>
            <span>Near-flat terrain with multi-storey buildings and trees</span>
          </button>
          <button
            className={`scenario-card ${preset === 'noise' ? 'active' : ''}`}
            onClick={() => {
              setPreset('noise');
              setCurrentStep(0);
            }}
          >
            <strong>📡 Low Noise Outliers</strong>
            <span>Tests algorithm vulnerability to multipath noise below ground</span>
          </button>
        </div>
      </div>

      <div className="sim-layout">
        {/* Left Column: Canvas Views & Controls */}
        <div className="sim-col">
          <section className="sim-panel">
            <h2>
              <span className="stepno">1</span> 3D Point Cloud &amp; Terrain Surface
              <small style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  className="tin-btn secondary"
                  style={{ padding: '3px 9px', fontSize: 11 }}
                  onClick={() => setShow3DObjects(!show3DObjects)}
                >
                  {show3DObjects ? 'Hide site objects' : 'Show site objects'}
                </button>
                <button
                  className="tin-btn secondary"
                  style={{ padding: '3px 9px', fontSize: 11 }}
                  onClick={() => setView3D(!view3D)}
                >
                  {view3D ? 'Switch to 2D Plan' : 'Switch to 3D View'}
                </button>
              </small>
            </h2>

            {view3D ? <TinFieldView points={points} physicalObjects={physicalObjects} preset={preset} snapshot={currentSnapshot} selectedId={hoveredPointId} onSelect={setHoveredPointId} showObjects={show3DObjects} maxEdge={maxEdge}/> : <canvas id="tin-plan" aria-label="Plan analysis of measured returns and the current ground triangulation"
              ref={mainCanvasRef}
              className="tin-canvas"
              width={700}
              height={420}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => {
                setIsDragging(false);
                setHoveredPointId(null);
              }}
              style={{ cursor: isDragging ? 'grabbing' : view3D ? 'grab' : 'crosshair' }}
            />}

            {/* View Rotation Control & Toolbar */}
            <div className="tin-toolbar">
              <button
                className="tin-btn"
                disabled={currentStep === 0}
                onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
              >
                ⏮ Prev Step
              </button>
              <button
                className="tin-btn"
                disabled={currentStep >= history.length - 1}
                onClick={() => setCurrentStep((prev) => Math.min(history.length - 1, prev + 1))}
              >
                Next Step ⏭
              </button>
              <button
                className={`tin-btn ${isPlaying ? 'accent' : 'secondary'}`}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? '⏸ Pause' : '▶ Auto Play Iterations'}
              </button>
              <button
                className="tin-btn secondary"
                onClick={() => {
                  setCurrentStep(0);
                  setIsPlaying(false);
                }}
              >
                🔄 Reset to Seed
              </button>
              <button id="tin-final" className="tin-btn secondary" onClick={() => { setIsPlaying(false); setCurrentStep(history.length - 1); }}>Inspect final classification</button>
            </div>

            {/* Iteration Progress Bar & Accuracy Metric */}
            <div className="tin-step-progress">
              <span>
                Iteration {currentStep} / {history.length - 1}
              </span>
              <div className="tin-step-bar">
                <div
                  className="tin-step-fill"
                  style={{ width: `${(currentStep / Math.max(1, history.length - 1)) * 100}%` }}
                />
              </div>
              <span style={{ fontWeight: 600, color: currentSnapshot && currentSnapshot.accuracy >= 80 ? '#10b981' : '#f59e0b' }}>
                🎯 Accuracy: {currentSnapshot ? currentSnapshot.accuracy : 0}%
              </span>
              <span>{currentStep === history.length - 1 ? currentSnapshot?.stopReason === 'converged' ? 'No further supported candidates' : 'Display iteration limit reached' : 'In Progress'}</span>
            </div>

            {/* Legend */}
            <div className="rng-legend" style={{ marginTop: 10 }}>
              <span>
                <i className="rng-swatch" style={{ background: '#94a3b8' }} /> Default Point / Non-Ground (Grey)
              </span>
              <span>
                <i className="rng-swatch" style={{ background: '#f59e0b' }} /> Initial Seed (Gold)
              </span>
              <span>
                <i className="rng-swatch" style={{ background: '#c48b49' }} /> Marked as Ground (Light Brown)
              </span>
              <span>
                <i className="rng-swatch" style={{ background: '#34d399' }} /> Newly Added in Step
              </span>
              <span><i className="rng-swatch" style={{background:'#ff737a'}}/>Screened low return</span>
            </div>
          </section>

          {/* Section 2: Interactive Zoomable Cross-Section Elevation Profile */}
          <section className="sim-panel">
            <h2>
              <span className="stepno">2</span> Cross-Section Profile (XZ Slice) &amp; Zoom Controls
            </h2>

            <canvas ref={profileCanvasRef} className="tin-canvas" width={700} height={200} />
            <div className="rng-note">Brown segments intersect the <b>actual TIN facets</b> at Y = {sliceY} m. Dashed lines show ±{maxDist} m perpendicular facet distance, projected into this profile. Dots come from a ±{sliceWidth} m-wide strip and are projected onto XZ; each insertion test uses the point&rsquo;s own XY. Horizontal and vertical plot scales differ.</div>

            {/* Interactive Slice Controls & Zoom Sliders */}
            <div className="tin-profile-controls">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#475569' }}>
                Slice Y Position: <b>Y = {sliceY}m</b>
                <input
                  type="range"
                  min="5"
                  max="95"
                  value={sliceY}
                  onChange={(e) => {
                    setSliceY(Number(e.target.value));
                    setSyncSliceWithHover(false);
                  }}
                  style={{ accentColor: '#0f8a4d' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#475569' }}>
                Profile Zoom Level: <b>{profileZoom.toFixed(1)}x</b>
                <input
                  type="range"
                  min="1.0"
                  max="4.0"
                  step="0.2"
                  value={profileZoom}
                  onChange={(e) => setProfileZoom(Number(e.target.value))}
                  style={{ accentColor: '#0f8a4d' }}
                />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, color: '#475569' }}>
                Profile Pan X: <b>X = {profilePanX}m</b>
                <input
                  type="range"
                  min="10"
                  max="90"
                  disabled={profileZoom <= 1.05}
                  value={profilePanX}
                  onChange={(e) => setProfilePanX(Number(e.target.value))}
                  style={{ accentColor: '#0f8a4d' }}
                />
              </label>
            </div>

            <div className="tin-profile-toolbar">
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={syncSliceWithHover}
                  onChange={(e) => setSyncSliceWithHover(e.target.checked)}
                  style={{ accentColor: '#0f8a4d' }}
                />
                Auto-sync slice Y with hovered point
              </label>

              <span style={{ marginLeft: 'auto' }}>
                Slice Tolerance Width: <b>±{sliceWidth}m</b>
              </span>
              <input
                type="range"
                min="4"
                max="25"
                value={sliceWidth}
                onChange={(e) => setSliceWidth(Number(e.target.value))}
                style={{ width: 80, accentColor: '#0f8a4d' }}
              />
            </div>

            <div className="rng-legend" style={{ marginTop: 8 }}>
              <span>
                <i className="rng-swatch" style={{ background: '#94a3b8' }} /> Default / Non-Ground (Grey)
              </span>
              <span>
                <i className="rng-swatch" style={{ background: '#f59e0b' }} /> Seed (Gold)
              </span>
              <span>
                <i className="rng-swatch" style={{ background: '#c48b49' }} /> Marked as Ground (Light Brown)
              </span>
            </div>
          </section>
        </div>

        {/* Right Column: Controls & Algorithm Parameters */}
        <div className="sim-col">
          <section className="sim-panel">
            <h2>
              <span className="stepno">3</span> Algorithm Parameters
            </h2>

            <div className="control-grid" style={{ gridTemplateColumns: '1fr' }}>
              <label>
                Grid Seed Cell Width: <b>{gridSize} m</b>
                <input
                  id="tin-grid"
                  type="range"
                  min="10"
                  max="40"
                  step="5"
                  value={gridSize}
                  onChange={(e) => {
                    setGridSize(Number(e.target.value));
                    setCurrentStep(0);
                  }}
                />
              </label>

              <label>
                Max Angle Threshold (θ<sub>max</sub>): <b>{maxAngle}°</b>
                <input
                  id="tin-angle"
                  type="range"
                  min="2"
                  max="25"
                  step="1"
                  value={maxAngle}
                  onChange={(e) => {
                    setMaxAngle(Number(e.target.value));
                    setCurrentStep(0);
                  }}
                />
              </label>

              <label>
                Max Distance Threshold (d<sub>max</sub>): <b>{maxDist.toFixed(1)} m</b>
                <input
                  id="tin-distance"
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={maxDist}
                  onChange={(e) => {
                    setMaxDist(Number(e.target.value));
                    setCurrentStep(0);
                  }}
                />
              </label>

              <label>
                Raster acquisition density: <b>{density} nominal footprints</b>
                <input
                  id="tin-density"
                  type="range"
                  min="150"
                  max="600"
                  step="25"
                  value={density}
                  onChange={(e) => {
                    setDensity(Number(e.target.value));
                    setCurrentStep(0);
                  }}
                />
              </label>
            </div>

            <div className="control-grid" style={{gridTemplateColumns:'1fr'}}>
              <label>Elevation measurement σ <b>{noiseSigma.toFixed(2)} m</b><input id="tin-noise" type="range" min="0" max=".25" step=".01" value={noiseSigma} onChange={e=>setNoiseSigma(+e.target.value)}/></label>
              <label>Canopy penetration probability <b>{Math.round(penetration*100)}%</b><input id="tin-penetration" type="range" min="0" max="1" step=".05" value={penetration} onChange={e=>setPenetration(+e.target.value)}/></label>
              <label>Maximum supported facet edge <b>{maxEdge} m</b><input id="tin-edge" type="range" min="25" max="90" step="5" value={maxEdge} onChange={e=>setMaxEdge(+e.target.value)}/></label>
              <label><input id="tin-remove-low" type="checkbox" checked={removeLow} onChange={e=>setRemoveLow(e.target.checked)}/>Screen isolated low outliers before seeding</label>
              <label><input id="tin-adaptive" type="checkbox" checked={adaptive} onChange={e=>setAdaptive(e.target.checked)}/>Tighten distance bound as facets become smaller</label>
            </div>
            <div className="rng-note">Synthetic jittered scan footprints can produce foliage and penetrated ground returns. Last return is <b>not</b> a ground label. The geometry-only low screen fits up to ten neighbours within 22 m; a 2.5 m / local-residual bound can also reject a real sharp depression. No truth label controls filtering. No forced corner anchors are added. Adaptive d = min(dmax, max(3σ, 0.15 + 0.02 × shortest facet edge)). Long facets remain unsupported.</div>
            <div className="readouts" style={{gridTemplateColumns:'1fr 1fr'}}>
              <div><span>Low returns screened</span><b id="tin-screened">{currentSnapshot?.excludedSet.size??0}</b></div>
              <div><span>DTM test-grid coverage</span><b id="tin-coverage">{((terrainQuality?.coverage??0)*100).toFixed(1)}%</b></div>
              <div><span>Independent-grid height RMSE</span><b id="tin-dtm-rmse">{terrainQuality?.rmse===null?'no support':terrainQuality?.rmse.toFixed(3)+' m'}</b></div>
              <div><span>Independent-grid height bias</span><b>{terrainQuality?.bias===null?'no support':terrainQuality?.bias.toFixed(3)+' m'}</b></div>
            </div>
            <div className="rng-note">DTM validation interpolates supported facets at a separate 10 m grid and compares to the analytic terrain, including gaps beneath objects. It never feeds back into classification. Coverage and height error must be read together; no support means no terrain estimate. Sparse sampling and contaminated seeds can still fail on buildings, slopes and negative noise.</div>

            {/* Readout Statistics */}
            <div className="readouts" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginTop: 14 }}>
              <div>
                <span>Total Points</span>
                <b>{points.length}</b>
              </div>
              <div>
                <span>Ground Points</span>
                <b style={{ color: '#10b981' }}>{groundCount}</b>
              </div>
              <div>
                <span>Not yet ground</span>
                <b style={{ color: '#94a3b8' }}>{nonGroundCount}</b>
              </div>
              <div>
                <span>Accuracy Rate</span>
                <b style={{ color: currentSnapshot && currentSnapshot.accuracy >= 80 ? '#10b981' : '#f59e0b' }}>
                  {currentSnapshot ? currentSnapshot.accuracy : 0}%
                </b>
              </div>
              <div>
                <span>TIN Triangles</span>
                <b>{currentSnapshot ? currentSnapshot.triangles.length : 0}</b>
              </div>
            </div>
            <div className="readouts" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div><span>Ground precision: TP / (TP + FP)</span><b>{groundPrecision.toFixed(1)}%</b></div>
              <div><span>Ground recall: TP / (TP + FN)</span><b>{groundRecall.toFixed(1)}%</b></div>
            </div>
            <div className="rng-note">These scores use the scene&rsquo;s <b>synthetic reference labels</b>. A point not yet accepted as ground is still a candidate, not a proven object. Overall accuracy alone can hide ground omission when most points are non-ground.</div>
          </section>

          {/* Interactive Candidate Point Inspector */}
          <section className="sim-panel">
            <h2>
              <span className="stepno">4</span> Candidate Point Inspector
            </h2>
            <label className="tin-point-selector">Inspect a point (keyboard or touch)
              <select id="tin-point" value={hoveredPointId ?? ''} onChange={event => setHoveredPointId(event.target.value === '' ? null : Number(event.target.value))}>
                <option value="">Choose a point…</option>
                {points.map(point => <option key={point.id} value={point.id}>#{point.id} · X {point.x.toFixed(1)}, Y {point.y.toFixed(1)}, Z {point.z.toFixed(1)} m</option>)}
              </select>
            </label>
            {hoveredPoint ? (
              <div className="tin-inspector">
                <div className="tin-inspector-title">
                  <span>
                    Point ID #{hoveredPoint.id} — {hoveredPoint.objectType}
                  </span>
                  <span
                    className={`tin-badge ${
                      currentSnapshot.groundSet.has(hoveredPoint.id) ? 'ground' : 'nonground'
                    }`}
                  >
                    {currentSnapshot.groundSet.has(hoveredPoint.id) ? 'GROUND HYPOTHESIS' : 'NOT ACCEPTED'}
                  </span>
                </div>
                <div>
                  Coordinates: X={hoveredPoint.x}m, Y={hoveredPoint.y}m, Z={hoveredPoint.z}m
                </div>
                <div>Pulse {hoveredPoint.pulseId} · return {hoveredPoint.returnNumber}/{hoveredPoint.numberOfReturns}{currentSnapshot.excludedSet.has(hoveredPoint.id)?' · screened low point':''}</div>

                {hoveredEvaluation ? (
                  <div className="tin-check-list">
                    <div className={`tin-check-item ${hoveredEvaluation.passesDist ? 'pass' : 'fail'}`}>
                      Perpendicular d: {hoveredEvaluation.d}m (Local bound: {hoveredEvaluation.distanceLimit?.toFixed(2)??maxDist}m) {hoveredEvaluation.passesDist ? '✓' : '✗'}
                    </div>
                    <div className={`tin-check-item ${hoveredEvaluation.passesAngle ? 'pass' : 'fail'}`}>
                      Angle θ: {hoveredEvaluation.angle}° (Max: {maxAngle}°) {hoveredEvaluation.passesAngle ? '✓' : '✗'}
                    </div>
                  </div>
                ) : currentSnapshot.seedSet.has(hoveredPoint.id) ? (
                  <div className="rng-note" style={{ marginTop: 6, padding: '4px 8px' }}>
                    <b>Initial Seed Point:</b> An eligible local cell minimum; selection is a ground hypothesis, not a guarantee. No truth or artificial boundary anchor is supplied.
                  </div>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                    No candidate test is stored in this snapshot. The point may be an earlier insertion or outside the supported TIN hull.
                  </div>
                )}
              </div>
            ) : (
              <div className="rng-note">
                💡 <b>Hover over any point in the canvas</b> to inspect its calculated distance <i>d</i> to the TIN facet, maximum vertex angle <i>θ</i>, and threshold pass/fail evaluation!
              </div>
            )}
          </section>

          {/* Mathematical & Theoretical Explanation */}
          <section className="sim-panel">
            <h2>
              <span className="stepno">5</span> How Adaptive TIN Ground Filtering Works
            </h2>
            <div className="rng-note">
              <b>Progressive TIN densification, inspired by Axelsson (2000):</b>
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>
                  <b>Grid Partitioning &amp; Seeds:</b> Divide the point cloud into grid cells larger than the largest building. The lowest point in each cell forms the initial ground seed set <i>G<sub>0</sub></i>.
                </li>
                <li>
                  <b>Initial Delaunay TIN:</b> Construct a 2D Delaunay triangulation connecting all ground seed points.
                </li>
                <li>
                  <b>Iterative Densification:</b> For each unclassified point <i>P</i>:
                  <ul style={{ margin: '3px 0', paddingLeft: 16 }}>
                    <li>Find the enclosing triangle <i>T</i>.</li>
                    <li>Calculate perpendicular distance <i>d</i> to the plane of <i>T</i>.</li>
                    <li>Calculate the largest angle between a vertex-to-point segment and that facet plane, not the horizontal datum.</li>
                  </ul>
                </li>
                <li>
                  <b>Threshold Criteria:</b> If <i>d &le; d<sub>max</sub></i> AND <i>θ &le; θ<sub>max</sub></i>, <i>P</i> is classified as ground and inserted into the TIN.
                </li>
                <li>
                  <b>Convergence:</b> Re-triangulate and repeat until no new points meet the criteria.
                </li>
              </ol>
            </div>

            <div className="equation big" style={{ marginTop: 10 }}>
              d = |n̂ · (P − A)| &le; {maxDist} m; n̂ is the unit normal of facet ABC.
            </div>
            <div className="equation big">
              θ = max<sub>V ∈ {'{A,B,C}'}</sub> asin(d / ‖P − V‖) &le; {maxAngle}°. A point on the facet has d = 0 and θ = 0, even on a steep slope.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
