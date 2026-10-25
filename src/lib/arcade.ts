/** Campaign identity, challenge links and browser-independent progress rules. */
export type ArcadeGame = 'proofreader' | 'proofreader-classic' | 'snake' | 'jetpack';
export type ArcadeMode = 'campaign' | 'classic' | 'practice' | 'motif';
export type Difficulty = 'standard' | 'expert';
export type RunStatus = 'ready' | 'playing' | 'paused' | 'won' | 'over';
export interface RunOptions {
  mode: ArcadeMode;
  difficulty: Difficulty;
  stage: number;
  seed: number;
}
export interface CampaignStage {
  name: string;
  lesson: string;
  goal: number;
  par: number;
  seed: number;
}
export const RULES_VERSION = 2;
export const rulesVersion = (game: ArcadeGame): 2 | 3 => (game === 'proofreader' ? 3 : 2);
/** Shared controls and medals, not shared maps, rules, scores, or renderer. */
export const isProofreader = (game: ArcadeGame): boolean =>
  game === 'proofreader' || game === 'proofreader-classic';
export const CAMPAIGNS: Record<ArcadeGame, readonly CampaignStage[]> = {
  // Preserved v2 campaign, before the true-3D rewrite (de01fa48).
  'proofreader-classic': [
    {
      name: 'Replication Fork',
      lesson: 'Clear the sentries, collect supplies, then find the exit.',
      goal: 4,
      par: 100,
      seed: 2101,
    },
    {
      name: 'Cover Circuit',
      lesson: 'Break line of sight before a charging insertion commits.',
      goal: 6,
      par: 120,
      seed: 2102,
    },
    {
      name: 'Gap Chamber',
      lesson: 'Read deletion projectiles and use pillars as cover.',
      goal: 7,
      par: 140,
      seed: 2103,
    },
    {
      name: 'Supply Run',
      lesson: 'Activate two supply relays and clear two waves.',
      goal: 8,
      par: 160,
      seed: 2104,
    },
    {
      name: 'Signal Lock',
      lesson: 'Activate three relays while clearing three mixed waves.',
      goal: 15,
      par: 180,
      seed: 2105,
    },
    {
      name: 'Fidelity Core',
      lesson: 'Break the guardian during each exposed phase; cover blocks its shots.',
      goal: 1,
      par: 210,
      seed: 2106,
    },
  ],
  proofreader: [
    {
      name: 'Replication Fork',
      lesson: 'Explore two floors, clear the fork, and activate the bridge console.',
      goal: 6,
      par: 300,
      seed: 2101,
    },
    {
      name: 'Cover Circuit',
      lesson: 'Use the maintenance ring to flank sentries and restore both relays.',
      goal: 7,
      par: 360,
      seed: 2102,
    },
    {
      name: 'Gap Chamber',
      lesson: 'Restore bridge power, climb to the observatory, and stabilize the reactor.',
      goal: 12,
      par: 420,
      seed: 2103,
    },
    {
      name: 'Supply Run',
      lesson: 'Recover three supply packets across the archive and return to the airlock.',
      goal: 15,
      par: 420,
      seed: 2104,
    },
    {
      name: 'Signal Lock',
      lesson: 'Disable two emitters across three floors, then survive the 45-second lockdown.',
      goal: 24,
      par: 480,
      seed: 2105,
    },
    {
      name: 'Fidelity Core',
      lesson: 'Disable one shield relay per guardian phase, using all three levels for cover.',
      goal: 13,
      par: 480,
      seed: 2106,
    },
  ],
  snake: [
    {
      name: 'Starter Garden',
      lesson: 'Collect eight bases. The walls are solid.',
      goal: 8,
      par: 45,
      seed: 3101,
    },
    {
      name: 'Pillar Field',
      lesson: 'Plan around four islands; leave room for your tail.',
      goal: 12,
      par: 60,
      seed: 3102,
    },
    {
      name: 'Loop Circuit',
      lesson: 'Edge arrows connect opposite sides of the arena.',
      goal: 16,
      par: 75,
      seed: 3103,
    },
    {
      name: 'Split Lab',
      lesson: 'Connected lanes reward planning more than fast turns.',
      goal: 20,
      par: 90,
      seed: 3104,
    },
    {
      name: 'Switchback',
      lesson: 'Read the corners and keep a return route open.',
      goal: 24,
      par: 105,
      seed: 3105,
    },
    {
      name: 'Master Garden',
      lesson: 'Use wraparound lanes to manage a long strand.',
      goal: 28,
      par: 120,
      seed: 3106,
    },
  ],
  jetpack: [
    {
      name: 'Launch Bay',
      lesson: 'Hold to rise, release to fall. Follow the base arcs.',
      goal: 60,
      par: 12,
      seed: 4101,
    },
    {
      name: 'Zapper Alley',
      lesson: 'Look ahead and take the open side of each barrier.',
      goal: 70,
      par: 18,
      seed: 4102,
    },
    {
      name: 'Beam Works',
      lesson: 'A striped warning is harmless; move before the beam becomes solid.',
      goal: 80,
      par: 24,
      seed: 4103,
    },
    {
      name: 'Missile Tunnel',
      lesson: 'The aiming marker follows you, then locks before launch.',
      goal: 90,
      par: 30,
      seed: 4104,
    },
    {
      name: 'Rotor Garden',
      lesson: 'Read the rotor tips and collect shields on safe approaches.',
      goal: 100,
      par: 36,
      seed: 4105,
    },
    {
      name: 'Exit Vector',
      lesson: 'A final sequence combines the patterns you have learned.',
      goal: 110,
      par: 42,
      seed: 4106,
    },
  ],
};

export function parseRunOptions(
  game: ArcadeGame,
  query: string,
  unlocked = 1,
  fallbackSeed = 1
): RunOptions {
  unlocked = Number.isFinite(unlocked) ? Math.max(1, Math.min(6, Math.trunc(unlocked))) : 1;
  const params = new URLSearchParams(query);
  const rawMode = params.get('mode');
  const modes: ArcadeMode[] =
    game === 'snake'
      ? ['campaign', 'classic', 'practice', 'motif']
      : ['campaign', 'classic', 'practice'];
  const mode = modes.includes(rawMode as ArcadeMode)
    ? (rawMode as ArcadeMode)
    : params.has('seed')
      ? 'classic'
      : 'campaign';
  const stage = Math.max(
    1,
    Math.min(6, Number.parseInt(params.get('stage') ?? String(unlocked), 10) || 1)
  );
  const permittedStage = mode === 'campaign' ? Math.min(stage, unlocked) : stage;
  const rawSeed = params.get('seed');
  const validSeed = rawSeed !== null && /^\d{1,10}$/.test(rawSeed) && Number(rawSeed) <= 0xffffffff;
  return {
    mode,
    stage: permittedStage,
    difficulty: params.get('difficulty') === 'expert' ? 'expert' : 'standard',
    seed:
      mode === 'campaign' || mode === 'practice'
        ? CAMPAIGNS[game][permittedStage - 1].seed
        : validSeed
          ? Number(rawSeed) >>> 0
          : fallbackSeed >>> 0,
  };
}

export interface RunResult {
  score: number;
  seconds: number;
  won: boolean;
  medals: [boolean, boolean, boolean];
  detail: string;
  /** A checkpoint clear unlocks a stage without adding ranked records or medals. */
  recordEligible?: boolean;
}
export interface RunRecord {
  score: number;
  seconds: number;
  medals: [boolean, boolean, boolean];
}
export interface ArcadeProgress {
  version: 2 | 3;
  unlocked: number;
  cleared: number[];
  records: Record<string, RunRecord>;
}
export const emptyProgress = (version: 2 | 3 = 2): ArcadeProgress => ({
  version,
  unlocked: 1,
  cleared: [],
  records: {},
});
const finite = (v: unknown, max = 1e9): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;

export function decodeProgress(raw: string | null, version: 2 | 3 = 2): ArcadeProgress {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || value.version !== version) return emptyProgress(version);
    const cleared: number[] = Array.isArray(value.cleared)
      ? [
          ...new Set<number>(
            value.cleared.filter(
              (n: unknown) => Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 6
            )
          ),
        ].sort((a, b) => a - b)
      : [];
    const records: Record<string, RunRecord> = {};
    if (value.records && typeof value.records === 'object') {
      for (const [key, record] of Object.entries(value.records).slice(0, 80)) {
        if (!/^(campaign|classic|motif):[1-6]:(standard|expert):(assisted|standard)$/.test(key))
          continue;
        const r = record as RunRecord;
        if (
          !r ||
          !finite(r.score) ||
          !finite(r.seconds, 86400) ||
          !Array.isArray(r.medals) ||
          r.medals.length !== 3 ||
          r.medals.some((v) => typeof v !== 'boolean')
        )
          continue;
        records[key] = { score: Math.floor(r.score), seconds: r.seconds, medals: [...r.medals] };
      }
    }
    let unlocked = 1;
    while (cleared.includes(unlocked) && unlocked < 6) unlocked++;
    return { version, unlocked, cleared, records };
  } catch {
    return emptyProgress(version);
  }
}

export function recordKey(options: RunOptions, assisted: boolean): string {
  return `${options.mode}:${options.mode === 'campaign' ? options.stage : 1}:${options.difficulty}:${assisted ? 'assisted' : 'standard'}`;
}

/** Return a new progress value. Practice never creates records or unlocks. */
export function recordResult(
  progress: ArcadeProgress,
  options: RunOptions,
  result: RunResult,
  assisted = false
): ArcadeProgress {
  if (options.mode === 'practice' || !finite(result.score) || !finite(result.seconds, 86400))
    return progress;
  const key = recordKey(options, assisted);
  const old = progress.records[key];
  const medals = result.medals.map((m, i) => Boolean(m || old?.medals[i])) as RunRecord['medals'];
  const record: RunRecord = {
    score: Math.max(old?.score ?? 0, Math.floor(result.score)),
    seconds: result.won ? Math.min(old?.seconds || Infinity, result.seconds) : (old?.seconds ?? 0),
    medals,
  };
  const cleared = [...progress.cleared];
  if (options.mode === 'campaign' && result.won && !cleared.includes(options.stage))
    cleared.push(options.stage);
  cleared.sort((a, b) => a - b);
  let unlocked = 1;
  while (cleared.includes(unlocked) && unlocked < 6) unlocked++;
  return {
    version: progress.version,
    cleared,
    unlocked,
    records:
      result.recordEligible === false
        ? { ...progress.records }
        : { ...progress.records, [key]: record },
  };
}

export function challengeUrl(path: string, options: RunOptions, version = RULES_VERSION): string {
  const params = new URLSearchParams({
    mode: options.mode,
    difficulty: options.difficulty,
    rules: String(version),
  });
  if (options.mode === 'campaign' || options.mode === 'practice')
    params.set('stage', String(options.stage));
  else params.set('seed', String(options.seed));
  return `${path}?${params}`;
}
