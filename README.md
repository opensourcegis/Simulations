# Simulation-based Training for Surveyors

React + Vite landing page for browser-based survey training simulators.

The catalogue contains 23 unique laboratories: 20 React simulations and three standalone HTML lessons under `games/`. Legacy scanning/aerial/ortho URLs remain supported. The Vite build copies standalone assets and the locally installed Leaflet library into `dist/games/`; the planner does not depend on an external JavaScript CDN.

## Local development

```powershell
npm install
npm run dev
```

To verify the production output:

```powershell
npm run build
npm run preview
```

## GitHub Pages deployment

The repository includes `.github/workflows/deploy-pages.yml`. Every push to `react` builds the Vite app, uploads `dist/` as a Pages artifact, and deploys it with GitHub Actions. The workflow can also be run manually. Push source changes to `react` to trigger automatic deployment; a push to `main` alone does not trigger it. The existing `gh-pages` branch is legacy deployment output and is not updated by this workflow.

This workflow requires **Settings → Pages → Build and deployment → Source** to be set to **GitHub Actions**. If it still uses **Deploy from a branch**, update the setting to use this artifact-based workflow. After a successful deployment, the project URL is:

`https://opensourcegis.github.io/Simulations/`

The Vite base path is configured as `/Simulations/`, matching this repository's GitHub Pages project URL.

## LiDAR learning modules

The six LiDAR lessons include working principles, guided experiments, live calculations and self-check questions. See [the academic teaching review](docs/LIDAR_ACADEMIC_REVIEW.md) for the scientific corrections, conventions and model limits. Shared teaching content and numerical models live under `games/shared/` and serve both React and standalone pages.

## Photogrammetry laboratories

Bundle Block Adjustment now solves actual noisy image observations with a small Levenberg–Marquardt bundle, robust fitting, datum warnings and withheld checkpoints. **How a Camera Works — 3D** adds an orbitable cutaway covering lens focus, aperture, shutter, sensor, exposure/readout and calibration. See [models and verification](docs/PHOTOGRAMMETRY_LABS.md) and run `npm run test:photo` for numerical checks.

Run numerical regression checks with `npm run test:lidar` and `npm run test:photo`, and verify production integration with `npm run build`.

## Teaching objectives and reliability

See the [whole-catalogue teaching review](docs/SIMULATION_TEACHING_REVIEW.md) for the objective, observable evidence and model limits of every lab. `npm test` runs all numerical regressions; `npm run test:all:browser` checks every catalogue entry, and `npm run test:principles:browser` exercises the older lessons and offline planner. GNSS distinguishes a conditional supplied-integer solution from real RTK ambiguity estimation. The incomplete duplicate React ortho preview now opens the working original lesson.

## Catalogue thumbnails

Every card uses a locally hosted 3D-rendered WebP preview with responsive sizes and descriptive alternative text. See [preview artwork and regeneration](docs/CATALOGUE_THUMBNAILS.md). Run `npm run test:thumbnails` and `npm run test:catalogue:browser` to check assets and catalogue behavior; no thumbnail rendering step is needed for deployment.

## Inertial navigation and LiDAR trajectories

**Inside an IMU — 3D** (`?simulation=imu`) demonstrates specific force, vibrating gyro operation, attitude integration, gravity aiding, bias and stationary calibration. **SBET Trajectory & Kalman Filter** (`?simulation=sbet-trajectory`) adds a 15-state GNSS/IMU error-state filter, covariance/innovation inspection, GNSS outages, outlier rejection, backward RTS smoothing, time-tagged LiDAR endpoints and a clearly labelled teaching CSV export. See [models, conventions and checks](docs/INERTIAL_NAVIGATION_LABS.md). Run `npm run test:navigation` and `npm run test:navigation:browser`.

## Least-squares adjustment

**Least-Squares Adjustment** (`?simulation=least-squares`) is a worked numerical lab for weighted means, levelling networks, correlated GNSS baselines and iterative code positioning. Edit observations and inspect numeric substitutions, A/w/Σ/P, row-by-row normal-equation products, corrections, residuals, datum rank, covariance and quality tests. See [mathematics, scope and verification](docs/LEAST_SQUARES_LAB.md). Run `npm run test:adjustment` and `npm run test:adjustment:browser`.
