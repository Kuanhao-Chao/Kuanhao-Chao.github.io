import { describe, expect, it } from 'vitest';
import { arcadeStorageKeys, copyClassicSaves } from './arcadeStorage';
import { emptyProgress, recordResult, type RunOptions } from './arcade';

const run: RunOptions = { mode: 'campaign', stage: 1, difficulty: 'standard', seed: 2101 };
const progress = recordResult(emptyProgress(2), run, {
  won: true,
  score: 120,
  seconds: 25,
  medals: [true, true, false],
  detail: 'Clear',
});
const oldProgressKey = 'khc-arcade-proofreader-v2';
const oldSettingsKey = 'khc-arcade-proofreader-settings-v2';
const classic = arcadeStorageKeys('proofreader-classic');

function storage(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  const writes: string[] = [];
  return {
    data,
    writes,
    read: (key: string) => data.get(key) ?? null,
    write: (key: string, value: string) => {
      writes.push(key);
      data.set(key, value);
      return true;
    },
  };
}

describe('Proofreader edition save isolation', () => {
  it('retains the existing 3D/Snake/Jetpack keys and gives Classic its own v2 keys', () => {
    expect(arcadeStorageKeys('proofreader')).toEqual({
      progress: 'khc-arcade-proofreader-v3',
      settings: 'khc-arcade-proofreader-settings-v3',
    });
    expect(classic).toEqual({
      progress: 'khc-arcade-proofreader-classic-v2',
      settings: 'khc-arcade-proofreader-classic-settings-v2',
    });
    for (const game of ['snake', 'jetpack'] as const)
      expect(arcadeStorageKeys(game).progress).toBe(`khc-arcade-${game}-v2`);
  });
  it('copies validated original-v2 progress once, without changing any source or 3D data', () => {
    const old = JSON.stringify({ ...progress, unlocked: 99 });
    const s = storage({
      [oldProgressKey]: old,
      [oldSettingsKey]: JSON.stringify({
        sound: false,
        palette: 0,
        speed: 0.8,
        assist: true,
        toggle: true,
        sensitivity: 1.2,
        deadZone: 12,
        bindings: { forward: 'i', pulse: 'f' },
      }),
      'khc-arcade-proofreader-v3': '3D records must be untouched',
      'khc-arcade-proofreader-settings-v3': '3D settings must be untouched',
    });
    const original = new Map(s.data);
    expect(copyClassicSaves(s.read, s.write)).toBe(true);
    expect(JSON.parse(s.read(classic.progress)!)).toEqual(progress);
    expect(JSON.parse(s.read(classic.settings)!)).toMatchObject({
      speed: 0.8,
      assist: true,
      bindings: { forward: 'i', pulse: 'f' },
    });
    for (const [key, value] of original) expect(s.read(key)).toBe(value);
    expect(s.writes).toEqual([classic.progress, classic.settings]);
    copyClassicSaves(s.read, s.write);
    expect(s.writes).toHaveLength(2);
  });
  it('never overwrites existing Classic keys, even if they are invalid', () => {
    const s = storage({
      [classic.progress]: '{',
      [classic.settings]: 'null',
      [oldProgressKey]: JSON.stringify(progress),
      [oldSettingsKey]: '{"sound":true}',
    });
    copyClassicSaves(s.read, s.write);
    expect(s.writes).toEqual([]);
    expect(s.read(classic.progress)).toBe('{');
    expect(s.read(classic.settings)).toBe('null');
  });
  it('rejects malformed and wrong-edition data without manufacturing records', () => {
    for (const raw of ['{', 'null', '[]', '3', '{"version":1}', '{"version":3}']) {
      const s = storage({ [oldProgressKey]: raw, [oldSettingsKey]: raw });
      expect(copyClassicSaves(s.read, s.write)).toBe(true);
      expect(s.writes).toEqual([]);
    }
    const s = storage({ 'khc-arcade-proofreader-v3': JSON.stringify({ ...progress, version: 3 }) });
    copyClassicSaves(s.read, s.write);
    expect(s.writes).toEqual([]);
  });
  it('filters unknown, invalid, reserved, and 3D-only settings', () => {
    const s = storage({
      [oldSettingsKey]: JSON.stringify({
        sound: true,
        volume: 0.4,
        speed: 0.2,
        palette: 1.5,
        sensitivity: '2',
        deadZone: 999,
        graphics: 'high',
        fov: 95,
        bindings: { fire: ' ', pulse: 'P', forward: 'I', jump: 'j', turnRight: '' },
      }),
    });
    copyClassicSaves(s.read, s.write);
    expect(JSON.parse(s.read(classic.settings)!)).toEqual({
      sound: true,
      volume: 0.4,
      bindings: { fire: ' ', forward: 'i' },
    });
  });
  it('handles missing or denied storage and reports unsuccessful copies', () => {
    const empty = storage();
    expect(copyClassicSaves(empty.read, empty.write)).toBe(true);
    expect(empty.writes).toEqual([]);
    expect(
      copyClassicSaves(
        () => {
          throw new Error('denied');
        },
        () => false
      )
    ).toBe(false);
    const s = storage({ [oldProgressKey]: JSON.stringify(progress) });
    expect(copyClassicSaves(s.read, () => false)).toBe(false);
    expect(s.read(oldProgressKey)).toBe(JSON.stringify(progress));
  });
});
