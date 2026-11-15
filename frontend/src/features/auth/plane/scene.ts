import {
  BufferGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  type Group,
  HemisphereLight,
  type InstancedMesh,
  type Material,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
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

/** Width to height of the hero box (PlaneHero) and of the still image rendered from this scene. */
export const PLANE_ASPECT = 16 / 7;

/**
 * Rest pose: nose towards the viewer on the right, climbing a little, rolled a touch towards the
 * viewer. Seen from slightly below (the camera), both engines show under the wings.
 */
const REST_YAW = -37 * DEG;
const REST_PITCH = 4 * DEG;
const REST_BANK = 2 * DEG;
/** Idle motion: one cycle of yaw, bank and bob takes about this long. */
const IDLE_PERIOD_MS = 9000;
const IDLE_YAW = 5 * DEG;
const IDLE_BANK = 3 * DEG;
const IDLE_PITCH = 1 * DEG;
const IDLE_BOB = 0.05;
/** The idle motion eases in over this long, so the first frame is the rest pose of the still. */
const IDLE_RAMP_MS = 1600;
/** Longest frame gap counted towards the idle clock, so a stall does not make the plane jump. */
const MAX_STEP_MS = 100;

/** A long lens a little below the plane: little perspective distortion, like a product shot. */
const CAMERA_FOV = 13.6;
const CAMERA_POSITION = new Vector3(0, -0.85, 10.5);
const CAMERA_TARGET = new Vector3(-0.05, -0.12, 0);

/**
 * The soft shadow below the plane. Its ground tilts towards the camera so the shadow reads as a
 * soft ellipse rather than a line from this low viewpoint.
 */
const SHADOW_Y = -1.0;
const SHADOW_TILT = 12 * DEG;
const SHADOW_OPACITY = 0.22;
const SHADOW_SIZE = { x: 2.1, z: 0.85 };

export interface PlaneStage {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly plane: Group;
  /** Poses the plane (and its shadow) for an idle clock in milliseconds; 0 is the rest pose. */
  pose(ms: number): void;
  setAspect(aspect: number): void;
}

/**
 * A disc whose alpha falls smoothly from the centre to nothing at the rim, facing up: a soft
 * shadow with no texture.
 */
function shadowGeometry(): BufferGeometry {
  const rings = 14;
  const segments = 48;
  const positions = [0, 0, 0];
  const colors = [1, 1, 1, 1];
  for (let ring = 1; ring <= rings; ring++) {
    const r = ring / rings;
    const alpha = (1 - r * r) ** 2;
    for (let k = 0; k < segments; k++) {
      const angle = (2 * Math.PI * k) / segments;
      positions.push(r * Math.cos(angle), 0, r * Math.sin(angle));
      colors.push(1, 1, 1, alpha);
    }
  }
  const index: number[] = [];
  for (let k = 0; k < segments; k++) index.push(0, 1 + ((k + 1) % segments), 1 + k);
  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * segments;
    const outer = inner + segments;
    for (let k = 0; k < segments; k++) {
      const next = (k + 1) % segments;
      index.push(inner + k, inner + next, outer + k);
      index.push(inner + next, outer + next, outer + k);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 4));
  geometry.setIndex(index);
  return geometry;
}

/** Scene, camera, plane, lights and shadow, with no renderer: the part tests can inspect. */
export function createPlaneStage(): PlaneStage {
  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, PLANE_ASPECT, 1, 40);
  camera.position.copy(CAMERA_POSITION);
  camera.lookAt(CAMERA_TARGET);

  const sky = new HemisphereLight(SCENE_LIGHTS.sky, SCENE_LIGHTS.ground, 1.5);
  const key = new DirectionalLight(SCENE_LIGHTS.key, 2.2);
  key.position.set(3, 6, 7);
  const rim = new DirectionalLight(SCENE_LIGHTS.rim, 1.1);
  rim.position.set(-6, 3, -4);
  scene.add(sky, key, rim);

  const plane = buildAirliner();
  plane.rotation.order = "YZX";
  scene.add(plane);

  const shadowMaterial = new MeshBasicMaterial({
    color: SCENE_LIGHTS.shadow,
    vertexColors: true,
    transparent: true,
    opacity: SHADOW_OPACITY,
    depthWrite: false,
  });
  const shadow = new Mesh(shadowGeometry(), shadowMaterial);
  shadow.name = "ground-shadow";
  shadow.position.y = SHADOW_Y;
  shadow.rotation.x = SHADOW_TILT;
  shadow.scale.set(SHADOW_SIZE.x, 1, SHADOW_SIZE.z);
  scene.add(shadow);

  function pose(ms: number): void {
    const ramp = Math.min(1, Math.max(0, ms / IDLE_RAMP_MS));
    const ease = ramp * ramp * (3 - 2 * ramp);
    const phase = (2 * Math.PI * ms) / IDLE_PERIOD_MS;
    const bob = ease * IDLE_BOB * Math.sin(phase * 2);
    plane.rotation.y = REST_YAW + ease * IDLE_YAW * Math.sin(phase);
    // Bank follows the turn rate, so the plane leans into the yaw.
    plane.rotation.x = REST_BANK + ease * IDLE_BANK * Math.cos(phase);
    plane.rotation.z = REST_PITCH + ease * IDLE_PITCH * Math.sin(phase * 2);
    plane.position.y = bob;
    // Higher up, the shadow grows softer and fainter.
    shadow.rotation.y = plane.rotation.y - REST_YAW;
    shadow.scale.set(SHADOW_SIZE.x * (1 + bob), 1, SHADOW_SIZE.z * (1 + bob));
    shadowMaterial.opacity = SHADOW_OPACITY * (1 - 3 * bob);
  }

  function setAspect(aspect: number): void {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  }

  pose(0);
  return { scene, camera, plane, pose, setAspect };
}

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
    // Instanced meshes also hold their per-instance matrices on the GPU.
    if ((object as InstancedMesh).isInstancedMesh) (object as InstancedMesh).dispose();
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
  // Neutral tone mapping keeps the livery colours true while rolling off the brightest highlights.
  renderer.toneMapping = NeutralToneMapping;

  const { scene, camera, pose, setAspect } = createPlaneStage();

  let running = false;
  let disposed = false;
  let started = false;
  let firstFrameSent = false;
  let frameId = 0;
  let elapsed = 0;
  let lastTime: number | null = null;

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
    setAspect(width / height);
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
        pose(0);
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
