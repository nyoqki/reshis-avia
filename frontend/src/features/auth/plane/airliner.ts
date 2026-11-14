import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  Vector2,
} from "three";

/** Colours of the airliner. The only raw colours allowed outside index.css live in this file. */
export interface Livery {
  body: string;
  belly: string;
  tail: string;
  accent: string;
  window: string;
  engine: string;
}

export const LIVERY: Livery = {
  body: "#f7f6f2",
  belly: "#181b1f",
  tail: "#fccf28",
  accent: "#202328",
  window: "#181b1f",
  engine: "#181b1f",
};

/** Light colours for the plane scene; scene.ts takes every colour from here. */
export const SCENE_LIGHTS: { key: string; fill: string; ambient: string } = {
  key: "#fff8ec",
  fill: "#dfe6f0",
  ambient: "#f7f6f2",
};

/** Half the fuselage length: the nose sits at +X, the tail cone at −X. */
const HALF_LENGTH = 2.5;
const RADIUS = 0.3;
const RADIAL_SEGMENTS = 24;

/**
 * Fuselage profile as (radius, position along the axis), tail to nose. LatheGeometry spins it around
 * Y; the geometry is then turned so that +Y becomes +X (the nose).
 */
const PROFILE: readonly (readonly [number, number])[] = [
  [0, -HALF_LENGTH],
  [0.06, -2.46],
  [0.14, -2.25],
  [0.22, -1.85],
  [0.28, -1.35],
  [RADIUS, -0.9],
  [RADIUS, 1.45],
  [0.285, 1.8],
  [0.25, 2.05],
  [0.19, 2.27],
  [0.11, 2.43],
  [0, HALF_LENGTH],
];

function material(color: string, roughness: number, metalness = 0.05): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

/** Radius of the fuselage profile at a position along the axis (linear between profile points). */
function radiusAt(y: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r1, y1] = PROFILE[i];
    const [r0, y0] = PROFILE[i - 1];
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

/**
 * A lathe shell over part of the fuselage, a hair outside it so it reads as paint. After the turn
 * to +X, phi = 0 faces +Z (right side), phi = π/2 faces down and phi = −π/2 faces up.
 */
function shell(
  from: number,
  to: number,
  phiStart: number,
  phiLength: number,
  lift: number,
): BufferGeometry {
  const steps = 8;
  const points: Vector2[] = [];
  for (let i = 0; i <= steps; i++) {
    const y = from + ((to - from) * i) / steps;
    points.push(new Vector2(radiusAt(y) + lift, y));
  }
  const geometry = new LatheGeometry(points, 12, phiStart, phiLength);
  geometry.rotateZ(-Math.PI / 2);
  return geometry;
}

function fuselageGeometry(): BufferGeometry {
  const points = PROFILE.map(([r, y]) => new Vector2(r, y));
  const geometry = new LatheGeometry(points, RADIAL_SEGMENTS);
  geometry.rotateZ(-Math.PI / 2);
  return geometry;
}

/**
 * A swept, thin lifting surface. The planform is given as (x, span) for the root leading edge, tip
 * leading edge, tip trailing edge and root trailing edge; side +1 builds it along +Z, −1 along −Z.
 */
function surfaceGeometry(
  planform: readonly (readonly [number, number])[],
  thickness: number,
  side: 1 | -1,
): BufferGeometry {
  const shape = new Shape(planform.map(([x, s]) => new Vector2(x, s * side)));
  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // Shape lies in XY and extrudes along Z; turn it so the span runs along Z and thickness along Y.
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

const WING: readonly (readonly [number, number])[] = [
  [0.6, 0.2],
  [-0.48, 2.3],
  [-0.78, 2.3],
  [-0.42, 0.2],
];

const STABILIZER: readonly (readonly [number, number])[] = [
  [-1.72, 0.08],
  [-2.28, 0.98],
  [-2.46, 0.98],
  [-2.3, 0.08],
];

const WING_DIHEDRAL = 0.08;
const ENGINE_SPAN = 0.82;

function wing(name: string, side: 1 | -1, livery: Livery): Mesh {
  const mesh = new Mesh(surfaceGeometry(WING, 0.06, side), material(livery.body, 0.45));
  mesh.name = name;
  mesh.position.set(0, -0.14, 0);
  // Dihedral: rotating about X by −side·θ raises the tip on either side.
  mesh.rotation.x = -side * WING_DIHEDRAL;

  const winglet = new Mesh(new BoxGeometry(0.2, 0.18, 0.02), material(livery.accent, 0.5));
  winglet.position.set(-0.7, 0.09, 2.29 * side);
  winglet.rotation.z = 0.5;
  mesh.add(winglet);
  return mesh;
}

function stabilizer(name: string, side: 1 | -1, livery: Livery): Mesh {
  const mesh = new Mesh(surfaceGeometry(STABILIZER, 0.04, side), material(livery.body, 0.45));
  mesh.name = name;
  mesh.position.set(0, 0.06, 0);
  mesh.rotation.x = -side * 0.06;
  return mesh;
}

function tailFin(livery: Livery): Mesh {
  const shape = new Shape([
    new Vector2(-1.5, 0.18),
    new Vector2(-2.2, 1.12),
    new Vector2(-2.52, 1.12),
    new Vector2(-2.42, 0.12),
  ]);
  const thickness = 0.05;
  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geometry.translate(0, 0, -thickness / 2);
  const mesh = new Mesh(geometry, material(livery.tail, 0.4));
  mesh.name = "tail-fin";
  return mesh;
}

function engine(name: string, side: 1 | -1, livery: Livery): Mesh {
  // CylinderGeometry runs along Y with radiusTop at +Y; turning it makes the top the intake (+X).
  const geometry = new CylinderGeometry(0.155, 0.11, 0.62, 18);
  geometry.rotateZ(-Math.PI / 2);
  const mesh = new Mesh(geometry, material(livery.engine, 0.5, 0.2));
  mesh.name = name;
  mesh.position.set(0.32, -0.36, ENGINE_SPAN * side);

  const pylon = new Mesh(new BoxGeometry(0.42, 0.16, 0.035), material(livery.body, 0.45));
  pylon.position.set(-0.08, 0.15, 0);
  mesh.add(pylon);
  return mesh;
}

/** Cabin windows: a thin dark strip on each side, a little above the fuselage centreline. */
function windowBand(livery: Livery): Group {
  const band = new Group();
  band.name = "window-band";
  const mat = material(livery.window, 0.3);
  const width = 0.09;
  const right = new Mesh(shell(-1.35, 1.6, -0.2 - width / 2, width, 0.004), mat);
  const left = new Mesh(shell(-1.35, 1.6, Math.PI + 0.2 - width / 2, width, 0.004), mat);
  band.add(right, left);
  return band;
}

/**
 * Builds the brand-livery airliner from primitives: nose along +X, up along +Y, right wing on +Z,
 * centred at the origin and five units long. MeshStandardMaterial only, no textures.
 */
export function buildAirliner(livery: Livery = LIVERY): Group {
  const plane = new Group();
  plane.name = "airliner";

  const fuselage = new Mesh(fuselageGeometry(), material(livery.body, 0.42));
  fuselage.name = "fuselage";

  // Dark belly over the lower part of the fuselage, centred on phi = π/2 (straight down).
  const belly = new Mesh(
    shell(-1.95, 2.2, Math.PI / 2 - 0.85, 1.7, 0.003),
    material(livery.belly, 0.55),
  );
  belly.name = "belly";
  fuselage.add(belly);

  // Cockpit windshield wrapping over the top of the nose, centred on phi = −π/2 (straight up).
  const windshield = new Mesh(
    shell(1.86, 1.99, -Math.PI / 2 - 0.8, 1.6, 0.004),
    material(livery.accent, 0.25),
  );
  windshield.name = "windshield";
  fuselage.add(windshield);

  plane.add(
    fuselage,
    wing("wing-left", -1, livery),
    wing("wing-right", 1, livery),
    tailFin(livery),
    stabilizer("stabilizer-left", -1, livery),
    stabilizer("stabilizer-right", 1, livery),
    engine("engine-left", -1, livery),
    engine("engine-right", 1, livery),
    windowBand(livery),
  );
  return plane;
}
