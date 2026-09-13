import { describe, expect, it } from 'vitest';
import { analysisGrid, meanOverView, scoredMean } from './genomeAnalysis';
import { GenomeResources } from './genomeResources';
import { decodeViewState, encodeViewState, exportRows, pearson, type Level } from './genomeBrowser';

const chroms = [{ name: 'chrI', length: 230218 }, { name: 'chrVII', length: 1090940 }];
const levels: Level[] = [1, 8, 16, 64, 512, 4096].map((binBp, level) => ({ binBp, level, rows: level ? 3 : 1 }));

describe('reproducible genome views', () => {
  it('preserves an explicitly empty set while allowing legacy coordinate-only links', () => {
    const state = { view: { chrom: 'chrI', start: 0, end: 200 }, tracks: [], roi: null };
    expect(decodeViewState(encodeViewState(state), chroms).tracks).toEqual([]);
    expect(decodeViewState('#chrI:1-200', chroms).tracks).toBeUndefined();
  });

  it('keeps a mark on its original chromosome after navigating elsewhere', () => {
    const state = {
      view: { chrom: 'chrI', start: 0, end: 200 }, tracks: ['lm-masked'],
      roi: { chrom: 'chrVII', start: 882011, end: 884610 },
      model: 'lm', density: 'dense' as const, autoscale: true, heights: { 'lm-masked': 120 },
    };
    expect(decodeViewState(encodeViewState(state), chroms)).toEqual(state);
  });

  it('qualifies a legacy mark and clamps it at the chromosome boundary', () => {
    expect(decodeViewState('#chrI:1-200;roi=230000-250000', chroms).roi)
      .toEqual({ chrom: 'chrI', start: 230000, end: 230218 });
    expect(decodeViewState('#chrI:1-200;roi=chrVII:5-10', chroms).roi?.chrom).toBe('chrVII');
    expect(decodeViewState('#chrI:1-200;roi=chrX:5-10', chroms).roi).toBeUndefined();
  });

  it('rejects invalid heights and fractional experiment indices', () => {
    const state = decodeViewState('#chrI:1-200;h=lm-masked:100,genes:-5,bad:999,sk-rnaseq:NaN;k=1.2', chroms);
    expect(state.heights).toEqual({ 'lm-masked': 100 });
    expect(state.locusTrack).toBeUndefined();
  });
});

describe('genomic analysis grid', () => {
  it('weights genome summaries by scored values, including sparse tracks and true zeros', () => {
    expect(scoredMean([{ scored: 10, mean: 8 }, { scored: 30, mean: 0 }, { scored: 100, mean: null }])).toBe(2);
    expect(scoredMean([{ scored: 0, mean: 8 }])).toBeNull();
  });
  it('pairs 1 bp constraint with 16 bp coverage at the same positions', () => {
    const grid = analysisGrid({ chrom: 'chrI', start: 17, end: 81 }, [{}, { nativeBp: 16 }], levels);
    expect(grid).toMatchObject({ start: 16, binBp: 16, count: 5 });
    expect(grid.levels.map((l) => l.binBp)).toEqual([16, 16]);
  });

  it('covers the entire largest chromosome without truncating to its first 4000 bins', () => {
    const grid = analysisGrid({ chrom: 'chrIV', start: 0, end: 1531933 }, [{}, { nativeBp: 64 }], levels);
    expect(grid.binBp).toBe(512);
    expect(grid.count).toBeLessThanOrEqual(4000);
    expect(grid.start + grid.count * grid.binBp).toBeGreaterThanOrEqual(1531933);
  });

  it('weights partial boundary bins and excludes missing data', () => {
    const view = { chrom: 'chrI', start: 8, end: 36 };
    const grid = analysisGrid(view, [{ nativeBp: 16 }], levels);
    expect(meanOverView([2, null, 8], grid, view)).toBeCloseTo(4);
    expect(meanOverView([-2, null, 8], grid, view, true)).toBeCloseTo(4);
    expect(meanOverView([null, null, null], grid, view)).toBeNull();
  });

  it('does not turn missing pairs or constant signals into zero correlation', () => {
    expect(pearson([1, null, 2], [1, 2, 3])).toBeNull();
    expect(pearson(Array(12).fill(2), Array(12).fill(3))).toBeNull();
    expect(pearson([1,2,3,4,5,6,7,8], [8,7,6,5,4,3,2,1])).toBeCloseTo(-1);
  });
});

describe('CSV interoperability', () => {
  it('quotes commas and quotes in headers and clips the final bin', () => {
    const rows = exportRows('chrI', 230208, 16, [{ id: 'test "track"', units: 'a.u.' }], [[1.25, null]], 230218);
    expect(rows[0]).toBe('chrom,start,end,"test ""track"" (a.u., mean of 16 bp)"');
    expect(rows.slice(1)).toEqual(['chrI,230208,230218,1.25']);
  });
  it('keeps a true zero distinct from a missing measurement', () => {
    const rows = exportRows('chrI', 0, 1, [{ id: 'gc', units: 'fraction' }], [[0, null]]);
    expect(rows.slice(1)).toEqual(['chrI,0,1,0', 'chrI,1,2,']);
  });
});

describe('resource failure and recovery', () => {
  it('deduplicates concurrent requests and limits parallel work', async () => {
    const loader = new GenomeResources(() => {}, 2);
    let active = 0, peak = 0, calls = 0;
    const read = async () => {
      calls++; peak = Math.max(peak, ++active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active--; return 42;
    };
    const first = loader.request('a', read);
    expect(loader.request('a', read)).toBe(first);
    await Promise.all([first, ...['b', 'c', 'd'].map((k) => loader.request(k, read))]);
    await loader.idle();
    expect(calls).toBe(4); expect(peak).toBe(2); expect(loader.pending).toBe(0);
  });
  it('does not cache a failed annotation as empty or retry on every paint', async () => {
    const loader = new GenomeResources(() => {});
    let calls = 0;
    const fail = async () => { calls++; throw new Error('HTTP 503'); };
    expect(await loader.request('genes', fail)).toBeNull();
    for (let i = 0; i < 20; i++) await loader.request('genes', fail);
    expect(calls).toBe(1); expect(loader.failures.get('genes')).toBe('HTTP 503');
    loader.retry();
    expect(await loader.request('genes', async () => [])).toEqual([]);
    expect(loader.failures.size).toBe(0);
  });
  it('aborts active work and drains queued work when the page is removed', async () => {
    const loader = new GenomeResources(() => {}, 1);
    const first = loader.request('a', (signal) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const second = loader.request('b', async () => { throw new Error('must not start'); });
    await Promise.resolve();
    loader.dispose();
    expect(await Promise.all([first, second])).toEqual([null, null]);
    expect(loader.failures.size).toBe(0);
  });
});
