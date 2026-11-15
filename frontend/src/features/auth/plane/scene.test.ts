import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createPlaneStage, PLANE_ASPECT } from "./scene";

/** A quarter of the idle cycle apart, plus the rest pose. */
const POSES_MS = [0, 2250, 4500, 6750, 9000];

/** Screen-space (NDC) bounds of every vertex of the plane, instanced windows aside. */
function projectedBounds(stage: ReturnType<typeof createPlaneStage>) {
  stage.scene.updateMatrixWorld(true);
  stage.camera.updateMatrixWorld(true);
  const bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const v = new THREE.Vector3();
  stage.plane.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (object as THREE.InstancedMesh).isInstancedMesh) return;
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(stage.camera);
      bounds.minX = Math.min(bounds.minX, v.x);
      bounds.maxX = Math.max(bounds.maxX, v.x);
      bounds.minY = Math.min(bounds.minY, v.y);
      bounds.maxY = Math.max(bounds.maxY, v.y);
    }
  });
  return bounds;
}

function belongsTo(object: THREE.Object3D, name: string): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o.name === name) return true;
  return false;
}

describe("createPlaneStage", () => {
  it("frames the plane across about 80-85 % of the hero width at rest", () => {
    // PlaneHero's box (aspect-16/7) and the 1280×560 still share this ratio.
    expect(PLANE_ASPECT).toBeCloseTo(16 / 7, 6);
    const stage = createPlaneStage();
    stage.setAspect(PLANE_ASPECT);
    stage.pose(0);
    const { minX, maxX } = projectedBounds(stage);
    const span = (maxX - minX) / 2;
    expect(span).toBeGreaterThanOrEqual(0.78);
    expect(span).toBeLessThanOrEqual(0.87);
    // Centred: the margins left and right differ by less than a tenth of the width.
    expect(Math.abs(1 + minX - (1 - maxX)) / 2).toBeLessThan(0.1);
  });

  it("keeps the whole plane inside the hero box through the idle cycle", () => {
    const stage = createPlaneStage();
    stage.setAspect(PLANE_ASPECT);
    for (const ms of POSES_MS) {
      stage.pose(ms);
      const { minX, maxX, minY, maxY } = projectedBounds(stage);
      expect(minX, `${ms} ms`).toBeGreaterThan(-0.98);
      expect(maxX, `${ms} ms`).toBeLessThan(0.98);
      expect(minY, `${ms} ms`).toBeGreaterThan(-0.95);
      expect(maxY, `${ms} ms`).toBeLessThan(0.95);
    }
  });

  it("shows both engine intakes to the camera through the idle cycle", () => {
    const stage = createPlaneStage();
    stage.setAspect(PLANE_ASPECT);
    const targets = stage.scene.children.filter((o) => o.name !== "ground-shadow");
    for (const ms of POSES_MS) {
      stage.pose(ms);
      stage.scene.updateMatrixWorld(true);
      for (const engine of ["engine-left", "engine-right"]) {
        const intake = stage.plane.getObjectByName(`${engine}-intake`);
        expect(intake, engine).toBeDefined();
        const centre = new THREE.Box3()
          .setFromObject(intake as THREE.Object3D)
          .getCenter(new THREE.Vector3());
        const direction = centre.clone().sub(stage.camera.position).normalize();
        const first = new THREE.Raycaster(stage.camera.position, direction).intersectObjects(
          targets,
          true,
        )[0];
        expect(first, `${engine} at ${ms} ms`).toBeDefined();
        expect(belongsTo(first.object, engine), `${engine} at ${ms} ms: ${first.object.name}`).toBe(
          true,
        );
      }
    }
  });

  it("starts the idle motion from the rest pose of the still image", () => {
    const stage = createPlaneStage();
    stage.pose(0);
    const rest = new THREE.Matrix4().compose(
      stage.plane.position,
      stage.plane.quaternion,
      stage.plane.scale,
    );
    stage.pose(16);
    const early = new THREE.Matrix4().compose(
      stage.plane.position,
      stage.plane.quaternion,
      stage.plane.scale,
    );
    // One frame in, the plane has moved by far less than a degree.
    for (let i = 0; i < 16; i++) {
      expect(Math.abs(early.elements[i] - rest.elements[i]), `element ${i}`).toBeLessThan(1e-3);
    }
  });

  it("puts a soft shadow under the plane, fading to nothing at its rim", () => {
    const stage = createPlaneStage();
    const shadow = stage.scene.getObjectByName("ground-shadow") as THREE.Mesh;
    expect(shadow).toBeDefined();
    const material = shadow.material as THREE.MeshBasicMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.map).toBeNull();
    const color = shadow.geometry.getAttribute("color");
    expect(color.itemSize).toBe(4);
    const alphas = Array.from({ length: color.count }, (_, i) => color.getW(i));
    expect(Math.max(...alphas)).toBe(1);
    expect(Math.min(...alphas)).toBe(0);

    stage.scene.updateMatrixWorld(true);
    const plane = new THREE.Box3().setFromObject(stage.plane);
    expect(shadow.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(plane.min.y);
  });
});
