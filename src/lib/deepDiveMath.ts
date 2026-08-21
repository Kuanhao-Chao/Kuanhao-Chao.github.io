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
