import { expect, it } from 'vitest';
import * as story from './morphStory';

const chapters = [
  { id: 'dna', center: 100, holdRadius: 40 },
  { id: 'rna', center: 500, holdRadius: 40 },
  { id: 'protein', center: 900, holdRadius: 40 },
  { id: 'cell', center: 1300, holdRadius: 40 },
  { id: 'signal', center: 1700, holdRadius: 40 },
  { id: 'network', center: 2100, holdRadius: 40 },
  { id: 'distribution', center: 2500, holdRadius: 40 },
] as const;

it('exposes the seven canonical story stages with Cell at the quiet midpoint', async () => {
  const story = await import('./morphStory');
  expect(story.MORPH_STAGES.map(({ id, progress }) => [id, progress])).toEqual([
    ['dna', 0],
    ['rna', 1 / 6],
    ['protein', 1 / 3],
    ['cell', 0.5],
    ['signal', 2 / 3],
    ['network', 5 / 6],
    ['distribution', 1],
  ]);
});

it('holds all seven chapters within forty pixels, including both sides of RNA', () => {
  const expected = [0, 1 / 6, 1 / 3, 0.5, 2 / 3, 5 / 6, 1];
  chapters.forEach((chapter, index) => {
    for (const offset of [-40, -30, 0, 30, 40])
      expect(story.storyProgress(chapter.center + offset, chapters)).toBeCloseTo(
        expected[index],
        12
      );
  });
  expect(story.storyProgress(300, chapters)).toBeCloseTo(1 / 12, 12);
  expect(story.storyProgress(-100, chapters)).toBe(0);
  expect(story.storyProgress(3000, chapters)).toBe(1);
});

it('falls back to a quiet Cell for missing or invalid chapter metadata', () => {
  for (const invalid of [
    [],
    chapters.slice(1),
    [...chapters].reverse(),
    chapters.map((c) => ({ ...c, center: NaN })),
    chapters.map((c) => ({ ...c, holdRadius: -1 })),
    chapters.map((c) => ({ ...c, id: 'dna' as const })),
  ])
    expect(story.storyProgress(100, invalid)).toBe(0.5);
  expect(story.storyProgress(NaN, chapters)).toBe(0.5);
});

it('clamps oversized holds and remains monotone between chapters', () => {
  const oversized = chapters.map((c) => ({ ...c, holdRadius: 1000 }));
  let previous = 0;
  for (let focus = -200; focus < 3000; focus++) {
    const progress = story.storyProgress(focus, oversized);
    expect(progress).toBeGreaterThanOrEqual(previous);
    previous = progress;
  }
  expect(story.storyProgress(500, oversized)).toBeCloseTo(1 / 6, 12);
  expect(story.storyProgress(100, oversized)).toBe(0);
});

it('holds for two seconds at every forward and reverse arrival on the sixty-second loop', () => {
  const arrivals = [0, 1 / 6, 1 / 3, 0.5, 2 / 3, 5 / 6, 1, 5 / 6, 2 / 3, 0.5, 1 / 3, 1 / 6, 0];
  arrivals.forEach((progress, i) => {
    for (const offset of [0, 1, 2])
      expect(story.playbackProgress(i * 5 + offset)).toBeCloseTo(progress, 12);
  });
  expect(story.playbackProgress(3.5)).toBeCloseTo(1 / 12, 12);
  expect(story.playbackProgress(33.5)).toBeCloseTo(11 / 12, 12);
  expect(story.playbackProgress(-25)).toBeCloseTo(5 / 6, 12);
  for (let p = 0; p <= 1; p += 0.005)
    expect(story.playbackProgress(story.playbackTime(p))).toBeCloseTo(p, 10);
  for (const stage of story.MORPH_STAGES)
    expect(story.playbackTime(stage.progress)).toBeCloseTo(stage.progress * 30, 12);
});

it('shares smooth finite stage weights, descriptions and explicit transition timing', () => {
  for (let p = 0; p <= 1; p += 0.01) {
    expect(
      story.MORPH_STAGES.reduce((sum, stage) => sum + story.stageWeight(p, stage.id), 0)
    ).toBeCloseTo(1, 12);
    expect(story.stageDescription(p)).toBeTruthy();
  }
  expect(story.stageWeight(0.5, 'cell')).toBe(1);
  expect(story.stageWeight(0.5, 'dna')).toBe(0);
  expect(story.stageDescription(1)).toMatch(/not measured or calibrated Shorkie uncertainty/);
  expect(story.stageDescription(5 / 6)).toMatch(/not Shorkie/);
  // The splicing scene says what it is and what it is not, in the status line a reader hears.
  expect(story.stageDescription(1 / 6)).toMatch(/co-transcriptional splicing/i);
  expect(story.stageDescription(1 / 6)).toMatch(/introns/);
  expect(story.stageDescription(1 / 6)).toMatch(/invented/);
  expect(story.stageDescription(1 / 6)).toMatch(/not a simulation/);
  // So does the sashimi view: junction reads, what a skipped exon looks like, and that it is invented.
  expect(story.stageDescription(2 / 3)).toMatch(/RNA-seq/);
  expect(story.stageDescription(2 / 3)).toMatch(/junction reads/);
  expect(story.stageDescription(2 / 3)).toMatch(/skipping an exon/);
  expect(story.stageDescription(2 / 3)).toMatch(/invented, not data/);
  expect(story.stageDescription(2 / 3)).not.toMatch(/non-normalized/);
  expect(story.transitionDuration(0, 1)).toBeCloseTo(5.4, 12);
  expect(story.transitionDuration(1 / 6, 1 / 3)).toBeCloseTo(0.9, 12);
  expect(story.transitionDuration(0.5, 0.5)).toBe(0.15);
  expect(story.smootherstep(0)).toBe(0);
  expect(story.smootherstep(0.5)).toBe(0.5);
  expect(story.smootherstep(1)).toBe(1);
  for (const value of [NaN, Infinity, -Infinity]) {
    expect(Number.isFinite(story.playbackProgress(value))).toBe(true);
    expect(Number.isFinite(story.playbackTime(value))).toBe(true);
    expect(Number.isFinite(story.transitionDuration(value, value))).toBe(true);
    expect(story.stageWeight(value, 'cell')).toBe(1);
    expect(Number.isFinite(story.smootherstep(value))).toBe(true);
  }
});
