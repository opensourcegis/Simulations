const noaa = { title: 'NOAA · Lidar 101 (introductory reading)', url: 'https://coast.noaa.gov/data/digitalcoast/pdf/lidar-101.pdf' };
const usgs = { title: 'USGS · Lidar Base Specification (data quality and classification)', url: 'https://www.usgs.gov/ngp-standards-and-specifications/lidar-base-specification-online' };

export const LIDAR_LEARNING_PATH = [
  { topic: 'ranging', title: 'Range', path: '?simulation=lidar-ranging' },
  { topic: 'scanning', title: 'Scan geometry', path: '?simulation=lidar-scanning' },
  { topic: 'interaction', title: 'Target & returns', path: 'games/lidar-interaction/' },
  { topic: 'footprint', title: 'Beam footprint', path: '?simulation=beam-footprint' },
  { topic: 'boresight', title: 'Georeferencing', path: '?simulation=boresight' },
  { topic: 'tin', title: 'Ground filtering', path: '?simulation=adaptive-tin' },
];

export const LIDAR_LESSONS = {
  ranging: {
    number: '01', title: 'How does a travel time become a distance?',
    objective: 'Explain the factor of two, distinguish pulse resolution from accuracy, and resolve a wrapped modulation phase.',
    steps: [
      ['Emit and time', 'Start the clock at transmission. The receiver measures an echo delay, not distance directly; the animation is greatly slowed down.'],
      ['Convert the observable', 'For monostatic ranging in air, R ≈ cΔt/2. For AMCW, the observable is modulation phase modulo 360°, so one tone leaves an unknown integer cycle count.'],
      ['Assess uncertainty', 'Pulse width affects echo separation; timing/phase noise affects precision. Calibration, atmosphere, waveform shape and target geometry also affect accuracy.'],
    ],
    experiments: [
      { id: 'timing', title: '150 m time-of-flight', prediction: 'Predict the round-trip delay before firing.', result: 'The echo arrives after about 1,001 ns. Light travels 300 m; divide by two to recover 150 m.' },
      { id: 'ambiguity', title: 'Create a pulse ambiguity', prediction: 'At 220 m and 1,000 kHz, does the echo arrive before the next pulse?', result: 'The unambiguous interval is about 149.9 m. An untagged periodic-pulse receiver would associate the delay with an apparent range of about 70.1 m.' },
      { id: 'phase', title: 'Expose the missing cycles', prediction: 'At 120 m and 10 MHz, can one phase measurement determine the whole range?', result: 'One interval is about 15.0 m. The phase gives only the fractional interval; a coarse reading must identify the integer N.' },
    ],
    assumptions: 'Monostatic sensor. The native pulse workbench uses v = c/n with a selectable air index, a Lambertian-target link budget, seeded timing jitter, TDC quantisation, an SNR detection threshold and a known internal delay removed during calibration. These are illustrative instrument constants, not validated accuracy. The phase/multi-tone views use c as an air approximation and ideal phases; their ±3° windows illustrate uncertainty, not a simulated noisy phase estimator. The PRF ambiguity limit assumes untagged periodic pulses; multiple-time-around systems need pulse identification. λ in AMCW is the modulation wavelength, not the optical laser wavelength.',
    question: { prompt: 'Two targets return echoes 0.5 m apart in range. A 10 ns pulse has cτ/2 ≈ 1.5 m. What is justified?', choices: ['All measured ranges must be wrong by 1.5 m.', 'Echoes may overlap, but a single-target range can be estimated more precisely.', 'Increasing PRF alone separates the echoes.'], correct: 1, explanation: 'Echo separation, precision and absolute accuracy are different. Pulse shape, relative amplitudes, receiver bandwidth, signal-to-noise ratio and the estimator determine what can be resolved.' },
    references: [noaa],
  },
  scanning: {
    number: '02', title: 'Why does steering the beam produce different point patterns?',
    objective: 'Connect scanner motion and aircraft motion to swath, sampling geometry and non-uniform point density.',
    steps: [
      ['Steer the line of sight', 'A rotating or oscillating optic changes the ray direction. For a mirror, optical ray deflection is twice a small mirror rotation; prism refraction follows a different mechanism.'],
      ['Intersect the ground', 'On a horizontal plane, the across-track offset is y = H tan θ and the full swath is W = 2H tan α, where α is the maximum off-nadir angle.'],
      ['Add platform motion', 'Forward motion shifts successive scans. Approximate line spacing is v/fscan; average density is q/(vW), only for complete coverage and usable returns. The equivalent spacing 1/√density is not a local nearest-neighbour distance.'],
    ],
    experiments: [
      { id: 'osc', title: 'Compare mirror and polygon', prediction: 'Is equal time spacing the same as equal ground spacing?', result: 'An oscillating mirror dwells near its turning points. A constant-angular-speed polygon still gives increasing ground spacing toward the edges because d(H tan θ)/dθ = H sec²θ.' },
      { id: 'height', title: 'Double the height', prediction: 'Compare the oscillating-mirror swath at 80 m and 160 m.', result: 'With a fixed angular field of view, doubling H doubles the swath. With the same speed and pulse rate, the ideal mean density halves; this does not by itself determine range accuracy.' },
      { id: 'risley', title: 'Test “non-repetitive” scanning', prediction: 'Do the two fixed prism frequencies in this model ever repeat?', result: 'The illustrative +18 Hz and −28 Hz rotations repeat after 0.5 s for a stationary platform. Aircraft motion translates each repetition. Real non-repeating designs depend on their frequency ratio and observation interval.' },
    ],
    assumptions: 'Representative steering laws and deliberately low, illustrative pulse cadences. In the native 3D lab, unit rays intersect the nearest flat ground, rectangular building or opaque ellipsoid canopy surface; nearer surfaces occlude farther ones. Canopy penetration, detection noise and waveform returns are omitted. Density is a nominal flat-strip reference, not measured local coverage. Mechanisms use different sample rates, so this is not an instrument-performance comparison. Risley uses a paraxial deflection approximation. MEMS has a mechanically moving microscopic mirror; multi-beam channels assume the shown downward-facing geometry.',
    question: { prompt: 'A polygon scanner sweeps at constant angular speed over flat ground. Is its ground spacing exactly uniform?', choices: ['No: tan θ makes spacing larger toward the swath edges.', 'Yes: equal angle always means equal ground distance.', 'Only the aircraft speed matters.'], correct: 0, explanation: 'Ground offset is H tan θ. Equal angular increments map to H sec²θ times the angle increment; constant angular speed is not constant ground speed.' },
    references: [noaa],
  },
  interaction: {
    number: '03', title: 'Which part of a pulse actually reaches the receiver?',
    objective: 'Separate diffuse and specular reflection, explain a return waveform, and avoid treating every last return as ground.',
    steps: [
      ['Partition incident energy', 'Use reflected + absorbed + transmitted = incident energy. Here reflection is split into diffuse and specular components; scattering is not an additional fifth energy channel.'],
      ['Collect a small backscatter', 'For an extended diffuse target, received energy scales approximately with reflectance, cos θ, receiver aperture area and 1/R². A specular reflection is strong only if its lobe intersects the receiver.'],
      ['Detect waveform peaks', 'A footprint can illuminate foliage and ground at different ranges. Receiver bandwidth and pulse shape merge some contributions; detected peaks are not identical to every physical interception.'],
    ],
    experiments: [
      { id: 'water', title: 'Tilt a water surface', prediction: 'Compare calm water at 0° and 20° incidence.', result: 'The specular lobe moves away from the monostatic receiver. A weak or missing NIR return does not mean the emitted energy disappeared: it was reflected elsewhere, absorbed or transmitted.' },
      { id: 'range', title: 'Double the range', prediction: 'Use the white-roof reference at 100 m, then 200 m, with the same aperture.', result: 'The extended-target model gives approximately one-quarter the received signal, with a small extra atmospheric loss. Raw intensity is therefore not a material-only reflectance measurement.' },
      { id: 'canopy', title: 'Compare leaf-on and leaf-off', prediction: 'Hold the beam at the same place; switch leaf-off on and off.', result: 'Less interception lets more energy reach the ground. A last detected peak can still be foliage; a ground model requires classification, multiple samples and interpolation.' },
    ],
    assumptions: 'Illustrative 1064 nm coefficients and Schlick-like energy redistribution; the cosine-power specular lobe is energy-normalised over the upper hemisphere and evaluated 2θ from its mirror axis for a monostatic receiver. It is not a measured or fully reciprocal microfacet BRDF. Relative surface signal uses a white target at 100 m and a 100 mm aperture. The canopy is a 2D Gaussian-beam cross-section with 21 sub-rays, two-way Beer–Lambert attenuation and an opaque trunk, not individual leaf ray tracing or a full 3D footprint. Gaussian pulses have fixed energy and adjustable 2–20 ns FWHM; additive Gaussian noise, smoothing and thresholded peak selection are illustrative. No multiple scattering or photon-counting model. Ground is known in the synthetic scene.',
    question: { prompt: 'A pulse produces three returns. Can the last return automatically be used as bare-earth elevation?', choices: ['Yes, by definition.', 'Only if the first return is bright.', 'No: it may be lower foliage, a roof or another obstruction.'], correct: 2, explanation: 'Return order describes detection order, not land-cover class. Ground classification must assess geometry and neighbourhood evidence; a DTM cannot be built by blindly selecting last returns.' },
    references: [noaa, usgs],
  },
  footprint: {
    number: '04', title: 'How large is the patch illuminated by one measurement?',
    objective: 'Distinguish height from slant range, calculate an oblique footprint, and separate spot size from point spacing.',
    steps: [
      ['Propagate the beam', 'For small full-angle divergence γ in radians, beam diameter perpendicular to its axis is d ≈ d₀ + Rγ. Convert mrad to rad and mm to metres first.'],
      ['Project onto the surface', 'For horizontal ground, R = H/cos θ. The small-divergence footprint has minor diameter b = d and major diameter a ≈ d/cos θ; area is πab/4.'],
      ['Interpret the measurement', 'The reported range comes from energy across the footprint. Spot diameter, point-to-point sampling interval and positional accuracy are different quantities. Mixed surfaces can broaden or split an echo.'],
    ],
    experiments: [
      { id: 'nadir', title: 'Calculate the 1,000 m spot', prediction: 'With γ = 0.5 mrad, d₀ = 0 and θ = 0°, what diameter do you expect?', result: 'd = 1,000 × 0.0005 = 0.50 m, and the circular area is about 0.196 m².' },
      { id: 'oblique', title: 'Tilt to 60°', prediction: 'Keep H = 1,000 m and d₀ = 0. What changes?', result: 'R doubles to 2,000 m; b = 1.0 m and a = 2.0 m. Area is about 1.571 m²: eight times the nadir area, not merely twice.' },
      { id: 'aperture', title: 'Include the exit beam', prediction: 'At H = 30 m, γ = 0.1 mrad and d₀ = 100 mm, can the initial diameter be neglected?', result: 'The diameter is 0.103 m, not 0.003 m. Both charts and readouts must include the initial 0.100 m beam diameter.' },
    ],
    assumptions: 'Small-angle, geometric top-hat diameter convention with full-angle divergence; not a Gaussian-beam propagation solver. Real manufacturers may specify a different intensity contour or a half-angle. Ground is horizontal; on sloped terrain, incidence is measured from the local surface normal. The cos⁻³θ area scaling is valid only when d₀ is negligible. The energy-density ratio assumes fixed pulse energy and is not a prediction of receiver intensity. The 3D footprint is enlarged for visibility; use numeric readouts and the scale inset for dimensions.',
    question: { prompt: 'You increase PRF without changing height, optics or beam divergence. What happens to an individual footprint?', choices: ['It necessarily gets smaller.', 'Its size stays the same; the number and spacing of samples may change.', 'Its positional accuracy doubles.'], correct: 1, explanation: 'Optical divergence and range set footprint size. PRF changes temporal sampling; with platform motion it affects point spacing, not the geometric footprint of each pulse.' },
    references: [noaa],
  },
  boresight: {
    number: '05', title: 'How does a measured range become a georeferenced point?',
    objective: 'Keep position, attitude, lever arm and boresight separate, and diagnose the error from omitting a calibration rotation.',
    steps: [
      ['Locate the sensor', 'GNSS gives an antenna phase-centre position. Rotate the antenna-to-scanner lever arm from the body frame into the mapping frame before adding it.'],
      ['Orient the measured ray', 'Apply scanner direction, scanner-to-body boresight, measured body attitude and navigation-to-Earth rotation in the declared order. Rotations do not generally commute.'],
      ['Compare the same observation', 'The two plotted points use the same measured slant range and attitude. One includes the boresight; the other omits it. Their horizontal and vertical separation is the calibration error.'],
    ],
    experiments: [
      { id: 'zero', title: 'Zero the boresight', prediction: 'Does aircraft attitude alone create the displayed calibration error?', result: 'With correct measured attitude and zero boresight, the two computed endpoints agree, even when the platform is tilted.' },
      { id: 'yaw-nadir', title: 'Apply yaw at nadir', prediction: 'Set roll/pitch boresight to zero and yaw to 10°. Does a nadir ray move?', result: 'A pure rotation about the scanner down-axis leaves a nadir ray unchanged. This single ray cannot reveal yaw misalignment.' },
      { id: 'yaw-scan', title: 'Move the yaw test off-nadir', prediction: 'Keep 10° yaw boresight but use a 30° scan angle.', result: 'The off-axis ray now rotates. Yaw produces horizontal error, showing why calibration needs varied scan angles and overlapping strips, not one nadir point.' },
    ],
    assumptions: 'Guided presets reset timing and calibration residuals to zero and use flat ground; the advanced controls explicitly add slope, timestamp offsets, residual calibration and range bias. All views share one recorded-range calculation. Mount offsets use X forward / Y left / Z up; attitude and boresight use right-handed NED Rz(yaw)Ry(pitch)Rx(roll). Equipment is physically scaled, with deliberately large instructional mounting angles. The body and scanner frames are drawn separately. GNSS noise, flexure and antenna phase-centre variations are omitted. Calibration changes the reconstruction transform, not the real instrument or ground hit. This is forward georeferencing, not a calibration solver.',
    question: { prompt: 'Can a calibration based on one exact nadir ray detect pure scanner yaw misalignment?', choices: ['No: rotation about that ray leaves its direction unchanged.', 'Yes: yaw always shifts nadir.', 'Only by increasing the receiver aperture.'], correct: 0, explanation: 'The ray direction is invariant under rotation about itself. Off-nadir rays and overlapping flight strips make yaw effects observable; this is an observability issue, not a range-noise issue.' },
    references: [noaa, usgs],
  },
  tin: {
    number: '06', title: 'How do we infer ground from an unclassified point cloud?',
    objective: 'Trace seed selection, facet-relative insertion tests and re-triangulation, then distinguish ground omission from object inclusion.',
    steps: [
      ['Select plausible seeds', 'Lowest eligible points in coarse cells are ground hypotheses, not guaranteed truth. Large roofs and low outliers can contaminate the seed TIN. The native lab can screen isolated low points first; it does not force boundary anchors.'],
      ['Test against the local facet', 'Use perpendicular point-to-plane distance and the angle between each vertex-to-candidate segment and the facet plane. A point on a steep planar slope has zero insertion angle.'],
      ['Densify and evaluate', 'Insert a small batch of accepted candidates and rebuild the TIN. Larger thresholds may retain more real ground but also admit vegetation/buildings. Ground precision and recall expose that trade-off better than overall accuracy alone.'],
    ],
    experiments: [
      { id: 'steep', title: 'Test a steep slope', prediction: 'Does a steep slope alone mean a point is non-ground?', result: 'No. The insertion angle is measured relative to the current facet, not the horizontal. Ground can be steep; breaks in slope and poor seeds still make classification difficult.' },
      { id: 'strict', title: 'Tighten the thresholds', prediction: 'Use 0.3 m and 4°. Which errors become more likely?', result: 'The filter is conservative. Ground omission can increase, especially with rough terrain or an initial TIN that bridges a terrain break. Check ground recall rather than only accuracy.' },
      { id: 'relaxed', title: 'Relax the thresholds', prediction: 'Use 2.5 m and 20°. Is more accepted ground always better?', result: 'More objects may enter the ground set. Ground precision can fall even while recall rises. A roof seed cannot be repaired merely by loosening thresholds.' },
    ],
    assumptions: 'A simplified progressive TIN densification lesson inspired by Axelsson (2000), not a production implementation or full reproduction of its adaptive controls. Optional local-plane low screening, noise/edge-scaled bounds and maximum supported edge are included. No artificial boundary seeds are supplied. The lesson reveals the computed initial Delaunay facets, not the triangulator’s internal construction order. Every displayed candidate test stores its actual supporting facet and the immediate before/after mesh. Passing batch qualification is not insertion; the actual decision follows a fresh facet test. Unsupported candidates are withheld. Synthetic truth is used only for scores and terrain validation, never for insertion decisions.',
    question: { prompt: 'A point lies exactly on a planar 35° hillside represented by a TIN facet. What is its facet-relative insertion angle?', choices: ['35°: its slope relative to horizontal.', '0°: it does not deviate from the facet plane.', '90°: the facet normal defines the insertion angle.'], correct: 1, explanation: 'Insertion measures departure from the local surface. Confusing terrain slope with this angle causes valid steep ground to be rejected even when it lies on the current surface.' },
    references: [ { title: 'Axelsson (2000) · DEM generation from laser scanner data using adaptive TIN models', url: 'https://www.isprs.org/proceedings/XXXIII/congress/part4/111_XXXIII-part4.pdf' }, usgs ],
  },
};
