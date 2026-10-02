import { describe, expect, it } from 'vitest';
import { backgroundRouteAllowed, resolveBackground } from './backgroundModel';

describe('background preferences', () => {
  it('migrates a retired Flow scene while preserving saved Calm motion', () => {
    expect(resolveBackground('{"scene":"flow","motion":"calm"}', null)).toEqual({
      scene: 'cells',
      motion: 'calm',
    });
  });
  it('migrates a retired Landscape scene while preserving saved Paused motion', () => {
    expect(resolveBackground('{"scene":"landscape","motion":"paused"}', null)).toEqual({
      scene: 'cells',
      motion: 'paused',
    });
  });
  it('prefers an unknown scene with valid Paused motion over the legacy Off choice', () => {
    expect(resolveBackground('{"scene":"future","motion":"paused"}', 'off')).toEqual({
      scene: 'cells',
      motion: 'paused',
    });
  });
  it('validates saved choices and migrates legacy controls without importing Lab mode', () => {
    expect(resolveBackground(null, null)).toEqual({ scene: 'cells', motion: 'ambient' });
    expect(resolveBackground(null, 'calm')).toEqual({ scene: 'cells', motion: 'calm' });
    expect(resolveBackground('{broken', 'off').scene).toBe('off');
    expect(resolveBackground('{"scene":"lab","motion":"fast"}', 'lab')).toEqual({
      scene: 'cells',
      motion: 'ambient',
    });
    expect(resolveBackground('{"scene":"landscape","motion":"paused"}', 'off')).toEqual({
      scene: 'cells',
      motion: 'paused',
    });
  });
  it('preserves every supported scene and motion combination', () => {
    for (const scene of ['cells', 'morph', 'off']) {
      for (const motion of ['ambient', 'calm', 'paused']) {
        expect(resolveBackground(JSON.stringify({ scene, motion }), 'off')).toEqual({
          scene,
          motion,
        });
      }
    }
  });
  it('uses legacy choices only when saved motion is invalid or storage is malformed', () => {
    expect(resolveBackground(null, 'off')).toEqual({ scene: 'off', motion: 'ambient' });
    expect(resolveBackground('{broken', 'calm')).toEqual({ scene: 'cells', motion: 'calm' });
    expect(resolveBackground('{"scene":"morph","motion":"fast"}', 'off')).toEqual({
      scene: 'off',
      motion: 'ambient',
    });
    expect(resolveBackground('null', null)).toEqual({ scene: 'cells', motion: 'ambient' });
  });
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
