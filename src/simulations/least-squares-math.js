// Small dense generalized least squares. Solve the whitened system with
// column-pivoted Householder QR; normal equations are exposed for teaching.
export const transpose = (a) => a[0].map((_, j) => a.map((r) => r[j]));
export const zeros = (n, m = n) =>
  Array.from({ length: n }, () => new Array(m).fill(0));
export const identity = (n) =>
  zeros(n).map((r, i) => r.map((_, j) => (i === j ? 1 : 0)));
export const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
export const mv = (a, x) => a.map((r) => dot(r, x));
export const mm = (a, b) => a.map((r) => transpose(b).map((c) => dot(r, c)));
export const norm = (a) => Math.hypot(...a);
export function cholesky(a) {
  const n = a.length,
    L = zeros(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let v = a[i][j];
      for (let k = 0; k < j; k++) v -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(v > 0))
          throw new Error(
            "The observation covariance must be positive definite.",
          );
        L[i][j] = Math.sqrt(v);
      } else L[i][j] = v / L[j][j];
    }
  return L;
}
export function forward(L, b) {
  const x = [];
  for (let i = 0; i < L.length; i++) {
    let v = b[i];
    for (let j = 0; j < i; j++) v -= L[i][j] * x[j];
    x[i] = v / L[i][i];
  }
  return x;
}
function back(R, b) {
  const x = new Array(b.length).fill(0);
  for (let i = b.length - 1; i >= 0; i--) {
    let v = b[i];
    for (let j = i + 1; j < b.length; j++) v -= R[i][j] * x[j];
    x[i] = v / R[i][i];
  }
  return x;
}
export function whiten(L, A, w) {
  const columns = transpose(A).map((c) => forward(L, c));
  return { A: transpose(columns), w: forward(L, w) };
}
export function qrSolve(A, w) {
  const m = A.length,
    n = A[0].length,
    R = A.map((r) => r.slice()),
    y = w.slice(),
    permutation = Array.from({ length: n }, (_, i) => i);
  let rank = 0,
    first = 0;
  for (let k = 0; k < Math.min(m, n); k++) {
    let pivot = k,
      best = -1;
    for (let j = k; j < n; j++) {
      let d = 0;
      for (let i = k; i < m; i++) d += R[i][j] ** 2;
      if (d > best) {
        best = d;
        pivot = j;
      }
    }
    if (k === 0) first = Math.sqrt(best);
    if (Math.sqrt(best) <= Math.max(1e-14, first * 1e-11)) break;
    for (let i = 0; i < m; i++) [R[i][k], R[i][pivot]] = [R[i][pivot], R[i][k]];
    [permutation[k], permutation[pivot]] = [permutation[pivot], permutation[k]];
    const v = R.slice(k).map((r) => r[k]),
      alpha = -(v[0] >= 0 ? 1 : -1) * norm(v);
    v[0] -= alpha;
    const vv = dot(v, v),
      beta = 2 / vv;
    for (let j = k; j < n; j++) {
      let projection = 0;
      for (let i = k; i < m; i++) projection += v[i - k] * R[i][j];
      for (let i = k; i < m; i++) R[i][j] -= beta * v[i - k] * projection;
    }
    const projection = dot(v, y.slice(k));
    for (let i = k; i < m; i++) y[i] -= beta * v[i - k] * projection;
    R[k][k] = alpha;
    for (let i = k + 1; i < m; i++) R[i][k] = 0;
    rank++;
  }
  if (rank < n)
    return {
      rank,
      columns: n,
      R,
      permutation,
      error: `Rank ${rank} < ${n}: the unknowns are not uniquely determined. Supply a datum or restore sufficient independent observations.`,
    };
  const upper = R.slice(0, n).map((r) => r.slice(0, n)),
    xp = back(upper, y.slice(0, n)),
    x = new Array(n);
  permutation.forEach((p, i) => (x[p] = xp[i]));
  const inverseR = zeros(n);
  for (let j = 0; j < n; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const c = back(upper, e);
    for (let i = 0; i < n; i++) inverseR[i][j] = c[i];
  }
  const cp = mm(inverseR, transpose(inverseR)),
    covariance = zeros(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      covariance[permutation[i]][permutation[j]] = cp[i][j];
  return { rank, columns: n, x, covariance, R: upper, permutation };
}
export function weightedLeastSquares(A, w, Sigma) {
  if (!A.length || !A[0]?.length)
    return { error: "No active observations or unknowns.", rank: 0 };
  const L = cholesky(Sigma),
    white = whiten(L, A, w),
    AT = transpose(white.A),
    N = mm(AT, white.A),
    u = mv(AT, white.w),
    qr = qrSolve(white.A, white.w),
    m = A.length,
    n = A[0].length;
  const inverseL = transpose(identity(m).map((e) => forward(L, e))),
    P = mm(transpose(inverseL), inverseL);
  const common = {
    A,
    w,
    Sigma,
    L,
    P,
    white,
    N,
    u,
    m,
    n,
    rank: qr.rank,
    R: qr.R,
    permutation: qr.permutation,
  };
  if (qr.error) return { ...common, error: qr.error };
  const dx = qr.x,
    v = mv(A, dx).map((x, i) => x - w[i]),
    whitenedResidual = forward(L, v),
    objective = dot(whitenedResidual, whitenedResidual),
    dof = m - n,
    Cx = qr.covariance,
    ACAT = mm(mm(A, Cx), transpose(A)),
    Cv = Sigma.map((r, i) => r.map((x, j) => x - ACAT[i][j]));
  const hat = mm(ACAT, P),
    redundancy = hat.map((r, i) => 1 - r[i]),
    normalized = v.map((x, i) =>
      Cv[i][i] > Sigma[i][i] * 1e-10 ? x / Math.sqrt(Cv[i][i]) : null,
    );
  const gradient = mv(transpose(A), mv(P, v)),
    sigma0 = dof > 0 ? Math.sqrt(objective / dof) : null,
    limits =
      dof > 0
        ? [chiSquareQuantile(0.025, dof), chiSquareQuantile(0.975, dof)]
        : null;
  return {
    ...common,
    dx,
    v,
    objective,
    whitenedResidual,
    dof,
    Cx,
    Cv,
    normalized,
    redundancy,
    gradient,
    sigma0,
    posteriorCx:
      sigma0 === null ? null : Cx.map((r) => r.map((x) => x * sigma0 * sigma0)),
    limits,
    globalStatus: !limits
      ? "no redundancy"
      : objective < limits[0]
        ? "below interval"
        : objective > limits[1]
          ? "above interval"
          : "inside interval",
  };
}

function logGamma(z) {
  const p = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5)
    return (
      Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z)
    );
  z--;
  let x = 0.9999999999998099;
  for (let i = 0; i < p.length; i++) x += p[i] / (z + i + 1);
  const t = z + p.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
  );
}
export function chiSquareCdf(x, dof) {
  if (x <= 0) return 0;
  const a = dof / 2,
    z = x / 2,
    factor = Math.exp(a * Math.log(z) - z - logGamma(a));
  if (z < a + 1) {
    let sum = 1 / a,
      term = sum;
    for (let i = 1; i < 400; i++) {
      term *= z / (a + i);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-14) break;
    }
    return Math.min(1, sum * factor);
  }
  let b = z + 1 - a,
    c = 1e30,
    d = 1 / b,
    h = d;
  for (let i = 1; i < 400; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-14) break;
  }
  return Math.max(0, 1 - factor * h);
}
export function chiSquareQuantile(p, dof) {
  let lo = 0,
    hi = Math.max(1, dof);
  while (chiSquareCdf(hi, dof) < p) hi *= 2;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (chiSquareCdf(mid, dof) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
export function ellipse95(covariance) {
  const a = covariance[0][0],
    b = covariance[0][1],
    d = covariance[1][1],
    root = Math.hypot(a - d, 2 * b),
    major = Math.max(0, (a + d + root) / 2),
    minor = Math.max(0, (a + d - root) / 2);
  return {
    major: Math.sqrt(5.991464547 * major),
    minor: Math.sqrt(5.991464547 * minor),
    angle: 0.5 * Math.atan2(2 * b, a - d),
  };
}
