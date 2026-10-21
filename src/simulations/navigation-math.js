// Local ENU navigation, right-handed body FLU, quaternion [w,x,y,z].
export const DEG = Math.PI / 180;
export const G = 9.80665;
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const sub = (a, b) => a.map((v, i) => v - b[i]);
export const scale = (a, s) => a.map((v) => v * s);
export const norm = (a) => Math.hypot(...a);
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export function qmul(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}
export const qinv = (q) => [q[0], -q[1], -q[2], -q[3]];
export const qunit = (q) => scale(q, 1 / norm(q));
export function qexp(v) {
  const a = norm(v);
  return a < 1e-10
    ? qunit([1, ...scale(v, 0.5)])
    : [Math.cos(a / 2), ...scale(v, Math.sin(a / 2) / a)];
}
export function qlog(input) {
  const q = input[0] < 0 ? scale(input, -1) : input;
  const a = norm(q.slice(1));
  return a < 1e-10
    ? scale(q.slice(1), 2)
    : scale(q.slice(1), (2 * Math.atan2(a, q[0])) / a);
}
export function eulerQ(roll, pitch, yaw) {
  return qmul(qmul(qexp([0, 0, yaw]), qexp([0, pitch, 0])), qexp([roll, 0, 0]));
}
export function qEuler(q) {
  const r = rotation(q);
  return [
    Math.atan2(r[7], r[8]),
    Math.asin(Math.max(-1, Math.min(1, -r[6]))),
    Math.atan2(r[3], r[0]),
  ];
}
export function rotation([w, x, y, z]) {
  return [
    1 - 2 * (y * y + z * z),
    2 * (x * y - w * z),
    2 * (x * z + w * y),
    2 * (x * y + w * z),
    1 - 2 * (x * x + z * z),
    2 * (y * z - w * x),
    2 * (x * z - w * y),
    2 * (y * z + w * x),
    1 - 2 * (x * x + y * y),
  ];
}
export function rotate(q, v) {
  const r = rotation(q);
  return [
    r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
    r[3] * v[0] + r[4] * v[1] + r[5] * v[2],
    r[6] * v[0] + r[7] * v[1] + r[8] * v[2],
  ];
}
export const unrotate = (q, v) => rotate(qinv(q), v);
export const qslerp = (a, b, t) =>
  qunit(qmul(a, qexp(scale(qlog(qmul(qinv(a), b)), t))));
export const eye = (n) => {
  const a = new Float64Array(n * n);
  for (let i = 0; i < n; i++) a[i * n + i] = 1;
  return a;
};
export function transpose(a, n, m = n) {
  const b = new Float64Array(a.length);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) b[j * n + i] = a[i * m + j];
  return b;
}
export function mm(a, b, n, m = n, k = n) {
  const c = new Float64Array(n * k);
  for (let i = 0; i < n; i++)
    for (let l = 0; l < m; l++) {
      const v = a[i * m + l];
      if (v === 0) continue;
      for (let j = 0; j < k; j++) c[i * k + j] += v * b[l * k + j];
    }
  return c;
}
export function mv(a, x, n = x.length) {
  const y = new Array(n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < x.length; j++) y[i] += a[i * x.length + j] * x[j];
  return y;
}
export function inverse(a, n) {
  const b = Float64Array.from(a),
    out = eye(n);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++)
      if (Math.abs(b[r * n + i]) > Math.abs(b[pivot * n + i])) pivot = r;
    if (Math.abs(b[pivot * n + i]) < 1e-18)
      throw new Error("Singular navigation covariance");
    if (pivot !== i)
      for (let j = 0; j < n; j++) {
        [b[i * n + j], b[pivot * n + j]] = [b[pivot * n + j], b[i * n + j]];
        [out[i * n + j], out[pivot * n + j]] = [
          out[pivot * n + j],
          out[i * n + j],
        ];
      }
    const d = b[i * n + i];
    for (let j = 0; j < n; j++) {
      b[i * n + j] /= d;
      out[i * n + j] /= d;
    }
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const v = b[r * n + i];
      for (let j = 0; j < n; j++) {
        b[r * n + j] -= v * b[i * n + j];
        out[r * n + j] -= v * out[i * n + j];
      }
    }
  }
  return out;
}
export const skew = ([x, y, z]) => [0, -z, y, z, 0, -x, -y, x, 0];
export function symmetrize(a, n) {
  for (let i = 0; i < n; i++) {
    a[i * n + i] = Math.max(1e-15, a[i * n + i]);
    for (let j = 0; j < i; j++) {
      const v = (a[i * n + j] + a[j * n + i]) / 2;
      a[i * n + j] = a[j * n + i] = v;
    }
  }
  return a;
}
export function noiseSource(seed = 71) {
  let spare = null;
  const uniform = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + 0.5) / 4294967296;
  };
  return () => {
    if (spare !== null) {
      const v = spare;
      spare = null;
      return v;
    }
    const a = Math.sqrt(-2 * Math.log(uniform())),
      b = 2 * Math.PI * uniform();
    spare = a * Math.sin(b);
    return a * Math.cos(b);
  };
}
