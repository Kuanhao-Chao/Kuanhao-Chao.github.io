import { simulateTeachingGWAS } from '../gwasTeaching';
import type { LessonRun, LessonValues, LessonFrame, LessonTable } from '../algorithmLessonTypes';
import { numberText, frame } from './common';

export function gwasRun(v: LessonValues): LessonRun {
  const r = simulateTeachingGWAS({
    seed: Number(v.seed),
    n: Number(v.n),
    scenario: v.scenario as 'null' | 'causal' | 'stratified',
    adjustment: Number(v.adjust) as 0 | 1 | 2,
    lead: Number(v.lead),
  });
  const lead = r.variants[Number(v.lead) - 1];
  const frames: LessonFrame[] = [
    frame(
      'initialize',
      'Seeded genotypes and actual sample counts',
      `Training N=${r.cohort.length}; independent test N=${r.validation.length}; 32 synthetic markers in eight LD blocks. IDs and coordinates are fictional.`,
      0
    ),
  ];
  const cohortAt = frames.length;
  frames.push(
    frame(
      'cohort',
      'Generate dosage and quantitative phenotype',
      r.options.scenario === 'causal'
        ? 'Ground truth: phenotype = 0.9×sim06 dosage + Gaussian noise.'
        : r.options.scenario === 'stratified'
          ? 'Ground truth: phenotype = 3×(latent group−0.5) + Gaussian noise; no direct genetic effect.'
          : 'Ground truth: independent Gaussian phenotype; no direct genetic effect.',
      0
    )
  );
  const pcAt = frames.length;
  frames.push(
    frame(
      'PCA',
      'Compute PCs from standardized genotype columns',
      `Explained genotype variance: PC1 ${(r.pcVariance[0] * 100).toFixed(1)}%, PC2 ${(r.pcVariance[1] * 100).toFixed(1)}%. Fit ${v.adjust} PCs as covariates jointly with the intercept; do not force any inflation factor to one.`,
      1
    )
  );
  const variantAt: number[] = [];
  for (const variant of r.variants) {
    variantAt[variant.index] = frames.length;
    frames.push(
      frame(
        'regression',
        `${variant.id}: β=${numberText(variant.fit.beta)}`,
        `N=${variant.fit.n}; rank=${variant.fit.rank}; df=${variant.fit.df}; SE=${numberText(variant.fit.se)}; t=${numberText(variant.fit.tStat)}; two-sided Student-t p=${variant.fit.pValue.toExponential(3)}. ${variant.fit.identifiable ? 'Covariates were projected jointly using reorthogonalized QR.' : 'Variant is not identifiable after adjustment; p=1, not a discovered signal.'}`,
        2,
        [
          `manhattan:${variant.index}`,
          ...[0, 1, 2, 3, 4].map((c) => `variant:${variant.index}:${c}`),
        ]
      )
    );
  }
  const qqAt = frames.length;
  frames.push(
    frame(
      'diagnostics',
      'Inspect distribution, not just tallest peaks',
      `Approximate λ diagnostic: median(t²)/0.454936 = ${numberText(r.lambda)}. With 32 dependent tests and finite df, it is noisy and not proof of adequate confounding control. QQ ranks all actual fitted p-values.`,
      3
    )
  );
  const ldAt: number[] = [];
  for (const variant of r.variants) {
    ldAt[variant.index] = frames.length;
    frames.push(
      frame(
        'LD',
        `${variant.id} versus lead ${lead.id}`,
        `Measured dosage r²=${numberText(variant.ld)} in the same training cohort. Selecting a different lead recomputes LD but preserves seeded genotypes and association fits.`,
        4,
        [`ld:${variant.index}`, `regional:${variant.index}`]
      )
    );
  }
  const predictionAt = frames.length;
  frames.push(
    frame(
      'prediction',
      'Train-only block-pruned score; independent test',
      `Choose one smallest-p marker per known simulated block using training only. Fit weights before seeing test outcomes. Predictive R²: training ${numberText(r.prs.train.predictiveR2)}, independent test ${numberText(r.prs.test.predictiveR2)}. Negative test R² is possible.`,
      5
    )
  );
  const done = frame(
    'done',
    'Association ≠ causality ≠ prediction',
    'A synthetic peak can be causal, a correlated proxy, confounded or chance. The demo does not perform fine-mapping, a mixed model, or clinical risk assessment.',
    6
  );
  done.result = `Seed ${v.seed}; ${r.cohort.length} training and ${r.validation.length} independent test individuals\n32 OLS tests; adjustment ${v.adjust} genotype PCs\nLead ${lead.id}: β=${numberText(lead.fit.beta)}, SE=${numberText(lead.fit.se)}, p=${lead.fit.pValue.toExponential(4)}\nBonferroni teaching threshold 0.05/32=${(0.05 / 32).toExponential(3)}; ${r.variants.filter((x) => x.fit.pValue < 0.05 / 32).length} pass. Not the conventional 5×10⁻⁸ human-GWAS threshold.\nBlock-pruned score weights: ${r.prs.weights.map((w) => `${r.variants[w.index].id}:${numberText(w.weight)}`).join(', ')}\nPredictive R² train ${numberText(r.prs.train.predictiveR2)}, test ${numberText(r.prs.test.predictiveR2)}\nTest MSE ${numberText(r.prs.test.mse)}; squared prediction/outcome correlation ${numberText(r.prs.test.correlationR2)} (a different metric).`;
  frames.push(done);
  const action = (index: number) => ({ input: 'lead', value: String(index + 1) });
  const tables: LessonTable[] = [
    {
      id: 'cohort',
      label: 'Actual training cohort: latent labels are simulated, PCs are genotype-derived',
      rows: r.cohort.map((i) => i.id),
      columns: ['synthetic group', 'phenotype', 'PC1', 'PC2', ...r.variants.map((s) => s.id)],
      cells: r.cohort.flatMap((individual, row) =>
        [
          individual.group,
          numberText(individual.phenotype),
          numberText(r.pcs[0][row]),
          numberText(r.pcs[1][row]),
          ...individual.genotypes,
        ].map((value, col) => ({
          id: `cohort:${row}:${col}`,
          row,
          column: col,
          value: String(value),
          detail: `Individual ${individual.id}; all association calculations use these observed simulated values.`,
          revealAt: col === 2 || col === 3 ? pcAt : cohortAt,
        }))
      ),
    },
    {
      id: 'variants',
      label: 'Actual per-marker fits; activate a revealed cell to select the LD lead',
      rows: r.variants.map((s) => s.id),
      columns: ['β', 'SE', 't', 'two-sided p', 'MAF'],
      cells: r.variants.flatMap((s, row) =>
        [
          numberText(s.fit.beta),
          numberText(s.fit.se),
          numberText(s.fit.tStat),
          s.fit.pValue.toExponential(3),
          numberText(s.maf),
        ].map((value, col) => ({
          id: `variant:${row}:${col}`,
          row,
          column: col,
          value: String(value),
          detail: `${s.id}; chromosome ${s.chromosome}, fictional position ${s.position}. N=${s.fit.n}, df=${s.fit.df}; activate to choose as LD lead.`,
          revealAt: variantAt[row],
          action: action(row),
        }))
      ),
    },
  ];
  const range = (values: number[]) => ({
    min: Math.min(0, ...values),
    max: Math.max(0.01, ...values),
  });
  const pcX = range(r.pcs[0]),
    pcY = range(r.pcs[1]),
    fitX = range(lead.fit.residualX),
    fitY = range(lead.fit.residualY);
  const pMax = Math.max(-Math.log10(0.05 / 32) + 1, ...r.variants.map((s) => s.negLog10P)) + 1;
  const predictions = r.prs.test.predictions,
    predX = range(predictions),
    predY = range(r.validation.map((i) => i.phenotype));
  return {
    frames,
    tables,
    charts: [
      {
        id: 'pca',
        label: 'Genotype PCA: green group 1, red group 0 (synthetic labels)',
        xLabel: 'PC1 genotype score',
        yLabel: 'PC2 genotype score',
        xMin: pcX.min,
        xMax: pcX.max,
        yMin: pcY.min,
        yMax: pcY.max,
        points: r.cohort.map((i, index) => ({
          id: `pc:${index}`,
          x: r.pcs[0][index],
          y: r.pcs[1][index],
          label: i.id,
          detail: `${i.id}; latent group ${i.group}. PC coordinates came from genotype PCA, not hardcoded group positions.`,
          revealAt: pcAt,
          tone: i.group ? ('positive' as const) : ('negative' as const),
        })),
      },
      {
        id: 'manhattan',
        label:
          'Synthetic Manhattan plot; dashed line = 0.05/32; activate a marker to change the lead',
        xLabel: 'Synthetic marker order (4 chromosomes × 8 markers)',
        yLabel: '−log₁₀(two-sided Student-t p)',
        xMax: 33,
        yMax: pMax,
        threshold: -Math.log10(0.05 / 32),
        points: r.variants.map((s) => ({
          id: `manhattan:${s.index}`,
          x: s.index + 1,
          y: s.negLog10P,
          label: s.id,
          detail: `${s.id}, chr ${s.chromosome}; p=${s.fit.pValue.toExponential(4)}. Activate to select LD lead.`,
          revealAt: variantAt[s.index],
          action: action(s.index),
          tone: s.index === lead.index ? ('positive' as const) : ('neutral' as const),
        })),
      },
      {
        id: 'qq',
        label: 'Q–Q plot: observed fitted p-values versus uniform rank expectations',
        xLabel: 'Expected −log₁₀ p',
        yLabel: 'Observed −log₁₀ p',
        xMax: Math.max(1, ...r.qq.map((q) => q.expected)),
        yMax: pMax,
        diagonal: true,
        points: r.qq.map((q, i) => ({
          id: `qq:${i}`,
          x: q.expected,
          y: q.observed,
          label: q.id,
          detail: `Uniform rank expectation (rank−0.5)/32; observed value uses the actual OLS fit. LD makes tests dependent.`,
          revealAt: qqAt,
        })),
      },
      {
        id: 'regional',
        label: `Regional association on synthetic chromosome ${lead.chromosome}; green r²≥0.8 with ${lead.id}`,
        xLabel: 'Fictional position',
        yLabel: '−log₁₀ p',
        xMax: 80,
        yMax: pMax,
        points: r.variants
          .filter((s) => s.chromosome === lead.chromosome)
          .map((s) => ({
            id: `regional:${s.index}`,
            x: s.position,
            y: s.negLog10P,
            label: s.id,
            detail: `Association p=${s.fit.pValue.toExponential(4)}; dosage r² with ${lead.id}=${s.ld.toFixed(4)}. LD is not a posterior probability of causality.`,
            revealAt: ldAt[s.index],
            tone: s.ld >= 0.8 ? ('positive' as const) : ('neutral' as const),
            action: action(s.index),
          })),
      },
      {
        id: 'ld',
        label: `Measured LD to selected lead ${lead.id}, across all synthetic markers`,
        xLabel: 'Synthetic marker index',
        yLabel: 'Dosage r²',
        xMax: 33,
        yMax: 1,
        points: r.variants.map((s) => ({
          id: `ld:${s.index}`,
          x: s.index + 1,
          y: s.ld,
          label: s.id,
          detail: `Sample dosage r²=${s.ld.toFixed(6)}, calculated against ${lead.id}.`,
          revealAt: ldAt[s.index],
        })),
      },
      {
        id: 'regression',
        label: `Lead ${lead.id}: residualized phenotype and genotype; line uses the actual fitted slope`,
        xLabel: 'Dosage residual after intercept/covariates',
        yLabel: 'Phenotype residual after intercept/covariates',
        xMin: fitX.min,
        xMax: fitX.max,
        yMin: Math.min(fitY.min, lead.fit.beta * fitX.min, lead.fit.beta * fitX.max),
        yMax: Math.max(fitY.max, lead.fit.beta * fitX.min, lead.fit.beta * fitX.max),
        lines: [
          {
            x1: fitX.min,
            y1: lead.fit.beta * fitX.min,
            x2: fitX.max,
            y2: lead.fit.beta * fitX.max,
            label: 'FWL residual-space regression: intercept zero; slope from actual fit.',
            revealAt: variantAt[lead.index],
          },
        ],
        points: r.cohort.map((i, index) => ({
          id: `fit:${index}`,
          x: lead.fit.residualX[index],
          y: lead.fit.residualY[index],
          label: i.id,
          detail: `Joint covariate projection; fitted original-model intercept ${numberText(lead.fit.intercept)}. Residual-space intercept is zero.`,
          revealAt: variantAt[lead.index],
        })),
      },
      {
        id: 'prediction',
        label: 'Independent test prediction: no test outcomes used for weight selection',
        diagonal: true,
        xLabel: 'Predicted quantitative phenotype',
        yLabel: 'Observed quantitative phenotype',
        xMin: predX.min,
        xMax: predX.max,
        yMin: predY.min,
        yMax: predY.max,
        points: r.validation.map((i, index) => ({
          id: `test:${index}`,
          x: predictions[index],
          y: i.phenotype,
          label: i.id,
          detail: `Independent ${i.id}; predicted ${numberText(predictions[index])}, observed ${numberText(i.phenotype)}.`,
          revealAt: predictionAt,
        })),
      },
    ],
  };
}
