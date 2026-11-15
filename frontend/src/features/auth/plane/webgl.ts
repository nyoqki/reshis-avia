/**
 * True when the browser can create a WebGL2 context, the only kind the scene asks for, on a
 * throwaway canvas; the context is released right away. A WebGL1-only browser gets false, so it
 * never downloads the three.js chunk it could not render. Any exception counts as unavailable.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
