export const CONTROL_ROUTE = [
  [12, 16],
  [36, 24],
  [62, 23],
  [88, 16],
  [78, 34],
  [79, 52],
  [88, 70],
  [62, 62],
  [37, 63],
  [12, 70],
  [23, 52],
  [22, 34],
  [12, 16],
];
export const CONTROL_NAMES = [
  "A",
  "1",
  "2",
  "B",
  "3",
  "4",
  "C",
  "5",
  "6",
  "D",
  "7",
  "8",
  "A",
];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Primary coordinates are supplied control. Synthetic ranges establish each
// secondary station; a bearing oriented to S2 then locates a building corner.
export function surveyHierarchyExample(zone = 0, corner = 0) {
  if (![0, 1].includes(zone) || ![0, 1, 2].includes(corner))
    throw new RangeError("Invalid survey area or corner");
  const controls = { A: [12, 16], B: [88, 16], C: [88, 70], D: [12, 70] };
  const names = zone === 0 ? ["A", "B", "C"] : ["A", "C", "D"];
  const baselineNames = zone === 0 ? ["A", "B"] : ["D", "C"];
  const baseline = baselineNames.map((name) => controls[name]);
  const fieldStations =
    zone === 0
      ? [
          [62, 30],
          [54, 34],
        ]
      : [
          [30, 46],
          [22, 47],
        ];
  const ties = fieldStations.map((p) => baseline.map((b) => distance(b, p)));
  // A field sketch specifies north of AB or south of DC, respectively.
  const stations = ties.map(
    ([r1, r2]) =>
      rangeIntersections(...baseline, r1, r2).points[zone === 0 ? 0 : 1],
  );
  const origin = zone === 0 ? [70, 35] : [41, 48];
  const building = [
    [0, 0],
    [9, 0],
    [9, 9],
    [0, 9],
  ].map((o) => o.map((v, j) => v + origin[j]));
  // Both stations are south-west of the building. Only the three corners
  // visible along its south/west faces are observed, never through a wall.
  const target = building[[0, 1, 3][corner]];
  const [S1, S2] = stations;
  const bearing = (a, b) =>
    (Math.atan2(b[0] - a[0], b[1] - a[1]) + 2 * Math.PI) % (2 * Math.PI);
  const backsightBearing = bearing(S1, S2);
  const horizontalAngle =
    (bearing(S1, target) - backsightBearing + 2 * Math.PI) % (2 * Math.PI);
  const gridBearing = (backsightBearing + horizontalAngle) % (2 * Math.PI);
  const range = distance(S1, target);
  const point = [
    S1[0] + range * Math.sin(gridBearing),
    S1[1] + range * Math.cos(gridBearing),
  ];
  return {
    controls,
    names,
    baselineNames,
    ties,
    stations,
    building,
    corner,
    point,
    range,
    backsightBearing,
    horizontalAngle,
    gridBearing,
    checkRange: distance(S2, target),
    computedCheck: distance(S2, point),
  };
}

// Both strategies use exactly the same observed planar leg vectors. Only the
// available independently established control differs. Compass/Bowditch rule,
// not a disguised truth correction or a least-squares network adjustment.
function balanceSpan(observations, first, last) {
  const start = CONTROL_ROUTE[first],
    end = CONTROL_ROUTE[last];
  const sum = observations
    .slice(first, last)
    .reduce((v, o) => v.map((x, j) => x + o.delta[j]), [0, 0]);
  const closure = sum.map((v, j) => v - (end[j] - start[j]));
  const length = observations
    .slice(first, last)
    .reduce((v, o) => v + o.length, 0);
  let position = [...start];
  const points = [[...start]],
    corrections = [];
  for (let i = first; i < last; i++) {
    const correction = closure.map(
      (v) => (-v * observations[i].length) / length,
    );
    corrections.push(correction);
    position = position.map(
      (v, j) => v + observations[i].delta[j] + correction[j],
    );
    points.push(position);
  }
  return { first, last, closure, length, points, corrections };
}
export function controlFrameworkExample(badLeg = 4, error = 5) {
  if (
    !Number.isInteger(badLeg) ||
    badLeg < 0 ||
    badLeg > 11 ||
    !Number.isFinite(error)
  )
    throw new RangeError("Invalid observed leg or error");
  const observations = CONTROL_ROUTE.slice(1).map((p, i) => {
    const delta = p.map(
      (v, j) => v - CONTROL_ROUTE[i][j] + (i === badLeg && j === 1 ? error : 0),
    );
    return {
      from: CONTROL_NAMES[i],
      to: CONTROL_NAMES[i + 1],
      delta,
      length: Math.hypot(...delta),
    };
  });
  const whole = balanceSpan(observations, 0, 12);
  const cells = [0, 3, 6, 9].map((first) =>
    balanceSpan(observations, first, first + 3),
  );
  const local = cells.flatMap((s, i) => (i ? s.points.slice(1) : s.points));
  const affectedCell = Math.floor(badLeg / 3);
  const offsets = [
    [0, 8],
    [-8, 0],
    [0, -8],
    [8, 0],
  ];
  const details = CONTROL_ROUTE.flatMap((p, i) =>
    i % 3 === 0
      ? []
      : [
          {
            station: i,
            truth: p.map((v, j) => v + offsets[Math.floor(i / 3)][j]),
            long: whole.points[i].map(
              (v, j) => v + offsets[Math.floor(i / 3)][j],
            ),
            local: local[i].map((v, j) => v + offsets[Math.floor(i / 3)][j]),
          },
        ],
  );
  const outside = (points) =>
    points.filter(
      (p, i) =>
        i % 3 !== 0 &&
        Math.floor(i / 3) !== affectedCell &&
        distance(p, CONTROL_ROUTE[i]) > 1e-8,
    ).length;
  return {
    observations,
    whole,
    cells,
    local,
    affectedCell,
    details,
    longOutside: outside(whole.points),
    localOutside: outside(local),
    longMax: Math.max(
      ...whole.points.map((p, i) => distance(p, CONTROL_ROUTE[i])),
    ),
    localMax: Math.max(...local.map((p, i) => distance(p, CONTROL_ROUTE[i]))),
  };
}

export function rangeIntersections(A, B, rA, rB) {
  if (
    ![A, B].every(
      (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite),
    )
  )
    return { status: "invalid", points: [], baseline: NaN };
  const baseline = distance(A, B);
  if (
    !Number.isFinite(rA) ||
    !Number.isFinite(rB) ||
    rA < 0 ||
    rB < 0 ||
    baseline < 1e-9
  )
    return { status: "invalid", points: [], baseline };
  const tolerance = 1e-9 * Math.max(1, baseline, rA, rB);
  if (
    baseline > rA + rB + tolerance ||
    baseline < Math.abs(rA - rB) - tolerance
  )
    return { status: "inconsistent", points: [], baseline };
  const along = (rA * rA - rB * rB + baseline * baseline) / (2 * baseline);
  const heightSquared = rA * rA - along * along;
  if (heightSquared < -tolerance * Math.max(1, rA))
    return { status: "inconsistent", points: [], baseline };
  const height = Math.sqrt(Math.max(0, heightSquared));
  const unit = [(B[0] - A[0]) / baseline, (B[1] - A[1]) / baseline];
  const foot = A.map((v, i) => v + along * unit[i]);
  const positive = [foot[0] - height * unit[1], foot[1] + height * unit[0]];
  const negative = [foot[0] + height * unit[1], foot[1] - height * unit[0]];
  return {
    status: height < 1e-8 ? "tangent" : "two",
    points: height < 1e-8 ? [positive] : [positive, negative],
    baseline,
    along,
    height,
  };
}
export function rangeGeometry(A, B, P, sigma = 0.5) {
  if (
    ![A, B, P].every((p) => p.every(Number.isFinite)) ||
    !Number.isFinite(sigma) ||
    sigma <= 0
  )
    return null;
  const rA = distance(A, P),
    rB = distance(B, P);
  if (rA < 1e-9 || rB < 1e-9) return null;
  const a = P.map((v, i) => (v - A[i]) / rA),
    b = P.map((v, i) => (v - B[i]) / rB);
  const angle =
    (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))) * 180) /
    Math.PI;
  const xx = a[0] * a[0] + b[0] * b[0],
    xy = a[0] * a[1] + b[0] * b[1],
    yy = a[1] * a[1] + b[1] * b[1];
  const determinant = xx * yy - xy * xy;
  if (determinant < 1e-12) return { angle, singular: true };
  const covariance = [
    [(sigma * sigma * yy) / determinant, (-sigma * sigma * xy) / determinant],
    [(-sigma * sigma * xy) / determinant, (sigma * sigma * xx) / determinant],
  ];
  const half = (covariance[0][0] + covariance[1][1]) / 2;
  const spread = Math.hypot(
    (covariance[0][0] - covariance[1][1]) / 2,
    covariance[0][1],
  );
  const orientation =
    0.5 * Math.atan2(2 * covariance[0][1], covariance[0][0] - covariance[1][1]);
  return {
    angle,
    singular: false,
    covariance,
    major: Math.sqrt(5.991 * (half + spread)),
    minor: Math.sqrt(5.991 * Math.max(0, half - spread)),
    orientation,
  };
}
export function referencePointExample({
  baseline = 70,
  target = [50, 40],
  rangeError = 0,
  sigma = 0.5,
} = {}) {
  const A = [50 - baseline / 2, 0],
    B = [50 + baseline / 2, 0],
    C = [62, 72];
  const rA = distance(A, target),
    rB = distance(B, target) + rangeError;
  const result = rangeIntersections(A, B, rA, rB);
  const P = result.points[0] ?? null;
  return {
    A,
    B,
    C,
    target,
    rA,
    rB,
    result,
    P,
    geometry: P ? rangeGeometry(A, B, P, sigma) : null,
    checkObserved: distance(C, target),
    checkComputed: P ? distance(C, P) : null,
    checkResidual: P ? distance(C, P) - distance(C, target) : null,
    positionError: P ? distance(P, target) : null,
  };
}
