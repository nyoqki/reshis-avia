import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  ShapePath,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Colours of the airliner. The only raw colours allowed outside index.css live in this file. */
export interface Livery {
  /** Fuselage and the wing-to-body fairing. */
  body: string;
  /** Wings with their winglets, horizontal stabilizers and engine pylons. */
  wing: string;
  /** Vertical fin, in the sign yellow. */
  tail: string;
  /** The brand letter «Р» on both sides of the fin. */
  mark: string;
  /** Cabin and cockpit windows. */
  window: string;
  /** Engine cowlings: graphite, so they read on the light and the dark page. */
  nacelle: string;
  /** Intake lips. */
  lip: string;
  /** Fan faces, the inside of the intakes and the nozzle rings. */
  core: string;
  /** Spinners and exhaust cones. */
  exhaust: string;
}

export const LIVERY: Livery = {
  body: "#f3f2ee",
  wing: "#d9dad7",
  tail: "#fccf28",
  mark: "#181b1f",
  window: "#1d2127",
  nacelle: "#50555d",
  lip: "#d4d6d9",
  core: "#1d2024",
  exhaust: "#6f747b",
};

/** Light and shadow colours for the plane scene; scene.ts takes every colour from here. */
export interface SceneLights {
  /** Hemisphere fill from above and from below. */
  sky: string;
  ground: string;
  /** Warm key light from the front, above the camera. */
  key: string;
  /** Cool light from behind that edges the silhouette. */
  rim: string;
  /** The soft shadow on the invisible ground. */
  shadow: string;
}

export const SCENE_LIGHTS: SceneLights = {
  sky: "#fbfaf7",
  ground: "#c4c0b8",
  key: "#fffaf2",
  rim: "#e3ebf7",
  shadow: "#1b1d22",
};

const DEG = Math.PI / 180;

/** Distance decals (windows, tail paint, the fin letter) keep from the surface they sit on. */
const DECAL_LIFT = 0.0025;

function material(color: string, roughness: number, decal = false): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness,
    metalness: 0,
    // Decals also win the depth test by a polygon offset, so they never flicker against the skin.
    polygonOffset: decal,
    polygonOffsetFactor: decal ? -2 : 0,
    polygonOffsetUnits: decal ? -2 : 0,
  });
}

function named<T extends Mesh | Group>(object: T, name: string): T {
  object.name = name;
  return object;
}

// ---------------------------------------------------------------------------------------------
// Surfaces

interface SweepOptions {
  /** Joins the last column back to the first, for a closed ring. */
  closed?: boolean;
  /** Fans the first row to this point. */
  startPole?: Vector3;
  /** Fans the last row to this point. */
  endPole?: Vector3;
  /** Reverses the winding, for parts mirrored across the centre plane. */
  flip?: boolean;
}

/**
 * Indexed surface through rows of points, each row joined to the next quad by quad. When the rows
 * advance along +X (or outward along a span) and each row turns from +Z towards +Y (or runs from
 * the trailing edge over the top), the faces point outward.
 */
function sweep(rows: readonly Vector3[][], options: SweepOptions = {}): BufferGeometry {
  const { closed = false, startPole, endPole, flip = false } = options;
  const cols = rows[0].length;
  const span = closed ? cols : cols - 1;
  const positions: number[] = [];
  const index: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    if (flip) index.push(a, c, b);
    else index.push(a, b, c);
  };

  for (const row of rows) for (const p of row) positions.push(p.x, p.y, p.z);
  for (let r = 0; r + 1 < rows.length; r++) {
    for (let c = 0; c < span; c++) {
      const a = r * cols + c;
      const b = r * cols + ((c + 1) % cols);
      tri(a, a + cols, b);
      tri(b, a + cols, b + cols);
    }
  }
  if (startPole) {
    const pole = positions.length / 3;
    positions.push(startPole.x, startPole.y, startPole.z);
    for (let c = 0; c < span; c++) tri(pole, c, (c + 1) % cols);
  }
  if (endPole) {
    const pole = positions.length / 3;
    const base = (rows.length - 1) * cols;
    positions.push(endPole.x, endPole.y, endPole.z);
    for (let c = 0; c < span; c++) tri(base + c, pole, base + ((c + 1) % cols));
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A surface of revolution around the X axis through (x, radius) points, in profile order. */
function revolve(profile: readonly (readonly [number, number])[], segments = 40): BufferGeometry {
  const rows = profile.map(([x, r]) => {
    const row: Vector3[] = [];
    for (let k = 0; k < segments; k++) {
      const phi = (2 * Math.PI * k) / segments;
      row.push(new Vector3(x, r * Math.sin(phi), r * Math.cos(phi)));
    }
    return row;
  });
  return sweep(rows, { closed: true });
}

// ---------------------------------------------------------------------------------------------
// Fuselage: nose at +X, tail cone at −X, five units long, up along +Y.

const RADIUS = 0.28;
const NOSE_TIP = 2.5;
const NOSE_LENGTH = 0.85;
const NOSE_START = NOSE_TIP - NOSE_LENGTH;
const TAIL_TIP = -2.5;
const TAIL_START = -0.9;
const TAIL_TIP_RADIUS = 0.035;
/** The nose tip sits below the axis and the tail cone sweeps up to keep a nearly level top line. */
const NOSE_DROOP = 0.28;
const TAIL_UPSWEEP = 0.86;
const FUSELAGE_SEGMENTS = 64;

/** Radius of the fuselage cross-section at x. */
function fuselageRadius(x: number): number {
  if (x >= NOSE_START) {
    const t = Math.min(1, (x - NOSE_START) / NOSE_LENGTH);
    return RADIUS * Math.sqrt(1 - t * t);
  }
  if (x <= TAIL_START) {
    const t = Math.min(1, (TAIL_START - x) / (TAIL_START - TAIL_TIP));
    return RADIUS - (RADIUS - TAIL_TIP_RADIUS) * t ** 1.8;
  }
  return RADIUS;
}

/** Height of the cross-section centre at x. */
function fuselageCentre(x: number): number {
  if (x >= NOSE_START) {
    const t = Math.min(1, (x - NOSE_START) / NOSE_LENGTH);
    return -NOSE_DROOP * RADIUS * t * t;
  }
  if (x <= TAIL_START) return TAIL_UPSWEEP * (RADIUS - fuselageRadius(x));
  return 0;
}

/**
 * A point on the fuselage skin. phi turns around the axis: 0 faces +Z (the right side), π/2 up,
 * π the left side. lift moves the point off the skin along its outward normal.
 */
function skinPoint(x: number, phi: number, lift = 0): Vector3 {
  const r = fuselageRadius(x);
  const point = new Vector3(x, fuselageCentre(x) + r * Math.sin(phi), r * Math.cos(phi));
  if (lift === 0) return point;
  const h = 1e-3;
  const dr = (fuselageRadius(x + h) - fuselageRadius(x - h)) / (2 * h);
  const dc = (fuselageCentre(x + h) - fuselageCentre(x - h)) / (2 * h);
  const normal = new Vector3(-(dc * Math.sin(phi) + dr), Math.sin(phi), Math.cos(phi));
  return point.addScaledVector(normal.normalize(), lift);
}

function fuselageStations(): number[] {
  const xs: number[] = [];
  const tailRows = 28;
  for (let i = 0; i <= tailRows; i++) xs.push(TAIL_TIP + ((TAIL_START - TAIL_TIP) * i) / tailRows);
  const midRows = 4;
  for (let i = 1; i < midRows; i++) xs.push(TAIL_START + ((NOSE_START - TAIL_START) * i) / midRows);
  // Sine spacing packs the rows towards the round nose tip.
  const noseRows = 32;
  for (let i = 0; i < noseRows; i++) {
    xs.push(NOSE_START + NOSE_LENGTH * Math.sin((Math.PI * i) / (2 * noseRows)));
  }
  return xs;
}

function fuselageGeometry(): BufferGeometry {
  const rows = fuselageStations().map((x) => {
    const row: Vector3[] = [];
    for (let k = 0; k < FUSELAGE_SEGMENTS; k++) {
      row.push(skinPoint(x, (2 * Math.PI * k) / FUSELAGE_SEGMENTS));
    }
    return row;
  });
  return sweep(rows, {
    closed: true,
    startPole: new Vector3(TAIL_TIP, fuselageCentre(TAIL_TIP), 0),
    endPole: new Vector3(NOSE_TIP, fuselageCentre(NOSE_TIP), 0),
  });
}

/** The tail paint ends at a line that continues the fin's leading edge down the fuselage. */
const TAIL_PAINT_TOP_X = -1.42;
const TAIL_PAINT_SLANT = 0.34;

/** Sign-yellow paint over the tail cone, so the fin and the rear fuselage read as one shape. */
function tailPaint(livery: Livery): Mesh {
  const rowCount = 24;
  const start = TAIL_TIP + 0.02;
  const rows: Vector3[][] = [];
  for (let i = 0; i <= rowCount; i++) {
    const row: Vector3[] = [];
    for (let k = 0; k < FUSELAGE_SEGMENTS; k++) {
      const phi = (2 * Math.PI * k) / FUSELAGE_SEGMENTS;
      const end = TAIL_PAINT_TOP_X + ((1 - Math.sin(phi)) / 2) * TAIL_PAINT_SLANT;
      row.push(skinPoint(start + ((end - start) * i) / rowCount, phi, DECAL_LIFT));
    }
    rows.push(row);
  }
  return named(
    new Mesh(sweep(rows, { closed: true }), material(livery.tail, 0.42, true)),
    "tail-paint",
  );
}

/** Wing-to-body fairing: a flattened ellipsoid under the wing root. */
function bellyFairing(livery: Livery): Mesh {
  const geometry = new SphereGeometry(1, 40, 20);
  geometry.scale(0.8, 0.12, 0.26);
  geometry.translate(0.16, -0.2, 0);
  return named(new Mesh(geometry, material(livery.body, 0.4)), "belly-fairing");
}

const WINDOW_PHI = 16 * DEG;
const WINDOW_WIDTH = 0.036;
const WINDOW_HEIGHT = 0.05;
const WINDOW_PITCH = 0.078;
const WINDOW_FIRST_X = 1.4;
/** Cabin windows per side, from behind the cockpit to the start of the tail cone. */
export const WINDOWS_PER_SIDE = 29;

/** One cabin window: a rounded rectangle bent onto the skin of the constant section, right side. */
function windowGeometry(): BufferGeometry {
  const w = WINDOW_WIDTH / 2;
  const h = WINDOW_HEIGHT / 2;
  const c = WINDOW_WIDTH * 0.4;
  const shape = new Shape();
  shape.moveTo(-w + c, -h);
  shape.lineTo(w - c, -h);
  shape.quadraticCurveTo(w, -h, w, -h + c);
  shape.lineTo(w, h - c);
  shape.quadraticCurveTo(w, h, w - c, h);
  shape.lineTo(-w + c, h);
  shape.quadraticCurveTo(-w, h, -w, h - c);
  shape.lineTo(-w, -h + c);
  shape.quadraticCurveTo(-w, -h, -w + c, -h);
  const geometry = new ShapeGeometry(shape, 3);
  const position = geometry.getAttribute("position");
  const radius = RADIUS + DECAL_LIFT;
  for (let i = 0; i < position.count; i++) {
    const phi = WINDOW_PHI + position.getY(i) / radius;
    position.setXYZ(i, position.getX(i), radius * Math.sin(phi), radius * Math.cos(phi));
  }
  geometry.deleteAttribute("uv");
  geometry.computeVertexNormals();
  return geometry;
}

/** The row of cabin windows on both sides, one instanced mesh. */
function cabinWindows(livery: Livery): InstancedMesh {
  const mesh = new InstancedMesh(
    windowGeometry(),
    material(livery.window, 0.25, true),
    2 * WINDOWS_PER_SIDE,
  );
  const matrix = new Matrix4();
  // Turning by 2·phi − π about X carries the right-side window line onto the left side.
  const toLeft = new Matrix4().makeRotationX(2 * WINDOW_PHI - Math.PI);
  for (let i = 0; i < WINDOWS_PER_SIDE; i++) {
    const x = WINDOW_FIRST_X - i * WINDOW_PITCH;
    mesh.setMatrixAt(2 * i, matrix.makeTranslation(x, 0, 0));
    mesh.setMatrixAt(2 * i + 1, matrix.copy(toLeft).setPosition(x, 0, 0));
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  return named(mesh, "cabin-windows");
}

/**
 * Cockpit panes in side view, as (x, height) corners on the right side of the nose: front-bottom,
 * front-top, back-top, back-bottom. Windshield first; the left side mirrors them.
 */
const COCKPIT_PANES: readonly (readonly (readonly [number, number])[])[] = [
  [
    [2.215, 0.088],
    [2.2, 0.15],
    [2.135, 0.17],
    [2.13, 0.088],
  ],
  [
    [2.121, 0.088],
    [2.121, 0.172],
    [2.056, 0.186],
    [2.052, 0.088],
  ],
  [
    [2.044, 0.088],
    [2.044, 0.187],
    [1.99, 0.196],
    [1.985, 0.09],
  ],
];

/** Angle around the axis of the skin point at height y on the right side of station x. */
function skinAngle(x: number, y: number): number {
  const sine = (y - fuselageCentre(x)) / fuselageRadius(x);
  return Math.asin(Math.min(1, Math.max(-1, sine)));
}

function panePatch(corners: readonly (readonly [number, number])[], side: 1 | -1): BufferGeometry {
  const [frontBottom, frontTop, backTop, backBottom] = corners;
  const lerp = (a: readonly [number, number], b: readonly [number, number], t: number) =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
  const steps = 4;
  const rows: Vector3[][] = [];
  for (let i = 0; i <= steps; i++) {
    const bottom = lerp(backBottom, frontBottom, i / steps);
    const top = lerp(backTop, frontTop, i / steps);
    const row: Vector3[] = [];
    for (let j = 0; j <= steps; j++) {
      const [x, y] = lerp(bottom, top, j / steps);
      const phi = skinAngle(x, y);
      row.push(skinPoint(x, side === 1 ? phi : Math.PI - phi, DECAL_LIFT));
    }
    rows.push(row);
  }
  return sweep(rows, { flip: side === -1 });
}

function cockpitWindows(livery: Livery): Mesh {
  const panes = COCKPIT_PANES.flatMap((corners) => [panePatch(corners, 1), panePatch(corners, -1)]);
  const geometry = mergeGeometries(panes);
  for (const pane of panes) pane.dispose();
  return named(new Mesh(geometry, material(livery.window, 0.2, true)), "cockpit-windows");
}

// ---------------------------------------------------------------------------------------------
// Lifting surfaces

interface Station {
  /** Leading edge, right side. */
  le: Vector3;
  chord: number;
  /** Largest half-thickness. */
  thick: number;
  /** Angle of the span direction from +Z towards +Y: about 0 for a wing, π/2 for a fin. */
  cant: number;
}

/** Points per airfoil side; cosine spacing packs them towards the rounded leading edge. */
const AIRFOIL_STEPS = 14;

/** NACA four-digit thickness, scaled to 1 at its thickest point (30 % of the chord). */
function nacaThickness(s: number): number {
  return (
    (0.2969 * Math.sqrt(s) - 0.126 * s - 0.3516 * s ** 2 + 0.2843 * s ** 3 - 0.1036 * s ** 4) / 0.1
  );
}

/** Flat-sided section with a round nose and a short taper: the fin carries the letter on it. */
function plateThickness(s: number): number {
  if (s < 0.12) return Math.sqrt(1 - (1 - s / 0.12) ** 2);
  if (s < 0.8) return 1;
  const u = (1 - s) / 0.2;
  return u * (2 - u);
}

/**
 * Lofts airfoil sections through the stations, outward from the root. Each section runs from the
 * trailing edge over the upper side to the leading edge and back under it; the last one is capped.
 * side −1 mirrors the surface to the left of the centre plane.
 */
function loft(
  stations: readonly Station[],
  profile: (s: number) => number,
  side: 1 | -1,
): BufferGeometry {
  const rows = stations.map((station) => {
    const upY = Math.cos(station.cant);
    const upZ = -Math.sin(station.cant);
    const row: Vector3[] = [];
    for (let k = 0; k <= 2 * AIRFOIL_STEPS; k++) {
      const upper = k <= AIRFOIL_STEPS;
      const i = upper ? AIRFOIL_STEPS - k : k - AIRFOIL_STEPS;
      const s = (1 - Math.cos((Math.PI * i) / AIRFOIL_STEPS)) / 2;
      const h = station.thick * profile(s) * (upper ? 1 : -1);
      row.push(
        new Vector3(
          station.le.x - s * station.chord,
          station.le.y + upY * h,
          (station.le.z + upZ * h) * side,
        ),
      );
    }
    return row;
  });

  const last = stations[stations.length - 1];
  const tipRow = rows[rows.length - 1];
  const pole = tipRow.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(tipRow.length);
  pole.add(
    new Vector3(0, Math.sin(last.cant), Math.cos(last.cant) * side).multiplyScalar(
      last.thick * 0.4,
    ),
  );
  return sweep(rows, { endPole: pole, flip: side === -1 });
}

const WING_ROOT_Z = 0.08;
const WING_KINK_Z = 0.82;
const WING_TIP_Z = 2.25;
const WING_ROOT_LE_X = 0.64;
const WING_ROOT_Y = -0.15;
const WING_SWEEP = 27 * DEG;
const WING_DIHEDRAL = 6 * DEG;

/** Leading edge of the right wing at span z: one straight swept line from root to tip. */
function wingLeadingEdge(z: number): Vector3 {
  const out = z - WING_ROOT_Z;
  return new Vector3(
    WING_ROOT_LE_X - out * Math.tan(WING_SWEEP),
    WING_ROOT_Y + out * Math.tan(WING_DIHEDRAL),
    z,
  );
}

/**
 * Right wing: root inside the fuselage, a kink in the trailing edge at the engine, the tip, then a
 * winglet that curves up out of the tip and sweeps back.
 */
function wingStations(): Station[] {
  const tip = wingLeadingEdge(WING_TIP_Z);
  const stations: Station[] = [
    { le: wingLeadingEdge(WING_ROOT_Z), chord: 0.98, thick: 0.069, cant: WING_DIHEDRAL },
    { le: wingLeadingEdge(WING_KINK_Z), chord: 0.6, thick: 0.036, cant: WING_DIHEDRAL },
    { le: tip, chord: 0.21, thick: 0.0105, cant: WING_DIHEDRAL },
  ];

  const bend = 0.07;
  const cantTop = 80 * DEG;
  const straight = 0.24;
  const centre = tip
    .clone()
    .add(new Vector3(0, Math.cos(WING_DIHEDRAL), -Math.sin(WING_DIHEDRAL)).multiplyScalar(bend));
  const length = bend * (cantTop - WING_DIHEDRAL) + straight;
  const at = (travelled: number, position: Vector3, cant: number): Station => {
    const f = travelled / length;
    const chord = 0.21 + (0.085 - 0.21) * f;
    return {
      le: new Vector3(tip.x - 0.17 * f, position.y, position.z),
      chord,
      thick: chord * 0.045,
      cant,
    };
  };
  const steps = 3;
  for (let i = 1; i <= steps; i++) {
    const cant = WING_DIHEDRAL + ((cantTop - WING_DIHEDRAL) * i) / steps;
    const p = centre
      .clone()
      .sub(new Vector3(0, Math.cos(cant), -Math.sin(cant)).multiplyScalar(bend));
    stations.push(at(bend * (cant - WING_DIHEDRAL), p, cant));
  }
  const top = stations[stations.length - 1].le
    .clone()
    .add(new Vector3(0, Math.sin(cantTop), Math.cos(cantTop)).multiplyScalar(straight));
  stations.push(at(length, top, cantTop));
  return stations;
}

function wing(name: string, side: 1 | -1, livery: Livery): Mesh {
  return named(
    new Mesh(loft(wingStations(), nacaThickness, side), material(livery.wing, 0.45)),
    name,
  );
}

const STABILIZER_SWEEP = 33 * DEG;
const STABILIZER_DIHEDRAL = 5 * DEG;

function stabilizer(name: string, side: 1 | -1, livery: Livery): Mesh {
  const root = new Vector3(-1.6, 0.07, 0.04);
  const out = 0.82;
  const tip = new Vector3(
    root.x - out * Math.tan(STABILIZER_SWEEP),
    root.y + out * Math.tan(STABILIZER_DIHEDRAL),
    root.z + out,
  );
  const stations: Station[] = [
    { le: root, chord: 0.54, thick: 0.027, cant: STABILIZER_DIHEDRAL },
    { le: tip, chord: 0.2, thick: 0.009, cant: STABILIZER_DIHEDRAL },
  ];
  return named(new Mesh(loft(stations, nacaThickness, side), material(livery.wing, 0.45)), name);
}

const FIN_HALF_THICKNESS = 0.024;
/** Root buried in the tail cone (with a dorsal fillet), the base just above the skin, the tip. */
const FIN_STATIONS: readonly Station[] = [
  { le: new Vector3(-1.3, 0.19, 0), chord: 1.1, thick: FIN_HALF_THICKNESS, cant: Math.PI / 2 },
  { le: new Vector3(-1.6, 0.34, 0), chord: 0.82, thick: FIN_HALF_THICKNESS, cant: Math.PI / 2 },
  { le: new Vector3(-2.2, 1.12, 0), chord: 0.3, thick: FIN_HALF_THICKNESS, cant: Math.PI / 2 },
];

/** Half-thickness of the fin at (x, y), from the station it lies between. */
function finHalfThickness(x: number, y: number): number {
  for (let i = 1; i < FIN_STATIONS.length; i++) {
    const a = FIN_STATIONS[i - 1];
    const b = FIN_STATIONS[i];
    if (y > b.le.y && i < FIN_STATIONS.length - 1) continue;
    const t = (y - a.le.y) / (b.le.y - a.le.y);
    const le = a.le.x + (b.le.x - a.le.x) * t;
    const chord = a.chord + (b.chord - a.chord) * t;
    const s = Math.min(1, Math.max(0, (le - x) / chord));
    return FIN_HALF_THICKNESS * plateThickness(s);
  }
  return 0;
}

/** The letter «Р» from the logo tile (components/brand/logo.svg), in SVG units with y down. */
const MARK_PATH =
  "M6.93 26v-20h8.13q2.82 0 4.62.82 1.8.82 2.66 2.33.87 1.52.87 3.68 0 2.1-.87 3.65-.86 1.54-2.66 2.36-1.8.82-4.62.82h-2.99v6.34zm5.14-10.58h2.43q1.97 0 2.77-.65.8-.65.8-1.94 0-1.29-.8-1.94-.8-.65-2.77-.65h-2.43z";
/** Height of the letter on the fin and the point its centre sits at. */
const MARK_HEIGHT = 0.3;
const MARK_CENTRE = new Vector3(-2.15, 0.72, 0);

/** Parses the SVG path commands the letter uses (M, L, H, V, Q, Z, absolute or relative). */
function pathShapes(d: string): Shape[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g) ?? [];
  const path = new ShapePath();
  let i = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) command = tokens[i++];
    const relative = command === command.toLowerCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    switch (command.toLowerCase()) {
      case "m":
        x = ox + next();
        y = oy + next();
        startX = x;
        startY = y;
        path.moveTo(x, y);
        // Further coordinate pairs after a move are line segments.
        command = relative ? "l" : "L";
        break;
      case "l":
        x = ox + next();
        y = oy + next();
        path.lineTo(x, y);
        break;
      case "h":
        x = ox + next();
        path.lineTo(x, y);
        break;
      case "v":
        y = oy + next();
        path.lineTo(x, y);
        break;
      case "q": {
        const cx = ox + next();
        const cy = oy + next();
        x = ox + next();
        y = oy + next();
        path.quadraticCurveTo(cx, cy, x, y);
        break;
      }
      case "z":
        x = startX;
        y = startY;
        break;
      default:
        throw new Error(`Unsupported path command: ${command}`);
    }
  }
  return path.toShapes();
}

/** The letter flat on both sides of the fin, upright and readable from either side. */
function tailMark(livery: Livery): Mesh {
  const flat = new ShapeGeometry(pathShapes(MARK_PATH), 6);
  flat.computeBoundingBox();
  const box = flat.boundingBox;
  const cx = box ? (box.min.x + box.max.x) / 2 : 0;
  const cy = box ? (box.min.y + box.max.y) / 2 : 0;
  const scale = box ? MARK_HEIGHT / (box.max.y - box.min.y) : 1;
  const source = flat.getAttribute("position");
  const sourceIndex = flat.getIndex();

  const positions: number[] = [];
  const normals: number[] = [];
  const index: number[] = [];
  for (const side of [1, -1] as const) {
    const base = positions.length / 3;
    for (let i = 0; i < source.count; i++) {
      // SVG y runs down; on the left side x runs the other way so the letter is not mirrored.
      const x = MARK_CENTRE.x + side * (source.getX(i) - cx) * scale;
      const y = MARK_CENTRE.y - (source.getY(i) - cy) * scale;
      positions.push(x, y, side * (finHalfThickness(x, y) + DECAL_LIFT));
      normals.push(0, 0, side);
    }
    // Both mappings reverse the shape's winding relative to the side they face, so flip it back.
    const count = sourceIndex ? sourceIndex.count : source.count;
    for (let i = 0; i < count; i += 3) {
      const a = sourceIndex ? sourceIndex.getX(i) : i;
      const b = sourceIndex ? sourceIndex.getX(i + 1) : i + 1;
      const c = sourceIndex ? sourceIndex.getX(i + 2) : i + 2;
      index.push(base + a, base + c, base + b);
    }
  }
  flat.dispose();

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return named(new Mesh(geometry, material(livery.mark, 0.4, true)), "tail-mark");
}

function tailFin(livery: Livery): Mesh {
  const fin = named(
    new Mesh(loft(FIN_STATIONS, plateThickness, 1), material(livery.tail, 0.42)),
    "tail-fin",
  );
  fin.add(tailMark(livery));
  return fin;
}

// ---------------------------------------------------------------------------------------------
// Engines

/** Engines hang at about 35 % of the semi-span, intakes well ahead of the leading edge. */
export const ENGINE_SPAN = WING_KINK_Z;
const NACELLE_LENGTH = 0.502;
const NACELLE_RADIUS = 0.158;
/** How far the intake sits ahead of the leading edge. */
const ENGINE_LEAD = 0.36;
/** Depth of the wing's lower surface under its chord line near the leading edge, at the engine. */
const WING_UNDERSIDE = 0.033;
/** Height of the pylon showing between the wing and the top of the nacelle. */
const PYLON_GAP = 0.045;
const ENGINE_FRONT_X = wingLeadingEdge(ENGINE_SPAN).x + ENGINE_LEAD;
const ENGINE_Y = wingLeadingEdge(ENGINE_SPAN).y - WING_UNDERSIDE - PYLON_GAP - NACELLE_RADIUS;

/** Nacelle profiles as (x from the nozzle exit, radius), each in the order its faces need. */
const COWL: readonly (readonly [number, number])[] = [
  [0, 0.112],
  [0.08, 0.13],
  [0.2, 0.15],
  [0.33, NACELLE_RADIUS],
  [0.42, 0.156],
  [0.455, 0.151],
];
const LIP: readonly (readonly [number, number])[] = [
  [0.455, 0.151],
  [0.48, 0.146],
  [0.495, 0.138],
  [0.502, 0.127],
  [0.497, 0.117],
  [0.48, 0.112],
  [0.455, 0.11],
];
/** Runs backwards into the intake, so its faces point inward. */
const DUCT: readonly (readonly [number, number])[] = [
  [0.455, 0.11],
  [0.42, 0.108],
  [0.4, 0.107],
];
const SPINNER: readonly (readonly [number, number])[] = [
  [0.4, 0.042],
  [0.425, 0.034],
  [0.445, 0.016],
  [0.452, 0],
];
const PLUG: readonly (readonly [number, number])[] = [
  [-0.12, 0],
  [-0.06, 0.045],
  [0, 0.074],
];

function disc(radius: number, x: number, facing: 1 | -1, inner = 0): BufferGeometry {
  const rows: Vector3[][] = [];
  const segments = 40;
  for (const r of [radius, inner]) {
    const row: Vector3[] = [];
    for (let k = 0; k < segments; k++) {
      const phi = (2 * Math.PI * k) / segments;
      row.push(new Vector3(x, r * Math.sin(phi), r * Math.cos(phi)));
    }
    rows.push(row);
  }
  return sweep(rows, { closed: true, flip: facing === -1 });
}

function engine(name: string, side: 1 | -1, livery: Livery): Group {
  const group = named(new Group(), name);
  group.position.set(ENGINE_FRONT_X - NACELLE_LENGTH, ENGINE_Y, ENGINE_SPAN * side);

  const core = material(livery.core, 0.6);
  group.add(
    named(new Mesh(revolve(COWL), material(livery.nacelle, 0.42)), `${name}-cowl`),
    named(new Mesh(revolve(LIP), material(livery.lip, 0.3)), `${name}-intake`),
    new Mesh(revolve(DUCT), core),
    // Fan face at the back of the intake; further down, the nozzle ring around the exhaust cone.
    new Mesh(disc(0.107, 0.4, 1), core),
    new Mesh(revolve(SPINNER), material(livery.exhaust, 0.35)),
    new Mesh(disc(0.112, 0, -1, 0.07), core),
    new Mesh(revolve(PLUG), material(livery.exhaust, 0.45)),
  );

  // Pylon: a short strut from inside the nacelle up into the wing, its leading edge raked back.
  const wingLe = wingLeadingEdge(ENGINE_SPAN);
  const local = (x: number, y: number) => new Vector3(x - group.position.x, y - ENGINE_Y, 0);
  const strut = (le: Vector3, chord: number): Station => ({
    le,
    chord,
    thick: 0.02,
    cant: Math.PI / 2,
  });
  const pylon = loft(
    [
      strut(local(ENGINE_FRONT_X - 0.08, ENGINE_Y + 0.12), 0.36),
      strut(local(wingLe.x - 0.03, wingLe.y), 0.3),
    ],
    nacaThickness,
    1,
  );
  group.add(named(new Mesh(pylon, material(livery.wing, 0.45)), `${name}-pylon`));
  return group;
}

/**
 * Builds the brand-livery airliner from procedural geometry: nose along +X, up along +Y, right
 * wing on +Z, centred near the origin and five units long. MeshStandardMaterial only, no textures.
 */
export function buildAirliner(livery: Livery = LIVERY): Group {
  const plane = named(new Group(), "airliner");
  const fuselage = named(new Mesh(fuselageGeometry(), material(livery.body, 0.38)), "fuselage");
  fuselage.add(cockpitWindows(livery), tailPaint(livery));

  plane.add(
    fuselage,
    bellyFairing(livery),
    cabinWindows(livery),
    wing("wing-left", -1, livery),
    wing("wing-right", 1, livery),
    tailFin(livery),
    stabilizer("stabilizer-left", -1, livery),
    stabilizer("stabilizer-right", 1, livery),
    engine("engine-left", -1, livery),
    engine("engine-right", 1, livery),
  );
  return plane;
}
