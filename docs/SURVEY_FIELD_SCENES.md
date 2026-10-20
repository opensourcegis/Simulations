# Survey field views

The TIN, boresight/lever-arm and GSD labs use `SurveyViewport` for their main perspective views. Analytical views use the same numerical observations. The teaching-stage and event-trace contract is documented in `SURVEY_TEACHING.md`.

## Physical context versus observations

- TIN context uses the actual `tinTerrainHeight` function and the generated building/tree footprints. It is a synthetic reference site, **not** a surface reconstructed from the returns. The returns view contains only the generated measured points. Recovered terrain uses accepted, supported TIN facets; it does not fill unsupported holes with the reference surface. Heights are not exaggerated.
- Direct georeferencing uses the recorded range for both measured and reconstructed endpoints, without re-intersecting an erroneous endpoint with the ground. Mount inputs use forward/left/up; the labelled body/scanner triads use forward/right/down and NED Euler angles. All teaching views share one observation. The ground inset auto-fits an explicitly metred local map; the perspective view is not exaggerated.
- GSD uses the same sloping plane, optical centre, tilt, full-image corner rays and selected-pixel ray as the numerical model. The target has its declared physical size and subpixel phase on the terrain tangent. The 9 × 7 grid is an optional grouping guide, not individual photosites. The native target crop remains numerically sampled; the procedural field texture is **not** an optical-resolution test image.

## Rendering

`survey-field-assets.js` builds deterministic, locally generated materials and physically dimensioned representative equipment: carbon-composite frame, motors, stationary propellers, landing skids, GNSS radome, IMU, LiDAR optical window, or camera lens. These are representative synthetic assets, not a manufacturer-specific engineering model or a photogrammetric scan. Terrain texture is illustrative land cover, not measured imagery or semantic evidence available to a solver. Trees are representative foliage inside the supplied canopy dimensions, not reconstructed individual leaves.

Lighting uses a directional sun, hemisphere fill, environment reflections, tone mapping, atmospheric haze and cached shadow maps. Camera presets provide equipment and field context without enlarging aircraft or targets. Orbit and zoom remain manual; no aircraft, instrument or scanner spins for visual effect. View targets follow height changes while preserving the user's orbit. Rendering pauses off screen, device pixel ratio is bounded, and static physical context is retained across analytical updates. Geometry, instancing buffers, materials and textures are disposed when replaced.

These changes improve spatial and material realism; they do not constitute photorealistic scanned assets, flight dynamics, full vegetation radiative transfer, or manufacturer validation.

## Verification

`npm run build`, `npm run test:lidar` and `npm run test:photo` check the build and numerical models. With the preview server and Chromium CDP running, `npm run test:survey:browser` exercises perspective-view presets, TIN context/returns/surface modes, the 2D/3D transition, six viewport widths, and the existing survey experiments. Aerial and ranging browser regressions cover the other consumers of the shared scene utilities.
