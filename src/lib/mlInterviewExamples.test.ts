import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Numerical provenance for every WorkedExample in the ML/DL interview curriculum.
 *
 * Each test starts from the inputs printed in its lesson, recomputes the result without
 * calling site code, and then checks that the rounded claim is actually present in the
 * published MDX. This two-sided check prevents either the arithmetic or the prose from
 * drifting while still looking “verified” in the rendered component.
 */

const DIR = 'src/content/deepDives';
const PROVENANCE = 'src/lib/mlInterviewExamples.test.ts';
const lesson = (id: string) => readFileSync(`${DIR}/${id}.mdx`, 'utf8');

const expectClaims = (mdx: string, claims: string[]) => {
  for (const claim of claims) expect(mdx, `missing published claim: ${claim}`).toContain(claim);
};

const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const transpose = (matrix: number[][]) =>
  matrix[0].map((_, column) => matrix.map((row) => row[column]));
const matMul = (a: number[][], b: number[][]) =>
  a.map((row) => transpose(b).map((column) => dot(row, column)));
const matVec = (matrix: number[][], vector: number[]) => matrix.map((row) => dot(row, vector));

describe('ML interview worked-example inventory', () => {
  it('keeps all 26 examples on this executable provenance seam', () => {
    const files = readdirSync(DIR).filter(
      (file) => file === 'ml-dl-interview.mdx' || /^ml-interview-.*\.mdx$/.test(file)
    );
    const examples = files.flatMap((file) => [
      ...readFileSync(`${DIR}/${file}`, 'utf8').matchAll(
        /<WorkedExample\b[\s\S]*?<\/WorkedExample>/g
      ),
    ]);

    expect(examples).toHaveLength(26);
    expect(
      examples.filter((example) => example[0].match(/\bverifiedBy="([^"]+)"/)?.[1] !== PROVENANCE)
    ).toEqual([]);
  });
});

describe('ML interview worked-example arithmetic', () => {
  it('Turn fourteen days into an interview loop', () => {
    const mdx = lesson('ml-dl-interview');
    const days = 14;
    const minutesPerSession = 90;
    const totalMinutes = days * minutesPerSession;
    const synthesisSessions = Math.floor(days / 3);

    expect(totalMinutes).toBe(1260);
    expect(totalMinutes / 60).toBe(21);
    expect(synthesisSessions).toBe(4);
    expectClaims(mdx, ['1{,}260$ minutes', '21 hours', 'four designated synthesis sessions']);
  });

  it('Shape, parameters, compute and context for two convolutions', () => {
    const mdx = lesson('ml-interview-cnn-vision');
    const inputWidth = 32;
    const kernel = 3;
    const stride1 = 2;
    const padding = 1;
    const channelsIn = 3;
    const channelsOut = 16;
    const width1 = Math.floor((inputWidth + 2 * padding - (kernel - 1) - 1) / stride1 + 1);
    const parameters1 = channelsOut * (kernel * kernel * channelsIn + 1);
    const macs1 = width1 * width1 * channelsOut * kernel * kernel * channelsIn;
    const receptiveField1 = 1 + (kernel - 1) * 1;
    const jump1 = stride1;
    const receptiveField2 = receptiveField1 + (kernel - 1) * jump1;

    expect(width1).toBe(16);
    expect(parameters1).toBe(448);
    expect(macs1).toBe(110592);
    expect([receptiveField1, jump1, receptiveField2]).toEqual([3, 2, 7]);
    expectClaims(mdx, [
      '=16$',
      '1\\times16\\times16\\times16',
      '=448$',
      '=110{,}592',
      'r_1=1+(3-1)\\cdot1=3',
      'j_1=2',
      'r_2=3+(3-1)\\cdot2=7',
    ]);
  });

  it('Stable BCE survives an extreme wrong logit', () => {
    const mdx = lesson('ml-interview-coding-project-defense');
    const z = -1000;
    const y = 1;
    const stableLoss = Math.max(z, 0) - y * z + Math.log1p(Math.exp(-Math.abs(z)));
    const gradient = 1 / (1 + Math.exp(-z)) - y;

    expect(stableLoss).toBe(1000);
    expect(gradient).toBe(-1);
    expect(Number.isFinite(stableLoss)).toBe(true);
    expectClaims(mdx, ['\\approx1000', 'gradient approximately $-1$']);
  });

  it('Correct an oversampled posterior for deployment prevalence', () => {
    const mdx = lesson('ml-interview-data-features-validation');
    const sampledPrevalence = 0.5;
    const deploymentPrevalence = 0.01;
    const sampledPosterior = 0.8;
    const sampledOdds = sampledPosterior / (1 - sampledPosterior);
    const correctedOdds =
      (sampledOdds * (deploymentPrevalence / (1 - deploymentPrevalence))) /
      (sampledPrevalence / (1 - sampledPrevalence));
    const correctedPosterior = correctedOdds / (1 + correctedOdds);

    expect(sampledOdds).toBeCloseTo(4, 12);
    expect(correctedOdds).toBeCloseTo(0.040404, 6);
    expect(correctedPosterior).toBeCloseTo(0.03883, 5);
    expect(correctedPosterior * 100).toBeCloseTo(3.88, 2);
    expectClaims(mdx, ['0.040404', '0.03883', '**3.88%**']);
  });

  it('Expected calibration error exposes one confident bad bin', () => {
    const mdx = lesson('ml-interview-debugging-robustness-responsible-ml');
    const counts = [100, 100];
    const confidence = [0.2, 0.8];
    const positives = [18, 60];
    const total = counts.reduce((sum, count) => sum + count, 0);
    const accuracies = positives.map((positive, i) => positive / counts[i]);
    const ece = counts.reduce(
      (sum, count, i) => sum + (count / total) * Math.abs(accuracies[i] - confidence[i]),
      0
    );

    expect(accuracies).toEqual([0.18, 0.6]);
    expect(ece).toBeCloseTo(0.11, 12);
    expect((confidence[1] - accuracies[1]) * 100).toBeCloseTo(20, 12);
    expectClaims(mdx, ['$.18$ and $.60$', '=.01+.10=.11', '20 percentage points']);
  });

  it('One-dimensional VAE KL and ELBO', () => {
    const mdx = lesson('ml-interview-generative-models');
    const mu = 1;
    const sigma = 0.5;
    const reconstruction = -1.2;
    const kl = 0.5 * (mu * mu + sigma * sigma - Math.log(sigma * sigma) - 1);
    const elbo = reconstruction - kl;

    expect(kl).toBeCloseTo(0.8181, 4);
    expect(elbo).toBeCloseTo(-2.0181, 4);
    expect(-elbo).toBeCloseTo(2.0181, 4);
    expectClaims(mdx, ['=0.8181', '=-2.0181', 'loss is $2.0181$']);
  });

  it('Normalize one node in a three-node path', () => {
    const mdx = lesson('ml-interview-graph-time-series');
    const degrees = [2, 3, 2];
    const features = [1, 2, 4];
    const normalized = features.reduce(
      (sum, feature, i) => sum + feature / Math.sqrt(degrees[1] * degrees[i]),
      0
    );
    const plainMean = features.reduce((sum, feature) => sum + feature, 0) / features.length;

    expect(normalized).toBeCloseTo(2.708, 3);
    expect(plainMean).toBeCloseTo(2.333, 3);
    expectClaims(mdx, ['\\tilde d=[2,3,2]', '\\approx2.708', '7/3\\approx2.333']);
  });

  it('A little shrinkage lowers expected error', () => {
    const mdx = lesson('ml-interview-learning-theory-generalization');
    const mu = 3;
    const noiseVariance = 4;
    const n = 4;
    const shrinkage = 0.9;
    const bias = (shrinkage - 1) * mu;
    const squaredBias = bias * bias;
    const variance = shrinkage * shrinkage * (noiseVariance / n);
    const predictionError = noiseVariance + squaredBias + variance;
    const baselineError = noiseVariance + noiseVariance / n;

    expect(bias).toBeCloseTo(-0.3, 12);
    expect(squaredBias).toBeCloseTo(0.09, 12);
    expect(variance).toBeCloseTo(0.81, 12);
    expect(predictionError).toBeCloseTo(4.9, 12);
    expect(baselineError).toBe(5);
    expect(noiseVariance / n - variance).toBeCloseTo(0.19, 12);
    expectClaims(mdx, ['$0.09$', '$0.9^2(4/4)=0.81$', '=4.90', '$5.00$', '$0.19$ variance']);
  });

  it('PCA of two perfectly correlated features', () => {
    const mdx = lesson('ml-interview-linear-algebra-calculus');
    const x = [
      [-1, -1],
      [0, 0],
      [1, 1],
    ];
    const covariance = matMul(transpose(x), x).map((row) => row.map((value) => value / x.length));
    const trace = covariance[0][0] + covariance[1][1];
    const determinant = covariance[0][0] * covariance[1][1] - covariance[0][1] ** 2;
    const discriminant = Math.sqrt(trace * trace - 4 * determinant);
    const eigenvalues = [(trace + discriminant) / 2, (trace - discriminant) / 2];
    const principal = [1 / Math.sqrt(2), 1 / Math.sqrt(2)];
    const orthogonal = [1 / Math.sqrt(2), -1 / Math.sqrt(2)];
    const scores = x.map((row) => dot(row, principal));

    expect(covariance.flat()).toEqual(Array(4).fill(expect.closeTo(2 / 3, 12)));
    expect(eigenvalues).toEqual([expect.closeTo(4 / 3, 12), 0]);
    expect(matVec(covariance, principal)).toEqual(
      principal.map((value) => expect.closeTo((4 / 3) * value, 12))
    );
    expect(matVec(covariance, orthogonal)).toEqual([expect.closeTo(0, 12), expect.closeTo(0, 12)]);
    expect(scores).toEqual([
      expect.closeTo(-Math.sqrt(2), 12),
      0,
      expect.closeTo(Math.sqrt(2), 12),
    ]);
    expect(eigenvalues[0] / trace).toBe(1);
    expectClaims(mdx, [
      '2/3&2/3',
      'eigenvalues $4/3$ and $0$',
      'explains $100\\%$',
      '[-\\sqrt2,0,\\sqrt2]',
    ]);
  });

  it('Solve and diagnose a two-feature least-squares problem', () => {
    const mdx = lesson('ml-interview-linear-kernel-probabilistic-models');
    const x = [
      [1, 0],
      [1, 1],
      [1, 2],
    ];
    const y = [1, 2, 2];
    const xt = transpose(x);
    const xtx = matMul(xt, x);
    const xty = matVec(xt, y);
    const determinant = xtx[0][0] * xtx[1][1] - xtx[0][1] * xtx[1][0];
    const inverse = [
      [xtx[1][1] / determinant, -xtx[0][1] / determinant],
      [-xtx[1][0] / determinant, xtx[0][0] / determinant],
    ];
    const weights = matVec(inverse, xty);
    const predictions = matVec(x, weights);
    const residuals = y.map((target, i) => target - predictions[i]);
    const augmented = x.map((row) => [...row, 2 * row[1]]);
    const augmentedGram = matMul(transpose(augmented), augmented);
    const augmentedDeterminant =
      augmentedGram[0][0] *
        (augmentedGram[1][1] * augmentedGram[2][2] - augmentedGram[1][2] * augmentedGram[2][1]) -
      augmentedGram[0][1] *
        (augmentedGram[1][0] * augmentedGram[2][2] - augmentedGram[1][2] * augmentedGram[2][0]) +
      augmentedGram[0][2] *
        (augmentedGram[1][0] * augmentedGram[2][1] - augmentedGram[1][1] * augmentedGram[2][0]);

    expect(xtx).toEqual([
      [3, 3],
      [3, 5],
    ]);
    expect(xty).toEqual([5, 6]);
    expect(determinant).toBe(6);
    expect(inverse).toEqual([
      [expect.closeTo(5 / 6, 12), expect.closeTo(-1 / 2, 12)],
      [expect.closeTo(-1 / 2, 12), expect.closeTo(1 / 2, 12)],
    ]);
    expect(weights).toEqual([expect.closeTo(7 / 6, 12), expect.closeTo(1 / 2, 12)]);
    expect(predictions).toEqual([7 / 6, 5 / 3, 13 / 6].map((value) => expect.closeTo(value, 12)));
    expect(residuals).toEqual([-1 / 6, 1 / 3, -1 / 6].map((value) => expect.closeTo(value, 12)));
    expect(residuals.reduce((sum, value) => sum + value, 0)).toBeCloseTo(0, 12);
    expect(augmentedGram[2]).toEqual([6, 10, 20]);
    expect(augmentedDeterminant).toBe(0);
    expectClaims(mdx, [
      '\\begin{bmatrix}3&3\\\\3&5',
      '\\begin{bmatrix}5\\\\6',
      '15-9=6',
      '7/6\\\\1/2',
      '[-1/6,1/3,-1/6]',
    ]);
  });

  it('Localize a RAG failure before changing the model', () => {
    const mdx = lesson('ml-interview-llm-adaptation-rag-agents');
    const queries = 100;
    const retrieved = 80;
    const groundedCorrect = 60;
    const unsupportedCorrect = 5;

    expect(retrieved / queries).toBe(0.8);
    expect(groundedCorrect / retrieved).toBe(0.75);
    expect((groundedCorrect + unsupportedCorrect) / queries).toBe(0.65);
    expect((queries * (groundedCorrect / retrieved)) / queries).toBe(0.75);
    expectClaims(mdx, ['$80/100=0.80$', '$60/80=0.75$', '$(60+5)/100=0.65$', '75%, not 100%']);
  });

  it('Budget a KV cache before choosing concurrency', () => {
    const mdx = lesson('ml-interview-llm-foundations');
    const bytes = 2 * 4 * 4096 * 32 * 8 * 128 * 2;
    const gib = bytes / 1024 ** 3;
    const mibPerSequence = bytes / 4 / 1024 ** 2;
    const fullHeadBytes = 2 * 4 * 4096 * 32 * 32 * 128 * 2;

    expect(bytes).toBe(2147483648);
    expect(gib).toBe(2);
    expect(mibPerSequence).toBe(512);
    expect(fullHeadBytes / 1024 ** 3).toBe(8);
    expectClaims(mdx, ['2{,}147{,}483{,}648', '=2\\ \\text{GiB}', '512 MiB per sequence', '8 GiB']);
  });

  it('Choose a threshold from expected cost', () => {
    const mdx = lesson('ml-interview-metrics-experimentation');
    const a = { tp: 90, fn: 10, fp: 180 };
    const b = { tp: 75, fn: 25, fp: 45 };
    const falseNegativeCost = 500;
    const falsePositiveCost = 20;
    const cost = (point: typeof a) => point.fn * falseNegativeCost + point.fp * falsePositiveCost;

    expect(a.tp / (a.tp + a.fn)).toBe(0.9);
    expect(a.tp / (a.tp + a.fp)).toBeCloseTo(0.333, 3);
    expect(b.tp / (b.tp + b.fn)).toBe(0.75);
    expect(b.tp / (b.tp + b.fp)).toBe(0.625);
    expect(cost(a)).toBe(8600);
    expect(cost(b)).toBe(13400);
    expect(b.fn - a.fn).toBe(15);
    expect(a.fp - b.fp).toBe(135);
    expectClaims(mdx, [
      '$90/100=0.90$',
      '$90/270=0.333$',
      '$0.75$',
      '$75/120=0.625$',
      '\\$8{,}600',
      '\\$13{,}400',
      '15 additional misses',
      '135 additional reviews',
    ]);
  });

  it('Size a replicated synchronous inference tier', () => {
    const mdx = lesson('ml-interview-ml-systems-mlops');
    const requestsPerSecond = 2400;
    const serviceSeconds = 0.04;
    const concurrency = 8;
    const utilization = 0.6;
    const reserve = 1.5;
    const inFlight = requestsPerSecond * serviceSeconds;
    const effectiveSlots = concurrency * utilization;
    const steadyReplicas = Math.ceil(inFlight / effectiveSlots);
    const failoverReplicas = Math.ceil(steadyReplicas * reserve);

    expect(inFlight).toBe(96);
    expect(effectiveSlots).toBe(4.8);
    expect(steadyReplicas).toBe(20);
    expect(failoverReplicas).toBe(30);
    expectClaims(mdx, ['=96$ requests', '=4.8$ effective', '=20$', '=30$ replicas']);
  });

  it('One ReLU neuron, forward and backward', () => {
    const mdx = lesson('ml-interview-neural-network-foundations');
    const x = [2, -1];
    const weights = [0.5, 1];
    const target = 1;
    const forward = (bias: number) => {
      const z = dot(x, weights) + bias;
      const hidden = Math.max(0, z);
      const prediction = 2 * hidden;
      const loss = 0.5 * (prediction - target) ** 2;
      return { z, hidden, prediction, loss };
    };
    const active = forward(1);
    const dLossDPrediction = active.prediction - target;
    const dLossDZ = dLossDPrediction * 2 * 1;

    expect(forward(0)).toEqual({ z: 0, hidden: 0, prediction: 0, loss: 0.5 });
    expect(forward(0.5)).toEqual({ z: 0.5, hidden: 0.5, prediction: 1, loss: 0 });
    expect(active).toEqual({ z: 1, hidden: 1, prediction: 2, loss: 0.5 });
    expect(dLossDPrediction).toBe(1);
    expect(dLossDZ).toBe(2);
    expect(x.map((value) => dLossDZ * value)).toEqual([4, -2]);
    expect(dLossDZ).toBe(2);
    expectClaims(mdx, [
      '$z=0.5$, $h=0.5$, $\\hat y=1$, and $L=0$',
      '$z=1$, $h=1$, $\\hat y=2$, and $L=\\tfrac12$',
      '=\\hat y-y=1,\\quad',
      '=2,\\quad',
      '=2x=[4,-2],\\qquad',
    ]);
  });

  it("Adam's bias correction on its first update", () => {
    const mdx = lesson('ml-interview-optimization-training');
    const gradient = 0.2;
    const beta1 = 0.9;
    const beta2 = 0.999;
    const learningRate = 0.001;
    const m1 = (1 - beta1) * gradient;
    const v1 = (1 - beta2) * gradient ** 2;
    const mHat = m1 / (1 - beta1);
    const vHat = v1 / (1 - beta2);
    const update = (-learningRate * mHat) / Math.sqrt(vHat);

    expect(m1).toBeCloseTo(0.02, 12);
    expect(v1).toBeCloseTo(0.00004, 12);
    expect(mHat).toBeCloseTo(0.2, 12);
    expect(vHat).toBeCloseTo(0.04, 12);
    expect(update).toBeCloseTo(-0.001, 12);
    expectClaims(mdx, ['=0.020', '=0.00004', '=0.20', '=0.04', '=-0.001']);
  });

  it('A good detector on a rare event', () => {
    const mdx = lesson('ml-interview-probability-statistics');
    const population = 10000;
    const prevalence = 0.01;
    const sensitivity = 0.9;
    const specificity = 0.95;
    const positives = population * prevalence;
    const negatives = population - positives;
    const truePositives = sensitivity * positives;
    const falsePositives = (1 - specificity) * negatives;
    const posterior = truePositives / (truePositives + falsePositives);

    expect([positives, negatives, truePositives, falsePositives]).toEqual([
      100,
      9900,
      90,
      expect.closeTo(495, 12),
    ]);
    expect(sensitivity * prevalence + (1 - specificity) * (1 - prevalence)).toBeCloseTo(0.0585, 12);
    expect(posterior).toBeCloseTo(0.1538, 4);
    expect(posterior * 100).toBeCloseTo(15.4, 1);
    expectClaims(mdx, [
      '100 positives and 9,900 negatives',
      '=90$ true positives',
      '=495$ false positives',
      '=0.1538',
      '**15.4%**',
    ]);
  });

  it('Compute NDCG@3 for graded relevance', () => {
    const mdx = lesson('ml-interview-recommenders-search-ranking');
    const gain = (relevance: number) => 2 ** relevance - 1;
    const dcg = (relevance: number[]) =>
      relevance.reduce((sum, rel, i) => sum + gain(rel) / Math.log2(i + 2), 0);
    const returnedDcg = dcg([2, 0, 1]);
    const idealDcg = dcg([2, 1, 0]);
    const ndcg = returnedDcg / idealDcg;

    expect(returnedDcg).toBeCloseTo(3.5, 12);
    expect(idealDcg).toBeCloseTo(3.63093, 5);
    expect(ndcg).toBeCloseTo(0.96394, 5);
    expectClaims(mdx, ['=3.5.', '\\approx3.63093.', '=0.96394']);
  });

  it('Solve a two-state Bellman system', () => {
    const mdx = lesson('ml-interview-reinforcement-learning-bandits');
    const gamma = 0.5;
    const valueB = 1 / (1 - gamma);
    const valueA = 2 + gamma * valueB;

    expect(valueB).toBe(2);
    expect(valueA).toBe(3);
    expect({ valueA: 2 + 0 * 1, valueB: 1 + 0 * 1 }).toEqual({ valueA: 2, valueB: 1 });
    expectClaims(mdx, ['$V(B)=2$ and $V(A)=3$', 'value A at 2 and B\nat 1']);
  });

  it('Turn a hypothetical speed claim into auditable impact', () => {
    const mdx = lesson('ml-interview-senior-behavioral-leadership');
    const minutesSaved = 18 - 11;
    const monthlyMinutes = minutesSaved * 700;
    const monthlyHours = monthlyMinutes / 60;

    expect(minutesSaved).toBe(7);
    expect(monthlyMinutes).toBe(4900);
    expect(monthlyHours).toBeCloseTo(81.7, 1);
    expect(Math.round(monthlyHours)).toBe(82);
    expectClaims(mdx, [
      'reduction is 7 minutes',
      '=4{,}900$ minutes',
      '$81.7$ hours/month',
      'about 82 compute-hours',
    ]);
  });

  it('One query attends to two values', () => {
    const mdx = lesson('ml-interview-sequences-attention-transformers');
    const query = [1, 0];
    const keys = [
      [1, 0],
      [0, 1],
    ];
    const values = [
      [2, 0],
      [0, 4],
    ];
    const logits = keys.map((key) => dot(query, key) / Math.sqrt(query.length));
    const normalizer = logits.reduce((sum, value) => sum + Math.exp(value), 0);
    const weights = logits.map((value) => Math.exp(value) / normalizer);
    const output = transpose(values).map((dimension) => dot(weights, dimension));
    const maskedOutput = transpose(values).map((dimension) => dot([1, 0], dimension));

    expect(logits).toEqual([expect.closeTo(0.7071, 4), 0]);
    expect(weights).toEqual([expect.closeTo(0.67, 3), expect.closeTo(0.33, 3)]);
    expect(output).toEqual([expect.closeTo(1.34, 3), expect.closeTo(1.321, 3)]);
    expect(maskedOutput).toEqual([2, 0]);
    expectClaims(mdx, ['[0.7071,0]', '[0.670,0.330]', '[1.340,1.321]', 'exactly $[2,0]$']);
  });

  it('Size a visual-retrieval index and candidate stream', () => {
    const mdx = lesson('ml-interview-system-design-case-studies');
    const items = 20_000_000;
    const dimensions = 768;
    const bytesPerValue = 2;
    const replicas = 3;
    const overhead = 1.3;
    const qps = 5000;
    const candidates = 200;
    const rawGb = (items * dimensions * bytesPerValue) / 1e9;
    const replicatedGb = rawGb * replicas * overhead;
    const candidatePairsPerSecond = qps * candidates;

    expect(rawGb).toBe(30.72);
    expect(replicatedGb).toBeCloseTo(119.808, 12);
    expect(candidatePairsPerSecond).toBe(1000000);
    expectClaims(mdx, ['=30.72$ GB', '=119.808$ GB', '=1{,}000{,}000$ query–candidate pairs']);
  });

  it('Score a binary split with Gini impurity', () => {
    const mdx = lesson('ml-interview-trees-ensembles-boosting');
    const gini = (counts: number[]) => {
      const total = counts.reduce((sum, count) => sum + count, 0);
      return 1 - counts.reduce((sum, count) => sum + (count / total) ** 2, 0);
    };
    const parent = gini([10, 10]);
    const left = gini([8, 2]);
    const right = gini([2, 8]);
    const weighted = 0.5 * left + 0.5 * right;

    expect(parent).toBeCloseTo(0.5, 12);
    expect([left, right]).toEqual([expect.closeTo(0.32, 12), expect.closeTo(0.32, 12)]);
    expect(weighted).toBeCloseTo(0.32, 12);
    expect(parent - weighted).toBeCloseTo(0.18, 12);
    expectClaims(mdx, ['=.5$', '=.32$', '$.5(.32)+.5(.32)=.32$', '$.5-.32=.18$']);
  });

  it('How much variance remains after averaging correlated trees?', () => {
    const mdx = lesson('ml-interview-trees-ensembles-boosting');
    const ensembleVariance = (variance: number, correlation: number, trees: number) =>
      variance * (correlation + (1 - correlation) / trees);
    const finiteVariance = ensembleVariance(1, 0.2, 25);
    const alternativeVariance = ensembleVariance(1.1, 0.1, 25);

    expect(finiteVariance).toBeCloseTo(0.232, 12);
    expect((1 - finiteVariance) * 100).toBeCloseTo(76.8, 12);
    expect(ensembleVariance(1, 0.2, Number.POSITIVE_INFINITY)).toBeCloseTo(0.2, 12);
    expect(alternativeVariance).toBeCloseTo(0.1496, 12);
    expectClaims(mdx, ['=.232.', '$76.8\\%$', 'leave\n$.20$', '=.1496$']);
  });

  it('One GMM responsibility calculation', () => {
    const mdx = lesson('ml-interview-unsupervised-representation-learning');
    const responsibility = (prior1: number, density1: number, prior2: number, density2: number) => {
      const weight1 = prior1 * density1;
      const weight2 = prior2 * density2;
      return { weight1, weight2, r1: weight1 / (weight1 + weight2) };
    };
    const balanced = responsibility(0.5, 0.12, 0.5, 0.03);
    const shifted = responsibility(0.1, 0.12, 0.9, 0.03);

    expect(balanced).toEqual({ weight1: 0.06, weight2: 0.015, r1: 0.8 });
    expect(1 - balanced.r1).toBeCloseTo(0.2, 12);
    expect(shifted.weight1).toBeCloseTo(0.012, 12);
    expect(shifted.weight2).toBeCloseTo(0.027, 12);
    expect(shifted.r1).toBeCloseTo(0.308, 3);
    expectClaims(mdx, [
      '=.06$ and $.5(.03)=.015$',
      '=.8,\\qquad r_2=.2',
      '=.012/(.012+.027)\\approx.308',
    ]);
  });

  it('Variance explained and reconstruction error', () => {
    const mdx = lesson('ml-interview-unsupervised-representation-learning');
    const x = [
      [2, 0],
      [0, 1],
      [-2, 0],
      [0, -1],
    ];
    const xtx = matMul(transpose(x), x);
    const covariance = xtx.map((row) => row.map((value) => value / x.length));
    const explained = covariance[0][0] / (covariance[0][0] + covariance[1][1]);
    const reconstructed = x.map(([horizontal]) => [horizontal, 0]);
    const squaredError = x.reduce(
      (sum, row, i) =>
        sum + row.reduce((inner, value, j) => inner + (value - reconstructed[i][j]) ** 2, 0),
      0
    );

    expect(xtx).toEqual([
      [8, 0],
      [0, 2],
    ]);
    expect(covariance).toEqual([
      [2, 0],
      [0, 0.5],
    ]);
    expect(explained).toBeCloseTo(0.8, 12);
    expect(squaredError).toBe(2);
    expectClaims(mdx, [
      '\\operatorname{diag}(8,2)',
      '\\operatorname{diag}(2,.5)',
      '=.8$, or 80%',
      'error is 2',
    ]);
  });
});
