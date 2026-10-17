import { describe, it, expect } from 'vitest';
import { createSaveStore, readChallenge, challengeQuery } from './floorDescentSave';
import { createGame } from './floorDescent';

describe('100-Floor Descent settings, challenge links, and local records', () => {
  it('round-trips versioned challenges and rejects malformed or unsupported query values', () => {
    const query = challengeQuery({ mode: 'trial', seed: 4294967295 });
    expect(readChallenge(query, 7)).toEqual({
      options: { mode: 'trial', seed: 4294967295, startFloor: 0 },
      unsupported: false,
    });
    expect(readChallenge('?mode=cheat&seed=-4&start=80', 7).options).toEqual({
      mode: 'classic',
      seed: 7,
      startFloor: 0,
    });
    expect(readChallenge('?mode=practice&seed=3&start=60', 7).options.startFloor).toBe(60);
    expect(readChallenge('?rules=999&seed=3', 7).unsupported).toBe(true);
    expect(readChallenge('?seed=4294967296', 7).options.seed).toBe(7);
  });
  it('stores settings and separate mode records, with no Practice records or cross-seed Trial comparison', () => {
    const memory = new Map<string, string>(),
      storage = {
        getItem: (k: string) => memory.get(k) ?? null,
        setItem: (k: string, v: string) => {
          memory.set(k, v);
        },
      };
    const save = createSaveStore(storage);
    save.configure({ locale: 'zh-Hant', sound: true });
    const practice = createGame({ mode: 'practice', seed: 1, startFloor: 80 });
    practice.status = 'over';
    save.record(practice);
    expect(save.best('classic', 1)).toBeNull();
    const classic = createGame({ mode: 'classic', seed: 1 });
    classic.status = 'over';
    classic.floor = 22;
    classic.time = 90;
    save.record(classic);
    expect(save.best('classic', 1)?.floor).toBe(22);
    expect(save.best('remix', 1)).toBeNull();
    const trial = createGame({ mode: 'trial', seed: 1 });
    trial.status = 'over';
    trial.floor = 50;
    save.record(trial);
    expect(save.best('trial', 1)).toBeNull();
    trial.status = 'won';
    trial.floor = 100;
    trial.time = 250;
    save.record(trial);
    trial.time = 260;
    save.record(trial);
    expect(save.best('trial', 1)?.seconds).toBe(250);
    expect(save.best('trial', 2)).toBeNull();
    const reloaded = createSaveStore(storage);
    expect(reloaded.settings.locale).toBe('zh-Hant');
    expect(reloaded.settings.sound).toBe(true);
    expect(reloaded.best('trial', 1)?.seconds).toBe(250);
    expect([...memory.keys()].every((k) => k.startsWith('khc-floor-descent-v1-'))).toBe(true);
  });
  it('keeps working in memory when storage is blocked and bounds per-seed records', () => {
    const blocked = createSaveStore({
      getItem: () => {
        throw Error('denied');
      },
      setItem: () => {
        throw Error('denied');
      },
    });
    blocked.configure({ locale: 'zh-Hant' });
    const s = createGame({ mode: 'trial', seed: 0 });
    s.status = 'won';
    s.floor = 100;
    s.time = 240;
    for (let seed = 0; seed < 30; seed++) {
      s.options.seed = seed;
      blocked.record(s);
    }
    expect(blocked.available).toBe(false);
    expect(blocked.settings.locale).toBe('zh-Hant');
    expect(blocked.best('trial', 0)).toBeNull();
    expect(blocked.best('trial', 29)?.seconds).toBe(240);
    const corrupt = createSaveStore({ getItem: () => '{bad JSON', setItem: () => {} });
    expect(corrupt.settings.sound).toBe(false);
    expect(corrupt.best('classic', 1)).toBeNull();
    expect(corrupt.available).toBe(true);
    const invalid = createSaveStore({
      getItem: () =>
        JSON.stringify({
          classic: { floor: -4, seconds: Infinity, seed: 2 },
          locale: 'xx',
          sound: 'yes',
        }),
      setItem: () => {},
    });
    expect(invalid.best('classic', 1)).toBeNull();
    expect(invalid.settings.locale).toBe('en');
  });
});
