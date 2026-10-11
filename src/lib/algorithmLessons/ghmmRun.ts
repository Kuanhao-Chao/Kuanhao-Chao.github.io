import { runGhmmGeneFinder, evaluateDurationScore } from '../ghmm';
import type { LessonRun, LessonValues, LessonFrame } from '../algorithmLessonTypes';
import { numberText, frame } from './common';

export function ghmmRun(v: LessonValues): LessonRun {
  const r = runGhmmGeneFinder(v.dna, Number(v.duration));
  const end = Number(v.end);
  if (end > r.sequence.length)
    throw new Error(
      'Candidate endpoint exceeds the DNA length. Endpoints are prefix lengths, from 1 through L.'
    );
  const candidates = r.candidates.filter((c) => c.end === end);
  const frames: LessonFrame[] = [
    frame(
      'initialize',
      'Declare a restricted complete-gene grammar',
      'One forward-strand gene or no gene; introns include GT…AG. Handcrafted weighted scores are not calibrated likelihoods.',
      0
    ),
  ];
  const modelAt = frames.length;
  frames.push(
    frame(
      'duration',
      'Normalize bounded durations',
      `Maximum segment length ${r.durationLimit}. Duration weights normalize on each state’s declared support; changing the bound renormalizes them.`,
      1
    )
  );
  const candidateAt: number[] = [];
  for (const [i, c] of candidates.entries()) {
    candidateAt[i] = frames.length;
    const f = frame(
      c.valid ? 'candidate' : 'reject',
      `${c.state} [${c.start},${c.end}) from ${c.previous}`,
      `${c.reason} Pending codon: ${c.pendingBefore || '∅'} → ${c.pendingAfter || '∅'}. ${c.valid ? `Total ${numberText(c.total)} = predecessor + transition ${numberText(c.transitionScore)} + duration ${numberText(c.durationScore)} + sensor ${numberText(c.sensorScore)}. ${c.selected ? 'Improved its destination when evaluated.' : 'Did not improve its destination.'}` : 'This candidate cannot contribute to an optimum.'}`,
      c.valid ? 3 : 2,
      [...Array.from({ length: 6 }, (_, col) => `candidate:${i}:${col}`), c.state]
    );
    frames.push(f);
  }
  frames.push(
    frame(
      'terminate',
      'Only complete genes may terminate',
      'Unfinished exon/intron states are excluded. Compare a complete start-to-stop path with the no-gene alternative after explaining the full region.',
      4
    )
  );
  const featureAt: number[] = [];
  for (const [i, f] of r.features.entries()) {
    featureAt[i] = frames.length;
    frames.push(
      frame(
        'traceback',
        `${f.subType}: ${f.start}…${f.end}`,
        `1-based inclusive coordinates; local score ${numberText(f.score)}. ${f.type === 'intron' ? 'Both GT donor and AG acceptor remain intronic.' : f.type === 'exon' ? `Carry-in partial-codon length ${f.readingFrame}; append ${f.sequence} to spliced CDS.` : 'Intergenic flank is not translated.'}`,
        5,
        [f.subType, ...Array.from({ length: 4 }, (_, c) => `feature:${i}:${c}`)]
      )
    );
  }
  const done = frame(
    'done',
    r.cdsSequence ? 'Complete coding path recovered' : 'No complete gene beats the background',
    'Transcript codons, not genomic position modulo 3, determine translation. Every selected CDS starts ATG, ends in-frame at a stop, and contains no earlier in-frame stop.',
    5
  );
  done.result = `DNA ${r.sequence}\nSpliced CDS ${r.cdsSequence || 'none'}\nProtein ${r.proteinTranslation || 'none'} (terminal stop not included)\nWeighted score ${numberText(r.totalScore)}\n${r.exonCount} exons, ${r.intronCount} introns\nShown candidates end at prefix ${end}; ${r.candidates.length} segment/predecessor candidates were tested in the full computation.`;
  frames.push(done);
  const grammar = [
    ['Intergenic', 65, 90],
    ['Exon_Init', 255, 60],
    ['Exon_Single', 255, 280],
    ['Intron', 430, 130],
    ['Exon_Int', 580, 55],
    ['Exon_Term', 650, 240],
  ] as const;
  return {
    frames,
    graph: {
      nodes: grammar.map(([id, x, y]) => ({
        id,
        label: id.replace('Exon_', ''),
        x,
        y,
        revealAt: 0,
        detail:
          id === 'Intron'
            ? 'Canonical GT…AG belongs inside the intron; preserve pending coding bases across it.'
            : id === 'Intergenic'
              ? 'Before-gene and after-gene backgrounds are distinct internal states, so a second gene cannot start.'
              : 'Coding state carries 0, 1 or 2 pending bases; the actual letters are retained, not just the phase.',
      })),
      edges: [
        ['Intergenic', 'Exon_Init', '.01'],
        ['Intergenic', 'Exon_Single', '.01'],
        ['Exon_Init', 'Intron', '1'],
        ['Intron', 'Exon_Int', '.5'],
        ['Exon_Int', 'Intron', '1'],
        ['Intron', 'Exon_Term', '.5'],
      ].map(([from, to, label], i) => ({
        id: `grammar:${i}`,
        from,
        to,
        label,
        revealAt: 0,
        detail:
          'Grammar transition. Complete terminal/single exons lead to after-gene background; unfinished states cannot end.',
      })),
    },
    tables: [
      {
        id: 'candidates',
        label: `All reachable predecessor/duration tests ending at prefix ${end}`,
        hideFutureRows: true,
        rows: candidates.map((_, i) => String(i + 1)),
        columns: [
          'state',
          'start',
          'pending before→after',
          'log duration',
          'sensor reward',
          'candidate score',
        ],
        cells: candidates.flatMap((c, row) =>
          [
            c.state,
            c.start,
            `${c.pendingBefore || '∅'}→${c.pendingAfter || '∅'}`,
            numberText(c.durationScore),
            numberText(c.sensorScore),
            c.valid ? numberText(c.total) : 'reject',
          ].map((value, col) => ({
            id: `candidate:${row}:${col}`,
            row,
            column: col,
            value: String(value),
            detail: c.reason,
            revealAt: candidateAt[row],
            tone: c.valid ? ('neutral' as const) : ('negative' as const),
          }))
        ),
      },
      {
        id: 'features',
        label: 'Selected features: 1-based inclusive coordinates, local score contributions',
        rows: r.features.map((f) => f.id),
        columns: ['type', 'start', 'end', 'sequence'],
        cells: r.features.flatMap((f, row) =>
          [f.subType, f.start, f.end, f.sequence].map((value, col) => ({
            id: `feature:${row}:${col}`,
            row,
            column: col,
            value: String(value),
            detail: `Local score ${numberText(f.score)}, length ${f.length}; ${f.type === 'exon' ? `pending base count ${f.readingFrame}` : 'not translated'}.`,
            revealAt: featureAt[row],
          }))
        ),
      },
      {
        id: 'duration',
        label:
          'Normalized duration probabilities (shortened teaching distributions, not real exon lengths)',
        rows: ['Exon_Init', 'Exon_Int', 'Exon_Term', 'Exon_Single', 'Intron'],
        columns: Array.from({ length: r.durationLimit }, (_, i) => String(i + 1)),
        cells: (['Exon_Init', 'Exon_Int', 'Exon_Term', 'Exon_Single', 'Intron'] as const).flatMap(
          (state, row) =>
            Array.from({ length: r.durationLimit }, (_, i) => ({
              id: `duration:${row}:${i}`,
              row,
              column: i,
              value: numberText(Math.exp(evaluateDurationScore(state, i + 1, r.durationLimit))),
              detail: `P(duration=${i + 1} | ${state}) on the declared bounded support.`,
              revealAt: modelAt,
            }))
        ),
      },
    ],
  };
}
