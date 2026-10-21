import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export function segment(group, points, color = 0x5ad1ff, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((p) => new THREE.Vector3(...p)),
  );
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  group.add(line);
  return line;
}
export function marker(group, position, color = 0xffaa55, radius = 0.15) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 12, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }),
  );
  mesh.position.set(...position);
  group.add(mesh);
  return mesh;
}
export function caption(group, text, position, color = "#d4e4ed", size = 1) {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  ctx.font = "600 24px system-ui";
  canvas.width = Math.ceil(ctx.measureText(text).width + 22);
  canvas.height = 44;
  ctx.fillStyle = "rgba(10,22,32,.85)";
  ctx.fillRect(0, 0, canvas.width, 44);
  ctx.fillStyle = color;
  ctx.font = "600 24px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, 22);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      transparent: true,
    }),
  );
  sprite.position.set(...position);
  sprite.scale.set((canvas.width / 44) * size, size, 1);
  group.add(sprite);
  return sprite;
}
export function disposeGroup(group) {
  const disposed = new Set();
  group.traverse((o) => {
    if (o.isInstancedMesh) o.dispose();
    if (!o.isSprite && o.geometry && !disposed.has(o.geometry)) {
      o.geometry.dispose();
      disposed.add(o.geometry);
    }
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    materials.forEach((m) => {
      if (!m || disposed.has(m)) return;
      Object.values(m)
        .filter((v) => v?.isTexture)
        .forEach((t) => {
          if (!disposed.has(t)) {
            t.dispose();
            disposed.add(t);
          }
        });
      m.dispose();
      disposed.add(m);
    });
  });
}

function frameReconstruction(c, top = false) {
  const bounds = new THREE.Box3().setFromObject(c.group);
  if (bounds.isEmpty()) return;
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  if (!Number.isFinite(sphere.radius)) return;
  const halfV = THREE.MathUtils.degToRad(c.camera.fov / 2);
  const halfH = Math.atan(Math.tan(halfV) * c.camera.aspect);
  const distance =
    (Math.max(0.5, sphere.radius) / Math.sin(Math.min(halfV, halfH))) * 1.15;
  const direction = new THREE.Vector3(
    ...(top ? [0.001, 0.001, 1] : [1, -1, 1]),
  ).normalize();
  c.controls.target.copy(sphere.center);
  c.camera.position.copy(sphere.center).addScaledVector(direction, distance);
  c.controls.update();
}

export default function PhotoLabScene({
  build,
  label,
  initial = [36, 30, 44],
  target = [0, 0, 10],
  onSelect,
  onFrame,
  closeup,
  maxDistance = 130,
  fitToContent = false,
}) {
  const host = useRef(null),
    context = useRef(null),
    selectRef = useRef(onSelect),
    frameRef = useRef(onFrame),
    initialRef = useRef(initial),
    targetRef = useRef(target);
  const [error, setError] = useState(false);
  const fitRef = useRef(fitToContent),
    lastFrame = useRef(null);
  fitRef.current = fitToContent;
  selectRef.current = onSelect;
  frameRef.current = onFrame;
  useEffect(() => {
    const el = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0d1822);
    el.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xe5f5ff, 0x343a34, 2.5));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(10, 15, 25);
    scene.add(light);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 500);
    camera.up.set(0, 0, 1);
    camera.position.set(...initialRef.current);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...targetRef.current);
    controls.enableDamping = true;
    controls.minDistance = 0.4;
    controls.maxDistance = maxDistance;
    let group = new THREE.Group();
    scene.add(group);
    context.current = { scene, camera, controls, renderer, group };
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      if (fitRef.current && context.current)
        frameReconstruction(context.current);
    });
    resize.observe(el);
    let start = [0, 0];
    const down = (e) => {
      start = [e.clientX, e.clientY];
    };
    const up = (e) => {
      if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return;
      const r = renderer.domElement.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray
        .intersectObjects(context.current.group.children, true)
        .find((h) => h.object.userData.part);
      if (hit) selectRef.current?.(hit.object.userData.part);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    let frame;
    const loop = () => {
      controls.update();
      frameRef.current?.(context.current.group, performance.now());
      renderer.render(scene, camera);
      frame = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      controls.dispose();
      disposeGroup(context.current.group);
      renderer.dispose();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.remove();
      context.current = null;
    };
  }, []);
  useEffect(() => {
    const c = context.current;
    if (!c) return;
    disposeGroup(c.group);
    c.scene.remove(c.group);
    c.group = build();
    c.scene.add(c.group);
    if (fitToContent && lastFrame.current !== fitToContent) {
      frameReconstruction(c);
      lastFrame.current = fitToContent;
    }
  }, [build, fitToContent]);
  const view = (top) => {
    const c = context.current;
    if (!c) return;
    if (fitRef.current) {
      frameReconstruction(c, top);
      return;
    }
    c.controls.target.set(...targetRef.current);
    c.camera.position.set(
      ...(top
        ? [
            0.001,
            0.001,
            initialRef.current.reduce((s, x) => s + x * x, 0) ** 0.5,
          ]
        : initialRef.current),
    );
    c.controls.update();
  };
  return (
    <div className="photo-viewport">
      <div className="photo-webgl" ref={host} role="img" aria-label={label}>
        {error && (
          <p className="photo-webgl-error">
            3D requires WebGL. The numerical model, controls and explanations
            remain available.
          </p>
        )}
      </div>
      <div className="photo-viewbar">
        <span>Drag to orbit · scroll to zoom · right-drag to pan</span>
        <button onClick={() => view(false)}>Reset view</button>
        <button onClick={() => view(true)}>Top view</button>
        {closeup && (
          <button
            onClick={() => {
              const c = context.current;
              if (c) {
                c.controls.target.set(...closeup.target);
                c.camera.position.set(...closeup.position);
                c.controls.update();
              }
            }}
          >
            Optics close-up
          </button>
        )}
      </div>
    </div>
  );
}
