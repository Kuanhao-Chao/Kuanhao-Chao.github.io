import type { GameState, RunMode, RunOptions } from './floorDescent';
export const RULES_VERSION = 1;
export function readChallenge(search: string, fallbackSeed: number) {
  const q = new URLSearchParams(search),
    m = q.get('mode'),
    raw = q.get('seed') ?? '';
  const mode: RunOptions['mode'] =
    m === 'trial' || m === 'remix' || m === 'practice' ? m : 'classic';
  const seed =
    /^\d{1,10}$/.test(raw) && Number(raw) <= 4294967295 ? Number(raw) : fallbackSeed >>> 0;
  const floor = Number(q.get('start'));
  return {
    options: {
      mode,
      seed,
      startFloor: mode === 'practice' && [0, 20, 40, 60, 80].includes(floor) ? floor : 0,
    },
    unsupported: q.has('rules') && q.get('rules') !== String(RULES_VERSION),
  };
}
export function challengeQuery(o: RunOptions) {
  const q = new URLSearchParams({
    mode: o.mode,
    seed: String(o.seed >>> 0),
    rules: String(RULES_VERSION),
  });
  if (o.mode === 'practice') q.set('start', String(o.startFloor ?? 0));
  return `?${q}`;
}
export interface Settings {
  locale: 'en' | 'zh-Hant';
  sound: boolean;
  touch: 'buttons' | 'halves';
  reducedEffects: boolean;
}
interface RecordEntry {
  floor: number;
  seconds: number;
  seed: number;
}
interface Records {
  classic: RecordEntry | null;
  remix: RecordEntry | null;
  trials: RecordEntry[];
}
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'khc-floor-descent-v1-';
const valid = (r: unknown): r is RecordEntry =>
  !!r &&
  typeof r === 'object' &&
  Number.isInteger((r as RecordEntry).floor) &&
  (r as RecordEntry).floor >= 0 &&
  (r as RecordEntry).floor <= 1e6 &&
  Number.isFinite((r as RecordEntry).seconds) &&
  (r as RecordEntry).seconds >= 0 &&
  (r as RecordEntry).seconds <= 86400 &&
  Number.isInteger((r as RecordEntry).seed) &&
  (r as RecordEntry).seed >= 0 &&
  (r as RecordEntry).seed <= 4294967295;
/** A single storage adapter: browser storage is optional; session memory always works. */
export function createSaveStore(storage: StoragePort | null) {
  const settings: Settings = {
    locale: 'en',
    sound: false,
    touch: 'buttons',
    reducedEffects: false,
  };
  const records: Records = { classic: null, remix: null, trials: [] };
  let available = !!storage;
  const read = (key: string) => {
    let raw: string | null;
    try {
      raw = storage?.getItem(KEY + key) ?? null;
    } catch {
      available = false;
      return null;
    }
    try {
      return JSON.parse(raw ?? 'null');
    } catch {
      return null;
    }
  };
  const write = (key: string, value: unknown) => {
    try {
      if (storage) storage.setItem(KEY + key, JSON.stringify(value));
    } catch {
      available = false;
    }
  };
  const configure = (patch: Partial<Settings>, persist = true) => {
    if (patch.locale === 'en' || patch.locale === 'zh-Hant') settings.locale = patch.locale;
    if (typeof patch.sound === 'boolean') settings.sound = patch.sound;
    if (patch.touch === 'buttons' || patch.touch === 'halves') settings.touch = patch.touch;
    if (typeof patch.reducedEffects === 'boolean') settings.reducedEffects = patch.reducedEffects;
    if (persist) write('settings', settings);
  };
  const loaded = read('settings');
  if (loaded && typeof loaded === 'object') configure(loaded, false);
  const old = read('records');
  if (old && typeof old === 'object') {
    if (valid(old.classic)) records.classic = old.classic;
    if (valid(old.remix)) records.remix = old.remix;
    if (Array.isArray(old.trials))
      records.trials = old.trials
        .filter((r: unknown) => valid(r) && (r as RecordEntry).floor === 100)
        .slice(-24);
  }
  return {
    settings,
    get available() {
      return available;
    },
    configure,
    best(mode: RunMode, seed: number): RecordEntry | null {
      if (mode === 'practice') return null;
      return mode === 'trial'
        ? (records.trials.find((r) => r.seed === seed) ?? null)
        : records[mode];
    },
    record(s: GameState) {
      if (s.options.mode === 'practice' || !['over', 'won'].includes(s.status)) return;
      const r = { floor: s.floor, seconds: s.time, seed: s.options.seed };
      if (!valid(r)) return;
      if (s.options.mode === 'trial') {
        if (s.status !== 'won' || s.floor !== 100) return;
        const previous = records.trials.find((p) => p.seed === r.seed);
        if (previous && previous.seconds <= r.seconds) return;
        records.trials = records.trials
          .filter((p) => p.seed !== r.seed)
          .concat(r)
          .slice(-24);
      } else {
        const previous = records[s.options.mode];
        if (
          previous &&
          (previous.floor > r.floor ||
            (previous.floor === r.floor && previous.seconds >= r.seconds))
        )
          return;
        records[s.options.mode] = r;
      }
      write('records', records);
    },
  };
}
export function formatTime(seconds: number) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(safe / 60)}:${(safe % 60).toFixed(1).padStart(4, '0')}`;
}
