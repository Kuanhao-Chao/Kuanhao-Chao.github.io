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
  HISTONE_SUBUNITS,
  NUCLEOSOME_CORE_BP,
  OCTAMER_RADIUS_NM,
  PROMETA_OUTER_LOOP_BP,
  REGIMES,
  SUPERHELICAL_TURNS,
  SUPERHELIX_RADIUS_NM,
  alignedWrappingPath,
  anchoredBeadsOnAString,
  bDnaBasePairs,
  bDnaStrand,
  beadsOnAString,
  bpInViewAt,
  cameraFieldNm,
  cameraTargetNmAt,
  coilingFibrePositions,
  compactionAt,
  contourLengthNm,
  coreParticleEnvelope,
  disorderedChain,
  duplexStrandsAlong,
  centromereConstriction,
  extrudedLoop,
  extrudingLoopPath,
  helicalRisePerTurnNm,
  histoneLayout,
  impliedNucleosomeCount,
  loopReachNm,
  nucleosomeBudget,
  physicalScaleBar,
  playbackSpeedMultiplier,
  regimeAt,
  regimeWeights,
  smoothstep,
  smoothstep5,
  solenoidFibre,
  tadDomainGeometry,
  multiTadDomainGeometry,
  kinetochorePlates,
  mitoticChromosomeGeometry,
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
  enhancer: 0xf59e0b,
  promoter: 0x10b981,
  cohesin: 0xf3c03f,
  ctcf: 0x35a86b,
  condensin: 0xe2574f,
  kinetochore: 0xec4899,
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
export type CameraPreset = 'profile' | 'axial' | 'dyad' | 'turntable' | 'default';

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
  highlightTarget: string | null;
  turntable: boolean;
  scaleBar: {
    barWidthNm: number;
    label: string;
    ratioOfField: number;
  };
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
  setHighlight(target: string | null): void;
  setCameraPreset(preset: CameraPreset): void;
  stepRegime(delta: -1 | 1): void;
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
  highlightTarget: string | null;
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
      // is perfectly vertical and matches the stretch fading out beside it. That is the whole
      // transition — zero pop, just the same duplex continuously wrapping around the octamer.
      wrapNow = smoothstep5(Math.min(1, Math.max(0, localT * 1.35)));
      if (Math.abs(wrapNow - lastWrap) > 0.002) {
        const axis = alignedWrappingPath(wrapNow, SAMPLES);
        const { a, b } = duplexStrandsAlong(axis, NUCLEOSOME_CORE_BP);
        tubeA.update(a);
        tubeB.update(b);
        lastWrap = wrapNow;
      }
      // histones fade in as the DNA finds them, and separate when exploded
      if (Math.abs(ctx.explode - lastExplode) > 0.002 || Math.abs(wrapNow - lastExplode) > 1e9) {
        const layout = histoneLayout(ctx.explode);
        const alpha = 1 - smoothstep5(wrapNow);
        const totalAngle = SUPERHELICAL_TURNS * 2 * Math.PI;
        const angleMid = -0.5 * totalAngle;
        const dyadAt: Vec3 = [
          SUPERHELIX_RADIUS_NM * Math.cos(angleMid),
          0,
          SUPERHELIX_RADIUS_NM * Math.sin(angleMid),
        ];
        layout.forEach((h, i) => {
          const px = h.at[0] - alpha * dyadAt[0];
          const py = h.at[1] - alpha * dyadAt[1];
          const pz = h.at[2] - alpha * dyadAt[2];
          histoneMeshes[i].position.set(px, py, pz);
        });
        lastExplode = ctx.explode;
      }
      const appear = smoothstep5(Math.min(1, wrapNow * 2.2));
      const target = ctx.highlightTarget;
      histoneMats.forEach((m, i) => {
        m.userData.localFade = appear;
        const h = layout0[i];
        const sub = HISTONE_SUBUNITS[i];
        const isMatch =
          target &&
          (target === h.group ||
            target === h.name ||
            (sub && target === `${h.name}.${sub.copy}`) ||
            target === 'histones');
        if (isMatch) {
          const pulse = 0.5 + 0.5 * Math.sin(ctx.elapsed * 7);
          m.emissive.setHex(HISTONE_COLOR[h.name] ?? 0xffffff);
          m.emissiveIntensity = 0.45 + pulse * 0.55;
        } else {
          m.emissive.setHex(0x000000);
          m.emissiveIntensity = 0;
        }
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
  const centres = anchoredBeadsOnAString(COUNT);
  const centerIdx = Math.floor(COUNT / 2);

  const nucGeom = nucleosomeGeometry();
  const nucMat = standard(0xffffff, { roughness: 0.45 });
  const mesh = new InstancedMesh(nucGeom, nucMat, COUNT);
  const col = new Color();
  centres.forEach((c, i) => {
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
  group.position.y = 0; // anchored at origin (0, 0, 0)

  return {
    id: 'beads',
    group,
    materials: [nucMat, linkerMat],
    frame(_w, localT, _ctx) {
      // Symmetrical unspooling from centerIdx anchored at origin (0, 0, 0)
      const maxRadius = Math.floor(COUNT / 2);
      const activeRadius = Math.max(0, Math.min(maxRadius, localT * maxRadius * 1.5));
      for (let i = 0; i < COUNT; i += 1) {
        const d = Math.abs(i - centerIdx);
        const scale = d === 0 ? 1 : Math.min(1, Math.max(0, activeRadius - d + 1));
        const c = centres[i];
        const t = chainDir(centres, i);
        const across = normalise(crossV(t, [Math.sin(i * 2.1), 0.2, Math.cos(i * 2.1)]));
        placeInstance(mesh, i, c, across, scale);
      }
      mesh.instanceMatrix.needsUpdate = true;
      group.position.y = 0;
    },
    nucleosomeCount: () => COUNT,
    anchors: () => [
      {
        id: 'beads-repeat',
        title: '~187 bp repeat',
        detail: '147 wrapped, the rest linker — the human average',
        at: [70, centres[Math.floor(COUNT * 0.72)][1], 12],
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
  envMesh.count = COUNT;
  group.add(envMesh);

  // Linker DNA continuous spine connecting all 430 nucleosomes
  const linkerMat = standard(PALETTE.linker, { roughness: 0.5 });
  const linkerTube = new Tube(COUNT, 6, DNA_DIAMETER_NM / 2);
  group.add(new Mesh(linkerTube.geometry, linkerMat));

  let current: FibreModel | null = null;
  let lastMorph = -1;
  let span = 0;
  const col = new Color();

  const updateMorph = (model: FibreModel, morphT: number) => {
    const clampedMorph = Math.min(1, Math.max(0, morphT));
    if (model === current && Math.abs(clampedMorph - lastMorph) < 0.005) return;
    current = model;
    lastMorph = clampedMorph;

    const centres = coilingFibrePositions(COUNT, clampedMorph, model);
    let widths: number[] | null = null;
    if (model === 'disordered') {
      const chain = disorderedChain(COUNT, 11);
      widths = chain.map((c) => c.widthNm);
    }

    centres.forEach((c, i) => {
      let axis: Vec3;
      if (model === 'solenoid') {
        axis = normalise([c[0], 0.1 * (1 - clampedMorph), c[2]]);
      } else if (model === 'zigzag') {
        axis = [0, 1, 0];
      } else {
        axis = chainDir(centres, i);
      }
      placeInstance(mesh, i, c, axis);
      mesh.setColorAt(i, rampColor(i / (COUNT - 1), col));
      const w = widths ? widths[i] / 2 : 0;
      placeInstance(envMesh, i, c, [0, 1, 0], Math.max(1e-4, w));
    });
    mesh.instanceMatrix.needsUpdate = true;
    envMesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    envMesh.visible = model === 'disordered';

    linkerTube.update(centres);

    const heights = centres.map((c) => c[1]);
    span = Math.max(...heights) - Math.min(...heights);
  };
  updateMorph('solenoid', 1);

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
    materials: [nucMat, envMat, linkerMat],
    frame(_w, localT, ctx) {
      const morphT = Math.min(1, Math.max(0, localT * 2.2));
      updateMorph(ctx.fibreModel, morphT);
      mesh.count = COUNT;
      envMesh.count = COUNT;
      group.position.y = 0;
    },
    nucleosomeCount: () => COUNT,
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
      linkerTube.dispose();
      [nucMat, envMat, linkerMat].forEach((m) => m.dispose());
    },
  };
}

// ── regime 4: loop domains and TADs ───────────────────────────────────────────

function buildLoops(): RegimeNode {
  const group = new Group();

  // 1. Continuous chromatin spine threading through all 3 domains
  const spineMat = standard(PALETTE.fibreStart, { roughness: 0.6 });
  const spineTube = new Tube(101, 8, FIBRE_30NM_DIAMETER_NM / 2);
  group.add(new Mesh(spineTube.geometry, spineMat));

  // 2. Upstream TAD 1 Loop (400 kb)
  const tad1Mat = standard(0x4f8ff7, { roughness: 0.55 });
  const tad1Tube = new Tube(49, 8, (FIBRE_30NM_DIAMETER_NM / 2) * 0.9);
  group.add(new Mesh(tad1Tube.geometry, tad1Mat));

  // 3. Hero TAD 2 Primary Loop (800 kb)
  const tad2PrimaryMat = standard(PALETTE.loop, { roughness: 0.5 });
  const tad2PrimaryTube = new Tube(49, 8, FIBRE_30NM_DIAMETER_NM / 2);
  group.add(new Mesh(tad2PrimaryTube.geometry, tad2PrimaryMat));

  // 4. Hero TAD 2 Nested Sub-loop (220 kb)
  const tad2SubMat = standard(0x38bdf8, { roughness: 0.5 });
  const tad2SubTube = new Tube(49, 8, (FIBRE_30NM_DIAMETER_NM / 2) * 0.85);
  group.add(new Mesh(tad2SubTube.geometry, tad2SubMat));

  // 5. Downstream TAD 3 Loop (500 kb)
  const tad3Mat = standard(0x7c3aed, { roughness: 0.55 });
  const tad3Tube = new Tube(49, 8, (FIBRE_30NM_DIAMETER_NM / 2) * 0.9);
  group.add(new Mesh(tad3Tube.geometry, tad3Mat));

  // 6. Enhancer (Amber) and Promoter (Emerald) regulatory spheres
  const regGeom = new IcosahedronGeometry(22, 2);
  const enhancerMat = standard(PALETTE.enhancer, { roughness: 0.35 });
  const promoterMat = standard(PALETTE.promoter, { roughness: 0.35 });
  const enhancerMesh = new Mesh(regGeom, enhancerMat);
  const promoterMesh = new Mesh(regGeom, promoterMat);
  group.add(enhancerMesh, promoterMesh);

  // 7. Active Enhancer-Promoter contact bridge
  const bridgeMat = standard(0x38bdf8, { roughness: 0.3, emissiveIntensity: 0.4 });
  bridgeMat.emissive.setHex(0x38bdf8);
  const bridgeTube = new Tube(9, 6, 4);
  group.add(new Mesh(bridgeTube.geometry, bridgeMat));

  // 8. Cohesin Extrusion Ring Motors (3 SMC rings)
  const ringGeom = new CylinderGeometry(28, 28, 14, 24, 1, true);
  const ringMat = standard(PALETTE.cohesin, { roughness: 0.35, side: DoubleSide });
  const cohesinMeshes = [0, 1, 2].map(() => {
    const m = new Mesh(ringGeom, ringMat);
    m.rotation.z = Math.PI / 2;
    group.add(m);
    return m;
  });

  // 9. Convergent CTCF Boundary Anchor Pins (6 pins at 3 boundaries)
  const ctcfGeom = new IcosahedronGeometry(20, 2);
  const ctcfMat = standard(PALETTE.ctcf, { roughness: 0.4 });
  const ctcfMeshes = [0, 1, 2, 3, 4, 5].map(() => {
    const m = new Mesh(ctcfGeom, ctcfMat);
    group.add(m);
    return m;
  });

  group.position.y = 0;
  let lastExtrusion = -1;

  const updateExtrusion = (localT: number) => {
    const ext = smoothstep5(Math.min(1, Math.max(0.04, localT * 1.5)));
    if (Math.abs(ext - lastExtrusion) < 0.005) return;
    lastExtrusion = ext;

    const data = multiTadDomainGeometry(ext);
    spineTube.update(data.spine);
    tad1Tube.update(data.tad1Loop);
    tad2PrimaryTube.update(data.tad2PrimaryLoop);
    tad2SubTube.update(data.tad2SubLoop);
    tad3Tube.update(data.tad3Loop);
    bridgeTube.update(data.bridge);

    enhancerMesh.position.set(data.enhancer[0], data.enhancer[1], data.enhancer[2]);
    promoterMesh.position.set(data.promoter[0], data.promoter[1], data.promoter[2]);

    data.cohesinPositions.forEach((pos, i) => {
      cohesinMeshes[i].position.set(pos[0], pos[1], pos[2]);
    });

    data.ctcfPins.forEach((pin, i) => {
      ctcfMeshes[i].position.set(pin.at[0], pin.at[1], pin.at[2]);
    });
  };
  updateExtrusion(1);

  return {
    id: 'loops',
    group,
    materials: [
      spineMat,
      tad1Mat,
      tad2PrimaryMat,
      tad2SubMat,
      tad3Mat,
      enhancerMat,
      promoterMat,
      bridgeMat,
      ringMat,
      ctcfMat,
    ],
    frame(_w, localT, ctx) {
      updateExtrusion(localT);
      const target = ctx.highlightTarget;

      if (target === 'cohesin') {
        const pulse = 0.5 + 0.5 * Math.sin(ctx.elapsed * 7);
        ringMat.emissive.setHex(PALETTE.cohesin);
        ringMat.emissiveIntensity = 0.6 + pulse * 0.4;
      } else {
        ringMat.emissive.setHex(0x000000);
        ringMat.emissiveIntensity = 0;
      }

      if (target === 'ctcf') {
        const pulse = 0.5 + 0.5 * Math.sin(ctx.elapsed * 7);
        ctcfMat.emissive.setHex(PALETTE.ctcf);
        ctcfMat.emissiveIntensity = 0.6 + pulse * 0.4;
      } else {
        ctcfMat.emissive.setHex(0x000000);
        ctcfMat.emissiveIntensity = 0;
      }

      if (target === 'enhancer-promoter' || target === 'enhancer' || target === 'promoter') {
        const pulse = 0.5 + 0.5 * Math.sin(ctx.elapsed * 7);
        enhancerMat.emissive.setHex(PALETTE.enhancer);
        enhancerMat.emissiveIntensity = 0.6 + pulse * 0.4;
        promoterMat.emissive.setHex(PALETTE.promoter);
        promoterMat.emissiveIntensity = 0.6 + pulse * 0.4;
        bridgeMat.emissiveIntensity = 0.8 + pulse * 0.4;
      } else {
        enhancerMat.emissive.setHex(0x000000);
        enhancerMat.emissiveIntensity = 0;
        promoterMat.emissive.setHex(0x000000);
        promoterMat.emissiveIntensity = 0;
        bridgeMat.emissiveIntensity = 0.3;
      }
    },
    anchors: () => [
      {
        id: 'loop-extrusion',
        title: 'Cohesin Extrusion Ring',
        detail: 'SMC motor reels DNA into expanding loops until blocked by CTCF',
        at: [65, 30, 20],
        regime: 'loops',
      },
      {
        id: 'loop-ctcf',
        title: 'Convergent CTCF Pins (➔ ⬅)',
        detail: 'boundary motifs point inward to insulate adjacent TADs',
        at: [-80, -25, 20],
        regime: 'loops',
      },
      {
        id: 'loop-ep',
        title: 'Enhancer–Promoter Loop',
        detail: 'brings distal enhancers into 3D contact with promoters within the domain',
        at: [120, 260, 20],
        regime: 'loops',
      },
      {
        id: 'loop-multi-tad',
        title: 'TAD Insulation Chain',
        detail: 'consecutive domains partition the chromosome to prevent ectopic activation',
        at: [-420, -600, 20],
        regime: 'loops',
      },
    ],
    nucleosomeCount: () => 0,
    dispose() {
      spineTube.dispose();
      tad1Tube.dispose();
      tad2PrimaryTube.dispose();
      tad2SubTube.dispose();
      tad3Tube.dispose();
      bridgeTube.dispose();
      regGeom.dispose();
      ringGeom.dispose();
      ctcfGeom.dispose();
      [
        spineMat,
        tad1Mat,
        tad2PrimaryMat,
        tad2SubMat,
        tad3Mat,
        enhancerMat,
        promoterMat,
        bridgeMat,
        ringMat,
        ctcfMat,
      ].forEach((m) => m.dispose());
    },
  };
}

// ── regime 5: the metaphase chromosome ────────────────────────────────────────

function buildMitotic(): RegimeNode {
  const group = new Group();
  const chrData = mitoticChromosomeGeometry();
  const halfGap = CHROMATID_DIAMETER_NM * 0.52; // 364 nm

  // 1. Volumetric radial loop brush (sister chromatid arms)
  const loopMat = standard(PALETTE.chromatid, { roughness: 0.65 });
  const loopGeom = tubesGeometry(
    [...chrData.leftArm.loops, ...chrData.rightArm.loops],
    32,
    6,
  );
  group.add(new Mesh(loopGeom, loopMat));

  // 2. Condensin II glowing axial spiral core (12 Mb per turn, 482 nm pitch)
  const scafMat = standard(PALETTE.condensin, { roughness: 0.35 });
  const scafGeom = tubesGeometry(
    [chrData.leftArm.scaffold, chrData.rightArm.scaffold],
    45,
    8,
  );
  group.add(new Mesh(scafGeom, scafMat));

  // 3. Bilateral Centromeric Kinetochore Plates
  const kPlateGeom = new CylinderGeometry(85, 85, 24, 24, 1);
  const kPlateMat = standard(PALETTE.kinetochore, { roughness: 0.3 });
  const kMeshLeft = new Mesh(kPlateGeom, kPlateMat);
  kMeshLeft.position.set(
    chrData.kinetochores[0].at[0],
    chrData.kinetochores[0].at[1],
    chrData.kinetochores[0].at[2],
  );
  kMeshLeft.rotation.z = Math.PI / 2;

  const kMeshRight = new Mesh(kPlateGeom, kPlateMat);
  kMeshRight.position.set(
    chrData.kinetochores[1].at[0],
    chrData.kinetochores[1].at[1],
    chrData.kinetochores[1].at[2],
  );
  kMeshRight.rotation.z = Math.PI / 2;
  group.add(kMeshLeft, kMeshRight);

  // 4. Centromeric Cohesin binding ring holding sister chromatids at y = 0
  const centromereCohesinGeom = new CylinderGeometry(140, 140, 180, 24, 1, true);
  const centromereCohesinMat = standard(PALETTE.cohesin, { roughness: 0.35, side: DoubleSide });
  const centromereCohesin = new Mesh(centromereCohesinGeom, centromereCohesinMat);
  centromereCohesin.position.set(0, 0, 0);
  centromereCohesin.rotation.x = Math.PI / 2;
  group.add(centromereCohesin);

  group.position.y = 0; // centered at primary centromeric constriction

  return {
    id: 'mitotic',
    group,
    materials: [loopMat, scafMat, kPlateMat, centromereCohesinMat],
    frame(_w, _t, ctx) {
      const target = ctx.highlightTarget;
      if (target === 'condensin') {
        const pulse = 0.5 + 0.5 * Math.sin(ctx.elapsed * 7);
        scafMat.emissive.setHex(PALETTE.condensin);
        scafMat.emissiveIntensity = 0.65 + pulse * 0.35;
      } else {
        scafMat.emissive.setHex(0x000000);
        scafMat.emissiveIntensity = 0;
      }

      if (target === 'chromatid') {
        const pulse = 0.5 + 0.5 * Math.sin(ctx.elapsed * 7);
        loopMat.emissive.setHex(PALETTE.chromatid);
        loopMat.emissiveIntensity = 0.45 + pulse * 0.35;
      } else {
        loopMat.emissive.setHex(0x000000);
        loopMat.emissiveIntensity = 0;
      }

      if (target === 'kinetochore') {
        const pulse = 0.5 + 0.5 * Math.sin(ctx.elapsed * 7);
        kPlateMat.emissive.setHex(PALETTE.kinetochore);
        kPlateMat.emissiveIntensity = 0.7 + pulse * 0.3;
      } else {
        kPlateMat.emissive.setHex(0x000000);
        kPlateMat.emissiveIntensity = 0;
      }

      if (target === 'centromere') {
        const pulse = 0.5 + 0.5 * Math.sin(ctx.elapsed * 7);
        centromereCohesinMat.emissive.setHex(PALETTE.cohesin);
        centromereCohesinMat.emissiveIntensity = 0.65 + pulse * 0.35;
      } else {
        centromereCohesinMat.emissive.setHex(0x000000);
        centromereCohesinMat.emissiveIntensity = 0;
      }
    },
    anchors: () => [
      {
        id: 'mit-chromatids',
        title: 'Two Sister Chromatids',
        detail: '700 nm cylindrical arms organized into nested helical loop rosettes',
        at: [halfGap + 950, CHR1_METAPHASE_NM * 0.28, 0],
        regime: 'mitotic',
      },
      {
        id: 'mit-centromere',
        title: 'Primary Constriction & Kinetochores',
        detail: 'centromeric cohesin links sisters; outer plates bind spindle microtubules',
        at: [halfGap + 750, 0, 150],
        regime: 'mitotic',
      },
      {
        id: 'mit-condensin',
        title: 'Condensin II Core (12 Mb / turn)',
        detail: '482 nm helical rise per turn forming the central axial scaffold',
        at: [-halfGap - 980, -CHR1_METAPHASE_NM * 0.25, 0],
        regime: 'mitotic',
      },
      {
        id: 'mit-total',
        title: '≈ 8,500× Linear Compaction',
        detail: '84.6 mm of chromosome 1 DNA packed into a 10 µm metaphase chromatid',
        at: [-halfGap - 900, -CHR1_METAPHASE_NM * 0.42, 0],
        regime: 'mitotic',
      },
    ],
    nucleosomeCount: () => 0,
    dispose() {
      loopGeom.dispose();
      scafGeom.dispose();
      kPlateGeom.dispose();
      centromereCohesinGeom.dispose();
      [loopMat, scafMat, kPlateMat, centromereCohesinMat].forEach((m) => m.dispose());
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
  let turntable = false;
  let highlightTarget: string | null = null;

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
        if (weight < 0.04) continue;
        for (const a of node.anchors(ctx)) {
          seen.add(a.id);
          projected.set(a.at[0], a.at[1], a.at[2]);
          projected.project(camera);
          // behind the camera? skip rather than mirroring to the front
          if (projected.z > 1) continue;
          const x = (projected.x * 0.5 + 0.5) * w;
          const y = (-projected.y * 0.5 + 0.5) * h;
          // fade out as the anchor nears the screen edge so labels do not clip off abruptly
          const edge = Math.min(x, w - x, y, h - y);
          const edgeFade = smoothstep(edge / 36);
          const opacity = weight * edgeFade;
          if (opacity > 0.02) placed.push({ id: a.id, x, y, left: x > w / 2, opacity, a });
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

  /**
   * Nucleosomes the scene is drawing, weighted by how visible each node is.
   *
   * Summing raw counts double-counts across a cross-fade, where two representations are alive
   * at partial opacity: at the beads/fibre seam it reported "91 of 63", claiming more
   * nucleosomes on screen than the sequence in view contains. Each is at half opacity there,
   * so the weighted sum is what the reader is actually looking at -- and it stays inside the
   * implied count, which is the whole point of the comparison.
   */
  function drawnNucleosomes(weights: Map<RegimeId, number>): number {
    let n = 0;
    for (const node of nodes) {
      if (!node.group.visible) continue;
      n += node.nucleosomeCount() * (weights.get(node.id) ?? 0);
    }
    return Math.round(n);
  }

  function report(): void {
    const bp = bpInViewAt(scrub);
    const { regime } = regimeAt(scrub);
    const field = cameraFieldNm(scrub);
    const state: ChromatinState = {
      scrub,
      regime: regime.id,
      regimeLabel: regime.label,
      fieldNm: field,
      bpInView: bp,
      contourNm: contourLengthNm(bp),
      compaction: compactionAt(scrub),
      nucleosomesDrawn: drawnNucleosomes(regimeWeights(scrub)),
      nucleosomesImplied: impliedNucleosomeCount(scrub),
      fps,
      playing,
      exploded: explodeTarget > 0.5,
      fibreModel,
      highlightTarget,
      turntable,
      scaleBar: physicalScaleBar(field / Math.max(0.1, zoom)),
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
      const pace = playbackSpeedMultiplier(scrub);
      scrub = Math.min(1, scrub + dt * 0.052 * pace);
      if (scrub >= 1) playing = false;
    }

    // damping: a reduced-motion reader gets the same positions, arrived at immediately
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 9);
    az += (azTarget - az) * k;
    el += (elTarget - el) * k;
    zoom += (zoomTarget - zoom) * k;
    explode += (explodeTarget - explode) * (reducedMotion ? 1 : 1 - Math.exp(-dt * 5));
    if ((playing || turntable) && !reducedMotion) {
      azTarget += dt * (turntable ? 0.12 : 0.045);
    }

    const ctx: FrameCtx = {
      scrub,
      explode,
      fibreModel,
      highlightTarget,
      elapsed,
      reducedMotion,
    };
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

    const targetPos = cameraTargetNmAt(scrub);
    camera.position.set(
      targetPos[0] + dist * Math.cos(el) * Math.sin(az),
      targetPos[1] + dist * Math.sin(el),
      targetPos[2] + dist * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(targetPos[0], targetPos[1], targetPos[2]);
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
    setHighlight(target) {
      highlightTarget = target;
      report();
    },
    setCameraPreset(preset) {
      if (preset === 'profile') {
        azTarget = 0;
        elTarget = 0;
        turntable = false;
      } else if (preset === 'axial') {
        azTarget = 0;
        elTarget = 1.35;
        turntable = false;
      } else if (preset === 'dyad') {
        azTarget = Math.PI * 0.75;
        elTarget = 0.22;
        turntable = false;
      } else if (preset === 'turntable') {
        turntable = !turntable;
      } else {
        azTarget = 0.6;
        elTarget = 0.18;
        zoomTarget = 1;
        turntable = false;
      }
      report();
    },
    stepRegime(delta) {
      const { index } = regimeAt(scrub);
      const nextIndex = Math.min(REGIMES.length - 1, Math.max(0, index + delta));
      const targetRegime = REGIMES[nextIndex];
      this.setScrub((targetRegime.from + targetRegime.to) / 2);
    },
    setAnnotationsVisible(v) {
      annotationsOn = v;
      if (!v) for (const [, n] of annoNodes) n.root.style.visibility = 'hidden';
      report();
    },
    subscribe(cb) {
      listeners.add(cb);
      const bp = bpInViewAt(scrub);
      const { regime } = regimeAt(scrub);
      const field = cameraFieldNm(scrub);
      cb({
        scrub,
        regime: regime.id,
        regimeLabel: regime.label,
        fieldNm: field,
        bpInView: bp,
        contourNm: contourLengthNm(bp),
        compaction: compactionAt(scrub),
        nucleosomesDrawn: drawnNucleosomes(regimeWeights(scrub)),
        nucleosomesImplied: impliedNucleosomeCount(scrub),
        fps,
        playing,
        exploded: explodeTarget > 0.5,
        fibreModel,
        highlightTarget,
        turntable,
        scaleBar: physicalScaleBar(field / Math.max(0.1, zoom)),
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
