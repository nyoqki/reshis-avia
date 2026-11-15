import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAirliner, ENGINE_SPAN, LIVERY, WINDOWS_PER_SIDE } from "./airliner";

const renderSpy = vi.fn();
const rendererDisposeSpy = vi.fn();

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  class FakeRenderer {
    domElement: HTMLCanvasElement;
    constructor(params?: { canvas?: HTMLCanvasElement }) {
      this.domElement = params?.canvas ?? document.createElement("canvas");
    }
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    setClearColor = vi.fn();
    setClearAlpha = vi.fn();
    render = (...args: unknown[]) => renderSpy(...args);
    dispose = () => rendererDisposeSpy();
    getContext = vi.fn();
  }
  return { ...actual, WebGLRenderer: FakeRenderer };
});

const PARTS = [
  "fuselage",
  "belly-fairing",
  "wing-left",
  "wing-right",
  "tail-fin",
  "tail-mark",
  "tail-paint",
  "stabilizer-left",
  "stabilizer-right",
  "engine-left",
  "engine-right",
  "cabin-windows",
  "cockpit-windows",
];

/** Paint and windows laid over another surface: they must clear it and win the depth test. */
const DECALS = ["cabin-windows", "cockpit-windows", "tail-mark", "tail-paint"];

function part(plane: THREE.Object3D, name: string): THREE.Object3D {
  const found = plane.getObjectByName(name);
  if (!found) throw new Error(`no part named ${name}`);
  return found;
}

function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  return new THREE.Box3().setFromObject(object);
}

/** Hits of a ray against the given objects, nearest first. */
function hits(origin: THREE.Vector3, direction: THREE.Vector3, objects: THREE.Object3D[]) {
  return new THREE.Raycaster(origin, direction.clone().normalize()).intersectObjects(objects, true);
}

function meshes(group: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

function colorOf(obj: THREE.Object3D): string {
  const found = meshes(obj)[0];
  const mat = found.material as THREE.MeshStandardMaterial;
  return `#${mat.color.getHexString()}`;
}

describe("buildAirliner", () => {
  it("returns a Group with all named parts", () => {
    const plane = buildAirliner();
    expect(plane).toBeInstanceOf(THREE.Group);
    for (const name of PARTS) {
      expect(plane.getObjectByName(name), name).toBeDefined();
    }
  });

  it("uses MeshStandardMaterial with no texture maps on every mesh", () => {
    const list = meshes(buildAirliner());
    expect(list.length).toBeGreaterThanOrEqual(PARTS.length);
    for (const mesh of list) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(mat.map).toBeNull();
      expect(mat.normalMap).toBeNull();
      expect(mat.roughnessMap).toBeNull();
      expect(mat.metalnessMap).toBeNull();
      expect(mat.emissiveMap).toBeNull();
    }
  });

  it("takes material colours from the livery", () => {
    const plane = buildAirliner();
    const fin = plane.getObjectByName("tail-fin");
    expect(fin).toBeDefined();
    expect(colorOf(fin as THREE.Object3D)).toBe(LIVERY.tail.toLowerCase());

    const custom = buildAirliner({ ...LIVERY, tail: "#123456" });
    expect(colorOf(custom.getObjectByName("tail-fin") as THREE.Object3D)).toBe("#123456");
  });

  it("is 4-6 units long along X and centred near the origin", () => {
    const plane = buildAirliner();
    plane.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(plane);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    expect(size.x).toBeGreaterThanOrEqual(4);
    expect(size.x).toBeLessThanOrEqual(6);
    expect(Math.abs(centre.x)).toBeLessThan(0.6);
    expect(Math.abs(centre.y)).toBeLessThan(0.6);
    expect(Math.abs(centre.z)).toBeLessThan(0.6);
  });

  it("hangs one engine under each wing at about a third of the semi-span, mirrored", () => {
    const plane = buildAirliner();
    const centres: THREE.Vector3[] = [];
    for (const side of ["left", "right"] as const) {
      const wing = part(plane, `wing-${side}`);
      const cowl = part(plane, `engine-${side}-cowl`);
      const semiSpan = Math.max(...[worldBox(wing).min.z, worldBox(wing).max.z].map(Math.abs));
      const box = worldBox(cowl);
      const centre = box.getCenter(new THREE.Vector3());
      centres.push(centre);
      expect(Math.abs(centre.z) / semiSpan, side).toBeGreaterThan(0.28);
      expect(Math.abs(centre.z) / semiSpan, side).toBeLessThan(0.42);
      expect(Math.sign(centre.z), side).toBe(side === "right" ? 1 : -1);

      // Straight up from the rear of the nacelle is its own wing, a short pylon's height above.
      const rear = new THREE.Vector3(box.min.x + 0.1 * (box.max.x - box.min.x), centre.y, centre.z);
      const above = hits(rear, new THREE.Vector3(0, 1, 0), [wing]);
      expect(above.length, side).toBeGreaterThan(0);
      const gap = above[0].point.y - box.max.y;
      expect(gap, side).toBeGreaterThan(0);
      expect(gap, side).toBeLessThan(0.12);
      // The intake sits ahead of the leading edge, as on a real twin-jet: nothing above it.
      const intake = new THREE.Vector3(box.max.x, centre.y, centre.z);
      expect(hits(intake, new THREE.Vector3(0, 1, 0), [wing]), side).toHaveLength(0);
    }
    const [left, right] = centres;
    expect(left.x).toBeCloseTo(right.x, 6);
    expect(left.y).toBeCloseTo(right.y, 6);
    expect(left.z).toBeCloseTo(-right.z, 6);
    expect(Math.abs(right.z)).toBeCloseTo(ENGINE_SPAN, 1);
  });

  it("gives the nacelles graphite cowls with a lighter intake lip, not black", () => {
    const plane = buildAirliner();
    const luminance = (name: string) => {
      const mat = (part(plane, name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
      return mat.color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace).l;
    };
    for (const side of ["left", "right"]) {
      const cowl = luminance(`engine-${side}-cowl`);
      expect(cowl).toBeGreaterThan(0.2);
      expect(luminance(`engine-${side}-intake`)).toBeGreaterThan(cowl + 0.3);
    }
  });

  it("has no boxes: each wing is one lofted surface that ends in a winglet in the wing colour", () => {
    const plane = buildAirliner();
    for (const mesh of meshes(plane)) {
      expect(mesh.geometry.type, mesh.name).not.toBe("BoxGeometry");
    }
    for (const side of ["left", "right"]) {
      const wing = part(plane, `wing-${side}`) as THREE.Mesh;
      expect(wing.children, side).toHaveLength(0);
      expect(colorOf(wing)).toBe(LIVERY.wing.toLowerCase());

      const position = wing.geometry.getAttribute("position");
      let top = 0;
      for (let i = 1; i < position.count; i++) if (position.getY(i) > position.getY(top)) top = i;
      let root = 0;
      for (let i = 1; i < position.count; i++) {
        if (Math.abs(position.getZ(i)) < Math.abs(position.getZ(root))) root = i;
      }
      const semiSpan = Math.max(...[worldBox(wing).min.z, worldBox(wing).max.z].map(Math.abs));
      // The highest point is the winglet at the very tip, well above the wing root…
      expect(Math.abs(position.getZ(top)) / semiSpan, side).toBeGreaterThan(0.9);
      expect(position.getY(top) - position.getY(root), side).toBeGreaterThan(0.3);
      // …and swept back behind the leading edge of the tip.
      const tipLeadingEdge = Math.max(
        ...Array.from({ length: position.count }, (_, i) => i)
          .filter((i) => Math.abs(position.getZ(i)) > 0.9 * semiSpan)
          .map((i) => position.getX(i)),
      );
      expect(position.getX(top), side).toBeLessThan(tipLeadingEdge);
    }
  });

  it("lines both sides with rows of cabin windows", () => {
    const windows = part(buildAirliner(), "cabin-windows") as THREE.InstancedMesh;
    expect(windows.isInstancedMesh).toBe(true);
    expect(windows.count).toBe(2 * WINDOWS_PER_SIDE);
    expect(WINDOWS_PER_SIDE).toBeGreaterThanOrEqual(20);
    const matrix = new THREE.Matrix4();
    const centre = new THREE.Vector3();
    windows.geometry.computeBoundingBox();
    const local =
      windows.geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    let right = 0;
    let left = 0;
    for (let i = 0; i < windows.count; i++) {
      windows.getMatrixAt(i, matrix);
      centre.copy(local).applyMatrix4(matrix);
      if (centre.z > 0) right++;
      else left++;
      expect(centre.y, `window ${i}`).toBeGreaterThan(0);
    }
    expect(right).toBe(WINDOWS_PER_SIDE);
    expect(left).toBe(WINDOWS_PER_SIDE);
  });

  it("lays every decal over its surface with a clear gap and a polygon offset, so nothing flickers", () => {
    const plane = buildAirliner();
    for (const name of DECALS) {
      const mat = (part(plane, name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
      expect(mat.polygonOffset, name).toBe(true);
      expect(mat.polygonOffsetFactor, name).toBeLessThan(0);
    }

    const fuselage = part(plane, "fuselage");
    const windows = part(plane, "cabin-windows") as THREE.InstancedMesh;
    windows.updateWorldMatrix(true, false);
    const matrix = new THREE.Matrix4();
    windows.geometry.computeBoundingBox();
    const patch =
      windows.geometry.boundingBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    for (const i of [0, 1, windows.count / 2, windows.count - 1]) {
      windows.getMatrixAt(i, matrix);
      const centre = patch.clone().applyMatrix4(matrix);
      // Probe along the radius through the window, from outside the skin inwards.
      const outward = new THREE.Vector3(0, centre.y, centre.z).normalize();
      const target = new THREE.Vector3(centre.x, 0, 0).addScaledVector(outward, 0.28);
      const found = hits(target.clone().addScaledVector(outward, 1), outward.clone().negate(), [
        windows,
        fuselage,
      ]);
      expect(found[0]?.object.name, `window ${i}`).toBe("cabin-windows");
      const skin = found.find((hit) => hit.object.name === "fuselage");
      expect(skin, `window ${i}`).toBeDefined();
      expect((skin?.distance ?? 0) - found[0].distance, `window ${i}`).toBeGreaterThan(0.001);
    }

    const fin = part(plane, "tail-fin") as THREE.Mesh;
    const mark = part(plane, "tail-mark") as THREE.Mesh;
    const position = mark.geometry.getAttribute("position");
    const index = mark.geometry.getIndex();
    expect(index).not.toBeNull();
    for (const t of [0, 3, 30]) {
      const centroid = new THREE.Vector3();
      for (let k = 0; k < 3; k++) {
        const v = index?.getX(t + k) ?? 0;
        centroid.add(new THREE.Vector3(position.getX(v), position.getY(v), 0));
      }
      centroid.divideScalar(3);
      const found = hits(
        new THREE.Vector3(centroid.x, centroid.y, 1),
        new THREE.Vector3(0, 0, -1),
        [mark, fin],
      );
      expect(found[0]?.object.name, `triangle ${t}`).toBe("tail-mark");
      const skin = found.find((hit) => hit.object.name === "tail-fin");
      expect((skin?.distance ?? 0) - found[0].distance, `triangle ${t}`).toBeGreaterThan(0.001);
    }
  });

  it("paints the brand letter on the fin in the mark colour", () => {
    const plane = buildAirliner();
    expect(colorOf(part(plane, "tail-mark"))).toBe(LIVERY.mark.toLowerCase());
    expect(colorOf(part(plane, "tail-paint"))).toBe(LIVERY.tail.toLowerCase());
    const fin = worldBox(part(plane, "tail-fin"));
    const mark = worldBox(part(plane, "tail-mark"));
    // On both sides of the fin, inside its outline.
    expect(mark.min.z).toBeLessThan(0);
    expect(mark.max.z).toBeGreaterThan(0);
    expect(mark.min.y).toBeGreaterThan(fin.min.y);
    expect(mark.max.y).toBeLessThan(fin.max.y);
  });
});

describe("mountPlaneScene", () => {
  beforeEach(() => {
    renderSpy.mockClear();
    rendererDisposeSpy.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws WebGLUnavailableError without a WebGL context and schedules no frame", async () => {
    const { mountPlaneScene, WebGLUnavailableError } = await import("./scene");
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const canvas = document.createElement("canvas");
    expect(() => mountPlaneScene(canvas)).toThrow(WebGLUnavailableError);
    expect(raf).not.toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
  });

  describe("with a stubbed context", () => {
    beforeEach(() => {
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
        {} as unknown as RenderingContext,
      );
    });

    it("still mode renders one frame, fires onFirstFrame once and requests no frame", async () => {
      const { mountPlaneScene } = await import("./scene");
      const raf = vi.spyOn(window, "requestAnimationFrame");
      const onFirstFrame = vi.fn();
      const handle = mountPlaneScene(document.createElement("canvas"), {
        still: true,
        onFirstFrame,
      });
      handle.start();
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(onFirstFrame).toHaveBeenCalledTimes(1);
      expect(raf).not.toHaveBeenCalled();
      expect(handle.running).toBe(false);
      handle.dispose();
    });

    it("reduced motion never loops", async () => {
      const { mountPlaneScene } = await import("./scene");
      const raf = vi.spyOn(window, "requestAnimationFrame");
      const onFirstFrame = vi.fn();
      const handle = mountPlaneScene(document.createElement("canvas"), {
        reducedMotion: true,
        onFirstFrame,
      });
      handle.start();
      expect(renderSpy).toHaveBeenCalledTimes(1);
      expect(onFirstFrame).toHaveBeenCalledTimes(1);
      expect(raf).not.toHaveBeenCalled();
      handle.dispose();
    });

    it("animated mode fires onFirstFrame once after the first render, then dispose releases resources", async () => {
      const { mountPlaneScene } = await import("./scene");
      const callbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        callbacks.push(cb);
        return callbacks.length;
      });
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
      const geomDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
      const matDispose = vi.spyOn(THREE.Material.prototype, "dispose");

      const order: string[] = [];
      renderSpy.mockImplementation(() => order.push("render"));
      const onFirstFrame = vi.fn(() => order.push("first"));
      const handle = mountPlaneScene(document.createElement("canvas"), { onFirstFrame });
      handle.start();
      expect(handle.running).toBe(true);
      expect(callbacks.length).toBeGreaterThan(0);

      callbacks.shift()?.(16);
      callbacks.shift()?.(32);
      expect(onFirstFrame).toHaveBeenCalledTimes(1);
      expect(order.indexOf("first")).toBeGreaterThan(order.indexOf("render"));

      handle.stop();
      expect(handle.running).toBe(false);
      handle.start();
      callbacks.shift()?.(48);
      expect(onFirstFrame).toHaveBeenCalledTimes(1);

      handle.dispose();
      expect(handle.running).toBe(false);
      expect(rendererDisposeSpy).toHaveBeenCalledTimes(1);
      expect(geomDispose).toHaveBeenCalled();
      expect(matDispose).toHaveBeenCalled();
    });

    it("a disposed handle never calls onFirstFrame", async () => {
      const { mountPlaneScene } = await import("./scene");
      const callbacks: FrameRequestCallback[] = [];
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
        callbacks.push(cb);
        return callbacks.length;
      });
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
      const onFirstFrame = vi.fn();
      const handle = mountPlaneScene(document.createElement("canvas"), { onFirstFrame });
      handle.start();
      handle.dispose();
      for (const cb of callbacks.splice(0)) cb(16);
      expect(onFirstFrame).not.toHaveBeenCalled();
    });
  });
});
