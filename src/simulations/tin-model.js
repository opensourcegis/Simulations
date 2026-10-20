import { evaluateTinCandidate } from "../../games/shared/lidar-physics.js";
import { solveLinear } from "./photogrammetry-model.js";

export function tinTerrainHeight(preset, x, y) {
  if (preset === "hills" || preset === "noise")
    return (
      5 +
      1.2 * Math.sin(x / 22) * Math.cos(y / 26) +
      0.8 * Math.sin((x + y) / 36)
    );
  if (preset === "steep")
    return 5 + 14 / (1 + Math.exp(-(x - 50) / 6)) + 1.5 * Math.cos(y / 16);
  if (preset === "urban")
    return 4 + 0.5 * Math.sin(x / 35) + 0.4 * Math.cos(y / 35);
  return 5;
}
// Geometry-only local-plane screen. No synthetic labels, object names or
// return numbers are inspected. Sharp real depressions can also be removed.
export function isolatedLowPoints(points, threshold = 2.5) {
  const excluded = new Set();
  for (const p of points) {
    const near = points
      .filter((q) => q.id !== p.id)
      .map((q) => ({ q, d: Math.hypot(q.x - p.x, q.y - p.y) }))
      .filter((q) => q.d < 22)
      .sort((a, b) => a.d - b.d)
      .slice(0, 10)
      .map((q) => q.q);
    if (near.length < 5) continue;
    const n = Array.from({ length: 3 }, () => [0, 0, 0]),
      b = [0, 0, 0];
    for (const q of near) {
      const row = [q.x - p.x, q.y - p.y, 1];
      for (let i = 0; i < 3; i++) {
        b[i] += row[i] * q.z;
        for (let j = 0; j < 3; j++) n[i][j] += row[i] * row[j];
      }
    }
    const fit = solveLinear(n, b);
    if (!fit) continue;
    const residuals = near
      .map((q) =>
        Math.abs(q.z - fit[0] * (q.x - p.x) - fit[1] * (q.y - p.y) - fit[2]),
      )
      .sort((a, b) => a - b);
    if (
      p.z <
      fit[2] -
        Math.max(threshold, 3 * residuals[Math.floor(residuals.length / 2)])
    )
      excluded.add(p.id);
  }
  return excluded;
}
export function tinFacetLimits(
  vertices,
  maxDistance,
  { adaptive = true, noiseSigma = 0.06, maxEdge = 55 } = {},
) {
  const edges = vertices.map((a, i) =>
    Math.hypot(a.x - vertices[(i + 1) % 3].x, a.y - vertices[(i + 1) % 3].y),
  );
  return {
    supported: Math.max(...edges) <= maxEdge,
    distanceLimit: adaptive
      ? Math.min(
          maxDistance,
          Math.max(3 * noiseSigma, 0.15 + 0.02 * Math.min(...edges)),
        )
      : maxDistance,
    minEdge: Math.min(...edges),
  };
}
export function tinTerrainQuality(points, snapshot, preset, maxEdge = 55) {
  const byId = new Map(points.map((p) => [p.id, p])),
    errors = [];
  let requested = 0;
  for (let y = 5; y <= 95; y += 10)
    for (let x = 5; x <= 95; x += 10) {
      requested++;
      for (const ids of snapshot.triangles) {
        const v = ids.map((id) => byId.get(id));
        if (
          !tinFacetLimits(v, 1, { maxEdge }).supported ||
          !pointInTriangle2D(x, y, ...v.flatMap((p) => [p.x, p.y]))
        )
          continue;
        const hit = evaluateTinCandidate({ x, y, z: 0 }, v, Infinity, 90);
        if (hit) errors.push(hit.zPlane - tinTerrainHeight(preset, x, y));
        break;
      }
    }
  return {
    coverage: errors.length / requested,
    rmse: errors.length
      ? Math.sqrt(errors.reduce((s, x) => s + x * x, 0) / errors.length)
      : null,
    bias: errors.length
      ? errors.reduce((s, x) => s + x, 0) / errors.length
      : null,
    samples: errors.length,
  };
}
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

export function delaunay2D(points) {
  if (points.length < 3) return [];

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
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
      cc: circumcircle(
        allPts[stIndices[0]],
        allPts[stIndices[1]],
        allPts[stIndices[2]],
      ),
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

export function pointInTriangle2D(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax,
    v0y = cy - ay;
  const v1x = bx - ax,
    v1y = by - ay;
  const v2x = px - ax,
    v2y = py - ay;

  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01 + 1e-12);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

  return u >= -1e-8 && v >= -1e-8 && u + v <= 1 + 1e-8;
}

// ---------------------------------------------------------------------------
// Point Cloud & Physical 3D Structure Generation
// ---------------------------------------------------------------------------
export function generateSceneData(
  preset,
  density = 180,
  { noiseSigma = 0.06, penetration = 0.3, seed: initialSeed = 42 } = {},
) {
  const points = [];
  const physicalObjects = [];
  let idCounter = 0;

  const terrainFunc = (x, y) => tinTerrainHeight(preset, x, y);

  // Define 3D Physical Structures (Buildings & Trees)
  if (preset === "hills" || preset === "noise") {
    physicalObjects.push(
      {
        type: "tree",
        cx: 35,
        cy: 40,
        r: 11,
        baseZ: terrainFunc(35, 40),
        height: 13,
        label: "Pine Tree Cluster",
      },
      {
        type: "tree",
        cx: 75,
        cy: 70,
        r: 9,
        baseZ: terrainFunc(75, 70),
        height: 11,
        label: "Oak Tree Cluster",
      },
      {
        type: "building",
        x0: 55,
        x1: 72,
        y0: 20,
        y1: 35,
        baseZ: terrainFunc(63.5, 27.5),
        roofZ: terrainFunc(63.5, 27.5) + 6.5,
        label: "Residential House",
      },
    );
  } else if (preset === "steep") {
    physicalObjects.push(
      {
        type: "building",
        x0: 70,
        x1: 85,
        y0: 40,
        y1: 60,
        baseZ: terrainFunc(77.5, 50),
        roofZ: terrainFunc(77.5, 50) + 7.5,
        label: "Ridge Lookout Building",
      },
      {
        type: "tree",
        cx: 32,
        cy: 60,
        r: 9,
        baseZ: terrainFunc(32, 60),
        height: 11,
        label: "Slope Trees",
      },
    );
  } else if (preset === "urban") {
    physicalObjects.push(
      {
        type: "building",
        x0: 15,
        x1: 45,
        y0: 15,
        y1: 45,
        baseZ: terrainFunc(30, 30),
        roofZ: terrainFunc(30, 30) + 15.0,
        label: "Office Tower A",
      },
      {
        type: "building",
        x0: 55,
        x1: 85,
        y0: 55,
        y1: 85,
        baseZ: terrainFunc(70, 70),
        roofZ: terrainFunc(70, 70) + 21.0,
        label: "Commercial Complex B",
      },
      {
        type: "tree",
        cx: 50,
        cy: 25,
        r: 4,
        baseZ: terrainFunc(50, 25),
        height: 6,
        label: "Street Tree",
      },
      {
        type: "tree",
        cx: 50,
        cy: 75,
        r: 4,
        baseZ: terrainFunc(50, 75),
        height: 6,
        label: "Street Tree",
      },
    );
  }

  let seed = initialSeed;
  let noiseSeed = initialSeed + 731;
  const normal = () => {
    const u = () => {
      noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
      return (noiseSeed + 0.5) / 4294967296;
    };
    return Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  };
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
      let z = baseZ;
      let isTrueGround = true;
      let objectType = "Ground";

      if (preset === "hills" || preset === "noise") {
        const dTree1 = Math.hypot(x - 35, y - 40);
        if (dTree1 < 11) {
          z = baseZ + (11 - dTree1) * (0.55 + rand() * 0.6) + 2.5;
          isTrueGround = false;
          objectType = "Tree Foliage";
        }
        const dTree2 = Math.hypot(x - 75, y - 70);
        if (dTree2 < 9) {
          z = baseZ + (9 - dTree2) * (0.6 + rand() * 0.5) + 2.0;
          isTrueGround = false;
          objectType = "Tree Foliage";
        }
        if (x >= 55 && x <= 72 && y >= 20 && y <= 35) {
          z = baseZ + 6.5 + (rand() - 0.5) * 0.2;
          isTrueGround = false;
          objectType = "House Roof";
        }
        if (preset === "noise" && rand() < 0.035) {
          z = baseZ - 7 - rand() * 5;
          isTrueGround = false;
          objectType = "Low Noise Outlier";
        }
      } else if (preset === "steep") {
        if (x >= 70 && x <= 85 && y >= 40 && y <= 60) {
          z = baseZ + 7.5;
          isTrueGround = false;
          objectType = "Building Roof";
        }
        const dTree = Math.hypot(x - 32, y - 60);
        if (dTree < 9) {
          z = baseZ + (9 - dTree) * 0.7 + 3;
          isTrueGround = false;
          objectType = "Tree Foliage";
        }
      } else if (preset === "urban") {
        if (x >= 15 && x <= 45 && y >= 15 && y <= 45) {
          z = baseZ + 15.0 + (rand() - 0.5) * 0.1;
          isTrueGround = false;
          objectType = "Office Tower A";
        } else if (x >= 55 && x <= 85 && y >= 55 && y <= 85) {
          z = baseZ + 21.0 + (rand() - 0.5) * 0.1;
          isTrueGround = false;
          objectType = "Commercial Complex B";
        } else if (Math.abs(y - 50) < 3 && rand() > 0.6) {
          z = baseZ + 1.8;
          isTrueGround = false;
          objectType = "Vehicle";
        } else if (Math.abs(x - 50) < 3 && rand() > 0.6) {
          z = baseZ + 4.5 + rand() * 2;
          isTrueGround = false;
          objectType = "Street Tree";
        }
      }

      z += normal() * noiseSigma;
      points.push({
        id: idCounter++,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        z: Number(z.toFixed(2)),
        trueZ: Number(baseZ.toFixed(2)),
        isTrueGround,
        objectType,
        pulseId: r * cols + c,
        returnNumber: 1,
        numberOfReturns: 1,
      });
      // A simplified penetrated last return follows the same off-nadir ray,
      // so its XY differs from the canopy echo; it is not a ground guarantee.
      if (objectType === "Tree Foliage") {
        const draw = rand(),
          ground = draw < penetration;
        if (ground || draw < penetration + 0.2 * (1 - penetration)) {
          const lastZ = ground
              ? baseZ
              : baseZ + Math.max(1, (z - baseZ) * 0.35),
            gx =
              x +
              (z - lastZ) * Math.tan((((x - 50) / 50) * 25 * Math.PI) / 180),
            gy = y;
          if (gx > 1 && gx < 99) {
            points.at(-1).numberOfReturns = 2;
            const gz = terrainFunc(gx, gy);
            points.push({
              id: idCounter++,
              x: +gx.toFixed(2),
              y: +gy.toFixed(2),
              z: +((ground ? gz : lastZ) + normal() * noiseSigma).toFixed(2),
              trueZ: +gz.toFixed(2),
              isTrueGround: ground,
              objectType: ground
                ? "Penetrated Ground Return"
                : "Lower Canopy Return",
              pulseId: r * cols + c,
              returnNumber: 2,
              numberOfReturns: 2,
            });
          }
        }
      }
    }
  }

  return { points, physicalObjects };
}

// ---------------------------------------------------------------------------
// Axelsson Adaptive TIN Iterations Algorithm (15-20 Gradual Steps)
// ---------------------------------------------------------------------------
export function computeAdaptiveTINHistory(
  points,
  gridSize,
  maxAngleDeg,
  maxDist,
  options = {},
) {
  if (points.length < 3) return [];
  const excludedSet =
    options.removeLow === false ? new Set() : isolatedLowPoints(points);
  const usable = points.filter((p) => !excludedSet.has(p.id));

  const minX = 0,
    maxX = 100,
    minY = 0,
    maxY = 100;
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

      usable.forEach((p) => {
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

  // No synthetic corner anchors: unsupported hull margins stay unsupported.

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
    nonGroundSet: new Set(
      points.filter((p) => !currentGroundIds.has(p.id)).map((p) => p.id),
    ),
    seedSet: new Set(seedPointIds),
    excludedSet,
    triangles: initialTriangles
      .filter(
        (t) =>
          tinFacetLimits(
            t.map((i) => initialGroundPts[i]),
            maxDist,
            options,
          ).supported,
      )
      .map((t) => [
        initialGroundPts[t[0]].id,
        initialGroundPts[t[1]].id,
        initialGroundPts[t[2]].id,
      ]),
    candidateEvaluations: [],
    newlyAdded: [],
    accuracy: calcAcc(currentGroundIds),
    gridSize,
    colCount,
    rowCount,
  });

  let iterations = 1;
  const maxIterations = Math.min(points.length, 100);
  let converged = false;

  while (iterations <= maxIterations) {
    const groundPts = points.filter((p) => currentGroundIds.has(p.id));
    const triangles = delaunay2D(groundPts);
    const unclassified = usable.filter((p) => !currentGroundIds.has(p.id));

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

      if (!matchedTri) return;

      const { v0, v1, v2 } = matchedTri;
      const limits = tinFacetLimits([v0, v1, v2], maxDist, options);
      if (!limits.supported) return;
      const evaluation = evaluateTinCandidate(
        p,
        [v0, v1, v2],
        limits.distanceLimit,
        maxAngleDeg,
      );
      if (!evaluation) return;
      const {
        d,
        angle: maxAngle,
        passesDist,
        passesAngle,
        accepted,
        zPlane,
      } = evaluation;

      candidateEvaluations.push({
        id: p.id,
        d: Number(d.toFixed(2)),
        angle: Number(maxAngle.toFixed(1)),
        passesDist,
        passesAngle,
        accepted,
        zPlane: Number(zPlane.toFixed(2)),
        distanceLimit: limits.distanceLimit,
      });

      if (accepted) {
        qualifiedCandidates.push({ id: p.id, d, angle: maxAngle });
      }
    });

    if (qualifiedCandidates.length === 0) {
      converged = true;
      break;
    }

    // Sort qualified candidates by distance d ascending (closest to TIN surface first)
    qualifiedCandidates.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));

    // Small display batches; synthetic truth never controls insertion decisions.
    const batchSize = Math.max(
      1,
      Math.min(10, Math.ceil(qualifiedCandidates.length / 14)),
    );
    const batchToAdd = qualifiedCandidates.slice(0, batchSize);

    const inserted = [];
    for (const candidate of batchToAdd) {
      const p = usable.find((p) => p.id === candidate.id),
        current = usable.filter((p) => currentGroundIds.has(p.id));
      const facet = delaunay2D(current)
        .map((t) => t.map((i) => current[i]))
        .find((v) =>
          pointInTriangle2D(p.x, p.y, ...v.flatMap((q) => [q.x, q.y])),
        );
      if (!facet) continue;
      const limits = tinFacetLimits(facet, maxDist, options),
        evaluation = evaluateTinCandidate(
          p,
          facet,
          limits.distanceLimit,
          maxAngleDeg,
        );
      if (limits.supported && evaluation?.accepted) {
        currentGroundIds.add(p.id);
        inserted.push(p.id);
      }
    }
    if (!inserted.length) {
      converged = true;
      break;
    }
    const updatedGroundPts = points.filter((p) => currentGroundIds.has(p.id));
    const updatedTriangles = delaunay2D(updatedGroundPts);

    history.push({
      step: iterations,
      groundSet: new Set(currentGroundIds),
      nonGroundSet: new Set(
        points.filter((p) => !currentGroundIds.has(p.id)).map((p) => p.id),
      ),
      seedSet: new Set(seedPointIds),
      excludedSet,
      triangles: updatedTriangles
        .filter(
          (t) =>
            tinFacetLimits(
              t.map((i) => updatedGroundPts[i]),
              maxDist,
              options,
            ).supported,
        )
        .map((t) => t.map((index) => updatedGroundPts[index].id)),
      candidateEvaluations,
      newlyAdded: inserted,
      accuracy: calcAcc(currentGroundIds),
      gridSize,
      colCount,
      rowCount,
    });

    iterations++;
  }

  history[history.length - 1].stopReason = converged
    ? "converged"
    : "iteration-limit";
  return history;
}
