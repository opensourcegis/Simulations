# Two principles of surveying

Open `?simulation=survey-principles`, or select **Two Principles of Surveying**
in the Positioning catalogue category.

## 1. Work from the whole to the part

Follow one site through three scales of work. This is a survey hierarchy, not
an instruction to draw the whole map before measuring its details:

1. **Whole site:** checked primary marks A–D enclose the area and establish its
   common coordinate framework. Only this framework appears initially.
2. **Smaller parts:** choose triangle ABC or ACD. Local working stations S1/S2
   are established from synthetic ranges to two main controls, with a known
   field-sketch side resolving the range ambiguity. Switching areas leaves the
   primary framework unchanged. Real secondary control needs redundant checks.
3. **Local details:** the whole-site plan stays visible beside a clearly labelled,
   larger-scale building survey. Occupy S1, orient to S2 and observe one of three
   building corners P. A polar-coordinate calculation positions P in the same
   system as A–D. A distance from S2 is withheld as a detail check. The coordinate
   disclosure shows the control ties, orientation, horizontal angle, distance,
   and numerical `E = Eₛ₁ + d sin θ`, `N = Nₛ₁ + d cos θ` calculations.

Both working stations can see the three offered corners along the south/west
building faces. Neither locating nor check rays pass through the building.

The main takeaway is **A–D → S1/S2 → P**. Control is not derived backwards from
building corners. Observations are exact and synthetic; displayed calculations
are rounded, while computation uses full precision. No instrument accuracy is
claimed. Orientation is to grid north, using horizontal planar distances.

An optional **Why this order? Try an error experiment** disclosure keeps the
more advanced closure comparison separate from the first lesson. Introduce one
intentionally large northing mistake into a measured leg. Compare two methods
using the **same** observed leg vectors:

- A single closed detail traverse holds A fixed and distributes the whole-loop
  misclosure across every leg.
- Short traverses between independently established A–D controls distribute
  each cell's measured misclosure within that cell.

The compass/Bowditch correction to a leg is `−e × observed length / total length`.
Detail offsets are exact in this example, so a detail inherits its parent
station's error. The displays use equal map scales and unexaggerated positions.
Reobserving the suspect leg removes the introduced error; balancing it does not
make it a trustworthy observation.

Main controls are supplied as exact teaching references. Real primary control
has uncertainty and must be checked. This comparison illustrates error
containment and local checks, not a general proof that every point becomes more
accurate or that a gross error should be distributed. It is not least-squares
network adjustment. Supplied grid-oriented leg vectors omit field orientation
and bearing errors, centring and physical distance reductions.

## 2. Fix a point with independent measurements

One measured distance AP supplies a circle, not a unique position. Adding BP
from known B gives a second geometric constraint. Normally two intersections
remain. The example's field sketch places the target north of AB and selects
that candidate. The actual solver accepts only A, B, AP and BP; it does not use
reference target coordinates to choose or repair an answer.

Change the baseline and target location to see weak geometry. Tangent circles
may have one geometric intersection but singular local range geometry. A
negative or incompatible observation is reported, not silently clamped to a
plausible point. Circle arcs may extend beyond the plotting window.

The optional local ellipse assumes independent Gaussian range standard
deviations of 0.5 m: `Σ = σ²(JᵀJ)⁻¹`. The 95% semi-axes are
`sqrt(5.991 × eigenvalue)` and are drawn **five times larger** for visibility.
This is precision under the stated model, not an accuracy guarantee. The exact
synthetic ranges are not random samples from that Gaussian distribution.

Finally, measure CP from a third known station. C is **withheld** from the
two-range solution. An injected mistake in BP may still fit AP and BP exactly,
but disagree with independently observed CP. Reobserve BP to restore the
example. A single check is not a universal guarantee or complete fault-isolation
procedure. Two different geometric constraints do not automatically imply
uncorrelated observations; two repeats from A still leave the circle.

## Verification

`npm test` tests the control hierarchy, area containment, polar detail solutions,
unchanged primary control, closure distributions, propagation into details, exact and
ambiguous circle intersections, rigid-frame invariance, invalid/tangent cases,
range covariance, weak geometry and the withheld check.

`npm run test:survey-principles:browser` checks progressive stage visibility,
both selected areas, all six detail solutions, the optional error experiment,
guided steps, pointer dragging,
keyboard-accessible sliders, input preservation, injected mistakes, corrections,
expanded calculations, catalogue integration and six responsive viewport widths.
