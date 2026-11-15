import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlaneHero } from "./PlaneHero";
import { webglAvailable } from "./webgl";

const handle = {
  start: vi.fn(),
  stop: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  running: false,
};
const mountPlaneScene = vi.fn();
const sceneLoaded = vi.fn();

vi.mock("./scene", () => {
  sceneLoaded();
  class WebGLUnavailableError extends Error {}
  return {
    WebGLUnavailableError,
    mountPlaneScene: (...args: unknown[]) => mountPlaneScene(...args),
  };
});
vi.mock("./webgl", () => ({ webglAvailable: vi.fn(() => true) }));

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;
const observers: { callback: IOCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];

class FakeIntersectionObserver {
  disconnect = vi.fn();
  constructor(callback: IOCallback) {
    observers.push({ callback, disconnect: this.disconnect });
  }
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function setMedia(opts: { reduced?: boolean; wide?: boolean }) {
  const { reduced = false, wide = true } = opts;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reduced : wide,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** matchMedia whose width query can be flipped later, notifying its change listeners. */
function setResizableMedia(initialWide: boolean): (wide: boolean) => void {
  let wide = initialWide;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => {
    const isWidth = !query.includes("prefers-reduced-motion");
    return {
      get matches() {
        return isWidth ? wide : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, fn: () => void) => {
        if (isWidth) listeners.add(fn);
      },
      removeEventListener: (_type: string, fn: () => void) => {
        listeners.delete(fn);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });
  return (next: boolean) => {
    wide = next;
    act(() => {
      for (const fn of [...listeners]) fn();
    });
  };
}

function stillShown(img: HTMLImageElement | null): boolean {
  if (!img) return false;
  return !/(^|\s)opacity-0(\s|$)/.test(img.className) && !img.hidden;
}

function intersect(isIntersecting: boolean) {
  for (const o of observers) o.callback([{ isIntersecting }]);
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

function canvasShown(canvas: HTMLCanvasElement | null): boolean {
  if (!canvas) return false;
  if (canvas.style.opacity === "1") return true;
  if (canvas.dataset.visible === "true" || canvas.dataset.ready === "true") return true;
  return /(^|\s)opacity-100(\s|$)/.test(canvas.className);
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  setMedia({});
  vi.mocked(webglAvailable).mockReturnValue(true);
  mountPlaneScene.mockReset();
  mountPlaneScene.mockReturnValue(handle);
  for (const fn of Object.values(handle)) if (typeof fn === "function") fn.mockReset?.();
  sceneLoaded.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setHidden(false);
});

describe("PlaneHero", () => {
  it("TB-AC9: the first render shows the still image with width and height inside the fixed-ratio box and no canvas-driven layout change", () => {
    const { container } = render(<PlaneHero className="x" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("");
    expect(Number(img?.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(img?.getAttribute("height"))).toBeGreaterThan(0);
    expect(img?.getAttribute("decoding")).toBe("async");
    expect(img?.getAttribute("src")).toBeTruthy();
    expect(container.firstElementChild?.className).toContain("x");
    expect(container.firstElementChild?.className).toMatch(/aspect-/);
    expect(canvasShown(container.querySelector("canvas"))).toBe(false);
  });

  it("TB-AC9: the box has the still's own ratio, so the still fills it edge to edge", () => {
    const { container } = render(<PlaneHero />);
    const box = container.firstElementChild as HTMLElement;
    const img = container.querySelector("img");
    const match = box.className.match(/(?:^|\s)aspect-(\d+)\/(\d+)(?:\s|$)/);
    expect(match).not.toBeNull();
    const ratio = Number(match?.[1]) / Number(match?.[2]);
    const still = Number(img?.getAttribute("width")) / Number(img?.getAttribute("height"));
    expect(still).toBeCloseTo(ratio, 3);
    // The ratio the scene frames the plane for (PLANE_ASPECT in scene.ts).
    expect(ratio).toBeCloseTo(16 / 7, 3);
  });

  it("TB-AC9/TB-AC16: under reduced motion the scene module is never imported", async () => {
    setMedia({ reduced: true });
    render(<PlaneHero />);
    intersect(true);
    await flush();
    expect(sceneLoaded).not.toHaveBeenCalled();
    expect(mountPlaneScene).not.toHaveBeenCalled();
  });

  it("TB-AC9: without WebGL the scene module is never imported", async () => {
    vi.mocked(webglAvailable).mockReturnValue(false);
    const { container } = render(<PlaneHero />);
    intersect(true);
    await flush();
    expect(sceneLoaded).not.toHaveBeenCalled();
    expect(mountPlaneScene).not.toHaveBeenCalled();
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("TB-AC9: the scene is imported and started with maxDpr 2 only after the IntersectionObserver reports intersecting", async () => {
    render(<PlaneHero />);
    await flush();
    expect(sceneLoaded).not.toHaveBeenCalled();
    expect(mountPlaneScene).not.toHaveBeenCalled();
    intersect(true);
    await flush();
    expect(mountPlaneScene).toHaveBeenCalledTimes(1);
    const [canvas, options] = mountPlaneScene.mock.calls[0];
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(options).toMatchObject({ maxDpr: 2 });
    expect(typeof options.onFirstFrame).toBe("function");
    expect(handle.start).toHaveBeenCalled();
  });

  it("TB-AC9: the still stays until onFirstFrame fires, then the canvas is marked visible", async () => {
    const { container } = render(<PlaneHero />);
    intersect(true);
    await flush();
    expect(canvasShown(container.querySelector("canvas"))).toBe(false);
    expect(container.querySelector("img")).not.toBeNull();
    act(() => {
      mountPlaneScene.mock.calls[0][1].onFirstFrame();
    });
    expect(canvasShown(container.querySelector("canvas"))).toBe(true);
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("TB-AC9: leaving the viewport and a hidden tab stop the loop; coming back starts it", async () => {
    render(<PlaneHero />);
    intersect(true);
    await flush();
    handle.start.mockClear();
    handle.stop.mockClear();

    intersect(false);
    expect(handle.stop).toHaveBeenCalled();
    handle.start.mockClear();
    intersect(true);
    expect(handle.start).toHaveBeenCalled();

    handle.stop.mockClear();
    act(() => setHidden(true));
    expect(handle.stop).toHaveBeenCalled();
    handle.start.mockClear();
    act(() => setHidden(false));
    expect(handle.start).toHaveBeenCalled();
  });

  it("TB-AC9: unmount disposes the scene; a failing mount keeps the still image", async () => {
    const first = render(<PlaneHero />);
    intersect(true);
    await flush();
    first.unmount();
    expect(handle.dispose).toHaveBeenCalledTimes(1);

    observers.length = 0;
    mountPlaneScene.mockImplementation(() => {
      throw new Error("no webgl");
    });
    const second = render(<PlaneHero />);
    intersect(true);
    await flush();
    expect(second.container.querySelector("img")).not.toBeNull();
    expect(canvasShown(second.container.querySelector("canvas"))).toBe(false);
  });

  it("TB-AC9: unmounting before the import resolves means mountPlaneScene is never called", async () => {
    const { unmount } = render(<PlaneHero />);
    intersect(true);
    unmount();
    await flush();
    expect(mountPlaneScene).not.toHaveBeenCalled();
  });

  it("TB-AC9: two intersecting callbacks before the import resolves import and mount the scene once", async () => {
    render(<PlaneHero />);
    intersect(true);
    intersect(true);
    await flush();
    intersect(true);
    await flush();
    expect(mountPlaneScene).toHaveBeenCalledTimes(1);
  });

  it("TB-AC9: the still fades out once the scene has drawn its first frame", async () => {
    const { container } = render(<PlaneHero />);
    const img = container.querySelector("img");
    expect(stillShown(img)).toBe(true);
    intersect(true);
    await flush();
    expect(stillShown(img)).toBe(true);
    act(() => {
      mountPlaneScene.mock.calls[0][1].onFirstFrame();
    });
    expect(canvasShown(container.querySelector("canvas"))).toBe(true);
    expect(stillShown(img)).toBe(false);
  });

  it("TB-AC9: widening past 768 px after mount loads the scene; narrowing again disposes it and brings the still back", async () => {
    const resize = setResizableMedia(false);
    const { container } = render(<PlaneHero />);
    intersect(true);
    await flush();
    expect(sceneLoaded).not.toHaveBeenCalled();
    expect(mountPlaneScene).not.toHaveBeenCalled();

    resize(true);
    intersect(true);
    await flush();
    expect(mountPlaneScene).toHaveBeenCalledTimes(1);
    act(() => {
      mountPlaneScene.mock.calls[0][1].onFirstFrame();
    });
    const img = container.querySelector("img");
    expect(stillShown(img)).toBe(false);

    resize(false);
    expect(handle.dispose).toHaveBeenCalledTimes(1);
    expect(stillShown(img)).toBe(true);
    expect(canvasShown(container.querySelector("canvas"))).toBe(false);
  });
});
