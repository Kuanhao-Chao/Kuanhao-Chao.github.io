import { computeLinearRegression, dosageR2, dot, mean, type RegressionStats } from './gwasStats';

export interface TeachingOptions {
  seed: number;
  n: number;
  scenario: 'null' | 'causal' | 'stratified';
  adjustment: 0 | 1 | 2;
  lead: number;
}
export interface TeachingIndividual {
  id: string;
  group: 0 | 1;
  genotypes: number[];
  phenotype: number;
}
export interface TeachingVariant {
  index: number;
  id: string;
  chromosome: number;
  position: number;
  maf: number;
  fit: RegressionStats;
  negLog10P: number;
  ld: number;
}
export interface TeachingGWAS {
  options: TeachingOptions;
  cohort: TeachingIndividual[];
  validation: TeachingIndividual[];
  pcs: number[][];
  pcVariance: number[];
  variants: TeachingVariant[];
  lambda: number;
  qq: { id: string; expected: number; observed: number }[];
  prs: {
    weights: { index: number; weight: number }[];
    train: PredictionMetrics;
    test: PredictionMetrics;
  };
}
interface PredictionMetrics {
  n: number;
  predictions: number[];
  predictiveR2: number;
  correlationR2: number;
  mse: number;
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function cohort(options: TeachingOptions, seed: number, prefix: string): TeachingIndividual[] {
  const random = rng(seed),
    normal = () =>
      Math.sqrt(-2 * Math.log(Math.max(1e-12, random()))) * Math.cos(2 * Math.PI * random());
  return Array.from({ length: options.n }, (_, i) => {
    const group = (i % 2) as 0 | 1,
      genotypes: number[] = [];
    for (let block = 0; block < 8; block++) {
      const p = 0.32 + (block % 3) * 0.08 + (group ? 1 : -1) * 0.22;
      const haplotypes = [Number(random() < p), Number(random() < p)];
      for (let j = 0; j < 4; j++)
        genotypes.push(
          haplotypes.reduce((sum, a) => sum + (random() < 0.94 ? a : Number(random() < p)), 0)
        );
    }
    const phenotype =
      normal() +
      (options.scenario === 'causal' ? 0.9 * genotypes[5] : 0) +
      (options.scenario === 'stratified' ? 3 * (group - 0.5) : 0);
    return { id: `${prefix}${i + 1}`, group, genotypes, phenotype };
  });
}
/** Genotype-derived PCA on centered, variance-standardized dosage columns. */
function principalComponents(data: TeachingIndividual[]): {
  scores: number[][];
  variance: number[];
} {
  const n = data.length;
  const columns = Array.from({ length: 32 }, (_, j) => data.map((i) => i.genotypes[j]));
  const standardized = columns.map((col) => {
    const m = mean(col),
      ss = dot(
        col.map((v) => v - m),
        col.map((v) => v - m)
      ),
      sd = Math.sqrt(ss / Math.max(1, n - 1));
    return col.map((v) => (sd ? (v - m) / sd : 0));
  });
  const gram = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => standardized.reduce((sum, col) => sum + col[i] * col[j], 0))
  );
  const trace = gram.reduce((sum, row, i) => sum + row[i], 0),
    vectors: number[][] = [],
    variance: number[] = [],
    scores: number[][] = [];
  for (let component = 0; component < 2; component++) {
    let vector = Array.from({ length: n }, (_, i) => Math.sin((i + 1) * (component + 1) * 0.31));
    for (let iteration = 0; iteration < 160; iteration++) {
      const next = gram.map((row) => dot(row, vector));
      for (const previous of vectors) {
        const projection = dot(next, previous);
        for (let i = 0; i < n; i++) next[i] -= projection * previous[i];
      }
      const norm = Math.sqrt(dot(next, next));
      if (!norm) {
        vector = Array(n).fill(0);
        break;
      }
      const normalized = next.map((v) => v / norm),
        difference = Math.sqrt(
          dot(
            normalized.map((v, i) => v - vector[i]),
            normalized.map((v, i) => v - vector[i])
          )
        );
      vector = normalized;
      if (difference < 1e-11) break;
    }
    const eigenvalue = dot(
      vector,
      gram.map((row) => dot(row, vector))
    );
    const largest = vector.reduce(
      (idx, v, i) => (Math.abs(v) > Math.abs(vector[idx]) ? i : idx),
      0
    );
    if (vector[largest] < 0) vector = vector.map((v) => -v);
    vectors.push(vector);
    scores.push(vector.map((v) => v * Math.sqrt(Math.max(0, eigenvalue))));
    variance.push(trace ? eigenvalue / trace : 0);
  }
  return { scores, variance };
}
export function simulateTeachingGWAS(options: TeachingOptions): TeachingGWAS {
  if (
    !Number.isInteger(options.seed) ||
    options.seed < 1 ||
    options.seed > 1e6 ||
    !Number.isInteger(options.n) ||
    options.n < 40 ||
    options.n > 160 ||
    !Number.isInteger(options.lead) ||
    options.lead < 1 ||
    options.lead > 32 ||
    ![0, 1, 2].includes(options.adjustment) ||
    !['null', 'causal', 'stratified'].includes(options.scenario)
  )
    throw new Error('Use seed 1…1,000,000, N 40…160, lead 1…32, and a valid model/scenario.');
  const data = cohort(options, options.seed, 'train-'),
    validation = cohort(options, options.seed ^ 0x7f4a7c15, 'test-');
  const pca = principalComponents(data),
    covariates = pca.scores.slice(0, options.adjustment),
    y = data.map((i) => i.phenotype);
  const dosage = (j: number) => data.map((i) => i.genotypes[j]);
  const variants = Array.from({ length: 32 }, (_, j) => {
    const fit = computeLinearRegression(dosage(j), y, covariates),
      frequency = mean(dosage(j)) / 2;
    return {
      index: j,
      id: `sim${String(j + 1).padStart(2, '0')}`,
      chromosome: 1 + Math.floor(j / 8),
      position: 1 + (j % 8) * 10,
      maf: Math.min(frequency, 1 - frequency),
      fit,
      negLog10P: -Math.log10(fit.pValue),
      ld: dosageR2(dosage(j), dosage(options.lead - 1)),
    };
  });
  const sorted = [...variants].sort((a, b) => a.fit.pValue - b.fit.pValue),
    statistics = variants.map((v) => v.fit.tStat * v.fit.tStat).sort((a, b) => a - b);
  const lambda = (statistics[15] + statistics[16]) / 2 / 0.4549364231137603;
  const qq = sorted.map((v, i) => ({
    id: v.id,
    expected: -Math.log10((i + 0.5) / 32),
    observed: v.negLog10P,
  }));
  // Train-only selection: one strongest marginal association per known simulated
  // LD block. This is simple block pruning, not shrinkage/fine-mapping.
  const weights = Array.from({ length: 8 }, (_, block) => {
    const candidates = variants
      .slice(block * 4, block * 4 + 4)
      .sort((a, b) => a.fit.pValue - b.fit.pValue);
    return { index: candidates[0].index, weight: candidates[0].fit.beta };
  });
  const baseline = mean(y),
    centers = Array.from({ length: 32 }, (_, j) => mean(dosage(j)));
  const metrics = (individuals: TeachingIndividual[]): PredictionMetrics => {
    const predictions = individuals.map(
      (i) =>
        baseline +
        weights.reduce((sum, w) => sum + w.weight * (i.genotypes[w.index] - centers[w.index]), 0)
    );
    const outcomes = individuals.map((i) => i.phenotype),
      sse = outcomes.reduce((sum, v, i) => sum + (v - predictions[i]) ** 2, 0),
      nullSse = outcomes.reduce((sum, v) => sum + (v - baseline) ** 2, 0);
    return {
      n: individuals.length,
      predictions,
      predictiveR2: nullSse ? 1 - sse / nullSse : 0,
      correlationR2: dosageR2(predictions, outcomes),
      mse: sse / individuals.length,
    };
  };
  return {
    options: { ...options },
    cohort: data,
    validation,
    pcs: pca.scores,
    pcVariance: pca.variance,
    variants,
    lambda,
    qq,
    prs: { weights, train: metrics(data), test: metrics(validation) },
  };
}
