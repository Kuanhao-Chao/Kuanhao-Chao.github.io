/**
 * The WebGL controller for the chromatin compaction playground at `/chromatin/`.
 *
 * Three.js appears here and nowhere else. Every dimension, every parametric path and every
 * scrubber decision comes from `src/lib/chromatinModel.ts`, which has no renderer in it and is
 * unit-tested against the structural literature — the same split that keeps `deepDiveMath.ts`
 * behind the deep-dive widgets, so a slider cannot contradict the science beside it.
 *
 * The organising idea is that **the hierarchy is drawn at true nanometre scale, all of it at
 * the origin, and the camera pulls back logarithmically**. Nothing is swapped for a stand-in at
 * a larger size: a nucleosome really is 11 nm inside a 260 nm string inside a 620 nm fibre
 * inside a 2.4 µm loop domain, so zooming out reveals each in turn because it is genuinely
 * nested. That is what makes the transitions seamless without any scene-swapping machinery —
 * there is no scene to swap.
 */

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';

import {
  CHR1_BP,
  CHR1_CENTROMERE_BP,
  CHR1_METAPHASE_NM,
  CHROMATID_DIAMETER_NM,
  DNA_DIAMETER_NM,
  FIBRE_30NM_DIAMETER_NM,
  NUCLEOSOME_CORE_BP,
  OCTAMER_RADIUS_NM,
  PROMETA_OUTER_LOOP_BP,
  REGIMES,
  SUPERHELIX_RADIUS_NM,
  bDnaBasePairs,
  bDnaStrand,
  beadsOnAString,
  bpInViewAt,
  cameraFieldNm,
  compactionAt,
  contourLengthNm,
  coreParticleEnvelope,
  disorderedChain,
  duplexStrandsAlong,
  centromereConstriction,
  extrudedLoop,
  helicalRisePerTurnNm,
  histoneLayout,
  impliedNucleosomeCount,
  loopReachNm,
  nucleosomeBudget,
  regimeAt,
  regimeWeights,
  smoothstep,
  solenoidFibre,
  wrappingPath,
  zigzagFibre,
  type RegimeId,
  type Vec3,
} from '../lib/chromatinModel';

// ── palette ───────────────────────────────────────────────────────────────────

/**
 * Molecular colours are FIXED across themes, deliberately.
 *
 * H3 should be the same colour in light mode as in dark, the way it would be in a PyMOL figure
 * — a reader who learns the key on one theme should not have to relearn it on the other. The
 * values are mid-saturation so they carry on both a #fafaf8 and a #0f1413 ground. What does
 * adapt is the lighting, which is set from the measured background luminance so the page's six
 * themes all render legibly.
 */
const PALETTE = {
  strandA: 0x4f8ff7,
  strandB: 0xf2814a,
  basePair: 0x94a3b3,
  linker: 0x6aa9e8,
  H3: 0xe05a7a,
  H4: 0xf0a23c,
  H2A: 0x3fb8a6,
  H2B: 0x8b7ae0,
  fibreStart: 0x5b8ff2,
  fibreEnd: 0xb06ce0,
  loop: 0x62b6e8,
  cohesin: 0xf3c03f,
  ctcf: 0x35a86b,
  condensin: 0xe2574f,
  chromatid: 0x93a4bb,
} as const;

const HISTONE_COLOR: Record<string, number> = {
  H3: PALETTE.H3,
  H4: PALETTE.H4,
  H2A: PALETTE.H2A,
  H2B: PALETTE.H2B,
};

// ── small vector helpers ──────────────────────────────────────────────────────

function normalise(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function crossV(u: Vec3, w: Vec3): Vec3 {
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
}

const dotV = (u: Vec3, w: Vec3) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];

// ── the tube primitive ────────────────────────────────────────────────────────

/**
 * A tube of fixed topology whose centreline can be rewritten every frame.
 *
 * `TubeGeometry` allocates a whole new geometry each time the path changes, which is fine for
 * static geometry and ruinous for the wrapping animation — that path changes continuously, and
 * building and disposing a geometry per frame would both stutter and churn the heap. This
 * preallocates the buffers once and `update()` only rewrites positions and normals.
 *
 * The frame is parallel-transported for the same reason `duplexStrandsAlong` transports its
 * own: a Frenet frame is undefined on a straight segment and flips through an inflection, and
 * the half-wrapped duplex has both.
 */
class Tube {
  readonly geometry: BufferGeometry;
  private readonly samples: number;
  private readonly radial: number;
  private readonly radius: number;
  private readonly pos: Float32Array;
  private readonly nrm: Float32Array;

  constructor(samples: number, radial: number, radius: number) {
    this.samples = samples;
    this.radial = radial;
    this.radius = radius;
    this.pos = new Float32Array(samples * radial * 3);
    this.nrm = new Float32Array(samples * radial * 3);

    const index: number[] = [];
    for (let i = 0; i < samples - 1; i += 1) {
      for (let j = 0; j < radial; j += 1) {
        const a = i * radial + j;
        const b = i * radial + ((j + 1) % radial);
        const c = (i + 1) * radial + ((j + 1) % radial);
        const d = (i + 1) * radial + j;
        index.push(a, b, d, b, c, d);
      }
    }
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.nrm, 3));
    this.geometry.setIndex(index);
  }

  update(path: Vec3[]): void {
    const n = this.samples;
    const step = (path.length - 1) / (n - 1);

    // resample the incoming path to the fixed sample count
    const pts: Vec3[] = [];
    for (let i = 0; i < n; i += 1) {
      const f = i * step;
      const lo = Math.min(path.length - 1, Math.floor(f));
      const hi = Math.min(path.length - 1, lo + 1);
      const t = f - lo;
      pts.push([
        path[lo][0] * (1 - t) + path[hi][0] * t,
        path[lo][1] * (1 - t) + path[hi][1] * t,
        path[lo][2] * (1 - t) + path[hi][2] * t,
      ]);
    }

    const tangents: Vec3[] = pts.map((_, i) =>
      normalise(
        i === 0
          ? [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]]
          : [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]],
      ),
    );

    const seed: Vec3 = Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let nor = normalise(crossV(seed, tangents[0]));

    for (let i = 0; i < n; i += 1) {
      if (i > 0) {
        const ax = crossV(tangents[i - 1], tangents[i]);
        const sin = Math.hypot(ax[0], ax[1], ax[2]);
        if (sin > 1e-9) {
          const k = normalise(ax);
          const ang = Math.atan2(sin, dotV(tangents[i - 1], tangents[i]));
          const c = Math.cos(ang);
          const s = Math.sin(ang);
          const kd = dotV(k, nor);
          const kx = crossV(k, nor);
          nor = normalise([
            nor[0] * c + kx[0] * s + k[0] * kd * (1 - c),
            nor[1] * c + kx[1] * s + k[1] * kd * (1 - c),
            nor[2] * c + kx[2] * s + k[2] * kd * (1 - c),
          ]);
        }
      }
      const bin = normalise(crossV(tangents[i], nor));
      for (let j = 0; j < this.radial; j += 1) {
        const a = (j / this.radial) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = ca * nor[0] + sa * bin[0];
        const ny = ca * nor[1] + sa * bin[1];
        const nz = ca * nor[2] + sa * bin[2];
        const o = (i * this.radial + j) * 3;
        this.pos[o] = pts[i][0] + nx * this.radius;
        this.pos[o + 1] = pts[i][1] + ny * this.radius;
        this.pos[o + 2] = pts[i][2] + nz * this.radius;
        this.nrm[o] = nx;
        this.nrm[o + 1] = ny;
        this.nrm[o + 2] = nz;
      }
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('normal') as BufferAttribute).needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

// ── public surface ────────────────────────────────────────────────────────────

export type FibreModel = 'solenoid' | 'zigzag' | 'disordered';

export interface ChromatinState {
  scrub: number;
  regime: RegimeId;
  regimeLabel: string;
  fieldNm: number;
  bpInView: number;
  contourNm: number;
  compaction: number;
  nucleosomesDrawn: number;
  nucleosomesImplied: number;
  fps: number;
  playing: boolean;
  exploded: boolean;
  fibreModel: FibreModel;
}

export interface Annotation {
  id: string;
  title: string;
  detail: string;
  at: Vec3;
  regime: RegimeId;
}

export interface ChromatinHandles {
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
}

export interface ChromatinController {
  setScrub(v: number): void;
  getScrub(): number;
  setPlaying(v: boolean): void;
  togglePlaying(): void;
  setExploded(v: boolean): void;
  setFibreModel(m: FibreModel): void;
  setAnnotationsVisible(v: boolean): void;
  subscribe(cb: (s: ChromatinState) => void): () => void;
  refreshTheme(): void;
  destroy(): void;
}

interface RegimeNode {
  id: RegimeId;
  group: Group;
  materials: MeshStandardMaterial[];
  frame?(weight: number, localT: number, ctx: FrameCtx): void;
  anchors(ctx: FrameCtx): Annotation[];
  /**
   * Nucleosome instances this node is drawing right now.
   *
   * Reported by the node rather than recomputed from the model, because the two can disagree
   * and only one of them is on screen. The telemetry once printed the model's budget as though
   * it were the drawn count, which read "4,000 of 1,310".
   */
  nucleosomeCount(): number;
  dispose(): void;
}

interface FrameCtx {
  scrub: number;
  explode: number;
  fibreModel: FibreModel;
  elapsed: number;
  reducedMotion: boolean;
}

// ── shared factories ──────────────────────────────────────────────────────────

const UP = new Vector3(0, 1, 0);
const _q = new Quaternion();
const _m = new Matrix4();
const _s = new Vector3();
const _p = new Vector3();
const _d = new Vector3();

function standard(color: number, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color: new Color(color),
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 1,
    ...extra,
  });
  // The frame loop multiplies regime weight by this, so a material that wants to be permanently
  // semi-transparent has to record that here -- otherwise the weight overwrites it and the
  // ChromEMT envelope, meant to be a 22% haze over the nucleosomes, renders as a solid wall.
  m.userData.baseOpacity = typeof extra.opacity === 'number' ? extra.opacity : 1;
  return m;
}

/** Place one instance of an `InstancedMesh`, aiming its local +Y along `dir`. */
function placeInstance(
  mesh: InstancedMesh,
  i: number,
  at: Vec3,
  dir: Vec3,
  scale = 1,
): void {
  _d.set(dir[0], dir[1], dir[2]);
  if (_d.lengthSq() < 1e-12) _d.set(0, 1, 0);
  _d.normalize();
  _q.setFromUnitVectors(UP, _d);
  _p.set(at[0], at[1], at[2]);
  _s.setScalar(scale);
  _m.compose(_p, _q, _s);
  mesh.setMatrixAt(i, _m);
}

/** Local direction of a polyline at index `i`, for orienting an instance. */
function chainDir(pts: Vec3[], i: number): Vec3 {
  const a = pts[Math.max(0, i - 1)];
  const b = pts[Math.min(pts.length - 1, i + 1)];
  return normalise([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
}

/** Colour ramp along the sequence, so topology stays readable when everything is one shape. */
function rampColor(t: number, out: Color): Color {
  const a = new Color(PALETTE.fibreStart);
  const b = new Color(PALETTE.fibreEnd);
  return out.copy(a).lerp(b, Math.min(1, Math.max(0, t)));
}

/** A nucleosome disc sized from the DNA envelope, so the duplex never clips through it. */
function nucleosomeGeometry(): CylinderGeometry {
  const env = coreParticleEnvelope();
  return new CylinderGeometry(env.diameterNm / 2, env.diameterNm / 2, env.heightNm, 18, 1);
}

// ── regime 0: the B-form duplex ───────────────────────────────────────────────

function buildDuplex(): RegimeNode {
  const group = new Group();
  const BP = 52;
  const rise = contourLengthNm(BP);

  const matA = standard(PALETTE.strandA);
  const matB = standard(PALETTE.strandB);
  const matRung = standard(PALETTE.basePair, { roughness: 0.7 });

  const tubeA = new Tube(320, 10, 0.34);
  const tubeB = new Tube(320, 10, 0.34);
  tubeA.update(bDnaStrand(BP, 0, 6));
  tubeB.update(bDnaStrand(BP, 1, 6));
  const meshA = new Mesh(tubeA.geometry, matA);
  const meshB = new Mesh(tubeB.geometry, matB);

  // base pairs as short rods between the backbones — this is the ladder inside the helix
  const rungs = bDnaBasePairs(BP);
  const rungGeom = new CylinderGeometry(0.19, 0.19, 1, 8, 1);
  const rungMesh = new InstancedMesh(rungGeom, matRung, rungs.length);
  rungs.forEach((r, i) => {
    const mid: Vec3 = [(r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, (r.a[2] + r.b[2]) / 2];
    const d: Vec3 = [r.b[0] - r.a[0], r.b[1] - r.a[1], r.b[2] - r.a[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    _d.set(d[0], d[1], d[2]).normalize();
    _q.setFromUnitVectors(UP, _d);
    _p.set(mid[0], mid[1], mid[2]);
    _s.set(1, len, 1);
    _m.compose(_p, _q, _s);
    rungMesh.setMatrixAt(i, _m);
  });
  rungMesh.instanceMatrix.needsUpdate = true;

  group.add(meshA, meshB, rungMesh);
  group.position.y = -rise / 2; // centre the stretch on the origin

  return {
    id: 'duplex',
    group,
    materials: [matA, matB, matRung],
    anchors: () => [
      {
        id: 'duplex-width',
        title: '2 nm',
        detail: 'duplex diameter',
        at: [6.5, rise * 0.34, 1],
        regime: 'duplex',
      },
      {
        id: 'duplex-pitch',
        title: '10.5 bp per turn',
        detail: '3.57 nm of rise — one full turn of B-form DNA',
        at: [-6.5, rise * 0.72, 1],
        regime: 'duplex',
      },
      {
        id: 'duplex-rise',
        title: '0.34 nm per base pair',
        detail: 'chromosome 1 is 249 Mb, so 84.6 mm of this',
        at: [1, -3.5, 6.0],
        regime: 'duplex',
      },
    ],
    nucleosomeCount: () => 0,
    dispose() {
      tubeA.dispose();
      tubeB.dispose();
      rungGeom.dispose();
      rungMesh.dispose();
      [matA, matB, matRung].forEach((m) => m.dispose());
    },
  };
}

// ── regime 1: the nucleosome, wrapping as you scrub ───────────────────────────

function buildNucleosome(): RegimeNode {
  const group = new Group();
  const matA = standard(PALETTE.strandA);
  const matB = standard(PALETTE.strandB);

  const SAMPLES = 260;
  const tubeA = new Tube(SAMPLES, 9, 0.4);
  const tubeB = new Tube(SAMPLES, 9, 0.4);
  const meshA = new Mesh(tubeA.geometry, matA);
  const meshB = new Mesh(tubeB.geometry, matB);
  group.add(meshA, meshB);

  // one mesh per histone: eight is few enough that individual meshes beat instancing, and
  // they need individual colours anyway
  const layout0 = histoneLayout(0);
  const histoneGeom = new IcosahedronGeometry(1, 3);
  const histoneMats = layout0.map((h) => standard(HISTONE_COLOR[h.name] ?? 0x888888, { roughness: 0.4 }));
  const histoneMeshes = layout0.map((h, i) => {
    const mesh = new Mesh(histoneGeom, histoneMats[i]);
    mesh.scale.setScalar(h.radiusNm);
    group.add(mesh);
    return mesh;
  });

  let lastWrap = -1;
  let lastExplode = -1;
  let wrapNow = 0;

  return {
    id: 'nucleosome',
    group,
    materials: [matA, matB, ...histoneMats],
    frame(_weight, localT, ctx) {
      // The wrap advances across the regime's own band, so at the seam with the duplex the DNA
      // is still straight and matches the stretch fading out beside it. That is the whole
      // transition — no scene swap, just the same duplex doing what it does.
      wrapNow = smoothstep(Math.min(1, Math.max(0, localT * 1.35)));
      if (Math.abs(wrapNow - lastWrap) > 0.002) {
        const axis = wrappingPath(wrapNow, SAMPLES);
        const { a, b } = duplexStrandsAlong(axis, NUCLEOSOME_CORE_BP);
        tubeA.update(a);
        tubeB.update(b);
        lastWrap = wrapNow;
      }
      // histones fade in as the DNA finds them, and separate when exploded
      if (Math.abs(ctx.explode - lastExplode) > 0.002 || Math.abs(wrapNow - lastExplode) > 1e9) {
        const layout = histoneLayout(ctx.explode);
        layout.forEach((h, i) => histoneMeshes[i].position.set(h.at[0], h.at[1], h.at[2]));
        lastExplode = ctx.explode;
      }
      const appear = smoothstep(Math.min(1, wrapNow * 2.2));
      histoneMats.forEach((m) => {
        m.userData.localFade = appear;
      });
    },
    anchors(ctx) {
      const env = coreParticleEnvelope();
      const out: Annotation[] = [
        {
          id: 'nuc-core',
          title: '147 bp in 1.65 turns',
          detail: 'left-handed, around a right-handed duplex',
          at: [9, 9.5, 8],
          regime: 'nucleosome',
        },
        {
          id: 'nuc-size',
          title: '11 nm × 5.5 nm',
          detail: 'the core particle — 6-7× compaction, on its own',
          at: [-13.5, -1.5, 2],
          regime: 'nucleosome',
        },
      ];
      if (ctx.explode > 0.15) {
        out.push(
          {
            id: 'nuc-tetramer',
            title: '(H3–H4)₂ tetramer',
            detail: 'binds the central ~60 bp first, and lets go last',
            at: [-6, -11, -9 - ctx.explode * 4],
            regime: 'nucleosome',
          },
          {
            id: 'nuc-dimers',
            title: 'two H2A–H2B dimers',
            detail: 'bind the flanks; first to dissociate as salt rises',
            at: [6, 12 + ctx.explode * 5.5, 4],
            regime: 'nucleosome',
          },
        );
      } else if (wrapNow < 0.9) {
        out.push({
          id: 'nuc-wrap',
          title: 'wrapping from the dyad outward',
          detail: 'the tetramer takes the middle 60 bp before the dimers take the flanks',
          at: [2, -12.5, 5],
          regime: 'nucleosome',
        });
      }
      return out;
    },
    nucleosomeCount: () => (wrapNow > 0.05 ? 1 : 0),
    dispose() {
      tubeA.dispose();
      tubeB.dispose();
      histoneGeom.dispose();
      [matA, matB, ...histoneMats].forEach((m) => m.dispose());
    },
  };
}

// ── many tubes, one draw call ─────────────────────────────────────────────────

/**
 * Build one static geometry covering many separate tube paths.
 *
 * The metaphase view draws ~480 loops. As individual meshes that is 480 draw calls and the
 * frame rate goes with it; concatenated into a single buffer it is two. Nothing here animates,
 * so the geometry is built once and never rewritten — unlike `Tube`, which exists precisely
 * because the wrapping duplex does change every frame.
 */
export function tubesGeometry(paths: Vec3[][], radius: number, radial: number): BufferGeometry {
  let verts = 0;
  let tris = 0;
  for (const p of paths) {
    verts += p.length * radial;
    tris += (p.length - 1) * radial * 2;
  }
  const pos = new Float32Array(verts * 3);
  const nrm = new Float32Array(verts * 3);
  const idx = verts > 65535 ? new Uint32Array(tris * 3) : new Uint16Array(tris * 3);

  let vo = 0;
  let io = 0;
  for (const path of paths) {
    // vertices written so far. `vo` counts floats, so this is /3 and NOT /3/radial -- dividing
    // by radial a second time makes every path after the first index back into the first
    // path's vertices, and the metaphase array rendered only its bottom quarter.
    const base = vo / 3;
    const tangents: Vec3[] = path.map((_, i) =>
      normalise(
        i === 0
          ? [path[1][0] - path[0][0], path[1][1] - path[0][1], path[1][2] - path[0][2]]
          : [path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]],
      ),
    );
    const seed: Vec3 = Math.abs(tangents[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let nor = normalise(crossV(seed, tangents[0]));

    for (let i = 0; i < path.length; i += 1) {
      if (i > 0) {
        const ax = crossV(tangents[i - 1], tangents[i]);
        const sin = Math.hypot(ax[0], ax[1], ax[2]);
        if (sin > 1e-9) {
          const k = normalise(ax);
          const ang = Math.atan2(sin, dotV(tangents[i - 1], tangents[i]));
          const c = Math.cos(ang);
          const sn = Math.sin(ang);
          const kd = dotV(k, nor);
          const kx = crossV(k, nor);
          nor = normalise([
            nor[0] * c + kx[0] * sn + k[0] * kd * (1 - c),
            nor[1] * c + kx[1] * sn + k[1] * kd * (1 - c),
            nor[2] * c + kx[2] * sn + k[2] * kd * (1 - c),
          ]);
        }
      }
      const bin = normalise(crossV(tangents[i], nor));
      for (let j = 0; j < radial; j += 1) {
        const a = (j / radial) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const nx = ca * nor[0] + sa * bin[0];
        const ny = ca * nor[1] + sa * bin[1];
        const nz = ca * nor[2] + sa * bin[2];
        pos[vo] = path[i][0] + nx * radius;
        pos[vo + 1] = path[i][1] + ny * radius;
        pos[vo + 2] = path[i][2] + nz * radius;
        nrm[vo] = nx;
        nrm[vo + 1] = ny;
        nrm[vo + 2] = nz;
        vo += 3;
      }
    }
    for (let i = 0; i < path.length - 1; i += 1) {
      for (let j = 0; j < radial; j += 1) {
        const a = base + i * radial + j;
        const b = base + i * radial + ((j + 1) % radial);
        const c = base + (i + 1) * radial + ((j + 1) % radial);
        const d = base + (i + 1) * radial + j;
        idx[io] = a; idx[io + 1] = b; idx[io + 2] = d;
        idx[io + 3] = b; idx[io + 4] = c; idx[io + 5] = d;
        io += 6;
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

// ── regime 2: 10 nm fibre, beads on a string ──────────────────────────────────

function buildBeads(): RegimeNode {
  const group = new Group();
  const COUNT = 28;
  const centres = beadsOnAString(COUNT);
  const span = centres[COUNT - 1][1] - centres[0][1];

  const nucGeom = nucleosomeGeometry();
  // white, because setColorAt MULTIPLIES into the material colour -- tinting it as well turned
  // the whole sequence ramp into one flat purple
  const nucMat = standard(0xffffff, { roughness: 0.45 });
  const mesh = new InstancedMesh(nucGeom, nucMat, COUNT);
  const col = new Color();
  centres.forEach((c, i) => {
    // the disc axis lies across the chain, which is how they read in an EM spread
    const t = chainDir(centres, i);
    const across = normalise(crossV(t, [Math.sin(i * 2.1), 0.2, Math.cos(i * 2.1)]));
    placeInstance(mesh, i, c, across);
    mesh.setColorAt(i, rampColor(i / (COUNT - 1), col));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const linkerMat = standard(PALETTE.linker);
  const linker = new Tube(220, 8, DNA_DIAMETER_NM / 2);
  linker.update(centres);
  group.add(new Mesh(linker.geometry, linkerMat), mesh);
  group.position.y = -span / 2;

  return {
    id: 'beads',
    group,
    materials: [nucMat, linkerMat],
    frame(_w, _t, ctx) {
      // the chain grows with the sequence in view rather than sitting at a fixed length, so it
      // never shows more nucleosomes than the field it claims to cover actually holds
      mesh.count = Math.max(1, Math.min(COUNT, impliedNucleosomeCount(ctx.scrub)));
      // and it recentres on what is drawn -- centring on all 28 while showing 16 puts the
      // visible half of the chain below the camera target
      group.position.y = -centres[mesh.count - 1][1] / 2;
    },
    nucleosomeCount: () => mesh.count,
    anchors: () => [
      {
        id: 'beads-repeat',
        title: '~187 bp repeat',
        detail: '147 wrapped, the rest linker — the human average',
        at: [70, centres[Math.floor(COUNT * 0.62)][1], 12],
        regime: 'beads',
      },
      {
        id: 'beads-compaction',
        title: '6–7× so far',
        detail: 'the only compaction step observed directly in living cells',
        at: [-72, centres[Math.floor(COUNT * 0.28)][1], 12],
        regime: 'beads',
      },
    ],
    dispose() {
      nucGeom.dispose();
      linker.dispose();
      mesh.dispose();
      [nucMat, linkerMat].forEach((m) => m.dispose());
    },
  };
}

// ── regime 3: the contested 30 nm regime ──────────────────────────────────────

function buildFibre(): RegimeNode {
  const group = new Group();
  const COUNT = 430;
  const nucGeom = nucleosomeGeometry();
  const nucMat = standard(0xffffff, { roughness: 0.45 });
  const mesh = new InstancedMesh(nucGeom, nucMat, COUNT);
  mesh.count = COUNT;
  group.add(mesh);

  const envMat = standard(0x8fa6c4, { roughness: 0.9, opacity: 0.22 });
  const envGeom = new IcosahedronGeometry(1, 2);
  const envMesh = new InstancedMesh(envGeom, envMat, COUNT);
  group.add(envMesh);

  let current: FibreModel | null = null;
  let span = 0;
  let heights: number[] = [];
  const col = new Color();

  const rebuild = (model: FibreModel) => {
    if (model === current) return;
    current = model;
    let centres: Vec3[];
    let widths: number[] | null = null;

    if (model === 'solenoid') {
      centres = solenoidFibre(COUNT);
    } else if (model === 'zigzag') {
      centres = zigzagFibre(COUNT);
    } else {
      const chain = disorderedChain(COUNT, 11);
      centres = chain.map((c) => c.at);
      widths = chain.map((c) => c.widthNm);
    }

    centres.forEach((c, i) => {
      let axis: Vec3;
      if (model === 'solenoid') {
        // discs stand radially, stacked like coins on edge up a spiral staircase
        axis = normalise([c[0], 0, c[2]]);
      } else if (model === 'zigzag') {
        // two columns stacking face to face, so the disc axis runs along the fibre
        axis = [0, 1, 0];
      } else {
        axis = chainDir(centres, i);
      }
      placeInstance(mesh, i, c, axis);
      mesh.setColorAt(i, rampColor(i / (COUNT - 1), col));
      // the 5-24 nm envelope ChromEMT actually measured; only meaningful for that model
      const w = widths ? widths[i] / 2 : 0;
      placeInstance(envMesh, i, c, [0, 1, 0], Math.max(1e-4, w));
    });
    mesh.instanceMatrix.needsUpdate = true;
    envMesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    envMesh.visible = model === 'disordered';

    heights = centres.map((c) => c[1]);
    span = Math.max(...heights) - Math.min(...heights);
  };
  rebuild('solenoid');

  const COPY: Record<FibreModel, { title: string; detail: string }> = {
    solenoid: {
      title: 'One-start solenoid',
      detail: '6 nucleosomes per turn, 30 nm — recovered in vitro from purified nuclei',
    },
    zigzag: {
      title: 'Two-start zigzag',
      detail: 'alternating stacks, linker crossing the axis — the cryo-EM 30 nm form',
    },
    disordered: {
      title: 'Disordered chain, 5–24 nm',
      detail: 'what ChromEMT found in situ: no 30 nm fibre in human cells at all',
    },
  };

  return {
    id: 'fibre',
    group,
    materials: [nucMat, envMat],
    frame(_w, _t, ctx) {
      rebuild(ctx.fibreModel);
      mesh.count = Math.max(1, Math.min(COUNT, nucleosomeBudget(ctx.scrub)));
      envMesh.count = mesh.count;
      // centre on what is DRAWN, not on the full array: framing 430 nucleosomes while showing
      // 160 pushed the whole fibre to the bottom of the viewport
      group.position.y = -(heights[mesh.count - 1] + heights[0]) / 2;
    },
    nucleosomeCount: () => mesh.count,
    anchors(ctx) {
      const c = COPY[ctx.fibreModel];
      return [
        { id: 'fibre-model', title: c.title, detail: c.detail, at: [150, span * 0.30, 30], regime: 'fibre' },
        {
          id: 'fibre-evidence',
          title: ctx.fibreModel === 'disordered' ? 'in situ' : 'in vitro',
          detail:
            ctx.fibreModel === 'disordered'
              ? 'Ou et al. 2017, ChromEMT — intact nuclei, no fixation artefact'
              : 'purified chromatin at physiological salt; not seen in intact human nuclei',
          at: [-155, span * 0.06, 30],
          regime: 'fibre',
        },
      ];
    },
    dispose() {
      nucGeom.dispose();
      envGeom.dispose();
      mesh.dispose();
      envMesh.dispose();
      [nucMat, envMat].forEach((m) => m.dispose());
    },
  };
}

// ── regime 4: loop domains and TADs ───────────────────────────────────────────

function buildLoops(): RegimeNode {
  const group = new Group();
  const AXIS_NM = 1900;
  const LOOPS = [
    { bp: 200_000, at: 0.08, az: 0.4 },
    { bp: 900_000, at: 0.22, az: 2.3 },
    { bp: 320_000, at: 0.38, az: 4.1 },
    { bp: 650_000, at: 0.52, az: 0.9 },
    { bp: 240_000, at: 0.66, az: 3.2 },
    { bp: 480_000, at: 0.79, az: 5.3 },
    { bp: 150_000, at: 0.91, az: 1.7 },
  ];

  const axisPath: Vec3[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    axisPath.push([Math.sin(t * 5.2) * 26, t * AXIS_NM, Math.cos(t * 4.4) * 26]);
  }
  const axisMat = standard(PALETTE.fibreStart, { roughness: 0.6 });
  const axisTube = new Tube(200, 8, FIBRE_30NM_DIAMETER_NM / 2);
  axisTube.update(axisPath);
  group.add(new Mesh(axisTube.geometry, axisMat));

  const paths = LOOPS.map((l) => {
    const base = axisPath[Math.round(l.at * 60)];
    return extrudedLoop(base[1], l.bp, l.az, 40).map(
      (p) => [p[0] + base[0], p[1], p[2] + base[2]] as Vec3,
    );
  });
  const loopMat = standard(PALETTE.loop, { roughness: 0.6 });
  const loopGeom = tubesGeometry(paths, FIBRE_30NM_DIAMETER_NM / 2, 8);
  group.add(new Mesh(loopGeom, loopMat));

  // cohesin holds the two anchors together; CTCF sits at the boundary that stopped extrusion.
  // Both are drawn at true scale — a cohesin ring really is only ~40 nm across at this zoom,
  // and inflating it to be conspicuous would be the one lie this scene could tell.
  const ringGeom = new CylinderGeometry(22, 22, 9, 16, 1, true);
  const ringMat = standard(PALETTE.cohesin, { roughness: 0.35, side: DoubleSide });
  const rings = new InstancedMesh(ringGeom, ringMat, LOOPS.length);
  const ctcfGeom = new IcosahedronGeometry(16, 2);
  const ctcfMat = standard(PALETTE.ctcf, { roughness: 0.4 });
  const ctcf = new InstancedMesh(ctcfGeom, ctcfMat, LOOPS.length * 2);
  LOOPS.forEach((l, i) => {
    const base = axisPath[Math.round(l.at * 60)];
    placeInstance(rings, i, base, [Math.cos(l.az), 0.25, Math.sin(l.az)]);
    const p = paths[i];
    placeInstance(ctcf, i * 2, p[0], [0, 1, 0]);
    placeInstance(ctcf, i * 2 + 1, p[p.length - 1], [0, 1, 0]);
  });
  rings.instanceMatrix.needsUpdate = true;
  ctcf.instanceMatrix.needsUpdate = true;
  group.add(rings, ctcf);
  group.position.y = -AXIS_NM / 2;

  return {
    id: 'loops',
    group,
    materials: [axisMat, loopMat, ringMat, ctcfMat],
    anchors: () => [
      {
        id: 'loop-extrusion',
        title: 'Cohesin, extruding',
        detail: 'reels chromatin through until it meets two convergent CTCF sites',
        at: [560, axisPath[Math.round(0.22 * 60)][1] + 120, 180],
        regime: 'loops',
      },
      {
        id: 'loop-size',
        title: '150 kb – 1 Mb',
        detail: 'a 900 kb loop reaches 525 nm; loop reach goes as √bp',
        at: [-620, axisPath[Math.round(0.22 * 60)][1] - 150, 120],
        regime: 'loops',
      },
      {
        id: 'loop-tad',
        title: 'This is the TAD',
        detail: 'contacts are dense inside a loop and sparse across its boundary',
        at: [180, -180, 200],
        regime: 'loops',
      },
    ],
    nucleosomeCount: () => 0,
    dispose() {
      axisTube.dispose();
      loopGeom.dispose();
      ringGeom.dispose();
      ctcfGeom.dispose();
      rings.dispose();
      ctcf.dispose();
      [axisMat, loopMat, ringMat, ctcfMat].forEach((m) => m.dispose());
    },
  };
}

// ── regime 5: the metaphase chromosome ────────────────────────────────────────

function buildMitotic(): RegimeNode {
  const group = new Group();
  const LOOPS_DRAWN = 220;
  const rise = helicalRisePerTurnNm();
  const halfGap = CHROMATID_DIAMETER_NM * 0.52;

  const chromatidPaths = (sign: number) => {
    const loops: Vec3[][] = [];
    const scaffold: Vec3[] = [];
    for (let i = 0; i <= LOOPS_DRAWN; i += 1) {
      const u = i / LOOPS_DRAWN;
      const y = u * CHR1_METAPHASE_NM;
      const az = (y / rise) * 2 * Math.PI;
      const pinch = centromereConstriction(u);
      // the condensin axis is itself helical - Gibcus's spiral staircase
      const sx = sign * halfGap + Math.cos(az) * 55 * pinch;
      const sz = Math.sin(az) * 55 * pinch;
      scaffold.push([sx, y, sz]);
      if (i === LOOPS_DRAWN) break;
      const reach = loopReachNm(PROMETA_OUTER_LOOP_BP) * pinch;
      const path = extrudedLoop(y, PROMETA_OUTER_LOOP_BP, az, 14).map((p) => {
        const k = reach / loopReachNm(PROMETA_OUTER_LOOP_BP);
        return [sx + p[0] * k, p[1], sz + p[2] * k] as Vec3;
      });
      loops.push(path);
    }
    return { loops, scaffold };
  };

  const left = chromatidPaths(-1);
  const right = chromatidPaths(1);

  const loopMat = standard(PALETTE.chromatid, { roughness: 0.65 });
  const loopGeom = tubesGeometry([...left.loops, ...right.loops], 26, 6);
  group.add(new Mesh(loopGeom, loopMat));

  const scafMat = standard(PALETTE.condensin, { roughness: 0.4 });
  const scafGeom = tubesGeometry([left.scaffold, right.scaffold], 34, 8);
  group.add(new Mesh(scafGeom, scafMat));

  group.position.y = -CHR1_METAPHASE_NM / 2;
  const centreY = (CHR1_CENTROMERE_BP / CHR1_BP) * CHR1_METAPHASE_NM;

  return {
    id: 'mitotic',
    group,
    materials: [loopMat, scafMat],
    anchors: () => [
      {
        id: 'mit-chromatids',
        title: 'Two sister chromatids',
        detail: 'replicated in S phase, still held together',
        at: [halfGap + 1350, CHR1_METAPHASE_NM * 0.82, 0],
        regime: 'mitotic',
      },
      {
        id: 'mit-centromere',
        title: 'Centromere',
        detail: 'chr1 is metacentric — 123.4 Mb of 249.0, so the arms come out even',
        at: [halfGap + 1150, centreY, 300],
        regime: 'mitotic',
      },
      {
        id: 'mit-helix',
        title: '12 Mb per turn',
        detail: '482 nm of rise — the only value that rebuilds a 10 µm chromosome',
        at: [-halfGap - 1400, CHR1_METAPHASE_NM * 0.30, 0],
        regime: 'mitotic',
      },
      {
        id: 'mit-total',
        title: '≈ 8,500×',
        detail: '84.6 mm of chromosome 1, in 10 µm',
        at: [-halfGap - 1250, CHR1_METAPHASE_NM * 0.06, 0],
        regime: 'mitotic',
      },
    ],
    nucleosomeCount: () => 0,
    dispose() {
      loopGeom.dispose();
      scafGeom.dispose();
      [loopMat, scafMat].forEach((m) => m.dispose());
    },
  };
}

// ── theme ─────────────────────────────────────────────────────────────────────

/**
 * Relative luminance of the page background, 0–1.
 *
 * The site ships six themes, not two, so hardcoding a light and a dark lighting rig would leave
 * four of them looking wrong. Measuring the background instead means every theme — present or
 * future — gets a rig matched to it. Returns a mid value if the token cannot be parsed, which
 * is the safe direction: neither blown out nor black.
 */
function backgroundLuminance(): number {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim();
    const hex = raw.replace('#', '');
    if (!/^[0-9a-f]{3,8}$/i.test(hex)) return 0.5;
    const full =
      hex.length === 3
        ? hex.split('').map((c) => parseInt(c + c, 16))
        : [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [r, g, b] = full.map((v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  } catch {
    return 0.5;
  }
}

// ── the controller ────────────────────────────────────────────────────────────

export function initChromatin(handles: ChromatinHandles): ChromatinController {
  const { canvas, overlay } = handles;

  const gl = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new Scene();
  const camera = new PerspectiveCamera(42, 1, 1, 1e6);

  const ambient = new AmbientLight(0xffffff, 1);
  const key = new DirectionalLight(0xffffff, 1);
  const fill = new DirectionalLight(0xbdd4ff, 0.5);
  key.position.set(0.6, 1, 0.8);
  fill.position.set(-0.7, -0.3, -0.5);
  scene.add(ambient, key, fill);

  function applyTheme(): void {
    const lum = backgroundLuminance();
    // a light page needs more ambient or the shaded sides read as dirt; a dark page needs a
    // stronger key or everything sinks into the ground
    ambient.intensity = 0.55 + lum * 0.85;
    key.intensity = 1.5 - lum * 0.45;
    fill.intensity = 0.35 + (1 - lum) * 0.35;
  }
  applyTheme();

  const nodes: RegimeNode[] = [
    buildDuplex(),
    buildNucleosome(),
    buildBeads(),
    buildFibre(),
    buildLoops(),
    buildMitotic(),
  ];
  for (const n of nodes) scene.add(n.group);

  // ── state ──
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = motionQuery.matches;
  let scrub = 0;
  let playing = false;
  let explodeTarget = 0;
  let explode = 0;
  let fibreModel: FibreModel = 'solenoid';
  let annotationsOn = true;
  let disposed = false;
  let contextLost = false;

  let az = 0.6;
  let el = 0.18;
  let azTarget = 0.6;
  let elTarget = 0.18;
  let zoom = 1;
  let zoomTarget = 1;

  let last = performance.now();
  let elapsed = 0;
  let fps = 60;
  let sinceReport = 0;
  const listeners = new Set<(s: ChromatinState) => void>();

  // ── annotations ──
  const annoNodes = new Map<string, { root: HTMLElement; title: HTMLElement; detail: HTMLElement }>();

  function annoNode(id: string) {
    let n = annoNodes.get(id);
    if (n) return n;
    // built with createElement + textContent throughout. audit:security fails the build on the
    // raw markup-assignment sink, and a label rendering user-facing text has no business with
    // one -- note the audit matches the bare token, so it cannot be named even in a comment
    const root = document.createElement('div');
    root.className = 'chromatin-anno';
    const dot = document.createElement('span');
    dot.className = 'chromatin-anno__dot';
    const body = document.createElement('div');
    body.className = 'chromatin-anno__body';
    const title = document.createElement('strong');
    title.className = 'chromatin-anno__title';
    const detail = document.createElement('span');
    detail.className = 'chromatin-anno__detail';
    body.append(title, detail);
    root.append(dot, body);
    overlay.append(root);
    n = { root, title, detail };
    annoNodes.set(id, n);
    return n;
  }

  const projected = new Vector3();

  /**
   * Project each anchor, then push overlapping labels apart before placing them.
   *
   * Anchors are placed in 3D at the feature they name, so when a structure is small on screen
   * several of them project to nearly the same pixel and the labels stack into an unreadable
   * pile. A single greedy pass down the screen is enough: sort by y, and any label that would
   * land within one box-height of the one above it — and close enough in x to actually overlap
   * — gets pushed down. The dot stays at the true projection, so the label still points at the
   * thing it names.
   */
  const ANNO_H = 56;
  const ANNO_W = 250;
  type Placed = { x: number; left: boolean };
  const boxesOverlap = (a: Placed, b: Placed) => {
    const spanOf = (p: Placed): [number, number] =>
      p.left ? [p.x - ANNO_W, p.x] : [p.x, p.x + ANNO_W];
    const [a0, a1] = spanOf(a);
    const [b0, b1] = spanOf(b);
    return a0 < b1 && b0 < a1;
  };
  function updateAnnotations(ctx: FrameCtx, weights: Map<RegimeId, number>): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const seen = new Set<string>();
    const placed: { id: string; x: number; y: number; left: boolean; opacity: number; a: Annotation }[] = [];

    if (annotationsOn) {
      for (const node of nodes) {
        const weight = weights.get(node.id) ?? 0;
        if (weight < 0.45) continue;
        for (const a of node.anchors(ctx)) {
          seen.add(a.id);
          projected.set(a.at[0], a.at[1], a.at[2]).add(node.group.position).project(camera);
          const x = (projected.x * 0.5 + 0.5) * w;
          const y = (-projected.y * 0.5 + 0.5) * h;
          const off = projected.z > 1 || x < -80 || y < -60 || x > w + 80 || y > h + 60;
          placed.push({
            id: a.id,
            x,
            y,
            // a label right of centre lays out leftward, so its box runs the other way -- and
            // testing overlap on the anchor alone lets two boxes that genuinely collide sit on
            // top of each other
            left: x > w / 2,
            opacity: off ? 0 : Math.min(1, (weight - 0.45) / 0.25),
            a,
          });
        }
      }
    }

    // Keep labels clear of the fixed chrome. An anchor near the top of the structure projects
    // under the topbar at some orbit angles, and clipping a label is worse than moving it.
    const top = 58;
    const bottom = Math.max(top + ANNO_H, h - 128);
    const clamp = (p: { y: number }) => {
      p.y = Math.min(bottom, Math.max(top, p.y));
    };

    const live = placed.filter((p) => p.opacity > 0).sort((a, b) => a.y - b.y);
    live.forEach(clamp);
    for (let i = 1; i < live.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        if (!boxesOverlap(live[i], live[j])) continue;
        if (live[i].y < live[j].y + ANNO_H) live[i].y = live[j].y + ANNO_H;
      }
    }
    // a push may have run one off the bottom; walk back up, which cannot re-enter the top band
    // because the band is at least one label tall
    for (let i = live.length - 1; i >= 0; i -= 1) {
      if (live[i].y <= bottom) continue;
      live[i].y = bottom;
      for (let j = i - 1; j >= 0; j -= 1) {
        if (!boxesOverlap(live[i], live[j])) continue;
        if (live[j].y > live[i].y - ANNO_H) live[j].y = Math.max(top, live[i].y - ANNO_H);
      }
    }

    for (const p of placed) {
      const n = annoNode(p.id);
      // Lay the label out AWAY from the middle of the scene. Anchored to the right always, four
      // labels around a small structure all extend inward and bury the thing they describe.
      const left = p.x > w / 2;
      n.root.classList.toggle('is-left', left);
      n.root.style.transform = left
        ? `translate3d(calc(${p.x.toFixed(1)}px - 100%), ${p.y.toFixed(1)}px, 0)`
        : `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`;
      n.root.style.opacity = p.opacity.toFixed(2);
      n.root.style.visibility = p.opacity > 0 ? 'visible' : 'hidden';
      if (n.title.textContent !== p.a.title) n.title.textContent = p.a.title;
      if (n.detail.textContent !== p.a.detail) n.detail.textContent = p.a.detail;
    }

    for (const [id, n] of annoNodes) {
      if (!seen.has(id)) {
        n.root.remove();
        annoNodes.delete(id);
      }
    }
  }

  // ── frame ──
  function resize(): void {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    gl.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  /** What the scene is actually drawing, summed over every node currently visible. */
  function drawnNucleosomes(): number {
    let n = 0;
    for (const node of nodes) if (node.group.visible) n += node.nucleosomeCount();
    return n;
  }

  function report(): void {
    const bp = bpInViewAt(scrub);
    const { regime } = regimeAt(scrub);
    const state: ChromatinState = {
      scrub,
      regime: regime.id,
      regimeLabel: regime.label,
      fieldNm: cameraFieldNm(scrub),
      bpInView: bp,
      contourNm: contourLengthNm(bp),
      compaction: compactionAt(scrub),
      nucleosomesDrawn: drawnNucleosomes(),
      nucleosomesImplied: impliedNucleosomeCount(scrub),
      fps,
      playing,
      exploded: explodeTarget > 0.5,
      fibreModel,
    };
    for (const cb of listeners) cb(state);
  }

  let raf = 0;
  function tick(now: number): void {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    if (contextLost) return;

    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    elapsed += dt;
    fps = fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;

    if (playing) {
      scrub = Math.min(1, scrub + dt * 0.058);
      if (scrub >= 1) playing = false;
    }

    // damping: a reduced-motion reader gets the same positions, arrived at immediately
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
    az += (azTarget - az) * k;
    el += (elTarget - el) * k;
    zoom += (zoomTarget - zoom) * k;
    explode += (explodeTarget - explode) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 5));
    if (playing && !reducedMotion) azTarget += dt * 0.045;

    const ctx: FrameCtx = { scrub, explode, fibreModel, elapsed, reducedMotion };
    const weights = regimeWeights(scrub);

    for (const node of nodes) {
      const weight = weights.get(node.id) ?? 0;
      node.group.visible = weight > 0.003;
      if (!node.group.visible) continue;
      const r = REGIMES.find((x) => x.id === node.id)!;
      const localT = Math.min(1, Math.max(0, (scrub - r.from) / (r.to - r.from)));
      node.frame?.(weight, localT, ctx);
      for (const m of node.materials) {
        const local = typeof m.userData.localFade === 'number' ? m.userData.localFade : 1;
        const base = typeof m.userData.baseOpacity === 'number' ? m.userData.baseOpacity : 1;
        const o = weight * local * base;
        m.opacity = o;
        m.transparent = o < 0.995;
        m.depthWrite = o > 0.55;
      }
    }

    const field = cameraFieldNm(scrub) / zoom;
    const dist = field / 2 / Math.tan((camera.fov / 2) * (Math.PI / 180));
    camera.near = Math.max(0.01, field / 400);
    camera.far = field * 120;
    camera.position.set(
      dist * Math.cos(el) * Math.sin(az),
      dist * Math.sin(el),
      dist * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    updateAnnotations(ctx, weights);
    gl.render(scene, camera);

    sinceReport += dt;
    if (sinceReport > 0.12) {
      sinceReport = 0;
      report();
    }
  }

  // ── input ──
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    azTarget -= (e.clientX - lastX) * 0.006;
    elTarget = Math.max(-1.35, Math.min(1.35, elTarget + (e.clientY - lastY) * 0.005));
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onPointerUp = (e: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomTarget = Math.max(0.35, Math.min(6, zoomTarget * Math.exp(-e.deltaY * 0.0012)));
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    canvas.dispatchEvent(new CustomEvent('chromatin:context', { detail: { lost: true }, bubbles: true }));
  };
  const onRestored = () => {
    contextLost = false;
    applyTheme();
    canvas.dispatchEvent(new CustomEvent('chromatin:context', { detail: { lost: false }, bubbles: true }));
  };
  const onMotion = () => {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) playing = false;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  motionQuery.addEventListener('change', onMotion);

  const ro = new ResizeObserver(() => resize());
  ro.observe(canvas);
  resize();
  raf = requestAnimationFrame(tick);
  report();

  return {
    setScrub(v) {
      scrub = Math.min(1, Math.max(0, v));
      report();
    },
    getScrub: () => scrub,
    setPlaying(v) {
      if (v && reducedMotion) return;
      if (v && scrub >= 0.999) scrub = 0;
      playing = v;
      report();
    },
    togglePlaying() {
      this.setPlaying(!playing);
    },
    setExploded(v) {
      explodeTarget = v ? 1 : 0;
      report();
    },
    setFibreModel(m) {
      fibreModel = m;
      report();
    },
    setAnnotationsVisible(v) {
      annotationsOn = v;
      if (!v) for (const [, n] of annoNodes) n.root.style.visibility = 'hidden';
      report();
    },
    subscribe(cb) {
      listeners.add(cb);
      cb({
        scrub,
        regime: regimeAt(scrub).regime.id,
        regimeLabel: regimeAt(scrub).regime.label,
        fieldNm: cameraFieldNm(scrub),
        bpInView: bpInViewAt(scrub),
        contourNm: contourLengthNm(bpInViewAt(scrub)),
        compaction: compactionAt(scrub),
        nucleosomesDrawn: drawnNucleosomes(),
        nucleosomesImplied: impliedNucleosomeCount(scrub),
        fps,
        playing,
        exploded: explodeTarget > 0.5,
        fibreModel,
      });
      return () => listeners.delete(cb);
    },
    refreshTheme: applyTheme,
    destroy() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      motionQuery.removeEventListener('change', onMotion);
      for (const [, n] of annoNodes) n.root.remove();
      annoNodes.clear();
      listeners.clear();
      for (const n of nodes) {
        scene.remove(n.group);
        n.dispose();
      }
      gl.dispose();
    },
  };
}
