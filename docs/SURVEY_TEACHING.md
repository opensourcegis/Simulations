# Teaching objectives and observable evidence

## Lever arm and boresight

The native lab now has one controlled settings object and one `directGeoreference` result. The equipment, true/reconstructed rays, ground inset, XYZ table, errors and worked example all use it. There is no separate lower assembly calculation or independent 6 m example. The cross-track scan convention also matches the legacy shared comparison helper.

Four visible stages isolate (1) antenna-to-scanner translation, (2) scanner-to-body rotation, (3) measured body attitude and (4) their composition. Each preset clears advanced residuals and time/range offsets. The zero-boresight and yaw-nadir/off-axis experiments reset the **whole** lesson, including its prominent readout.

Mount offsets are entered as forward/left/up vectors relative to the IMU; their difference is the lever arm. Drawn body and scanner coordinate triads follow forward/right/down equivalents, consistent with the NED Euler rotation convention; scene axes are north/west/up. True mount orientation is distinct from the applied calibration and its residual. Turning a reconstruction correction on/off changes only the reconstructed endpoint, not the recorded range, true ray, physical equipment or true ground hit.

The labelled payload view shows antenna, IMU, laser origin, lever arrow, body/scanner frames and beam-direction separation arc. Beam separation is not the norm of an Euler-angle triple, and pure yaw at nadir can rotate sensor axes without moving the ray. The ground inset auto-fits a local map in metres; it is not a fixed exaggeration factor and retains vertical error separately. The same measured range is used for both endpoints, without re-intersecting the wrong ray with terrain.

## Progressive TIN densification

The opening view is the construction lesson, not the synthetic reference landscape. A shared timeline drives the main viewport, XY plan, counters, profile, selection and explanation:

1. Unclassified returns, with no recovered facets.
2. XY seed cells.
3. Actual lowest eligible points, after optional low screening.
4. The supported initial Delaunay facets, progressively revealed with an inspectable XY circumcircle. This is a reveal of the computed mesh, **not** the internal Bowyer–Watson insertion order.
5. One candidate against its actual immediate pre-insertion facet: perpendicular foot/distance, vertex-to-candidate segments and facet-relative angle.
6. The actual pass/defer decision. A preliminary batch qualification is not an insertion. A deferred point is not automatically an object.
7. The inserted point and actual retriangulated mesh, highlighting removed and added facets. Delaunay flips can affect neighbours rather than simply splitting one triangle.
8. Final supported terrain, evaluated against synthetic truth with coverage and height error.

The numerical classifier still queues display batches and re-tests every proposed insertion on the freshly updated mesh. Its trace records every proposed insertion and one representative failed test per batch, not every failed preliminary qualification. Events store full-precision tests, facet IDs, perpendicular projection, before/after ground IDs and before/after supported triangles. The lesson never displays a prior-facet test as if it were computed on the new mesh. The generic inspector explicitly labels pre-insertion tests after insertion; final inspection does not reuse stale candidate tests.

The global distance slider is a cap. The actual local bound may tighten with edge spacing/noise; the decision panel displays it. The profile's dashed global envelope is labelled accordingly. The dark backdrop is a graphical analysis platform, not a recovered DTM; point-symbol sizes are not beam-footprint diameters. Unsupported facets and hull margins remain gaps. Seed contamination, ground omission, object inclusion and incomplete coverage remain possible.

## Regression evidence

`scripts/survey-teaching.test.js` verifies preset isolation, correction invariance of true observations, translation/angular-error range scaling, legacy/native ray agreement, exact cell minima, event-facet/projection consistency, actual supported Delaunay meshes and timeline ordering/state coherence. Existing classifier/link-budget/GSD tests remain in the same suite.

`scripts/survey-realism-browser.mjs` checks all four boresight stages, whole-state experiment resets, yaw observability, immutable true-hit coordinates under corrections, TIN cells/seeds/facet formation, failed-test deferral, successful insertion, mode changes and six responsive widths. These are behavioral acceptance checks, not a claim of an external classroom study or academic peer review.
