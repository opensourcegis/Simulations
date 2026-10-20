import { useEffect, useRef } from "react";
import { project } from "./photogrammetry-model.js";
import { SURVEY_BUILDINGS, terrainHeight } from "./aerial-survey.js";

export function drawSurveyPhoto(
  canvas,
  data,
  ci,
  {
    state,
    point = 14,
    residualScale = 1,
    showLabels = true,
    selected = [],
  } = {},
) {
  const ctx = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height,
    cam = data.truth.cameras[ci],
    f = data.truth.f,
    k1 = data.truth.k1;
  ctx.fillStyle = "#243431";
  ctx.fillRect(0, 0, w, h);
  const polygon = (xyz, color) => {
    const p = xyz.map((p) => project(cam, p, f, k1));
    if (p.some((p) => !p)) return;
    ctx.beginPath();
    p.forEach(([u, v], i) =>
      i
        ? ctx.lineTo((u / 1600) * w, (v / 1200) * h)
        : ctx.moveTo((u / 1600) * w, (v / 1200) * h),
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  for (let y = -100; y < 100; y += 5)
    for (let x = -110; x < 110; x += 5) {
      const land =
        Math.abs(y) < 4
          ? "#a3a393"
          : (Math.floor((x + 120) / 24) + Math.floor((y + 100) / 20)) % 2
            ? "#677d4c"
            : "#889966";
      polygon(
        [
          [x, y],
          [x + 5, y],
          [x + 5, y + 5],
          [x, y + 5],
        ].map(([a, b]) => [a, b, terrainHeight(a, b)]),
        land,
      );
    }
  for (const b of SURVEY_BUILDINGS) {
    const z = terrainHeight(b.x + b.w / 2, b.y + b.d / 2),
      p = [
        [b.x, b.y],
        [b.x + b.w, b.y],
        [b.x + b.w, b.y + b.d],
        [b.x, b.y + b.d],
      ];
    for (let i = 0; i < 4; i++) {
      const a = p[i],
        c = p[(i + 1) % 4];
      polygon(
        [
          [...a, z],
          [...c, z],
          [...c, z + b.h],
          [...a, z + b.h],
        ],
        i % 2 ? "#a1967b" : "#c0b296",
      );
    }
    polygon(
      p.map((q) => [...q, z + b.h]),
      "#a86f55",
    );
  }
  for (const o of data.observations.filter((o) => o.ci === ci)) {
    const x = (o.u / 1600) * w,
      y = (o.v / 1200) * h,
      check = data.checkpoints.includes(o.pi),
      gcp = data.gcps.includes(o.pi),
      chosen = o.pi === point;
    ctx.fillStyle = chosen
      ? "#ffdf7d"
      : check
        ? "#d3adff"
        : gcp
          ? "#83f0b1"
          : "#e7eef0";
    ctx.strokeStyle = "#1c3039";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, chosen ? 5 : 2.7, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    if (showLabels && (chosen || gcp)) {
      ctx.fillStyle = "#fff";
      ctx.font = "10px monospace";
      ctx.fillText("P" + (o.pi + 1), x + 6, y - 5);
    }
    if (state?.cameras[ci] && state.points[o.pi] && !check) {
      const q = project(
        state.cameras[ci],
        state.points[o.pi],
        state.f,
        state.k1,
      );
      if (q) {
        ctx.strokeStyle = "#ffcc74";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(
          x + ((q[0] - o.u) / 1600) * w * residualScale,
          y + ((q[1] - o.v) / 1200) * h * residualScale,
        );
        ctx.stroke();
      }
    }
    if (selected.includes(o.pi)) {
      ctx.strokeStyle = "#86edc7";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
}
export default function SurveyPhoto({
  data,
  camera,
  state,
  point,
  residualScale = 1,
  onSelect,
  selected = [],
  id,
}) {
  const ref = useRef(null);
  useEffect(() => {
    drawSurveyPhoto(ref.current, data, camera, {
      state,
      point,
      residualScale,
      selected,
    });
  }, [data, camera, state, point, residualScale, selected]);
  const choose = (e) => {
    if (!onSelect) return;
    const r = e.currentTarget.getBoundingClientRect(),
      u = ((e.clientX - r.left) / r.width) * 1600,
      v = ((e.clientY - r.top) / r.height) * 1200;
    const nearest = data.observations
      .filter((o) => o.ci === camera)
      .sort(
        (a, b) => Math.hypot(a.u - u, a.v - v) - Math.hypot(b.u - u, b.v - v),
      )[0];
    if (nearest) onSelect(nearest.pi, { u, v });
  };
  return (
    <canvas
      id={id}
      ref={ref}
      width="400"
      height="300"
      onClick={choose}
      role="img"
      aria-label={`Synthetic aerial image C${camera + 1}; observed feature locations and selected track. Use the point selector for keyboard inspection.`}
    />
  );
}
