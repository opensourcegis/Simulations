# IMU and LiDAR trajectory laboratories

Two native React catalogue cards link to `?simulation=imu` and `?simulation=sbet-trajectory`. Both have orbitable 3D scenes, pause/reset/scrub controls beside the scene, live numerical readouts, a worked explanation, a knowledge check, a model-limit notebook and responsive layouts. They reuse the existing viewer, field assets and calibrated survey mounting defaults. Catalogue previews are static WebP files, not live renderers.

## Inside an IMU

`imu-model.js` is a deterministic 100 Hz sensor experiment. Navigation coordinates are East/North/Up, body coordinates are Forward/Left/Up and quaternions rotate body into navigation. Gravity is `[0, 0, −9.80665]` m/s². The acceleration input is true world translation; the accelerometer output is **specific force**, `f = Rᵀ(a − g) + bias + noise`. Gyros provide body angular rates, not Euler angle derivatives or absolute heading.

Presets isolate rest, constant velocity, fixed tilt, horizontal acceleration, world-vertical rotation and ideal free fall. World-vertical rotation is transformed into the tilted body gyro channels. The instrument-centred view does not simulate platform translation or the altitude of a falling body. One g at rest and zero specific force in ideal free fall are numerical results, not canned indicator states.

The cutaway shows a representative suspended proof mass, electrodes, flexures and paired gyro drive masses. The accelerometer mass moves opposite ideal specific force; gyro sense motion changes sign with the true body-Z rate and drive velocity. Springs follow their moving attachment points. Electronic bias/noise changes measurements and attitude integration, not the physical mass displacement. MEMS motion is amplified; the drive is slowed to 2 visible cycles/s. The view is explanatory geometry, not a device CAD model or a resonant electromechanical solver.

Two actual quaternion integrations are compared. Gyro-only propagation starts with a deliberate 5° tilt error. A complementary estimator additionally uses a cross-product gravity correction (gain 1.7 s⁻¹, force-norm gate 0.7–1.3g). It can converge at rest, cannot determine yaw, and produces false tilt under sustained horizontal acceleration. It is explicitly **not** called a Kalman filter. A separate 200-sample held-still calibration estimates gyro bias from zero-rate measurements; it does not subtract the generator's known bias. Accelerometer bias is not calibrated here.

## GNSS/IMU Kalman filter and SBET-style output

`trajectory-model.js` generates a 60-second flight with an excited, gently turning 3D trajectory. At 50 Hz it mechanizes position, velocity and quaternion attitude using interval-specific force and angular rate. The discrete truth uses the same midpoint/trapezoid convention, allowing an exactly aligned, zero-bias case to be tested without integration-formula mismatch. Sensor and GNSS noise generators are independent: changing outage availability leaves the IMU series and underlying flight unchanged.

Initial position is an antenna fix translated with the initially aligned attitude; initial velocity represents noisy GNSS/Doppler alignment. Attitude starts with small tilt and a 1° heading error. Bias estimates start at zero. This is externally initialized INS, not an unaided global attitude/alignment solution. Following initialization, true positions, attitudes and biases are never injected into the estimator.

The **15-state multiplicative error-state Kalman filter** estimates `[δp, δv, δθ, δbₐ, δbɡ]`. Prediction propagates `P⁻ = F P⁺ Fᵀ + Q`, with the attitude-to-acceleration and bias couplings. GNSS antenna positions use `h = pIMU + R lGNSS`, including the attitude Jacobian of the lever arm. Corrections use an actual Kalman gain, a Joseph covariance update and a small-angle attitude-error reset. The optional gate rejects NIS above 16.27 (three-dimensional χ², about 99.9%). A configured 30 m East error at 46 s tests this gate; no oracle outlier flag is supplied to it.

The **extended Rauch–Tung–Striebel smoother** performs a backward covariance-weighted recursion in quaternion error coordinates, not a moving average or truth interpolation. It is explicitly offline and may use later evidence. Forward estimates cannot. The worked update displays an actual recorded innovation vector, East gain row, applied position correction and before/after uncertainty. Buttons beside playback step to the next available GNSS observation, mid-outage or GNSS return.

Covariance is model-dependent uncertainty, not an error measurement. The chart compares signed East truth errors with the forward marginal ±1σ. The wire glyph shows marginal 2σ coordinate axes without the cross-covariance tilt; it is not labelled a joint 95% confidence region. Default seeded summary metrics demonstrate this experiment, not a universal accuracy claim. Unobservable or poorly excited bias/attitude components are not guaranteed to converge.

### LiDAR integration

Each shot stores a time, a body-frame unit direction, and one physical range to the zero-height terrain plane. The endpoint is `pIMU(t) + R(t) [lscanner + range · direction]`. Both estimated and reference endpoints use that same range; an incorrect endpoint is not forced back to terrain. The origin is the IMU, not the GNSS antenna. Position/velocity interpolate linearly; attitude uses quaternion SLERP. Timestamp mismatch and omitted scanner lever arm affect laser reconstruction without refitting navigation. Queries outside the trajectory interval are rejected rather than extrapolated.

The view is in physical scale (internally 0.08 scene units/metre); equipment is intentionally small in the 500 m overview. “Inspect current payload” pauses playback and moves to the physical-size vehicle. The full trajectory/error history is visible; playback inspects that recorded offline experiment. The flat-ground lesson does not place opaque buildings on top of an intersection model that ignores them.

### Export conventions

SBET is an output trajectory/record convention, not the name of a filter. The download is a **10 Hz, 17-column teaching CSV**, not an Applanix-compatible binary file. Columns use synthetic seconds-of-week (start 250000), approximate WGS84 latitude/longitude in radians, ellipsoid height, NED velocity, FRD roll/pitch/heading (clockwise from North), zero wander angle, gravity-removed body linear acceleration and body angular rate. No UTC/leap-second conversion is made. The local origin is 12.97° N, 77.59° E, 800 m ellipsoid height; the short-range geodetic conversion uses fixed WGS84 curvature radii. Vendor definitions must be checked before reading or writing a production SBET file. Biases and covariances are not part of the basic 17-value record.

### Explicit scope limits

This is loosely coupled position aiding, not raw GNSS pseudorange/carrier processing. Earth rotation, transport rate, geoid/orthometric height, integer ambiguity resolution, satellite geometry, multipath, thermal/scale/cross-axis errors and full coning/sculling are omitted. Gravity is constant and the scanner runs at a reduced 0.8 Hz teaching sweep rate. The covariance transition and extended smoother are first-order local approximations, not a production trajectory processor. The full filter and sensor constants are stated in each notebook.

## Verification

```sh
npm run test:navigation
npm run test:thumbnails
npm run test:lidar
npm run test:photo
npm run build
npm run test:navigation:browser
npm run test:catalogue:browser
```

Numerical tests cover force/rotation conventions, quaternion interpolation, one g/zero g, calibration, false gravity tilt, seeded repeatability, causal forward estimates, independent sensor streams, GNSS mounting, actual gain/correction algebra, Joseph covariance, gate rejection, covariance growth/recovery, full sampled covariance positive-definiteness, backward smoothing, ideal strapdown propagation, common-range laser geometry, timing, lever omissions and export conventions.

Browser checks use an existing Chromium CDP endpoint (`PHOTO_CDP_URL`, default `http://localhost:9222`) against the production preview (`PHOTO_BASE_URL`, default `http://localhost:4173/Simulations/`). They verify all controls, six widths, model-driven readouts, recorded correction behavior, CSV contents and no runtime exceptions. Inspection screenshots are saved under `/tmp`.

References: Titterton & Weston, *Strapdown Inertial Navigation Technology*; Groves, *Principles of GNSS, Inertial, and Multisensor Integrated Navigation Systems*; Särkkä, *Bayesian Filtering and Smoothing*; Rauch, Tung & Striebel (1965).
