/**
 * Pure TypeScript computational engine for Genome-Wide Association Studies (GWAS).
 * Provides statistical models (OLS regression, Wald tests, Logistic OR),
 * Linkage Disequilibrium (r²), Q-Q quantiles, genomic inflation (λ_GC),
 * Polygenic Risk Scoring (PRS), and rich biological trait presets.
 */

export interface SNP {
  id: string;
  rsid: string;
  chr: number;
  pos: number;
  ref: string;
  alt: string;
  effectAllele: string;
  otherAllele: string;
  maf: number;
  beta: number;
  se: number;
  tStat: number;
  pValue: number;
  negLog10P: number;
  gene: string;
  consequence: string;
  ldLead?: number; // r² with lead SNP in locus (0.0 to 1.0)
  isLead?: boolean;
  cumPos?: number;
}

export interface Chromosome {
  chr: number;
  name: string;
  lengthMb: number;
  snps: SNP[];
  cumPosStart: number;
  cumPosEnd: number;
}

export interface CohortIndividual {
  id: string;
  ancestry: 'EUR' | 'EAS' | 'AFR' | 'SAS';
  pc1: number;
  pc2: number;
  genotypes: number[]; // 0, 1, 2 minor allele count per SNP
  phenotype: number;   // Continuous trait or liability
  isCase: boolean;     // Binary case (1) or control (0)
}

export interface GWASPreset {
  id: string;
  name: string;
  trait: string;
  traitType: 'quantitative' | 'case-control';
  unit: string;
  description: string;
  clinicalNote: string;
  heritability: number; // h² (e.g. 0.45)
  sampleSize: number;   // N
  leadLociCount: number;
  leadGenes: string[];
  lambdaGCUnadjusted: number;
  lambdaGCAdjusted: number;
  chromosomes: Chromosome[];
  sampleCohort: CohortIndividual[];
  recombinationHotspots?: { chr: number; pos: number; rate: number }[];
  prsWeights?: { rsid: string; weight: number }[];
}

export interface RegressionStats {
  beta: number;
  se: number;
  tStat: number;
  pValue: number;
  rSquared: number;
  n: number;
}

export interface QQPoint {
  expected: number; // -log10(p_expected)
  observed: number; // -log10(p_observed)
  rsid: string;
  chr: number;
  pos: number;
  ciLower: number;
  ciUpper: number;
}

export interface GWASResult {
  preset: GWASPreset;
  snps: SNP[];
  leadSNPs: SNP[];
  lambdaGC: number;
  qqPoints: QQPoint[];
  adjustedForPCA: boolean;
  totalSNPs: number;
  significantCount: number; // p < 5e-8
  suggestiveCount: number;  // 5e-8 <= p < 1e-5
}

// ------------------------------------------------------------- Statistics --

/**
 * Computes Ordinary Least Squares (OLS) single-variant linear regression:
 * y = α + x * β + Z * γ + ε
 */
export function computeLinearRegression(
  x: number[],
  y: number[],
  covariates?: number[][]
): RegressionStats {
  const n = x.length;
  if (n < 3) {
    return { beta: 0, se: 1, tStat: 0, pValue: 1, rSquared: 0, n };
  }

  // If covariates provided (e.g. PC1, PC2), residualize y and x first (Frisch-Waugh-Lovell theorem)
  let adjX = x;
  let adjY = y;

  if (covariates && covariates.length > 0 && covariates[0].length === n) {
    adjX = residualize(x, covariates);
    adjY = residualize(y, covariates);
  }

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += adjX[i];
    sumY += adjY[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let ssXX = 0;
  let ssYY = 0;
  let ssXY = 0;

  for (let i = 0; i < n; i++) {
    const dx = adjX[i] - meanX;
    const dy = adjY[i] - meanY;
    ssXX += dx * dx;
    ssYY += dy * dy;
    ssXY += dx * dy;
  }

  if (ssXX <= 1e-12 || ssYY <= 1e-12) {
    return { beta: 0, se: 1, tStat: 0, pValue: 1, rSquared: 0, n };
  }

  const beta = ssXY / ssXX;
  const ssRes = Math.max(0, ssYY - beta * ssXY);
  const df = Math.max(1, n - (covariates ? covariates.length + 2 : 2));
  const s2 = ssRes / df;
  const se = Math.sqrt(Math.max(1e-15, s2 / ssXX));
  const tStat = beta / se;
  const pValue = tDistPValue(Math.abs(tStat), df);
  const rSquared = Math.max(0, Math.min(1, (ssXY * ssXY) / (ssXX * ssYY)));

  return { beta, se, tStat, pValue, rSquared, n };
}

/**
 * Residualize vector v against an array of covariate vectors Z using OLS projection.
 */
function residualize(v: number[], covariates: number[][]): number[] {
  const n = v.length;
  let res = [...v];
  const meanV = v.reduce((a, b) => a + b, 0) / n;
  res = res.map((val) => val - meanV);

  for (const cov of covariates) {
    const meanC = cov.reduce((a, b) => a + b, 0) / n;
    let dotCV = 0;
    let dotCC = 0;
    for (let i = 0; i < n; i++) {
      const dc = cov[i] - meanC;
      dotCV += dc * res[i];
      dotCC += dc * dc;
    }
    if (dotCC > 1e-12) {
      const gamma = dotCV / dotCC;
      for (let i = 0; i < n; i++) {
        res[i] -= gamma * (cov[i] - meanC);
      }
    }
  }
  return res;
}

/**
 * Approximate two-tailed p-value for Student's t distribution.
 */
function tDistPValue(t: number, df: number): number {
  if (t === 0 || isNaN(t)) return 1.0;
  if (df > 100) {
    // Normal approximation for large GWAS sample sizes
    const z = t;
    return 2.0 * normalCdfComplement(z);
  }
  // Hill's approximation for moderate df
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;
  return Math.min(1.0, Math.max(1e-300, incompleteBeta(x, a, b)));
}

/**
 * High-precision standard normal complementary CDF: 1 - Φ(z)
 */
function normalCdfComplement(z: number): number {
  if (z < 0) return 1.0 - normalCdfComplement(-z);
  if (z > 37) return 1e-300; // Underflow guard

  // Abramowitz and Stegun 7.1.26 approximation
  const p = 0.2316419;
  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;

  const t = 1.0 / (1.0 + p * z);
  const phi = (1.0 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z);
  const poly = ((((b5 * t + b4) * t + b3) * t + b2) * t + b1) * t;
  return Math.max(1e-300, phi * poly);
}

/**
 * Continued fraction for incomplete beta function I_x(a, b).
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x === 0) return 0;
  if (x === 1) return 1;

  const lbeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lbeta) / a;

  // Continued fraction evaluation
  const maxIt = 100;
  const eps = 1e-12;
  let c = 1.0;
  let d = 1.0 - (a + b) * x / (a + 1.0);
  if (Math.abs(d) < eps) d = eps;
  d = 1.0 / d;
  let h = d;

  for (let m = 1; m <= maxIt; m++) {
    const m2 = 2 * m;
    let num = (m * (b - m) * x) / ((a + m2 - 1.0) * (a + m2));
    d = 1.0 + num * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1.0 + num / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1.0 / d;
    h *= d * c;

    num = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1.0));
    d = 1.0 + num * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1.0 + num / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1.0 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1.0) < eps) break;
  }
  return Math.min(1.0, Math.max(0.0, front * h));
}

function logGamma(x: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = p[0];
  const t = x + g + 0.5;
  for (let i = 1; i < p.length; i++) {
    a += p[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Computes pairwise Linkage Disequilibrium correlation coefficient r² between two genotype dosage vectors.
 */
export function computeLinkageDisequilibrium(g1: number[], g2: number[]): number {
  const n = g1.length;
  if (n !== g2.length || n === 0) return 0;

  let sum1 = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i++) {
    sum1 += g1[i];
    sum2 += g2[i];
  }
  const mean1 = sum1 / n;
  const mean2 = sum2 / n;

  let ss1 = 0;
  let ss2 = 0;
  let ss12 = 0;

  for (let i = 0; i < n; i++) {
    const d1 = g1[i] - mean1;
    const d2 = g2[i] - mean2;
    ss1 += d1 * d1;
    ss2 += d2 * d2;
    ss12 += d1 * d2;
  }

  if (ss1 <= 1e-12 || ss2 <= 1e-12) return 0;
  const r = ss12 / Math.sqrt(ss1 * ss2);
  return Math.max(0, Math.min(1, r * r));
}

/**
 * Calculates Genomic Inflation Factor (λ_GC) from an array of p-values:
 * λ_GC = median(χ²_obs) / 0.454936
 */
export function computeGenomicInflation(pValues: number[]): number {
  if (pValues.length === 0) return 1.0;

  const chiSquares: number[] = [];
  for (const p of pValues) {
    if (p <= 0 || p >= 1) continue;
    const z = invNormalCdf(1.0 - p / 2.0);
    chiSquares.push(z * z);
  }

  if (chiSquares.length === 0) return 1.0;
  chiSquares.sort((a, b) => a - b);
  const mid = Math.floor(chiSquares.length / 2);
  const median =
    chiSquares.length % 2 !== 0
      ? chiSquares[mid]
      : (chiSquares[mid - 1] + chiSquares[mid]) / 2.0;

  return Number((median / 0.4549364231137603).toFixed(3));
}

/**
 * Inverse standard normal CDF: Φ⁻¹(p)
 */
function invNormalCdf(p: number): number {
  if (p <= 0) return -8.0;
  if (p >= 1) return 8.0;
  if (p === 0.5) return 0.0;

  const a = [
    2.50662823884,
    -18.61500062529,
    41.39119773534,
    -25.44106049637,
  ];
  const b = [
    -8.4735109309,
    23.08336743743,
    -21.06224101826,
    3.13082909833,
  ];
  const c = [
    0.3374754822726147,
    0.9761690190917186,
    0.1607979714918209,
    0.027643881033086358,
    0.0038405729373609,
    0.0003951896511919,
    0.0000321767881768,
    0.0000002888167364,
    0.0000003960315187,
  ];

  const y = p - 0.5;
  if (Math.abs(y) < 0.42) {
    const r = y * y;
    const num = y * (((a[3] * r + a[2]) * r + a[1]) * r + a[0]);
    const den = (((b[3] * r + b[2]) * r + b[1]) * r + b[0]) * r + 1.0;
    return num / den;
  }

  let r = p;
  if (y > 0) r = 1.0 - p;
  r = Math.log(-Math.log(r));
  let x = c[0];
  for (let i = 1; i < c.length; i++) {
    x += c[i] * Math.pow(r, i);
  }
  return y < 0 ? -x : x;
}

/**
 * Computes Q-Q plot observed vs. expected -log10(p) quantiles with 95% confidence intervals.
 */
export function computeQQQuantiles(snps: SNP[]): QQPoint[] {
  const m = snps.length;
  if (m === 0) return [];

  const sorted = [...snps].sort((a, b) => a.pValue - b.pValue);
  const points: QQPoint[] = [];

  for (let i = 0; i < m; i++) {
    const rank = i + 1;
    const pExp = (rank - 0.5) / m;
    const expNegLog = -Math.log10(pExp);
    const obsNegLog = sorted[i].negLog10P;

    const alpha = rank;
    const betaParam = m - rank + 1;
    const mean = alpha / (alpha + betaParam);
    const variance = (alpha * betaParam) / (Math.pow(alpha + betaParam, 2) * (alpha + betaParam + 1));
    const sd = Math.sqrt(variance);
    const pLower = Math.max(1e-15, mean - 1.96 * sd);
    const pUpper = Math.min(1.0, mean + 1.96 * sd);

    points.push({
      expected: Number(expNegLog.toFixed(3)),
      observed: Number(obsNegLog.toFixed(3)),
      rsid: sorted[i].rsid,
      chr: sorted[i].chr,
      pos: sorted[i].pos,
      ciLower: Number((-Math.log10(pUpper)).toFixed(3)),
      ciUpper: Number((-Math.log10(pLower)).toFixed(3)),
    });
  }

  return points;
}

/**
 * Calculates individual Polygenic Risk Score (PRS):
 * PRS_i = Σ (w_j * G_ij)
 */
export function computePRS(individualGenotypes: number[], effectWeights: number[]): number {
  let score = 0;
  const len = Math.min(individualGenotypes.length, effectWeights.length);
  for (let j = 0; j < len; j++) {
    score += individualGenotypes[j] * effectWeights[j];
  }
  return Number(score.toFixed(4));
}

// ------------------------------------------------------------- Presets Data --

/**
 * Seeded PRNG (Mulberry32) for deterministic, reproducible synthetic genomic cohorts.
 */
function createSeededRandom(seed: number = 42): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates synthetic genome-wide chromosomes with high-density lead loci and background null noise.
 */
function createSyntheticGenome(
  leadDefinitions: { chr: number; pos: number; rsid: string; gene: string; beta: number; maf: number; consequence: string; name: string }[],
  backgroundCountPerChr: number = 30,
  seed: number = 1001
): { chromosomes: Chromosome[]; allSnps: SNP[] } {
  const rand = createSeededRandom(seed);
  const chrLengthsMb = [
    248, 242, 198, 190, 181, 170, 159, 145, 138, 133,
    135, 133, 114, 107, 101, 90, 83, 80, 58, 64, 46, 50,
  ];

  const chromosomes: Chromosome[] = [];
  const allSnps: SNP[] = [];
  let currentCum = 0;

  for (let c = 1; c <= 22; c++) {
    const lenMb = chrLengthsMb[c - 1];
    const snps: SNP[] = [];
    const cumStart = currentCum;
    const cumEnd = currentCum + lenMb;

    const leadsOnChr = leadDefinitions.filter((l) => l.chr === c);

    // 1. Add background null/polygenic SNPs
    for (let s = 0; s < backgroundCountPerChr; s++) {
      const posMb = Number(((s + 0.5) * (lenMb / backgroundCountPerChr) + (rand() * 0.8 - 0.4)).toFixed(3));
      const posBp = Math.floor(posMb * 1_000_000);
      const maf = Number((0.05 + rand() * 0.45).toFixed(2));

      // Standard normal null z-score: Box-Muller transform
      const u1 = Math.max(1e-7, rand());
      const u2 = rand();
      const zNull = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
      const se = Number((0.02 + rand() * 0.015).toFixed(4));
      const beta = Number((zNull * se).toFixed(4));
      const tStat = Number((zNull).toFixed(2));
      const pVal = Math.max(1e-300, tDistPValue(Math.abs(zNull), 5000));
      const negLogP = Number((-Math.log10(pVal)).toFixed(2));

      const snp: SNP = {
        id: `chr${c}_${posBp}`,
        rsid: `rs${c}00${Math.floor(1000 + rand() * 9000)}`,
        chr: c,
        pos: posBp,
        ref: ['A', 'C', 'G', 'T'][s % 4],
        alt: ['G', 'T', 'A', 'C'][s % 4],
        effectAllele: ['G', 'T', 'A', 'C'][s % 4],
        otherAllele: ['A', 'C', 'G', 'T'][s % 4],
        maf,
        beta,
        se,
        tStat,
        pValue: pVal,
        negLog10P: negLogP,
        gene: `LOC${c}P${s + 1}`,
        consequence: 'intergenic_variant',
        ldLead: Number((rand() * 0.15).toFixed(2)),
        isLead: false,
        cumPos: cumStart + posMb,
      };
      snps.push(snp);
      allSnps.push(snp);
    }

    // 2. Add lead loci and flanking Linkage Disequilibrium correlation clouds
    for (const lead of leadsOnChr) {
      const leadPosBp = lead.pos;
      const leadPosMb = Number((lead.pos / 1_000_000).toFixed(3));
      const se = 0.018;
      const tStat = Number((lead.beta / se).toFixed(2));
      const pVal = Number(Math.max(1e-300, tDistPValue(Math.abs(tStat), 5000)).toExponential(3));
      const negLogP = Number((-Math.log10(pVal)).toFixed(2));

      const leadSnp: SNP = {
        id: `chr${c}_${leadPosBp}`,
        rsid: lead.rsid,
        chr: c,
        pos: leadPosBp,
        ref: 'C',
        alt: 'T',
        effectAllele: 'T',
        otherAllele: 'C',
        maf: lead.maf,
        beta: lead.beta,
        se,
        tStat,
        pValue: pVal,
        negLog10P: negLogP,
        gene: lead.gene,
        consequence: lead.consequence,
        ldLead: 1.0,
        isLead: true,
        cumPos: cumStart + leadPosMb,
      };
      snps.push(leadSnp);
      allSnps.push(leadSnp);

      // Add 8 flanking LD proxy SNPs decaying in r²
      const flankOffsets = [-180_000, -120_000, -60_000, -20_000, 25_000, 75_000, 140_000, 210_000];
      for (const offset of flankOffsets) {
        const flankPos = Math.max(10_000, leadPosBp + offset);
        const distKb = Math.abs(offset) / 1000;
        const r2 = Math.max(0.05, Number((Math.exp(-distKb / 60) * (0.85 + rand() * 0.15)).toFixed(2)));
        const flankBeta = Number((lead.beta * Math.sqrt(r2) + (rand() - 0.5) * 0.04).toFixed(4));
        const flankSe = Number((se * (1 + (1 - r2) * 0.3)).toFixed(4));
        const flankT = Number((flankBeta / flankSe).toFixed(2));
        const flankP = Math.max(1e-300, tDistPValue(Math.abs(flankT), 5000));
        const flankNegLog = Number((-Math.log10(flankP)).toFixed(2));

        const flankSnp: SNP = {
          id: `chr${c}_${flankPos}`,
          rsid: `rs${c}88${Math.floor(100 + rand() * 900)}`,
          chr: c,
          pos: flankPos,
          ref: 'A',
          alt: 'G',
          effectAllele: 'G',
          otherAllele: 'A',
          maf: Number(Math.max(0.05, Math.min(0.48, lead.maf + (rand() - 0.5) * 0.1)).toFixed(2)),
          beta: flankBeta,
          se: flankSe,
          tStat: flankT,
          pValue: flankP,
          negLog10P: flankNegLog,
          gene: lead.gene,
          consequence: 'intron_variant',
          ldLead: r2,
          isLead: false,
          cumPos: cumStart + flankPos / 1_000_000,
        };
        snps.push(flankSnp);
        allSnps.push(flankSnp);
      }
    }

    snps.sort((a, b) => a.pos - b.pos);

    chromosomes.push({
      chr: c,
      name: `chr${c}`,
      lengthMb: lenMb,
      snps,
      cumPosStart: cumStart,
      cumPosEnd: cumEnd,
    });

    currentCum = cumEnd;
  }

  return { chromosomes, allSnps };
}

/**
 * Synthesizes a sample individual cohort with ancestry labels, PCA coordinates, genotypes, and phenotypes.
 */
function createSampleCohort(numIndividuals: number = 60): CohortIndividual[] {
  const cohort: CohortIndividual[] = [];
  const ancestries: Array<'EUR' | 'EAS' | 'AFR' | 'SAS'> = ['EUR', 'EAS', 'AFR', 'SAS'];

  for (let i = 1; i <= numIndividuals; i++) {
    const anc = ancestries[i % 4];
    let pc1 = 0;
    let pc2 = 0;

    if (anc === 'EUR') {
      pc1 = Number((-0.035 + (Math.random() - 0.5) * 0.015).toFixed(4));
      pc2 = Number((0.025 + (Math.random() - 0.5) * 0.015).toFixed(4));
    } else if (anc === 'EAS') {
      pc1 = Number((0.045 + (Math.random() - 0.5) * 0.015).toFixed(4));
      pc2 = Number((0.03 + (Math.random() - 0.5) * 0.015).toFixed(4));
    } else if (anc === 'AFR') {
      pc1 = Number((-0.01 + (Math.random() - 0.5) * 0.02).toFixed(4));
      pc2 = Number((-0.045 + (Math.random() - 0.5) * 0.018).toFixed(4));
    } else {
      pc1 = Number((0.01 + (Math.random() - 0.5) * 0.018).toFixed(4));
      pc2 = Number((-0.01 + (Math.random() - 0.5) * 0.015).toFixed(4));
    }

    const genotypes: number[] = [];
    for (let s = 0; s < 25; s++) {
      const r = Math.random();
      genotypes.push(r < 0.6 ? 0 : r < 0.9 ? 1 : 2);
    }

    const basePheno = (Math.random() - 0.5) * 1.5;
    const pheno = Number((basePheno + genotypes[0] * 0.65 + pc1 * 4.0).toFixed(3));
    const isCase = pheno > 0.35;

    cohort.push({
      id: `IND_${i.toString().padStart(3, '0')}`,
      ancestry: anc,
      pc1,
      pc2,
      genotypes,
      phenotype: pheno,
      isCase,
    });
  }

  return cohort;
}

// ------------------------------------------------------------- Catalog Presets --

const T2D_LEADS = [
  { chr: 10, pos: 114758349, rsid: 'rs7903146', gene: 'TCF7L2', beta: 0.34, maf: 0.30, consequence: 'intron_variant (enhancer)', name: 'TCF7L2 Lead' },
  { chr: 8, pos: 118185025, rsid: 'rs13266634', gene: 'SLC30A8', beta: 0.16, maf: 0.32, consequence: 'missense_variant (Arg325Trp)', name: 'Zinc Transporter' },
  { chr: 6, pos: 20679790, rsid: 'rs7756992', gene: 'CDKAL1', beta: 0.18, maf: 0.28, consequence: 'intron_variant', name: 'CDKAL1 CDK5 Reg' },
  { chr: 11, pos: 2845681, rsid: 'rs2237892', gene: 'KCNQ1', beta: 0.24, maf: 0.38, consequence: 'intron_variant', name: 'K+ Channel Voltage' },
  { chr: 16, pos: 53801584, rsid: 'rs9939609', gene: 'FTO', beta: 0.15, maf: 0.42, consequence: 'intron_variant (IRX3/5 long-range)', name: 'FTO Adiposity' },
  { chr: 3, pos: 185523000, rsid: 'rs1801282', gene: 'PPARG', beta: -0.19, maf: 0.12, consequence: 'missense_variant (Pro12Ala)', name: 'PPARG Protective' },
];

const LDL_LEADS = [
  { chr: 1, pos: 55505647, rsid: 'rs11591147', gene: 'PCSK9', beta: -0.48, maf: 0.02, consequence: 'missense_variant (R46L Loss of Function)', name: 'PCSK9 LoF' },
  { chr: 19, pos: 11200038, rsid: 'rs688', gene: 'LDLR', beta: 0.31, maf: 0.44, consequence: 'synonymous_variant (Exon 12 splicing)', name: 'LDL Receptor' },
  { chr: 2, pos: 21229000, rsid: 'rs515135', gene: 'APOB', beta: 0.28, maf: 0.18, consequence: 'intron_variant', name: 'Apolipoprotein B' },
  { chr: 1, pos: 109817590, rsid: 'rs12740374', gene: 'SORT1', beta: -0.36, maf: 0.22, consequence: '3_prime_UTR_variant (C/EBP motif)', name: 'Sortilin Hepatic' },
  { chr: 5, pos: 74652140, rsid: 'rs12654264', gene: 'HMGCR', beta: -0.22, maf: 0.39, consequence: 'intron_variant (Statin Target)', name: 'HMGCR Reductase' },
];

const AD_LEADS = [
  { chr: 19, pos: 45411941, rsid: 'rs429358', gene: 'APOE', beta: 0.68, maf: 0.15, consequence: 'missense_variant (Cys112Arg, ε4 allele)', name: 'APOE-ε4 Major Locus' },
  { chr: 2, pos: 127890000, rsid: 'rs744373', gene: 'BIN1', beta: 0.22, maf: 0.37, consequence: 'upstream_gene_variant', name: 'Bridging Integrator 1' },
  { chr: 6, pos: 41129200, rsid: 'rs75932628', gene: 'TREM2', beta: 0.52, maf: 0.01, consequence: 'missense_variant (Arg47His Microglia)', name: 'TREM2 Microglia' },
  { chr: 8, pos: 27464000, rsid: 'rs11136000', gene: 'CLU', beta: -0.18, maf: 0.36, consequence: 'intron_variant', name: 'Clusterin Protective' },
  { chr: 11, pos: 85850000, rsid: 'rs3851179', gene: 'PICALM', beta: -0.16, maf: 0.46, consequence: 'upstream_gene_variant', name: 'Clathrin Assembly' },
];

const HEIGHT_LEADS = [
  { chr: 12, pos: 66200000, rsid: 'rs1042725', gene: 'HMGA2', beta: 0.18, maf: 0.48, consequence: 'intron_variant', name: 'HMGA2 Chromatin' },
  { chr: 20, pos: 34020000, rsid: 'rs143383', gene: 'GDF5', beta: -0.14, maf: 0.38, consequence: '5_prime_UTR_variant', name: 'Growth Diff Factor 5' },
  { chr: 4, pos: 17950000, rsid: 'rs11728284', gene: 'LCORL', beta: 0.16, maf: 0.32, consequence: 'intron_variant', name: 'LCORL Transcription' },
  { chr: 3, pos: 141150000, rsid: 'rs6763931', gene: 'ZBTB38', beta: 0.13, maf: 0.44, consequence: 'intron_variant', name: 'Zinc Finger ZBTB38' },
  { chr: 2, pos: 56120000, rsid: 'rs11124483', gene: 'EFEMP1', beta: 0.12, maf: 0.29, consequence: 'intron_variant', name: 'Extracellular Matrix' },
  { chr: 7, pos: 28100000, rsid: 'rs780094', gene: 'GCKR', beta: -0.11, maf: 0.40, consequence: 'intron_variant', name: 'Glucokinase Reg' },
];

const STRATIFIED_LEADS = [
  { chr: 15, pos: 28350000, rsid: 'rs1426654', gene: 'SLC24A5', beta: 0.46, maf: 0.50, consequence: 'missense_variant (Ancestry Informative)', name: 'Ancestry Stratified Marker' },
  { chr: 2, pos: 136608646, rsid: 'rs4988235', gene: 'LCT', beta: 0.42, maf: 0.48, consequence: 'upstream_variant (Lactase Persistence)', name: 'LCT Ancestry Divergent' },
  { chr: 11, pos: 5248232, rsid: 'rs334', gene: 'HBB', beta: 0.38, maf: 0.08, consequence: 'missense_variant (Sickle Cell HbS)', name: 'HBB Geographic Drift' },
];

export const GWAS_PRESETS: GWASPreset[] = [
  {
    id: 't2d',
    name: 'Type 2 Diabetes (T2D)',
    trait: 'Type 2 Diabetes Mellitus',
    traitType: 'case-control',
    unit: 'Log Odds Ratio (ln OR)',
    description:
      'Classic metabolic polygenic disease. Lead signal at rs7903146 in TCF7L2 impairs pancreatic β-cell insulin exocytosis and GLP-1 expression.',
    clinicalNote:
      'TCF7L2 rs7903146-T confers a 1.37-fold increased risk per allele (p = 1.2 × 10⁻¹⁹), representing the strongest single common risk locus identified for T2D.',
    heritability: 0.42,
    sampleSize: 120_000,
    leadLociCount: 6,
    leadGenes: ['TCF7L2', 'SLC30A8', 'CDKAL1', 'KCNQ1', 'FTO', 'PPARG'],
    lambdaGCUnadjusted: 1.04,
    lambdaGCAdjusted: 1.01,
    chromosomes: createSyntheticGenome(T2D_LEADS, 26).chromosomes,
    sampleCohort: createSampleCohort(60),
    prsWeights: [
      { rsid: 'rs7903146', weight: 0.34 },
      { rsid: 'rs2237892', weight: 0.24 },
      { rsid: 'rs7756992', weight: 0.18 },
      { rsid: 'rs13266634', weight: 0.16 },
      { rsid: 'rs9939609', weight: 0.15 },
    ],
  },
  {
    id: 'ldl',
    name: 'LDL Cholesterol & Coronary Artery Disease',
    trait: 'Circulating LDL Cholesterol (mg/dL)',
    traitType: 'quantitative',
    unit: 'mg/dL per allele (β)',
    description:
      'Lipid homeostasis and cardiovascular risk. Loss-of-function variants in PCSK9 (R46L) promote hepatic LDL receptor recycling and dramatically lower LDL levels.',
    clinicalNote:
      'PCSK9 rs11591147-T reduces circulating LDL by ~15 mg/dL (p = 3.8 × 10⁻²⁴) and reduces lifelong myocardial infarction risk by ~47%, inspiring PCSK9 monoclonal antibody therapeutics.',
    heritability: 0.58,
    sampleSize: 180_000,
    leadLociCount: 5,
    leadGenes: ['PCSK9', 'LDLR', 'APOB', 'SORT1', 'HMGCR'],
    lambdaGCUnadjusted: 1.05,
    lambdaGCAdjusted: 1.01,
    chromosomes: createSyntheticGenome(LDL_LEADS, 26).chromosomes,
    sampleCohort: createSampleCohort(60),
    prsWeights: [
      { rsid: 'rs11591147', weight: -0.48 },
      { rsid: 'rs12740374', weight: -0.36 },
      { rsid: 'rs688', weight: 0.31 },
      { rsid: 'rs515135', weight: 0.28 },
      { rsid: 'rs12654264', weight: -0.22 },
    ],
  },
  {
    id: 'ad',
    name: "Alzheimer's Disease (Late-Onset)",
    trait: "Late-Onset Alzheimer's Disease (LOAD)",
    traitType: 'case-control',
    unit: 'Log Odds Ratio (ln OR)',
    description:
      'Neurodegenerative disorder characterized by amyloid-β plaques and tau tangles. APOE-ε4 (rs429358) on chromosome 19 is the dominant genetic determinant of LOAD risk.',
    clinicalNote:
      'APOE-ε4 carriers have an OR ~3.5 (heterozygotes) to OR ~12.0 (homozygotes) compared to ε3/ε3 (p = 8.1 × 10⁻³²), shifting mean onset age ~10 years earlier.',
    heritability: 0.65,
    sampleSize: 95_000,
    leadLociCount: 5,
    leadGenes: ['APOE', 'BIN1', 'TREM2', 'CLU', 'PICALM'],
    lambdaGCUnadjusted: 1.06,
    lambdaGCAdjusted: 1.01,
    chromosomes: createSyntheticGenome(AD_LEADS, 26).chromosomes,
    sampleCohort: createSampleCohort(60),
    prsWeights: [
      { rsid: 'rs429358', weight: 0.68 },
      { rsid: 'rs75932628', weight: 0.52 },
      { rsid: 'rs744373', weight: 0.22 },
      { rsid: 'rs11136000', weight: -0.18 },
      { rsid: 'rs3851179', weight: -0.16 },
    ],
  },
  {
    id: 'height',
    name: 'Human Adult Height (Omnigenic Model)',
    trait: 'Standing Adult Stature (cm)',
    traitType: 'quantitative',
    unit: 'cm per allele (β)',
    description:
      'Archetypal polygenic trait with thousands of contributing variants. Demonstrates Fisher’s infinitesimal model and Boyle-Li-Pritchard’s omnigenic architecture.',
    clinicalNote:
      'No single common SNP explains >0.5% of height variance; genome-wide polygenic scores (PRS) combining >10,000 variants achieve r² ~ 0.40 prediction accuracy.',
    heritability: 0.80,
    sampleSize: 450_000,
    leadLociCount: 6,
    leadGenes: ['HMGA2', 'GDF5', 'LCORL', 'ZBTB38', 'EFEMP1', 'GCKR'],
    lambdaGCUnadjusted: 1.12,
    lambdaGCAdjusted: 1.02,
    chromosomes: createSyntheticGenome(HEIGHT_LEADS, 28).chromosomes,
    sampleCohort: createSampleCohort(60),
    prsWeights: [
      { rsid: 'rs1042725', weight: 0.18 },
      { rsid: 'rs11728284', weight: 0.16 },
      { rsid: 'rs143383', weight: -0.14 },
      { rsid: 'rs6763931', weight: 0.13 },
      { rsid: 'rs11124483', weight: 0.12 },
    ],
  },
  {
    id: 'stratified',
    name: 'Confounded Cohort (Population Stratification)',
    trait: 'Synthetic Ancestry-Correlated Phenotype',
    traitType: 'quantitative',
    unit: 'Arbitrary Phenotype Score',
    description:
      'Uncorrected ancestry differences generate massive false-positive inflation (λ_GC = 1.48) due to allele frequency divergence across continental populations.',
    clinicalNote:
      'Adjusting for top Principal Components (PC1–PC5) or Linear Mixed Models (LMM) eliminates spurious association spikes and restores the true null distribution (λ_GC = 1.01).',
    heritability: 0.15,
    sampleSize: 50_000,
    leadLociCount: 3,
    leadGenes: ['SLC24A5', 'LCT', 'HBB'],
    lambdaGCUnadjusted: 1.48,
    lambdaGCAdjusted: 1.01,
    chromosomes: createSyntheticGenome(STRATIFIED_LEADS, 26).chromosomes,
    sampleCohort: createSampleCohort(60),
    prsWeights: [
      { rsid: 'rs1426654', weight: 0.46 },
      { rsid: 'rs4988235', weight: 0.42 },
      { rsid: 'rs334', weight: 0.38 },
    ],
  },
];

/**
 * Runs full GWAS pipeline on a preset, returning calculated summary statistics, Manhattan points, Q-Q points, and lead signals.
 */
export function runGWAS(presetId: string = 't2d', adjustPCA: boolean = true): GWASResult {
  const preset = GWAS_PRESETS.find((p) => p.id === presetId) || GWAS_PRESETS[0];

  const snps: SNP[] = [];
  const leadSNPs: SNP[] = [];

  for (const chr of preset.chromosomes) {
    for (const rawSnp of chr.snps) {
      let finalNegLogP = rawSnp.negLog10P;
      let finalP = rawSnp.pValue;
      let finalBeta = rawSnp.beta;
      let finalSe = rawSnp.se;

      // In the stratified cohort without PCA correction, artificially inflate ancestry-linked variants
      if (preset.id === 'stratified' && !adjustPCA) {
        if (rawSnp.isLead || rawSnp.maf > 0.35) {
          finalNegLogP = Number((rawSnp.negLog10P + 4.5 + Math.random() * 2.0).toFixed(2));
          finalP = Number(Math.pow(10, -finalNegLogP).toExponential(3));
          finalBeta = Number((rawSnp.beta * 1.8).toFixed(4));
        } else {
          finalNegLogP = Number((rawSnp.negLog10P + 1.2 + Math.random() * 0.8).toFixed(2));
          finalP = Number(Math.pow(10, -finalNegLogP).toExponential(3));
        }
      }

      const calculatedSnp: SNP = {
        ...rawSnp,
        beta: finalBeta,
        se: finalSe,
        pValue: finalP,
        negLog10P: finalNegLogP,
      };

      snps.push(calculatedSnp);
      if (calculatedSnp.isLead) {
        leadSNPs.push(calculatedSnp);
      }
    }
  }

  const pValues = snps.map((s) => s.pValue);
  const lambdaGC = computeGenomicInflation(pValues);
  const qqPoints = computeQQQuantiles(snps);

  const significantCount = snps.filter((s) => s.negLog10P >= 7.301).length;
  const suggestiveCount = snps.filter((s) => s.negLog10P >= 5.0 && s.negLog10P < 7.301).length;

  return {
    preset,
    snps,
    leadSNPs,
    lambdaGC,
    qqPoints,
    adjustedForPCA: adjustPCA,
    totalSNPs: snps.length,
    significantCount,
    suggestiveCount,
  };
}
