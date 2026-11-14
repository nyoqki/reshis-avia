import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAirliner, LIVERY } from "./airliner";

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
  "wing-left",
  "wing-right",
  "tail-fin",
  "stabilizer-left",
  "stabilizer-right",
  "engine-left",
  "engine-right",
  "window-band",
];

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
