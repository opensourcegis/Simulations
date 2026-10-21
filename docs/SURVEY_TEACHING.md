# Teaching objectives and observable evidence

## Lever arm and boresight

The native lab now has one controlled settings object and one `directGeoreference` result. The equipment, true/reconstructed rays, ground inset, XYZ table, errors and worked example all use it. There is no separate lower assembly calculation or independent 6 m example. The cross-track scan convention also matches the legacy shared comparison helper.

Four visible stages isolate (1) antenna-to-scanner translation, (2) scanner-to-body rotation, (3) measured body attitude and (4) their composition. Each preset clears advanced residuals and time/range offsets. The zero-boresight and yaw-nadir/off-axis experiments reset the **whole** lesson, including its prominent readout.

Mount offsets are entered as forward/left/up vectors relative to the IMU; their difference is the lever arm. Drawn body and scanner coordinate triads follow forward/right/down equivalents, consistent with the NED Euler rotation convention; scene axes are north/west/up. True mount orientation is distinct from the applied calibration and its residual. Turning a reconstruction correction on/off changes only the reconstructed endpoint, not the recorded range, true ray, physical equipment or true ground hit.

The labelled payload view shows antenna, IMU, laser origin, lever arrow, body/scanner frames and beam-direction separation arc. Beam separation is not the norm of an Euler-angle triple, and pure yaw at nadir can rotate sensor axes without moving the ray. The ground inset auto-fits a local map in metres; it is not a fixed exaggeration factor and retains vertical error separately. The same measured range is used for both endpoints, without re-intersecting the wrong ray with terrain.

## Progressive TIN densification

The default is a compact five-step overview: choose measured seed minima, connect the initial TIN, test one point, show the actual retriangulation or unchanged mesh, then run the full filter. Its equal-scale XY plan is explicitly not an elevation plot. The two distance/angle controls use fixed distance bounds by default. Near/far examples are selected by distance to the initial surface, never reference labels. This one-point exercise is not presented as a replay of the full queued algorithm; its final step reruns that algorithm from the seeds.

“Open full inspector” preserves the settings and exposes the complete construction lesson. Returning to the overview also preserves changes, including any adaptive-bound option. In the inspector a shared timeline drives the main viewport, XY plan, counters, profile, selection and explanation:

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

## GSD: calculation before equipment

The default projection explanation shows both sensor-side and ground-side similar triangles, an equivalent-lens cutaway, inverted A/B correspondences and an enlarged representative CMOS photosite array. It derives the full-width ratio, then divides sensor and ground widths by the same native column count. Sensor-side and ground-side drawings use independent isotropic magnifications so their angles agree without suggesting millimetres and metres share a drawing scale. This construction is explicitly a level, nadir reference—even when the current camera is tilted. “Actual tilt & slope” retains the equal-scale XZ projection and actual native footprint. Principal distance is approximated by focal length at aerial object distances, not by a physical lens barrel length.

The primary view shows native pixel pitch, the nadir reference calculation, actual four-corner ray intersections and local sampling across the image. The XZ section uses equal axis scale. The native-pixel footprint is enlarged separately in equal-scale terrain-tangent coordinates; neither a grouped image region nor an exaggerated aircraft is used as quantitative evidence. An expandable substitution shows the same ray direction, denominator, intersection parameter and corner coordinates used by `localGsd`. The unnormalized parameter is explicitly not slant range. The native-pixel image experiment retains diffraction, exposure/motion and noise controls. The 3D context is optional and only mounts when opened.

## Laser ranging: measurement before instrument anatomy

The receiver/propagation experiment opens with a compact equation strip, distinguishing configured propagation prediction from captured timestamps and measured range. The large optical cutaway is below the experiment in a closed “Instrument anatomy” disclosure. All seven component explanations remain available; capture gating, delay calibration and timing uncertainty are unchanged.

## Regression evidence

`npm run test:compact:browser` checks the new defaults, five-stage TIN interactions and inspector handoff, GSD live numeric changes, hidden optional hardware, and six responsive widths. `scripts/survey-realism.test.js` verifies the exposed ray substitution and geometry-only one-point TIN decisions against the full classifier.

`scripts/survey-teaching.test.js` verifies preset isolation, correction invariance of true observations, translation/angular-error range scaling, legacy/native ray agreement, exact cell minima, event-facet/projection consistency, actual supported Delaunay meshes and timeline ordering/state coherence. Existing classifier/link-budget/GSD tests remain in the same suite.

`scripts/survey-realism-browser.mjs` checks all four boresight stages, whole-state experiment resets, yaw observability, immutable true-hit coordinates under corrections, TIN cells/seeds/facet formation, failed-test deferral, successful insertion, mode changes and six responsive widths. These are behavioral acceptance checks, not a claim of an external classroom study or academic peer review.
