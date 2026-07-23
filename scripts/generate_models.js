import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import fs from 'fs';
import path from 'path';

// Polyfill Node environment for Three.js GLTFExporter
if (typeof window === 'undefined') {
  global.window = {};
  global.document = { createElementNS: () => ({}) };
}

if (typeof FileReader === 'undefined') {
  global.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((ab) => {
        this.result = ab;
        if (this.onloadend) this.onloadend({ target: this });
        if (this.onload) this.onload({ target: this });
      });
    }
    readAsDataURL(blob) {
      blob.arrayBuffer().then((ab) => {
        const base64 = Buffer.from(ab).toString('base64');
        this.result = 'data:application/octet-stream;base64,' + base64;
        if (this.onloadend) this.onloadend({ target: this });
        if (this.onload) this.onload({ target: this });
      });
    }
  };
}

const exporter = new GLTFExporter();

function createTreeModel() {
  const treeGroup = new THREE.Group();
  treeGroup.name = 'TreeModel';

  // Wooden Trunk
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 4.5, 12);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
  const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
  trunkMesh.position.y = 2.25;
  treeGroup.add(trunkMesh);

  // Canopy Tier 1 (Dark Shadow Foliage)
  const canopyGeo1 = new THREE.DodecahedronGeometry(2.4, 1);
  const canopyMat1 = new THREE.MeshStandardMaterial({ color: 0x047857, roughness: 0.7 });
  const canopyMesh1 = new THREE.Mesh(canopyGeo1, canopyMat1);
  canopyMesh1.position.y = 4.5;
  canopyMesh1.scale.set(1.2, 0.9, 1.2);
  treeGroup.add(canopyMesh1);

  // Canopy Tier 2 (Emerald Foliage)
  const canopyGeo2 = new THREE.DodecahedronGeometry(2.0, 1);
  const canopyMat2 = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.6 });
  const canopyMesh2 = new THREE.Mesh(canopyGeo2, canopyMat2);
  canopyMesh2.position.set(0.3, 5.8, 0.2);
  treeGroup.add(canopyMesh2);

  // Canopy Tier 3 (Crown Highlight)
  const canopyGeo3 = new THREE.DodecahedronGeometry(1.5, 1);
  const canopyMat3 = new THREE.MeshStandardMaterial({ color: 0x34d399, roughness: 0.5 });
  const canopyMesh3 = new THREE.Mesh(canopyGeo3, canopyMat3);
  canopyMesh3.position.set(-0.3, 6.7, -0.2);
  treeGroup.add(canopyMesh3);

  return treeGroup;
}

function createBuildingModel() {
  const buildingGroup = new THREE.Group();
  buildingGroup.name = 'BuildingModel';

  // Main Walls
  const wallGeo = new THREE.BoxGeometry(6, 5, 5);
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4 });
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.y = 2.5;
  buildingGroup.add(wallMesh);

  // Roof Slab
  const roofGeo = new THREE.BoxGeometry(6.6, 0.6, 5.6);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.2 });
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.y = 5.3;
  buildingGroup.add(roofMesh);

  // HVAC Structure
  const hvacGeo = new THREE.BoxGeometry(2.2, 1.2, 2.2);
  const hvacMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.3 });
  const hvacMesh = new THREE.Mesh(hvacGeo, hvacMat);
  hvacMesh.position.set(0, 6.2, 0);
  buildingGroup.add(hvacMesh);

  // Windows
  const winGeo = new THREE.BoxGeometry(5.8, 1.2, 5.1);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.1 });
  const winMesh1 = new THREE.Mesh(winGeo, winMat);
  winMesh1.position.y = 1.8;
  buildingGroup.add(winMesh1);

  const winMesh2 = new THREE.Mesh(winGeo, winMat);
  winMesh2.position.y = 3.6;
  buildingGroup.add(winMesh2);

  return buildingGroup;
}

const outputDir = path.resolve(process.cwd(), 'public/models');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function run() {
  const treeScene = createTreeModel();
  const treeArrayBuffer = await exporter.parseAsync(treeScene, { binary: true });
  const treeBuffer = Buffer.from(treeArrayBuffer);
  const treePath = path.join(outputDir, 'tree.glb');
  fs.writeFileSync(treePath, treeBuffer);
  console.log(`Saved tree.glb (${treeBuffer.length} bytes) to ${treePath}`);

  const buildingScene = createBuildingModel();
  const buildingArrayBuffer = await exporter.parseAsync(buildingScene, { binary: true });
  const buildingBuffer = Buffer.from(buildingArrayBuffer);
  const buildingPath = path.join(outputDir, 'building.glb');
  fs.writeFileSync(buildingPath, buildingBuffer);
  console.log(`Saved building.glb (${buildingBuffer.length} bytes) to ${buildingPath}`);
}

run().catch((err) => console.error('Error exporting GLB:', err));
