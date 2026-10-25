/** Browser-independent save identity and a non-destructive copy of the original v2 edition. */
import { decodeProgress, rulesVersion, type ArcadeGame } from './arcade';

export function arcadeStorageKeys(game: ArcadeGame) {
  const version = rulesVersion(game);
  return {
    progress: `khc-arcade-${game}-v${version}`,
    settings: `khc-arcade-${game}-settings-v${version}`,
  };
}

type Read = (key: string) => string | null;
type Write = (key: string, value: string) => boolean;

function classicSettings(value: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  for (const key of ['sound', 'assist', 'toggle'])
    if (typeof value[key] === 'boolean') clean[key] = value[key];
  for (const [key, min, max] of [
    ['volume', 0, 1],
    ['palette', 0, 3],
    ['speed', 0.5, 1],
    ['sensitivity', 0.5, 2],
    ['deadZone', 4, 24],
  ] as const) {
    const n = value[key];
    if (
      typeof n === 'number' &&
      Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (key !== 'palette' || Number.isInteger(n))
    )
      clean[key] = n;
  }
  if (value.bindings && typeof value.bindings === 'object' && !Array.isArray(value.bindings)) {
    const bindings: Record<string, string> = {};
    for (const action of [
      'forward',
      'back',
      'left',
      'right',
      'turnLeft',
      'turnRight',
      'fire',
      'pulse',
    ]) {
      const key = (value.bindings as Record<string, unknown>)[action];
      if (typeof key !== 'string' || !key.length || key.length > 20) continue;
      const normalized = key.length === 1 ? key.toLowerCase() : key;
      if (!['Escape', 'Enter', 'Tab', 'p'].includes(normalized)) bindings[action] = normalized;
    }
    if (Object.keys(bindings).length) clean.bindings = bindings;
  }
  return clean;
}

/** Copy only into absent keys; never remove, overwrite or merge saves from either edition.
 * Returns false only when storage could not be read/written (the adapter keeps a memory fallback).
 */
export function copyClassicSaves(read: Read, write: Write): boolean {
  const keys = arcadeStorageKeys('proofreader-classic');
  let available = true;
  for (const kind of ['progress', 'settings'] as const) {
    try {
      if (read(keys[kind]) !== null) continue;
      const raw = read(
        kind === 'progress' ? 'khc-arcade-proofreader-v2' : 'khc-arcade-proofreader-settings-v2'
      );
      if (raw === null) continue;
      let value: unknown;
      try {
        value = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const object = value as Record<string, unknown>;
      if (kind === 'progress' && object.version !== 2) continue;
      const clean = kind === 'progress' ? decodeProgress(raw, 2) : classicSettings(object);
      if (kind === 'settings' && !Object.keys(clean).length) continue;
      if (!write(keys[kind], JSON.stringify(clean))) available = false;
    } catch {
      available = false;
    }
  }
  return available;
}
