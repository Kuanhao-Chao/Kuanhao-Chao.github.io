import { describe, expect, it } from 'vitest';
import {
  CAMPAIGNS,
  challengeUrl,
  decodeProgress,
  emptyProgress,
  parseRunOptions,
  recordKey,
  recordResult,
  rulesVersion,
  isProofreader,
  type RunOptions,
  type RunResult,
} from './arcade';
const options: RunOptions = { mode: 'campaign', difficulty: 'standard', stage: 1, seed: 2101 };
const result: RunResult = {
  score: 100,
  seconds: 25,
  won: true,
  medals: [true, false, true],
  detail: 'Clear',
};

describe('arcade campaigns and links', () => {
  it('ships six distinct fixed-seed stages for each game', () => {
    for (const stages of Object.values(CAMPAIGNS)) {
      expect(stages).toHaveLength(6);
      expect(new Set(stages.map((s) => s.seed)).size).toBe(6);
      expect(stages.every((s) => s.goal > 0 && s.par > 0 && s.lesson.length > 20)).toBe(true);
    }
  });
  it('preserves legacy seed links and validates invalid queries', () => {
    expect(parseRunOptions('snake', '?seed=42').mode).toBe('classic');
    expect(parseRunOptions('snake', '?seed=42').seed).toBe(42);
    expect(parseRunOptions('snake', '?seed=-1', 1, 8).seed).toBe(8);
    expect(parseRunOptions('snake', '?seed=4294967296', 1, 8).seed).toBe(8);
    expect(parseRunOptions('jetpack', '?mode=motif').mode).toBe('campaign');
    expect(parseRunOptions('snake', '?mode=campaign&stage=6', 0).stage).toBe(1);
    expect(parseRunOptions('snake', '?mode=campaign&stage=6', Infinity).stage).toBe(1);
  });
  it('campaign links cannot skip unlocks and practice can rehearse every stage', () => {
    expect(parseRunOptions('snake', '?mode=campaign&stage=6', 2).stage).toBe(2);
    expect(parseRunOptions('snake', '?mode=practice&stage=6', 1).stage).toBe(6);
    expect(parseRunOptions('snake', '?mode=campaign&stage=2&seed=9', 2).seed).toBe(3102);
  });
  it('round trips versioned seeded challenges', () => {
    const o: RunOptions = { ...options, mode: 'classic', difficulty: 'expert', seed: 0xffffffff };
    const url = challengeUrl('/games/proofreader/', o);
    expect(url).toContain('rules=2');
    expect(parseRunOptions('proofreader', url.split('?')[1])).toEqual(o);
  });
  it('keeps historical Classic campaign parameters separate from the 3D campaign', () => {
    expect(rulesVersion('proofreader-classic')).toBe(2);
    expect(rulesVersion('proofreader')).toBe(3);
    expect(isProofreader('proofreader-classic')).toBe(true);
    expect(isProofreader('proofreader')).toBe(true);
    expect(isProofreader('snake')).toBe(false);
    expect(CAMPAIGNS['proofreader-classic'].map((s) => s.goal)).toEqual([4, 6, 7, 8, 15, 1]);
    expect(CAMPAIGNS['proofreader-classic'].map((s) => s.par)).toEqual([100, 120, 140, 160, 180, 210]);
    expect(CAMPAIGNS.proofreader[0].goal).toBe(6);
    expect(CAMPAIGNS.proofreader[0].par).toBe(300);
    const o: RunOptions = { ...options, mode: 'classic', difficulty: 'expert', seed: 2026 };
    const url = challengeUrl('/games/proofreader-classic/', o, rulesVersion('proofreader-classic'));
    expect(url).toContain('/games/proofreader-classic/?');
    expect(url).toContain('rules=2');
    expect(parseRunOptions('proofreader-classic', url.split('?')[1])).toEqual(o);
    expect(parseRunOptions('proofreader-classic', '?mode=campaign&stage=6', 2).stage).toBe(2);
    expect(parseRunOptions('proofreader-classic', '?mode=practice&stage=6').stage).toBe(6);
  });
});

describe('arcade progress', () => {
  it('unlocks only the next stage and retains independent medal achievements', () => {
    const a = recordResult(emptyProgress(), options, result);
    expect(a.unlocked).toBe(2);
    expect(emptyProgress().cleared).toEqual([]);
    const b = recordResult(a, options, {
      ...result,
      score: 90,
      seconds: 30,
      medals: [true, true, false],
    });
    expect(b.records[recordKey(options, false)]).toEqual({
      score: 100,
      seconds: 25,
      medals: [true, true, true],
    });
  });
  it('separates difficulty, assistance and modes without penalizing cosmetics', () => {
    const a = recordResult(emptyProgress(), options, result);
    const b = recordResult(a, options, { ...result, score: 200 }, true);
    const c = recordResult(b, { ...options, difficulty: 'expert' }, result);
    expect(Object.keys(c.records)).toHaveLength(3);
  });
  it('practice never changes progress and loss never unlocks', () => {
    const a = emptyProgress();
    expect(recordResult(a, { ...options, mode: 'practice' }, result)).toBe(a);
    expect(recordResult(a, options, { ...result, won: false }).unlocked).toBe(1);
  });
  it('rejects malformed, old and hostile data and derives unlocks from clear history', () => {
    for (const raw of [null, '{', '{"version":1}', 'null', '[]'])
      expect(decodeProgress(raw)).toEqual(emptyProgress());
    const a = decodeProgress(
      JSON.stringify({
        version: 2,
        unlocked: 99,
        cleared: [1, 1, 6, -1, '2'],
        records: {
          __proto__: {},
          'classic:1:standard:standard': { score: -1, seconds: 2, medals: [true] },
        },
      })
    );
    expect(a.unlocked).toBe(2);
    expect(a.cleared).toEqual([1, 6]);
    expect(Object.keys(a.records)).toHaveLength(0);
  });
  it('round trips saved progress', () => {
    const a = recordResult(emptyProgress(), options, result);
    expect(decodeProgress(JSON.stringify(a))).toEqual(a);
  });
});
