export interface BinaryScore {
  score: number;
  label: 0 | 1;
}

export interface BinaryMetrics {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  precision: number;
  recall: number;
  specificity: number;
  f1: number;
}

const safeRate = (numerator: number, denominator: number) =>
  denominator === 0 ? 0 : numerator / denominator;

/** Evaluate one operational threshold, rather than averaging over thresholds the
 * deployed system will never use. Scores equal to the threshold are positive. */
export function binaryMetricsAtThreshold(
  observations: readonly BinaryScore[],
  threshold: number
): BinaryMetrics {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('threshold must be a finite probability in [0, 1]');
  }

  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const observation of observations) {
    if (!Number.isFinite(observation.score) || observation.score < 0 || observation.score > 1) {
      throw new RangeError('scores must be finite probabilities in [0, 1]');
    }
    const predicted = observation.score >= threshold ? 1 : 0;
    if (predicted === 1 && observation.label === 1) tp += 1;
    else if (predicted === 1) fp += 1;
    else if (observation.label === 0) tn += 1;
    else fn += 1;
  }

  const precision = safeRate(tp, tp + fp);
  const recall = safeRate(tp, tp + fn);
  const specificity = safeRate(tn, tn + fp);
  return {
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    specificity,
    f1: safeRate(2 * precision * recall, precision + recall),
  };
}

/** Numerically stable temperature-scaled softmax. The max shift is algebraically
 * invisible after normalization and prevents exponent overflow. */
export function softmaxWithTemperature(logits: readonly number[], temperature = 1): number[] {
  if (!logits.length || logits.some((value) => !Number.isFinite(value))) {
    throw new RangeError('softmax needs at least one finite logit');
  }
  if (!Number.isFinite(temperature) || temperature <= 0) {
    throw new RangeError('temperature must be finite and positive');
  }
  const scaled = logits.map((value) => value / temperature);
  const maximum = Math.max(...scaled);
  const weights = scaled.map((value) => Math.exp(value - maximum));
  const normalizer = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / normalizer);
}

export interface DescentPoint {
  step: number;
  parameter: number;
  loss: number;
  gradient: number;
}

/** Exact gradient descent on L(theta)=curvature*theta²/2. Its stability boundary
 * eta*curvature=2 makes learning-rate intuition visible without optimizer folklore. */
export function quadraticDescent({
  initial,
  learningRate,
  curvature = 1,
  steps,
}: {
  initial: number;
  learningRate: number;
  curvature?: number;
  steps: number;
}): DescentPoint[] {
  if (![initial, learningRate, curvature, steps].every(Number.isFinite)) {
    throw new RangeError('quadratic descent inputs must be finite');
  }
  if (learningRate < 0 || curvature <= 0 || !Number.isInteger(steps) || steps < 0 || steps > 200) {
    throw new RangeError('invalid learning rate, curvature, or step count');
  }

  const history: DescentPoint[] = [];
  let parameter = initial;
  for (let step = 0; step <= steps; step += 1) {
    const gradient = curvature * parameter;
    history.push({ step, parameter, gradient, loss: 0.5 * curvature * parameter * parameter });
    parameter -= learningRate * gradient;
  }
  return history;
}

export interface BiasVariancePoint {
  complexity: number;
  sampleSize: number;
  biasSquared: number;
  variance: number;
  noise: number;
  expectedTestError: number;
}

/** A transparent teaching model, not an empirical law. Complexity reduces the chosen
 * approximation-bias term and increases the chosen estimation-variance term. */
export function biasVarianceToy(
  complexity: number,
  sampleSize: number,
  irreducibleNoise = 0.08
): BiasVariancePoint {
  if (
    ![complexity, sampleSize, irreducibleNoise].every(Number.isFinite) ||
    complexity <= 0 ||
    sampleSize <= 0 ||
    irreducibleNoise < 0
  ) {
    throw new RangeError('complexity and sample size must be positive; noise cannot be negative');
  }
  const biasSquared = 0.9 / (complexity + 0.8) ** 1.7;
  const variance = complexity ** 1.65 / (5 * sampleSize);
  return {
    complexity,
    sampleSize,
    biasSquared,
    variance,
    noise: irreducibleNoise,
    expectedTestError: biasSquared + variance + irreducibleNoise,
  };
}
