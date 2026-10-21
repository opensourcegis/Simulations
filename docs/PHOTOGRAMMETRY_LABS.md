# Photogrammetry teaching laboratories

## Bundle block adjustment

Route: `?simulation=block-adjustment`.

Six cameras form two aerial strips over procedural rolling terrain, a road and two buildings. The 43 candidate ground/roof details are tested against image bounds and 64-sample terrain/building visibility; only tracks observed at least twice enter the image network. The nominal 1600 × 1200 image has f = 1500 px (24 mm on a 25.6 mm-wide sensor); at 120 m datum height, GSD is 8 cm/px. Forward/side overlap are labelled flat-datum planning approximations, not guaranteed terrain coverage. Camera stations, footprint, sparse ties, control, ray bundles and synthetic perspective images share the same geometry.

Projection uses `q = Rᵀ [X−Xc, −(Y−Yc), Zc−Z]` and normalized radial distortion `[xd,yd] = [qx/qz,qy/qz](1+k₁r²)`. Backprojection iteratively undistorts the pixel. Six pose parameters per camera and three coordinates per fitted point are jointly adjustable. Optional self-calibration estimates shared f and k₁; principal point and other Brown terms remain fixed.

Ground control is now **measured with uncertainty**, not fixed at synthetic truth. A selected horizontal GCP sigma and 1.5× vertical sigma govern noisy XYZ observations. Camera position priors can be off, standard GNSS (1.5/1.5/2.5 m), or illustrative RTK (4/4/7 cm). No attitude priors are supplied. Image residuals stay in pixels; survey constraints are scaled by `max(image noise sigma, 0.25 px) / survey sigma`, equivalent to a common-normalized weighted objective. Huber loss applies only to image-vector norms; GCP/GNSS constraints are Gaussian. Finite-difference Jacobians and damped dense normal equations produce genuine accept/reject LM steps. The graph plots actual raw per-coordinate pixel RMS, not a synthetic convergence curve.

Four purple checkpoints have both image measurements and XYZ excluded from adjustment unknowns/objective. Their coordinates are independently intersected after each step; X/Y/Z RMSE is evaluated against synthetic survey truth. Invalid/low-coverage intersections are not reported as valid checkpoints. Tie truth RMSE is a separate in-sample evaluation and excludes unsupported points. The selected track shows actual maximum ray angle and closest-ray intersection RMS; low parallax can undermine height even with small pixel residuals.

Without control or position priors, one estimated camera pose and another baseline coordinate remove seven arbitrary similarity freedoms. They are not fixed at true camera poses. Collinear-only control without navigation leaves a defective absolute datum; absolute metrics are suppressed. Camera priors can supply datum constraints even when GCPs are absent. Neither equation surplus nor a small residual certifies rank or accuracy. The 25-step run limit is not a convergence certificate. Terrain is synthetic context, not a surface reconstructed by this sparse adjustment.

## Aerial triangulation

Route: `?simulation=aerial-triangulation`; the old `games/aerial-triangulation/` URL redirects here. The catalogue now uses this native route.

The flight-block, image-measurement, adjustment and QA stages share the weighted aerial solver above. GCP/check image measurements are premeasured. Learners select a physical track and click its location in multiple images: the actual clicked pixels enter the adjustment, not the nearest generated feature's location. One-image ties remain excluded until a second observation exists. A keyboard-accessible “measure selected detected track” fills the generated noisy centroids; “populate synthetic tracks” fills all correspondences. Those are explicit teaching shortcuts, not actual feature descriptor extraction. Editing measurements or survey settings invalidates the fit.

## Structure from motion

Route: `?simulation=sfm`.

Before a seed is solved, the main panel displays the two input images and an explicit "Reconstruct seed pair" action rather than an unexplained empty 3D viewport. This action prepares synthetic tracks and runs the same image-based seed solver as the staged controls. Only a successful solution opens the 3D reconstruction, which fits its view to the recovered geometry as cameras are registered. Resetting or changing inputs restores the image-evidence state; failed initialization shows its reason without substituting known scene coordinates.

The former perfect-reference-camera/near-truth-pose initialization is no longer used. Reconstruction functions take only pixel correspondences and known interior calibration, never synthetic camera positions, terrain coordinates, GCPs or checkpoint truth. Features/correspondence IDs are procedurally generated; this is not SIFT/ORB or descriptor matching on real photographs.

1. Undistort/normalize image coordinates; estimate an essential matrix using 160 seeded eight-point RANSAC trials and a 2 px Sampson gate. Hartley normalization improves conditioning. A symmetric eigensolver and 3 × 3 singular-vector construction impose equal nonzero singular values and rank two. A consensus refit is retained only if it does not reduce the inlier count.
2. Test four relative-pose decompositions. Keep positive-depth ray intersections with at least 0.5° parallax. Insufficient consensus or degenerate seed pairs report failure; there is no truth-pose fallback. This is not a minimal five-point implementation or a complete homography/essential model-selection pipeline.
3. Register an additional camera from six or more 2D–3D correspondences using calibrated DLT followed by robust nonlinear pose refinement and a 4 px inlier check. This is **not RANSAC PnP**. Triangulate more supported tracks, reject invalid depth/low parallax, and refine the joint registered image network.
4. Bundle refinement fixes one recovered pose plus another baseline coordinate to remove the relative gauge. The seed baseline scale is arbitrary, not measured metres. The UI reports image RMS and sparse structure only, never a fabricated dense mesh or absolute map accuracy.

Low parallax, near-planarity, mismatches and noise can block camera registration. Production sparse solving, dense stereo, meshing, full calibration, image radiometry, rolling shutter and covariance propagation are outside scope. These are inspectable numerical teaching models, not survey deliverables. The earlier small exact-control fixture remains in `createBundle` for numerical backwards-regression tests; the active aerial UI uses `createAerialSurvey`.

## How a camera works — 3D

Route: `?simulation=camera-working`; a new photogrammetry catalogue card links to it.

Four stages cover anatomy, focus/aperture, exposure/readout and calibration. The camera now has a rounded housing, grip, viewfinder, lens mount, ribbed barrel, glass groups, iris, shutter blades, rear electronics and an image-textured sensor. Cutaway mode removes the near shell and roof. **The sensor stays fixed; focusing translates the equivalent lens principal plane.** Orbit the camera or use reset, top and close-up views; component buttons provide a keyboard-accessible equivalent to mesh selection.

All optical calculations use millimetres, with scene distances converted from metres:

- `v = fu/(u−f)`; sensor distance `s = f u_focus/(u_focus−f)`.
- Entrance pupil `D = f/N`. Rays from a sampled pupil ring converge to the inverted image. A sensor-plane ray coordinate is `h + (−v H/u − h)s/v`.
- Geometric defocus diameter is `D |s−v|/v`. The diffraction readout is the paraxial Airy first-zero diameter `2.44 λ N_eff`, with `λ = 550 nm` and image-space `N_eff = s/D`.
- Sensor width is 36 or 23.5 mm, aspect 3:2, and resolution is 6000 pixels across. Pixel pitch is sensor width divided by 6000. FOV is `2 atan(sensor width/(2s))`.
- The displayed output-brightness index is proportional to `t · ISO/N²`. The rendered sensor additionally models finite-conjugate pupil geometry, pixel area and relative scene EV when collecting charge. Its illustrative reference is 14,000 electrons for unit linear radiance at EV12, a 6 µm pixel, 1/125 s and image-space f/4. **ISO is absent from collected charge:** it changes gain after collection.
- Lateral scene motion gives `V s/u` image speed. Multiply by exposure time or top-to-bottom row delay, then divide by pixel pitch, for motion blur or rolling-row displacement. Each rendered layer uses its own depth; five temporal samples per image row integrate the exposure with row-centred delay `(row−0.5) · readoutTime`. Zero speed removes rolling distortion, and zero row delay gives a global-timing approximation.
- Calibration uses a dimensionless radial coefficient on focal-normalised coordinates: `[x′,y′] = [x,y](1+k₁r²)`. Higher-order/tangential terms are omitted. Calibration-grid deformation illustrates this mapping, not compound-lens surface tracing.

The foreground ball is at 0.65 times the focus-target distance, the colour/check target is at the declared object distance, and the textured background is at 1.7 times that distance. The same scene descriptions supply the 3D planes and the image renderer. Each layer has its own projected size and blur; the render composites them back-to-front rather than globally blurring one arrow. The defocus Gaussian has coordinate sigma equal to disc diameter/4; diffraction is a central-lobe Gaussian approximation. Blur halos and occlusion at depth boundaries are approximate, not a multi-surface optical ray trace.

The sensor model applies Poisson noise below 25 expected electrons and a Gaussian shot-noise approximation above it, 3 e⁻ Gaussian read noise, 20,000 e⁻ full-well clipping, ISO gain and 12-bit ADC clipping/quantisation. Display uses an sRGB transfer. These are declared teaching constants, not measured camera specifications. Scene illumination and noise can be changed separately. A clipping readout counts displayed pixels with any saturated channel. RGB channels approximate a colour response; the representative RGGB overlay explains a CFA but this is not a full demosaicing simulation. Display pixels sample representative native photosites, not a full 6000-column exposure or a rigorous downsampling/noise process.

The sensor texture remains inverted. The main preview can show an upright processed orientation or the inverted sensor view. Closing the inspection shutter removes incoming charge and shows a dark/read-noise frame; a capture opens it for the exposure. A capture retains the sampled image and its settings, independent of subsequent changes to live controls. The preview reveals sampled rows progressively; users can switch between the retained frame and live view. The 3D sensor continues to show the live optical setup. Readout animation is slowed to 1.2 s without altering the numerical exposure/row timing. The radial inverse is bounded to the monotone calibrated field so peripheral unsupported rays go dark rather than folding.

Object space is compressed separately from camera space so metres and millimetres can be inspected together. Pupil, sensor and equivalent principal-plane translation share a transverse/axial camera scale; housing details and glass thickness are anatomical, not a production lens prescription. Exact compound optics, aberrations, wavelength-dependent response, calibrated radiometry, correlated sensor noise, full Bayer reconstruction and JPEG processing remain outside scope.

Further study: Hecht, *Optics*; Hartley & Zisserman, *Multiple View Geometry*; Szeliski, *Computer Vision*; Triggs et al. (2000), *Bundle Adjustment — A Modern Synthesis*; EMVA 1288. These references are not a claim of external peer review.

## Verification

`npm run test:photo` includes the legacy optics/bundle regressions plus aerial tests for distorted backprojection, visibility/occlusion, weighted control, independent checkpoints, robust adjustment, focal/radial recovery, gauge constraints, essential geometry, and noiseless/noisy incremental SfM. SfM tests verify recovery up to its unobservable similarity gauge and successful registration without oracle outlier flags. `npm run test:lidar` covers existing LiDAR models; `npm run build` checks integration.

Production browser checks exercise both routes, real solver steps, datum warnings, component selection, focus/refocus, calibration, capture/readout and the new catalogue card. Both labs are checked at 320, 390, 768, 1024, 1440 and 1920 px widths. WebGL must render successfully; a readable fallback preserves controls and explanations when 3D is unavailable.

`npm run test:aerial:browser` additionally exercises bundle, SfM and aerial triangulation at those six widths. It verifies actual weighted RMS/checkpoint improvement, all six image-estimated SfM camera registrations, state invalidation, one-ray tie exclusion/two-ray activation, centroid measurement, full synthetic-track adjustment and the legacy AT URL redirect. It saves inspection screenshots in `/tmp`. The same `PHOTO_BASE_URL` and `PHOTO_CDP_URL` overrides apply.

To repeat the browser checks, build and serve with `npm run preview` on port 4173, start a WebGL-capable Chromium with local remote debugging on port 9222, then run `npm run test:photo:browser`. `PHOTO_BASE_URL` and `PHOTO_CDP_URL` override those defaults. The script opens its own test tab and saves inspection screenshots under `/tmp`.
