import { cameraOptics } from "./photogrammetry-model.js";
import {
  cameraScene,
  expectedElectrons,
  sensorGain,
  SENSOR_MODEL,
  rollingTime,
  sensorShiftPx,
  blurSigmaDisplay,
  inverseRadial,
} from "./camera-sensor-model.js";

function randomSequence(seed) {
  let s = seed >>> 0;
  const uniform = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return (s + 0.5) / 4294967296;
  };
  const normal = () =>
    Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
  return {
    normal,
    poisson: (mean) => {
      if (mean > 25) return Math.max(0, mean + Math.sqrt(mean) * normal());
      let p = 1,
        n = 0;
      const limit = Math.exp(-mean);
      do {
        n++;
        p *= uniform();
      } while (p > limit);
      return n - 1;
    },
  };
}
export function sceneTexture(id) {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 400;
  const c = canvas.getContext("2d");
  if (id === "background") {
    const sky = c.createLinearGradient(0, 0, 0, 400);
    sky.addColorStop(0, "#7396b0");
    sky.addColorStop(0.55, "#c7c3aa");
    sky.addColorStop(0.56, "#5b7250");
    sky.addColorStop(1, "#354b38");
    c.fillStyle = sky;
    c.fillRect(0, 0, 600, 400);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? "#455e3d" : "#628050";
      c.beginPath();
      c.ellipse(55 + i * 74, 215, 45, 75, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#b4a58c";
    c.fillRect(0, 300, 600, 30);
    c.strokeStyle = "#8a7a64";
    for (let i = 0; i < 600; i += 35) {
      c.beginPath();
      c.moveTo(i, 300);
      c.lineTo(i - 70, 400);
      c.stroke();
    }
  } else if (id === "board") {
    c.fillStyle = "#e0d7be";
    c.fillRect(0, 0, 600, 400);
    const colors = [
      "#b54d37",
      "#c5a549",
      "#48856d",
      "#4b7f9d",
      "#827297",
      "#e3d6ae",
    ];
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 6; x++) {
        c.fillStyle = colors[(x + y) % 6];
        c.fillRect(18 + x * 94, 18 + y * 72, 87, 64);
      }
    c.fillStyle = "#272d31";
    c.fillRect(18, 317, 564, 65);
    c.fillStyle = "#f4ead5";
    c.font = "bold 33px monospace";
    c.fillText("GEOSIM  ↑  FOCUS", 39, 361);
    c.strokeStyle = "#242c2f";
    c.lineWidth = 5;
    c.strokeRect(3, 3, 594, 394);
  } else {
    const shade = c.createRadialGradient(220, 110, 10, 300, 200, 190);
    shade.addColorStop(0, "#ef9c66");
    shade.addColorStop(0.4, "#bd4c36");
    shade.addColorStop(1, "#4d232b");
    c.fillStyle = shade;
    c.beginPath();
    c.ellipse(300, 200, 195, 195, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#efb493";
    c.lineWidth = 5;
    c.beginPath();
    c.ellipse(300, 200, 195, 70, -0.3, 0, Math.PI * 2);
    c.stroke();
  }
  return canvas;
}
export function renderCameraImage(settings) {
  const exposureTime = settings.shutterOpen === false ? 0 : settings.shutter;
  const {
    f,
    objectM,
    focusM,
    fNumber,
    sensorW,
    shutter,
    iso,
    speed,
    readoutMs,
    k1 = 0,
    lightEV = 12,
    noise = true,
    seed = 17,
  } = settings;
  const width = 600,
    height = 400,
    optics = cameraOptics({ ...settings, sensorH: (sensorW * 2) / 3 }),
    random = randomSequence(seed);
  const layers = cameraScene(objectM).map((o) => {
    const layer = document.createElement("canvas");
    layer.width = width;
    layer.height = height;
    const c = layer.getContext("2d");
    const objectOptics = cameraOptics({
      f,
      focusM,
      objectM: o.depth,
      fNumber,
      sensorW,
    });
    const scale =
      (optics.sensorDistance / (o.depth * 1000) / sensorW) * width * 1000;
    c.save();
    c.translate(width / 2, height / 2);
    c.scale(-1, -1);
    c.filter = `blur(${blurSigmaDisplay(objectOptics, width).toFixed(2)}px)`;
    c.drawImage(
      sceneTexture(o.id),
      (o.y - o.width / 2) * scale,
      (-o.z - o.height / 2) * scale,
      o.width * scale,
      o.height * scale,
    );
    c.restore();
    return { object: o, data: c.getImageData(0, 0, width, height).data };
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d"),
    image = ctx.createImageData(width, height),
    out = image.data;
  const srgbToLinear = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const tone = (v) =>
    255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  let clipped = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      // Bounded inverse on the calibrated monotone domain. Unsupported
      // peripheral rays are dark, not a divergent/tiled inverse warp.
      const xd = (((x - width / 2) / width) * sensorW) / f,
        yd = (((y - height / 2) / height) * ((sensorW * 2) / 3)) / f;
      const inverse = inverseRadial(
        xd,
        yd,
        k1,
        Math.hypot(sensorW / 2, sensorW / 3) / f,
      );
      const [xu, yu] = inverse || [1e6, 1e6];
      const sourceX = width / 2 + ((xu * f) / sensorW) * width,
        sourceY = height / 2 + ((yu * f) / ((sensorW * 2) / 3)) * height;
      const rgb = [0, 0, 0];
      for (let sample = 0; sample < 5; sample++) {
        const time =
            rollingTime(y / (height - 1), readoutMs) +
            shutter * ((sample + 0.5) / 5 - 0.5),
          value = inverse ? [0.012, 0.014, 0.017] : [0, 0, 0];
        for (const layer of layers) {
          const shift =
            (sensorShiftPx(speed, layer.object.depth, optics, time) * width) /
            6000;
          const sx = sourceX - shift,
            sy = sourceY;
          const xi = Math.floor(sx),
            yi = Math.floor(sy);
          if (xi < 0 || xi >= width - 1 || yi < 0 || yi >= height - 1) continue;
          const tx = sx - xi,
            ty = sy - yi,
            rgba = [0, 0, 0, 0];
          for (let a = 0; a < 2; a++)
            for (let b = 0; b < 2; b++) {
              const w = (a ? tx : 1 - tx) * (b ? ty : 1 - ty),
                index = ((yi + b) * width + xi + a) * 4;
              for (let ch = 0; ch < 4; ch++)
                rgba[ch] += w * layer.data[index + ch];
            }
          const alpha = rgba[3] / 255;
          for (let ch = 0; ch < 3; ch++)
            value[ch] =
              value[ch] * (1 - alpha) + srgbToLinear(rgba[ch]) * alpha;
        }
        for (let ch = 0; ch < 3; ch++) rgb[ch] += value[ch] / 5;
      }
      const idx = (y * width + x) * 4;
      let saturated = false;
      for (let ch = 0; ch < 3; ch++) {
        const mean = expectedElectrons(rgb[ch], optics, exposureTime, lightEV);
        const electrons = noise
          ? random.poisson(mean) + SENSOR_MODEL.readNoise * random.normal()
          : mean;
        const dn = sensorGain(electrons, iso);
        if (dn === SENSOR_MODEL.adcMax) saturated = true;
        out[idx + ch] = Math.round(
          Math.min(255, tone(dn / SENSOR_MODEL.adcMax)),
        );
      }
      out[idx + 3] = 255;
      if (saturated) clipped++;
    }
  ctx.putImageData(image, 0, 0);
  return {
    canvas,
    clippedPercent: (clipped / (width * height)) * 100,
    settings: { ...settings },
    midGrayElectrons: expectedElectrons(0.18, optics, exposureTime, lightEV),
  };
}
