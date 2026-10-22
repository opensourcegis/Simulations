// Compact teaching briefs for the older laboratories. Newer labs already
// provide their own objective, experiment sequence and model-limit notebook.
export const LESSON_BRIEFS = {
  gnss: {
    objective:
      "Separate code, clock bias and carrier ambiguity; explain what double differencing removes.",
    experiment:
      "Change only the receiver clock. Then apply the supplied synthetic integers and change one integer by a cycle.",
    evidence:
      "Code observations shift together; clock is recovered separately. Wrong integer hypotheses change the computed baseline and residuals.",
    limits:
      "One east coordinate, not full 3D positioning. Short-baseline, same-epoch observations with independent Gaussian receiver noise. No atmosphere, multipath, cycle slips, ambiguity estimation or real RTK validation.",
    reference: [
      "ESA Navipedia · GNSS observables",
      "https://gssc.esa.int/navipedia/index.php/GNSS_Basic_Observables",
    ],
  },
  gpr: {
    objective:
      "Connect one pulse echo to an A-scan, a moving antenna to a hyperbola, and velocity to inferred depth.",
    experiment:
      "Move the antenna away from the target; then keep the apex time fixed and change the assumed permittivity in the depth stage.",
    evidence:
      "Slant range makes the echo later off-target. Greater permittivity means lower velocity and a shallower depth for the same two-way time.",
    limits:
      "Monostatic pulsed radar, homogeneous nondispersive soil and point diffractors. Repeated pulses are slowed down. No layered refraction, conductive attenuation, antenna radiation pattern or migration; amplitude is illustrative, not material identification.",
    reference: [
      "USGS · Ground-penetrating radar",
      "https://water.usgs.gov/ogw/bgas/gpr/",
    ],
  },
  snell: {
    objective:
      "Measure angles from the normal, predict refraction or total internal reflection, and distinguish focal length from distortion.",
    experiment:
      "Choose glass → air and raise incidence past the critical angle. Then increase lens index without changing its curvature.",
    evidence:
      "The transmitted ray disappears only above the critical angle. Greater index shortens the paraxial focal length; changing radial distortion bends straight image lines.",
    limits:
      "Ideal interface, thin symmetric lens in air and one normalized radial coefficient. Lens rays use a paraxial model, not curved-surface ray tracing. No Fresnel intensity, dispersion, thick-lens principal planes or aberration calculation.",
    reference: [
      "OpenStax · Geometric optics",
      "https://openstax.org/books/university-physics-volume-3/pages/2-introduction",
    ],
  },
  sar: {
    objective:
      "Distinguish slant-range resolution from ground-range resolution and synthetic-aperture azimuth resolution.",
    experiment:
      "Double bandwidth; then change incidence while holding bandwidth fixed. Separately change antenna length.",
    evidence:
      "c/(2B) halves when bandwidth doubles. Ground-range resolution is c/(2B sin θ). Ideal broadside stripmap azimuth resolution is approximately D/2.",
    limits:
      "Flat-Earth broadside stripmap approximations; curves are ideal point-target responses, not a focused raw-data image. No orbit curvature, terrain radiometry, actual polarimetric scattering or InSAR inversion. Resolution is not positional accuracy.",
    reference: [
      "NASA ARSET · SAR training",
      "https://appliedsciences.nasa.gov/get-involved/training/english/arset-introduction-synthetic-aperture-radar",
    ],
  },
  "map-projections": {
    objective:
      "Explain why a projection cannot preserve all distances, angles and areas; compare local distortion at the same location.",
    experiment:
      "Flatten Mercator and Mollweide; compare the yellow equal-radius circles and the local area factor at 60° latitude.",
    evidence:
      "Mercator preserves local angles but enlarges area; Mollweide preserves area but changes shape. Local area scale is not a measured polygon area.",
    limits:
      "Spherical forward formulas with dimensionless coordinates; morphing is a visual transition, not a physical unwrapping. Transverse Mercator is a spherical illustration, not ellipsoidal UTM coordinates. Polar singularities and projection cuts are excluded.",
    reference: [
      "USGS · Map projections: a working manual",
      "https://pubs.usgs.gov/publication/pp1395",
    ],
  },
  "building-lod": {
    objective:
      "Choose the geometric detail needed for a task without confusing more polygons with more accurate measurements.",
    experiment:
      "Compare footprint, extruded block, roof and architectural exterior; inspect which features appear or disappear.",
    evidence:
      "Roof form enables analyses that an extruded block cannot. Windows and balconies increase detail, but do not establish source accuracy or survey completeness.",
    limits:
      "Procedural example building and an illustrative refined LOD0.0–3.3 taxonomy. This is not a CityGML conformance validator; LOD conventions depend on the application profile and do not guarantee metric accuracy. No interiors are modelled.",
    reference: ["OGC · CityGML", "https://www.ogc.org/standard/citygml/"],
  },
  "iot-twin": {
    objective:
      "Trace sample → delayed telemetry → estimated asset state → feedback command, and identify stale information.",
    experiment:
      "Pause to inspect the pipeline. Raise latency or reduce sampling, inject heat, then compare open and closed loop.",
    evidence:
      "Telemetry age measures information freshness; temperature difference measures state mismatch. Neither is the other. Cooling reacts only after telemetry and command delivery.",
    limits:
      "Seeded, accelerated machine dynamics and rule-based alarms, not live sensors, an MQTT connection or trained ML. Health and remaining-life displays are illustrative heuristics, not validated maintenance forecasts.",
    reference: ["NIST · Digital twins", "https://www.nist.gov/digital-twins"],
  },
  ortho: {
    objective:
      "Explain why camera tilt and terrain/building height cause different distortions, and why orthorectification needs an elevation model.",
    experiment:
      "Probe a roof away from nadir. Compare datum, DTM and DSM projection, then change camera height and tilt.",
    evidence:
      "The ray meets the DTM beyond the roof footprint; a DSM accounts for roof height. Displacement is measured between those intersections, not guessed from an animation.",
    limits:
      "Procedural synthetic surfaces and schematic rendering. The React preview is a geometry lesson, not a production raster orthorectifier. A DSM cannot recover an unseen surface from one photograph; true-ortho occlusion filling requires other source images.",
    reference: [
      "USGS · Digital orthophoto quadrangles",
      "https://www.usgs.gov/faqs/what-digital-orthophoto-quadrangle-doq-or-digital-orthophoto-quarter-quadrangle-doqq",
    ],
  },
};
