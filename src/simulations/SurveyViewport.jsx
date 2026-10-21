import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { disposeGroup } from "./PhotoLabScene.jsx";
import "./field-scenes.css";

// Static physical context and analytical overlays have separate lifetimes.
// Changing a TIN step must not regenerate materials, vegetation or equipment.
export default function SurveyViewport({
  world,
  overlay,
  views,
  label,
  badge,
  onSelect,
  onFrame,
  variant = "field",
  fitAspect = 0,
}) {
  const host = useRef(null),
    context = useRef(null),
    select = useRef(onSelect),
    frame = useRef(onFrame),
    viewRef = useRef(views),
    previousTarget = useRef(null);
  const fitRef = useRef(fitAspect),
    fitFactor = useRef(1);
  fitRef.current = fitAspect;
  const [error, setError] = useState(false),
    [active, setActive] = useState(0);
  select.current = onSelect;
  frame.current = onFrame;
  viewRef.current = views;
  const applyView = (i) => {
    const c = context.current,
      v = viewRef.current[i];
    if (!c || !v) return;
    c.viewIndex = i;
    c.viewRevision = (c.viewRevision || 0) + 1;
    c.camera.position.set(...v.position);
    c.controls.target.set(...v.target);
    fitFactor.current = Math.max(1, fitRef.current / c.camera.aspect);
    c.camera.position
      .sub(c.controls.target)
      .multiplyScalar(fitFactor.current)
      .add(c.controls.target);
    previousTarget.current = v.target;
    c.controls.update();
    setActive(i);
  };
  useEffect(() => {
    const el = host.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      setError(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb8cbd0);
    scene.fog = new THREE.FogExp2(0xb9cbd0, 0.00135);
    const room = new RoomEnvironment(),
      pmrem = new THREE.PMREMGenerator(renderer),
      environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.35;
    room.dispose();
    pmrem.dispose();
    const sky = new Sky();
    sky.scale.setScalar(4500);
    sky.rotation.x = Math.PI / 2;
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 6;
    uniforms.rayleigh.value = 1.4;
    uniforms.mieCoefficient.value = 0.004;
    uniforms.mieDirectionalG.value = 0.82;
    uniforms.sunPosition.value.set(-0.6, 0.65, 0.45);
    scene.add(sky);
    const ambient = new THREE.HemisphereLight(0xd8e7ef, 0x655746, 1.6);
    ambient.position.set(0, 0, 1);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffebce, 3.2);
    sun.position.set(-90, -110, 190);
    sun.target.position.set(30, 25, 0);
    sun.castShadow = true;
    sun.shadow.autoUpdate = false;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -145,
      right: 145,
      top: 145,
      bottom: -145,
      near: 1,
      far: 500,
    });
    sun.shadow.normalBias = 0.08;
    sun.shadow.bias = -0.00012;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    const camera = new THREE.PerspectiveCamera(43, 1, 0.025, 4500);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 0.4;
    controls.maxDistance = 1200;
    controls.maxPolarAngle = Math.PI * 0.85;
    const physical = new THREE.Group(),
      analytical = new THREE.Group();
    scene.add(physical, analytical);
    context.current = {
      scene,
      camera,
      controls,
      renderer,
      physical,
      analytical,
      sun,
    };
    applyView(0);
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      const factor = Math.max(1, fitRef.current / camera.aspect);
      camera.position
        .sub(controls.target)
        .multiplyScalar(factor / fitFactor.current)
        .add(controls.target);
      fitFactor.current = factor;
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    let start = [0, 0];
    const down = (e) => {
      start = [e.clientX, e.clientY];
    };
    const up = (e) => {
      if (Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return;
      const r = el.getBoundingClientRect(),
        ray = new THREE.Raycaster();
      ray.params.Points.threshold = 0.6;
      ray.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          (-(e.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      const hit = ray
        .intersectObjects([...physical.children, ...analytical.children], true)
        .find((h) => h.object.userData.part || h.object.userData.pickIds);
      if (hit)
        select.current?.(
          hit.object.userData.pickIds
            ? hit.object.userData.pickIds[hit.index]
            : hit.object.userData.part,
        );
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    let raf,
      visible = true;
    const visibility = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting;
      },
      { rootMargin: "160px" },
    );
    visibility.observe(el);
    const loop = (now) => {
      if (visible) {
        controls.update();
        frame.current?.(context.current, now);
        renderer.render(scene, camera);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      visibility.disconnect();
      controls.dispose();
      disposeGroup(context.current.physical);
      disposeGroup(context.current.analytical);
      sky.geometry.dispose();
      sky.material.dispose();
      sun.shadow.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      context.current = null;
    };
  }, []);
  useEffect(() => {
    const c = context.current;
    if (!c) return;
    disposeGroup(c.physical);
    c.scene.remove(c.physical);
    c.physical = world();
    c.scene.add(c.physical);
    c.sun.shadow.needsUpdate = true;
  }, [world]);
  useEffect(() => {
    const c = context.current;
    if (!c) return;
    disposeGroup(c.analytical);
    c.scene.remove(c.analytical);
    c.analytical = overlay ? overlay() : new THREE.Group();
    c.scene.add(c.analytical);
    c.sun.shadow.needsUpdate = true;
  }, [overlay]);
  // Follow changed height/target while preserving the learner's orbit and zoom.
  useEffect(() => {
    const c = context.current,
      v = views[active];
    if (!c || !v || !previousTarget.current) return;
    const delta = new THREE.Vector3(...v.target).sub(
      new THREE.Vector3(...previousTarget.current),
    );
    c.camera.position.add(delta);
    c.controls.target.add(delta);
    previousTarget.current = v.target;
  }, [views, active]);
  return (
    <div className={"field-viewport " + variant}>
      <div className="field-webgl" ref={host} role="img" aria-label={label}>
        {error && (
          <p className="field-error">
            WebGL is unavailable. Numerical controls and analysis remain
            accessible.
          </p>
        )}
      </div>
      <div className="field-hud">
        <span className="field-status-dot" />
        <span>{badge || "SYNTHETIC SURVEY SITE"}</span>
        <span>Perspective view · physical metres</span>
      </div>
      <div className="field-view-controls">
        <span>Drag to orbit · wheel to zoom</span>
        <div>
          {views.map((v, i) => (
            <button
              key={v.name}
              aria-pressed={i === active}
              onClick={() => applyView(i)}
            >
              {v.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
