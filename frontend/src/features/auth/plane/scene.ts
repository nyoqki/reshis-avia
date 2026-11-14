import {
  AmbientLight,
  DirectionalLight,
  type Material,
  type Mesh,
  type Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";

import { buildAirliner, SCENE_LIGHTS } from "./airliner";

export class WebGLUnavailableError extends Error {
  constructor(message = "WebGL is unavailable") {
    super(message);
    this.name = "WebGLUnavailableError";
  }
}

export interface PlaneSceneOptions {
  maxDpr?: number;
  reducedMotion?: boolean;
  still?: boolean;
  preserveDrawingBuffer?: boolean;
  onFirstFrame?: () => void;
}

export interface PlaneSceneHandle {
  start(): void;
  stop(): void;
  resize(width: number, height: number): void;
  dispose(): void;
  readonly running: boolean;
}

const DEG = Math.PI / 180;
/** Rest pose: nose turned a little towards the viewer and slightly up. */
const REST_YAW = -32 * DEG;
const REST_PITCH = 4 * DEG;
const REST_BANK = 0;
/** Idle motion: one full cycle of yaw, bank and bob takes about this long. */
const IDLE_PERIOD_MS = 8000;
const IDLE_YAW = 8 * DEG;
const IDLE_BANK = 3 * DEG;
const IDLE_BOB = 0.06;
/** Longest frame gap counted towards the idle clock, so a stall does not make the plane jump. */
const MAX_STEP_MS = 100;

function createContext(
  canvas: HTMLCanvasElement,
  preserveDrawingBuffer: boolean,
): WebGL2RenderingContext | null {
  try {
    return canvas.getContext("webgl2", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer,
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }
}

function disposeTree(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
  });
}

/**
 * Mounts the airliner scene on a canvas. Throws WebGLUnavailableError before allocating anything
 * when no WebGL2 context can be created. Nothing is drawn until start().
 */
export function mountPlaneScene(
  canvas: HTMLCanvasElement,
  options: PlaneSceneOptions = {},
): PlaneSceneHandle {
  const preserveDrawingBuffer = options.preserveDrawingBuffer ?? false;
  const context = createContext(canvas, preserveDrawingBuffer);
  if (!context) throw new WebGLUnavailableError();

  const isStatic = Boolean(options.still || options.reducedMotion);
  const renderer = new WebGLRenderer({
    canvas,
    context,
    alpha: true,
    antialias: true,
    preserveDrawingBuffer,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, options.maxDpr ?? 2));

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 3, 9.5);
  camera.lookAt(0, 0, 0);

  const ambient = new AmbientLight(SCENE_LIGHTS.ambient, 1.1);
  const key = new DirectionalLight(SCENE_LIGHTS.key, 2.4);
  key.position.set(4, 6, 5);
  const fill = new DirectionalLight(SCENE_LIGHTS.fill, 0.9);
  fill.position.set(-5, -1, 3);
  scene.add(ambient, key, fill);

  const plane = buildAirliner();
  plane.rotation.order = "YZX";
  scene.add(plane);

  let running = false;
  let disposed = false;
  let started = false;
  let firstFrameSent = false;
  let frameId = 0;
  let elapsed = 0;
  let lastTime: number | null = null;

  function pose(ms: number): void {
    const phase = (2 * Math.PI * ms) / IDLE_PERIOD_MS;
    plane.rotation.y = REST_YAW + IDLE_YAW * Math.sin(phase);
    // Bank follows the turn rate, so the plane leans into the yaw.
    plane.rotation.x = REST_BANK - IDLE_BANK * Math.cos(phase);
    plane.rotation.z = REST_PITCH;
    plane.position.y = IDLE_BOB * Math.sin(phase * 2);
  }

  function restPose(): void {
    plane.rotation.set(REST_BANK, REST_YAW, REST_PITCH);
    plane.position.y = 0;
  }

  function draw(): void {
    renderer.render(scene, camera);
    if (!firstFrameSent && !disposed) {
      firstFrameSent = true;
      options.onFirstFrame?.();
    }
  }

  function loop(now: number): void {
    if (!running || disposed) return;
    if (lastTime !== null) elapsed += Math.min(Math.max(now - lastTime, 0), MAX_STEP_MS);
    lastTime = now;
    pose(elapsed);
    draw();
    if (running && !disposed) frameId = window.requestAnimationFrame(loop);
  }

  function resize(width: number, height: number): void {
    if (disposed || width <= 0 || height <= 0) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // A resize clears the drawing buffer; a still scene has no loop to repaint it.
    if (isStatic && started) draw();
  }

  function stop(): void {
    if (!running) return;
    running = false;
    window.cancelAnimationFrame(frameId);
  }

  resize(canvas.clientWidth || canvas.width, canvas.clientHeight || canvas.height);

  return {
    start() {
      if (disposed) return;
      started = true;
      if (isStatic) {
        restPose();
        draw();
        return;
      }
      if (running) return;
      running = true;
      lastTime = null;
      frameId = window.requestAnimationFrame(loop);
    },
    stop,
    resize,
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      disposeTree(scene);
      renderer.dispose();
    },
    get running() {
      return running;
    },
  };
}
