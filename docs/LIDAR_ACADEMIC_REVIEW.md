# LiDAR teaching review

Audience: undergraduate surveying, geomatics and remote-sensing learners, with progressive experiments that also support classroom demonstration. These applications are explicit teaching models, not instrument specifications or production geospatial processing tools.

## Learning sequence

1. **Ranging:** observable → equation → ambiguity and uncertainty.
2. **Scan geometry:** angular steering + platform motion → spatial sampling.
3. **Target interaction:** energy balance → directional collection → detected waveform peaks.
4. **Footprint:** beam propagation + local incidence → illuminated area.
5. **Georeferencing:** measured range + direction + position, attitude and calibration → a mapped point.
6. **TIN filtering:** local surface hypotheses → insertion tests → evaluated ground classification.

Each lesson includes a learning objective, a three-step working principle, three reproducible experiments, a live worked example, an explanatory self-check, assumptions and further-reading links. Learners select an experiment, make a prediction, apply its settings, inspect the visual/readouts, then reveal the explanation. Shared content serves both React and standalone pages. A navigation strip connects the six lessons.

## Scientific corrections

| Lesson | Earlier issue | Correction |
| --- | --- | --- |
| Ranging | Range appeared before echo detection; old measurements survived target changes. | Distinguish the running clock from a detected measurement; invalidate measurements when the target changes. |
| Ranging | `cτ/2` was an absolute minimum separation/accuracy claim; PRF limits could not be reached with available controls. | Describe a characteristic pulse-limited scale, separate resolution/precision/accuracy, and provide a reproducible untagged-pulse ambiguity case. |
| AMCW | Modulo phase and modulation-vs-optical wavelength were insufficiently explicit; tone precision was asserted without a noise assumption. | Declare modulo phase, integer cycles and AMCW scope; label the illustrative ±3° phase bound. Keep the coarsest interval larger than the entire scene, including its endpoint. |
| Scanning | Polygon ground spacing was called uniform; fixed-frequency Risley scanning was called non-repeating. | Explain `H tan θ` and `H sec²θ`; identify the fixed 18/−28 Hz model's 0.5 s repetition. Qualify sample-rate, clipping, terrain and sensor-comparison limitations. |
| Interaction | Reflection and scattering were ambiguously counted as independent channels; only scattering was said to return. | Split reflected energy into diffuse and specular components. Both can reach the receiver. Declare heuristic material/BRDF/detection models. |
| Interaction | Reference target attenuation was not normalised consistently; first/last readouts used physical interceptions while the return count used detected peaks. | Reference is exactly 100% at its reference settings. Use detected peaks consistently in the tree, waveform, statistics and scan; distinguish physical contributions with hollow markers. Gaussian FWHM defaults to 10 ns and can be varied from 2–20 ns to demonstrate peak merging. |
| Interaction | Surface echo position was fixed despite changing range; plotted detection threshold did not share the echo's amplitude scale. | Fixed 0–3000 ns round-trip axis, numerical delay, fixed RX gain and consistent 3% threshold, with explicit TX scale and display clipping. |
| Canopy | Contributions were discarded before waveform summation, detection used inconsistent cutoffs, and foliage changes left stale scan points. | Sum every contribution before one thresholded peak detector; use a fixed amplitude scale and show its threshold. Clear scans when attenuation, season or pulse width changes; model the trunk as opaque. |
| Canopy | Last returns and a fixed ground-hit percentage were treated as sufficient for a DTM. | Return order is not class; ground classification, spatial support and interpolation are required. Synthetic ground-identification uses scene knowledge, not a field classifier. |
| Footprint | Charts omitted exit diameter although readouts included it; area equation omitted its validity condition; 3D footprint diameter was doubled. | Charts and readouts share one geometry function. Use `A = π(d₀ + Hγ/cosθ)²/(4cosθ)`; `cos⁻³θ` needs negligible `d₀`. Align 3D ring/disc/cone diameters and use the true nadir reference diameter. |
| Boresight | Attitude was described as cancelling a real ray toward nadir; error compared different ground intersections. | Calibrated and uncalibrated endpoints use the same measured range and attitude. Include off-axis rays to reveal yaw, horizontal/vertical errors, frame conventions, and invalid ground intersections. |
| TIN | Insertion angle was terrain slope relative to horizontal; distance was vertical. | Use perpendicular distance and segment-to-facet-plane insertion angle. Coplanar ground has zero angle even on a steep slope. |
| TIN | Rendered triangles lagged insertions; profile joined nearby samples rather than intersecting facets. | Rebuild triangles after each batch; slice actual facets and project perpendicular-distance offset planes correctly into the profile. |
| TIN | Overall accuracy alone and unqualified convergence could mislead. | Add ground precision/recall, identify synthetic reference labels, distinguish candidates from accepted ground, and report iteration limits explicitly. Add keyboard/touch point inspection and a final-state shortcut. |
| Catalogue | Ground-penetrating radar appeared under LiDAR. | Classify GPR under Radar. |

## Remaining deliberate simplifications

- Light speed uses the vacuum value as an air approximation. Refractive-index corrections and actual timing/phase noise are not simulated.
- Ranging animations are slowed and pulse shapes enlarged for visibility. Multi-frequency windows illustrate cycle selection and assumed phase sensitivity; they are not a noisy estimator or an accuracy certification.
- Footprints use small full-angle geometric divergence, not Gaussian beam propagation. Incidence uses a horizontal plane. Energy per area is not received intensity.
- Scanning optics and sample rates are schematic. Ground point placement does not solve occlusion against a complete 3D scene. Mechanism comparisons are not equal-specification sensor benchmarks.
- Material coefficients, specular lobes and thresholds are illustrative, not measured spectra or a calibrated radiometric sensor model. Canopy attenuation is relative, not a recovered leaf-area index.
- Boresight geometry assumes exact range, GNSS/IMU observations and rigid mounting on flat terrain. It omits timing offsets, antenna phase-centre variation and mounting flexure.
- TIN densification is inspired by Axelsson, but uses fixed thresholds, extra boundary anchors, small display batches and a finite iteration cap. It does not reproduce every adaptive control of the original algorithm. It does not repair low outliers or guarantee valid seeds. Ground-truth labels affect evaluation only.

## Validation

`npm run test:lidar` uses Node's built-in test runner without adding dependencies. It checks units, time-of-flight, phase wrapping and reconstruction, PRF boundary behaviour, divergence and oblique geometry, TIN insertion/slicing, boresight observability and same-range endpoints, invalid geometry, energy conservation and reference/signal scaling. Run `npm run build` for production integration.

Beam–target regression tests additionally check ground peaks at the sampling boundary, pulse-width-dependent merging, subthreshold echoes, summation before detection and first-to-last peak order. Pulse-width comparisons hold contribution peak amplitude fixed, not integrated energy; they demonstrate resolution rather than full radiometric changes to a sensor. Dense/leaf-off/outside-crown presets support controlled comparisons. Pause/play respects the initial reduced-motion preference, and sliders have associated labels.

Browser validation should exercise all three experiments, self-check feedback and narrow-screen layouts in each of the six lessons. It should additionally fire a pulse and change its target, inspect a final TIN point, compare yaw at nadir/off-axis, and check waveform return readouts after changing canopy attenuation.

## Further reading

- NOAA, *Lidar 101: An Introduction to Lidar Technology, Data, and Applications*: https://coast.noaa.gov/data/digitalcoast/pdf/lidar-101.pdf
- USGS, *Lidar Base Specification*: https://www.usgs.gov/ngp-standards-and-specifications/lidar-base-specification-online
- Axelsson (2000), *DEM generation from laser scanner data using adaptive TIN models*, ISPRS proceedings: https://www.isprs.org/proceedings/XXXIII/congress/part4/111_XXXIII-part4.pdf

These are further-reading references, not a claim of independent academic peer review. External PDF retrieval was denied by this environment's network policy during the review; document contents and link availability were not reverified here. The implemented equations and numerical relationships are checked by the local regression tests.
