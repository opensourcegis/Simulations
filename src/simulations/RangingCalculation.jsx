import { LIGHT_SPEED } from "../../games/shared/lidar-physics.js";
import { RANGING_INSTRUMENT } from "./ranging-model.js";

export default function RangingCalculation({
  mode,
  budget,
  measured,
  lambda,
  phiDeg,
  unamb,
  Ncalc,
  distance,
}) {
  const delay = RANGING_INSTRUMENT.systemDelayNs;
  return (
    <section className="rng-mathline" aria-label="Live ranging calculation">
      {mode === "pulsed" ? (
        <>
          <div>
            <span>01 / EXPECTED PROPAGATION</span>
            <strong>Δt = 2nR / c</strong>
            <code>{budget.flightNs.toFixed(2)} ns round trip</code>
            <small>
              Prediction from the configured target—not a captured timestamp.
            </small>
          </div>
          <div>
            <span>02 / REMOVE INSTRUMENT DELAY</span>
            <strong>Δt = tRAW − {delay} ns</strong>
            <code id="rng-time-substitution">
              {measured?.rawDelayNs != null
                ? `${measured.rawDelayNs.toFixed(2)} − ${delay} = ${(measured.rawDelayNs - delay).toFixed(2)} ns`
                : "Fire a pulse to capture tRAW"}
            </code>
            <small>
              The receiver must first pass its signal-to-noise gate.
            </small>
          </div>
          <div>
            <span>03 / CONVERT TIME TO RANGE</span>
            <strong>R = cΔt / (2n)</strong>
            <code id="rng-math-result">
              {measured?.detected
                ? `${measured.range.toFixed(2)} m`
                : "No measured range yet"}
            </code>
            <small>
              c = {LIGHT_SPEED.toLocaleString()} m/s · ns × 10⁻⁹ = seconds ·
              divide by two for the round trip.
            </small>
          </div>
        </>
      ) : mode === "phase" ? (
        <>
          <div>
            <span>01 / MODULATION WAVELENGTH</span>
            <strong>λ = c / f</strong>
            <code>{lambda.toFixed(3)} m</code>
            <small>Modulation wavelength—not the optical carrier.</small>
          </div>
          <div>
            <span>02 / MEASURE A FRACTION</span>
            <strong>r = (Δφ / 360°) λ/2</strong>
            <code>
              {phiDeg.toFixed(2)}° → {((phiDeg / 360) * unamb).toFixed(3)} m
            </code>
            <small>The same phase repeats every {unamb.toFixed(3)} m.</small>
          </div>
          <div>
            <span>03 / RESOLVE WHOLE CYCLES</span>
            <strong>R = (N + Δφ/360°) λ/2</strong>
            <code>
              N = {Ncalc} → {((Ncalc + phiDeg / 360) * unamb).toFixed(3)} m
            </code>
            <small>
              N is supplied by the ideal coarse tone, not observed by the fine
              phase alone.
            </small>
          </div>
        </>
      ) : (
        <>
          <div>
            <span>01 / COARSE TONE</span>
            <strong>Unambiguous interval = c / (2f)</strong>
            <small>
              The coarsest tone covers the entire synthetic survey range.
            </small>
          </div>
          <div>
            <span>02 / SELECT A CYCLE</span>
            <strong>Coarse estimate → integer N</strong>
            <small>
              The coarse error must be small enough to select the correct fine
              cycle.
            </small>
          </div>
          <div>
            <span>03 / REFINE THE FRACTION</span>
            <strong>R = (N + fraction) c/(2f)</strong>
            <code>{distance.toFixed(2)} m · ideal reconstruction</code>
            <small>
              The plotted ±3° window is an assumption, not a measured
              uncertainty.
            </small>
          </div>
        </>
      )}
    </section>
  );
}
