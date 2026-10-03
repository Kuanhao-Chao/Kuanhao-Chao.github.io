import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_DEFAULT_KEY,
  BACKGROUND_KEY,
  DEFAULT_SCENE,
  DEFAULT_SCENE_VERSION,
  SCENES,
  backgroundRouteAllowed,
  resolveBackground,
} from './backgroundModel';

// The flag as it stands once this release has run: a saved Cells is then a choice.
const SEEN = DEFAULT_SCENE_VERSION;

describe('background preferences', () => {
  it('opens on Sequence → Function, stored as morph, and Cells stays selectable', () => {
    expect(DEFAULT_SCENE).toBe('morph');
    expect(SCENES).toContain('cells');
    expect(SCENES).toContain(DEFAULT_SCENE);
    expect(resolveBackground(null, null, null)).toEqual({ scene: 'morph', motion: 'ambient' });
    expect(resolveBackground(null, null, SEEN)).toEqual({ scene: 'morph', motion: 'ambient' });
  });
  it('migrates a retired Flow scene to the default while preserving saved Calm motion', () => {
    expect(resolveBackground('{"scene":"flow","motion":"calm"}', null, SEEN)).toEqual({
      scene: 'morph',
      motion: 'calm',
    });
  });
  it('migrates a retired Landscape scene to the default while preserving saved Paused motion', () => {
    expect(resolveBackground('{"scene":"landscape","motion":"paused"}', null, SEEN)).toEqual({
      scene: 'morph',
      motion: 'paused',
    });
  });
  it('prefers an unknown scene with valid Paused motion over the legacy Off choice', () => {
    expect(resolveBackground('{"scene":"future","motion":"paused"}', 'off', SEEN)).toEqual({
      scene: 'morph',
      motion: 'paused',
    });
  });
  it('validates saved choices and migrates legacy controls without importing Lab mode', () => {
    expect(resolveBackground(null, 'calm', SEEN)).toEqual({ scene: 'morph', motion: 'calm' });
    expect(resolveBackground('{broken', 'off', SEEN).scene).toBe('off');
    expect(resolveBackground('{"scene":"lab","motion":"fast"}', 'lab', SEEN)).toEqual({
      scene: 'morph',
      motion: 'ambient',
    });
    expect(resolveBackground('{"scene":"landscape","motion":"paused"}', 'off', SEEN)).toEqual({
      scene: 'morph',
      motion: 'paused',
    });
  });
  it('preserves every supported scene and motion combination once the default has applied', () => {
    for (const scene of ['cells', 'morph', 'off']) {
      for (const motion of ['ambient', 'calm', 'paused']) {
        expect(resolveBackground(JSON.stringify({ scene, motion }), 'off', SEEN)).toEqual({
          scene,
          motion,
        });
      }
    }
  });
  it('uses legacy choices only when saved motion is invalid or storage is malformed', () => {
    expect(resolveBackground(null, 'off', SEEN)).toEqual({ scene: 'off', motion: 'ambient' });
    expect(resolveBackground('{broken', 'calm', SEEN)).toEqual({ scene: 'morph', motion: 'calm' });
    expect(resolveBackground('{"scene":"morph","motion":"fast"}', 'off', SEEN)).toEqual({
      scene: 'off',
      motion: 'ambient',
    });
    expect(resolveBackground('null', null, SEEN)).toEqual({ scene: 'morph', motion: 'ambient' });
  });
});

describe('moving a saved Cells to the new default, once', () => {
  // The build before this one wrote Cells into storage for every visitor on their first load, so a
  // saved Cells is indistinguishable from a chosen one until the flag says this release has run.
  const cells = (motion: string) => JSON.stringify({ scene: 'cells', motion });
  it('moves a saved Cells to the default until the flag exists, keeping the motion', () => {
    for (const motion of ['ambient', 'calm', 'paused'])
      expect(resolveBackground(cells(motion), null, null)).toEqual({ scene: 'morph', motion });
  });
  it('treats a flag from some other version as not seen', () => {
    expect(resolveBackground(cells('calm'), null, 'sequence-function-0')).toEqual({
      scene: 'morph',
      motion: 'calm',
    });
    expect(resolveBackground(cells('calm'), null, '')).toEqual({ scene: 'morph', motion: 'calm' });
  });
  it('keeps a Cells that was chosen after the flag existed', () => {
    expect(resolveBackground(cells('calm'), null, SEEN)).toEqual({ scene: 'cells', motion: 'calm' });
  });
  it('never moves Off, an explicit Sequence → Function, or a Pause, flag or not', () => {
    for (const seen of [null, SEEN]) {
      expect(resolveBackground('{"scene":"off","motion":"calm"}', null, seen)).toEqual({
        scene: 'off',
        motion: 'calm',
      });
      expect(resolveBackground('{"scene":"morph","motion":"paused"}', null, seen)).toEqual({
        scene: 'morph',
        motion: 'paused',
      });
    }
  });
  it('does not turn a legacy cell mode into Cells either way', () => {
    // The legacy key only ever recorded a motion (and Off); it never chose a scene.
    for (const seen of [null, SEEN])
      expect(resolveBackground(null, 'calm', seen)).toEqual({ scene: 'morph', motion: 'calm' });
  });
  it('names the flag key and version in one place', () => {
    expect(BACKGROUND_KEY).toBe('khc-background-v1');
    expect(BACKGROUND_DEFAULT_KEY).toBe('khc-background-default');
    expect(DEFAULT_SCENE_VERSION).toBe('sequence-function-1');
  });
});

describe('the pre-hydration script and resolveBackground are one rule', () => {
  // An inline script cannot import, so SiteBackground.astro carries the rule written out by hand.
  // Run its own text against the pure function over every input that distinguishes them.
  const source = readFileSync('src/components/SiteBackground.astro', 'utf8');
  const script = /<script is:inline>([\s\S]*?)<\/script>/.exec(source)?.[1] ?? '';
  const runInline = (raw: string | null, legacy: string | null, seen: string | null) => {
    const store: Record<string, string | null> = {
      [BACKGROUND_KEY]: raw,
      'khc-cell-mode': legacy,
      [BACKGROUND_DEFAULT_KEY]: seen,
    };
    const dataset: Record<string, string> = {};
    new Function(
      'localStorage',
      'document',
      script
    )({ getItem: (key: string) => store[key] ?? null }, { documentElement: { dataset } });
    return { scene: dataset.backgroundScene, motion: dataset.backgroundMotion };
  };
  const raws = [
    null,
    '',
    '{broken',
    'null',
    '{"scene":"cells","motion":"ambient"}',
    '{"scene":"cells","motion":"calm"}',
    '{"scene":"cells","motion":"paused"}',
    '{"scene":"morph","motion":"calm"}',
    '{"scene":"off","motion":"paused"}',
    '{"scene":"flow","motion":"calm"}',
    '{"scene":"future","motion":"paused"}',
    '{"scene":"morph","motion":"fast"}',
    '{"scene":"cells"}',
  ];
  it('finds the script', () => {
    expect(script).toContain('khc-background-default');
    expect(script).toContain(DEFAULT_SCENE_VERSION);
  });
  it('agrees for every saved value, legacy mode and flag', () => {
    let cases = 0;
    for (const raw of raws)
      for (const legacy of [null, 'off', 'calm', 'ambient', 'lab'])
        for (const seen of [null, SEEN, 'sequence-function-0', '']) {
          expect(runInline(raw, legacy, seen), `${raw} / ${legacy} / ${seen}`).toEqual(
            resolveBackground(raw, legacy, seen)
          );
          cases += 1;
        }
    expect(cases).toBe(raws.length * 5 * 4);
  });
  it('never writes storage: initBackground persists, after hydration', () => {
    expect(script).not.toMatch(/setItem|removeItem/);
  });
});

describe('route policy', () => {
  it('keeps dedicated experiences independent without excluding ordinary articles', () => {
    for (const route of [
      '/lab/',
      '/games/snake/',
      '/nn-lab',
      '/shorkie-lab/genome/',
      '/terminal/',
      '/chromatin/',
      '/algorithms/',
    ])
      expect(backgroundRouteAllowed(route)).toBe(false);
    for (const route of [
      '/',
      '/posts/example/',
      '/deep_dives/statistical-genetics/',
      '/research/',
      '/laboratory-notes/',
    ])
      expect(backgroundRouteAllowed(route)).toBe(true);
  });
});
