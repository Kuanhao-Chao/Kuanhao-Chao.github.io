import {
  createPlan7ModelFromMSA,
  runViterbi,
  runForwardBackward,
  DNA_ALPHABET,
  PROTEIN_ALPHABET,
} from '../phmm';
import type {
  LessonRun,
  LessonValues,
  LessonFrame,
  LessonTable,
  LessonGraph,
} from '../algorithmLessonTypes';
import { numberText, frame } from './common';

export function phmmRun(v: LessonValues): LessonRun {
  const model = createPlan7ModelFromMSA(
    v.msa,
    'Teaching profile',
    v.alphabet === 'dna' ? DNA_ALPHABET : PROTEIN_ALPHABET
  );
  const query = v.query.trim().toUpperCase();
  if (model.K > 8 || v.msa.trim().split(/\n/).length > 6 || query.length > 16)
    throw new Error(
      'Diagram limit: 8 match columns, 6 MSA rows and 16 query residues. Nothing was truncated.'
    );
  const best = runViterbi(model, query),
    fb = runForwardBackward(model, query);
  const sum = v.mode === 'forward';
  const events = sum ? fb.events : best.events;
  const frames: LessonFrame[] = [
    frame(
      'initialize',
      'A global profile core, not full Plan7',
      'Begin consumes nothing. Each M or I emits one query residue; D consumes a profile position silently.',
      0
    ),
  ];
  const emissionAt: number[] = [];
  for (let k = 1; k <= model.K; k++) {
    emissionAt[k] = frames.length;
    frames.push(
      frame(
        'model',
        `Estimate emission at M${k}`,
        `MSA column ${model.matchColumns[k - 1] + 1}; pseudocount 0.1 per alphabet letter. ${model.alphabet.map((a) => `${a}:${numberText(model.matchEmissions[k][a])}`).join(', ')}.`,
        0,
        [`node:M:${k}`]
      )
    );
  }
  const transitionAt = frames.length;
  frames.push(
    frame(
      'model',
      'Declare normalized transitions and End',
      'Interior M: .85 to next M, .08 to I, .07 to D. Interior I: .6 to next M, .4 to I. D: .7 to next M, .3 to next D. At final column M→End=.92, I→End=.6, D→End=1.',
      1
    )
  );
  const reveal = new Map<string, number>();
  for (const event of events) {
    const id = `dp:${event.state}:${event.i}:${event.k}`;
    reveal.set(id, frames.length);
    const operation = sum ? 'log-sum-exp' : 'maximum';
    const f = frame(
      'fill',
      `${event.state}(${event.i},${event.k}) = ${numberText(event.value)}`,
      event.candidates.length
        ? `${operation} of emission-inclusive candidates: ${event.candidates.map((c) => `${c.state}: ${numberText(c.value)}`).join('; ')}. ${event.state === 'D' ? 'Silent deletion uses the current row to its left.' : 'Emission consumes one query residue.'}`
        : 'Begin log probability is 0; impossible states are −∞.',
      event.state === 'D' ? 3 : 2,
      [id, `node:${event.state}:${event.k}`]
    );
    frames.push(f);
  }
  const posteriorAt = frames.length;
  frames.push(
    frame(
      'posterior',
      'Backward agrees with Forward at Begin',
      `log P(query)=${numberText(fb.logLikelihood)}; backward Begin=${numberText(fb.backwardM[0][0])}. M+I occupancy sums to one per emitted residue; silent D occupancy is not added to that sum.`,
      4
    )
  );
  for (const step of [...best.viterbiPath].reverse())
    frames.push(
      frame(
        'traceback',
        `Best path: ${step.stateType}${step.k}`,
        step.stateType === 'D'
          ? 'Silent deletion advances profile position, not query.'
          : `Emits query residue ${step.residueIdx}: ${step.char}.`,
        5,
        [`node:${step.stateType}:${step.k}`]
      )
    );
  const done = frame(
    'done',
    'Best path versus total probability',
    'Viterbi explains one most probable path. Forward sums all valid paths; a large posterior is conditional on this declared model, not proof of biological homology.',
    5
  );
  done.result = `Query ${query || '(empty)'}\nViterbi log P(path,query) ${numberText(best.logScore)}\nForward log P(query) ${numberText(fb.logLikelihood)}\nBest-path share P(best path | query) ${numberText(Math.exp(best.logScore - fb.logLikelihood))}\nBest path: ${best.viterbiPath.map((s) => `${s.stateType}${s.k}${s.stateType === 'D' ? '' : `:${s.char}`}`).join(' → ')}\nTransitions are fixed priors, not fitted from the MSA.`;
  frames.push(done);
  const matrices = sum
    ? { M: fb.forwardM, I: fb.forwardI, D: fb.forwardD }
    : { M: best.matrixM, I: best.matrixI, D: best.matrixD };
  const tables: LessonTable[] = (['M', 'I', 'D'] as const).map((state) => ({
    id: `dp-${state}`,
    label: `${sum ? 'Forward' : 'Viterbi'} ${state}: natural-log probabilities`,
    rows: ['0 / ∅', ...[...query].map((c, i) => `${i + 1} / ${c}`)],
    columns: Array.from({ length: model.K + 1 }, (_, k) => String(k)),
    cells: matrices[state].flatMap((row, i) =>
      row.map((value, k) => ({
        id: `dp:${state}:${i}:${k}`,
        row: i,
        column: k,
        value: numberText(value),
        detail: `${state}(${i},${k}); ${state === 'D' ? 'silent: same query row' : 'emits: previous query row'}. Value is a natural logarithm.`,
        revealAt: reveal.get(`dp:${state}:${i}:${k}`) ?? 0,
      }))
    ),
  }));
  tables.push({
    id: 'emissions',
    label: 'Normalized match emissions',
    rows: Array.from({ length: model.K }, (_, k) => `M${k + 1}`),
    columns: model.alphabet,
    cells: model.matchEmissions.slice(1).flatMap((em, row) =>
      model.alphabet.map((a, c) => ({
        id: `em:${row}:${c}`,
        row,
        column: c,
        value: numberText(em[a]),
        detail: `P(${a}|M${row + 1})=${em[a]}; estimated with 0.1 pseudocounts.`,
        revealAt: emissionAt[row + 1],
      }))
    ),
  });
  for (const [state, matrix] of [
    ['M', fb.posteriorM],
    ['I', fb.posteriorI],
  ] as const)
    tables.push({
      id: `posterior-${state}`,
      label: `Conditional ${state} occupancy; M+I totals 1 across each residue`,
      rows: [...query].map((c, i) => `${i + 1}/${c}`),
      columns: Array.from({ length: model.K + 1 }, (_, k) => String(k)),
      cells: matrix.slice(1).flatMap((row, i) =>
        row.map((value, k) => ({
          id: `post:${state}:${i}:${k}`,
          row: i,
          column: k,
          value: numberText(value),
          detail: `P(emitting state ${state}${k} for residue ${i + 1} | query)=${value}.`,
          revealAt: posteriorAt,
        }))
      ),
    });
  const nodes: LessonGraph['nodes'] = [
    { id: 'node:M:0', label: 'B', x: 35, y: 100, revealAt: 0, detail: 'Begin; M(0,0)=0 only.' },
  ];
  for (let k = 0; k <= model.K; k++)
    for (const state of ['M', 'I', 'D'] as const)
      if (state === 'I' || k > 0)
        nodes.push({
          id: `node:${state}:${k}`,
          label: `${state}${k}`,
          x: 65 + (k * 600) / Math.max(1, model.K),
          y: state === 'M' ? 100 : state === 'I' ? 220 : 310,
          revealAt: state === 'M' ? emissionAt[k] : transitionAt,
          detail:
            state === 'D'
              ? 'Silent deletion; no residue emitted.'
              : state === 'I'
                ? 'Uniform insertion emission; self-loop consumes one residue each time.'
                : 'Match emission estimated from the MSA.',
        });
  const edges: LessonGraph['edges'] = [];
  const add = (from: string, to: string, p: number) => {
    if (p)
      edges.push({
        id: `transition:${from}:${to}`,
        from: `node:${from}`,
        to: `node:${to}`,
        label: String(p),
        detail: `Declared transition probability ${p}; not learned from the MSA.`,
        revealAt: transitionAt,
      });
  };
  for (let k = 0; k <= model.K; k++) {
    add(`M:${k}`, `I:${k}`, model.transitions.MI[k]);
    add(`I:${k}`, `I:${k}`, model.transitions.II[k]);
    if (k < model.K) {
      add(`M:${k}`, `M:${k + 1}`, model.transitions.MM[k]);
      add(`M:${k}`, `D:${k + 1}`, model.transitions.MD[k]);
      add(`I:${k}`, `M:${k + 1}`, model.transitions.IM[k]);
      if (k > 0) {
        add(`D:${k}`, `M:${k + 1}`, model.transitions.DM[k]);
        add(`D:${k}`, `D:${k + 1}`, model.transitions.DD[k]);
      }
    }
  }
  nodes.push({
    id: 'node:E',
    label: 'E',
    x: 730,
    y: 100,
    revealAt: transitionAt,
    detail:
      'End is silent. Only the final profile column can terminate; its transition probability contributes to both Forward and Viterbi.',
  });
  for (const state of ['M', 'I', 'D'] as const)
    edges.push({
      id: `end:${state}`,
      from: `node:${state}:${model.K}`,
      to: 'node:E',
      label: String(model.endProbabilities[state]),
      revealAt: transitionAt,
      detail: 'Terminal probability is included in the score.',
    });
  return { frames, tables, graph: { nodes, edges } };
}
