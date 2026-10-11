import { describe, it, expect } from 'vitest';
import { ALGORITHMS, ALGORITHM_CATEGORIES } from './algorithms';
import { ALGORITHM_LEARNING_PATHS } from './algorithms';
import { ALGORITHM_LESSONS } from './algorithmLessons';
import { runAlgorithmLesson } from '../lib/algorithmLessonRuns';

describe('Algorithms Catalog & Taxonomy Invariants', () => {
  it('features exactly the four requested flagship algorithms on the homepage', () => {
    const featured = ALGORITHMS.filter((a) => a.featured);
    expect(featured.length).toBe(4);

    const featuredIds = featured.map((a) => a.id);
    expect(featuredIds).toEqual(['minimap2', 'fm-index', 'pairwise', 'phmm']);
  });

  it('contains complete metadata, complexities, and highlights for all algorithms', () => {
    expect(ALGORITHMS.length).toBeGreaterThanOrEqual(10);

    for (const algo of ALGORITHMS) {
      expect(algo.id).toBeTruthy();
      expect(algo.title).toBeTruthy();
      expect(algo.area).toBeTruthy();
      expect(algo.category).toBeTruthy();
      expect(algo.summary).toBeTruthy();
      expect(algo.timeComplexity).toBeTruthy();
      expect(algo.spaceComplexity).toBeTruthy();
      expect(algo.keyMechanism).toBeTruthy();
      expect(algo.highlights).toBeDefined();
      expect(algo.highlights?.length).toBeGreaterThanOrEqual(2);
      expect(algo.href.startsWith('/')).toBe(true);
    }
  });

  it('has valid categories matching taxonomy schema', () => {
    const validCategorySlugs = new Set(ALGORITHM_CATEGORIES.map((c) => c.slug));
    for (const algo of ALGORITHMS) {
      expect(validCategorySlugs.has(algo.category)).toBe(true);
    }
  });

  it('covers exactly the 11 standalone lessons without changing the linked explorations', () => {
    expect(ALGORITHMS).toHaveLength(13);
    expect(
      ALGORITHMS.filter((a) => a.href.startsWith('/algorithms/'))
        .map((a) => a.id)
        .sort()
    ).toEqual(Object.keys(ALGORITHM_LESSONS).sort());
    expect(ALGORITHM_LEARNING_PATHS.flatMap((p) => [...p.ids]).sort()).toEqual(
      Object.keys(ALGORITHM_LESSONS).sort()
    );
    expect(ALGORITHMS.find((a) => a.id === 'wgt')?.href).toBe('/posts/wgt/');
    expect(ALGORITHMS.find((a) => a.id === 'shorkie-lab')?.href).toBe('/shorkie-lab/');
  });

  it('builds every default and preset with valid reveal and pseudocode references', () => {
    for (const lesson of Object.values(ALGORITHM_LESSONS)) {
      expect(lesson.exercises).toHaveLength(3);
      const defaults = Object.fromEntries(lesson.inputs.map((i) => [i.id, i.value]));
      for (const preset of [{ label: 'default', values: {} }, ...lesson.presets]) {
        const run = runAlgorithmLesson(lesson.id, { ...defaults, ...preset.values });
        expect(run.frames.length, `${lesson.id}/${preset.label}`).toBeGreaterThan(1);
        expect(run.frames.at(-1)?.result).toBeTruthy();
        for (const frame of run.frames) expect(frame.line).toBeLessThan(lesson.pseudocode.length);
        for (const cell of [
          ...(run.tables?.flatMap((t) => t.cells) ?? []),
          ...(run.graph?.nodes ?? []),
          ...(run.charts?.flatMap((c) => c.points) ?? []),
        ]) {
          expect(cell.revealAt).toBeGreaterThanOrEqual(0);
          expect(cell.revealAt).toBeLessThan(run.frames.length);
        }
      }
    }
  });

  it('provides the test-prediction equality guide on the actual prediction chart', () => {
    const values = Object.fromEntries(
      ALGORITHM_LESSONS.gwas.inputs.map((input) => [input.id, input.value])
    );
    const chart = runAlgorithmLesson('gwas', values).charts?.find(
      (chart) => chart.id === 'prediction'
    );
    expect(chart?.diagonal).toBe(true);
    expect(chart?.xMin).toBeLessThan(0);
    expect(chart?.yMin).toBeLessThan(0);
  });
});
