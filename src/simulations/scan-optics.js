import { SCAN_MECHANISMS, scanDirections } from "./scanning-model.js";

const TAU = 2 * Math.PI;
const RAD = Math.PI / 180;
const unit = (v) => {
  const length = Math.hypot(...v);
  return v.map((x) => x / length);
};
export const POLYGON_FACETS = 12;
export const POLYGON_RADIUS = 0.55;
export const POLYGON_APOTHEM =
  POLYGON_RADIUS * Math.cos(Math.PI / POLYGON_FACETS);

// The inset uses the survey's existing scan law, not a separate animation.
// Coordinates are X along flight, Y cross-track, Z up. Instrument dimensions
// and prism separation are enlarged schematic units, not metres.
export function scanOpticsState(id, time) {
  const mechanism = SCAN_MECHANISMS.find((m) => m.id === id);
  if (!mechanism) throw new Error("Unknown scan mechanism");
  const t = Math.max(0, time);
  const cycles = t * mechanism.hz;
  const cycle = Math.floor(cycles);
  const phase = Math.max(0, cycles - cycle);
  const psi = TAU * phase;
  const directions = scanDirections(id, t);
  const state = {
    id,
    name: mechanism.name,
    t,
    phase,
    psi,
    directions,
    origin: [0, 0, 0],
  };
  if (id === "risley") {
    state.prisms = [TAU * 18 * t, -TAU * 28 * t];
    state.firstSlope = [
      Math.tan(8 * RAD) * Math.sin(state.prisms[0]),
      Math.tan(8 * RAD) * Math.cos(state.prisms[0]),
    ];
    // Show the actual two-stage direction change, not one reflected ray.
    state.origin = state.firstSlope.map((s) => 0.65 * s).concat(0);
    state.readout = `Prism 1: +18 Hz · prism 2: −28 Hz`;
    state.detail =
      "Two rotating wedges add refractive deflections. The model uses a paraxial vector sum, not a full Snell ray trace.";
    return state;
  }
  if (id === "multi") {
    state.readout = "8 simultaneous channels · 4°–20° off nadir";
    state.detail =
      "The emitter/receiver head rotates in azimuth. Each channel keeps its own cone angle; this is not one oscillating mirror.";
    return state;
  }
  state.incoming = id === "palmer" ? [0, 0, 1] : [0, 1, 0];
  if (id === "poly") {
    const alpha = mechanism.angle * RAD;
    const spacing = TAU / POLYGON_FACETS;
    const advance =
      phase < 0.92
        ? (alpha * phase) / 0.92
        : alpha + ((spacing - alpha) * (phase - 0.92)) / 0.08;
    state.rotorAngle = cycle * spacing + advance;
    state.facet = ((-cycle % POLYGON_FACETS) + POLYGON_FACETS) % POLYGON_FACETS;
    const beta = Math.PI / 4 - alpha / 2 + advance;
    state.normal = [0, Math.cos(beta), Math.sin(beta)];
    const center = POLYGON_APOTHEM / Math.sqrt(2);
    state.origin = [
      0,
      (center * (state.normal[1] + state.normal[2]) - POLYGON_APOTHEM) /
        state.normal[1],
      0,
    ];
    state.readout = directions.length
      ? `Active facet ${state.facet + 1} · one-way sweep`
      : "Facet handover · laser blanked";
    state.detail =
      "Successive facets sweep the ray in one direction. This illustrative 12-facet rotor follows the prescribed ±25° sweep and 8% handover; its transition speed and dimensions are not instrument specifications.";
    return state;
  }
  const direction = directions[0];
  state.normal = unit(state.incoming.map((value, i) => value - direction[i]));
  if (id === "osc") {
    const theta = Math.atan2(direction[1], -direction[2]) / RAD;
    state.readout = `Mirror β = ${(theta / 2).toFixed(2)}° → beam θ = ${theta.toFixed(2)}°`;
    state.detail =
      "The galvanometer rocks one mirror about its shaft. A mirror rotation β deflects the reflected beam by 2β; the scanner housing does not rotate.";
  } else if (id === "palmer") {
    state.readout = "Mirror tilt 10° → sightline cone 20°";
    state.detail =
      "An axial beam meets a tilted rotating mirror. The normal precesses about the shaft, steering the outgoing ray around a cone.";
  } else {
    state.readout = "Fast axis: 30 Hz · slow axis: 3.8 Hz";
    state.detail =
      "A two-axis micromirror tips within its gimbal. The two angular drives generate the Lissajous scan; this enlarged view is not a MEMS fabrication drawing.";
  }
  return state;
}

export function reflectedDirection(incoming, normal) {
  const dot = incoming.reduce((sum, value, i) => sum + value * normal[i], 0);
  return incoming.map((value, i) => value - 2 * dot * normal[i]);
}
