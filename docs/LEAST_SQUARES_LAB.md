# Least-squares adjustment: an inspectable teaching worksheet

Route: `?simulation=least-squares`. A native catalogue card links to the lab.

The lab presents four numerical examples, not a pre-recorded adjustment animation:

| Example | Unknowns and observations | Main teaching purpose |
| --- | --- | --- |
| Weighted mean | One height from four independent height estimates | Precision versus influence; the squared-error minimum |
| Levelling network | Three unknown heights, six measured differences, exact benchmark A | Observation signs, route-based weights, closure and datum |
| GNSS baseline network | Nine ENU coordinate components, six 3D baseline vectors | Generalized least squares and within-vector covariance |
| GNSS code positioning | Receiver ECEF X/Y/Z and clock range, eight synthetic corrected pseudoranges | Nonlinear linearization, Jacobians, convergence and satellite geometry |

## The calculations are the interface

Select any observation or uncertain control row to see its functional equation, numeric substitution at the current approximation, design row, misclosure, assigned covariance/precision and signed residual. Source observations and standard deviations are editable. Negative/partially typed inputs are retained as drafts without sending invalid numbers to the solver. Exclusion removes an observation; no automated blunder deletion or hidden truth-coordinate repair occurs.

The worksheet exposes **A, w, Σ, P, N, u, δx, residuals, parameter covariance and residual covariance**. A chosen N[j,k] and u[j] expand into actual row-by-row products. Cholesky whitening and the pivoted QR factor are inspectable. The quality section expands `vᵀPv` into the squared components of `L⁻¹v`. These are the solver's own arrays, not separately maintained illustrative numbers. Matrix cells expose full precision on hover; printed values are rounded.

The worksheet shows one step at a time: geometry/observations, equations, adjustment, then quality interpretation. Next/previous actions and the step selector change views without changing the problem. “Show full worksheet” exposes all four steps for review. Covariance/precision matrices and notation are expandable; the default view starts with the network and field book. The desktop assumptions panel sits alongside the active step without an additional vertical scrollbar. On narrow screens controls start collapsed above the worksheet; wide matrices and field books retain their own horizontal scrolling.

## Sign and unit conventions

```
l + v = f(x)
w = l − f(x₀)
v ≈ A δx − w
P = Σ⁻¹
N = Aᵀ P A,  u = Aᵀ P w
N δx = u
x̂ = x₀ + δx,  l̂ = l + v
```

All observation/parameter lengths are in metres, Σ/Cx/Cv in m², P/N in m⁻² and u in m⁻¹. Levelling and baseline standard deviations and residuals are often *displayed* in millimetres with explicit conversion. The code-positioning clock unknown is `b = c Δt` in metres, with c = 299792458 m/s; the final clock result is also converted to nanoseconds. It is not an angle or a clock value in seconds inside the linear solve.

### A real levelling calculation from the default dataset

The fixed benchmark is HA = 100 m and the starting HB is 102.320 m. L1 measures A → B as +2.346500 m over 0.80 km.

```
f₁(x₀) = HB − HA = 102.320 − 100.000 = 2.320 m
w₁ = 2.346500 − 2.320000 = +0.026500 m
A₁ = [1, 0, 0]                   unknown order: HB, HC, HD
σ₁ = 0.002 √0.80 = 0.001788854... m
P₁₁ = 1 / σ₁² = 312500 m⁻²
N[HB,HB] contribution = 1 × 312500 × 1 = 312500 m⁻²
u[HB] contribution = 1 × 312500 × 0.0265 = 8281.25 m⁻¹
```

All six observations jointly give approximately `δH = [0.025633483, −0.024935257, 0.031043719]` m and adjusted heights `[102.345633483, 99.875064743, 103.211043719]` m. L1's residual is about −0.000866517 m: its adjusted difference is *smaller* than the measured value. The default measured loop misclosures (0.4, 4.3 and 1.0 mm) all close after adjustment. Closure expresses internal consistency, not independent accuracy of the benchmark datum.

## Numerical engine

`least-squares-math.js` forms `Σ = L Lᵀ`, whitens A and w by forward substitution, and solves with **column-pivoted Householder QR**. It does not obtain the solution by explicitly inverting the normal matrix. Cx is recovered from the triangular factor and restored to original parameter order. N and u are still computed and displayed because they are important teaching objects.

A relative levelling network without a datum has one translation freedom (rank 3 of 4); a baseline network has three translation freedoms (rank 9 of 12). The engine reports rank defects instead of returning fabricated coordinates or uncertainty. QR rank tolerance is numerical and can also reveal severely ill-conditioned designs. An exact benchmark removes its coordinates from the unknown vector. An uncertain benchmark contributes actual observation rows: a single height control has 3 mm sigma, and a baseline A control has 10/10/20 mm ENU sigmas. Equal weighting replaces all active sigmas, including uncertain controls, with the documented common value.

Baseline components within one vector use a full 3 × 3 covariance block. E–N correlation is editable; E–U is +0.2 and N–U is −0.1 when correlation is enabled. Different baselines have different component precisions, so correlation changes can affect both coordinates and uncertainty. Different baselines are assumed independent. Ignoring correlations does not change the measured vector values. These vectors represent processed GNSS observations; raw carrier phase, inter-session covariance and ambiguity resolution are not modelled.

## GNSS nonlinear processing

Each satellite is a synthetic fixed ECEF orbit point at one epoch. The corrected code model is

```
ρᵢ = √[(X − Xᵢ)² + (Y − Yᵢ)² + (Z − Zᵢ)²] + b + error
Aᵢ = [(X − Xᵢ)/rᵢ, (Y − Yᵢ)/rᵢ, (Z − Zᵢ)/rᵢ, 1]
```

Every displayed iteration is a newly calculated linearization and weighted correction. Exact nonlinear residuals are re-evaluated after the update and explicitly distinguished from `Aδx − w` at intermediate steps. Convergence requires position and clock-range corrections below 0.00001 m. Global statistics are not interpreted as a converged nonlinear test before that condition is reached. Different starting approximations converge to the same noisy estimate; no true receiver coordinates are substituted into the solution.

The skyplot uses the synthetic reference site's azimuth/elevation convention (North up, azimuth clockwise, horizon at edge). PDOP/GDOP use the **unweighted** geometry matrix; they are dimensionless, not metre accuracy. Clustered satellites demonstrate why a small residual need not imply a precise position. The final ECEF covariance is rotated into a local ENU frame to form a horizontal confidence ellipse.

Atmospheric delays, satellite clocks, Earth rotation during signal propagation, relativity, ephemeris errors, multipath, RINEX parsing, PPP, carrier phase and integer ambiguity fixing are outside this small example. Inputs are assumed already corrected; this is not presented as a production GNSS engine.

## Quality and uncertainty

At a full-rank solution, ν = m − n, T = vᵀPv and σ̂₀ = √(T/ν). A two-sided 95% global test compares T with chi-square quantiles computed from the regularized gamma function and numerical inversion, not a rough normal approximation. Its interpretation assumes a suitable functional/stochastic model with Gaussian observation errors. Above/below/inside the interval are conditional diagnostic outcomes, not labels of truth or proof of a specific blunder.

Residual covariance is `Cv = Σ − A Cx Aᵀ`. Normalized residuals use `vi / √Cv,ii`, **not** `vi / σobservation`. Residuals are correlated and multiple testing/low detectability matter; |r| > 3 is only an exploratory flag. Generalized redundancy is diag(I − A Cx AᵀP), whose trace is ν. With correlated observations its elements are not local probabilities.

The reported a priori parameter covariance is `Cx = (AᵀPA)⁻¹` from absolute Σ. The estimated common-scale matrix `σ̂₀² Cx` is displayed separately and explicitly qualified. A priori 95% horizontal ellipses use χ²₂,₀.₉₅ = 5.99146; estimated-scale ellipses would require a different treatment and are not claimed. Baseline ellipses are magnified 1500× with the factor labelled, and the plan uses equal horizontal axis scale. A zero-redundancy fit reports no variance-factor/global test rather than claiming perfect quality.

The residual CSV contains measured/adjusted values, signed residual, stated sigma, *assumed marginal* sigma, normalized residual and generalized redundancy. It is not a substitute for the full covariance matrix when components are correlated; expand “Covariance & precision matrices” in the equations step to inspect Σ and P.

## Verification

```sh
npm run test:adjustment
npm run test:adjustment:browser
npm run test:thumbnails
npm run build
npm run test:catalogue:browser
```

The 32 numerical tests check closed-form weighted means; objective minimization and stationarity; matrix products and covariance inversion; route weighting and loop closure; missing/weighted datum and disconnected/zero-redundancy networks; uniform sigma scaling; heterogeneous correlated baselines; gross errors; residual covariance; near-collinear QR; reference chi-square quantiles; ellipses; finite-difference GNSS Jacobians; actual convergence/geometry/initialization; insufficient satellites; non-use of reference truth in position estimation; geodetic conversions; invalid covariance; and exported arithmetic.

Browser tests inspect real numeric substitutions, edited observations, negative input drafts, missing datum, uncertain control selection, normal matrices, correlation effects, nonlinear iteration controls, CSV content, four cases at six widths, mobile controls and runtime exceptions. Screenshots are saved in `/tmp/least-squares-*.png`. Browser endpoints use the same `PHOTO_CDP_URL` and `PHOTO_BASE_URL` overrides as the other labs.

References: Ghilani, *Adjustment Computations*; Teunissen, *Adjustment Theory*; Leick, Rapoport & Tatarnikov, *GPS Satellite Surveying*; Strang & Borre, *Linear Algebra, Geodesy, and GPS*.
