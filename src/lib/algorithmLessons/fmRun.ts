import {
  buildBwt,
  bwtBackwardSearch,
  lfMapping,
  locateSampled,
  sampleSuffixArray,
} from '../fmIndex';
import type { LessonRun, LessonValues, LessonFrame } from '../algorithmLessonTypes';
import { frame } from './common';

export function fmRun(v: LessonValues): LessonRun {
  const index = buildBwt(v.reference);
  const search = bwtBackwardSearch(index, v.pattern, { locate: false });
  const samples = sampleSuffixArray(index, Number(v.spacing));
  const frames: LessonFrame[] = [
    frame(
      'initialize',
      'One sentinel, one reference',
      `Reference ${index.text}. Rows will be sorted lexicographically; coordinates are zero-based.`,
      0
    ),
  ];
  const rowAt: number[] = [];
  for (const row of index.rows) {
    rowAt[row.index] = frames.length;
    frames.push(
      frame(
        'construct',
        `Sorted suffix row ${row.index}`,
        `Suffix ${row.suffix}, start SA=${row.sa}; its preceding letter is ${row.l}. First-column letter ${row.f}.`,
        1,
        [0, 1, 2, 3].map((c) => `bwt:${row.index}:${c}`)
      )
    );
  }
  const rankAt = frames.length;
  frames.push(
    frame(
      'rank',
      'Count character blocks and prefix ranks',
      `C: ${Object.entries(index.cTable)
        .map(([c, n]) => `${c}→${n}`)
        .join(', ')}. Occ(c,r) excludes row r.`,
      2
    )
  );
  for (let row = 0; row < Math.min(index.length, 4); row++) {
    const next = lfMapping(index, row);
    frames.push(
      frame(
        'LF',
        `LF(${row}) = ${next}`,
        `The ${index.bwt[row]} at BWT row ${row} maps to its same occurrence in the first column at row ${next}.`,
        5,
        [`bwt:${row}:2`, `bwt:${next}:1`]
      )
    );
  }
  for (const s of search.steps)
    frames.push(
      frame(
        'search',
        `Prepend ${s.char}: search suffix ${s.querySuffix}`,
        `${s.formulaSpText}. ${s.formulaEpText}. ${s.isMatch ? `Inclusive interval [${s.sp},${s.ep}].` : 'The interval is empty: no match.'}`,
        3,
        index.rows.filter((r) => r.index >= s.sp && r.index <= s.ep).map((r) => `bwt:${r.index}:1`),
        [
          { label: 'sp', value: String(s.sp) },
          { label: 'ep', value: String(s.ep) },
        ]
      )
    );
  const last = search.steps.at(-1);
  const sp = last?.sp ?? 0;
  const ep = last?.ep ?? index.length - 1;
  frames.push(
    frame(
      'count',
      `${search.matchCount} exact matches`,
      `Count is ${search.matchCount}: inclusive interval width, before locating any coordinates.`,
      4
    )
  );
  const positions: number[] = [];
  if (search.isFound)
    for (let row = sp; row <= ep; row++) {
      const located = locateSampled(index, row, Number(v.spacing), samples);
      for (const [hop, r] of located.rows.entries())
        frames.push(
          frame(
            'locate',
            `Locate row ${row}: LF hop ${hop}`,
            samples.has(r)
              ? `Reached sampled suffix position ${samples.get(r)} at row ${r}; (${samples.get(r)} + ${hop}) mod ${index.length} = ${located.position}.`
              : `Row ${r} is not sampled. LF moves to row ${lfMapping(index, r)}.`,
            samples.has(r) ? 6 : 5,
            [`bwt:${r}:0`, `bwt:${r}:2`]
          )
        );
      positions.push(located.position);
    }
  const done = frame(
    'done',
    'Count and coordinates agree',
    'Suffix-array rows are not text positions. Check the located positions against the reference.',
    6
  );
  done.result = `Reference ${index.text}\nBWT ${index.bwt}\nQuery ${search.pattern || '(empty pattern: all boundaries)'}\nCount ${search.matchCount}\nZero-based positions: ${positions.sort((a, b) => a - b).join(', ') || 'none'}\nSampling spacing ${v.spacing}; samples are chosen by suffix position.`;
  frames.push(done);
  return {
    frames,
    tables: [
      {
        id: 'bwt',
        label: 'Sorted suffix rows and BWT',
        rows: index.rows.map((r) => String(r.index)),
        columns: ['SA (teaching check)', 'First F', 'Last / BWT L', 'Suffix'],
        cells: index.rows.flatMap((row) =>
          [row.sa, row.f, row.l, row.suffix].map((value, c) => ({
            id: `bwt:${row.index}:${c}`,
            row: row.index,
            column: c,
            value: String(value),
            detail: `Row ${row.index}; suffix starts at ${row.sa}. LF=${lfMapping(index, row.index)}. ${samples.has(row.index) ? `Sampled SA=${samples.get(row.index)}.` : 'Not sampled.'}`,
            revealAt: rowAt[row.index],
          }))
        ),
      },
      {
        id: 'occ',
        label: 'Occ(c,r): count in BWT[0:r], excluding r',
        rows: index.alphabet,
        columns: Array.from({ length: index.length + 1 }, (_, i) => String(i)),
        cells: index.alphabet.flatMap((c, row) =>
          index.occMatrix[c].map((value, column) => ({
            id: `occ:${row}:${column}`,
            row,
            column,
            value: String(value),
            detail: `Occ(${c},${column})=${value}; C(${c})=${index.cTable[c]}. Prefix excludes index ${column}.`,
            revealAt: rankAt,
          }))
        ),
      },
    ],
  };
}
