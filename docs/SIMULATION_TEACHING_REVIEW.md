# Simulation teaching and reliability review

The catalogue contains 24 distinct laboratories. The incomplete duplicate React
orthorectification preview has been retired; bookmarked `?simulation=ortho` URLs
open the complete standalone lesson. This is an internal teaching/code review,
not external academic peer review or certification for operational survey work.

## Teaching standard

Each lesson should connect a learner-controlled input to a defined observable,
an equation or algorithm, and inspectable evidence. Visual motion is not evidence
of an estimator. Reference truth, supplied parameters, measured observations,
estimated results and formal uncertainty must be distinguished. Simplifications
should be visible in the lesson, rather than discoverable only in source code.

Older lessons now have compact learning goals and collapsed experiment/model-limit
briefs. The newer LiDAR learning panels and photogrammetry/navigation/adjustment
notebooks already provide their own objectives, procedures and limitations. They
were retained rather than covered with duplicate instructions.

## Coverage

| Laboratory | Learner should explain | Evidence / important limit |
| --- | --- | --- |
| Two principles of surveying | Establish checked control before details; locate a point using independent geometric constraints | Same observed traverse vectors with global/local compass-rule balancing; actual two-circle intersections, ambiguity and an independent check. Supplied control, planar geometry and illustrative uncertainty, not a field-accuracy certificate |
| LiDAR ranging | Convert round-trip delay to range; distinguish precision and ambiguity | Actual seeded shot, calibration delay, SNR detection and quantisation; AMCW uses ideal phase |
| LiDAR scan patterns | Combine steering and aircraft motion | Points and displayed ray share timestamped first-surface intersections; nominal density is not local coverage |
| Beam–target interaction | Partition pulse energy and detect returns | Material/angular backscatter and canopy waveform; illustrative BRDF and canopy cross-section, not full leaf ray tracing |
| Mission designer | Balance deliverable, payload, sampling, wind, obstacles and endurance | Calculated flight geometry; scenario limits are not regulations or flight approval; missing terrain makes grading provisional |
| Aerial triangulation | Measure image ties, intersect rays and assess a surveyed block | Actual clicked image coordinates and withheld checkpoints; synthetic images and simplified dense solver |
| Structure from motion | Recover cameras/structure from image matches | Essential RANSAC, cheirality, registration and joint refinement; initial images precede the solved 3D scene; relative scale only |
| Bundle adjustment | Jointly estimate poses/points and weigh control | Actual accepted/rejected solver steps, image residuals and excluded checkpoints; residuals alone are not accuracy |
| Camera working | Relate optics, pupil, shutter and sensor readout | Focus/exposure/sampling controls use a common model; compressed object scale and equivalent thin optics, not a lens prescription |
| Orthorectification | Separate tilt from relief and evaluate DTM/DSM geometry | Original source-image resampling and visibility renderer; a single image cannot fill unobserved areas |
| Adaptive TIN | Select seeds, test current facets and retriangulate | Actual pre/post facets and decisions; progressive densification inspired by Axelsson, not a production filter |
| Boresight / lever arm | Distinguish translation from mounting rotation | Same recorded range with different reconstruction assumptions; uncertainty contributions are not automatically independent RMS terms |
| GNSS positioning | Separate code/clock from carrier/integer ambiguity | Solved east+clock and covariance-aware DD baseline; one-dimensional geometry, explicitly supplied integers, no RTK ambiguity resolver |
| IMU | Predict specific force and angular rate; explain integration drift | Six channels, quaternion integration and calibration; gravity alone cannot observe heading and can be confused by acceleration |
| Least squares | Connect observations to weighted estimates and QA | Worked matrices and substitutions for four examples; datum rank, covariance assumptions and convergence matter |
| SBET / Kalman filter | Propagate INS, update with GNSS, smooth and time-tag LiDAR | Actual 15-state error-state updates and RTS smoother; local navigation/synthetic data, not vendor SBET processing |
| GPR | Link pulse, trace, hyperbola and velocity-dependent depth | One pulse clock for propagation/trace, equal distance scales, two-way time; homogeneous point-diffractor model |
| Building LOD | Choose geometry appropriate to an application | Included/excluded features; refined taxonomy is illustrative, not a CityGML validator or accuracy class |
| GSD | Project a pixel and distinguish sampling from resolution | Similar triangles and actual corner-ray terrain intersections; diffraction and motion are separate effects |
| Snell / optics | Predict refraction, critical angle and lens power | Sine-law calculations and fixed-curvature lensmaker formula; paraxial lens drawing, normalized radial distortion |
| Map projections | Compare local angle/area/distance preservation | Absolute Jacobian area scale and equal-radius circles; spherical formulas, not ellipsoidal UTM or projected polygon areas |
| SAR | Separate slant range, ground range and azimuth resolution | Bandwidth/incidence/antenna response; ideal broadside stripmap point responses, not processing a real SAR image |
| IoT digital twin | Distinguish data age, state mismatch and feedback delay | Sample timestamps, actual simulated latency and rule-driven actuation; no MQTT service, ML or validated life prediction |
| Beam footprint | Relate height, slant range, divergence and ellipse area | Numeric spot sizes and scale-correct inset; connected exaggerated 3D envelope, not a survey-scale spot |

## Corrections made

- Replaced the GNSS lesson's hard-coded centimetre position and code-rounding
  “ambiguity fixing” with real synthetic observations and solved results. Clock
  range appears once in the carrier equation. Same-epoch DDs share a reference,
  so the phase solution uses their correlated covariance. The integer hypothesis
  is explicitly supplied by the generator; changing one integer exposes the
  resulting baseline/residual error. It is not presented as successful RTK fixing.
- Corrected pulsed GPR terminology, tied propagation and trace cursor to the same
  slowed pulse clock, corrected the distance scales, added pause/touch dragging,
  and cached the radargram instead of recomputing its samples every frame.
- Corrected projection teaching: Mercator/Mollweide/etc. are mathematical rules,
  not general central-light casts. Local area factors are no longer normalized to
  the equator (which falsely made equatorial azimuthal area appear preserved).
  Mollweide remains finite at poles. Out-of-domain latitude geometry is excluded
  rather than folded onto the edge; strip polygons are clipped, not vertex-clamped.
- Replaced the lens's clamped visual focal proxy with a stated thin-lens formula
  and mm/dioptre readouts; restored the visible distortion-grid corner and declared
  normalized distortion coordinates. Corrected the SAR ground incidence arc,
  Doppler-rate sign and overly strong resolution/accuracy claims.
- Connected the exaggerated beam envelope to the actual displayed ground ellipse;
  disabled automatic rotation initially for footprint and building lessons and
  disposed their geometry/material resources. Removed unused projection optics.
- Made IoT physics fixed-step and seeded, independent of rendering frame rate;
  retained fractional sampling time, made latency match the displayed control,
  preserved sample timestamps, rejected stale out-of-order readings, exposed age
  separately from ΔT, added reset and removed fabricated remaining-life forecasts.
- Bundled Leaflet locally with its license: a blocked CDN no longer crashes the
  mission planner. Exposed missing online context and provisional grading, guarded
  stale asynchronous terrain requests and malformed saved grades, and corrected
  absolute claims about canopy visibility and regulatory limits.
- Consolidated duplicate ortho UI into the functioning renderer. Shortened card
  copy to learning objectives and removed implementation-status badges. Improved
  older worksheet typography, header contrast and phone controls. Added a caught
  render-failure page so an unsupported 3D renderer does not leave a blank screen.

## Focused layouts

The dense photo/navigation workspaces now use two columns: experiment settings
and the main view. Diagnostics follow the visual instead of squeezing it into a
third column. Mobile settings have a keyboard-accessible disclosure above the
scene. Secondary exposure, bias, mounting, theory and record-export sections are
closed until requested; selecting a relevant teaching stage opens its settings.
Opening or closing a section does not regenerate observations or reset a fit.

All 24 catalogue entries, including the three standalone laboratories, share a
minimal workspace skin: neutral surfaces, compact headers, understated stage
navigation and fewer boxed metrics. Diagram colours, warning states and scientific
units are not restyled as decorative accents. The catalogue itself has a short
introduction rather than promotional statistic cards.

SAR and optics open one concept at a time, with an explicit **Compare all** view.
The fixed-coordinate 2D canvases stay mounted when changing sections. Map
projections, building LOD and beam footprint use a large scene and a narrower
parameter rail. GSD starts with the triangle diagram; worked calculations follow
it, while native-pixel sampling has its own step. Camera capture opens with the
exposure step, and recovered SfM image-track galleries can be expanded on demand.
True ortho puts source and corrected imagery side by side before the supporting
geometry/elevation views. Beam–target interaction no longer squeezes its main view
between two sidebars; phone settings use native disclosures without discarding
their values. Mission requirements remain available in an expandable brief.

Least squares now presents one worksheet step at a time, with an optional full
worksheet. Boresight puts the geometry before detailed frame definitions. Pulse
ranging places its Fire/result console beside the ray view on desktop and keeps
the existing reachable action bar on phones. Repeated catalogue badges and tag
chips have been removed; their keywords still participate in search.

`npm run test:layout:browser` checks real pointer/keyboard activation, expanded
layouts, state preservation, active worksheet steps, accessible optional
calculations, wider scenes and reachable pulse controls. It writes desktop/phone
inspection screenshots into `/tmp/declutter-*.png`. No numerical models were
changed by this layout pass.

## Repeatable verification

```sh
npm ci
npm test
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

Browser tests expect a Chromium with WebGL and remote debugging on port 9222.
Use `PHOTO_CDP_URL` and `PHOTO_BASE_URL` to override. Run browser scripts serially
per browser: a newly opened foreground tab can suspend another tab's animation.

- `npm run test:all:browser`: every catalogue entry, exceptions/mount failures and
  desktop/tablet/phone overflow checks (1440, 768, 390, 320 px), including shared
  theme loading on standalone routes.
- `npm run test:minimal:browser`: pointer-activated concept steps, expanded
  comparisons, rendered diagrams, retained settings and camera captures, GSD
  sampling, responsive beam settings and ortho source/output layout. Writes
  `/tmp/minimal-*.png` visual-inspection screenshots.
- `npm run test:survey-principles:browser`: whole-to-part error containment,
  guided two-circle point fixing, ambiguity and independent checks, drag/slider
  equivalence, retained inputs and six responsive viewport widths.
- `npm run test:principles:browser`: GNSS stages/clock/integer hypotheses, GPR
  pause/acquisition, Snell TIR, seven projection factors, IoT pause/reset/latency,
  stationary 3D defaults, planner with external services blocked and the legacy
  ortho route. Additional failure/layout checks cover expanded controls and WebGL.
- Existing ranging, scanning, survey, compact, photogrammetry, aerial, navigation,
  adjustment and catalogue browser suites cover their detailed interactions and
  six viewport widths, including 1920 and 1024 px.

The automated suite contains 235 tests, including nine scanning-optics and eleven
surveying-fundamentals regressions. It tests noiseless recovery, clock cancellation, DD reference
invariance, wrong-integer sensitivity, hyperbolic travel time, critical angles,
lensmaker units, SAR resolution, map area preservation, pole limits, clipping,
seeded reset and frame-rate-independent IoT propagation.
The new fundamentals checks cover compass-rule corrections, local error
containment and inherited detail errors, range-circle ambiguities, weak/singular
geometry, covariance and a check observation withheld from the point solution.

These checks establish the tested behavior, not a claim that every browser,
parameter combination or scientific assumption has been exhaustively validated.
The existing large Three.js build-chunk warning remains informational.
