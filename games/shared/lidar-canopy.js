// 2D cross-section of a Gaussian footprint, integrated through overlapping
// effective foliage volumes. No multiple scattering or refraction.
export function traceCanopy({ clusters, trunkW, trunkH }, offset, density, diameter = 0.35) {
  const dz = 0.1, layers = 100, rays = 21;
  const weights = Array.from({ length: rays }, (_, i) => Math.exp(-2 * (-1 + 2*i/(rays-1)) ** 2));
  const total = weights.reduce((a,b) => a+b, 0);
  const amps = new Float64Array(layers);
  const transmissionProfile = new Float64Array(layers);
  let groundEnergy = 0, groundAmp = 0;
  for (let j = 0; j < rays; j++) {
    const x = offset + (-1 + 2*j/(rays-1))*diameter/2;
    const weight = weights[j]/total;
    let transmission = 1;
    for (let i = 0; i < layers; i++) {
      const h = 10 - (i + 0.5)*dz;
      if (Math.abs(x) < trunkW/2 && h <= trunkH) {
        amps[i] += weight * transmission ** 2 * 0.35;
        transmission = 0; break;
      }
      const k = clusters.reduce((sum, c) => sum + ((x-c.x)**2 + (h-c.h)**2 < c.r**2 ? 0.5*density : 0), 0);
      const tau = k*dz;
      // Exact integral rho*k*exp(-2*k*l) within a homogeneous cell.
      amps[i] += weight * transmission ** 2 * 0.45 * (1-Math.exp(-2*tau))/2;
      transmission *= Math.exp(-tau);
      transmissionProfile[i] += weight*transmission;
    }
    groundEnergy += weight*transmission;
    groundAmp += weight*transmission**2*0.30;
  }
  const returns = Array.from(amps, (amp,i) => ({ h:10-(i+0.5)*dz, amp, kind:'canopy' })).filter(r => r.amp > 0);
  returns.push({ h:0, amp:groundAmp, kind:'ground' });
  return { returns, energyToGround:groundEnergy, transmissionProfile };
}
