# Photogrammetry teaching laboratories

## Bundle block adjustment

Route: `?simulation=block-adjustment`.

This lab replaces heuristic observation counts, fixed “minimum GCP” rules and an invented exponential convergence curve with a small real nonlinear least-squares problem.

- Six synthetic cameras observe a 5 × 5 ground network with relief. The image is 1600 × 1200 px; the reference focal length is 1500 px. Image bounds determine visibility. Baselines, strip separation, Gaussian image noise and gross image errors are controllable.
- Each adjustable camera has three centre coordinates and three orientation angles. Tie points have three unknown coordinates. Exact GCP XYZ are excluded from the unknowns. Optional self-calibration estimates **one shared focal length**, not a full distortion model.
- Projection uses a right-handed world with Z up and a nadir base camera with X right, Y down and Z forward. World-to-camera coordinates are `Rᵀ [X−Xc, −(Y−Yc), Zc−Z]`; pixel projection is `[800 + f qx/qz, 600 + f qy/qz]`.
- Finite-difference Jacobians form damped normal equations. Levenberg–Marquardt trial steps are accepted only when the selected objective decreases. Huber weighting uses each image residual pair's radial norm. Reported image RMS is unweighted and per coordinate; robust fitting may improve object coordinates without minimising that RMS.
- Three distributed non-collinear GCPs anchor a similarity datum in the demonstrated connected block, but their number does not guarantee good conditioning or full observability. Three **collinear** GCPs leave rotation about the control line unobservable. Without GCPs, the initial first camera pose and one baseline coordinate fix a seven-parameter **relative** datum. Absolute error metrics are not displayed for either defective absolute datum.
- Three checkpoints have their image observations excluded from adjustment. After each iteration, ray intersection using the estimated cameras estimates checkpoint XYZ; these are compared with known synthetic reference positions. Checkpoint images may also contain injected errors. Tie-point reference error is a separate synthetic-truth metric, not an independent accuracy certificate.
- Parallel nadir views can leave focal length and flying height strongly correlated. The optional focal estimate can be biased while residuals remain small. The UI warns about this rather than reporting a universal solvability rule.

The orbitable 3D view shows actual estimated cameras and points. Its rays, image residual vectors and iteration graph derive from the same current solution. Residual vectors can be magnified for inspection; the magnification is labelled. A run is capped at 25 iterations, not declared converged solely because the cap was reached.

Deliberate limits: exact correspondences and control, no occlusion, no GNSS/IMU priors, no distortion or GCP covariance, no sparse Schur-complement solver, no covariance/condition-number certificate. These are teaching data, not a survey deliverable.

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

`npm run test:photo` checks projection/back-ray consistency, seeded observations, exact control, held-out checkpoints, real noiseless/noisy adjustment convergence, robust fitting, the relative datum, visibility-driven counts, thin-lens focus and pupil-ray intersections, defocus/diffraction trade-offs, exposure gain, independent motion/readout effects and radial distortion. `npm run test:lidar` covers existing LiDAR models; `npm run build` checks integration.

Production browser checks exercise both routes, real solver steps, datum warnings, component selection, focus/refocus, calibration, capture/readout and the new catalogue card. Both labs are checked at 320, 390, 768, 1024, 1440 and 1920 px widths. WebGL must render successfully; a readable fallback preserves controls and explanations when 3D is unavailable.

To repeat the browser checks, build and serve with `npm run preview` on port 4173, start a WebGL-capable Chromium with local remote debugging on port 9222, then run `npm run test:photo:browser`. `PHOTO_BASE_URL` and `PHOTO_CDP_URL` override those defaults. The script opens its own test tab and saves inspection screenshots under `/tmp`.
