import {
  computeAdaptiveTINHistory,
  delaunay2D,
  pointInTriangle2D,
  tinFacetLimits,
} from "./tin-model.js";
import { evaluateTinCandidate } from "../../games/shared/lidar-physics.js";
export const SIMPLE_TIN_DEFAULTS = {
  preset: "hills",
  density: 320,
  gridSize: 25,
  maxAngle: 12,
  maxDist: 1.2,
  noiseSigma: 0.06,
  penetration: 0.3,
  removeLow: true,
  adaptive: false,
  maxEdge: 55,
};
export function tinSimpleLesson(points, settings) {
  const { gridSize, maxAngle, maxDist } = settings,
    history = computeAdaptiveTINHistory(
      points,
      gridSize,
      maxAngle,
      maxDist,
      settings,
    ),
    initial = history[0];
  if (!initial) return { history, initial: null, candidates: [], result: null };
  const byId = new Map(points.map((p) => [p.id, p])),
    evaluations = [];
  for (const p of points) {
    if (initial.groundSet.has(p.id) || initial.excludedSet.has(p.id)) continue;
    const ids = initial.triangles.find((ids) =>
      pointInTriangle2D(
        p.x,
        p.y,
        ...ids.flatMap((id) => {
          const q = byId.get(id);
          return [q.x, q.y];
        }),
      ),
    );
    if (!ids) continue;
    const vertices = ids.map((id) => byId.get(id)),
      limits = tinFacetLimits(vertices, maxDist, settings),
      test = evaluateTinCandidate(p, vertices, limits.distanceLimit, maxAngle);
    if (!test) continue;
    evaluations.push({
      id: p.id,
      facetIds: ids,
      distanceLimit: limits.distanceLimit,
      ...test,
    });
  }
  evaluations.sort((a, b) => a.d - b.d || a.id - b.id);
  const candidates = [evaluations[0], evaluations.at(-1)]
    .filter(Boolean)
    .map((test) => {
      const groundSet = new Set(initial.groundSet);
      if (test.accepted) groundSet.add(test.id);
      const ground = points.filter((p) => groundSet.has(p.id)),
        triangles = test.accepted
          ? delaunay2D(ground)
              .filter(
                (t) =>
                  tinFacetLimits(
                    t.map((i) => ground[i]),
                    maxDist,
                    settings,
                  ).supported,
              )
              .map((t) => t.map((i) => ground[i].id))
          : initial.triangles;
      return {
        test,
        after: {
          ...initial,
          groundSet,
          triangles,
          newlyAdded: test.accepted ? [test.id] : [],
        },
      };
    });
  return { history, initial, candidates, result: history.at(-1) };
}
