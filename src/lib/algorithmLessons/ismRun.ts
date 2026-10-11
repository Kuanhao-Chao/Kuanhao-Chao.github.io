import { computeIsm, DONOR_PWM, ACCEPTOR_PWM } from '../ism';
import type { LessonRun, LessonValues, LessonFrame, LessonTable } from '../algorithmLessonTypes';
import { numberText, frame } from './common';

export function ismRun(v: LessonValues): LessonRun {
  const r = computeIsm(v.sequence, v.type as 'donor' | 'acceptor', Number(v.junction));
  const terms = r.scoringDetails;
  const frames: LessonFrame[] = [
    frame(
      'initialize',
      'Declare the exact synthetic scorer',
      'Handwritten position weights → log-odds sum → logistic transform → core gate → clip to [0.01,0.99]. This is not neural inference or a clinical probability.',
      0
    ),
  ];
  const weightAt: number[] = [];
  for (const [i, c] of terms.contributions.entries()) {
    weightAt[i] = frames.length;
    frames.push(
      frame(
        'score',
        `Position ${c.index}: weight ${c.weight}`,
        `Base ${c.base}; log₂(max(weight,0.001)/0.25)=${numberText(c.logOdds)}.`,
        1,
        [...['A', 'C', 'G', 'T'].map((_, row) => `weight:${row}:${i}`)]
      )
    );
  }
  frames.push(
    frame(
      'reference',
      `Reference f(x)=${numberText(r.primaryRefScore)}`,
      `Log-odds sum ${numberText(terms.logOdds)}; core multiplier ${terms.gate}. Position labels skip zero at the junction boundary.`,
      2,
      [],
      [{ label: 'Scorer evaluations', value: '1' }]
    )
  );
  const cells: LessonTable['cells'] = [];
  const importanceAt: number[] = [];
  let evaluated = 1;
  for (const p of r.positions) {
    for (const [row, base] of ['A', 'C', 'G', 'T'].entries()) {
      const mutation = p.mutations[base],
        reference = base === p.refBase;
      const at = frames.length;
      if (!reference) evaluated++;
      frames.push(
        frame(
          reference ? 'reference base' : 'mutation',
          `${p.positionLabel} ${p.refBase}→${base}`,
          reference
            ? 'Reference base is copied, not recomputed. Δ=0.'
            : `f(mutant)=${numberText(mutation.score)}; Δ=f(mutant)−f(reference)=${numberText(mutation.delta)}. Negative = synthetic score loss; positive = gain. Preview does not change the sequence.`,
          3,
          [`mutation:${row}:${p.index}`],
          [{ label: 'Scorer evaluations', value: String(evaluated) }]
        )
      );
      cells.push({
        id: `mutation:${row}:${p.index}`,
        row,
        column: p.index,
        value: reference ? 'ref 0' : (mutation.delta > 0 ? '+' : '') + numberText(mutation.delta),
        detail: `${p.positionLabel} (zero-based index ${p.index}) ${p.refBase}→${base}; mutant score ${mutation.score.toFixed(6)}, reference ${r.primaryRefScore.toFixed(6)}, signed Δ ${mutation.delta.toFixed(6)}. ${reference ? 'This is already the reference base.' : 'Select Apply to make it the new reference.'}`,
        revealAt: at,
        tone:
          mutation.delta < -1e-12 ? 'negative' : mutation.delta > 1e-12 ? 'positive' : 'neutral',
        ...(reference ? {} : { mutation: { position: p.index, base } }),
      });
    }
    importanceAt[p.index] = frames.length;
    frames.push(
      frame(
        'importance',
        `Mean absolute change at ${p.positionLabel}`,
        `(|Δ₁|+|Δ₂|+|Δ₃|)/3 = ${numberText(p.importance)}. Both gain and loss contribute; this is model sensitivity, not biological causality.`,
        4,
        [`importance:${p.index}`]
      )
    );
  }
  const done = frame(
    'done',
    'Inspect, preview, then explicitly apply',
    'Apply starts a new reference and recomputes all deltas. Undo restores the previous sequence; Reset reference restores the submitted example.',
    5
  );
  done.result = `Synthetic ${r.siteType} scorer\nReference ${r.sequence.slice(0, r.junctionIndex)}|${r.sequence.slice(r.junctionIndex)}\nf(reference) ${r.primaryRefScore.toFixed(6)}\nScorer evaluations ${r.evaluations} = 1 reference + 3 × ${r.sequence.length} alternatives\nHighest mean absolute Δ at ${r.mostSensitivePosition.label}: ${r.mostSensitivePosition.importance.toFixed(6)}\nNo checkpoint, calibrated probability, clinical classification or causal inference.`;
  frames.push(done);
  const pwm = r.siteType === 'donor' ? DONOR_PWM : ACCEPTOR_PWM;
  return {
    frames,
    tables: [
      {
        id: 'mutations',
        label: 'Signed score changes: loss (red), gain (green); reference cells are zero',
        rows: ['A', 'C', 'G', 'T'],
        columns: r.positions.map((p) => `${p.positionLabel}/${p.refBase}`),
        cells,
      },
      {
        id: 'weights',
        label: 'Every handwritten model weight; columns are zero-based genomic indices',
        rows: ['A', 'C', 'G', 'T'],
        columns: terms.contributions.map((c) => String(c.index)),
        cells: pwm.flatMap((weights, c) =>
          ['A', 'C', 'G', 'T'].map((base, row) => ({
            id: `weight:${row}:${c}`,
            row,
            column: c,
            value: String(weights[base]),
            detail:
              'Fixed teaching weight, not estimated from human data. Zero weights are floored at .001 in log-odds.',
            revealAt: weightAt[c],
          }))
        ),
      },
    ],
    charts: [
      {
        id: 'importance',
        label: 'Mean absolute alternative score change (not a pathogenicity score)',
        xLabel: 'Zero-based sequence index',
        yLabel: 'Mean absolute Δ',
        xMax: r.sequence.length - 1,
        yMax: Math.max(0.01, r.maxImportance),
        points: r.positions.map((p) => ({
          id: `importance:${p.index}`,
          x: p.index,
          y: p.importance,
          label: `Position ${p.positionLabel}`,
          detail: `Mean absolute Δ ${p.importance.toFixed(6)}. Positions outside this handwritten scoring window have exactly zero effect by construction.`,
          revealAt: importanceAt[p.index],
        })),
      },
    ],
  };
}
