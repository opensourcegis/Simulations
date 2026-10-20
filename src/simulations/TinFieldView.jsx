import { useCallback, useEffect, useRef, useState } from "react";
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
import { caption } from "./PhotoLabScene.jsx";

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
  frame,
}) {
  const [mode, setMode] = useState("lesson"),
    [wire, setWire] = useState(true),
    current = useRef({ mode, showObjects });
  current.current = { mode, showObjects };
  useEffect(() => {
    setMode("lesson");
  }, [frame]);
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
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(114, 114),
      new THREE.MeshBasicMaterial({ color: 0x243c42, side: THREE.DoubleSide }),
    );
    backdrop.name = "analysis-backdrop";
    backdrop.position.set(50, 50, Math.min(...points.map((p) => p.z)) - 4);
    g.add(backdrop);
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
  }, [preset, physicalObjects, points]);
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
        p.push(q.x, q.y, q.z + (mode === "site" ? 0.09 : 0));
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
          size: 3.5,
          sizeAttenuation: false,
          vertexColors: true,
        }),
      );
      cloud.userData.pickIds = ids;
      g.add(cloud);
    }
    if (mode === "surface" || mode === "lesson") {
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
      const surface = new THREE.Mesh(
        geo,
        mode === "lesson"
          ? new THREE.MeshStandardMaterial({
              color: 0x96b29b,
              roughness: 1,
              transparent: true,
              opacity: 0.42,
              side: THREE.DoubleSide,
              depthWrite: false,
            })
          : groundMaterial(),
      );
      surface.receiveShadow = true;
      g.add(surface);
      if (wire || mode === "lesson")
        g.add(
          new THREE.LineSegments(
            new THREE.WireframeGeometry(geo),
            new THREE.LineBasicMaterial({
              color: mode === "lesson" ? 0xd4e6cd : 0x34493a,
              transparent: true,
              opacity: mode === "lesson" ? 0.9 : 0.4,
            }),
          ),
        );
    }
    if (mode === "lesson" && frame) {
      const byId = new Map(points.map((p) => [p.id, p])),
        at = (id) => {
          const p = byId.get(id);
          return [p.x, p.y, p.z];
        },
        edge = (ids) => [...ids, ids[0]].map(at),
        key = (t) => [...t].sort((a, b) => a - b).join(",");
      if (["cells", "seeds"].includes(frame.phase)) {
        snapshot.seedCells.forEach((cell) => {
          trace(
            g,
            [
              [cell.x0, cell.y0, 0],
              [cell.x1, cell.y0, 0],
              [cell.x1, cell.y1, 0],
              [cell.x0, cell.y1, 0],
              [cell.x0, cell.y0, 0],
            ],
            0xc1ccb4,
            0.65,
          );
        });
      }
      if (frame.triangle) trace(g, edge(frame.triangle), 0xffdb8e, 1);
      const event = frame.event;
      if (event && frame.phase !== "retriangulate") {
        const vs = event.test.facetIds.map(at),
          geo = new THREE.BufferGeometry().setFromPoints(
            vs.map((p) => new THREE.Vector3(...p)),
          );
        geo.setIndex([0, 1, 2]);
        geo.computeVertexNormals();
        const facet = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({
            color: 0x5cb4df,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        g.add(facet);
        trace(g, [...vs, vs[0]], 0x74cfff, 1);
        const candidate = at(event.id),
          foot = event.test.projection;
        trace(g, [candidate, foot], 0xffd680, 1);
        vs.forEach((v, i) => {
          trace(g, [v, candidate], 0xdccca9, 0.65);
          caption(
            g,
            ["A", "B", "C"][i],
            v.map((x, j) => x + (j === 2 ? 1 : 0)),
            "#bde8ff",
            1.1,
          );
        });
        caption(
          g,
          "P" + event.id,
          candidate.map((v, i) => v + (i === 2 ? 1.5 : 0)),
          "#ffe7a9",
          1.2,
        );
        caption(
          g,
          "d = " + event.test.d.toFixed(3) + " m",
          candidate.map((v, i) => (v + foot[i]) / 2 + (i === 2 ? -0.8 : 0)),
          "#ffe7a9",
          0.9,
        );
        let worst = 0;
        vs.forEach((v, i) => {
          if (
            Math.hypot(...candidate.map((x, j) => x - v[j])) <
            Math.hypot(...candidate.map((x, j) => x - vs[worst][j]))
          )
            worst = i;
        });
        const v = new THREE.Vector3(...vs[worst]),
          a = new THREE.Vector3(...foot).sub(v).normalize(),
          b = new THREE.Vector3(...candidate).sub(v).normalize(),
          angle = a.angleTo(b),
          axis = new THREE.Vector3().crossVectors(a, b).normalize();
        if (angle > 1e-8) {
          const radius = Math.min(
            3,
            new THREE.Vector3(...candidate).distanceTo(v) * 0.3,
          );
          trace(
            g,
            Array.from({ length: 25 }, (_, i) =>
              a
                .clone()
                .applyAxisAngle(axis, (angle * i) / 24)
                .multiplyScalar(radius)
                .add(v)
                .toArray(),
            ),
            0xf2c779,
            1,
          );
          caption(
            g,
            "θmax",
            a
              .clone()
              .multiplyScalar(radius + 1)
              .add(v)
              .toArray(),
            "#ffe7a9",
            0.9,
          );
        }
      }
      if (event && frame.phase === "retriangulate") {
        const before = new Set(event.beforeTriangles.map(key)),
          after = new Set(event.afterTriangles.map(key));
        event.beforeTriangles
          .filter((t) => !after.has(key(t)))
          .forEach((t) => {
            const line = trace(g, edge(t), 0xe6a876, 1);
            line.material.dispose();
            line.material = new THREE.LineDashedMaterial({
              color: 0xe6a876,
              dashSize: 1,
              gapSize: 0.65,
            });
            line.computeLineDistances();
          });
        event.afterTriangles
          .filter((t) => !before.has(key(t)))
          .forEach((t) => trace(g, edge(t), 0x7ff5aa, 1));
        caption(
          g,
          "Inserted P" + event.id,
          at(event.id).map((v, i) => v + (i === 2 ? 1.5 : 0)),
          "#b0ffd0",
          1.2,
        );
      }
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
  }, [points, snapshot, mode, wire, selectedId, maxEdge, frame]);
  return (
    <>
      <div className="field-modebar">
        <div>
          {[
            ["lesson", "Construction lesson"],
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
          c.physical.getObjectByName("analysis-backdrop").visible = !site;
        }}
        label="Perspective survey site with terrain, buildings and vegetation at actual dimensions. Switch to measured returns or recovered terrain to inspect the ground filter."
      />
      <p className="field-caption">
        {mode === "lesson"
          ? "Measured XYZ positions; point symbols are not footprint diameters. Blue: tested facet · gold: candidate / seed · green: new facets · orange dashed: removed facets. The dark analysis backdrop is not a terrain estimate. Reference terrain is hidden."
          : mode === "site"
            ? "Synthetic reference landscape—not a reconstruction. Buildings and trees occupy the generated survey footprints."
            : mode === "returns"
              ? "Only simulated measured returns are shown. Sage: accepted ground · sand: initial seeds · blue: unclassified · red: screened low returns. Click a return to inspect it."
              : "Recovered ground uses only accepted points and supported facets. Empty areas are unobserved—not filled with the reference terrain."}{" "}
        No vertical exaggeration.
      </p>
    </>
  );
}
