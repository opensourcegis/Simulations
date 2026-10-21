import { SURVEY_MOUNTS } from "./survey-mounts.js";
const RAD = Math.PI / 180,
  TAU = 2 * Math.PI;
export const SCAN_LINE = [-90, 90];
export const SCAN_MECHANISMS = [
  {
    id: "osc",
    name: "Oscillating mirror",
    pattern: "Sinusoidal sweeps · edge dwell",
    angle: 25,
    hz: 11,
    rate: 640,
    channels: 1,
    explanation:
      "The mirror reverses direction. Uniform-time pulses bunch near the turning points. Optical deflection is twice the mirror rotation.",
    formula: "θ = α sin(2π fscan t)",
  },
  {
    id: "poly",
    name: "Rotating polygon",
    pattern: "One-way sweeps · facet gaps",
    angle: 25,
    hz: 11,
    rate: 640,
    channels: 1,
    explanation:
      "Each facet gives a one-way angular sweep. This teaching model blanks the final 8% of each sweep for the facet transition. Constant angular speed still gives wider ground spacing near the edges.",
    formula: "θ sweeps −α → +α; 8% transition blanking",
  },
  {
    id: "palmer",
    name: "Palmer conical",
    pattern: "Translated conical loops",
    angle: 20,
    hz: 9,
    rate: 760,
    channels: 1,
    explanation:
      "A tilted rotating optic steers the sightline around a cone. Platform motion translates each circle into overlapping loops; surfaces are seen from fore and aft.",
    formula: "dx/dz = −tan α cos ψ; dy/dz = −tan α sin ψ",
  },
  {
    id: "risley",
    name: "Risley prisms",
    pattern: "Rosette · repeats in this model",
    angle: 15,
    hz: 2,
    rate: 1050,
    channels: 1,
    explanation:
      "Two rotating wedges refract the ray. This is a paraxial sum of deflections, not an exact Snell ray trace. The +18 and −28 Hz choices repeat every 0.5 s on a stationary plane.",
    formula: "slope = tan 8° u(18t) + tan 7° u(−28t)",
  },
  {
    id: "mems",
    name: "Two-axis MEMS",
    pattern: "Lissajous tile",
    angle: 12,
    hz: 3.8,
    rate: 900,
    channels: 1,
    explanation:
      "A microscopic moving mirror tilts on two axes, here at 30 and 3.8 Hz. Aircraft motion translates the Lissajous pattern. A narrow angular field does not guarantee uniform coverage.",
    formula: "θy = 12° sin(2π30t); θx = 9° sin(2π3.8t)",
  },
  {
    id: "multi",
    name: "Rotating multi-beam",
    pattern: "Eight downward cones",
    angle: 20,
    hz: 9,
    rate: 170,
    channels: 8,
    explanation:
      "Eight simultaneous downward-looking channels rotate in azimuth, with off-nadir angles 4°–20°. This mounting geometry is illustrative, not the channel table of a commercial spinning LiDAR.",
    formula: "8 channels; β = 4° … 20°; ψ = 2π fscan t",
  },
];
export const SCAN_BUILDINGS = [
  { x0: -35, x1: -15, y0: -26, y1: -10, baseZ: 0, roofZ: 8 },
  { x0: 40, x1: 65, y0: 15, y1: 34, baseZ: 0, roofZ: 12 },
];
export const SCAN_CANOPIES = [
  { center: [-54, 24, 8], radii: [7, 7, 8] },
  { center: [12, -28, 7], radii: [6, 6, 7] },
  { center: [65, -22, 9], radii: [7, 6, 9] },
];
const normalize = (v) => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
export function scanDirections(id, t) {
  const m = SCAN_MECHANISMS.find((m) => m.id === id);
  if (!m) throw Error("Unknown scan mechanism");
  const phase = (((t * m.hz) % 1) + 1) % 1,
    psi = TAU * phase,
    a = m.angle * RAD;
  if (id === "osc") return [normalize([0, Math.tan(a * Math.sin(psi)), -1])];
  if (id === "poly")
    return phase >= 0.92
      ? []
      : [normalize([0, Math.tan(-a + (2 * a * phase) / 0.92), -1])];
  if (id === "palmer")
    return [
      normalize([Math.tan(a) * Math.cos(psi), Math.tan(a) * Math.sin(psi), -1]),
    ];
  if (id === "risley")
    return [
      normalize([
        Math.tan(8 * RAD) * Math.sin(TAU * 18 * t) +
          Math.tan(7 * RAD) * Math.sin(-TAU * 28 * t),
        Math.tan(8 * RAD) * Math.cos(TAU * 18 * t) +
          Math.tan(7 * RAD) * Math.cos(-TAU * 28 * t),
        -1,
      ]),
    ];
  if (id === "mems")
    return [
      normalize([
        Math.tan(9 * RAD * Math.sin(TAU * 3.8 * t)),
        Math.tan(a * Math.sin(TAU * 30 * t)),
        -1,
      ]),
    ];
  return Array.from({ length: m.channels }, (_, i) => {
    const r = Math.tan((4 + (16 * i) / (m.channels - 1)) * RAD);
    return normalize([r * Math.cos(psi), r * Math.sin(psi), -1]);
  });
}
export function scanOrigin(t, { height = 80, speed = 10 }) {
  return [
    SCAN_LINE[0] + speed * t + SURVEY_MOUNTS.scanner[0],
    SURVEY_MOUNTS.scanner[1],
    height,
  ];
}
function boxHit(o, d, b) {
  let lo = 0,
    hi = Infinity;
  for (const [i, min, max] of [
    [0, b.x0, b.x1],
    [1, b.y0, b.y1],
    [2, b.baseZ, b.roofZ],
  ]) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < min || o[i] > max) return null;
      continue;
    }
    const a = (min - o[i]) / d[i],
      c = (max - o[i]) / d[i];
    lo = Math.max(lo, Math.min(a, c));
    hi = Math.min(hi, Math.max(a, c));
    if (hi < lo) return null;
  }
  return lo > 1e-8 ? lo : null;
}
function canopyHit(o, d, { center, radii }) {
  const q = o.map((v, i) => (v - center[i]) / radii[i]),
    v = d.map((x, i) => x / radii[i]);
  const a = v.reduce((s, x) => s + x * x, 0),
    b = 2 * q.reduce((s, x, i) => s + x * v[i], 0),
    c = q.reduce((s, x) => s + x * x, 0) - 1,
    dis = b * b - 4 * a * c;
  if (dis < 0) return null;
  const t = (-b - Math.sqrt(dis)) / (2 * a);
  return t > 1e-8 ? t : null;
}
export function scanIntersection(origin, direction, { objects = true } = {}) {
  if (direction[2] >= 0 || origin[2] <= 0) return null;
  let range = -origin[2] / direction[2],
    kind = "ground";
  if (objects) {
    for (const b of SCAN_BUILDINGS) {
      const t = boxHit(origin, direction, b);
      if (t != null && t < range) {
        range = t;
        kind = "building";
      }
    }
    for (const b of SCAN_CANOPIES) {
      const t = canopyHit(origin, direction, b);
      if (t != null && t < range) {
        range = t;
        kind = "canopy";
      }
    }
  }
  return {
    position: origin.map((v, i) => v + range * direction[i]),
    range,
    kind,
  };
}
export function scanReference({ mechanism = "osc", height = 80, speed = 10 }) {
  const m = SCAN_MECHANISMS.find((m) => m.id === mechanism),
    width =
      2 *
      height *
      (mechanism === "risley"
        ? Math.tan(8 * RAD) + Math.tan(7 * RAD)
        : Math.tan(m.angle * RAD)),
    duty = mechanism === "poly" ? 0.92 : 1;
  return {
    width,
    rate: m.rate * m.channels,
    duty,
    density: (m.rate * m.channels * duty) / (speed * width),
    advance: speed / m.hz,
    duration: (SCAN_LINE[1] - SCAN_LINE[0]) / speed,
  };
}
// Fixed physical pulse times, never a per-render-frame emission cap.
export function buildScanLine(settings) {
  const ref = scanReference(settings),
    m = SCAN_MECHANISMS.find((m) => m.id === settings.mechanism),
    records = [];
  for (let i = 1; i <= Math.floor(ref.duration * m.rate); i++) {
    const t = i / m.rate,
      origin = scanOrigin(t, settings);
    for (const direction of scanDirections(m.id, t)) {
      const hit = scanIntersection(origin, direction, settings);
      if (hit) records.push({ ...hit, t, origin, direction });
    }
  }
  return {
    records,
    reference: ref,
    mechanism: m.id,
    pulseRate: m.rate,
    cycleSeconds: 1 / m.hz,
  };
}
export function scanVisibleCount(records, t) {
  let a = 0,
    b = records.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (records[m].t <= t) a = m + 1;
    else b = m;
  }
  return a;
}

// A displayed pulse is a recorded emission, not a new ray evaluated between
// sensor ticks. During polygon blanking there is no pulse to draw.
export function scanPlaybackFrame(data, time) {
  const t = Math.max(0, Math.min(data.reference.duration, time));
  const count = scanVisibleCount(data.records, t);
  const recentStart = scanVisibleCount(data.records, t - data.cycleSeconds);
  const tick = Math.floor(t * data.pulseRate + 1e-9);
  let pulseStart = count;
  if (
    count &&
    tick > 0 &&
    Math.abs(data.records[count - 1].t * data.pulseRate - tick) < 1e-6
  ) {
    const stamp = data.records[count - 1].t;
    while (pulseStart > 0 && data.records[pulseStart - 1].t === stamp)
      pulseStart--;
  }
  return {
    count,
    recentStart,
    pulseStart,
    pulseEnd: count,
    pulseTime: pulseStart < count ? data.records[pulseStart].t : null,
  };
}

// Only a visibility offset for the rendered glyph, never a measured XYZ edit.
export const scanGlyphPosition = (record) =>
  record.position.map((v, i) => v - 0.025 * record.direction[i]);

export function writeScanPulseSegments(data, frame, buffer) {
  let vertices = 0;
  for (let i = frame.pulseStart; i < frame.pulseEnd; i++) {
    buffer.set(data.records[i].origin, vertices++ * 3);
    buffer.set(scanGlyphPosition(data.records[i]), vertices++ * 3);
  }
  return vertices;
}
