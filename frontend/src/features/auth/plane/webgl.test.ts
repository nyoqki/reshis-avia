import { afterEach, describe, expect, it, vi } from "vitest";

import { webglAvailable } from "./webgl";

function stubContexts(available: Record<string, boolean>) {
  const loseContext = vi.fn();
  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockImplementation(((kind: string) =>
      available[kind]
        ? { getExtension: () => ({ loseContext }) }
        : null) as unknown as HTMLCanvasElement["getContext"]);
  return { spy, loseContext };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("webglAvailable", () => {
  it("TB-AC9: true with WebGL2, and the probe context is released", () => {
    const { loseContext } = stubContexts({ webgl2: true, webgl: true });
    expect(webglAvailable()).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("TB-AC9: false on a WebGL1-only browser, since the scene needs a webgl2 context", () => {
    stubContexts({ webgl2: false, webgl: true });
    expect(webglAvailable()).toBe(false);
  });

  it("TB-AC9: false when getContext throws", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(webglAvailable()).toBe(false);
  });
});
