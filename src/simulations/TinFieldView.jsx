import { useCallback, useRef, useState } from "react";
import * as THREE from "three";
import SurveyViewport from "./SurveyViewport.jsx";
import {
  terrain,
  groundMaterial,
  building,
  tree,
  siteDetails,
  trace,
} from "./survey-field-assets.js";
import { tinTerrainHeight, tinFacetLimits } from "./tin-model.js";

const views = [
  { name: "Survey site", position: [145, -115, 92], target: [43, 42, 9] },
  { name: "Ground level", position: [12, -17, 10], target: [52, 52, 11] },
  { name: "Plan", position: [50, 50, 175], target: [50, 50, 5] },
];
export default function TinFieldView({
  points,
  physicalObjects,
  preset,
  snapshot,
  selectedId,
  onSelect,
  showObjects = true,
  maxEdge = 55,
}) {
  const [mode, setMode] = useState("site"),
    [wire, setWire] = useState(false),
    current = useRef({ mode, showObjects });
  current.current = { mode, showObjects };
  const world = useCallback(() => {
    const g = new THREE.Group(),
      h = (x, y) => tinTerrainHeight(preset, x, y),
      mat = groundMaterial();
    terrain(g, h, { step: 5, hole: true, mat });
    terrain(g, h, {
      bounds: [0, 100, 0, 100],
      step: 2,
      mat,
      name: "reference-terrain",
    });
    const objects = new THREE.Group();
    objects.name = "reference-objects";
    physicalObjects.forEach((o, i) =>
      o.type === "tree" ? tree(objects, o, i + 3) : building(objects, o),
    );
    g.add(objects);
    siteDetails(g, h);
    trace(
      g,
      [
        [0, 0, h(0, 0) + 0.04],
        [100, 0, h(100, 0) + 0.04],
        [100, 100, h(100, 100) + 0.04],
        [0, 100, h(0, 100) + 0.04],
        [0, 0, h(0, 0) + 0.04],
      ],
      0xd4cbb4,
      0.4,
    );
    return g;
  }, [preset, physicalObjects]);
  const overlay = useCallback(() => {
    const g = new THREE.Group();
    if (!snapshot) return g;
    if (mode !== "site" || snapshot.groundSet.size > snapshot.seedSet.size) {
      const p = [],
        colors = [],
        ids = [],
        c = new THREE.Color();
      points.forEach((q) => {
        if (mode === "site" && !snapshot.groundSet.has(q.id)) return;
        p.push(q.x, q.y, q.z + 0.09);
        c.set(
          snapshot.excludedSet.has(q.id)
            ? 0xc35a47
            : snapshot.seedSet.has(q.id)
              ? 0xe2bd75
              : snapshot.groundSet.has(q.id)
                ? 0xabc690
                : 0x7fabbc,
        );
        colors.push(c.r, c.g, c.b);
        ids.push(q.id);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      const cloud = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size: 0.65,
          sizeAttenuation: true,
          vertexColors: true,
        }),
      );
      cloud.userData.pickIds = ids;
      g.add(cloud);
    }
    if (mode === "surface") {
      const byId = new Map(points.map((p) => [p.id, p])),
        p = [],
        uv = [];
      snapshot.triangles.forEach((ids) => {
        const vertices = ids.map((id) => byId.get(id));
        if (!tinFacetLimits(vertices, 1, { maxEdge }).supported) return;
        vertices.forEach((q) => {
          p.push(q.x, q.y, q.z);
          uv.push((q.x + 300) / 600, (q.y + 300) / 600);
        });
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.computeVertexNormals();
      const surface = new THREE.Mesh(geo, groundMaterial());
      surface.receiveShadow = true;
      g.add(surface);
      if (wire)
        g.add(
          new THREE.LineSegments(
            new THREE.WireframeGeometry(geo),
            new THREE.LineBasicMaterial({
              color: 0x34493a,
              transparent: true,
              opacity: 0.4,
            }),
          ),
        );
    }
    const q = points.find((p) => p.id === selectedId);
    if (q) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.8, 0.045, 6, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd991, depthTest: false }),
      );
      ring.position.set(q.x, q.y, q.z + 0.08);
      g.add(ring);
    }
    return g;
  }, [points, snapshot, mode, wire, selectedId, maxEdge]);
  return (
    <>
      <div className="field-modebar">
        <div>
          {[
            ["site", "Survey context"],
            ["returns", "Measured returns"],
            ["surface", "Recovered terrain"],
          ].map(([id, name]) => (
            <button
              key={id}
              aria-pressed={mode === id}
              onClick={() => setMode(id)}
            >
              {name}
            </button>
          ))}
        </div>
        {mode === "surface" && (
          <label>
            <input
              type="checkbox"
              checked={wire}
              onChange={(e) => setWire(e.target.checked)}
            />
            TIN edges
          </label>
        )}
      </div>
      <SurveyViewport
        world={world}
        overlay={overlay}
        views={views}
        onSelect={onSelect}
        onFrame={(c) => {
          const ground = c.physical.getObjectByName("reference-terrain"),
            objects = c.physical.getObjectByName("reference-objects"),
            site = current.current.mode === "site",
            show = site && current.current.showObjects;
          if (ground.visible !== site || objects.visible !== show)
            c.sun.shadow.needsUpdate = true;
          ground.visible = site;
          objects.visible = show;
        }}
        label="Perspective survey site with terrain, buildings and vegetation at actual dimensions. Switch to measured returns or recovered terrain to inspect the ground filter."
      />
      <p className="field-caption">
        {mode === "site"
          ? "Synthetic reference landscape—not a reconstruction. Buildings and trees occupy the generated survey footprints."
          : mode === "returns"
            ? "Only simulated measured returns are shown. Sage: accepted ground · sand: initial seeds · blue: unclassified · red: screened low returns. Click a return to inspect it."
            : "Recovered ground uses only accepted points and supported facets. Empty areas are unobserved—not filled with the reference terrain."}{" "}
        No vertical exaggeration.
      </p>
    </>
  );
}
