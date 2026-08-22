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

/** Kosambi's mapping function, which builds in crossover interference. */
export function kosambiTheta(morgans: number): number {
  return 0.5 * Math.tanh(2 * morgans);
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
