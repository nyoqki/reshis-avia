/**
 * True when the browser can create a WebGL context. Tries webgl2, then webgl, on a throwaway canvas
 * and releases the context right away; any exception counts as unavailable.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
