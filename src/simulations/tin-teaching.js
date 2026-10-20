// Teaching frames describe the actual classifier events. Meshes and tests in a
// frame always share the same instant; batch qualification is not insertion.
export function tinTeachingTimeline(points, history) {
  if (!history.length) return [];
  const initial = history[0],
    empty = {
      ...initial,
      groundSet: new Set(),
      seedSet: new Set(),
      triangles: [],
      newlyAdded: [],
      candidateEvaluations: [],
      accuracy: 0,
    };
  const frames = [
    {
      phase: "cloud",
      title: "1 · Start with unclassified returns",
      snapshot: empty,
      batch: 0,
    },
    {
      phase: "cells",
      title: "2 · Partition the XY plane",
      snapshot: empty,
      batch: 0,
    },
    {
      phase: "seeds",
      title: "3 · Select each eligible cell minimum",
      snapshot: { ...initial, triangles: [] },
      batch: 0,
    },
  ];
  initial.triangles.forEach((triangle, i) =>
    frames.push({
      phase: "initial",
      title: `4 · Reveal initial Delaunay facet ${i + 1}/${initial.triangles.length}`,
      snapshot: { ...initial, triangles: initial.triangles.slice(0, i + 1) },
      triangle,
      batch: 0,
    }),
  );
  if (!initial.triangles.length)
    frames.push({
      phase: "initial",
      title: "4 · No supported initial facets",
      snapshot: initial,
      batch: 0,
    });
  const accuracy = (set) =>
    (100 * points.filter((p) => set.has(p.id) === p.isTrueGround).length) /
    points.length;
  history.slice(1).forEach((s, index) => {
    s.insertionEvents.forEach((event, eventIndex) => {
      const beforeSet = new Set(event.beforeGroundIds),
        before = {
          ...s,
          groundSet: beforeSet,
          nonGroundSet: new Set(
            points.filter((p) => !beforeSet.has(p.id)).map((p) => p.id),
          ),
          triangles: event.beforeTriangles,
          candidateEvaluations: [event.test],
          newlyAdded: [],
          accuracy: accuracy(beforeSet),
        };
      frames.push({
        phase: "test",
        title: "5 · Test one candidate against its current facet",
        snapshot: before,
        event,
        batch: index + 1,
        eventIndex,
      });
      frames.push({
        phase: "decision",
        title: event.inserted
          ? "6 · Both tests pass: insert this candidate"
          : "6 · Defer: this point does not pass the current test",
        snapshot: before,
        event,
        batch: index + 1,
        eventIndex,
      });
      if (event.inserted) {
        const afterSet = new Set(event.afterGroundIds);
        frames.push({
          phase: "retriangulate",
          title: "7 · Insert and recompute the Delaunay TIN",
          snapshot: {
            ...s,
            groundSet: afterSet,
            nonGroundSet: new Set(
              points.filter((p) => !afterSet.has(p.id)).map((p) => p.id),
            ),
            triangles: event.afterTriangles,
            newlyAdded: [event.id],
            candidateEvaluations: [event.test],
            accuracy: accuracy(afterSet),
          },
          event,
          batch: index + 1,
          eventIndex,
        });
      }
    });
  });
  frames.push({
    phase: "complete",
    title: "8 · Evaluate the supported ground surface",
    snapshot: { ...history.at(-1), candidateEvaluations: [] },
    batch: history.length - 1,
  });
  return frames;
}
export const TIN_PHASE_TEXT = {
  cloud:
    "These are measured XYZ returns, not a terrain model. A last return is not automatically ground. Synthetic truth is used only for evaluation.",
  cells:
    "Partition in XY. Cell width should reflect object size; a cell entirely covered by a roof may supply a bad seed. Screened low outliers are ineligible.",
  seeds:
    "Gold points are the lowest eligible measurements in their cells. They are ground hypotheses, not guaranteed ground. Empty cells supply no invented point.",
  initial:
    "Delaunay triangulation is constructed in XY; measured Z values lift its facets into a 2.5D surface. Facets are revealed for inspection, not in the internal triangulator’s insertion order. Long unsupported edges remain gaps.",
  test: "The blue facet is the current supporting triangle. Yellow shows the candidate and perpendicular projection. Test perpendicular distance d AND the largest vertex-to-point angle relative to this facet—not terrain slope. Predict pass or defer before advancing.",
  decision:
    "Passing a preliminary batch test is not the same as insertion. This decision uses the actual immediate pre-insertion facet and its local distance bound. A deferred point may be tested again later; it is not proven to be an object.",
  retriangulate:
    "The candidate becomes a ground hypothesis. Orange dashed edges are removed facets; green edges are new Delaunay facets. Retriangulation can flip neighbouring edges—not just divide one triangle. The next candidate uses this updated mesh.",
  complete:
    "No further supported candidates, or the display iteration limit, ends this run. Convergence does not prove correctness. Read ground precision, recall, coverage and independent height error together. Unsupported hull margins remain unestimated.",
};
