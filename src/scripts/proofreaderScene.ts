/** WebGL-only presentation. No hit detection, progression, or gameplay randomness. */
import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  hazardPhase,
  doorOpenFraction,
  TUNING,
  WEAPON_IDS,
  type Enemy,
  type GameState,
  type WeaponId,
} from '../lib/proofreader';
import {
  add,
  direction,
  rayDistance,
  solidGeometry,
  compileWorld,
  v3,
  type Vec3,
} from '../lib/proofreaderWorld';
import type { ArcadePresentation, ArcadeSettings } from './arcadeBrowser';

export interface ProofGraphicsStats {
  frames: number;
  calls: number;
  triangles: number;
  width: number;
  height: number;
  quality: number;
  lost: boolean;
  geometries: number;
  textures: number;
}
export interface ProofPresentation extends ArcadePresentation {
  stats(): ProofGraphicsStats;
}
interface Actor {
  group: Group;
  core: Mesh;
  warning: Mesh;
  parts: Group[];
  kind: Enemy['kind'];
}
const weaponNames: Record<WeaponId, string> = {
  carbine: 'PRF / 01',
  scatter: 'SCT / 02',
  pulse: 'ION / 03',
};

export function createProofreaderPresentation(
  canvas: HTMLCanvasElement,
  getState: () => GameState
): ProofPresentation {
  const gl = new WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  gl.toneMapping = ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.28;
  gl.autoClear = false;
  gl.info.autoReset = false;
  const scene = new Scene(),
    view = new Scene(),
    world = new Group();
  scene.add(world);
  scene.background = new Color(0x0b1924);
  scene.fog = new Fog(0x0b1924, 22, 67);
  const camera = new PerspectiveCamera(75, 16 / 9, 0.05, 100);
  camera.rotation.order = 'YXZ';
  const viewCamera = new PerspectiveCamera(55, 16 / 9, 0.01, 10);
  scene.add(new HemisphereLight(0xb7e6f1, 0x1e293b, 2.2), new AmbientLight(0x9dc5d3, 0.8));
  const key = new DirectionalLight(0xe3f7ff, 3);
  key.position.set(-8, 18, 9);
  scene.add(key);
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -26;
  key.shadow.camera.right = 26;
  key.shadow.camera.top = 26;
  key.shadow.camera.bottom = -26;
  key.shadow.camera.far = 70;
  key.shadow.bias = -0.0005;
  const warm = new PointLight(0xf0be8c, 48, 25, 2);
  warm.position.set(0, 8, -12);
  scene.add(warm);
  const fill = new PointLight(0x62d9db, 35, 25, 2);
  fill.position.set(0, 5, 15);
  scene.add(fill);
  view.add(new HemisphereLight(0xe4f8ff, 0x405263, 3));
  const gunLight = new DirectionalLight(0xffffff, 3);
  gunLight.position.set(-1, 3, 2);
  view.add(gunLight);
  const weaponRoot = new Group();
  view.add(weaponRoot);
  const geometries = new Set<BufferGeometry>(),
    materials = new Set<Material>(),
    textures = new Set<CanvasTexture>();
  const actors = new Map<number, Actor>(),
    pool = new Map<string, Actor[]>(),
    projectiles = new Map<number, Mesh>();
  const projectilePool: Mesh[] = [],
    pickupPool: Group[] = [];
  const objectives: Group[] = [],
    crates: Group[] = [],
    doors: Group[] = [],
    hazards: Mesh[] = [],
    pickups = new Map<number, Group>();
  const guns = new Map<WeaponId, Group>(),
    effects: Mesh[] = [],
    decorations: Group[] = [];
  let currentLevel: GameState['level'] | null = null,
    disposed = false,
    lost = false,
    frames = 0,
    quality = 1,
    lastTime = 0,
    frameAverage = 16.7,
    samples = 0;
  let lastGraphics = '',
    accent: MeshStandardMaterial,
    signal: MeshBasicMaterial,
    dust: Points | undefined;
  let previousPalette = -1;
  const ownGeometry = <T extends BufferGeometry>(g: T): T => {
    geometries.add(g);
    return g;
  };
  const standard = (color: number, metalness = 0.25, roughness = 0.5) => {
    const m = new MeshStandardMaterial({ color, metalness, roughness });
    materials.add(m);
    return m;
  };
  const glow = (color: number, opacity = 1) => {
    const m = new MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
    materials.add(m);
    return m;
  };
  function mesh(
    geometry: BufferGeometry,
    material: Material,
    parent: Object3D,
    x = 0,
    y = 0,
    z = 0
  ): Mesh {
    const m = new Mesh(geometry, material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function rounded(
    parent: Object3D,
    mat: Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    r = 0.05
  ) {
    return mesh(
      ownGeometry(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 4, h / 4, d / 4))),
      mat,
      parent,
      x,
      y,
      z
    );
  }
  function ball(parent: Object3D, mat: Material, x: number, y: number, z: number, r: number) {
    const m = mesh(ownGeometry(new SphereGeometry(r, 20, 12)), mat, parent, x, y, z);
    return m;
  }
  function cylinder(
    parent: Object3D,
    mat: Material,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number
  ) {
    return mesh(ownGeometry(new CylinderGeometry(r, r, h, 18)), mat, parent, x, y, z);
  }
  function ring(
    parent: Object3D,
    mat: Material,
    x: number,
    y: number,
    z: number,
    r: number,
    tube = 0.035
  ) {
    const m = mesh(ownGeometry(new TorusGeometry(r, tube, 8, 36)), mat, parent, x, y, z);
    m.rotation.x = Math.PI / 2;
    return m;
  }
  function label(
    parent: Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    width = 2,
    color = '#b7e9df'
  ) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#112837';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = color;
    ctx.font = '600 45px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 66);
    const texture = new CanvasTexture(c);
    textures.add(texture);
    const mat = new MeshBasicMaterial({ map: texture });
    materials.add(mat);
    return mesh(ownGeometry(new PlaneGeometry(width, width / 4)), mat, parent, x, y, z);
  }
  function stamps(entries: { position: Vec3; size: Vec3 }[], mat: Material) {
    if (!entries.length) return;
    const group = new InstancedMesh(ownGeometry(new BoxGeometry(1, 1, 1)), mat, entries.length);
    const matrix = new Matrix4();
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      matrix.makeScale(e.size.x, e.size.y, e.size.z);
      matrix.setPosition(e.position.x, e.position.y, e.position.z);
      group.setMatrixAt(i, matrix);
    }
    group.instanceMatrix.needsUpdate = true;
    world.add(group);
  }
  function cleanupLevel() {
    // InstancedMesh owns GPU instance buffers in addition to its shared geometry.
    world.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
    });
    world.clear();
    weaponRoot.clear();
    actors.clear();
    pool.clear();
    projectiles.clear();
    pickups.clear();
    projectilePool.length = pickupPool.length = 0;
    objectives.length =
      crates.length =
      doors.length =
      hazards.length =
      effects.length =
      decorations.length =
        0;
    guns.clear();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    geometries.clear();
    materials.clear();
    textures.clear();
    dust = undefined;
  }
  function consoleModel(position: Vec3, number: string, terminal = false) {
    const g = new Group();
    g.position.set(position.x, position.y, position.z);
    world.add(g);
    const metal = standard(0x445b68, 0.6, 0.35),
      dark = standard(0x172b38, 0.5);
    rounded(g, metal, 0, 0.55, 0, 0.8, 1.1, 0.65);
    rounded(g, dark, 0, 1.13, -0.03, 0.95, 0.2, 0.7);
    const display = rounded(g, terminal ? glow(0x78d6f4) : signal, 0, 1.17, 0.2, 0.72, 0.1, 0.35);
    display.rotation.x = -0.18;
    label(g, number, 0, 0.75, 0.335, 0.65);
    ring(g, terminal ? glow(0x78d6f4) : signal, 0, 0.025, 0, 0.85, 0.025);
    return g;
  }
  function buildGun(id: WeaponId) {
    const g = new Group();
    weaponRoot.add(g);
    guns.set(id, g);
    const armor = standard(id === 'pulse' ? 0xe3d9bc : 0x8397a0, 0.7, 0.32),
      black = standard(0x142530, 0.45, 0.42),
      copper = standard(0xb58a5b, 0.75, 0.32);
    const led = glow(id === 'scatter' ? 0xf3c177 : id === 'pulse' ? 0xbc9ef7 : 0x75e9ce);
    rounded(g, armor, 0, 0, 0, 0.2, 0.18, 0.46);
    rounded(g, black, 0, -0.1, 0.12, 0.105, 0.2, 0.13);
    rounded(g, black, 0, 0.105, 0, 0.1, 0.03, 0.35, 0.008);
    rounded(g, black, 0, -0.14, -0.03, 0.09, 0.18, 0.13);
    rounded(g, armor, 0.01, -0.08, 0.26, 0.17, 0.21, 0.16);
    rounded(g, led, 0.105, 0.02, 0.02, 0.01, 0.035, 0.2, 0.002);
    const barrels = id === 'scatter' ? [-0.045, 0.045] : [0];
    for (const x of barrels) {
      const barrel = cylinder(g, black, x, 0, -0.34, id === 'pulse' ? 0.075 : 0.032, 0.3);
      barrel.rotation.x = Math.PI / 2;
      for (const z of [-0.25, -0.35, -0.45]) {
        const rim = cylinder(
          g,
          id === 'pulse' ? led : copper,
          x,
          0,
          z,
          id === 'pulse' ? 0.083 : 0.038,
          0.02
        );
        rim.rotation.x = Math.PI / 2;
      }
    }
    if (id === 'pulse')
      for (let i = 0; i < 3; i++) {
        const r = ring(g, led, 0, 0, -0.29 - i * 0.07, 0.105, 0.012);
        r.rotation.x = 0;
      }
    else {
      rounded(g, black, 0, 0.17, -0.12, 0.06, 0.09, 0.04);
      rounded(g, led, 0, 0.18, -0.145, 0.025, 0.025, 0.012, 0.003);
    }
    const marking = label(g, weaponNames[id], 0.107, 0.025, 0.035, 0.15);
    marking.rotation.y = Math.PI / 2;
    // Layered gauntlets rather than a flat billboard gun sprite.
    const glove = standard(0x293f4b, 0.1, 0.7),
      cuff = standard(0x718c93, 0.5, 0.42);
    const hand = ball(g, glove, 0.03, -0.16, 0.14, 0.085);
    hand.scale.set(0.7, 1.1, 1.1);
    rounded(g, cuff, 0.05, -0.24, 0.28, 0.13, 0.13, 0.23);
    const support = ball(g, glove, -0.05, -0.14, -0.17, 0.075);
    support.scale.set(0.9, 0.65, 1.2);
    rounded(g, cuff, -0.12, -0.22, -0.04, 0.12, 0.12, 0.24);
    return g;
  }
  function buildActor(kind: Enemy['kind']): Actor {
    const g = new Group(),
      parts: Group[] = [];
    world.add(g);
    const metal = standard(
      kind === 'guardian' ? 0x7b8298 : kind === 'charger' ? 0x927a5c : 0x697e8c,
      0.6,
      0.38
    );
    const black = standard(0x192837, 0.4, 0.5),
      red = glow(kind === 'charger' ? 0xf5bd6b : kind === 'sentry' ? 0xbba3f5 : 0xf98a7c);
    const core = ball(
      g,
      red,
      0,
      kind === 'guardian' ? 1.7 : kind === 'flyer' ? 0.35 : 0.8,
      0,
      kind === 'guardian' ? 0.6 : 0.23
    );
    if (kind === 'guardian') {
      for (let i = 0; i < 3; i++) {
        const part = new Group();
        part.position.y = 0.7 + i * 0.9;
        g.add(part);
        parts.push(part);
        const r = ring(part, metal, 0, 0, 0, 1.2 + i * 0.1, 0.16);
        r.rotation.z = i * 0.3;
        for (let j = 0; j < 4; j++) {
          const a = (j * Math.PI) / 2;
          rounded(part, black, Math.sin(a) * 1.25, 0, Math.cos(a) * 1.25, 0.32, 0.5, 0.32);
        }
      }
      for (const x of [-0.8, 0.8]) rounded(g, metal, x, 0.35, 0, 0.3, 0.7, 0.7);
    } else if (kind === 'flyer') {
      const body = ball(g, metal, 0, 0.35, 0, 0.43);
      body.scale.set(1.25, 0.65, 1);
      core.position.z = -0.38;
      for (const x of [-0.65, 0.65]) {
        const part = new Group();
        part.position.set(x, 0.4, 0);
        g.add(part);
        parts.push(part);
        ring(part, black, 0, 0, 0, 0.34, 0.055);
        rounded(part, metal, 0, 0, 0, 0.52, 0.025, 0.08);
      }
    } else {
      const shell = ball(g, metal, 0, 0.85, 0.12, kind === 'charger' ? 0.58 : 0.43);
      shell.scale.set(kind === 'sentry' ? 1.35 : 1, 0.8, 1);
      core.position.z = -0.32;
      rounded(g, black, 0, 1.08, 0, 0.55, 0.16, 0.44);
      const legs = kind === 'charger' ? 4 : 3;
      for (let i = 0; i < legs; i++) {
        const a = (i * Math.PI * 2) / legs,
          part = new Group();
        part.position.set(Math.sin(a) * 0.28, 0.48, Math.cos(a) * 0.28);
        g.add(part);
        parts.push(part);
        const leg = rounded(
          part,
          metal,
          Math.sin(a) * 0.14,
          -0.19,
          Math.cos(a) * 0.14,
          0.12,
          0.5,
          0.13
        );
        leg.rotation.z = -Math.sin(a) * 0.4;
        leg.rotation.x = Math.cos(a) * 0.4;
        ball(part, black, 0, 0, 0, 0.11);
      }
      if (kind === 'sentry')
        for (const x of [-0.43, 0.43]) rounded(g, metal, x, 0.86, -0.16, 0.25, 0.6, 0.21);
      if (kind === 'charger')
        for (const x of [-0.35, 0.35]) {
          const horn = cylinder(g, metal, x, 1, -0.4, 0.08, 0.6);
          horn.rotation.x = -Math.PI / 3;
        }
    }
    const warning = ring(
      g,
      glow(0xffd08b, 0.8),
      0,
      0.04,
      0,
      kind === 'guardian' ? 1.65 : 0.85,
      0.035
    );
    warning.visible = false;
    return { group: g, core, warning, parts, kind };
  }
  function build(state: GameState) {
    cleanupLevel();
    currentLevel = state.level;
    previousPalette = -1;
    const level = state.level;
    accent = standard(level.color, 0.45, 0.3);
    accent.emissive = new Color(level.color);
    accent.emissiveIntensity = 0.45;
    signal = glow(0xf1c780);
    const surfaceMats = {
      floor: standard(0x20343f, 0.15, 0.8),
      wall: standard(0x415564, 0.3, 0.56),
      deck: standard(0x526c78, 0.5, 0.44),
      ramp: standard(0x466471, 0.4, 0.55),
      cover: standard(0x3b6673, 0.55, 0.38),
      glass: standard(0x3b6a7c, 0.4, 0.3),
    };
    const tint = new Color(level.color);
    surfaceMats.floor.color.lerp(tint, 0.035);
    surfaceMats.wall.color.lerp(tint, 0.075);
    surfaceMats.cover.color.lerp(tint, 0.13);
    // Smoothly filtered, original material detail: machined panels, not pixel-art assets.
    const panel = document.createElement('canvas');
    panel.width = panel.height = 512;
    const ink = panel.getContext('2d')!;
    ink.fillStyle = '#c7d0d1';
    ink.fillRect(0, 0, 512, 512);
    ink.strokeStyle = '#9aa9ad';
    ink.lineWidth = 4;
    for (const x of [0, 256, 512])
      for (const y of [0, 256, 512]) ink.strokeRect(x + 5, y + 5, 246, 246);
    ink.strokeStyle = '#dbe1de';
    ink.lineWidth = 1;
    for (let i = 0; i < 32; i++) {
      const x = (i * 109) % 512,
        y = (i * 73) % 512;
      ink.beginPath();
      ink.moveTo(x, y);
      ink.lineTo(x + 24 + (i % 4) * 9, y + 1);
      ink.stroke();
    }
    const panelMap = new CanvasTexture(panel);
    panelMap.wrapS = panelMap.wrapT = RepeatWrapping;
    panelMap.repeat.set(8, 8);
    panelMap.colorSpace = SRGBColorSpace;
    textures.add(panelMap);
    surfaceMats.floor.map = panelMap;
    surfaceMats.floor.bumpMap = panelMap;
    surfaceMats.floor.bumpScale = 0.018;
    surfaceMats.deck.map = panelMap;
    surfaceMats.deck.bumpMap = panelMap;
    surfaceMats.deck.bumpScale = 0.01;
    for (const surface of Object.keys(surfaceMats) as (keyof typeof surfaceMats)[]) {
      const pieces = level.solids.filter((s) => s.surface === surface).map(solidGeometry);
      if (!pieces.length) continue;
      const triangles = pieces.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(triangles);
      // toNonIndexed() creates temporary CPU geometry, never retained as GPU state.
      pieces.forEach((g) => g.dispose());
      triangles.forEach((g) => g.dispose());
      if (merged) {
        const m = mesh(ownGeometry(merged), surfaceMats[surface], world);
        m.receiveShadow = true;
        m.castShadow = surface !== 'floor';
      }
    }
    const strips: { position: Vec3; size: Vec3 }[] = [],
      panels: { position: Vec3; size: Vec3 }[] = [],
      grid: { position: Vec3; size: Vec3 }[] = [];
    for (let x = -18; x <= 18; x += 4) {
      grid.push({ position: v3(x, 0.008, 0), size: v3(0.025, 0.012, 43) });
      panels.push({ position: v3(x, 3.1, -21.94), size: v3(3.65, 5.5, 0.12) });
      strips.push({ position: v3(x, 0.35, -21.84), size: v3(2.6, 0.055, 0.06) });
    }
    for (let z = -20; z <= 20; z += 4) {
      grid.push({ position: v3(0, 0.01, z), size: v3(39, 0.012, 0.025) });
      for (const x of [-19.94, 19.94]) {
        panels.push({ position: v3(x, 3.1, z), size: v3(0.12, 5.5, 3.7) });
        strips.push({ position: v3(x > 0 ? 19.82 : -19.82, 0.35, z), size: v3(0.05, 0.055, 2.7) });
      }
    }
    for (const x of [-8.08, 8.08]) {
      strips.push({ position: v3(x, 3.63, -3), size: v3(0.04, 0.04, 24) });
    }
    stamps(grid, standard(0x435c69, 0.2, 0.75));
    stamps(panels, standard(0x2d4554, 0.4, 0.58));
    stamps(strips, accent);
    const fixtures: { position: Vec3; size: Vec3 }[] = [];
    for (const z of [-16, -8, 0, 8, 16])
      for (const x of [-12, 0, 12])
        fixtures.push({ position: v3(x, 9.83, z), size: v3(3.2, 0.025, 0.18) });
    stamps(fixtures, glow(0xb4d9df));
    // Large, legible landmarks and light fixtures, not random maze noise.
    label(world, `0${level.id} / ${level.name.toUpperCase()}`, 0, 5.7, -21.85, 11);
    for (const x of [-12, 12]) {
      const sign = label(world, x < 0 ? 'WEST / RAMP' : 'EAST / RAMP', x, 2, 20.9, 3);
      sign.rotation.y = Math.PI;
    }
    const exitSign = label(
      world,
      level.id === 4 ? 'RECOVERY / DOCK' : 'EXIT / AIRLOCK',
      0,
      2.7,
      level.id === 4 ? 21.8 : -21.8,
      4
    );
    if (level.id === 4) exitSign.rotation.y = Math.PI;
    if (level.id === 5) ring(world, glow(0x78c9c1, 0.45), 0, 0.025, 6, 8.4, 0.025);
    for (const obj of level.objectives)
      objectives.push(consoleModel(obj.position, String(obj.id).padStart(2, '0')));
    for (const p of level.terminals) consoleModel(p, 'AMMO', true);
    const crateMat = standard(0x8a795d, 0.3, 0.65),
      dark = standard(0x243746, 0.4);
    for (const p of level.crates) {
      const g = new Group();
      g.position.set(p.x, p.y, p.z);
      world.add(g);
      rounded(g, crateMat, 0, 0.55, 0, 1.1, 1.1, 1.1);
      for (const x of [-0.35, 0.35]) rounded(g, dark, x, 0.55, 0, 0.08, 1.12, 1.12, 0.015);
      label(g, 'SUPPLY', 0, 0.6, 0.56, 0.8);
      crates.push(g);
    }
    for (const d of level.doors) {
      const g = new Group();
      g.position.set(d.position.x, d.position.y, d.position.z);
      world.add(g);
      rounded(g, standard(0x687c8b, 0.7), 0, 0, 0, d.size.x, d.size.y, d.size.z);
      doors.push(g);
    }
    for (const h of level.hazards) {
      const mat = glow(0xc78856, 0.55);
      const m = mesh(
        ownGeometry(new BoxGeometry(h.size.x, h.size.y, h.size.z)),
        mat,
        world,
        h.position.x,
        h.position.y,
        h.position.z
      );
      hazards.push(m);
    }
    const exit = ring(world, accent, level.exit.x, 0.04, level.exit.z, 1.3, 0.05);
    exit.name = 'exit-ring';
    for (const d of level.decor) {
      const g = new Group();
      g.position.set(d.position.x, d.position.y, d.position.z);
      g.scale.setScalar(d.scale);
      world.add(g);
      decorations.push(g);
      if (d.kind === 'dna') {
        const a = glow(0x7ad5ce, 0.7),
          b = glow(0xd8ba8c, 0.65);
        const dot = ownGeometry(new SphereGeometry(0.11, 10, 6));
        const strands = [new InstancedMesh(dot, b, 44), new InstancedMesh(dot, a, 44)];
        const rungGeometry = ownGeometry(new CylinderGeometry(0.035, 0.035, 1.5, 18));
        const rungs = [
          new InstancedMesh(rungGeometry, standard(0xb19b7d, 0.2), 11),
          new InstancedMesh(rungGeometry, standard(0x75a7b6, 0.2), 11),
        ];
        const transform = new Object3D();
        g.add(...strands, ...rungs);
        for (let i = 0; i < 44; i++) {
          const t = i * 0.28,
            y = i * 0.12 - 2.5;
          for (let strand = 0; strand < 2; strand++) {
            const angle = t + strand * Math.PI;
            transform.position.set(Math.sin(angle) * 0.75, y, Math.cos(angle) * 0.75);
            transform.rotation.set(0, 0, 0);
            transform.updateMatrix();
            strands[strand].setMatrixAt(i, transform.matrix);
          }
          if (i % 2 === 0) {
            transform.position.set(0, y, 0);
            transform.rotation.set(0, t, Math.PI / 2);
            transform.updateMatrix();
            rungs[(i / 2) % 2].setMatrixAt(Math.floor(i / 4), transform.matrix);
          }
        }
        for (const batch of [...strands, ...rungs]) batch.instanceMatrix.needsUpdate = true;
        ring(g, accent, 0, -2.65, 0, 1.05, 0.04);
        label(g, 'DNA / HOLOGRAM', 0, -2.3, 0.9, 1.6);
      } else if (d.kind === 'tank') {
        cylinder(g, dark, 0, 0.15, 0, 0.8, 0.3);
        cylinder(g, dark, 0, 3, 0, 0.8, 0.25);
        const glass = standard(0x69aeb5, 0.1, 0.18);
        glass.transparent = true;
        glass.opacity = 0.27;
        glass.depthWrite = false;
        cylinder(g, glass, 0, 1.65, 0, 0.72, 2.7);
        ball(g, accent, 0, 1.6, 0, 0.38);
        ring(g, accent, 0, 0.35, 0, 0.76, 0.025);
      } else {
        for (let i = 0; i < 5; i++) {
          const r = ring(g, accent, 0, 0.3 + i * 0.3, 0, 0.6 + i * 0.12, 0.035);
          r.rotation.z = i * 0.3;
        }
        cylinder(g, dark, 0, 0.1, 0, 1.2, 0.2);
        label(g, 'SIGNAL / HOLOGRAM', 0, 1.1, 1, 2);
      }
    }
    for (const id of WEAPON_IDS) buildGun(id);
    const fxGeometry = ownGeometry(new SphereGeometry(1, 10, 6));
    for (let i = 0; i < TUNING.maxEffects; i++) {
      const m = mesh(fxGeometry, glow(0x96dfd7, 0.7), world);
      m.visible = false;
      effects.push(m);
    }
    const points = [];
    for (let i = 0; i < 100; i++)
      points.push(Math.sin(i * 37.1) * 18, 1 + ((i * 0.73) % 8), Math.cos(i * 19.7) * 20);
    const geometry = ownGeometry(new BufferGeometry());
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    const mat = new PointsMaterial({
      color: 0xa4c5c8,
      size: 0.035,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    materials.add(mat);
    dust = new Points(geometry, mat);
    world.add(dust);
  }
  function resize() {
    if (disposed || lost) return;
    const rect = canvas.getBoundingClientRect(),
      width = Math.max(1, Math.round(rect.width)),
      height = Math.max(1, Math.round(rect.height));
    const coarse = matchMedia('(pointer: coarse)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75) * quality;
    const targetWidth = Math.round(width * dpr),
      targetHeight = Math.round(height * dpr);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      gl.setPixelRatio(dpr);
      gl.setSize(width, height, false);
    }
    camera.aspect = viewCamera.aspect = width / height;
    camera.updateProjectionMatrix();
    viewCamera.updateProjectionMatrix();
  }
  const lostHandler = (event: Event) => {
    event.preventDefault();
    lost = true;
    canvas.dispatchEvent(
      new CustomEvent('proof:context', { detail: { lost: true }, bubbles: true })
    );
  };
  const restoredHandler = () => {
    lost = false;
    lastTime = 0;
    resize();
    canvas.dispatchEvent(
      new CustomEvent('proof:context', { detail: { lost: false }, bubbles: true })
    );
  };
  canvas.addEventListener('webglcontextlost', lostHandler);
  canvas.addEventListener('webglcontextrestored', restoredHandler);
  function draw(settings: ArcadeSettings, reduced: boolean, timestamp: number, alpha: number) {
    if (disposed || lost) return;
    const s = getState();
    if (currentLevel !== s.level) build(s);
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (settings.graphics !== lastGraphics) {
      lastGraphics = settings.graphics;
      quality =
        settings.graphics === 'low' ? 0.85 : settings.graphics === 'high' ? 1 : coarse ? 0.9 : 1;
      resize();
    }
    gl.shadowMap.enabled = settings.graphics !== 'low' && !coarse && quality > 0.85;
    key.castShadow = gl.shadowMap.enabled;
    if (previousPalette !== settings.palette) {
      previousPalette = settings.palette;
      const colors = [s.level.color, 0x70bdf1, 0xf3c17f, 0xc5a4f2];
      accent.color.setHex(colors[settings.palette]);
      accent.emissive.copy(accent.color);
    }
    const t = s.status === 'playing' ? Math.max(0, Math.min(1, alpha)) : 1;
    camera.position.set(
      s.player.previous.x + (s.player.position.x - s.player.previous.x) * t,
      s.player.previous.y + (s.player.position.y - s.player.previous.y) * t + TUNING.eyeHeight,
      s.player.previous.z + (s.player.position.z - s.player.previous.z) * t
    );
    camera.rotation.set(s.player.pitch, -s.player.yaw, 0, 'YXZ');
    // Three's camera looks down -Z; positive gameplay pitch looks up.
    camera.rotation.x = s.player.pitch;
    if (camera.fov !== settings.fov) {
      camera.fov = settings.fov;
      camera.updateProjectionMatrix();
    }
    const active = new Set(s.enemies.map((e) => e.id));
    for (const [id, a] of actors)
      if (!active.has(id)) {
        a.group.visible = false;
        const entries = pool.get(a.kind) ?? [];
        entries.push(a);
        pool.set(a.kind, entries);
        actors.delete(id);
      }
    for (const enemy of s.enemies) {
      let a = actors.get(enemy.id);
      if (!a) {
        a = pool.get(enemy.kind)?.pop() ?? buildActor(enemy.kind);
        actors.set(enemy.id, a);
        a.group.visible = true;
      }
      a.group.position.set(
        enemy.previous.x + (enemy.position.x - enemy.previous.x) * t,
        enemy.previous.y + (enemy.position.y - enemy.previous.y) * t,
        enemy.previous.z + (enemy.position.z - enemy.previous.z) * t
      );
      a.group.rotation.y = -enemy.yaw;
      a.warning.visible = enemy.attacking;
      a.warning.scale.setScalar(0.8 + Math.max(0, enemy.windup) * 0.2);
      const coreMat = a.core.material as MeshBasicMaterial;
      coreMat.color.setHex(
        enemy.kind === 'guardian' && !s.mission.objectives.includes(enemy.phase + 1)
          ? 0x506c8d
          : enemy.hurtFor > 0
            ? 0xffd2a4
            : enemy.kind === 'charger'
              ? 0xeeba70
              : 0xf58f86
      );
      for (let i = 0; i < a.parts.length; i++) {
        const p = a.parts[i];
        if (enemy.kind === 'guardian')
          p.rotation.y = reduced ? i * 0.4 : s.time * (0.3 + i * 0.1) * (i % 2 ? -1 : 1);
        else if (enemy.kind === 'flyer') p.rotation.y = reduced ? 0 : s.time * 5;
        else
          p.rotation.x = reduced
            ? 0
            : Math.sin(s.time * 7 + i * 2) *
              Math.min(0.2, Math.hypot(enemy.velocity.x, enemy.velocity.z) * 0.06);
      }
    }
    for (let i = 0; i < objectives.length; i++) {
      const complete = s.mission.objectives.includes(s.level.objectives[i].id);
      objectives[i].scale.y = complete ? 0.8 : 1;
    }
    for (let i = 0; i < crates.length; i++) crates[i].visible = (s.mission.crates[i]?.hp ?? 0) > 0;
    for (let i = 0; i < doors.length; i++) {
      const fraction = doorOpenFraction(s, i),
        d = s.level.doors[i];
      doors[i].visible = fraction < 1;
      doors[i].position.y = d.position.y + (d.size.y + 0.4) * fraction;
    }
    for (let i = 0; i < hazards.length; i++) {
      const phase = hazardPhase(s, i),
        mat = hazards[i].material as MeshBasicMaterial;
      mat.color.setHex(phase === 'active' ? 0xe57460 : phase === 'warning' ? 0xf6c57f : 0x487281);
      mat.opacity = phase === 'active' ? 0.85 : phase === 'warning' ? 0.45 : 0.16;
    }
    const livePickups = new Set(s.pickups.map((p) => p.id));
    for (const [id, g] of pickups)
      if (!livePickups.has(id)) {
        g.visible = false;
        pickupPool.push(g);
        pickups.delete(id);
      }
    for (const item of s.pickups) {
      let g = pickups.get(item.id);
      if (!g) {
        g = pickupPool.pop();
        if (!g) {
          g = new Group();
          world.add(g);
          rounded(g, glow(0x96dfab), 0, 0, 0, 0.34, 0.34, 0.34);
        }
        g.visible = true;
        ((g.children[0] as Mesh).material as MeshBasicMaterial).color.setHex(
          item.kind === 'health' ? 0x96dfab : s.level.color
        );
        pickups.set(item.id, g);
      }
      g.position.set(
        item.position.x,
        item.position.y + 0.45 + (reduced ? 0 : Math.sin(s.time * 2 + item.id) * 0.045),
        item.position.z
      );
      g.rotation.y = reduced ? 0 : s.time * 0.5;
    }
    const liveProjectiles = new Set(s.projectiles.map((p) => p.id));
    for (const [id, m] of projectiles)
      if (!liveProjectiles.has(id)) {
        m.visible = false;
        projectilePool.push(m);
        projectiles.delete(id);
      }
    for (const p of s.projectiles) {
      let m = projectiles.get(p.id);
      if (!m) {
        m = projectilePool.pop() ?? ball(world, glow(0xf3a07f), 0, 0, 0, 1);
        m.visible = true;
        m.scale.setScalar(p.hostile ? 0.13 : 0.2);
        (m.material as MeshBasicMaterial).color.setHex(p.hostile ? 0xf3a07f : 0xb5a3f5);
        projectiles.set(p.id, m);
      }
      m.position.set(
        p.previous.x + (p.position.x - p.previous.x) * t,
        p.previous.y + (p.position.y - p.previous.y) * t,
        p.previous.z + (p.position.z - p.previous.z) * t
      );
    }
    const effectList = settings.graphics === 'low' ? s.effects.slice(-16) : s.effects;
    for (let i = 0; i < effects.length; i++) {
      const m = effects[i],
        e = effectList[i];
      m.visible = Boolean(e);
      if (!e) continue;
      const progress = 1 - e.life / e.duration;
      m.position.set(e.position.x, e.position.y, e.position.z);
      const mat = m.material as MeshBasicMaterial;
      mat.color.setHex(e.hostile ? 0xf19d83 : e.kind === 'blast' ? 0xc9a8ed : 0xa4e7d7);
      mat.opacity = (1 - progress) * 0.7;
      if (e.kind === 'tracer') {
        const end = new Vector3(e.end.x, e.end.y, e.end.z),
          begin = new Vector3(e.position.x, e.position.y, e.position.z);
        m.position.add(end).multiplyScalar(0.5);
        m.scale.set(0.012, Math.max(0.01, begin.distanceTo(end) / 2), 0.012);
        m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), end.sub(begin).normalize());
      } else {
        m.quaternion.identity();
        m.scale.setScalar(
          e.kind === 'blast' ? 0.12 + progress * (reduced ? 0.25 : 0.8) : 0.045 + progress * 0.08
        );
      }
    }
    for (const [id, g] of guns) {
      g.visible = id === s.player.weapon;
    }
    const motion = reduced ? 0 : settings.motion,
      velocity = Math.hypot(s.player.velocity.x, s.player.velocity.z),
      reload = s.player.reloading / [1.2, 1.6, 1.8][WEAPON_IDS.indexOf(s.player.weapon)];
    weaponRoot.position.set(
      0.3 + Math.sin(s.time * 5) * velocity * 0.001 * motion,
      -0.24 + Math.cos(s.time * 10) * velocity * 0.001 * motion,
      -0.95 + s.muzzleFor * 0.35
    );
    weaponRoot.rotation.set(
      -Math.sin(reload * Math.PI) * 0.45,
      0,
      -Math.sin(reload * Math.PI) * 0.45
    );
    const wall = rayDistance(
      compileWorld(s.level),
      eyePosition(s),
      direction(s.player.yaw, s.player.pitch),
      0.7
    );
    weaponRoot.position.z += Math.max(0, 0.65 - wall) * 0.5;
    if (dust) {
      dust.visible = !reduced && settings.graphics !== 'low';
      dust.rotation.y = motion * s.time * 0.003;
    }
    gl.info.reset();
    gl.clear();
    gl.render(scene, camera);
    gl.clearDepth();
    gl.render(view, viewCamera);
    frames++;
    if (
      lastTime &&
      timestamp - lastTime > 8 &&
      timestamp - lastTime < 100 &&
      s.status === 'playing'
    ) {
      frameAverage = frameAverage * 0.98 + (timestamp - lastTime) * 0.02;
      samples++;
      if (
        settings.graphics === 'auto' &&
        samples > 180 &&
        frameAverage > (coarse ? 37 : 23) &&
        quality > 0.75
      ) {
        quality = Math.max(0.75, quality - 0.1);
        samples = 0;
        resize();
      }
    }
    lastTime = timestamp;
  }
  function eyePosition(s: GameState) {
    return add(s.player.position, v3(0, TUNING.eyeHeight, 0));
  }
  return {
    draw,
    resize,
    stats: () => ({
      frames,
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      width: canvas.width,
      height: canvas.height,
      quality,
      lost,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lostHandler);
      canvas.removeEventListener('webglcontextrestored', restoredHandler);
      cleanupLevel();
      key.shadow.map?.dispose();
      gl.dispose();
      gl.forceContextLoss();
    },
  };
}
