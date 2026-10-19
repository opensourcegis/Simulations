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

- Pulsed ranging uses a selectable air index, calibrated instrument delay and approximate timing noise. Phase ranging, the periodic-PRF example and the other lessons retain the vacuum approximation; actual phase noise is not simulated.
- Ranging animations are slowed and pulse shapes enlarged for visibility. Multi-frequency windows illustrate cycle selection and assumed phase sensitivity; they are not a noisy estimator or an accuracy certification.
- Footprints use small full-angle geometric divergence, not Gaussian beam propagation. Incidence uses a horizontal plane. Energy per area is not received intensity.
- Scanning optics and sample rates are schematic. Ground point placement does not solve occlusion against a complete 3D scene. Mechanism comparisons are not equal-specification sensor benchmarks.
- Material coefficients, specular lobes and thresholds are illustrative, not measured spectra or a calibrated radiometric sensor model. Canopy attenuation is relative, not a recovered leaf-area index.
- Boresight geometry assumes exact range, GNSS/IMU observations and rigid mounting on flat terrain. It omits timing offsets, antenna phase-centre variation and mounting flexure.
- TIN densification is inspired by Axelsson, but uses fixed thresholds, extra boundary anchors, small display batches and a finite iteration cap. It does not reproduce every adaptive control of the original algorithm. It does not repair low outliers or guarantee valid seeds. Ground-truth labels affect evaluation only.

## Validation

`npm run test:lidar` uses Node's built-in test runner without adding dependencies. It checks units, time-of-flight, phase wrapping and reconstruction, PRF boundary behaviour, divergence and oblique geometry, TIN insertion/slicing, boresight observability and same-range endpoints, invalid geometry, energy conservation and reference/signal scaling. Run `npm run build` for production integration.

Beam–target regression tests additionally check ground peaks at the sampling boundary, pulse-width-dependent merging, subthreshold echoes, summation before detection and first-to-last peak order. The current canopy model holds integrated pulse energy fixed, so a broader pulse has a lower peak. Tests also integrate the directional specular lobe over the upper hemisphere, verify the monostatic 2θ separation, two-way canopy loss, footprint bypass of an opaque trunk, pulse-energy conservation within the finite sampling window, and reproducible seeded receiver noise. Dense/leaf-off/outside-crown presets support controlled comparisons. Pause/play respects the initial reduced-motion preference, and sliders have associated labels.

## Beam–target realism model

- Surface reflection now uses an upper-hemisphere energy-normalised cosine-power lobe, rather than an arbitrary width multiplier. This is a directional energy distribution, not a measured or fully reciprocal microfacet BRDF. The receiver is 2θ from the mirror direction; smooth-target returns fall off quickly away from nadir. Material coefficients remain illustrative.
- A truncated Gaussian footprint is integrated with 21 weighted sub-rays through a **2D cross-section**, not a 3D circular footprint. Extinction adds in overlapping foliage volumes. Each sub-ray integrates backscatter in 0.1 m layers, including outgoing and returning transmission; the opaque trunk stops rays. Footprint-averaged one-way transmission controls beam brightness. Ground signal is the weighted mean of each sub-ray's squared transmission, not the square of the mean.
- Gaussian pulses keep fixed integrated energy as FWHM changes. Additive electronics/background Gaussian noise is reproducible until a new shot is fired. Noise level, footprint width and pulse width are controllable; scan samples have distinct seeds. The blue detector trace is a short moving average; raw noisy samples are grey. Peak selection uses max(0.02, 5 × raw noise RMS) and half-FWHM neighbourhood suppression. These are declared detector choices, not a universal detection or resolution limit.
- This model still omits multiple scattering, individual leaf orientation and spectra, photon shot noise, instrument bandwidth calibration, full 3D ray tracing and a calibrated atmosphere. Realistic mechanisms do not imply validated sensor performance.

## Interaction lab interface

The beam–target page has its own visual system in `games/lidar-interaction/interaction.css`, separate from the catalogue-wide theme. Desktop places target/sensor controls on the left, the scene and waveform in the centre, and energy/detector diagnostics on the right. Tablet uses two columns; mobile stacks the scene, configuration and measurements. The collapsible lab notebook retains the shared teaching content below the experiment. Environment tabs support arrow/Home/End keys; dialogs trap focus, close on Escape and return focus to their trigger. No fonts or UI dependencies are fetched externally.

Browser checks cover 320, 390, 768, 1024, 1440 and 1920 px widths, both environments, material choices, sensor scaling, noisy-shot reproducibility, scan invalidation, guided-experiment application, keyboard tabs and dialog focus. Numerical checks and the production build must pass separately.

The surface scene now fixes the sensor housing in position and orientation. Previously it orbited the impact point and rotated the enclosure with incidence, misleadingly suggesting that scanning requires the whole head to spin. The beam now steers across a horizontal target, with hit position `x = x_sensor + (y_target − y_sensor) tan θ`. This is schematic internal steering, not an optical mechanism model. Range remains an independent input and the drawing is not to scale. Browser canvas checks verify a constant housing transform and no housing rotation at 0°, 30° and 65°.

The ranging lesson uses the same instrument-lab design language with scoped CSS: method tabs; configuration and playback controls; live scene and receiver traces; expected versus detected values; and a collapsible teaching notebook. All three methods retain their equations, ambiguity explanations and assumptions. A new pulse clears the last displayed range; target/method changes also invalidate it. The AMCW wave can be paused, and its initial motion respects reduced-motion preferences. Browser checks cover all three methods at the six widths above, pulse detection/reset, periodic ambiguity, tone selection, guided experiments and keyboard tabs.

## Rangefinder components and receiver model

The interactive optical cutaway shows a fixed dual-aperture head: electrical pulse driver, 905 nm laser diode, collimating optics, optical reference tap/photodiode, receiver objective, spectral filter, focusing lens, silicon photodiode, transimpedance amplifier, digitiser and timing/range processor. Each component has a keyboard-accessible inspection button and a working-principle explanation. Cyan and orange distinguish outbound and collected return intensity; green denotes electrical/timing connections. Near-infrared light is not actually visible. Baseline, propagation, ray slopes and pulse widths are enlarged/schematic. The near-coaxial far-field approximation neglects the small physical aperture separation in the 10–300 m range equation. The instrument does not rotate.

Pulse timing now uses a declared illustrative 100 nJ instrument rather than returning the exact input range on every shot. For a large, normal-incidence Lambertian target that intercepts the full beam:

`E_rx = E_tx × rho × A_rx / (pi R²) × eta_opt × exp(-2 alpha R)`.

Extinction input is in inverse kilometres; distance is converted accordingly. At 905 nm, photon energy is `hc/lambda`; an assumed 55% quantum efficiency converts received energy to expected signal electrons. The 45% optical efficiency includes the reference tap. Signal and in-band background shot variances add to an 8-electron RMS electronics variance. Background input is electrons/ns at a 30 mm reference aperture and scales with collecting area. The effective integration duration is the Gaussian echo FWHM, `hypot(pulse FWHM, 2 ns receiver FWHM)`. This is an illustrative charge-domain link budget, not a calibrated APD response, solar spectrum, bandwidth or matched-filter implementation.

Expected `SNR = N_signal / sqrt(N_signal + N_background + 8²)` must reach 6 to report a return. This deterministic gate is **not** a sampled threshold crossing or a probability-of-detection model. A below-gate shot reports no valid range even though physical backscatter is present. Raising reflectance/aperture or reducing background/extinction can recover detection. Constant energy means broader pulses preserve signal charge while collecting more background and worsening timing precision.

The approximate Gaussian peak-time standard deviation is `hypot(FWHM / (2.355 SNR), 80 ps clock jitter, 100 ps / sqrt(12) timestamp bin)`. Accepted shots draw seeded Gaussian analogue timing noise and then quantise to 100 ps (the quantisation term is not also added to the analogue draw). The raw timestamp includes 12 ns internal latency; the calibrated processor removes it and reports `R = c (t_raw - 12 ns) / (2n)`. The optical reference photodiode supplies the emission start. Each new shot gets a new seed; captured trace noise stays fixed between shots. Plotted noise is illustrative, not the sample array from which the timestamp is fitted; TX and RX have different gains, narrow pulses are widened for display, and the RX peak is clipped. The reported sigma is conditional approximate precision, not echo-separation resolution or a certified accuracy.

Changing target, receiver, environment, pulse width or method invalidates the captured result and stops its animation. Repeat playback uses fresh shot seeds, not the selected periodic PRF in real time. Phase/multi-frequency modes retain their idealised equations and explicitly do not use the noisy pulse receiver. Saturation, finite-target interception, exact bistatic ray tracing, detector dead time, false alarms, multiple scattering and calibrated atmospheric/spectral response remain outside this model.

`npm run test:lidar` covers link-budget scaling, two-way extinction/units, fixed-energy pulse broadening, background noise, weak-return rejection and aperture recovery, air-index correction, latency removal, timestamp quantisation, reproducible shot noise and the timing floor. With a local production preview and Chromium remote debugging running, `npm run test:lidar:browser` exercises all three modes at six viewport widths, component inspection, capture lifecycle/noise stability, missed returns/recovery, control invalidation and keyboard tab navigation. Optional `RANGING_BASE_URL` and `RANGING_CDP_URL` override its defaults.

Browser validation should exercise all three experiments, self-check feedback and narrow-screen layouts in each of the six lessons. It should additionally fire a pulse and change its target, inspect a final TIN point, compare yaw at nadir/off-axis, and check waveform return readouts after changing canopy attenuation.

## Further reading

- NOAA, *Lidar 101: An Introduction to Lidar Technology, Data, and Applications*: https://coast.noaa.gov/data/digitalcoast/pdf/lidar-101.pdf
- USGS, *Lidar Base Specification*: https://www.usgs.gov/ngp-standards-and-specifications/lidar-base-specification-online
- Axelsson (2000), *DEM generation from laser scanner data using adaptive TIN models*, ISPRS proceedings: https://www.isprs.org/proceedings/XXXIII/congress/part4/111_XXXIII-part4.pdf

These are further-reading references, not a claim of independent academic peer review. External PDF retrieval was denied by this environment's network policy during the review; document contents and link availability were not reverified here. The implemented equations and numerical relationships are checked by the local regression tests.
