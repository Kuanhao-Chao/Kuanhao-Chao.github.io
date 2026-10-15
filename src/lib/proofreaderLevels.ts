import { v3, type Solid, type Vec3 } from './proofreaderWorld';

export type EnemyKind = 'scout' | 'charger' | 'sentry' | 'flyer' | 'guardian';
export interface EncounterDefinition {
  id: number;
  trigger: Vec3;
  radius: number;
  enemies: { kind: EnemyKind; position: Vec3 }[];
}
export interface ObjectiveDefinition {
  id: number;
  position: Vec3;
  label: string;
  kind: 'relay' | 'packet' | 'shield';
  requires?: number;
}
export interface ProofLevel {
  id: number;
  name: string;
  subtitle: string;
  color: number;
  floors: number;
  spawn: Vec3;
  exit: Vec3;
  solids: Solid[];
  objectives: ObjectiveDefinition[];
  encounters: EncounterDefinition[];
  checkpoints: Vec3[];
  terminals: Vec3[];
  crates: Vec3[];
  doors: { position: Vec3; size: Vec3; relay: number }[];
  hazards: { position: Vec3; size: Vec3; period: number; offset: number; kind: 'vent' | 'beam' }[];
  decor: { kind: 'dna' | 'tank' | 'tree' | 'antenna'; position: Vec3; scale: number }[];
}
const names = [
  'Replication Fork',
  'Cover Circuit',
  'Gap Chamber',
  'Supply Run',
  'Signal Lock',
  'Fidelity Core',
];
const subtitles = [
  'Replication atrium / induction',
  'Maintenance ring / flank routes',
  'Bioreactor / containment',
  'Nucleotide archive / recovery',
  'Signal observatory / lockdown',
  'Proofreading nexus / guardian',
];
const colors = [0x55d9c2, 0x67b6ef, 0xc297ef, 0xf4bc70, 0x8cce9b, 0xf19e89];

export function createLevel(stage = 1): ProofLevel {
  const id = Math.max(1, Math.min(6, Math.trunc(stage) || 1));
  const solids: Solid[] = [];
  const box = (
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    surface: Solid['surface'],
    walkable = false
  ) => {
    solids.push({
      id: name,
      kind: 'box',
      position: v3(x, y, z),
      size: v3(w, h, d),
      surface,
      walkable,
    });
  };
  box('foundation', 0, -0.25, 0, 40, 0.5, 44, 'floor', true);
  box('west-shell', -20.3, 5, 0, 0.6, 10, 44, 'wall');
  box('east-shell', 20.3, 5, 0, 0.6, 10, 44, 'wall');
  box('north-shell', 0, 5, -22.3, 41, 10, 0.6, 'wall');
  box('south-shell', 0, 5, 22.3, 41, 10, 0.6, 'wall');
  box('roof', 0, 10.65, 0, 40, 0.3, 44, 'wall');
  for (const z of [-16, -8, 0, 8, 16]) box(`ceiling-beam-${z}`, 0, 10.1, z, 40, 0.5, 0.45, 'wall');
  // Independent side decks and a cross bridge leave a real, traversable ground floor below.
  box('west-deck', -13, 3.45, -3, 10, 0.3, 24, 'deck', true);
  box('east-deck', 13, 3.45, -3, 10, 0.3, 24, 'deck', true);
  const bridgeZ = [-4, 2, -8, -2, 4, -6][id - 1];
  box('cross-bridge', 0, 3.45, bridgeZ, 16, 0.3, id === 2 ? 6 : 4, 'deck', true);
  for (const x of [-13, 13]) {
    if (x === 13 && (id === 2 || id === 4)) {
      for (let i = 0; i < 18; i++) {
        const h = (i + 1) * 0.2;
        box(`east-stair-${i}`, x, h / 2, 17 - ((i + 0.5) * 8) / 18, 4, h, 8 / 18, 'ramp', true);
      }
      continue;
    }
    solids.push({
      id: `ramp-${x}`,
      kind: 'ramp',
      position: v3(x, 0, 13),
      size: v3(4, 3.6, 8),
      surface: 'ramp',
      walkable: true,
    });
  }
  if (id >= 3) {
    box('upper-observatory', 0, 7.05, -17.5, 36, 0.3, 7, 'deck', true);
    for (const x of [-13, 13])
      solids.push({
        id: `upper-ramp-${x}`,
        kind: 'ramp',
        position: v3(x, 3.6, -10),
        size: v3(4, 3.6, 8),
        surface: 'ramp',
        walkable: true,
      });
  }
  // Tall partitions divide rooms but always leave two independent flanking passages.
  if (id === 1) {
    box('fork-divider', 0, 1.3, 6, 1.4, 2.6, 10, 'wall');
    box('fork-cover-left', -5, 0.6, 0, 3, 1.2, 2, 'cover');
    box('fork-cover-right', 5, 0.6, -8, 3, 1.2, 2, 'cover');
  } else if (id === 2) {
    box('ring-core', 0, 1.6, 0, 7, 3.2, 9, 'wall');
    box('ring-upper-core', 0, 5.1, 2, 3, 3, 2, 'glass');
  } else if (id === 3) {
    box('reactor-base', 0, 1.3, -2, 5, 2.6, 5, 'cover');
    for (const x of [-7, 7]) box(`reactor-screen-${x}`, x, 1.2, 8, 3, 2.4, 1, 'glass');
  } else if (id === 4) {
    for (const x of [-5, 5])
      for (const z of [-10, 2, 10]) box(`archive-${x}-${z}`, x, 1.3, z, 3, 2.6, 5, 'wall');
    for (const x of [-16, 16]) box(`upper-shelf-${x}`, x, 4.35, -1, 2, 1.5, 4, 'cover');
  } else if (id === 5) {
    box('control-dais', 0, 0.5, -2, 6, 1, 6, 'cover', true);
    for (const x of [-5, 5])
      for (const z of [-10, 9]) box(`control-screen-${x}-${z}`, x, 1.1, z, 2, 2.2, 2, 'glass');
  } else {
    for (const x of [-6, 6])
      for (const z of [-10, 3]) box(`core-cover-${x}-${z}`, x, 0.75, z, 2.5, 1.5, 2.5, 'cover');
  }
  // Handrails guard outer deck edges; gaps at ramps and bridges stay open.
  for (const x of [-18, 18]) box(`outer-rail-${x}`, x, 4.1, -3, 0.12, 1, 24, 'cover');
  // Ground-level landmarks are intentionally out of the main navigation lanes.
  const decor: ProofLevel['decor'] = [
    { kind: 'dna', position: v3(0, id === 1 ? 5.8 : 5.4, -9), scale: 1.25 },
    { kind: 'tank', position: v3(-17, 0, 3), scale: 1 },
    { kind: 'tank', position: v3(17, 0, -7), scale: 1 },
    { kind: id === 5 ? 'antenna' : 'tree', position: v3(0, id >= 3 ? 7.2 : 0, -19), scale: 1.1 },
  ];
  for (const d of decor)
    if (d.kind === 'tank')
      box(`tank-case-${d.position.x}`, d.position.x, 1.6, d.position.z, 1.8, 3.2, 1.8, 'glass');
  const objectivePositions: Vec3[][] = [
    [v3(0, 3.6, -4)],
    [v3(-13, 3.6, -9), v3(13, 3.6, -9)],
    [v3(-13, 3.6, -3), v3(0, 7.2, -18)],
    [v3(-13, 3.6, -8), v3(13, 3.6, 4), v3(0, 7.2, -18)],
    [v3(-13, 3.6, -3), v3(0, 7.2, -18)],
    [v3(-13, 3.6, 3), v3(13, 3.6, -3), v3(0, 7.2, -18)],
  ];
  const objectives: ObjectiveDefinition[] = objectivePositions[id - 1].map((position, i) => ({
    id: i + 1,
    position,
    label:
      id === 4
        ? `Supply packet ${i + 1}`
        : id === 6
          ? `Shield relay ${i + 1}`
          : id === 3 && i === 1
            ? 'Reactor stabilizer'
            : `Relay ${i + 1}`,
    kind: id === 4 ? 'packet' : id === 6 ? 'shield' : 'relay',
    requires: id === 3 && i === 1 ? 1 : undefined,
  }));
  const makeEnemies = (positions: Vec3[], kinds: EnemyKind[]) =>
    positions.map((position, i) => ({ position, kind: kinds[i % kinds.length] }));
  const encounters: EncounterDefinition[] = [
    {
      id: 1,
      trigger: v3(0, 0, 14),
      radius: 7,
      enemies: makeEnemies(
        [v3(-7, 0, 7), v3(7, 0, 5), v3(-3, 0, -3), ...(id > 1 ? [v3(9, 0, -7)] : [])],
        id === 1 ? ['scout'] : ['scout', 'charger', 'sentry']
      ),
    },
    {
      id: 2,
      trigger: v3(-13, 3.6, 5),
      radius: 6,
      enemies: makeEnemies(
        [
          v3(-13, 3.6, -6),
          v3(13, 3.6, -4),
          v3(13, 3.6, 6),
          ...(id > 2 ? [v3(-3, 4.5, -8), v3(5, 5.3, -10)] : []),
        ],
        id === 1 ? ['scout'] : id === 2 ? ['charger', 'sentry'] : ['sentry', 'charger', 'flyer']
      ),
    },
  ];
  if (id >= 3)
    encounters.push({
      id: 3,
      trigger: v3(-13, 3.6, -4),
      radius: 7,
      enemies: makeEnemies(
        [v3(-8, 7.2, -18), v3(8, 7.2, -18), v3(0, 8.2, -15)],
        ['scout', 'sentry', 'flyer']
      ),
    });
  if (id === 4 || id === 5)
    encounters.push({
      id: 4,
      trigger: v3(13, 3.6, -4),
      radius: 5,
      enemies: makeEnemies(
        [v3(13, 3.6, 1), v3(9, 0, -16), v3(-9, 0, -16)],
        ['charger', 'scout', 'sentry']
      ),
    });
  if (id === 6)
    encounters.push({
      id: 4,
      trigger: v3(0, 0, -13),
      radius: 8,
      enemies: [{ kind: 'guardian', position: v3(0, 0, -13) }],
    });
  return {
    id,
    name: names[id - 1],
    subtitle: subtitles[id - 1],
    color: colors[id - 1],
    floors: id >= 3 ? 3 : 2,
    spawn: v3(0, 0.02, 18),
    exit: v3(0, 0, id === 4 ? 19 : -19.5),
    solids,
    objectives,
    encounters,
    checkpoints: [v3(-13, 3.6, 7), ...(id >= 3 ? [v3(0, 7.2, -19)] : [])],
    terminals: [v3(-3, 0, 18), v3(-15, 3.6, 7), ...(id >= 3 ? [v3(0, 7.2, -20)] : [])],
    crates: [v3(-17, 0, 16), v3(17, 0, 16), v3(-16, 3.6, -12), v3(16, 3.6, -12)],
    doors: [{ position: v3(8, 1.4, -12), size: v3(0.45, 2.8, 4), relay: 1 }],
    hazards:
      id < 3
        ? []
        : [
            {
              position: v3(5, 0.04, -5),
              size: v3(3, 0.08, 3),
              period: 6,
              offset: id,
              kind: 'vent',
            },
            {
              position: v3(-4, 0.8, -12),
              size: v3(0.15, 1.6, 4),
              period: 7,
              offset: 2,
              kind: 'beam',
            },
          ],
    decor,
  };
}
