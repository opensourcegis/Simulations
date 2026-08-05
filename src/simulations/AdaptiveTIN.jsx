import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import './simulation.css';
import './native.css';
import './tin.css';

// ---------------------------------------------------------------------------
// 2D Delaunay Triangulation (Bowyer-Watson Algorithm)
// ---------------------------------------------------------------------------
function circumcircle(p1, p2, p3) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const ex = p3.x - p1.x;
  const ey = p3.y - p1.y;

  const bl = dx * dx + dy * dy;
  const cl = ex * ex + ey * ey;
  const d = 2 * (dx * ey - dy * ex);

  if (Math.abs(d) < 1e-9) return null;

  const x = (ey * bl - dy * cl) / d;
  const y = (dx * cl - ex * bl) / d;

  const r2 = x * x + y * y;
  return { x: p1.x + x, y: p1.y + y, r: Math.sqrt(r2), r2 };
}

function delaunay2D(points) {
  if (points.length < 3) return [];

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  const dx = (maxX - minX) * 10 || 1000;
  const dy = (maxY - minY) * 10 || 1000;

  const stP0 = { x: minX - dx, y: minY - dy * 3 };
  const stP1 = { x: minX - dx, y: maxY + dy * 3 };
  const stP2 = { x: maxX + dx * 3, y: minY - dy };

  const allPts = [...points, stP0, stP1, stP2];
  const n = points.length;
  const stIndices = [n, n + 1, n + 2];

  let triangles = [
    {
      a: stIndices[0],
      b: stIndices[1],
      c: stIndices[2],
      cc: circumcircle(allPts[stIndices[0]], allPts[stIndices[1]], allPts[stIndices[2]]),
    },
  ];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const badTriangles = [];

    for (let j = 0; j < triangles.length; j++) {
      const tri = triangles[j];
      if (!tri.cc) continue;
      const distSq = (p.x - tri.cc.x) ** 2 + (p.y - tri.cc.y) ** 2;
      if (distSq <= tri.cc.r2) {
        badTriangles.push(tri);
      }
    }

    const edges = [];
    badTriangles.forEach((tri) => {
      edges.push({ a: tri.a, b: tri.b });
      edges.push({ a: tri.b, b: tri.c });
      edges.push({ a: tri.c, b: tri.a });
    });

    const polygonEdges = [];
    for (let e1 = 0; e1 < edges.length; e1++) {
      let isShared = false;
      for (let e2 = 0; e2 < edges.length; e2++) {
        if (e1 !== e2) {
          if (
            (edges[e1].a === edges[e2].a && edges[e1].b === edges[e2].b) ||
            (edges[e1].a === edges[e2].b && edges[e1].b === edges[e2].a)
          ) {
            isShared = true;
            break;
          }
        }
      }
      if (!isShared) polygonEdges.push(edges[e1]);
    }

    triangles = triangles.filter((t) => !badTriangles.includes(t));

    polygonEdges.forEach((edge) => {
      const cc = circumcircle(allPts[edge.a], allPts[edge.b], p);
      triangles.push({ a: edge.a, b: edge.b, c: i, cc });
    });
  }

  return triangles
    .filter((tri) => tri.a < n && tri.b < n && tri.c < n)
    .map((tri) => [tri.a, tri.b, tri.c]);
}

function pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax, v0y = cy - ay;
  const v1x = bx - ax, v1y = by - ay;
  const v2x = px - ax, v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01 + 1e-12);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return u >= -0.01 && v >= -0.01 && u + v <= 1.01;
}

// ---------------------------------------------------------------------------
// Point Cloud & Physical 3D Structure Generation
// ---------------------------------------------------------------------------
function generateSceneData(preset, density = 180) {
  const points = [];
  const physicalObjects = [];
  let idCounter = 0;

  const terrainFunc = (x, y) => {
    if (preset === 'hills' || preset === 'noise') {
      // Realistic gentle rolling terrain (close to flat with subtle 1-2m undulations)
      return 5 + 1.2 * Math.sin(x / 22) * Math.cos(y / 26) + 0.8 * Math.sin((x + y) / 36);
    }
    if (preset === 'steep') {
      const s = 1 / (1 + Math.exp(-(x - 50) / 6));
      return 5 + s * 14 + 1.5 * Math.cos(y / 16);
    }
    if (preset === 'urban') {
      return 4 + 0.5 * Math.sin(x / 35) + 0.4 * Math.cos(y / 35);
    }
    return 5;
  };

  // Define 3D Physical Structures (Buildings & Trees)
  if (preset === 'hills' || preset === 'noise') {
    physicalObjects.push(
      { type: 'tree', cx: 35, cy: 40, r: 11, baseZ: terrainFunc(35, 40), height: 13, label: 'Pine Tree Cluster' },
      { type: 'tree', cx: 75, cy: 70, r: 9, baseZ: terrainFunc(75, 70), height: 11, label: 'Oak Tree Cluster' },
      { type: 'building', x0: 55, x1: 72, y0: 20, y1: 35, baseZ: terrainFunc(63.5, 27.5), roofZ: terrainFunc(63.5, 27.5) + 6.5, label: 'Residential House' }
    );
  } else if (preset === 'steep') {
    physicalObjects.push(
      { type: 'building', x0: 70, x1: 85, y0: 40, y1: 60, baseZ: terrainFunc(77.5, 50), roofZ: terrainFunc(77.5, 50) + 7.5, label: 'Ridge Lookout Building' },
      { type: 'tree', cx: 32, cy: 60, r: 9, baseZ: terrainFunc(32, 60), height: 11, label: 'Slope Trees' }
    );
  } else if (preset === 'urban') {
    physicalObjects.push(
      { type: 'building', x0: 15, x1: 45, y0: 15, y1: 45, baseZ: terrainFunc(30, 30), roofZ: terrainFunc(30, 30) + 15.0, label: 'Office Tower A' },
      { type: 'building', x0: 55, x1: 85, y0: 55, y1: 85, baseZ: terrainFunc(70, 70), roofZ: terrainFunc(70, 70) + 21.0, label: 'Commercial Complex B' },
      { type: 'tree', cx: 50, cy: 25, r: 4, baseZ: terrainFunc(50, 25), height: 6, label: 'Street Tree' },
      { type: 'tree', cx: 50, cy: 75, r: 4, baseZ: terrainFunc(50, 75), height: 6, label: 'Street Tree' }
    );
  }

  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const cols = Math.floor(Math.sqrt(density * 1.2));
  const rows = cols;
  const stepX = 96 / cols;
  const stepY = 96 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = 2 + c * stepX + rand() * stepX * 0.8;
      const y = 2 + r * stepY + rand() * stepY * 0.8;
      if (x < 1 || x > 99 || y < 1 || y > 99) continue;

      const baseZ = terrainFunc(x, y);
      let z = baseZ + (rand() - 0.5) * 0.3;
      let isTrueGround = true;
      let objectType = 'Ground';

      if (preset === 'hills' || preset === 'noise') {
        const dTree1 = Math.hypot(x - 35, y - 40);
        if (dTree1 < 11 && rand() > 0.28) {
          z = baseZ + (11 - dTree1) * (0.55 + rand() * 0.6) + 2.5;
          isTrueGround = false;
          objectType = 'Tree Foliage';
        }
        const dTree2 = Math.hypot(x - 75, y - 70);
        if (dTree2 < 9 && rand() > 0.32) {
          z = baseZ + (9 - dTree2) * (0.6 + rand() * 0.5) + 2.0;
          isTrueGround = false;
          objectType = 'Tree Foliage';
        }
        if (x >= 55 && x <= 72 && y >= 20 && y <= 35) {
          z = baseZ + 6.5 + (rand() - 0.5) * 0.2;
          isTrueGround = false;
          objectType = 'House Roof';
        }
        if (preset === 'noise' && rand() < 0.035) {
          z = baseZ - 7 - rand() * 5;
          isTrueGround = false;
          objectType = 'Low Noise Outlier';
        }
      } else if (preset === 'steep') {
        if (x >= 70 && x <= 85 && y >= 40 && y <= 60) {
          z = baseZ + 7.5;
          isTrueGround = false;
          objectType = 'Building Roof';
        }
        const dTree = Math.hypot(x - 32, y - 60);
        if (dTree < 9 && rand() > 0.3) {
          z = baseZ + (9 - dTree) * 0.7 + 3;
          isTrueGround = false;
          objectType = 'Tree Foliage';
        }
      } else if (preset === 'urban') {
        if (x >= 15 && x <= 45 && y >= 15 && y <= 45) {
          z = baseZ + 15.0 + (rand() - 0.5) * 0.1;
          isTrueGround = false;
          objectType = 'Office Tower A';
        } else if (x >= 55 && x <= 85 && y >= 55 && y <= 85) {
          z = baseZ + 21.0 + (rand() - 0.5) * 0.1;
          isTrueGround = false;
          objectType = 'Commercial Complex B';
        } else if (Math.abs(y - 50) < 3 && rand() > 0.6) {
          z = baseZ + 1.8;
          isTrueGround = false;
          objectType = 'Vehicle';
        } else if (Math.abs(x - 50) < 3 && rand() > 0.6) {
          z = baseZ + 4.5 + rand() * 2;
          isTrueGround = false;
          objectType = 'Street Tree';
        }
      }

      points.push({
        id: idCounter++,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        z: Number(z.toFixed(2)),
        trueZ: Number(baseZ.toFixed(2)),
        isTrueGround,
        objectType,
      });
    }
  }

  return { points, physicalObjects };
}

// ---------------------------------------------------------------------------
// Axelsson Adaptive TIN Iterations Algorithm (15-20 Gradual Steps)
// ---------------------------------------------------------------------------
function computeAdaptiveTINHistory(points, gridSize, maxAngleDeg, maxDist) {
  if (points.length < 3) return [];

  const minX = 0, maxX = 100, minY = 0, maxY = 100;
  const colCount = Math.max(1, Math.floor((maxX - minX) / gridSize));
  const rowCount = Math.max(1, Math.floor((maxY - minY) / gridSize));

  const seedPointIds = new Set();
  const cellWidth = (maxX - minX) / colCount;
  const cellHeight = (maxY - minY) / rowCount;

  // Step 0: Find lowest elevation point in each grid cell as initial seed
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const cx0 = minX + c * cellWidth;
      const cx1 = cx0 + cellWidth;
      const cy0 = minY + r * cellHeight;
      const cy1 = cy0 + cellHeight;

      let minPt = null;
      let minZ = Infinity;

      points.forEach((p) => {
        if (p.x >= cx0 && p.x < cx1 && p.y >= cy0 && p.y < cy1) {
          if (p.z < minZ) {
            minZ = p.z;
            minPt = p;
          }
        }
      });

      if (minPt) seedPointIds.add(minPt.id);
    }
  }

  // Ensure corner boundary seeds exist for full convex cover
  const cornerCoords = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  cornerCoords.forEach((cc) => {
    let closestPt = null;
    let minDistSq = Infinity;
    points.forEach((p) => {
      const d2 = (p.x - cc.x) ** 2 + (p.y - cc.y) ** 2;
      if (d2 < minDistSq) {
        minDistSq = d2;
        closestPt = p;
      }
    });
    if (closestPt) seedPointIds.add(closestPt.id);
  });

  const calcAcc = (groundSet) => {
    let correct = 0;
    points.forEach((p) => {
      const isAlgoGround = groundSet.has(p.id);
      if (isAlgoGround === p.isTrueGround) {
        correct++;
      }
    });
    return Number(((correct / points.length) * 100).toFixed(1));
  };

  const history = [];
  let currentGroundIds = new Set(seedPointIds);

  // Record Step 0 (Initial Seed TIN)
  const initialGroundPts = points.filter((p) => currentGroundIds.has(p.id));
  const initialTriangles = delaunay2D(initialGroundPts);
  history.push({
    step: 0,
    groundSet: new Set(currentGroundIds),
    nonGroundSet: new Set(points.filter((p) => !currentGroundIds.has(p.id)).map((p) => p.id)),
    seedSet: new Set(seedPointIds),
    triangles: initialTriangles.map((t) => [initialGroundPts[t[0]].id, initialGroundPts[t[1]].id, initialGroundPts[t[2]].id]),
    candidateEvaluations: [],
    newlyAdded: [],
    accuracy: calcAcc(currentGroundIds),
    gridSize,
    colCount,
    rowCount,
  });

  let iterations = 1;
  const maxIterations = 35;

  while (iterations <= maxIterations) {
    const groundPts = points.filter((p) => currentGroundIds.has(p.id));
    const triangles = delaunay2D(groundPts);
    const unclassified = points.filter((p) => !currentGroundIds.has(p.id));

    const candidateEvaluations = [];
    const qualifiedCandidates = [];

    unclassified.forEach((p) => {
      let matchedTri = null;
      for (let t = 0; t < triangles.length; t++) {
        const triIndices = triangles[t];
        const v0 = groundPts[triIndices[0]];
        const v1 = groundPts[triIndices[1]];
        const v2 = groundPts[triIndices[2]];
        if (pointInTriangle2D(p.x, p.y, v0.x, v0.y, v1.x, v1.y, v2.x, v2.y)) {
          matchedTri = { v0, v1, v2 };
          break;
        }
      }

      if (!matchedTri && triangles.length > 0) {
        let minDistSq = Infinity;
        triangles.forEach((t) => {
          const v0 = groundPts[t[0]];
          const v1 = groundPts[t[1]];
          const v2 = groundPts[t[2]];
          const cx = (v0.x + v1.x + v2.x) / 3;
          const cy = (v0.y + v1.y + v2.y) / 3;
          const d2 = (p.x - cx) ** 2 + (p.y - cy) ** 2;
          if (d2 < minDistSq) {
            minDistSq = d2;
            matchedTri = { v0, v1, v2 };
          }
        });
      }

      if (!matchedTri) return;

      const { v0, v1, v2 } = matchedTri;
      const ux = v1.x - v0.x, uy = v1.y - v0.y, uz = v1.z - v0.z;
      const vx = v2.x - v0.x, vy = v2.y - v0.y, vz = v2.z - v0.z;

      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      let nz = ux * vy - uy * vx;

      if (Math.abs(nz) < 1e-8) nz = 1e-8;

      const zPlane = v0.z - (nx * (p.x - v0.x) + ny * (p.y - v0.y)) / nz;
      const d = p.z - zPlane;

      const calcAngle = (v) => {
        const horizDist = Math.hypot(p.x - v.x, p.y - v.y);
        if (horizDist < 1e-6) return 0;
        return (Math.atan2(Math.abs(p.z - v.z), horizDist) * 180) / Math.PI;
      };

      const maxAngle = Math.max(calcAngle(v0), calcAngle(v1), calcAngle(v2));

      const passesDist = d >= -0.1 && d <= maxDist;
      const passesAngle = maxAngle <= maxAngleDeg;
      const accepted = passesDist && passesAngle;

      candidateEvaluations.push({
        id: p.id,
        d: Number(d.toFixed(2)),
        angle: Number(maxAngle.toFixed(1)),
        passesDist,
        passesAngle,
        accepted,
        zPlane: Number(zPlane.toFixed(2)),
      });

      if (accepted) {
        qualifiedCandidates.push({ id: p.id, d, angle: maxAngle });
      }
    });

    if (qualifiedCandidates.length === 0) break;

    // Sort qualified candidates by distance d ascending (closest to TIN surface first)
    qualifiedCandidates.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));

    // Controlled batch insertion spanning 25-35 smooth steps up to 80%+ accuracy
    const batchSize = Math.max(1, Math.min(10, Math.ceil(qualifiedCandidates.length / 14)));
    const batchToAdd = qualifiedCandidates.slice(0, batchSize);

    batchToAdd.forEach((c) => currentGroundIds.add(c.id));

    history.push({
      step: iterations,
      groundSet: new Set(currentGroundIds),
      nonGroundSet: new Set(points.filter((p) => !currentGroundIds.has(p.id)).map((p) => p.id)),
      seedSet: new Set(seedPointIds),
      triangles: triangles.map((t) => [groundPts[t[0]].id, groundPts[t[1]].id, groundPts[t[2]].id]),
      candidateEvaluations,
      newlyAdded: batchToAdd.map((c) => c.id),
      accuracy: calcAcc(currentGroundIds),
      gridSize,
      colCount,
      rowCount,
    });

    iterations++;
  }

  return history;
}

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
    return generateSceneData(preset, density);
  }, [preset, density]);

  // Compute Adaptive TIN algorithm iterations history
  const history = useMemo(() => {
    return computeAdaptiveTINHistory(points, gridSize, maxAngle, maxDist);
  }, [points, gridSize, maxAngle, maxDist]);

  useEffect(() => {
    if (currentStep >= history.length) {
      setCurrentStep(Math.max(0, history.length - 1));
    }
  }, [history.length, currentStep]);

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
  const pointsById = useMemo(() => {
    const map = new Map();
    points.forEach((p) => map.set(p.id, p));
    return map;
  }, [points]);

  const groundCount = currentSnapshot ? currentSnapshot.groundSet.size : 0;
  const nonGroundCount = points.length - groundCount;

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

    // Draw Ground TIN Profile Surface Line
    const groundPtsInSlice = slicePoints.filter((p) => currentSnapshot.groundSet.has(p.id));
    groundPtsInSlice.sort((a, b) => a.x - b.x);

    if (groundPtsInSlice.length >= 2) {
      ctx.strokeStyle = '#c48b49';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      groundPtsInSlice.forEach((p, idx) => {
        const px = toX(p.x);
        const py = toY(p.z);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // Distance Tolerance Band Envelope (d_max limit)
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.35)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      groundPtsInSlice.forEach((p, idx) => {
        const px = toX(p.x);
        const py = toY(p.z + maxDist);
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
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

      ctx.fillStyle = isSeed ? '#f59e0b' : isGround ? '#c48b49' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(px, py, isHovered ? 5 : 2.4, 0, Math.PI * 2);
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        const groundPt = groundPtsInSlice.find((g) => Math.abs(g.x - p.x) < 8);
        if (groundPt) {
          const gPy = toY(groundPt.z);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px, gPy);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = '#38bdf8';
          ctx.font = '600 11px system-ui';
          ctx.textAlign = 'left';
          ctx.fillText(`d = ${Math.abs(p.z - groundPt.z).toFixed(2)}m`, px + 8, (py + gPy) / 2);
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
            Adaptive TIN Ground Classification <span className="native-badge">Axelsson Algorithm</span>
          </h1>
          <span className="sub">
            Iterative triangulated irregular network densification for LiDAR point cloud ground filtering
          </span>
        </div>
        <span className="score-chip">
          Accuracy: <b>{accuracy}%</b>
        </span>
      </header>

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
            <strong>🌾 Gentle Rolling Terrain &amp; Trees</strong>
            <span>Realistic, near-flat undulating ground with vegetation clusters &amp; residential house</span>
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
            <strong>🏙️ Urban City Block</strong>
            <span>Flat ground with multi-story office towers, vehicles &amp; street trees</span>
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
                  {show3DObjects ? '🌲 Hide 3D Objects' : '🌲 Show 3D Objects'}
                </button>
                <button
                  className="tin-btn secondary"
                  style={{ padding: '3px 9px', fontSize: 11 }}
                  onClick={() => setView3D(!view3D)}
                >
                  {view3D ? '📷 Switch to 2D Plan' : '🧊 Switch to 3D View'}
                </button>
              </small>
            </h2>

            <canvas
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
            />

            {/* 3D Camera Controls Bar */}
            {view3D && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  margin: '8px 0',
                  padding: '6px 10px',
                  background: '#f8fafc',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                }}
              >
                <span>Rotate (Orbit):</span>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={yawAngle}
                  onChange={(e) => setYawAngle(Number(e.target.value))}
                  style={{ width: 80, accentColor: '#0f8a4d' }}
                />
                <span>Tilt (Pitch):</span>
                <input
                  type="range"
                  min="10"
                  max="85"
                  value={pitchAngle}
                  onChange={(e) => setPitchAngle(Number(e.target.value))}
                  style={{ width: 80, accentColor: '#0f8a4d' }}
                />
                <span>Zoom:</span>
                <input
                  type="range"
                  min="0.6"
                  max="2.2"
                  step="0.1"
                  value={zoomScale}
                  onChange={(e) => setZoomScale(Number(e.target.value))}
                  style={{ width: 80, accentColor: '#0f8a4d' }}
                />
                <button
                  className="tin-btn secondary"
                  style={{ padding: '2px 8px', fontSize: 11, marginLeft: 'auto' }}
                  onClick={() => {
                    setYawAngle(45);
                    setPitchAngle(35);
                    setZoomScale(1.0);
                  }}
                >
                  🎯 Reset Cam
                </button>
              </div>
            )}

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
              <span>{currentStep === history.length - 1 ? '✅ Converged' : 'In Progress'}</span>
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
            </div>
          </section>

          {/* Section 2: Interactive Zoomable Cross-Section Elevation Profile */}
          <section className="sim-panel">
            <h2>
              <span className="stepno">2</span> Cross-Section Profile (XZ Slice) &amp; Zoom Controls
            </h2>

            <canvas ref={profileCanvasRef} className="tin-canvas" width={700} height={200} />

            {/* Interactive Slice Controls & Zoom Sliders */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px 14px',
                marginTop: 10,
                padding: '8px 12px',
                background: '#f8fafc',
                borderRadius: 8,
                border: '1px solid #e2e8f0',
                fontSize: 12,
              }}
            >
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 12, color: '#56677a' }}>
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
                Grid Seed Size (Max Object Size): <b>{gridSize} m</b>
                <input
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
                Point Cloud Density: <b>{density} points</b>
                <input
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
                <span>Non-Ground</span>
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
          </section>

          {/* Interactive Candidate Point Inspector */}
          <section className="sim-panel">
            <h2>
              <span className="stepno">4</span> Candidate Point Inspector
            </h2>
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
                    {currentSnapshot.groundSet.has(hoveredPoint.id) ? 'GROUND' : 'NON-GROUND'}
                  </span>
                </div>
                <div>
                  Coordinates: X={hoveredPoint.x}m, Y={hoveredPoint.y}m, Z={hoveredPoint.z}m
                </div>

                {hoveredEvaluation ? (
                  <div className="tin-check-list">
                    <div className={`tin-check-item ${hoveredEvaluation.passesDist ? 'pass' : 'fail'}`}>
                      Dist d: {hoveredEvaluation.d}m (Max: {maxDist}m) {hoveredEvaluation.passesDist ? '✓' : '✗'}
                    </div>
                    <div className={`tin-check-item ${hoveredEvaluation.passesAngle ? 'pass' : 'fail'}`}>
                      Angle θ: {hoveredEvaluation.angle}° (Max: {maxAngle}°) {hoveredEvaluation.passesAngle ? '✓' : '✗'}
                    </div>
                  </div>
                ) : currentSnapshot.seedSet.has(hoveredPoint.id) ? (
                  <div className="rng-note" style={{ marginTop: 6, padding: '4px 8px' }}>
                    <b>Initial Seed Point:</b> Selected as local minimum elevation in grid cell.
                  </div>
                ) : (
                  <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                    Already added to TIN ground set in earlier iteration.
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
              <b>Axelsson (2000) Algorithm Steps:</b>
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
                    <li>Calculate vertical distance <i>d</i> to plane of <i>T</i>.</li>
                    <li>Calculate max angle <i>θ</i> from vertices of <i>T</i> to <i>P</i>.</li>
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
              d = z<sub>point</sub> − z<sub>TIN_facet</sub> &le; {maxDist} m
            </div>
            <div className="equation big">
              θ = max( atan( |z - z<sub>i</sub>| / dist<sub>2D</sub> ) ) &le; {maxAngle}°
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
