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

Four stages cover anatomy, focus/aperture, exposure/readout and calibration. Orbit the cutaway or use reset, top and close-up views. Mesh picking and equivalent component buttons identify the lens, entrance pupil, shutter, image sensor, Bayer CFA, readout/processor and body.

All optical calculations use millimetres, with scene distances converted from metres:

- `v = fu/(u−f)`; sensor distance `s = f u_focus/(u_focus−f)`.
- Entrance pupil `D = f/N`. Rays from a sampled pupil ring converge to the inverted image. A sensor-plane ray coordinate is `h + (−v H/u − h)s/v`.
- Geometric defocus diameter is `D |s−v|/v`. The diffraction readout is the paraxial Airy first-zero diameter `2.44 λ N_eff`, with `λ = 550 nm` and image-space `N_eff = s/D`.
- Sensor width is 36 or 23.5 mm, aspect 3:2, and resolution is 6000 pixels across. Pixel pitch is sensor width divided by 6000. FOV is `2 atan(sensor width/(2s))`.
- The output-brightness index is proportional to `t · ISO/N²`, with constant illumination/transmission. It is not a calibrated radiometric or electron-count model and omits finite-conjugate exposure compensation. ISO does not add incoming photons.
- Lateral scene motion gives `V s/u` image speed. Multiply by exposure time or top-to-bottom row delay, then divide by pixel pitch, for motion blur or rolling-row displacement respectively. Exposure motion blur is illustrated in the preview; rolling displacement is a numerical readout, not a rendered shear.
- Calibration uses a dimensionless radial coefficient on focal-normalised coordinates: `[x′,y′] = [x,y](1+k₁r²)`. Higher-order/tangential terms are omitted. Calibration-grid deformation illustrates this mapping, not compound-lens surface tracing.

The view exaggerates object distance, object height, body dimensions and glass thickness so internal components can be inspected. Pupil and sensor dimensions share a transverse scale. Labels/intersection markers are schematic. The sensor preview is inverted; blur is an illustrative Gaussian combining defocus and diffraction scales, not a physical PSF. Readout animation is slowed to 1.2 s and does not alter the stated exposure/row times. The preview remains live, not a stored RAW capture.

The notebook explains—but does not quantitatively simulate—compound optics and aberrations, microlenses, quantum efficiency, photon/read noise, saturation, ADC, demosaicing, white balance, tone mapping and compression. Further study: Hecht, *Optics*; Hartley & Zisserman, *Multiple View Geometry*; Szeliski, *Computer Vision*; Triggs et al. (2000), *Bundle Adjustment — A Modern Synthesis*; EMVA 1288. These references are not a claim of external peer review.

## Verification

`npm run test:photo` checks projection/back-ray consistency, seeded observations, exact control, held-out checkpoints, real noiseless/noisy adjustment convergence, robust fitting, the relative datum, visibility-driven counts, thin-lens focus and pupil-ray intersections, defocus/diffraction trade-offs, exposure gain, independent motion/readout effects and radial distortion. `npm run test:lidar` covers existing LiDAR models; `npm run build` checks integration.

Production browser checks exercise both routes, real solver steps, datum warnings, component selection, focus/refocus, calibration, capture/readout and the new catalogue card. Both labs are checked at 320, 390, 768, 1024, 1440 and 1920 px widths. WebGL must render successfully; a readable fallback preserves controls and explanations when 3D is unavailable.

To repeat the browser checks, build and serve with `npm run preview` on port 4173, start a WebGL-capable Chromium with local remote debugging on port 9222, then run `npm run test:photo:browser`. `PHOTO_BASE_URL` and `PHOTO_CDP_URL` override those defaults. The script opens its own test tab and saves inspection screenshots under `/tmp`.
