import { debruijnRun } from './algorithmLessons/debruijnRun';
import { minimapRun } from './algorithmLessons/minimapRun';
import { fmRun } from './algorithmLessons/fmRun';
import { wfaRun } from './algorithmLessons/wfaRun';
import { duelRun } from './algorithmLessons/duelRun';
import { pairwiseRun } from './algorithmLessons/pairwiseRun';
import { stringGraphRun } from './algorithmLessons/stringGraphRun';
import { phmmRun } from './algorithmLessons/phmmRun';
import { ghmmRun } from './algorithmLessons/ghmmRun';
import { ismRun } from './algorithmLessons/ismRun';
import { gwasRun } from './algorithmLessons/gwasRun';
import type { LessonRun, LessonValues } from './algorithmLessonTypes';

const lessonRuns: Record<string, (values: LessonValues) => LessonRun> = {
  gwas: gwasRun,
  ism: ismRun,
  ghmm: ghmmRun,
  phmm: phmmRun,
  'string-graph': stringGraphRun,
  pairwise: pairwiseRun,
  wfa: wfaRun,
  duel: duelRun,
  'fm-index': fmRun,
  minimap2: minimapRun,
  debruijn: debruijnRun,
};

export function runAlgorithmLesson(id: string, values: LessonValues): LessonRun {
  const compute = lessonRuns[id];
  if (!compute) throw new Error(`Unknown algorithm lesson: ${id}`);
  return compute(values);
}
