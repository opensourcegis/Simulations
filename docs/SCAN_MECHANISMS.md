# Scan mechanism cutaways

The LiDAR scan-pattern lesson now includes an orbitable 3D optical cutaway for
each of its six steering laws. Choose a mechanism and use **Run slowly** to run
the existing flight clock at 0.05×. The phase slider pauses and seeks that same
clock within the current (or last complete) scan cycle. It is not a second,
independent animation. **Inspect mechanism** beside the field view jumps to the
cutaway, including on phones.

An amber line marks the incident path, cyan marks outgoing directions, and white
marks a mirror normal. A faint dashed line at time zero is explicitly a preview:
it does not add a measured point. Once acquisition starts, the bright outgoing
ray uses `scanPlaybackFrame(...).pulseTime`, exactly as the field view does.
There is no bright ray during polygon blanking. Changing controls preserves the
existing acquisition/reset semantics.

| Mechanism | What to inspect |
| --- | --- |
| Oscillating mirror | One shaft rocks a mirror. Optical deflection is twice mechanical tilt, not rotation of the whole scanner housing. |
| Polygon | The active finite facet reflects the incoming ray; the next facet takes over during the blanked interval. |
| Palmer | An axial input meets a mirror tilted 10°; its rotating normal gives the prescribed 20° cone. |
| Risley | Two wedges rotate at +18 and −28 Hz. The first refracted segment and the summed outgoing slope are distinct. |
| MEMS | A two-axis gimbal orients the mirror normal to reflect the incident ray into the existing Lissajous sightline. |
| Multi-beam | The head rotates in azimuth; eight simultaneous channel directions retain their individual 4°–20° cone angles. |

## Limits

The cutaways are enlarged explanatory assemblies, not engineering drawings or
commercial scanner specifications. Local path lengths, MEMS scale and prism
separation are schematic. Risley keeps the survey's paraxial vector-sum model,
not a full refractive-interface trace; separated wedges show an enlarged local
beam offset while the survey uses a common optical origin. The polygon has 12
illustrative facets and a prescribed transition-speed profile to retain the
existing ±25° sweep and 8% blanking. It is not a claim of constant motor speed
during handover. Eight multi-beam channels share the survey model's optical
origin; the illustrated windows are enlarged.

Neither the survey's scan laws nor its first-surface point generation have been
changed. The inset does not fabricate ground returns at its schematic grid.

## Verification

`npm test` includes shared-law/direction tests, reflection checks against the
actual rendered mirror transforms, a finite-facet hit test, prism slope sums,
cone angles and the emitted/preview/blanked Three.js line-buffer states.

`npm run test:scan-optics:browser` checks all six cutaways against recorded pulse
times and directions, blanking, slow playback, seek/pause/reset, focus and six
viewport widths. Inspection screenshots are saved as
`/tmp/scanning-mechanism-*.png`. The existing `test:scanning:browser` suite checks
that field acquisition and visible Fly controls remain unchanged.
