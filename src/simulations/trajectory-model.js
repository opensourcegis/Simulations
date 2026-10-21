import {
  DEG,
  G,
  add,
  sub,
  scale,
  norm,
  qmul,
  qinv,
  qunit,
  qexp,
  qlog,
  qEuler,
  eulerQ,
  rotate,
  unrotate,
  qslerp,
  rotation,
  eye,
  transpose,
  mm,
  mv,
  inverse,
  skew,
  symmetrize,
  noiseSource,
} from "./navigation-math.js";
import { SURVEY_MOUNTS } from "./survey-mounts.js";

const N = 15,
  gravity = [0, 0, -G];
export const TRAJECTORY_DEFAULTS = {
  duration: 60,
  dt: 0.02,
  gnssSigma: 0.4,
  gnssRate: 1,
  outageStart: 20,
  outageDuration: 20,
  accelBias: 0.035,
  gyroBias: 0.035,
  noise: 1,
  gate: true,
  outlier: false,
  initialError: 1,
  initialTilt: 0.15,
};
const copy = (s) => ({
  p: s.p.slice(),
  v: s.v.slice(),
  q: s.q.slice(),
  ba: s.ba.slice(),
  bg: s.bg.slice(),
});
const velocities = (t) => [
  8 + 1.2 * Math.sin(0.07 * t),
  3 * Math.sin(0.14 * t),
  0.2 * Math.cos(0.12 * t),
];
function attitude(t) {
  const v = velocities(t),
    vp = velocities(t + 0.001),
    vm = velocities(t - 0.001),
    a = scale(sub(vp, vm), 500);
  const yaw = Math.atan2(v[1], v[0]),
    yawRate = (v[0] * a[1] - v[1] * a[0]) / (v[0] ** 2 + v[1] ** 2);
  return eulerQ(
    -Math.atan2(yawRate * Math.hypot(v[0], v[1]), G),
    -Math.atan2(v[2], Math.hypot(v[0], v[1])),
    yaw,
  );
}
function inject(s, x) {
  return {
    p: add(s.p, x.slice(0, 3)),
    v: add(s.v, x.slice(3, 6)),
    q: qunit(qmul(s.q, qexp(x.slice(6, 9)))),
    ba: add(s.ba, x.slice(9, 12)),
    bg: add(s.bg, x.slice(12, 15)),
  };
}
function difference(a, b) {
  return [
    ...sub(a.p, b.p),
    ...sub(a.v, b.v),
    ...qlog(qmul(qinv(b.q), a.q)),
    ...sub(a.ba, b.ba),
    ...sub(a.bg, b.bg),
  ];
}
function transition(s, force, omega, dt) {
  const f = sub(force, s.ba),
    w = sub(omega, s.bg),
    r = rotation(qmul(s.q, qexp(scale(w, dt / 2))));
  const a = add(mv(r, f, 3), gravity),
    next = {
      ...copy(s),
      p: add(s.p, add(scale(s.v, dt), scale(a, 0.5 * dt * dt))),
      v: add(s.v, scale(a, dt)),
      q: qunit(qmul(s.q, qexp(scale(w, dt)))),
    };
  const F = eye(N),
    rf = mm(r, skew(f), 3),
    sw = skew(w);
  for (let i = 0; i < 3; i++) {
    F[i * N + 3 + i] = dt;
    for (let j = 0; j < 3; j++) {
      F[(3 + i) * N + 6 + j] = -rf[i * 3 + j] * dt;
      F[(3 + i) * N + 9 + j] = -r[i * 3 + j] * dt;
      F[i * N + 6 + j] = -rf[i * 3 + j] * 0.5 * dt * dt;
      F[i * N + 9 + j] = -r[i * 3 + j] * 0.5 * dt * dt;
      F[(6 + i) * N + 6 + j] -= sw[i * 3 + j] * dt;
    }
    F[(6 + i) * N + 12 + i] = -dt;
  }
  return { next, F, r };
}
function processNoise(dt, c) {
  const Q = new Float64Array(N * N),
    variance = (0.018 * c.noise) ** 2,
    gyro = (0.004 * DEG * c.noise) ** 2;
  // Independent per-sample white IMU noise, plus declared bias random walks.
  for (let i = 0; i < 3; i++) {
    Q[i * N + i] = variance * 0.25 * dt ** 4;
    Q[(3 + i) * N + 3 + i] = variance * dt * dt;
    Q[i * N + 3 + i] = Q[(3 + i) * N + i] = variance * 0.5 * dt ** 3;
    Q[(6 + i) * N + 6 + i] = gyro * dt * dt;
    Q[(9 + i) * N + 9 + i] = 0.0003 ** 2 * dt;
    Q[(12 + i) * N + 12 + i] = (0.0003 * DEG) ** 2 * dt;
  }
  return Q;
}
export function positionUpdate(s, P, z, sigma, gate = true) {
  const lever = SURVEY_MOUNTS.gps,
    r = rotation(s.q),
    h = add(s.p, rotate(s.q, lever)),
    H = new Float64Array(3 * N),
    angular = mm(r, skew(lever), 3);
  for (let i = 0; i < 3; i++) {
    H[i * N + i] = 1;
    for (let j = 0; j < 3; j++) H[i * N + 6 + j] = -angular[i * 3 + j];
  }
  const innovation = sub(z, h),
    HT = transpose(H, 3, N),
    PH = mm(P, HT, N, N, 3),
    S = mm(H, PH, 3, N, 3);
  for (let i = 0; i < 3; i++) S[i * 3 + i] += sigma * sigma;
  const SI = inverse(S, 3),
    nis = innovation.reduce((v, x, i) => v + x * mv(SI, innovation, 3)[i], 0);
  const evidence = {
    predictedEast: s.p[0],
    sigmaBefore: Math.sqrt(P[0]),
    antennaPrediction: h,
    innovationVariance: Array.from(S),
  };
  if (gate && nis > 16.27)
    return {
      state: s,
      P,
      innovation,
      nis,
      accepted: false,
      gain: 0,
      trace: {
        ...evidence,
        eastGain: [0, 0, 0],
        eastCorrection: 0,
        correctedEast: s.p[0],
        sigmaAfter: Math.sqrt(P[0]),
      },
    };
  const K = mm(PH, SI, N, 3, 3),
    delta = mv(K, innovation, N),
    I = eye(N),
    KH = mm(K, H, N, 3, N);
  for (let i = 0; i < N * N; i++) I[i] -= KH[i];
  const corrected = mm(mm(I, P, N), transpose(I, N), N),
    KK = mm(K, transpose(K, N, 3), N, 3, N);
  for (let i = 0; i < N * N; i++) corrected[i] += KK[i] * sigma * sigma;
  const reset = eye(N),
    angle = skew(delta.slice(6, 9));
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      reset[(6 + i) * N + 6 + j] -= 0.5 * angle[i * 3 + j];
  return {
    state: inject(s, delta),
    P: symmetrize(mm(mm(reset, corrected, N), transpose(reset, N), N), N),
    innovation,
    nis,
    accepted: true,
    gain: (K[0] + K[4] + K[8]) / 3,
    trace: {
      ...evidence,
      eastGain: Array.from(K.slice(0, 3)),
      eastCorrection: delta[0],
      correctedEast: s.p[0] + delta[0],
      sigmaAfter: Math.sqrt(corrected[0]),
    },
  };
}
export function makeTrajectory(options = {}) {
  const c = { ...TRAJECTORY_DEFAULTS, ...options },
    rand = noiseSource(632),
    gnssNoise = noiseSource(854),
    records = [];
  const ba = [1, -0.55, 0.35].map((v) => v * c.accelBias),
    bg = [0.25, -0.15, 1].map((v) => v * c.gyroBias * DEG);
  let truth = {
    p: [0, 0, 80],
    v: velocities(0),
    q: attitude(0),
    ba: ba.slice(),
    bg: bg.slice(),
  };
  const initialGnss = add(
    add(truth.p, rotate(truth.q, SURVEY_MOUNTS.gps)),
    [gnssNoise(), gnssNoise(), gnssNoise()].map((v) => v * c.gnssSigma),
  );
  let state = {
    ...copy(truth),
    p: truth.p.slice(),
    ba: [0, 0, 0],
    bg: [0, 0, 0],
    v: add(
      truth.v,
      [rand(), rand(), rand()].map((v) => v * 0.1 * c.noise),
    ),
    q: qmul(
      truth.q,
      qexp([
        c.initialTilt * DEG,
        ((c.initialTilt * 2) / 3) * DEG,
        c.initialError * DEG,
      ]),
    ),
  };
  state.p = sub(initialGnss, rotate(state.q, SURVEY_MOUNTS.gps));
  let raw = copy(state),
    P = new Float64Array(N * N);
  const sigmas = [
    ...new Array(3).fill(c.gnssSigma),
    ...new Array(3).fill(0.15),
    DEG,
    DEG,
    3 * DEG,
    ...new Array(3).fill(0.08),
    ...new Array(3).fill(0.1 * DEG),
  ];
  for (let i = 0; i < N; i++) P[i * N + i] = sigmas[i] ** 2;
  const cadence = Math.max(1, Math.round(1 / (c.gnssRate * c.dt)));
  let predicted = copy(state),
    predictedP = P.slice(),
    F = eye(N),
    gnss = null;
  for (let i = 0; i <= Math.round(c.duration / c.dt); i++) {
    const t = i * c.dt,
      qn = attitude(t + c.dt),
      vn = velocities(t + c.dt),
      omega = scale(qlog(qmul(qinv(truth.q), qn)), 1 / c.dt),
      a = scale(sub(vn, truth.v), 1 / c.dt),
      midQ = qslerp(truth.q, qn, 0.5);
    const idealForce = unrotate(midQ, sub(a, gravity));
    const force = idealForce.map(
        (v, j) => v + ba[j] + rand() * 0.018 * c.noise,
      ),
      gyro = omega.map((v, j) => v + bg[j] + rand() * 0.004 * DEG * c.noise);
    const outage = t >= c.outageStart && t < c.outageStart + c.outageDuration;
    gnss = null;
    if (i > 0 && i % cadence === 0) {
      const z = add(
        add(truth.p, rotate(truth.q, SURVEY_MOUNTS.gps)),
        [gnssNoise(), gnssNoise(), gnssNoise()].map((v) => v * c.gnssSigma),
      );
      if (c.outlier && Math.abs(t - 46) < c.dt / 2) z[0] += 30;
      if (!outage) {
        const update = positionUpdate(state, P, z, c.gnssSigma, c.gate);
        state = update.state;
        P = update.P;
        gnss = { ...update, z };
        delete gnss.state;
        delete gnss.P;
      }
    }
    const theta = 25 * DEG * Math.sin(2 * Math.PI * 0.8 * t),
      direction = [0, Math.sin(theta), -Math.cos(theta)],
      origin = add(truth.p, rotate(truth.q, SURVEY_MOUNTS.scanner)),
      navDirection = rotate(truth.q, direction),
      range = -origin[2] / navDirection[2];
    records.push({
      t,
      truth: copy(truth),
      raw: copy(raw),
      filtered: copy(state),
      P: P.slice(),
      predicted,
      predictedP,
      F,
      force,
      omega: gyro,
      gnss,
      outage,
      shot: {
        direction,
        range,
        truth: add(origin, scale(navDirection, range)),
      },
    });
    const propagated = transition(state, force, gyro, c.dt),
      Q = processNoise(c.dt, c);
    predictedP = mm(mm(propagated.F, P, N), transpose(propagated.F, N), N);
    for (let j = 0; j < N * N; j++) predictedP[j] += Q[j];
    predictedP = symmetrize(predictedP, N);
    predicted = copy(propagated.next);
    F = propagated.F;
    state = propagated.next;
    P = predictedP;
    raw = transition(raw, force, gyro, c.dt).next;
    truth = {
      ...truth,
      p: add(truth.p, scale(add(truth.v, vn), 0.5 * c.dt)),
      v: vn,
      q: qn,
    };
  }
  // Extended Rauch–Tung–Striebel recursion in the local error coordinates.
  let smoothed = copy(records.at(-1).filtered),
    SP = records.at(-1).P.slice();
  records.at(-1).smoothed = smoothed;
  records.at(-1).smoothP = SP;
  for (let k = records.length - 2; k >= 0; k--) {
    const current = records[k],
      next = records[k + 1],
      C = mm(
        mm(current.P, transpose(next.F, N), N),
        inverse(next.predictedP, N),
        N,
      );
    const correction = mv(C, difference(smoothed, next.predicted), N);
    smoothed = inject(current.filtered, correction);
    const delta = new Float64Array(N * N);
    for (let j = 0; j < N * N; j++) delta[j] = SP[j] - next.predictedP[j];
    const dP = mm(mm(C, delta, N), transpose(C, N), N);
    SP = Float64Array.from(current.P, (v, j) => v + dP[j]);
    symmetrize(SP, N);
    current.smoothed = smoothed;
    current.smoothP = SP;
  }
  for (const row of records) {
    row.error = {};
    for (const key of ["raw", "filtered", "smoothed"])
      row.error[key] = norm(sub(row[key].p, row.truth.p));
  }
  const rms = (key) =>
    Math.sqrt(
      records.reduce((s, r) => s + r.error[key] ** 2, 0) / records.length,
    );
  return {
    config: c,
    records,
    rms: {
      raw: rms("raw"),
      filtered: rms("filtered"),
      smoothed: rms("smoothed"),
    },
    trueBias: { ba, bg },
    accepted: records.filter((r) => r.gnss?.accepted).length,
    rejected: records.filter((r) => r.gnss && !r.gnss.accepted).length,
  };
}
export function trajectoryAt(records, t, mode = "smoothed") {
  if (t < records[0].t || t > records.at(-1).t) return null;
  const dt = records[1].t - records[0].t,
    i = Math.min(records.length - 2, Math.floor(t / dt)),
    a = records[i][mode],
    b = records[i + 1][mode],
    u = (t - records[i].t) / dt;
  return {
    p: add(a.p, scale(sub(b.p, a.p), u)),
    v: add(a.v, scale(sub(b.v, a.v), u)),
    q: qslerp(a.q, b.q, u),
    ba: add(a.ba, scale(sub(b.ba, a.ba), u)),
    bg: add(a.bg, scale(sub(b.bg, a.bg), u)),
  };
}
export function lidarEndpoint(state, shot, { lever = true } = {}) {
  return add(
    state.p,
    rotate(
      state.q,
      add(
        lever ? SURVEY_MOUNTS.scanner : [0, 0, 0],
        scale(shot.direction, shot.range),
      ),
    ),
  );
}
export const SBET_FIELDS = [
  "time_sow_s",
  "latitude_rad",
  "longitude_rad",
  "ellipsoid_height_m",
  "velocity_north_m_s",
  "velocity_east_m_s",
  "velocity_down_m_s",
  "roll_rad",
  "pitch_rad",
  "heading_rad",
  "wander_angle_rad",
  "body_ax_m_s2",
  "body_ay_m_s2",
  "body_az_m_s2",
  "body_wx_rad_s",
  "body_wy_rad_s",
  "body_wz_rad_s",
];
export function sbetRow(record, mode = "smoothed") {
  const s = record[mode],
    lat0 = 12.97 * DEG,
    lon0 = 77.59 * DEG,
    a = 6378137,
    e2 = 6.69437999014e-3,
    w = Math.sqrt(1 - e2 * Math.sin(lat0) ** 2),
    Rn = a / w,
    Rm = (a * (1 - e2)) / w ** 3;
  const [roll, pitch, yaw] = qEuler(s.q),
    bodyAcceleration = add(sub(record.force, s.ba), unrotate(s.q, gravity)),
    bodyRate = sub(record.omega, s.bg);
  return [
    250000 + record.t,
    lat0 + s.p[1] / (Rm + 800),
    lon0 + s.p[0] / ((Rn + 800) * Math.cos(lat0)),
    800 + s.p[2],
    s.v[1],
    s.v[0],
    -s.v[2],
    roll,
    -pitch,
    (Math.PI / 2 - yaw + 2 * Math.PI) % (2 * Math.PI),
    0,
    bodyAcceleration[0],
    -bodyAcceleration[1],
    -bodyAcceleration[2],
    bodyRate[0],
    -bodyRate[1],
    -bodyRate[2],
  ];
}
export function sbetCsv(result, mode = "smoothed") {
  return [
    SBET_FIELDS.join(","),
    ...result.records
      .filter((_, i) => i % 5 === 0)
      .map((r) =>
        sbetRow(r, mode)
          .map((v) => v.toPrecision(12))
          .join(","),
      ),
  ].join("\n");
}
