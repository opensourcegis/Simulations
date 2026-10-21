import {
  identity,
  mv,
  mm,
  transpose,
  norm,
  weightedLeastSquares,
  ellipse95,
} from "./least-squares-math.js";
const DEG = Math.PI / 180,
  C = 299792458;
export const LS_CASES = {
  mean: "Weighted mean",
  level: "Levelling network",
  baseline: "GNSS baselines",
  code: "GNSS code positioning",
};
export const STATIONS = [
  { id: "A", e: 0, n: 0, h: 100 },
  { id: "B", e: 600, n: 200, h: 102.32 },
  { id: "C", e: 250, n: 850, h: 99.9 },
  { id: "D", e: 1300, n: 750, h: 103.18 },
];
const EDGES = [
  ["A", "B"],
  ["A", "C"],
  ["B", "C"],
  ["B", "D"],
  ["C", "D"],
  ["A", "D"],
];
export function makeLeastSquaresExample(kind = "level", options = {}) {
  if (kind === "mean")
    return {
      kind,
      observations: [100.012, 99.996, 100.008, 100.021].map((value, i) => ({
        id: `H${i + 1}`,
        label: `Independent height ${i + 1}`,
        value,
        sigma: [0.004, 0.006, 0.003, 0.012][i],
        active: true,
      })),
      stations: [{ id: "H", e: 0, n: 0, h: 100 }],
      initial: [100],
    };
  if (kind === "level")
    return {
      kind,
      stations: STATIONS.map((p) => ({ ...p })),
      observations: [2.3465, -0.125, -2.4711, 0.867, 3.3352, 3.2092].map(
        (value, i) => ({
          id: `L${i + 1}`,
          label: `${EDGES[i][0]} → ${EDGES[i][1]}`,
          from: EDGES[i][0],
          to: EDGES[i][1],
          length: [0.8, 1.1, 0.9, 0.95, 1.2, 1.8][i],
          value,
          sigma: 0.002 * Math.sqrt([0.8, 1.1, 0.9, 0.95, 1.2, 1.8][i]),
          active: true,
        }),
      ),
    };
  if (kind === "baseline") {
    const stations = [
      { id: "A", e: 0, n: 0, h: 0 },
      { id: "B", e: 120.03, n: 49.97, h: 8.04 },
      { id: "C", e: 54.98, n: 140.02, h: 13.97 },
      { id: "D", e: 190.04, n: 155.03, h: 4.03 },
    ];
    const values = [
      [120.004, 49.997, 8.014],
      [54.995, 140.008, 13.989],
      [-65.006, 90.003, 6.008],
      [70.007, 104.995, -4.009],
      [135.002, 15.006, -9.979],
      [190.003, 155.004, 4.006],
    ];
    return {
      kind,
      stations,
      observations: values.flatMap((v, i) =>
        v.map((value, j) => ({
          id: `G${i + 1}${["E", "N", "U"][j]}`,
          label: `${EDGES[i][0]} → ${EDGES[i][1]} · ${["ΔE", "ΔN", "ΔU"][j]}`,
          from: EDGES[i][0],
          to: EDGES[i][1],
          block: i,
          axis: j,
          value,
          sigma: [
            [0.005, 0.006, 0.012],
            [0.007, 0.005, 0.016],
            [0.004, 0.008, 0.01],
            [0.009, 0.005, 0.02],
            [0.006, 0.009, 0.014],
            [0.005, 0.007, 0.025],
          ][i][j],
          active: true,
        })),
      ),
    };
  }
  return makeCodeExample(options);
}
export function ecefFromGeodetic(lat, lon, h) {
  const a = 6378137,
    e2 = 6.69437999014e-3,
    N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  return [
    (N + h) * Math.cos(lat) * Math.cos(lon),
    (N + h) * Math.cos(lat) * Math.sin(lon),
    (N * (1 - e2) + h) * Math.sin(lat),
  ];
}
export function enuRotation(lat, lon) {
  return [
    [-Math.sin(lon), Math.cos(lon), 0],
    [
      -Math.sin(lat) * Math.cos(lon),
      -Math.sin(lat) * Math.sin(lon),
      Math.cos(lat),
    ],
    [
      Math.cos(lat) * Math.cos(lon),
      Math.cos(lat) * Math.sin(lon),
      Math.sin(lat),
    ],
  ];
}
export function geodeticFromEcef([x, y, z]) {
  const a = 6378137,
    e2 = 6.69437999014e-3,
    p = Math.hypot(x, y),
    lon = Math.atan2(y, x);
  let lat = Math.atan2(z, p * (1 - e2)),
    h = 0;
  for (let i = 0; i < 10; i++) {
    const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    h = p / Math.cos(lat) - N;
    lat = Math.atan2(z, p * (1 - (e2 * N) / (N + h)));
  }
  return { lat, lon, h };
}
export function makeCodeExample({
  geometry = "spread",
  initialOffset = 1,
} = {}) {
  const reference = { lat: 12.97 * DEG, lon: 77.59 * DEG, h: 850 },
    receiver = ecefFromGeodetic(reference.lat, reference.lon, reference.h),
    R = enuRotation(reference.lat, reference.lon),
    satellites = [];
  const sky =
    geometry === "spread"
      ? [
          [20, 70],
          [75, 35],
          [130, 50],
          [185, 25],
          [230, 65],
          [285, 30],
          [325, 45],
          [30, 20],
        ]
      : [
          [45, 57],
          [52, 60],
          [60, 67],
          [65, 62],
          [72, 71],
          [79, 64],
          [85, 59],
          [92, 68],
        ];
  const errors = [0.55, -1.05, 0.32, 0.9, -0.48, 1.24, -0.82, 0.4];
  for (let i = 0; i < sky.length; i++) {
    const [az, el] = sky[i].map((v) => v * DEG),
      d = mv(transpose(R), [
        Math.cos(el) * Math.sin(az),
        Math.cos(el) * Math.cos(az),
        Math.sin(el),
      ]),
      projection = receiver.reduce((s, v, j) => s + v * d[j], 0),
      range =
        -projection +
        Math.sqrt(projection ** 2 + 26560000 ** 2 - norm(receiver) ** 2),
      position = receiver.map((v, j) => v + range * d[j]);
    satellites.push({
      id: `S${i + 1}`,
      az: sky[i][0],
      el: sky[i][1],
      position,
      value: range + 75 + errors[i],
      sigma: 0.6 / Math.sin(el),
      active: true,
      label: `S${i + 1} · ${sky[i][1]}° elevation`,
    });
  }
  const offset = mv(transpose(R), [
    2000 * initialOffset,
    -1500 * initialOffset,
    800 * initialOffset,
  ]);
  return {
    kind: "code",
    reference,
    observations: satellites.map((s) => ({ ...s })),
    initial: [...receiver.map((v, i) => v + offset[i]), 0],
    geometry,
  };
}
function observationModel(data, x, parameters, datum) {
  const index = Object.fromEntries(parameters.map((p, i) => [p.id, i])),
    value = (station, axis = 0) =>
      station === "A" && datum === "fixed"
        ? data.kind === "level"
          ? 100
          : 0
        : x[
            index[
              data.kind === "level"
                ? `H_${station}`
                : `${["E", "N", "U"][axis]}_${station}`
            ]
          ];
  const rows = data.observations.filter((o) => o.active);
  if (data.kind === "mean")
    return { rows, A: rows.map(() => [1]), predicted: rows.map(() => x[0]) };
  if (data.kind === "code")
    return {
      rows,
      A: rows.map((o) => {
        const delta = x.slice(0, 3).map((v, i) => v - o.position[i]),
          distance = norm(delta);
        return [...delta.map((v) => v / distance), 1];
      }),
      predicted: rows.map(
        (o) => norm(o.position.map((v, i) => v - x[i])) + x[3],
      ),
    };
  const A = [],
    predicted = [];
  for (const o of rows) {
    const a = new Array(parameters.length).fill(0);
    for (const [station, sign] of [
      [o.from, -1],
      [o.to, 1],
    ]) {
      const id =
        data.kind === "level"
          ? `H_${station}`
          : `${["E", "N", "U"][o.axis]}_${station}`;
      if (index[id] !== undefined) a[index[id]] = sign;
    }
    A.push(a);
    predicted.push(value(o.to, o.axis) - value(o.from, o.axis));
  }
  if (datum === "weighted")
    for (const axis of data.kind === "level" ? [0] : [0, 1, 2]) {
      const id = data.kind === "level" ? "H_A" : `${["E", "N", "U"][axis]}_A`,
        a = new Array(parameters.length).fill(0);
      a[index[id]] = 1;
      rows.push({
        id: `CTRL${axis}`,
        label: `Surveyed A ${data.kind === "level" ? "height" : ["East", "North", "Up"][axis]}`,
        value: data.kind === "level" ? 100 : 0,
        sigma: data.kind === "level" ? 0.003 : axis === 2 ? 0.02 : 0.01,
        active: true,
        control: true,
      });
      A.push(a);
      predicted.push(x[index[id]]);
    }
  return { rows, A, predicted };
}
function parametersFor(data, datum) {
  if (data.kind === "mean")
    return [{ id: "H", label: "H", initial: data.initial[0] }];
  if (data.kind === "code")
    return ["X", "Y", "Z", "b"].map((id, i) => ({
      id,
      label: id === "b" ? "Clock range b" : `ECEF ${id}`,
      initial: data.initial[i],
    }));
  return data.stations
    .filter((p) => datum !== "fixed" || p.id !== "A")
    .flatMap((p) =>
      data.kind === "level"
        ? [{ id: `H_${p.id}`, label: `H${p.id}`, initial: p.h }]
        : [p.e, p.n, p.h].map((v, i) => ({
            id: `${["E", "N", "U"][i]}_${p.id}`,
            label: `${["E", "N", "U"][i]}${p.id}`,
            initial: v,
          })),
    );
}
function covarianceFor(
  rows,
  { weightMode, correlation, correlated, sigmaScale, kind },
) {
  const common =
      kind === "level"
        ? 0.002
        : kind === "mean"
          ? 0.006
          : kind === "baseline"
            ? 0.008
            : 1.2,
    C = rows.map((o, i) =>
      rows.map((p, j) => {
        const si = (weightMode === "equal" ? common : o.sigma) * sigmaScale,
          sj = (weightMode === "equal" ? common : p.sigma) * sigmaScale;
        if (i === j) return si * si;
        if (
          weightMode === "equal" ||
          !correlated ||
          kind !== "baseline" ||
          o.control ||
          p.control ||
          o.block !== p.block
        )
          return 0;
        const pair = [o.axis, p.axis].sort().join("");
        return (
          (pair === "01" ? correlation : pair === "02" ? 0.2 : -0.1) * si * sj
        );
      }),
    );
  return C;
}
export function solveLeastSquaresExample(data, options = {}) {
  const settings = {
      datum: "fixed",
      weightMode: "stated",
      correlation: 0.45,
      correlated: true,
      sigmaScale: 1,
      ...options,
    },
    parameters = parametersFor(data, settings.datum),
    iterations = [];
  let x = parameters.map((p) => p.initial),
    converged = false;
  for (
    let iteration = 0;
    iteration < (data.kind === "code" ? 10 : 1);
    iteration++
  ) {
    const model = observationModel(data, x, parameters, settings.datum),
      w = model.rows.map((o, i) => o.value - model.predicted[i]),
      Sigma = covarianceFor(model.rows, { ...settings, kind: data.kind });
    if (!model.rows.length)
      return {
        data,
        settings,
        parameters,
        iterations,
        error: "There are no active observations.",
        rank: 0,
      };
    const fit = weightedLeastSquares(model.A, w, Sigma);
    if (fit.error)
      return {
        data,
        settings,
        parameters,
        iterations,
        model,
        fit,
        error: fit.error,
        rank: fit.rank,
      };
    const after = x.map((v, i) => v + fit.dx[i]),
      afterModel = observationModel(data, after, parameters, settings.datum),
      exactResidual = afterModel.predicted.map(
        (v, i) => v - model.rows[i].value,
      ),
      afterObjective = exactResidual.reduce(
        (sum, v, i) => sum + v * mv(fit.P, exactResidual)[i],
        0,
      );
    converged =
      data.kind !== "code" ||
      (norm(fit.dx.slice(0, 3)) < 1e-5 && Math.abs(fit.dx[3]) < 1e-5);
    iterations.push({
      iteration,
      before: x,
      after,
      model,
      fit,
      exactResidual,
      afterObjective,
      converged,
    });
    x = after;
    if (converged) break;
  }
  const final = iterations.at(-1),
    stations = data.stations?.map((p) => {
      const at = (id) => {
        const i = parameters.findIndex((q) => q.id === id);
        return i < 0 ? null : i;
      };
      if (data.kind === "mean")
        return {
          ...p,
          adjustedHeight: x[0],
          sigma: Math.sqrt(final.fit.Cx[0][0]),
        };
      if (data.kind === "level") {
        const i = at(`H_${p.id}`);
        return {
          ...p,
          adjustedHeight: i === null ? 100 : x[i],
          sigma: i === null ? 0 : Math.sqrt(final.fit.Cx[i][i]),
        };
      }
      const ids = ["E", "N", "U"].map((a) => at(`${a}_${p.id}`)),
        adjusted = ids.map((i) => (i === null ? 0 : x[i]));
      return {
        ...p,
        e: adjusted[0],
        n: adjusted[1],
        h: adjusted[2],
        adjusted,
        ellipse:
          ids[0] === null
            ? null
            : ellipse95([
                [final.fit.Cx[ids[0]][ids[0]], final.fit.Cx[ids[0]][ids[1]]],
                [final.fit.Cx[ids[1]][ids[0]], final.fit.Cx[ids[1]][ids[1]]],
              ]),
      };
    });
  let gnss = null;
  if (data.kind === "code") {
    const geometryFit = weightedLeastSquares(
      final.model.A,
      new Array(final.model.rows.length).fill(0),
      identity(final.model.rows.length),
    );
    const R = enuRotation(data.reference.lat, data.reference.lon),
      ecef = final.fit.Cx.slice(0, 3).map((r) => r.slice(0, 3)),
      enu = mm(mm(R, ecef), transpose(R));
    gnss = {
      geodetic: geodeticFromEcef(x),
      clockNs: (x[3] / C) * 1e9,
      enuCovariance: enu,
      ellipse: ellipse95(enu),
      pdop: Math.sqrt(
        geometryFit.Cx[0][0] + geometryFit.Cx[1][1] + geometryFit.Cx[2][2],
      ),
      gdop: Math.sqrt(geometryFit.Cx.reduce((sum, r, i) => sum + r[i], 0)),
    };
  }
  return {
    data,
    settings,
    parameters,
    iterations,
    final,
    converged,
    stations,
    gnss,
  };
}
export function levelClosures(data, result) {
  if (data.kind !== "level") return [];
  const paths = [
      [0, 2, 1],
      [0, 3, 5],
      [1, 4, 5],
    ],
    signs = [1, 1, -1];
  return paths.map((ids, i) => {
    const enabled = ids.every((j) => data.observations[j].active),
      raw = enabled
        ? ids.reduce((s, j, k) => s + signs[k] * data.observations[j].value, 0)
        : null;
    const after =
      enabled && result?.final
        ? ids.reduce((s, j, k) => {
            const row = result.final.model.rows.findIndex(
              (o) => o.id === data.observations[j].id,
            );
            return (
              s +
              signs[k] *
                (data.observations[j].value + result.final.exactResidual[row])
            );
          }, 0)
        : null;
    return {
      label: ["A → B → C → A", "A → B → D → A", "A → C → D → A"][i],
      raw,
      after,
    };
  });
}
export function adjustmentCsv(result) {
  if (!result.final) return "";
  const { model, fit, exactResidual } = result.final;
  return [
    "observation,measured_m,adjusted_m,residual_m,stated_sigma_m,assumed_marginal_sigma_m,normalized_residual,generalized_redundancy",
    ...model.rows.map((o, i) =>
      [
        o.id,
        o.value,
        o.value + exactResidual[i],
        exactResidual[i],
        o.sigma,
        Math.sqrt(fit.Sigma[i][i]),
        fit.normalized[i] ?? "",
        fit.redundancy[i],
      ].join(","),
    ),
  ].join("\n");
}
