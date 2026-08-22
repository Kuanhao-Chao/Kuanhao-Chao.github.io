/**
 * The mathematics the deep-dive curriculum teaches, as pure functions.
 *
 * Three consumers share this module, and that sharing is the point:
 *
 *   1. `deepDiveExamples.test.ts` computes each lesson's worked-example numbers here and
 *      asserts they appear verbatim in the `.mdx`.
 *   2. The interactive widgets recompute live from the same functions, so a slider cannot
 *      contradict the prose beside it.
 *   3. `deepDiveMath.test.ts` checks these functions against *independently derived*
 *      values — closed forms, round-trip identities and textbook limits.
 *
 * Layer 3 is what keeps layer 1 honest. A test that merely imported this module and
 * compared it to the prose would prove only that the two agree, not that either is right;
 * the identity tests are what prove the functions themselves.
 *
 * Everything here is dimensionless or in the units named on the parameter. No I/O, no DOM.
 */

// ── Normal distribution ───────────────────────────────────────────────────────
// Written out rather than pulled from a dependency: these are used inside worked
// examples whose arithmetic a reader is invited to reproduce by hand, so the
// constants should be visible in the repository.

/** Standard normal density φ(z). */
export function normalPdf(z: number): number {
  return Math.exp(-(z * z) / 2) / Math.sqrt(2 * Math.PI);
}

/** Standard normal CDF Φ(z), via the erf approximation of Abramowitz & Stegun 7.1.26. */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Standard normal quantile Φ⁻¹(p), via Acklam's rational approximation (~1e-9). */
export function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError(`normalQuantile expects p in (0,1), got ${p}`);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - lo) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// ── Linkage disequilibrium ────────────────────────────────────────────────────

export interface LdMeasures {
  pA: number; pa: number; pB: number; pb: number;
  /** Gametic disequilibrium, p_AB − p_A p_B. Also the determinant of the 2×2 table. */
  D: number;
  /** D scaled by the largest |D| the marginal frequencies permit (Lewontin 1964). */
  Dprime: number;
  /** Squared correlation between the two loci scored 0/1 (Hill & Robertson 1968). */
  r2: number;
}

/**
 * All three LD measures from the four haplotype frequencies.
 *
 * They must sum to one; anything else is a data error rather than a degenerate case, so
 * it throws instead of returning a quietly wrong number.
 */
export function ldMeasures(pAB: number, pAb: number, paB: number, pab: number): LdMeasures {
  const total = pAB + pAb + paB + pab;
  if (Math.abs(total - 1) > 1e-9) {
    throw new RangeError(`haplotype frequencies must sum to 1, got ${total}`);
  }
  const pA = pAB + pAb;
  const pB = pAB + paB;
  const pa = 1 - pA;
  const pb = 1 - pB;
  const D = pAB - pA * pB;
  const Dmax = D > 0 ? Math.min(pA * pb, pa * pB) : Math.min(pA * pB, pa * pb);
  return { pA, pa, pB, pb, D, Dprime: Dmax === 0 ? 0 : D / Dmax, r2: (D * D) / (pA * pa * pB * pb) };
}

/**
 * Generations for LD to halve at recombination fraction θ, from D_t = D_0(1−θ)^t.
 * The familiar 0.693/θ is the θ→0 limit of this, and is ~5% high by θ = 0.1.
 */
export function ldHalfLife(theta: number): number {
  if (theta <= 0 || theta >= 1) throw new RangeError(`theta must be in (0,1), got ${theta}`);
  return Math.log(0.5) / Math.log(1 - theta);
}

/** Haldane's mapping function: genetic distance in Morgans → recombination fraction. */
export function haldaneTheta(morgans: number): number {
  return 0.5 * (1 - Math.exp(-2 * morgans));
}

/** Haldane inverted: recombination fraction → genetic distance in Morgans. */
export function haldaneMorgans(theta: number): number {
  if (theta >= 0.5) return Infinity;
  // `-0.5 * Math.log(1)` is negative zero, which formats as "-0.000 cM" in a readout.
  if (theta <= 0) return 0;
  return -0.5 * Math.log(1 - 2 * theta);
}

/** Kosambi's mapping function, which builds in crossover interference. */
export function kosambiTheta(morgans: number): number {
  return 0.5 * Math.tanh(2 * morgans);
}

/** Kosambi inverted: recombination fraction → genetic distance in Morgans. */
export function kosambiMorgans(theta: number): number {
  if (theta >= 0.5) return Infinity;
  if (theta <= 0) return 0;
  return 0.25 * Math.log((1 + 2 * theta) / (1 - 2 * theta));
}

// ── Heritability ──────────────────────────────────────────────────────────────

export interface ACE { h2: number; c2: number; e2: number }

/** Falconer's twin decomposition from the MZ and DZ phenotypic correlations. */
export function falconerACE(rMZ: number, rDZ: number): ACE {
  return { h2: 2 * (rMZ - rDZ), c2: 2 * rDZ - rMZ, e2: 1 - rMZ };
}

/**
 * Lee et al. (2011) observed-scale → liability-scale heritability.
 *
 * `K` is population prevalence, `P` the case fraction of the study. When P = K the sample
 * is not ascertained and this reduces to the classical K(1−K)/z² transformation.
 */
export function liabilityScale(h2Observed: number, K: number, P: number): number {
  const z = normalPdf(normalQuantile(1 - K));
  return (h2Observed * (K * K * (1 - K) * (1 - K))) / (z * z * P * (1 - P));
}

// ── Polygenic prediction ──────────────────────────────────────────────────────

/**
 * Infinitesimal shrinkage: the factor a marginal GWAS estimate is multiplied by to become
 * a posterior mean, 1/(1 + M/(Nh²)). Everything depends on the data through that one ratio
 * — variants per unit of heritable information.
 */
export function shrinkageFactor(N: number, M: number, h2: number): number {
  return 1 / (1 + M / (N * h2));
}

/** Daetwyler's expected squared correlation between score and phenotype. */
export function expectedR2(N: number, M: number, h2: number): number {
  return h2 * shrinkageFactor(N, M, h2);
}

/** The same relation inverted: the discovery N a target accuracy demands. */
export function sampleSizeForR2(targetR2: number, M: number, h2: number): number {
  if (targetR2 >= h2) return Infinity; // h² is the ceiling; it is approached, never reached
  return M / (h2 * (h2 / targetR2 - 1));
}

// ── Association power ─────────────────────────────────────────────────────────

/** Variance in the phenotype explained by one additive variant, q² = 2p(1−p)β²/σ². */
export function varianceExplained(maf: number, beta: number, sigma = 1): number {
  return (2 * maf * (1 - maf) * beta * beta) / (sigma * sigma);
}

/** Non-centrality parameter of the 1-df association test, λ = N q²/(1−q²). */
export function ncp(N: number, q2: number): number {
  return (N * q2) / (1 - q2);
}

/** Power of a two-sided test at genome-wide significance, given the NCP. */
export function powerFromNcp(lambda: number, alpha = 5e-8): number {
  const zc = normalQuantile(1 - alpha / 2);
  const s = Math.sqrt(lambda);
  return 1 - normalCdf(zc - s) + normalCdf(-zc - s);
}

/**
 * The NCP a target power requires, (z_{α/2} + z_power)².
 * At α = 5×10⁻⁸ and 80% power this is the familiar 39.60.
 */
export function ncpForPower(power = 0.8, alpha = 5e-8): number {
  return (normalQuantile(1 - alpha / 2) + normalQuantile(power)) ** 2;
}

/** Sample size for a target power at a given variance explained. */
export function sampleSizeForPower(q2: number, power = 0.8, alpha = 5e-8): number {
  const lambda = ncpForPower(power, alpha);
  return (lambda * (1 - q2)) / q2;
}

// ══════════════════════════════════════════════════════════════════════════════
// Genomic data & resources track
// ══════════════════════════════════════════════════════════════════════════════
// The data layer needs its own primitives: interval estimates for counts (an allele
// frequency and a LoF tally are both counts, and both are routinely misread as point
// estimates), the metrics benchmark suites are scored on, and the point system that
// turns an ACMG evidence tally into a probability.

// ── Incomplete gamma, for exact count intervals ───────────────────────────────
// Written out because the alternative — a Wilson–Hilferty approximation — is poor at
// exactly the small counts that matter here. A gene with zero observed LoF variants is
// the most constrained case there is, and that is where the approximation is worst.

/** Regularized lower incomplete gamma P(a, x). Series below a+1, continued fraction above. */
export function regularizedGammaP(a: number, x: number): number {
  if (x < 0 || a <= 0) throw new RangeError(`regularizedGammaP needs a > 0 and x >= 0`);
  if (x === 0) return 0;
  const lnGammaA = lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 500; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lnGammaA);
  }
  // Lentz's continued fraction for Q(a, x), then P = 1 − Q.
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lnGammaA) * h;
}

/** Lanczos approximation to ln Γ(z). */
export function lnGamma(z: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  const x = z - 1;
  let a = 0.99999999999980993;
  for (let i = 0; i < g.length; i++) a += g[i] / (x + i + 1);
  const t = x + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Quantile of the chi-square distribution, by bisection on the CDF. */
export function chi2Quantile(p: number, df: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return Infinity;
  let lo = 0;
  let hi = Math.max(df * 4, 10);
  while (regularizedGammaP(df / 2, hi / 2) < p) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (regularizedGammaP(df / 2, mid / 2) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Interval estimates for counts ─────────────────────────────────────────────

export interface Interval { lower: number; upper: number }

/**
 * Wilson score interval for a proportion.
 *
 * The right interval for an allele frequency. The textbook normal interval is useless
 * here — at AC = 0 it collapses to the single point zero, which is exactly the case a
 * reader most needs an interval for: "not seen" is not the same as "does not occur".
 */
export function wilsonInterval(successes: number, trials: number, level = 0.95): Interval {
  if (trials <= 0) throw new RangeError('wilsonInterval needs trials > 0');
  const z = normalQuantile(1 - (1 - level) / 2);
  const z2 = z * z;
  const centre = (successes + z2 / 2) / (trials + z2);
  const half =
    (z / (trials + z2)) * Math.sqrt((successes * (trials - successes)) / trials + z2 / 4);
  return { lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) };
}

/**
 * Garwood exact interval for a Poisson count, via the chi-square relationship.
 * Defined at k = 0, where the lower bound is 0 and the upper bound is not.
 */
export function poissonCI(count: number, level = 0.9): Interval {
  if (count < 0 || !Number.isInteger(count)) throw new RangeError('poissonCI needs a count >= 0');
  const alpha = 1 - level;
  return {
    lower: count === 0 ? 0 : 0.5 * chi2Quantile(alpha / 2, 2 * count),
    upper: 0.5 * chi2Quantile(1 - alpha / 2, 2 * count + 2),
  };
}

/**
 * The upper bound of the observed/expected ratio — which *is* LOEUF when the counts are
 * loss-of-function variants in a gene.
 *
 * gnomAD publishes the bound rather than the point estimate on purpose: a short gene can
 * show o/e = 0 on two expected LoF variants and look maximally constrained on almost no
 * evidence. The upper bound folds in how much evidence there was, so a gene only scores
 * low when the data can support it.
 */
export function oeUpperBound(observed: number, expected: number, level = 0.9): number {
  if (expected <= 0) throw new RangeError('oeUpperBound needs expected > 0');
  return poissonCI(observed, level).upper / expected;
}

// ── Benchmark metrics ─────────────────────────────────────────────────────────

/** Average ranks, with ties sharing their mean rank. */
function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const mean = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = mean;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation — the metric ProteinGym scores on, because a DMS assay's
 *  units are arbitrary and only the ordering of variants is comparable across assays. */
export function spearman(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 2) throw new RangeError('spearman needs equal lengths >= 2');
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((s, v) => s + v, 0) / n;
  const mb = rb.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db);
}

/** Area under the ROC curve, via the Mann–Whitney U identity (ties count a half). */
export function auroc(labels: number[], scores: number[]): number {
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] !== 1);
  if (!pos.length || !neg.length) throw new RangeError('auroc needs both classes present');
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/**
 * Area under the precision–recall curve, as average precision.
 *
 * The metric TraitGym reports, and it is the right one because its sets are a deliberate
 * 1 : 9 positive-to-control design. On imbalanced data AUROC flatters a model — the vast
 * negative class makes the false-positive rate look small however many it produces — while
 * AUPRC's baseline is the positive rate itself.
 */
export function auprc(labels: number[], scores: number[]): number {
  const n = labels.length;
  if (n !== scores.length || !n) throw new RangeError('auprc needs equal, non-empty inputs');
  const order = scores.map((s, i) => [s, i] as const).sort((a, b) => b[0] - a[0]);
  const total = labels.filter((l) => l === 1).length;
  if (!total) throw new RangeError('auprc needs at least one positive');
  let tp = 0;
  let fp = 0;
  let prevRecall = 0;
  let ap = 0;
  for (let i = 0; i < order.length; i++) {
    if (labels[order[i][1]] === 1) tp++;
    else fp++;
    // Only emit a point once the whole tie group is consumed, or precision is wrong.
    if (i + 1 < order.length && order[i + 1][0] === order[i][0]) continue;
    const recall = tp / total;
    const precision = tp / (tp + fp);
    ap += (recall - prevRecall) * precision;
    prevRecall = recall;
  }
  return ap;
}

/** The AUPRC a random ranking achieves: the positive rate. AUROC's is always 0.5. */
export function auprcBaseline(labels: number[]): number {
  return labels.filter((l) => l === 1).length / labels.length;
}

// ── ACMG evidence, as a probability ───────────────────────────────────────────

/**
 * Posterior probability of pathogenicity from an ACMG/AMP point tally
 * (Tavtigian et al. 2018, the Bayesian reading of the 2015 guidelines).
 *
 * Points are the evidence: very strong 8, strong 4, moderate 2, supporting 1, and
 * benign evidence the same magnitudes negative. The odds of pathogenicity for one very
 * strong criterion is 350, and each point is the eighth root of that — which is what makes
 * the categories combine multiplicatively instead of by counting rules.
 *
 * The classification thresholds fall out of the arithmetic rather than being decreed:
 * 10 points gives 0.994 and 6 gives 0.900, which are exactly the pathogenic and
 * likely-pathogenic boundaries the guidelines state.
 */
export function acmgPosterior(points: number, prior = 0.1, oddsVeryStrong = 350): number {
  const oddsPath = oddsVeryStrong ** (points / 8);
  return (oddsPath * prior) / ((oddsPath - 1) * prior + 1);
}

export type AcmgClass =
  | 'pathogenic' | 'likely-pathogenic' | 'uncertain' | 'likely-benign' | 'benign';

/** The five-tier ACMG classification a point tally lands in. */
export function acmgClassify(points: number): AcmgClass {
  if (points >= 10) return 'pathogenic';
  if (points >= 6) return 'likely-pathogenic';
  if (points >= -6) return points <= -1 ? 'likely-benign' : 'uncertain';
  return 'benign';
}

// ── Transcript coordinates ────────────────────────────────────────────────────

/** One exon, in genomic coordinates: 1-based, inclusive, `start <= end` on both strands. */
export interface Exon {
  start: number;
  end: number;
}

/**
 * Clip exons to the coding region and put them in transcription order.
 *
 * Everything about `c.` numbering follows from this one step, which is why it is shared
 * rather than repeated: on the minus strand transcription runs from the *high* genomic
 * coordinate downward, so the first coding exon is the last one in genomic order.
 *
 * `cdsStart` and `cdsEnd` are the first and last coding bases **in transcript orientation**,
 * so on the minus strand `cdsStart > cdsEnd`.
 */
function codingExons(exons: Exon[], cdsStart: number, cdsEnd: number, strand: '+' | '-'): Exon[] {
  const lo = Math.min(cdsStart, cdsEnd);
  const hi = Math.max(cdsStart, cdsEnd);
  const clipped = exons
    .map((e) => ({ start: Math.max(e.start, lo), end: Math.min(e.end, hi) }))
    .filter((e) => e.start <= e.end);
  return clipped.sort((a, b) => (strand === '+' ? a.start - b.start : b.start - a.start));
}

/**
 * Length of the coding sequence in nucleotides.
 *
 * Worth computing even when you do not need it: a CDS that is not a multiple of three is
 * a broken exon model, and the check costs nothing.
 */
export function cdsLength(exons: Exon[], cdsStart: number, cdsEnd: number, strand: '+' | '-'): number {
  return codingExons(exons, cdsStart, cdsEnd, strand).reduce((n, e) => n + (e.end - e.start + 1), 0);
}

/**
 * The CDS position (`c.`) of a genomic coordinate, or null if it falls outside the CDS.
 *
 * The answer depends on the transcript *and* the strand, and getting either wrong yields a
 * different, entirely plausible-looking number rather than an error — which is why a `c.`
 * coordinate quoted without its transcript accession is not a coordinate at all.
 */
export function cdsPosition(
  genomic: number,
  exons: Exon[],
  cdsStart: number,
  cdsEnd: number,
  strand: '+' | '-'
): number | null {
  let acc = 0;
  for (const e of codingExons(exons, cdsStart, cdsEnd, strand)) {
    if (genomic >= e.start && genomic <= e.end) {
      return acc + (strand === '+' ? genomic - e.start + 1 : e.end - genomic + 1);
    }
    acc += e.end - e.start + 1;
  }
  return null;
}

/** Which codon a CDS position falls in, and which of its three bases (1, 2 or 3). */
export function codonOf(cdsPos: number): { codon: number; offset: number } {
  const codon = Math.ceil(cdsPos / 3);
  return { codon, offset: cdsPos - 3 * (codon - 1) };
}

/**
 * Complement a single base. On the minus strand the reference and alternate alleles of a
 * VCF record are the opposite of the ones the `c.` description carries, and a pipeline that
 * transfers them unchanged produces a syntactically valid, wrong variant.
 */
export function complementBase(base: string): string {
  const map: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
  const up = base.toUpperCase();
  const out = map[up];
  if (!out) throw new Error(`complementBase: not a nucleotide: ${base}`);
  return base === up ? out : out.toLowerCase();
}

/**
 * phyloP reports a signed −log₁₀ p-value against a neutral-evolution null: positive means
 * slower substitution than neutral (conserved), negative means faster (accelerated). The
 * magnitude is what carries the significance, so the sign is dropped here.
 */
export function phylopToP(score: number): number {
  return 10 ** -Math.abs(score);
}

// ── Small dense linear algebra ────────────────────────────────────────────────
// Four consumers need to solve a symmetric system: Henderson's mixed model equations,
// LD-score regression's weighted least squares, the multivariate breeder's equation
// ΔZ = G P⁻¹ s, and MR-Egger. Rather than four hand-rolled 2×2 solves that only work
// for the size in the worked example, one solver that works for any n — small, exact
// arithmetic, no dependency, and testable against known inverses.

export type Matrix = number[][];

/** Aᵀ. */
export function transpose(A: Matrix): Matrix {
  if (A.length === 0) return [];
  return A[0].map((_, j) => A.map((row) => row[j]));
}

/** A·B. */
export function matMul(A: Matrix, B: Matrix): Matrix {
  const inner = B.length;
  if (A.some((r) => r.length !== inner)) throw new Error('matMul: shape mismatch');
  const cols = inner === 0 ? 0 : B[0].length;
  return A.map((row) => {
    const out = new Array<number>(cols).fill(0);
    for (let k = 0; k < inner; k += 1) {
      const a = row[k];
      if (a === 0) continue;
      for (let j = 0; j < cols; j += 1) out[j] += a * B[k][j];
    }
    return out;
  });
}

/** A·x. */
export function matVec(A: Matrix, x: number[]): number[] {
  return A.map((row) => {
    if (row.length !== x.length) throw new Error('matVec: shape mismatch');
    return row.reduce((s, a, j) => s + a * x[j], 0);
  });
}

/**
 * Solve A·x = b by Gaussian elimination with partial pivoting.
 *
 * Pivoting is not optional here even though every matrix this module builds is
 * symmetric: without it, a leading zero on the diagonal — which the mixed model
 * equations produce whenever a fixed effect is absent from the first record — divides
 * by zero and returns NaN rather than failing.
 */
export function solveLinear(A: Matrix, b: number[]): number[] {
  const n = b.length;
  if (A.length !== n || A.some((r) => r.length !== n)) throw new Error('solveLinear: A must be n×n');
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-14) throw new Error('solveLinear: matrix is singular');
    [M[col], M[pivot]] = [M[pivot], M[col]];

    for (let r = col + 1; r < n; r += 1) {
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i -= 1) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j += 1) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}

/** A⁻¹, by solving against each column of the identity. */
export function invert(A: Matrix): Matrix {
  const n = A.length;
  const cols = Array.from({ length: n }, (_, j) =>
    solveLinear(A, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)))
  );
  return transpose(cols);
}

// ── Hardy–Weinberg ────────────────────────────────────────────────────────────

export interface GenotypeCounts {
  /** Homozygous for the reference (major) allele. */
  AA: number;
  Aa: number;
  /** Homozygous for the alternate (minor) allele. */
  aa: number;
}

/** Allele frequency of `a` from genotype counts. */
export function alleleFrequency(g: GenotypeCounts): number {
  const n = g.AA + g.Aa + g.aa;
  return n === 0 ? 0 : (2 * g.aa + g.Aa) / (2 * n);
}

/** The counts Hardy–Weinberg predicts for the observed allele frequency and sample size. */
export function hweExpected(g: GenotypeCounts): GenotypeCounts {
  const n = g.AA + g.Aa + g.aa;
  const q = alleleFrequency(g);
  const p = 1 - q;
  return { AA: n * p * p, Aa: n * 2 * p * q, aa: n * q * q };
}

/**
 * Pearson χ² for departure from Hardy–Weinberg, on 1 degree of freedom.
 *
 * One degree of freedom, not two: three counts give two free proportions, and one more
 * is spent estimating the allele frequency from the same data.
 */
export function hweChiSquare(g: GenotypeCounts): number {
  const e = hweExpected(g);
  const term = (o: number, x: number) => (x === 0 ? 0 : ((o - x) ** 2) / x);
  return term(g.AA, e.AA) + term(g.Aa, e.Aa) + term(g.aa, e.aa);
}

/**
 * The exact Hardy–Weinberg test of Wigginton, Cutler & Abecasis (2005).
 *
 * χ² is an approximation that fails exactly where it is used hardest — a rare variant
 * with a handful of heterozygotes, where the expected homozygote count is well under 5.
 * The exact test conditions on the observed allele count and enumerates every
 * heterozygote count compatible with it, summing the probability of every arrangement
 * no more likely than the one observed.
 */
export function hweExactP(g: GenotypeCounts): number {
  const obsHets = g.Aa;
  const obsHom1 = g.AA;
  const obsHom2 = g.aa;
  if (obsHets < 0 || obsHom1 < 0 || obsHom2 < 0) throw new Error('hweExactP: negative count');

  const n = obsHets + obsHom1 + obsHom2;
  if (n === 0) return 1;
  // The rarer allele's count, which the test conditions on.
  const rare = 2 * Math.min(obsHom1, obsHom2) + obsHets;
  const probs = new Array<number>(rare + 1).fill(0);

  // Start from the most likely heterozygote count, which must share the parity of `rare`.
  let mid = Math.floor((rare * (2 * n - rare)) / (2 * n));
  if (mid % 2 !== rare % 2) mid += 1;

  probs[mid] = 1;
  let sum = 1;

  // Walk down in steps of two: each step converts one heterozygote pair into one of
  // each homozygote, and the ratio of the two multinomial terms telescopes to this.
  let hets = mid;
  let homR = (rare - mid) / 2;
  let homC = n - hets - homR;
  while (hets >= 2) {
    probs[hets - 2] = (probs[hets] * hets * (hets - 1)) / (4 * (homR + 1) * (homC + 1));
    sum += probs[hets - 2];
    homR += 1;
    homC += 1;
    hets -= 2;
  }

  hets = mid;
  homR = (rare - mid) / 2;
  homC = n - hets - homR;
  while (hets <= rare - 2) {
    probs[hets + 2] = (probs[hets] * 4 * homR * homC) / ((hets + 2) * (hets + 1));
    sum += probs[hets + 2];
    homR -= 1;
    homC -= 1;
    hets += 2;
  }

  const target = probs[obsHets] / sum;
  let p = 0;
  for (let i = 0; i <= rare; i += 1) {
    const pi = probs[i] / sum;
    // The 1e-7 slack keeps a tie from being excluded by floating-point noise, which is
    // what makes the test conservative rather than anti-conservative at the boundary.
    if (pi <= target * (1 + 1e-7)) p += pi;
  }
  return Math.min(1, p);
}

// ── Drift and the coalescent ──────────────────────────────────────────────────

/**
 * Expected heterozygosity after `t` generations of Wright–Fisher drift.
 *
 * Every generation, two alleles drawn from the next generation have a 1/(2Nₑ) chance of
 * being copies of the same parental allele — identical by descent, and so not
 * heterozygous. That is the whole model: heterozygosity decays geometrically at 1/(2Nₑ),
 * and nothing about the alleles themselves enters.
 */
export function heterozygosityDecay(h0: number, ne: number, t: number): number {
  return h0 * (1 - 1 / (2 * ne)) ** t;
}

/**
 * Variance of the allele frequency after `t` generations of drift from `p0`:
 * p₀q₀[1 − (1 − 1/2Nₑ)ᵗ].
 *
 * The same decay constant as heterozygosity, and not by coincidence — the identity
 * Var(p_t) = p₀q₀ − H_t/2 says that the variance drift *creates* between populations is
 * exactly the heterozygosity it *destroys* within them. Wahlund's principle, in one line.
 */
export function driftVariance(p0: number, ne: number, t: number): number {
  return p0 * (1 - p0) * (1 - (1 - 1 / (2 * ne)) ** t);
}

/**
 * Probability a neutral allele at frequency p eventually fixes.
 *
 * It is exactly p. Every allele copy in the population is equally likely to be the one
 * whose descendants take over, and a fraction p of them carry this allele.
 */
export function fixationProbability(p: number): number {
  return p;
}

/**
 * Kimura's fixation probability for an allele with selection coefficient s in a
 * population of effective size Nₑ. Reduces to p as s → 0.
 */
export function fixationProbabilitySelected(p: number, s: number, ne: number): number {
  if (Math.abs(s) < 1e-12) return p;
  const x = 2 * ne * s;
  return (1 - Math.exp(-2 * x * p)) / (1 - Math.exp(-2 * x));
}

/**
 * Expected time to fixation of a neutral allele, *conditional on it fixing* — Kimura &
 * Ohta's diffusion result −4Nₑ·((1−p)/p)·ln(1−p) generations.
 *
 * Conditioning matters: unconditionally, almost every new mutation is lost within a few
 * generations. The alleles that do fix take about 4Nₑ generations to do it, which is why
 * a species carries so much more polymorphism than its fixed differences suggest.
 */
export function expectedFixationTime(p: number, ne: number): number {
  if (p <= 0 || p >= 1) throw new Error('expectedFixationTime: p must be strictly between 0 and 1');
  return -4 * ne * ((1 - p) / p) * Math.log(1 - p);
}

/**
 * Expected time in generations for the whole sample of `k` lineages to coalesce to
 * k−1, under Kingman's coalescent: 4Nₑ/(k(k−1)).
 */
export function expectedCoalescentTime(k: number, ne: number): number {
  if (k < 2) throw new Error('expectedCoalescentTime: needs at least two lineages');
  return (4 * ne) / (k * (k - 1));
}

/** E[T_MRCA] = 4Nₑ(1 − 1/n) generations, the sum of the k-to-(k−1) waiting times. */
export function expectedTmrca(n: number, ne: number): number {
  return 4 * ne * (1 - 1 / n);
}

/** E[T_total] = 4Nₑ Σ_{i=1}^{n−1} 1/i — the branch length mutations actually land on. */
export function expectedTotalBranchLength(n: number, ne: number): number {
  return 4 * ne * harmonic(n - 1);
}

/** Σ_{i=1}^{m} 1/i. */
export function harmonic(m: number): number {
  let s = 0;
  for (let i = 1; i <= m; i += 1) s += 1 / i;
  return s;
}

/** Σ_{i=1}^{m} 1/i². */
export function harmonicSquared(m: number): number {
  let s = 0;
  for (let i = 1; i <= m; i += 1) s += 1 / (i * i);
  return s;
}

// ── Neutrality and the site frequency spectrum ────────────────────────────────

/** Watterson's θ_W = S / a₁ — an estimate of 4Nₑμ from the *number* of segregating sites. */
export function wattersonTheta(segregatingSites: number, n: number): number {
  return segregatingSites / harmonic(n - 1);
}

/** θ_π: mean pairwise differences, an estimate of the same 4Nₑμ from the *frequencies*. */
export function pairwiseTheta(derivedCounts: number[], n: number): number {
  // Σ_i 2 · (n−i)·i / (n(n−1)) over sites with i derived copies — the probability two
  // sampled chromosomes differ at that site, summed over sites.
  return derivedCounts.reduce((s, i) => s + (2 * i * (n - i)) / (n * (n - 1)), 0);
}

/**
 * Tajima's D.
 *
 * θ_W and θ_π estimate the same quantity under neutrality and constant size, but weight
 * the frequency spectrum differently: θ_W counts every segregating site equally, θ_π
 * weights by heterozygosity and so is dominated by common variants. Their difference is
 * therefore a statement about the *shape* of the spectrum — negative under an excess of
 * rare variants (a selective sweep, or population growth), positive under an excess of
 * intermediate ones (balancing selection, or structure).
 *
 * The denominator is Tajima's (1989) variance of that difference, not a bootstrap.
 */
export interface TajimaConstants {
  a1: number; a2: number; b1: number; b2: number; c1: number; c2: number; e1: number; e2: number;
}

/**
 * Tajima's (1989) sample-size constants.
 *
 * Exposed rather than buried inside `tajimasD` because they carry the whole content of
 * the variance: Var(π − θ_W) = c₁θ + c₂θ², and e₁, e₂ are what that becomes once θ and
 * θ² are replaced by their unbiased estimators S/a₁ and S(S−1)/(a₁²+a₂). A test can
 * then check the substitution rather than take it on trust.
 */
export function tajimaConstants(n: number): TajimaConstants {
  const a1 = harmonic(n - 1);
  const a2 = harmonicSquared(n - 1);
  const b1 = (n + 1) / (3 * (n - 1));
  const b2 = (2 * (n * n + n + 3)) / (9 * n * (n - 1));
  const c1 = b1 - 1 / a1;
  const c2 = b2 - (n + 2) / (a1 * n) + a2 / (a1 * a1);
  return { a1, a2, b1, b2, c1, c2, e1: c1 / a1, e2: c2 / (a1 * a1 + a2) };
}

export function tajimasD(segregatingSites: number, thetaPi: number, n: number): number {
  const S = segregatingSites;
  if (S === 0) return 0;
  const { a1, e1, e2 } = tajimaConstants(n);
  const variance = e1 * S + e2 * S * (S - 1);
  return (thetaPi - S / a1) / Math.sqrt(variance);
}

/**
 * Hudson's F_ST between two populations, in the ratio-of-averages form recommended by
 * Bhatia et al. (2013). `n1` and `n2` are counts of *chromosomes*, not individuals.
 *
 * The sample-size corrections in the numerator are what stop F_ST rising simply because
 * a population was sequenced shallowly — the failure mode that made early cross-cohort
 * F_ST comparisons unreliable.
 */
export function fstHudson(p1: number, p2: number, n1: number, n2: number): number {
  const num = (p1 - p2) ** 2 - (p1 * (1 - p1)) / (n1 - 1) - (p2 * (1 - p2)) / (n2 - 1);
  const den = p1 * (1 - p2) + p2 * (1 - p1);
  return den === 0 ? 0 : num / den;
}

// ── Pedigrees, relatedness and linkage ────────────────────────────────────────

/** One individual and its parents. A missing parent is an unrelated founder. */
export interface PedigreeEntry {
  id: string;
  sire?: string | null;
  dam?: string | null;
}

/**
 * Malécot's kinship coefficient f(x, y): the probability that an allele drawn at random
 * from x and one drawn at random from y are identical by descent.
 *
 * The recursion is the definition read backwards. An allele drawn from x came from its
 * sire or its dam with equal probability, so f(x, y) = ½[f(sire_x, y) + f(dam_x, y)] —
 * provided x is not an ancestor of y, which is why the pedigree has to be walked in an
 * order where parents come first. Drawing twice from the *same* individual gives
 * f(x, x) = ½(1 + F_x), the extra half coming from the chance of drawing the same allele
 * twice, and F_x = f(sire_x, dam_x) is the inbreeding coefficient.
 */
export function kinshipMatrix(pedigree: PedigreeEntry[]): { ids: string[]; f: Matrix } {
  const order = topologicalPedigree(pedigree);
  const index = new Map(order.map((e, i) => [e.id, i]));
  const n = order.length;
  const f: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  const at = (a: string | null | undefined, b: string | null | undefined): number => {
    if (!a || !b) return 0; // an unknown parent is an unrelated, non-inbred founder
    const i = index.get(a);
    const j = index.get(b);
    if (i === undefined || j === undefined) return 0;
    return f[i][j];
  };

  for (let i = 0; i < n; i += 1) {
    const { sire, dam } = order[i];
    for (let j = 0; j < i; j += 1) {
      // i comes after j in pedigree order, so i cannot be an ancestor of j: expand i.
      const v = 0.5 * (at(sire, order[j].id) + at(dam, order[j].id));
      f[i][j] = v;
      f[j][i] = v;
    }
    f[i][i] = 0.5 * (1 + at(sire, dam));
  }
  return { ids: order.map((e) => e.id), f };
}

/** Parents before offspring. Throws on a cycle, which is a pedigree error, not a loop. */
function topologicalPedigree(pedigree: PedigreeEntry[]): PedigreeEntry[] {
  const byId = new Map(pedigree.map((e) => [e.id, e]));
  const out: PedigreeEntry[] = [];
  const state = new Map<string, 'open' | 'done'>();

  const visit = (id: string) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') throw new Error(`kinship: pedigree cycle at ${id}`);
    const e = byId.get(id);
    if (!e) return; // named as a parent but not itself a record: an unrelated founder
    state.set(id, 'open');
    if (e.sire) visit(e.sire);
    if (e.dam) visit(e.dam);
    state.set(id, 'done');
    out.push(e);
  };

  for (const e of pedigree) visit(e.id);
  return out;
}

/**
 * Wright's numerator relationship matrix **A**, where A_ij = 2f_ij.
 *
 * The factor of two is what makes the diagonal 1 for a non-inbred individual and the
 * off-diagonal ½ for full sibs — i.e. what makes **A** the *covariance* of breeding
 * values in units of the additive variance, which is the form the mixed model needs.
 */
export function additiveRelationshipMatrix(pedigree: PedigreeEntry[]): { ids: string[]; A: Matrix } {
  const { ids, f } = kinshipMatrix(pedigree);
  return { ids, A: f.map((row) => row.map((v) => 2 * v)) };
}

/** F_x = f(sire, dam): the probability an individual's two alleles are identical by descent. */
export function inbreedingCoefficients(pedigree: PedigreeEntry[]): Map<string, number> {
  const { ids, A } = additiveRelationshipMatrix(pedigree);
  return new Map(ids.map((id, i) => [id, A[i][i] - 1]));
}

/**
 * The LOD score for linkage at recombination fraction θ, from `recombinants` observed
 * among `total` informative meioses.
 *
 * log₁₀ of the likelihood ratio between θ and free recombination — a base-10 log
 * precisely so that the threshold could be read as "a thousand to one".
 */
export function lodScore(recombinants: number, total: number, theta: number): number {
  if (theta <= 0) return recombinants === 0 ? total * Math.log10(2) : -Infinity;
  const k = recombinants;
  const n = total;
  return Math.log10((theta ** k * (1 - theta) ** (n - k)) / 0.5 ** n);
}

/** The LOD at its maximum, which for this likelihood is at θ̂ = recombinants / total. */
export function maxLod(recombinants: number, total: number): { theta: number; lod: number } {
  const theta = total === 0 ? 0.5 : recombinants / total;
  return { theta, lod: lodScore(recombinants, total, theta) };
}

/**
 * LOD and χ² are the same likelihood ratio in different units: χ² = 2 ln(10) · LOD.
 *
 * So the classical LOD 3 threshold is χ² = 13.8155 on 1 df, a point-wise p of
 * 2.0×10⁻⁴ — nothing like 10⁻³, and not a genome-wide statement at all. The
 * thousand-to-one reading is a *prior odds* argument about how rarely two loci are
 * linked, not a p-value.
 */
export function lodToChi2(lod: number): number {
  return 2 * Math.LN10 * lod;
}

export function chi2ToLod(chi2: number): number {
  return chi2 / (2 * Math.LN10);
}

/**
 * The transmission disequilibrium test: χ² = (b − c)²/(b + c) on 1 df, where b and c
 * count the two alleles transmitted from heterozygous parents to affected offspring.
 *
 * It conditions on the parents, so population structure cannot confound it — a
 * stratified sample changes which parents are heterozygous, not what they transmit.
 */
export function tdtStatistic(b: number, c: number): number {
  return b + c === 0 ? 0 : ((b - c) ** 2) / (b + c);
}

// ── Quantitative genetics: effects, breeding values, variance ─────────────────

/**
 * One biallelic locus in Falconer's parameterisation: genotypic values +a, d and −a for
 * A₁A₁, A₁A₂ and A₂A₂, with p the frequency of A₁.
 */
export interface LocusEffect {
  p: number;
  /** Half the difference between the two homozygotes. */
  a: number;
  /** The heterozygote's deviation from their midpoint. Zero means purely additive. */
  d: number;
}

/** Population mean genotypic value, measured from the midpoint of the homozygotes. */
export function genotypicMean({ p, a, d }: LocusEffect): number {
  const q = 1 - p;
  return a * (p - q) + 2 * p * q * d;
}

/**
 * The average effect of an allele substitution, α = a + d(q − p).
 *
 * This is the single most-skipped step in quantitative genetics and the reason V_A is
 * not "the variance due to genes". α is not a property of the allele: it is the
 * regression of genotypic value on allele count *in this population at these
 * frequencies*. A locus with pure dominance (a = 0, d > 0) still has α ≠ 0 whenever
 * p ≠ q — the additive variance is generated by dominance acting on an asymmetric
 * frequency, not by any additive gene action at all.
 */
export function averageEffect({ p, a, d }: LocusEffect): number {
  return a + d * (1 - 2 * p);
}

/** Breeding values: the genotype's expected effect on offspring, in the same units as a. */
export function breedingValues(locus: LocusEffect): { AA: number; Aa: number; aa: number } {
  const { p } = locus;
  const q = 1 - p;
  const alpha = averageEffect(locus);
  return { AA: 2 * q * alpha, Aa: (q - p) * alpha, aa: -2 * p * alpha };
}

/** V_A = 2pqα² — the variance of the breeding values, which is what selection acts on. */
export function additiveVariance(locus: LocusEffect): number {
  const { p } = locus;
  return 2 * p * (1 - p) * averageEffect(locus) ** 2;
}

/** V_D = (2pqd)² — the residual after the best linear fit on allele count. */
export function dominanceVariance({ p, d }: LocusEffect): number {
  return (2 * p * (1 - p) * d) ** 2;
}

/** V_G = V_A + V_D at one locus. The two are orthogonal *by construction*, not by luck. */
export function genotypicVariance(locus: LocusEffect): number {
  return additiveVariance(locus) + dominanceVariance(locus);
}

// ── Selection ─────────────────────────────────────────────────────────────────

/**
 * Selection intensity for truncation selection: the mean phenotype of the selected
 * fraction, in phenotypic standard deviations above the population mean.
 *
 * i = φ(z_p)/p where z_p = Φ⁻¹(1 − p). Selecting the top 5 % buys i = 2.06 SD; selecting
 * the top 1 % buys 2.67. The returns are sharply diminishing, which is why breeding
 * programmes trade intensity against generation interval rather than maximising it.
 */
export function selectionIntensity(proportion: number): number {
  if (proportion <= 0 || proportion > 1) throw new Error('selectionIntensity: proportion in (0, 1]');
  return normalPdf(normalQuantile(1 - proportion)) / proportion;
}

/** R = h²S — the breeder's equation in its selection-differential form. */
export function breedersResponse(h2: number, selectionDifferential: number): number {
  return h2 * selectionDifferential;
}

/** R = i·h²·σ_P = i·h·σ_A — the same equation with the differential written as i·σ_P. */
export function breedersResponseFromIntensity(h2: number, i: number, sdPhenotypic: number): number {
  return i * h2 * sdPhenotypic;
}

/**
 * Correlated response in trait y to selection on trait x:
 * CR_y = i · h_x · h_y · r_g · σ_Py.
 *
 * Note it uses h, not h², and one h from each trait — selection has to get *into* the
 * breeding value of x (h_x) and back *out* through the phenotype of y (h_y). A trait
 * can respond to selection it was never selected on, and in the wrong direction if r_g
 * is negative, which is the practical content of a genetic correlation.
 */
export function correlatedResponse(
  i: number, hX: number, hY: number, rg: number, sdPhenotypicY: number
): number {
  return i * hX * hY * rg * sdPhenotypicY;
}

/**
 * The multivariate breeder's equation Δz̄ = G P⁻¹ s (Lande & Arnold 1983).
 *
 * P⁻¹s is the selection *gradient*: what remains of the selection differential once
 * indirect selection through correlated traits is partialled out. Multiplying by G, not
 * by h², is what lets a trait under no direct selection still respond.
 */
export function multivariateResponse(G: Matrix, P: Matrix, s: number[]): number[] {
  return matVec(G, solveLinear(P, s));
}

// ── BLUP and genomic selection ────────────────────────────────────────────────

/**
 * VanRaden's genomic relationship matrix G = WWᵀ / Σ2p(1−p), with W the genotype matrix
 * centred and (here) scaled by the allele frequencies supplied.
 *
 * **The frequencies matter, and not only for scaling.** Centre on frequencies computed
 * from the same sample and every column of W sums to zero, so W has rank at most n−1 and
 * G is singular *by construction* — G⁻¹ does not exist, and Henderson's equations as
 * usually written cannot be formed. Reference frequencies, or a small ridge, are what
 * make the textbook form runnable; the equivalent non-inverse form below never needs it.
 */
export function grmFromMarkers(genotypes: Matrix, frequencies: number[]): Matrix {
  const m = frequencies.length;
  if (genotypes.some((r) => r.length !== m)) throw new Error('grmFromMarkers: shape mismatch');
  const scale = frequencies.reduce((s, p) => s + 2 * p * (1 - p), 0);
  if (scale === 0) throw new Error('grmFromMarkers: no polymorphic markers');
  const W = genotypes.map((row) => row.map((g, j) => g - 2 * frequencies[j]));
  return matMul(W, transpose(W)).map((row) => row.map((v) => v / scale));
}

/**
 * BLUP of the random effects in the equivalent non-inverse form: û = K(K + λI)⁻¹ê,
 * with λ = σ²ₑ/σ²_g and ê the phenotypes adjusted for the fixed effects.
 *
 * Identical to Henderson's mixed model equations wherever K⁻¹ exists — verified to
 * machine precision — and defined where it does not, which is the usual case for a
 * sample-centred GRM.
 */
export function blupSolve(K: Matrix, lambda: number, adjusted: number[]): number[] {
  const KplusI = K.map((row, i) => row.map((v, j) => (i === j ? v + lambda : v)));
  return matVec(K, solveLinear(KplusI, adjusted));
}

export interface MmeSolution {
  /** Generalised-least-squares estimates of the fixed effects. */
  fixed: number[];
  /** Best linear unbiased *predictions* of the random effects. */
  random: number[];
}

/**
 * Henderson's mixed model equations, solved jointly for b̂ and û:
 *
 *   ⎡ XᵀX      XᵀZ          ⎤ ⎡b̂⎤   ⎡Xᵀy⎤
 *   ⎣ ZᵀX      ZᵀZ + K⁻¹λ   ⎦ ⎣û⎦ = ⎣Zᵀy⎦
 *
 * The single insight that made animal breeding computable: b̂ comes out as the GLS
 * estimate and û as the BLUP, from one system, without ever forming or inverting the
 * n×n phenotypic covariance V = ZKZᵀσ²_g + Iσ²ₑ.
 */
export function hendersonMme(
  X: Matrix, Z: Matrix, Kinv: Matrix, lambda: number, y: number[]
): MmeSolution {
  const Xt = transpose(X);
  const Zt = transpose(Z);
  const XtX = matMul(Xt, X);
  const XtZ = matMul(Xt, Z);
  const ZtX = matMul(Zt, X);
  const ZtZ = matMul(Zt, Z);
  const nf = XtX.length;
  const nr = ZtZ.length;

  const C: Matrix = [
    ...XtX.map((row, i) => [...row, ...XtZ[i]]),
    ...ZtZ.map((row, i) => [...ZtX[i], ...row.map((v, j) => v + Kinv[i][j] * lambda)]),
  ];
  const rhs = [...matVec(Xt, y), ...matVec(Zt, y)];
  const sol = solveLinear(C, rhs);
  return { fixed: sol.slice(0, nf), random: sol.slice(nf, nf + nr) };
}

/**
 * Accuracy of a genomic prediction, r = √(Nh²/(Nh² + Mₑ)) — the same relation as the
 * polygenic-score accuracy ceiling, written the way the genomic-selection literature
 * writes it, with Mₑ the number of independent chromosome segments.
 */
export function predictionAccuracy(n: number, h2: number, effectiveSegments: number): number {
  return Math.sqrt((n * h2) / (n * h2 + effectiveSegments));
}

// ── Genomic inflation ─────────────────────────────────────────────────────────

/**
 * The median of the χ²₁ distribution, = (Φ⁻¹(0.75))² = 0.674489750196²  exactly.
 *
 * Written to ten places because the curriculum quotes it: rounding it to 0.455 shifts
 * λ_GC by 1.4×10⁻⁴, which is invisible on one study and is not invisible when two
 * lessons quote different constants and appear to disagree.
 */
export const CHI2_1DF_MEDIAN = 0.4549364231195727;

/**
 * λ_GC: the median observed χ² divided by the median expected under the null.
 *
 * It cannot separate confounding from polygenicity, and in a biobank it does not even
 * try: a genuinely polygenic trait inflates every test statistic slightly, so λ_GC rises
 * with sample size under a perfectly clean analysis. That is the observation LD-score
 * regression was built on — the *intercept* is the part λ_GC was being asked to measure.
 */
export function lambdaGc(chisqs: number[]): number {
  if (chisqs.length === 0) throw new Error('lambdaGc: no statistics');
  const sorted = [...chisqs].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median / CHI2_1DF_MEDIAN;
}

export interface LdscFit {
  /** 1 under a clean analysis; the excess is confounding and population structure. */
  intercept: number;
  /** The coefficient on the LD score: N·h²/M. */
  slope: number;
  /** h²_SNP = slope · M / N. */
  h2: number;
  /** (mean χ² − 1) attributable to the intercept rather than to polygenicity. */
  ratio: number;
}

/**
 * LD-score regression: E[χ²_j] = 1 + Na + (N h²/M)·ℓ_j.
 *
 * A variant in high LD with many others tags more of the genome, so under polygenicity
 * its expected χ² is *higher* — a relationship confounding does not produce, because a
 * stratification artefact shifts every statistic regardless of how much LD a variant sits
 * in. Regressing χ² on the LD score therefore splits the two: the slope is heritability,
 * the intercept is everything else.
 */
export function ldscRegression(
  ldScores: number[], chisqs: number[], n: number, m: number, weights?: number[]
): LdscFit {
  const k = ldScores.length;
  if (chisqs.length !== k) throw new Error('ldscRegression: length mismatch');
  const w = weights ?? new Array<number>(k).fill(1);

  // Weighted least squares for [intercept, slope] via the 2×2 normal equations.
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < k; i += 1) {
    sw += w[i];
    sx += w[i] * ldScores[i];
    sy += w[i] * chisqs[i];
    sxx += w[i] * ldScores[i] * ldScores[i];
    sxy += w[i] * ldScores[i] * chisqs[i];
  }
  const [intercept, slope] = solveLinear([[sw, sx], [sx, sxx]], [sy, sxy]);
  const meanChi2 = sy / sw;
  return {
    intercept,
    slope,
    h2: (slope * m) / n,
    ratio: meanChi2 > 1 ? (intercept - 1) / (meanChi2 - 1) : 0,
  };
}

// ── Meta-analysis ─────────────────────────────────────────────────────────────

export interface MetaResult {
  beta: number;
  se: number;
  z: number;
  /** Cochran's Q — the weighted sum of squared deviations from the pooled estimate. */
  q: number;
  df: number;
  /** I² as a percentage: the share of the variability that is heterogeneity, not noise. */
  i2: number;
  /** DerSimonian–Laird between-study variance. Zero when Q is at or below its df. */
  tau2: number;
}

/**
 * Inverse-variance-weighted fixed-effect meta-analysis, with the standard heterogeneity
 * statistics.
 *
 * The weights are 1/SE², which is the only weighting that minimises the variance of the
 * pooled estimate — sample size is a proxy for it, not a substitute, and the two diverge
 * whenever studies differ in allele frequency or in case-control ratio.
 *
 * Q has a df of k−1 because one degree of freedom is spent on the pooled estimate. I² is
 * *not* a measure of how much studies disagree in absolute terms: it is the share of
 * total variability that is not sampling error, so it rises with precision even when the
 * disagreement between studies is unchanged.
 */
export function ivwMeta(betas: number[], ses: number[]): MetaResult {
  const k = betas.length;
  if (ses.length !== k || k === 0) throw new Error('ivwMeta: needs matching, non-empty inputs');
  const w = ses.map((s) => 1 / (s * s));
  const sw = w.reduce((a, b) => a + b, 0);
  const beta = betas.reduce((s, b, i) => s + w[i] * b, 0) / sw;
  const se = Math.sqrt(1 / sw);
  const q = betas.reduce((s, b, i) => s + w[i] * (b - beta) ** 2, 0);
  const df = k - 1;
  const swSq = w.reduce((s, x) => s + x * x, 0);
  return {
    beta,
    se,
    z: beta / se,
    q,
    df,
    i2: q > 0 ? Math.max(0, ((q - df) / q) * 100) : 0,
    tau2: Math.max(0, (q - df) / (sw - swSq / sw)),
  };
}

/**
 * Sample-size-weighted (Stouffer) meta-analysis of z-scores — what METAL does when the
 * studies report effects on scales that cannot be pooled directly.
 *
 * It gives a p-value but not an effect size, which is the trade: the weights are √N
 * rather than 1/SE², so nothing about the units of β survives.
 */
export function stoufferMeta(zs: number[], sampleSizes: number[]): { z: number } {
  const w = sampleSizes.map(Math.sqrt);
  const denom = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
  return { z: zs.reduce((s, z, i) => s + w[i] * z, 0) / denom };
}

/**
 * The winner's curse: E[ẑ | the study reached significance], for a variant whose true
 * standardised effect is `trueZ` and a two-sided threshold at |z| > `threshold`.
 *
 * Conditioning on discovery selects the upward fluctuations, so the discovery estimate
 * is biased away from zero — badly when the true effect sits near the threshold. It is
 * why an effect size must be re-estimated in an independent sample before it is used to
 * weight a polygenic score, and why replication effect sizes are routinely "smaller".
 */
export function winnersCurseExpectation(trueZ: number, threshold: number): number {
  const num = normalPdf(trueZ - threshold) - normalPdf(trueZ + threshold);
  const den = normalCdf(trueZ - threshold) + normalCdf(-trueZ - threshold);
  return trueZ + num / den;
}

/** The two-sided z threshold matching a p-value, e.g. 5×10⁻⁸ → 5.4513. */
export function zThreshold(alpha: number): number {
  return normalQuantile(1 - alpha / 2);
}

// ── Bayesian fine-mapping ─────────────────────────────────────────────────────

/**
 * Wakefield's approximate Bayes factor, in the **BF₀₁** direction: the evidence for the
 * *null* over the alternative. Larger means more support for no effect.
 *
 * BF₀₁ = √((V+W)/V) · exp(−(z²/2)·W/(V+W))
 *
 * The direction is a convention, and this curriculum fixes it as BF₀₁ throughout,
 * because the BF₁₀ form is its exact reciprocal and using both without saying so is how
 * two lessons end up appearing to contradict each other. `V` is the squared standard
 * error of β̂; `W` is the prior variance of the true effect — typically 0.04 for a
 * quantitative trait on a standardised scale, or 0.21²  for a log odds ratio.
 */
export function wakefieldAbf(z: number, v: number, w: number): number {
  return Math.sqrt((v + w) / v) * Math.exp((-(z * z) / 2) * (w / (v + w)));
}

/**
 * Posterior inclusion probabilities from a set of BF₀₁ values, with an explicit null.
 *
 * PIP_j = (π_j / BF₀₁_j) / (π₀ + Σ_k π_k / BF₀₁_k)
 *
 * The `π₀` term is what most write-ups drop, and dropping it forces the PIPs to sum to
 * one — which asserts that the locus certainly contains a causal variant among those
 * tested. At a locus with no signal that is exactly the wrong claim, and it is what
 * produces confident credible sets around noise.
 */
export function pipsFromAbf(abfs: number[], priors: number[], nullPrior: number): number[] {
  if (abfs.length !== priors.length) throw new Error('pipsFromAbf: length mismatch');
  const terms = abfs.map((bf, i) => priors[i] / bf);
  const denom = nullPrior + terms.reduce((a, b) => a + b, 0);
  return terms.map((t) => t / denom);
}

export interface CredibleSet {
  /** Indices in descending PIP order, the smallest set reaching `level`. */
  indices: number[];
  /** Total posterior mass the set actually captures. */
  coverage: number;
}

/**
 * The smallest set of variants whose PIPs sum to at least `level`.
 *
 * With an explicit null the PIPs need not sum to one, so a locus with no signal simply
 * cannot produce a 95 % set — which is the intended behaviour, and the reason
 * `coverage` is returned rather than assumed.
 */
export function credibleSet(pips: number[], level = 0.95): CredibleSet {
  const order = pips.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]);
  const indices: number[] = [];
  let coverage = 0;
  for (const [p, i] of order) {
    indices.push(i);
    coverage += p;
    if (coverage >= level) break;
  }
  return { indices, coverage };
}

/**
 * Purity: the smallest absolute pairwise correlation inside a credible set.
 *
 * A set of variants in perfect LD is a *statistical* result and no more — the data
 * cannot separate them. A set whose members are barely correlated is a sign the model
 * has grouped unrelated signals, which is why SuSiE reports purity alongside coverage
 * and drops sets below 0.5.
 */
export function csPurity(indices: number[], ld: Matrix): number {
  if (indices.length < 2) return 1;
  let min = Infinity;
  for (let a = 0; a < indices.length; a += 1) {
    for (let b = a + 1; b < indices.length; b += 1) {
      min = Math.min(min, Math.abs(ld[indices[a]][indices[b]]));
    }
  }
  return min;
}

// ── Rare-variant aggregation ──────────────────────────────────────────────────

/**
 * The Beta(MAF; a₁, a₂) weight of Wu et al. (2011), defaulting to Beta(1, 25).
 *
 * It is a prior in the shape of a density: rarer means more weight, sharply. Beta(1, 25)
 * gives a singleton about 25× the weight of a 1 %-frequency variant, encoding the belief
 * that a deleterious allele has been kept rare by selection.
 */
export function betaWeight(maf: number, a1 = 1, a2 = 25): number {
  const lnB = lnGamma(a1) + lnGamma(a2) - lnGamma(a1 + a2);
  return Math.exp((a1 - 1) * Math.log(maf) + (a2 - 1) * Math.log(1 - maf) - lnB);
}

/** Per-variant score statistics S_j = Σ_i G_ij (y_i − μ̂_i), the input both tests share. */
export function variantScores(genotypes: Matrix, residuals: number[]): number[] {
  const n = residuals.length;
  if (genotypes.length !== n) throw new Error('variantScores: one genotype row per sample');
  const m = genotypes[0]?.length ?? 0;
  return Array.from({ length: m }, (_, j) =>
    genotypes.reduce((s, row, i) => s + row[j] * residuals[i], 0)
  );
}

/**
 * The burden statistic: collapse first, then test. Q = (Σ_j w_j S_j)².
 *
 * Maximal power when every variant in the gene pushes the same way, and *no* power when
 * they do not — the sum cancels. That failure is not a rare corner: a gene with both
 * loss-of-function and gain-of-function alleles is the normal case in disease genetics.
 */
export function burdenStatistic(scores: number[], weights: number[]): number {
  return scores.reduce((s, sj, j) => s + weights[j] * sj, 0) ** 2;
}

/**
 * The SKAT statistic: test first, then sum. Q = Σ_j w_j² S_j².
 *
 * A variance-component score test, so it squares each variant's contribution before
 * adding — direction cannot cancel. The price is power against a genuinely unidirectional
 * signal, which is what SKAT-O buys back by mixing the two.
 */
export function skatQ(scores: number[], weights: number[]): number {
  return scores.reduce((s, sj, j) => s + weights[j] * weights[j] * sj * sj, 0);
}

/** SKAT-O's convex combination: Q_ρ = ρ·Q_burden + (1−ρ)·Q_SKAT. */
export function skatOQ(scores: number[], weights: number[], rho: number): number {
  return rho * burdenStatistic(scores, weights) + (1 - rho) * skatQ(scores, weights);
}

// ── Mendelian randomization ───────────────────────────────────────────────────

/** The Wald ratio for one instrument: the outcome effect divided by the exposure effect. */
export function waldRatio(gammaExposure: number, gammaOutcome: number): number {
  if (gammaExposure === 0) throw new Error('waldRatio: instrument has no exposure effect');
  return gammaOutcome / gammaExposure;
}

/**
 * The first-stage F statistic, γ̂²/Var(γ̂).
 *
 * The rule of thumb F > 10 is about *bias*, not significance: a weak instrument biases
 * the ratio estimate toward the confounded observational association, and the bias is
 * roughly 1/F. An instrument at F = 10 still carries about 10 % of the confounding it
 * was chosen to escape.
 */
export function fStatistic(gammaExposure: number, seExposure: number): number {
  return (gammaExposure / seExposure) ** 2;
}

/**
 * Inverse-variance-weighted MR: the meta-analysis of the per-instrument Wald ratios.
 *
 * Identical to a weighted regression of the outcome effects on the exposure effects
 * *through the origin* — which is where its central assumption lives. Forcing the
 * intercept to zero is the statement that no instrument affects the outcome except
 * through the exposure.
 */
export function ivwMr(
  gammaExposure: number[], gammaOutcome: number[], seOutcome: number[]
): MetaResult {
  const ratios = gammaExposure.map((g, i) => waldRatio(g, gammaOutcome[i]));
  const ses = gammaExposure.map((g, i) => Math.abs(seOutcome[i] / g));
  return ivwMeta(ratios, ses);
}

export interface EggerFit {
  /** Average directional pleiotropy. Zero is the IVW assumption. */
  intercept: number;
  seIntercept: number;
  /** The causal estimate, corrected for that average. */
  slope: number;
  seSlope: number;
}

/**
 * MR-Egger: the same weighted regression, with the intercept *freed*.
 *
 * A non-zero intercept is directional pleiotropy — instruments affecting the outcome
 * through some route other than the exposure, on average in one direction. Egger's slope
 * is consistent under InSIDE (that the pleiotropic effects are independent of the
 * instrument strengths), which is weaker than IVW's assumption but not weak, and the
 * price is a large loss of precision.
 */
export function eggerRegression(
  gammaExposure: number[], gammaOutcome: number[], seOutcome: number[]
): EggerFit {
  const k = gammaExposure.length;
  const w = seOutcome.map((s) => 1 / (s * s));
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < k; i += 1) {
    sw += w[i];
    sx += w[i] * gammaExposure[i];
    sy += w[i] * gammaOutcome[i];
    sxx += w[i] * gammaExposure[i] * gammaExposure[i];
    sxy += w[i] * gammaExposure[i] * gammaOutcome[i];
  }
  const [intercept, slope] = solveLinear([[sw, sx], [sx, sxx]], [sy, sxy]);

  // Residual standard error, so the reported precision reflects the scatter Egger sees.
  let rss = 0;
  for (let i = 0; i < k; i += 1) rss += w[i] * (gammaOutcome[i] - intercept - slope * gammaExposure[i]) ** 2;
  const sigma2 = k > 2 ? rss / (k - 2) : 0;
  const det = sw * sxx - sx * sx;
  return {
    intercept,
    seIntercept: Math.sqrt((sigma2 * sxx) / det),
    slope,
    seSlope: Math.sqrt((sigma2 * sw) / det),
  };
}

/**
 * The weighted median of a set of values — Bowden et al.'s robust MR estimator.
 *
 * Consistent as long as instruments carrying more than half the weight are valid, so it
 * survives a minority of badly pleiotropic instruments that would drag IVW anywhere. The
 * interpolation across the crossing point is what makes it continuous in the weights
 * rather than jumping between adjacent observations.
 */
export function weightedMedian(values: number[], weights: number[]): number {
  const order = values.map((v, i) => [v, weights[i]] as const).sort((a, b) => a[0] - b[0]);
  const total = order.reduce((s, [, w]) => s + w, 0);

  // Bowden's published implementation uses the *mid*-cumulative weight,
  // (Σ_{j<k} w_j + w_k/2) / Σw, rather than the running total. The half-weight offset is
  // what makes the estimator reduce to the ordinary median when the weights are equal —
  // the plain cumulative form returns the lower of the two central order statistics.
  const s: number[] = [];
  let running = 0;
  for (const [, w] of order) {
    s.push((running + w / 2) / total);
    running += w;
  }

  if (s[0] >= 0.5) return order[0][0];
  let k = 0;
  for (let i = 0; i < s.length; i += 1) if (s[i] < 0.5) k = i;
  if (k === s.length - 1) return order[k][0];
  return order[k][0] + ((order[k + 1][0] - order[k][0]) * (0.5 - s[k])) / (s[k + 1] - s[k]);
}

/** The weighted-median MR estimate: the median of the Wald ratios, weighted by precision. */
export function weightedMedianMr(
  gammaExposure: number[], gammaOutcome: number[], seOutcome: number[]
): number {
  const ratios = gammaExposure.map((g, i) => waldRatio(g, gammaOutcome[i]));
  const weights = gammaExposure.map((g, i) => (g / seOutcome[i]) ** 2);
  return weightedMedian(ratios, weights);
}
