import type { LessonDefinition } from '../lib/algorithmLessonTypes';

const sequenceInputs = [
  {
    id: 'target',
    label: 'Target (rows)',
    value: 'ACGT',
    type: 'text' as const,
    max: 30,
    help: 'Letters only; at most 30. Empty prefixes are allowed.',
  },
  { id: 'query', label: 'Query (columns)', value: 'AGT', type: 'text' as const, max: 30 },
];
export const ALGORITHM_LESSONS: Record<string, LessonDefinition> = {
  gwas: {
    id: 'gwas',
    title: 'GWAS: from an actual cohort to association, LD and prediction',
    lead: 'Fit quantitative-trait associations on reproducible synthetic individuals, compute genotype PCA and measured LD, and distinguish discovery from independent prediction.',
    prerequisites:
      'Regression, variance, hypothesis tests and genotype dosage. PCA and conditional association are explained below.',
    scope:
      '32 fictional markers, two latent simulated groups, actual N shown, quantitative OLS only. No real human association dataset, case-control logistic model, LMM, calibrated clinical risk or fine-mapping is implemented.',
    intuition: [
      'For each marker, ask whether allele dosage predicts the phenotype after specified covariates. A small p-value is about an association under a statistical model, not a probability that the marker causes the trait.',
      'Correlated nearby dosages can share a signal through linkage disequilibrium. Population structure can also correlate dosage and environment across the whole cohort.',
      'Prediction is a third question: learn weights using training individuals, then evaluate on independently generated test individuals without refitting on their outcomes.',
    ],
    example: {
      input:
        'A simplified quantitative example: dosage means 0, 1, 2 have phenotype means 1, 2, 3.',
      steps: [
        'The unadjusted slope is one phenotype unit per additional effect allele and the intercept is one.',
        'Residual variance determines uncertainty: identical means with noisier observations yield the same slope but a larger standard error.',
        'If dosage and phenotype both follow population structure, a raw slope may be confounded. Project genotype and phenotype jointly against intercept and PCs before testing the residual relationship.',
        'Correlated proxy markers can show the same signal; choosing the smallest p-value does not by itself identify the causal marker.',
      ],
      question:
        'Can PCA adjustment guarantee the null distribution is correct or make λ exactly one?',
      answer:
        'No. PCs are covariates, not a normalization switch. Sampling noise, genuine effects, imperfect adjustment, relatedness, model misspecification and correlated markers all affect the diagnostic.',
    },
    inputs: [
      {
        id: 'seed',
        label: 'Reproducible random seed',
        type: 'number',
        value: '42',
        min: 1,
        max: 1000000,
      },
      {
        id: 'n',
        label: 'Actual training N (test N is the same)',
        type: 'number',
        value: '80',
        min: 40,
        max: 160,
      },
      {
        id: 'scenario',
        label: 'Known simulated ground truth',
        type: 'select',
        value: 'causal',
        options: [
          { value: 'null', label: 'Null: phenotype independent of genotype' },
          { value: 'causal', label: 'One direct effect at sim06' },
          { value: 'stratified', label: 'Environmental group effect; no causal SNP' },
        ],
      },
      {
        id: 'adjust',
        label: 'Joint covariate adjustment',
        type: 'select',
        value: '2',
        options: [
          { value: '0', label: 'Intercept only' },
          { value: '1', label: 'Intercept + genotype PC1' },
          { value: '2', label: 'Intercept + genotype PC1 and PC2' },
        ],
      },
      {
        id: 'lead',
        label: 'Select LD lead marker (1…32)',
        type: 'number',
        value: '6',
        min: 1,
        max: 32,
        help: 'Click/activate a revealed association marker to change the lead; keyboard focus previews without changing it.',
      },
    ],
    presets: [
      { label: 'Direct genetic effect', values: {} },
      { label: 'Null', values: { scenario: 'null' } },
      { label: 'Confounded, unadjusted', values: { scenario: 'stratified', adjust: '0' } },
      { label: 'Same cohort, PC adjusted', values: { scenario: 'stratified', adjust: '2' } },
      { label: 'Different seed', values: { seed: '17' } },
    ],
    pseudocode: [
      'Generate seeded genotype blocks and a quantitative phenotype; independently generate the test cohort.',
      'Center and standardize dosages; compute genotype PCs.',
      'For each variant, fit intercept + selected PCs + dosage jointly; calculate β, SE, Student-t p.',
      'Plot actual fits and uniform-rank Q–Q expectations; inspect a noisy inflation diagnostic.',
      'Calculate dosage r² against the selected lead, then recompute on lead change.',
      'Select one training marker per simulated LD block and estimate weights before using test outcomes.',
      'Report association, confounding, LD and independent prediction as distinct results.',
    ],
    sections: [
      {
        title: '1. Dosage, effect size and uncertainty',
        text: [
          'A dosage G is the count of a designated effect allele (0, 1 or 2); this lesson uses no missing genotypes. Each marker is fitted to the same displayed cohort, not preassigned summary p-values.',
          'The quantitative model includes an intercept and optional genotype PCs. β measures phenotype units per effect allele after conditioning on these columns. The standard error comes from residual variance and residual genotype information.',
          'The two-sided test uses Student’s t with df=N−rank(X), under independent homoskedastic Gaussian errors and a correctly specified mean model. Rank deficiency is reported as non-identifiability, not a significant result. Perfectly correlated variants or covariates can remove the information needed to estimate a separate slope.',
        ],
        math: String.raw`y=\alpha+G_j\beta_j+Z\gamma+\varepsilon,\quad t_j=\widehat\beta_j/\operatorname{SE}(\widehat\beta_j),\quad p_j=2P(T_{N-\operatorname{rank}(X)}\ge |t_j|)`,
      },
      {
        title: '2. Joint adjustment is a projection, not repeated one-variable subtraction',
        text: [
          'Construct an orthonormal basis for the intercept and covariate column space using reorthogonalized QR. Project both G and y off this same space. Regressing their residuals gives the Frisch–Waugh–Lovell slope.',
          'Sequentially subtracting each correlated covariate’s raw vector is not the same joint projection and can leave residual confounding. The numerical tests include correlated covariates and order invariance.',
          'PCs here are actually computed from centered, variance-standardized genotype columns. The scatter uses those coordinates; latent group labels are synthetic annotations rather than hardcoded continental ancestry coordinates. Real GWAS PCA needs careful variant selection, LD pruning, missingness handling and reference interpretation.',
        ],
        math: String.raw`\widetilde G=(I-QQ^\top)G,\quad\widetilde y=(I-QQ^\top)y,\quad\widehat\beta=\frac{\widetilde G^\top\widetilde y}{\widetilde G^\top\widetilde G}`,
      },
      {
        title: '3. Manhattan, Q–Q and multiple testing answer distributional questions',
        text: [
          'The Manhattan plot uses fictional marker order across four fictional chromosomes and actual fitted −log₁₀ p-values. Its dashed threshold is Bonferroni 0.05/32, appropriate for illustrating family-wise testing across these 32 tests, not a declaration of human genome-wide discovery.',
          'The conventional 5×10⁻⁸ human-GWAS threshold is not used for this tiny panel. Q–Q ranks observed p-values and compares them with (rank−0.5)/M under a uniform null. LD makes tests dependent and this small panel cannot supply a reliable genome-wide calibration assessment.',
          'The displayed approximate inflation diagnostic is median(t²)/0.454936, using the χ²₁ median as a large-sample reference. Finite-df t² is not exactly χ²₁. Neither an elevated value nor a value near one uniquely identifies confounding; genuine effects and sampling variation also matter.',
        ],
      },
      {
        title: '4. LD is measured correlation, not causal fine-mapping',
        text: [
          'LD is calculated from the actual training dosage vectors as squared sample correlation. Selecting a new lead recomputes every r² and the regional plot without changing the seed, genotypes or association fits.',
          'The simulation generates eight correlated haplotype blocks; the phenotype has a direct sim06 effect only in the causal scenario. Linked markers can inherit association while having no direct effect in the generating equation.',
          'A regional peak plus high r² does not yield posterior inclusion probabilities. Conditional association, fine-mapping, functional experiments and external replication address different evidence. SuSiE is linked as a next topic, not performed by this demo.',
        ],
        math: String.raw`r^2=\frac{\left[\sum_i(G_i-\bar G)(H_i-\bar H)\right]^2}{\sum_i(G_i-\bar G)^2\sum_i(H_i-\bar H)^2}`,
      },
      {
        title: '5. A prediction test must stay independent of discovery',
        text: [
          'The score selects the smallest-p marker within each known simulated LD block using training individuals only. Its weights are that training model’s dosage slopes; this simple block pruning is not a modern shrinkage-based polygenic-score method.',
          'Predictions use the training phenotype mean and training genotype centers. The independently seeded test cohort is never used to select markers or refit weights. Population-confounded weights can still transfer environmental proxies inside this simulation, so successful prediction does not establish causality.',
          'Predictive R² is 1 minus test squared error divided by error from predicting the training mean; it can be negative. Squared prediction/outcome correlation is reported separately because a badly calibrated score can correlate while having poor prediction error. Real PRS work needs external validation, ancestry/environment transfer assessment and safeguards against cohort overlap.',
        ],
        math: String.raw`\widehat y_i=\bar y_{\rm train}+\sum_{j\in S}\widehat\beta_j(G_{ij}-\bar G_{j,\rm train}),\qquad R^2_{\rm pred}=1-\frac{\sum_{\rm test}(y_i-\widehat y_i)^2}{\sum_{\rm test}(y_i-\bar y_{\rm train})^2}`,
      },
    ],
    complexity:
      'For N individuals, M markers and C covariates, a straightforward per-marker QR fit costs O(MNC²). This small dense genotype PCA forms an N×N Gram matrix in O(N²M), then uses fixed-budget power iterations. Lead LD uses O(NM). These teaching costs are not the distributed complexity of biobank-scale GWAS software.',
    limitations: [
      'Quantitative OLS with independent, Gaussian noise assumptions; no logistic/Firth regression, relatedness-aware LMM, imputation or missing-genotype QC.',
      'Fictional markers and a tiny dependent panel; no human clinical interpretation or real effect estimates.',
      'PC adjustment is not guaranteed confounding removal; no fine-mapping or causal inference.',
      'Block-pruned prediction is educational, not a clinical PRS.',
    ],
    exercises: [
      {
        question:
          'Warm-up: if dosage rises by one, how does β affect the expected quantitative phenotype?',
        answer:
          'It changes the conditional mean by β phenotype units, holding the modeled covariates fixed.',
      },
      {
        question:
          'Core: why can all four linked markers peak although only sim06 has a direct effect?',
        answer:
          'Their dosages are correlated through the simulated haplotype block. Marginal association tags the effect without proving which correlated marker is causal.',
      },
      {
        question: 'Stretch: can predictive R² be negative while squared correlation is positive?',
        answer:
          'Yes. Predictions may rank individuals but have wrong calibration or excessive scale. Squared error can exceed the training-mean baseline even when correlation is nonzero.',
      },
    ],
    references: [
      {
        title: 'PLINK 2 association documentation',
        href: 'https://www.cog-genomics.org/plink/2.0/assoc',
        note: 'Primary regression, covariate and association-test documentation.',
      },
      {
        title: 'Price et al. (2006): genotype PCA adjustment',
        href: 'https://www.nature.com/articles/ng1847',
        note: 'Primary method for population-structure correction; not a guarantee against every source of confounding.',
      },
      {
        title: 'R Student-t documentation',
        href: 'https://stat.ethz.ch/R-manual/R-devel/library/stats/html/TDist.html',
        note: 'Student-t tails and the regularized incomplete-beta identity used by the teaching statistics.',
      },
      {
        title: 'SuSiE fine-mapping vignette',
        href: 'https://stephenslab.github.io/susieR/articles/finemapping.html',
        note: 'Next-step concept; the lesson does not compute fine-mapping posteriors.',
      },
    ],
    related: [
      { title: 'Statistical genetics deep dive', href: '/deep_dives/statistical-genetics/' },
      { title: 'In silico mutagenesis', href: '/algorithms/ism/' },
    ],
  },
  ism: {
    id: 'ism',
    title: 'In silico mutagenesis: perturb a sequence, explain a score',
    lead: 'Compute every single-base substitution, distinguish score loss from score gain, and inspect a fully disclosed synthetic splice-site model.',
    prerequisites:
      'DNA bases, splice junctions, model outputs and differences; logarithms help with the optional scorer details.',
    scope:
      'Transparent handwritten position-weight scorer, not OpenSpliceAI/Splam inference. No pretrained weights, human variant validation, tissue-specific splicing or clinical interpretation.',
    intuition: [
      'A model score is a function f(sequence). Change one base while holding context and the scoring target fixed, then compare its score with the current reference.',
      'The sign matters: mutant minus reference is positive for score gain and negative for loss. A reference-base cell is zero without another model call.',
      'Sensitivity is a property of this model and this context. It is not necessarily biological importance, and a strong single-base effect does not reveal higher-order interactions.',
    ],
    example: {
      input:
        'Synthetic donor CAG|GTAAGT; the boundary index is 3, so the first intronic G is labelled +1.',
      steps: [
        'Compute reference f(x) once using the displayed handwritten weights, logistic transform and core gate.',
        'At +1, compare G→A, G→C and G→T with the same reference. Each mutant changes only that base.',
        'Record Δ=f(mutant)−f(reference). Core mutations usually give large negative changes because this toy explicitly encodes the motif.',
        'The G row at +1 remains ref 0. Importance is the mean absolute delta over the three alternatives, not a clinical classification.',
      ],
      question:
        'If a base outside the scorer’s window has zero effect, have we established that it is biologically irrelevant?',
      answer:
        'No. This fixed-window model ignores that position by construction. Real splicing can depend on distant context, branch points, regulatory motifs, tissue and interactions absent from the model.',
    },
    inputs: [
      {
        id: 'sequence',
        label: 'DNA sequence',
        type: 'text',
        value: 'CAGGTAAGTAAGT',
        max: 48,
        help: 'ACGT only. Apply mutates the current reference; Undo and Reset reference are explicit.',
      },
      {
        id: 'type',
        label: 'Scoring target',
        type: 'select',
        value: 'donor',
        options: [
          { value: 'donor', label: 'Synthetic donor' },
          { value: 'acceptor', label: 'Synthetic acceptor' },
        ],
      },
      {
        id: 'junction',
        label: 'Boundary index: first base after the junction',
        type: 'number',
        value: '3',
        min: 1,
        max: 48,
        help: 'Zero-based boundary; donor needs 3 bases before/6 after, acceptor 14 before/1 after.',
      },
    ],
    presets: [
      { label: 'Canonical donor', values: {} },
      { label: 'Weak donor / gain', values: { sequence: 'CAGATAAGT' } },
      {
        label: 'Canonical acceptor',
        values: { sequence: 'TTTTTTTTTTTTAGG', type: 'acceptor', junction: '14' },
      },
    ],
    pseudocode: [
      'Declare fixed weights and a scoring target.',
      'Sum log₂(weight / uniform background) contributions.',
      'Apply logistic transform, explicit core gate and clipping; compute the reference once.',
      'For each position, score the three alternative bases and store signed mutant-minus-reference deltas.',
      'Summarize mean absolute delta across alternatives.',
      'Preview a mutation; Apply only by explicit action; recompute relative to the new reference.',
    ],
    sections: [
      {
        title: '1. ISM needs a precise output target and reference',
        text: [
          'For position i and alternative base b, x⁽ⁱ→ᵇ⁾ differs from x at exactly one nucleotide. The displayed matrix stores Δᵢᵦ=f(x⁽ⁱ→ᵇ⁾)−f(x). Changing the target site, window or reference changes the interpretation.',
          'Junction labels have no zero: positions before the boundary are −1, −2, etc.; the first after it is +1. For a donor, +1/+2 are intronic; for an acceptor, −2/−1 are intronic and +1 is exonic.',
          'There are 3L alternative model calls plus one reference call. The four-row display includes unchanged reference cells but does not imply 4L new evaluations.',
        ],
        math: String.raw`\Delta_{i,b}=f(x^{(i\to b)})-f(x),\qquad b\ne x_i`,
      },
      {
        title: '2. The entire synthetic model is disclosed',
        text: [
          'Weights are handwritten teaching choices, not frequencies estimated from GENCODE or learned neural weights. Donor uses [junction−3,junction+6); acceptor uses [junction−14,junction+1). Outside-window positions have no effect by construction.',
          'Each weight is floored at 0.001 for log-odds against a uniform 0.25 background. Apply a logistic transform with slope 0.85 and offset 2. The core multiplier is 1 for donor GT/GC or acceptor AG, otherwise 0.03; finally clip to [0.01,0.99].',
          'The output has the numerical shape of a probability but no calibration evidence. The weights, gate and clipping can cause effects or saturation by design, so a motif “discovery” here is not learned biological knowledge.',
        ],
        math: String.raw`f(x)=\operatorname{clip}_{.01,.99}\!\left[g(x)\,\sigma\!\left(.85\left(\sum_i\log_2\frac{\max(w_i(x_i),.001)}{.25}-2\right)\right)\right]`,
      },
      {
        title: '3. Importance, sign and higher-order interactions',
        text: [
          'Heatmap loss and gain are displayed separately. Position importance is the mean absolute delta over its three alternative substitutions. This avoids cancelling opposing effects and includes gains rather than measuring loss only.',
          'A high average describes sensitivity of this output to perturbations at that position. It is not a causal attribution to a transcription factor or a probability of pathogenicity.',
          'Single-base ISM misses interactions. A double-mutant extension can compare Δᵢⱼ−Δᵢ−Δⱼ, but nonlinear output transforms can create apparent interactions even when underlying motif weights are additive. A model-space interaction requires experimental validation before a biological claim.',
        ],
        math: String.raw`I_i=\frac13\sum_{b\ne x_i}|\Delta_{i,b}|`,
      },
      {
        title: '4. Reference changes should be deliberate and reversible',
        text: [
          'Selecting a revealed alternative previews its mutant score and signed delta in the pinned inspector without editing the sequence. Apply makes that mutant the new reference; all deltas are recomputed, not accumulated from stale results.',
          'Undo restores the previous sequence. Reset reference restores the last submitted example. Editing an input invalidates the old result until Build recomputes it; presets reset the mutation history.',
          'For a real sequence-to-function model, the same procedure can target one tissue/track, position or aggregated window while controlling context and strand. The original score, mutation convention and selected target should always be reported.',
        ],
      },
    ],
    complexity:
      'For sequence length L and model-call cost C, exhaustive single-base ISM costs (3L+1) evaluations, O(LC), and O(L) stored mutation results. This fixed-window scorer has bounded window cost; actual long-context neural models are far more expensive and may benefit from batching.',
    limitations: [
      'No neural model or clinical evidence; motifs, effects and saturation are handwritten.',
      'SNVs only: no indels, distant context, joint mutations or tissue effects.',
      'Model sensitivity is not causal biology or clinical pathogenicity; interpretation requires appropriate controls and validation.',
    ],
    exercises: [
      {
        question: 'Warm-up: what is Δ when the reference base is selected?',
        answer:
          'Exactly zero; sequence and target are unchanged, and the stored reference score is reused.',
      },
      {
        question: 'Core: does a positive Δ necessarily mean pathogenicity?',
        answer:
          'No. It means only that this chosen model output increased. Even a trained splice model needs target-specific interpretation and clinical evidence.',
      },
      {
        question:
          'Stretch: why might a double-mutant interaction appear despite additive log-odds weights?',
        answer:
          'The logistic transform, core gate and clipping are nonlinear. Additivity on a latent scale does not imply additivity of the displayed scalar output.',
      },
    ],
    references: [
      {
        title: 'OpenSpliceAI: model interpretation documentation',
        href: 'https://ccb.jhu.edu/openspliceai/content/behind_scenes.html',
        note: 'Real-model workflows; this lesson does not load its model.',
      },
      {
        title: 'OpenSpliceAI (eLife, 2025)',
        href: 'https://elifesciences.org/articles/107454',
        note: 'Primary trained splicing model, distinct from the synthetic scorer.',
      },
      {
        title: 'Splam (Genome Biology, 2024)',
        href: 'https://doi.org/10.1186/s13059-024-03379-4',
        note: 'Primary splice-site model and biological evaluation.',
      },
    ],
    related: [
      { title: 'Splice-site research', href: '/research/splice-sites/' },
      { title: 'Gene-finding grammar', href: '/algorithms/ghmm/' },
    ],
  },
  ghmm: {
    id: 'ghmm',
    title: 'Semi-Markov gene finding: durations, splice boundaries and reading frame',
    lead: 'Explain a small complete-gene grammar, inspect real duration/predecessor candidates, and translate a spliced coding sequence without resetting its frame at every exon.',
    prerequisites: 'Dynamic programming, HMM states, codons, and canonical splice junctions.',
    scope:
      'Restricted synthetic teaching scorer: at most one complete forward-strand gene, ATG start, canonical GT–AG introns, no UTRs or alternate genetic codes. Normalized duration/transition terms plus handcrafted rewards; not a calibrated gene probability.',
    intuition: [
      'Ordinary HMMs encode residence time through repeated state transitions. A semi-Markov state instead consumes an explicit segment of duration d, so its length can have a non-geometric distribution.',
      'A biological boundary belongs to a particular feature: GT starts the intron, AG ends the intron. Removing these signals from an exon after prediction cannot repair an incorrectly defined grammar.',
      'An intron interrupts genomic coordinates, not the coding frame of the mature transcript. Retain the actual partial codon letters across it; phase alone cannot detect a stop created at a splice junction.',
    ],
    example: {
      input:
        'ATGG | GTCCCCAG | CCTAA. Vertical bars mark exon–intron boundaries, not input characters.',
      steps: [
        'Initial exon ATGG contains complete codon ATG and pending G.',
        'The intron GTCCCCAG includes both splice dinucleotides. It emits no coding bases and carries pending G unchanged.',
        'The terminal exon begins CC, completing GCC across the junction; its remaining TAA is the terminal stop.',
        'Spliced CDS ATGGCCTAA translates to MA. Intron coordinates are 5…12 using 1-based inclusive annotation.',
      ],
      question: 'Why is computing each exon’s codons from position zero incorrect?',
      answer:
        'The terminal exon here begins with two bases that finish the preceding exon’s partial codon. Starting a fresh frame would translate CCT instead of GCC and miss the true stop frame.',
    },
    inputs: [
      {
        id: 'dna',
        label: 'Genomic DNA',
        type: 'text',
        value: 'ATGGGTCCCCAGCCTAA',
        max: 80,
        help: 'ACGT only; at most 80 bases in this lesson. Introns are supplied as ordinary genomic sequence.',
      },
      {
        id: 'duration',
        label: 'Maximum segment duration',
        type: 'number',
        value: '36',
        min: 8,
        max: 48,
      },
      {
        id: 'end',
        label: 'Inspect candidates ending at prefix length',
        type: 'number',
        value: '17',
        min: 1,
        max: 80,
        help: 'The complete DP runs for all endpoints; this selects the endpoint whose full candidate journal is shown.',
      },
    ],
    presets: [
      { label: 'Split codon', values: {} },
      { label: 'Single exon', values: { dna: 'ATGGCCAAAGCGTAA', end: '15' } },
      { label: 'Missing stop', values: { dna: 'AAAAATGGCCAAAGT', end: '15' } },
      { label: 'No gene', values: { dna: 'CCCCCCCCCCCC', end: '12' } },
      { label: 'Junction stop rejection', values: { dna: 'ATGTAGTCCCCAGATTTTAA', end: '20' } },
    ],
    pseudocode: [
      'Define Before → initial/single exon → intron/internal exon → terminal exon → After.',
      'Normalize duration weights over each bounded state support.',
      'Test segment signals and inherited partial codon; reject illegal candidates.',
      'For each reachable predecessor, add transition, duration and explicit sensor reward; retain best score per endpoint and coding context.',
      'Terminate only in After or no-gene Before, after explaining the entire region.',
      'Trace features, splice exon strings, verify start/stop/frame, then translate.',
    ],
    sections: [
      {
        title: '1. Explicit durations change the recurrence',
        text: [
          'V(q,t,c) stores the best path ending at prefix t in state q with coding context c. A candidate consumes the genomic interval [t−d,t), not one base. Its predecessor must end exactly where this interval begins.',
          'Duration weights use a truncated Gaussian-shaped distribution normalized on the declared support: initial exon ≥3, single exon ≥6, intron ≥8, internal/terminal exon ≥1. These tiny distributions aid visualization; they are not empirical human feature lengths.',
          'Before and After use single-base background steps. Only Before can start a gene, so the model intentionally allows zero or one gene. Changing maximum duration changes the support and normalizer, not merely runtime.',
        ],
        math: String.raw`V(q,t,c)=\max_{q',d,c'}\left[V(q',t-d,c')+\log a_{q'q}+\log f_q(d)+w_q(x_{t-d:t},c')\right]`,
      },
      {
        title: '2. Grammar, signals and score interpretation are separate',
        text: [
          'Before chooses background, initial exon or single exon with probabilities 0.98, 0.01, 0.01. An exon continuing the gene must lead to an intron; an intron chooses internal or terminal exon with probability 0.5 each.',
          'Introns contain both GT at their start and AG at their end. The start codon belongs to the initial coding exon; an in-frame stop belongs to a terminal exon. Splice signals are not excised from exon strings after the fact.',
          'Handcrafted rewards are +0.8 per coding base, +3 for start and +3 for stop, and +6 for a canonical intron. They deliberately expose a scoring objective but are not normalized emissions. Therefore the total is a weighted semi-Markov score, not log P(sequence) or a calibrated gene confidence.',
        ],
      },
      {
        title: '3. Keep partial codon bases, not only phase',
        text: [
          'The expanded state retains an empty prefix, one base, or two bases of a not-yet-complete codon. This finite context has 1+4+16 possible values. Introns preserve it; new exon bases complete it.',
          'Every completed codon is checked. A stop is legal only at the end of a terminal or single exon; a stop within a longer candidate rejects that candidate, including one completed across a junction.',
          'The displayed candidate journal contains all reachable predecessor/duration tests at the selected endpoint. An improvement flag means the candidate improved its cell when evaluated, not that it lies on the final path. Changing the endpoint changes the explanation, not the sequence or inferred optimum.',
        ],
      },
      {
        title: '4. Termination and traceback enforce a complete coding answer',
        text: [
          'Only complete-gene After and no-gene Before are permitted final states. An unfinished initial exon or intron cannot win merely because its local reward is high.',
          'Traceback reports nonoverlapping 1-based inclusive features. Coding sequence is exactly the concatenation of selected exon strings, with start and stop retained. Translation omits the terminal stop symbol.',
          'A rejected longer spliced candidate does not imply that the entire region has no gene: an alternative shorter complete ORF may remain legal. This restricted grammar has neither transcript evidence nor evolutionary constraints to choose a true annotation.',
        ],
      },
    ],
    complexity:
      'With length L, bounded duration D, a finite expanded state set Q (including partial-codon letters), and permitted transitions E, cached segment scoring supports O(LD|E|). This transparent implementation scans each coding candidate, adding an O(D) factor in the worst case. It stores reachable states and candidate journals; it is not the optimized complexity or trained accuracy of GENSCAN/AUGUSTUS.',
    limitations: [
      'One strand, one complete coding gene, canonical GT–AG only; no UTRs, partial genes, alternative splicing or special genetic codes.',
      'Synthetic rewards and shortened normalized durations are educational choices, not trained organism-specific parameters.',
      'Ab initio sequence alone does not prove a predicted gene is expressed or functional.',
    ],
    exercises: [
      {
        question: 'Warm-up: which feature includes the GT donor?',
        answer:
          'The intron starts with GT. In the worked example it begins at 1-based coordinate 5.',
      },
      {
        question: 'Core: which pending bases cross the worked-example intron?',
        answer:
          'G remains after ATG in the initial exon. CC completes GCC in the terminal exon; the final TAA is a stop.',
      },
      {
        question: 'Stretch: why is retaining only phase=2 insufficient to detect a junction stop?',
        answer:
          'Two pending bases could be TA, TG, AC, etc. The next base creates different codons. The DP must retain the actual letters or equivalent sufficient context, not just their count.',
      },
    ],
    references: [
      {
        title: 'Burge & Karlin (1997): GENSCAN',
        href: 'https://pubmed.ncbi.nlm.nih.gov/9149143/',
        note: 'Primary generalized-HMM gene-prediction formulation.',
      },
      {
        title: 'Stanke et al. (2004): AUGUSTUS',
        href: 'https://academic.oup.com/nar/article/32/suppl_2/W309/1040489',
        note: 'Probabilistic gene prediction; far richer and organism-trained compared with this restricted lesson.',
      },
    ],
    related: [
      { title: 'Profile HMM inference', href: '/algorithms/phmm/' },
      { title: 'Synthetic in silico mutagenesis', href: '/algorithms/ism/' },
    ],
  },
  phmm: {
    id: 'phmm',
    title: 'Profile HMMs: one best path, all paths, and uncertainty',
    lead: 'Build a small profile from an alignment, follow emitting and silent states, and compare Viterbi with Forward–Backward.',
    prerequisites: 'Probability, natural logarithms, sequence alignment and dynamic programming.',
    scope:
      'A normalized global M/I/D core with Begin and End. This is not full HMMER Plan7: no local entry, N/J/C special states, multi-hit search, statistical significance calibration or trained transition counts.',
    intuition: [
      'An aligned column suggests which residues a family tends to emit. A match state models that column; insertion states accommodate extra query residues; deletion states skip profile columns without consuming a residue.',
      'Viterbi chooses one path by taking maxima. Forward adds the probabilities of all valid paths. Keeping the same states and boundaries makes the distinction meaningful.',
      'Backward asks how much probability remains after a state. Combining Forward and Backward yields uncertainty conditional on the supplied query and model.',
    ],
    example: {
      input:
        'One DNA match column from two A residues. With pseudocount 0.1, P(A|M1)=2.1/2.4=0.875.',
      steps: [
        'For query A, the only valid one-residue global path is B→M1→E.',
        'Its probability is 0.85×0.875×0.92=0.68425. The End probability is part of the calculation.',
        'For query AA, paths M1→I1 and I0→M1 both contribute, with uniform insertion emission 0.25.',
        'Forward adds their probabilities 0.008925+0.00966=0.018585; Viterbi retains 0.00966.',
      ],
      question:
        'Why is the Forward log probability never smaller than the Viterbi log probability?',
      answer:
        'Forward sums nonnegative path probabilities, including the maximum path selected by Viterbi. Taking log preserves ordering. Equality can occur when only one path has nonzero probability.',
    },
    inputs: [
      {
        id: 'msa',
        label: 'Aligned rows (equal length; - for gaps)',
        type: 'textarea',
        value: 'ACG\nACG\nA-G',
        max: 120,
        help: 'At most 6 rows and 8 match columns. A column with at least 50% nongaps becomes M.',
      },
      { id: 'query', label: 'Unaligned query', type: 'text', value: 'AG', max: 16 },
      {
        id: 'alphabet',
        label: 'Residue alphabet',
        type: 'select',
        value: 'dna',
        options: [
          { value: 'dna', label: 'DNA: ACGT' },
          { value: 'protein', label: 'Protein: standard 20 residues' },
        ],
      },
      {
        id: 'mode',
        label: 'Dynamic-programming operator',
        type: 'select',
        value: 'viterbi',
        options: [
          { value: 'viterbi', label: 'Viterbi: maximum' },
          { value: 'forward', label: 'Forward: log-sum-exp' },
        ],
      },
    ],
    presets: [
      { label: 'Deletion', values: {} },
      { label: 'Insertion', values: { query: 'ACCG' } },
      { label: 'All-path sum', values: { query: 'ACCG', mode: 'forward' } },
      { label: 'One-column example', values: { msa: 'A\nA', query: 'AA', mode: 'forward' } },
      { label: 'Empty query', values: { query: '' } },
      {
        label: 'Protein',
        values: { msa: 'CAKCG\nCPKCG\nCAECG', query: 'CAKCG', alphabet: 'protein' },
      },
    ],
    pseudocode: [
      'Select match columns and estimate emissions with 0.1 pseudocounts.',
      'Declare normalized transition priors, including termination.',
      'Fill emitting M and I from the previous query row.',
      'Fill silent D left-to-right after M in the same row.',
      'Include End; run Backward in reverse dependency order; calculate posteriors.',
      'Trace Viterbi predecessors; compare best-path probability with the all-path sum.',
    ],
    sections: [
      {
        title: '1. Define a model before decoding',
        text: [
          'For each selected alignment column, count alphabet letters and add 0.1 to every letter before normalizing. Gaps do not emit. At least 50% occupancy selects a match column; ragged or all-gap alignments are rejected.',
          'Insertion emissions and background are uniform. Transition probabilities are fixed, declared priors rather than estimates from the MSA. Interior outgoing probabilities sum to one; at the final column impossible forward-profile transitions are zero and the remaining mass goes to End.',
          'Natural-log scores represent joint probabilities under this generative core, not HMMER bit scores or E-values. Zero probability is −∞, never an arbitrary tiny positive fallback.',
        ],
        math: String.raw`e_k(a)=\frac{c_k(a)+0.1}{\sum_b c_k(b)+0.1|\mathcal A|}`,
      },
      {
        title: '2. Emit versus skip: dependency order matters',
        text: [
          'Let i be the number of query residues consumed and k the profile position. M consumes both dimensions; I consumes i only; D consumes k only.',
          'For M(i,k), combine M/I/D at (i−1,k−1), their transition probabilities and the match emission. I(i,k) combines M/I at (i−1,k) and an insertion emission. D(i,k) combines M/D at (i,k−1) without an emission.',
          'The silent recurrence must be filled after its same-row emitting predecessor is available. Computing deletions only before M silently loses valid paths. Begin is represented only at M(0,0); there is no D0.',
        ],
        math: String.raw`D(i,k)=\operatorname{op}\!\left(M(i,k-1)+\log a_{MD},\ D(i,k-1)+\log a_{DD}\right)`,
      },
      {
        title: '3. Max-product and sum-product answer different questions',
        text: [
          'Viterbi uses maximum in log space and stores a predecessor. Forward uses log-sum-exp and must not keep only the largest contribution. Both include the same terminal transition.',
          'Log-sum-exp subtracts a maximum before exponentiation, preventing underflow from long products. If every candidate is impossible, the answer stays −∞.',
          'A high best-path share means one path dominates the conditional alignment distribution under this model; it is not calibrated evidence that the query belongs to a real protein family.',
        ],
        math: String.raw`\log\sum_r e^{z_r}=z_{\max}+\log\sum_r e^{z_r-z_{\max}},\qquad P(\pi^*\mid x)=e^{V-F}`,
      },
      {
        title: '4. Posterior uncertainty needs a complete Backward recursion',
        text: [
          'Backward sums all permitted outgoing transitions, including silent deletions and transitions from I and D, in reverse i and k order. Its Begin value agrees with the Forward total.',
          'For each emitted residue, posterior occupancy across all M and I states sums to one. Silent D occupancy describes a visited skipped column and is not added to this per-residue normalization.',
          'Posterior decoding can show ambiguity even when Viterbi returns a single deterministic path. Emissions, transition priors and boundaries determine the interpretation; changing them changes both scores and uncertainty.',
        ],
        math: String.raw`P(S_i=M_k\mid x)=\exp(F_M(i,k)+B_M(i,k)-\log P(x))`,
      },
    ],
    complexity:
      'For query length N and profile length K, each recurrence uses O(NK) time. Full Forward, Backward, Viterbi and posterior tables use O(NK) memory; score-only rolling rows can save memory. The profile diagram and event snapshots are additional teaching costs.',
    limitations: [
      'Fixed transition priors; insertion-column residue statistics are not fitted.',
      'Global single-domain core only; not full Plan7 or HMMER significance scoring.',
      'A posterior is conditional on this model, not a calibrated probability of family membership.',
    ],
    exercises: [
      {
        question: 'Warm-up: what does a deletion emit?',
        answer:
          'Nothing. It advances k while retaining i; its transition probability still contributes.',
      },
      {
        question: 'Core: calculate the one-column query A probability.',
        answer: '0.85×(2.1/2.4)×0.92=0.68425, so its natural log is approximately −0.3794.',
      },
      {
        question: 'Stretch: why can match-only posterior sums be below one?',
        answer:
          'Some conditional path mass places that residue in an insertion state. Sum M and I occupancy across positions; do not add silent D states.',
      },
    ],
    references: [
      {
        title: 'HMMER generic Forward/Backward source',
        href: 'https://github.com/EddyRivasLab/hmmer/blob/master/src/generic_fwdback.c',
        note: 'Production primary implementation; includes richer architecture than this lesson.',
      },
      {
        title: 'HMMER user guide',
        href: 'https://eddylab.org/software/hmmer/2.3.1/Userguide.pdf',
        note: 'Profile models, architecture, inference and score interpretation.',
      },
    ],
    related: [
      { title: 'Pairwise alignment', href: '/algorithms/pairwise/' },
      { title: 'Generalized HMM gene grammar', href: '/algorithms/ghmm/' },
    ],
  },
  'string-graph': {
    id: 'string-graph',
    title: 'String graphs: from exact overlaps to honest unitigs',
    lead: 'Keep reads whole, reason about overlap labels and placements, and learn when a shortcut really is redundant.',
    prerequisites: 'Strings, directed graphs, prefix/suffix matching, and half-open coordinates.',
    scope:
      'Exact forward-strand reads only. Exhaustive overlap search and local triangle reduction; not the optimized Myers algorithm, a noisy-read consensus caller, or a complete diploid assembler.',
    intuition: [
      'A read is a vertex. An edge records a matching suffix/prefix and the new letters contributed by its target. Follow an edge by appending only its overhang.',
      'Containment adds no extension. Duplicate copies must retain one representative rather than deleting every copy.',
      'A triangle is not automatically redundant: the direct and indirect routes must place the final read at the same coordinate AND spell the same extension. Nonbranching paths give unitigs, not necessarily complete chromosomes.',
    ],
    example: {
      input: 'AAACCCGGG → CCCGGGTTT → GGGTTTAAA; minimum overlap 3.',
      steps: [
        'R1→R2 overlaps CCCGGG (6 bases), appending TTT.',
        'R2→R3 overlaps GGGTTT (6 bases), appending AAA.',
        'R1→R3 overlaps GGG (3 bases), appending TTTAAA. Direct shift 9−3=6 equals two shifts 3+3.',
        'The direct extension TTTAAA equals TTT+AAA, so this shortcut is redundant. The exact path spells AAACCCGGGTTTAAA.',
      ],
      question: 'Does finding A→B→C and A→C alone justify removing A→C?',
      answer:
        'No. With CCCTTATTA, TTATTATTA, TTATTAGGG, the direct extension is GGG, while the indirect extension is TTAGGG. These describe different placements and spellings.',
    },
    inputs: [
      {
        id: 'reads',
        label: 'Reads, one per line',
        type: 'textarea',
        value: 'AAACCCGGG\nCCCGGGTTT\nGGGTTTAAA',
        max: 240,
        help: 'ACGTN only, forward-oriented. N is literal. Maximum 24 reads.',
      },
      {
        id: 'overlap',
        label: 'Minimum exact overlap',
        type: 'number',
        value: '3',
        min: 1,
        max: 30,
      },
    ],
    presets: [
      { label: 'Equivalent shortcut', values: {} },
      { label: 'Unequal triangle', values: { reads: 'CCCTTATTA\nTTATTATTA\nTTATTAGGG' } },
      { label: 'Duplicate + contained', values: { reads: 'ACGTAC\nACGTAC\nCGTA' } },
      { label: 'Disconnected cycle', values: { reads: 'ATGAT\nGATGA\nTGATG\nTTTTTT' } },
    ],
    pseudocode: [
      'Create one vertex per read.',
      'Retain one duplicate representative; remove strictly contained reads from topology.',
      'Test every ordered pair for the longest permitted exact suffix/prefix overlap.',
      'Remove a shortcut only if a two-edge witness agrees in shift and appended string.',
      'Spell maximal nonbranching paths; place each read at current length minus overlap.',
      'Retain remaining cycles and isolated reads; summarize, without claiming a finished genome.',
    ],
    sections: [
      {
        title: '1. Whole-read vertices preserve longer context',
        text: [
          'For an overlap of length ℓ from read A to B, the placement of B starts |A|−ℓ bases after A. The edge label B[ℓ:] is the extension; including the overlap again would duplicate bases.',
          'All-vs-all matching is exhaustive here. We search only the supplied orientation and exact letters; production assemblers need indexing, reverse complements, error tolerance and repeat handling.',
        ],
        math: String.raw`\operatorname{shift}(A,B)=|A|-\ell,\quad \operatorname{extension}(A,B)=B[\ell:]`,
      },
      {
        title: '2. Removing containment must not remove all duplicates',
        text: [
          'A strictly contained read contributes no new sequence to this exact graph, though it may provide support or useful evidence in a real pipeline.',
          'If two reads are equal, keep the earlier input representative. For nonidentical containment, choose the longest container deterministically. Original records remain available for inspection.',
        ],
      },
      {
        title: '3. Reduction is about equivalent spellings, not reachability alone',
        text: [
          'For each triangle, compare the direct shift with the sum of the two indirect shifts and compare the direct extension with the concatenated labels.',
          'Our bounded teaching implementation checks two-edge witnesses. It does not claim the full performance or reduction guarantees of Myers’ bidirected string-graph construction. Positive shifts make witnesses shorter than the shortcut and prevent circular removal dependencies.',
          'Rejected witnesses are shown too: learning why an edge remains is as important as seeing one disappear.',
        ],
        math: String.raw`s_{AC}=s_{AB}+s_{BC}\quad\text{and}\quad e_{AC}=e_{AB}\,e_{BC}`,
      },
      {
        title: '4. Layout is exact path spelling; consensus is a separate task',
        text: [
          'At each retained edge, append the overhang, then record the target read’s zero-based interval. Checking that the spelled substring equals the read verifies placement.',
          'Stop at branches. Start new unitigs on every outgoing branch, then visit any untouched cyclic components and isolated reads. A circular unitig is displayed with an arbitrary start and closing overlap.',
          'Noisy-read consensus would combine conflicting base evidence and estimate errors. This lesson does neither; calling exact concatenation “consensus” would conceal that distinction. N50 is only a length statistic.',
        ],
      },
    ],
    complexity:
      'The simple exact overlap search is O(R²L²) in the worst case for R reads of length at most L. This local triangle implementation may inspect O(R³) witnesses plus label comparisons. Graph compaction is O(V+E) excluding string output and trace snapshots. These are teaching costs, not the complexity of an optimized production string-graph assembler.',
    limitations: [
      'No reverse-complement or bidirected graph.',
      'No mismatch-tolerant overlaps, polishing, coverage model, or haplotype resolution.',
      'Local triangle reduction may leave longer redundant paths.',
      'A long unitig or high N50 does not establish assembly correctness.',
    ],
    exercises: [
      {
        question: 'Warm-up: where does R2 start relative to R1 in the worked example?',
        answer: 'At 9−6=3, so its interval is [3,12) in the assembled spelling.',
      },
      {
        question:
          'Core: why retain a shortcut with extension GGG when the indirect extension is TTAGGG?',
        answer:
          'The indirect route inserts extra bases and a different placement; graph reachability alone does not preserve sequence semantics.',
      },
      {
        question: 'Stretch: what evidence could help choose between two repeat branches?',
        answer:
          'Reads spanning the repeat into unique flanks, longer-range linkage, orientation and coverage can constrain choices. A unitig graph alone can retain ambiguity rather than inventing a resolution.',
      },
    ],
    references: [
      {
        title: 'Myers (2005): The fragment assembly string graph',
        href: 'https://www.cbcb.umd.edu/confcour/CMSC828H-materials/Myers-string-graphs.pdf',
        note: 'Primary definition and optimized string-graph construction; broader than this exact, single-orientation lesson.',
      },
    ],
    related: [
      { title: 'De Bruijn graphs', href: '/algorithms/debruijn/' },
      { title: 'Minimizers and chaining', href: '/algorithms/minimap2/' },
    ],
  },
  debruijn: {
    id: 'debruijn',
    title: 'De Bruijn graphs: spell a walk, understand the ambiguity',
    lead: 'Turn k-mers into a directed graph, follow Hierholzer’s stack, and distinguish a mathematical Eulerian reconstruction from assembly of noisy reads.',
    prerequisites: 'k-mers, directed edges, in-degree/out-degree, and a stack.',
    scope:
      'Two explicit modes: an ideal k-mer multiset with known copy counts, or observed-read coverage without known genome copy number. Cleaning is a reversible teaching preview, not an error classifier.',
    intuition: [
      'A k-mer overlaps its neighbors by k−1 letters. Represent its prefix and suffix as vertices and the k-mer itself as a directed edge. A walk spells a sequence by appending one new letter per edge.',
      'An ideal k-mer multiset says how many edge copies must be traversed. Read coverage instead counts repeated observations of potentially the same genomic edge. These are not interchangeable meanings of multiplicity.',
      'Unitigs compact paths with no topological choice. Repeated support for one edge does not create several different successors. At a genuine branch, the graph may permit several genome spellings.',
    ],
    example: {
      input: 'ATGAC, k=3: edges ATG, TGA, GAC; vertices AT, TG, GA, AC.',
      steps: [
        'Build AT→TG→GA→AC. Start has one extra outgoing edge; end has one extra incoming edge.',
        'Hierholzer pushes a destination while consuming an available edge copy.',
        'At the dead end AC, pop vertices into a reverse path. Reverse that path after the stack empties.',
        'Spell AT plus G, A, C: ATGAC. Observing the same read twice does not prove that the genome contains this path twice.',
      ],
      question: 'If every vertex is balanced, have we proved a single Eulerian genome exists?',
      answer:
        'No. Two disconnected cycles are balanced but cannot be covered by one walk. The algorithm also checks that every required edge copy was traversed; even a valid walk need not be a unique biological assembly.',
    },
    inputs: [
      {
        id: 'reads',
        label: 'Sequences or k-mers, one per line',
        type: 'textarea',
        value: 'ATGAC',
        max: 240,
        help: 'ACGTN only; N is treated literally. Each line contributes its consecutive k-mers.',
      },
      { id: 'k', label: 'k: edge length', type: 'number', value: '3', min: 2, max: 8 },
      {
        id: 'mode',
        label: 'Meaning of repeated observations',
        type: 'select',
        value: 'multiset',
        options: [
          { value: 'multiset', label: 'Ideal multiset: known edge copies' },
          { value: 'coverage', label: 'Observed reads: support only' },
        ],
      },
      {
        id: 'cleaning',
        label: 'Reversible cleaning preview',
        type: 'select',
        value: 'none',
        options: [
          { value: 'none', label: 'Original graph' },
          { value: 'tips', label: 'Short, weaker branch-attached tips' },
          { value: 'bubbles', label: 'Unequal-support simple bubbles' },
          { value: 'coverage', label: 'Support below threshold' },
        ],
      },
      {
        id: 'parameter',
        label: 'Preview: maximum path length / minimum support',
        type: 'number',
        value: '3',
        min: 1,
        max: 8,
      },
    ],
    presets: [
      { label: 'Simple path', values: { reads: 'ATGAC' } },
      { label: 'Cycle', values: { reads: 'ATGAT' } },
      { label: 'Disconnected cycles', values: { reads: 'ATGAT\nCCC' } },
      {
        label: 'Tip preview',
        values: {
          reads: 'ATGCGATCG\nATGCGATCG\nATGCGATTT',
          k: '4',
          mode: 'coverage',
          cleaning: 'tips',
        },
      },
      {
        label: 'Equal-support variation',
        values: {
          reads: 'ATGCTAGC\nATGCAAGC',
          k: '4',
          mode: 'coverage',
          cleaning: 'bubbles',
          parameter: '8',
        },
      },
    ],
    pseudocode: [
      'Aggregate k-mer edges from their (k−1)-prefix to suffix.',
      'Declare whether counts are copies or observed support.',
      'Preview explicit removals on a copy; preserve the original.',
      'For ideal copies, check degree balances and choose a start.',
      'Consume one edge copy and push its destination on the stack.',
      'At a dead end, pop into the reverse path; reverse and spell.',
      'Compact nonbranching topology; retain cycles and alternatives.',
    ],
    sections: [
      {
        title: '1. Edge-centric representation and two kinds of counts',
        text: [
          'For k-mer a₁…aₖ, create edge a₁…aₖ₋₁ → a₂…aₖ. Identical k-mers share one edge record; the displayed observation count sums their appearances.',
          'In ideal-multiset mode that count is explicitly assumed to be the required number of copies. In coverage mode the copy number is unknown, so genome-copy Euler reconstruction is disabled; topology and support are still available.',
          'Changing k changes connectivity: small k merges more repeats, while large k requires longer exact overlaps and is more sensitive to errors or missing coverage. N is a literal symbol in this toy graph, not a wildcard.',
        ],
      },
      {
        title: '2. Eulerian degree conditions are necessary, not the full certificate',
        text: [
          'An open Eulerian walk has one start with out−in=1, one end with in−out=1, and balance elsewhere. A circuit has balance everywhere. Use edge-copy counts, not just the number of distinct edge labels.',
          'After traversal, verify that the number of consumed copies equals the supplied total. This catches disconnected support even when every component separately satisfies the degree conditions.',
          'Eulerian means every required edge copy can be used in a single walk. It does not mean that the resulting genome spelling is unique or that reads support every choice through a repeat.',
        ],
        math: String.raw`\deg^+(v)-\deg^-(v)=\begin{cases}1&v=\text{start}\\-1&v=\text{end}\\0&\text{otherwise}\end{cases}`,
      },
      {
        title: '3. Hierholzer’s stack is different from the final path',
        text: [
          'Follow an unused outgoing copy and push its destination. When the current vertex has none left, pop it and append it to a reverse output list. Continue until the stack is empty.',
          'The visible trace records the real stack, consumed-copy count, and reverse list at each operation. A vertex’s first visit need not be its final place in the reconstructed path.',
          'Reverse the output and spell the starting (k−1)-mer, then append the final symbol of every edge. In a cycle, choosing a start chooses a rotation of a circular spelling.',
        ],
      },
      {
        title: '4. Unitigs and conservative cleaning preserve what is uncertain',
        text: [
          'A unitig follows vertices with one distinct predecessor and one distinct successor; support of 2 or 20 does not create a branch. Every leftover nonbranching cycle is retained, including disconnected components.',
          'Tip preview requires an attached dead-end path bounded by the stated edge length, support at most one, and a stronger competing branch. A normal contig end is not a tip merely because it is a dead end.',
          'Bubble preview compares internally nonbranching, edge-disjoint paths that meet at a sink. Equal-support alternatives are preserved. Removing the lower-support path can still erase a real allele; this is a heuristic preview, not biological truth.',
          'Undo preview reconstructs the original graph without changing the input. N50 here summarizes the displayed unitig lengths; it is not a correctness or completeness certificate.',
        ],
      },
    ],
    complexity:
      'For fixed k, k-mer construction is linear in input symbols. Hierholzer traversal is O(V+E_copies) with suitable adjacency lists; topological unitig compaction is O(V+E_distinct). Stored stack snapshots, bounded path-cleaning searches, and teaching rendering add costs. Assembling reads and resolving repeats is not simply “solved in O(E).”',
    limitations: [
      'Read coverage is not genome edge multiplicity; real assemblers must infer or avoid that assumption.',
      'A k-mer graph loses some read-path context, and multiple Eulerian spellings can remain valid.',
      'Short or low-support sequence may be true variation. Previewed cleaning always needs biological and read-level evidence.',
    ],
    exercises: [
      {
        question: 'Warm-up: spell AT→TG→GA→AC.',
        answer: 'Start with AT. Append G, then A, then C: ATGAC.',
      },
      {
        question:
          'Core: a path has coverage 2 on every edge. Is an internal vertex topologically branching?',
        answer:
          'No. There is still one distinct incoming edge and one distinct outgoing edge. The unitig remains the same path; coverage is an annotation.',
      },
      {
        question:
          'Stretch: why do two disconnected balanced cycles fail one-genome Euler traversal?',
        answer:
          'A single stack walk cannot jump between components. It leaves some required copies unconsumed; balance alone does not establish connectivity or a unique reconstruction.',
      },
    ],
    references: [
      {
        title: 'Pevzner, Tang & Waterman (2001)',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC55524/',
        note: 'Eulerian assembly, errors, repeats, and restoring read-path constraints.',
      },
    ],
    related: [
      { title: 'String graphs and read layout', href: '/algorithms/string-graph/' },
      { title: 'Minimizer anchors', href: '/algorithms/minimap2/' },
    ],
  },
  minimap2: {
    id: 'minimap2',
    title: 'Minimizers and chaining: from sparse seeds to a candidate mapping',
    lead: 'See which seeds survive a sliding window, where they match, and how dynamic programming chooses an ordered chain without double-counting overlapping bases.',
    prerequisites:
      'k-mers, hashing, coordinates, and the basic maximum-over-predecessors idea of DP.',
    scope:
      'A minimap2-inspired forward-strand teaching model with exhaustive chaining and an explicitly different linear gap cost. It does not perform base-level alignment or mapping-quality estimation.',
    intuition: [
      'An index need not keep every k-mer. A minimizer keeps the lowest-hash k-mer in each window of w consecutive k-mers. Neighboring windows often choose the same seed, which is stored only once.',
      'Equal seed strings in target and query create anchors at pairs of coordinates. Repeats can create many anchors; a seed match by itself is not a unique mapping.',
      'A chain orders anchors so both coordinates increase. Its reward counts newly covered matching bases, while its penalty discourages inconsistent gaps and distant jumps. Chaining suggests where to align; it is not an alignment of the bases between seeds.',
    ],
    example: {
      input: 'ACGT / ACGT, k=3, w=1. Anchors ACG at (0,0) and CGT at (1,1).',
      steps: [
        'The first anchor contributes its length, 3.',
        'The second overlaps by two bases, so it adds only min(1,1,3)=1 newly covered base.',
        'The declared teaching penalty is 0.5|Δx−Δy|+0.05 max(Δx,Δy)=0.05.',
        'The extended chain scores 3+1−0.05=3.95, not 6.95. Starting a new chain at 3 is the alternative.',
      ],
      question: 'Why not reward every seed by k when adding it to a chain?',
      answer:
        'Overlapping seeds cover some of the same bases. Repeatedly rewarding their full length inflates evidence and can make dense seed clusters look better than longer distinct coverage.',
    },
    inputs: [
      {
        id: 'target',
        label: 'Target DNA',
        type: 'text',
        value: 'ACGTTACG',
        max: 30,
        help: 'ACGT only. The diagram uses zero-based k-mer starts.',
      },
      { id: 'query', label: 'Query DNA', type: 'text', value: 'ACGTACG', max: 30 },
      { id: 'k', label: 'k: letters per seed', type: 'number', value: '3', min: 1, max: 8 },
      { id: 'w', label: 'w: k-mers per window', type: 'number', value: '2', min: 1, max: 8 },
      {
        id: 'distance',
        label: 'Maximum predecessor distance',
        type: 'number',
        value: '30',
        min: 1,
        max: 60,
      },
    ],
    presets: [
      { label: 'Overlapping seeds', values: { target: 'ACGT', query: 'ACGT', k: '3', w: '1' } },
      { label: 'Insertion', values: { target: 'ACGTTACG', query: 'ACGTACG' } },
      { label: 'Repeat ambiguity', values: { target: 'ACACAC', query: 'ACAC', k: '2', w: '2' } },
      { label: 'No anchors', values: { target: 'AAAAAA', query: 'CCCCCC' } },
    ],
    pseudocode: [
      'Enumerate each forward k-mer and its deterministic hash.',
      'Slide a window; choose the leftmost lowest-hash seed.',
      'Deduplicate repeated window selections and find exact seed hits.',
      'For anchor i, start with f(i)=k.',
      'Test earlier anchors: require increasing x/y and bounded distance.',
      'Compare f(j)+new coverage−beta against starting a new chain.',
      'Trace predecessor pointers from the highest-scoring anchor.',
    ],
    sections: [
      {
        title: '1. Define a window in k-mer units',
        text: [
          'A sequence of length L contains max(0,L−k+1) k-mers. A window of w k-mers spans w+k−1 letters when full.',
          'This demo uses a display-sized FNV-derived integer hash modulo 10,000 and leftmost tie breaking. Exact seed strings, not hash equality alone, determine hits. A shorter-than-w list uses one shortened window; a shorter-than-k sequence has no seeds.',
          'Larger w usually samples more sparsely, but repeat content and ties matter. The window trace shows all candidates and the selected minimizer rather than promising a universal compression factor.',
        ],
      },
      {
        title: '2. Matching seeds become geometric anchors',
        text: [
          'Each exact shared minimizer generates a pair (x,y) of target/query start coordinates. Width is k in this lesson; equal widths mean coordinate differences are unchanged if represented as ends.',
          'Sorted anchors need not form a chain: crossing, tied-coordinate, or overly distant predecessors are rejected. Repeated motifs create off-diagonal alternatives; a good seed chain still need not be the biological mapping.',
        ],
      },
      {
        title: '3. Start reward and predecessor reward are alternatives',
        text: [
          'For compatible anchors, α=min(Δx,Δy,k) counts at most k newly covered bases. Compare extending each predecessor with starting from k; do not add k a second time.',
          'The minimap2 paper uses a more sophisticated concave gap cost and production predecessor heuristics. This lesson deliberately uses β=0.5|Δx−Δy|+0.05 max(Δx,Δy), with no rounding, so each displayed candidate can be checked by hand.',
          'The heatmap/table contains every earlier-anchor evaluation, including a reason for rejected candidates. Dashed outlines mark the predecessor being tested.',
        ],
        math: String.raw`f(i)=\max\left\{k,\ \max_{j\prec i}\left[f(j)+\min(\Delta x,\Delta y,k)-\beta(j,i)\right]\right\}`,
      },
      {
        title: '4. A chain is evidence for an alignment, not the alignment itself',
        text: [
          'Traceback recovers the ordered seed chain ending at the best f(i). Bases skipped between anchors have not been aligned, so a chained span is not an exact gapped alignment or a calibrated mapping confidence.',
          'Real minimap2 adds reverse-complement handling, repetitive-seed filtering, optimized indexing/chaining, base-level extension, mapping-quality estimates, and spliced modes. Those details are beyond this exact small-instance chain demonstration.',
        ],
      },
    ],
    complexity:
      'For fixed k, this naive window scan costs O(Lw), seed pairing O(U_T·U_Q), anchor sorting O(A log A), and exhaustive chaining O(A²); the trace can also store O(A²) candidate evaluations. Optimized minimizer queues and hashed seed lookup have different costs. Minimap2’s predecessor-search heuristics improve average chaining work but are not this exhaustive implementation.',
    limitations: [
      'The declared linear teaching penalty is not minimap2’s production concave gap function.',
      'Only the forward strand is shown; a no-anchor result does not prove that no reverse-complement alignment exists.',
      'The visualizer limits repeat-expanded anchor sets rather than silently sampling away ambiguous hits.',
    ],
    exercises: [
      {
        question: 'Warm-up: how many k=3 seeds are in ACGT?',
        answer:
          'Two: ACG at start 0 and CGT at start 1. A w=2 window includes both and spans four letters.',
      },
      {
        question: 'Core: recompute the default overlapping-seed chain score.',
        answer:
          'Start 3; Δx=Δy=1 so new coverage=1 and β=0.05. Candidate 3.95 beats a fresh chain at 3.',
      },
      {
        question:
          'Stretch: can an anchor with a higher target coordinate but lower query coordinate extend a forward collinear chain?',
        answer:
          'No. Both coordinates must increase. That crossing may reflect a repeat, rearrangement, or reverse orientation, but it is incompatible with this chain’s model.',
      },
    ],
    references: [
      {
        title: 'Li (2018): minimap2',
        href: 'https://arxiv.org/html/1708.01492v2',
        note: 'Minimizer indexing, chaining recurrence, heuristics, and alignment extension.',
      },
      {
        title: 'minimap2 chaining source',
        href: 'https://github.com/lh3/minimap2/blob/master/lchain.c',
        note: 'Author-maintained production predecessor scoring and search.',
      },
    ],
    related: [
      { title: 'FM-index exact search', href: '/algorithms/fm-index/' },
      { title: 'Pairwise base-level alignment', href: '/algorithms/pairwise/' },
    ],
  },
  'fm-index': {
    id: 'fm-index',
    title: 'FM-index: search backwards, locate with LF',
    lead: 'Build the Burrows–Wheeler transform, update a suffix interval one letter at a time, and recover match coordinates without storing every suffix position.',
    prerequisites: 'Lexicographic ordering, string prefixes, and counting occurrences in a prefix.',
    scope:
      'Dense rotations, suffix array, and rank tables make the mechanics visible. This is not a compressed, gigabase-ready index.',
    intuition: [
      'Sort the suffixes of a reference: suffixes starting with a pattern occupy a contiguous interval. Search maintains that interval instead of checking the pattern at every reference position.',
      'The BWT stores the letter immediately preceding each suffix. Because equal letters retain their occurrence order between the last and first columns, LF maps a row to the suffix starting one position earlier.',
      'Backward search prepends query letters from right to left. Counting needs only interval endpoints and rank queries; reporting genomic positions is a separate locate operation.',
    ],
    example: {
      input: 'Reference BANANA$, query ANA. The unique $ sentinel sorts before letters.',
      steps: [
        'Sorted suffix positions are [6,5,3,1,0,4,2]; the BWT is ANNB$AA.',
        'Start with the inclusive interval [0,6]. Prepend A: [1,3].',
        'Prepend N: [5,6]. Prepend A: [2,3]. Two suffixes start with ANA.',
        'LF navigation to sampled suffix positions recovers zero-based matches 1 and 3.',
      ],
      question: 'Does the interval [2,3] mean text positions 2 and 3?',
      answer:
        'No. These are sorted suffix-array rows. Their text positions are SA[2]=3 and SA[3]=1. Counting two rows and locating their coordinates are different operations.',
    },
    inputs: [
      {
        id: 'reference',
        label: 'Reference text',
        type: 'text',
        value: 'BANANA',
        max: 30,
        help: 'Letters/digits, plus at most one trailing $. An empty reference becomes $.',
      },
      {
        id: 'pattern',
        label: 'Query pattern',
        type: 'text',
        value: 'ANA',
        max: 20,
        help: 'No sentinel in an ordinary substring query. Empty pattern matches all boundaries.',
      },
      {
        id: 'spacing',
        label: 'Suffix-position sample spacing',
        type: 'number',
        value: '3',
        min: 1,
        max: 8,
      },
    ],
    presets: [
      { label: 'BANANA / ANA', values: { reference: 'BANANA', pattern: 'ANA' } },
      { label: 'DNA exact match', values: { reference: 'GATTACA', pattern: 'ATT' } },
      { label: 'No match', values: { reference: 'BANANA', pattern: 'NAB' } },
      { label: 'Repeated matches', values: { reference: 'AAAAA', pattern: 'AA', spacing: '2' } },
    ],
    pseudocode: [
      'Append one unique terminal sentinel; generate suffix rows.',
      'Sort rows; read their preceding letters to form BWT.',
      'Build C and prefix-exclusive Occ rank tables.',
      'Prepend each query letter and update inclusive [sp,ep].',
      'Count ep−sp+1 rows, or zero for an empty interval.',
      'For each match row, follow LF until a suffix-position sample.',
      'Recover position = (sample + LF hops) mod N.',
    ],
    sections: [
      {
        title: '1. Construction connects suffix sorting to BWT',
        text: [
          'For text T of length N including $, SA[r] is the starting position of the r-th sorted suffix. The first column is T[SA[r]], while BWT[r]=T[(SA[r]−1) mod N].',
          'With one smallest sentinel, sorting cyclic rotations gives the same ordering as sorting suffixes. The lesson displays both so you can check this relationship by hand.',
          'Production construction does not materialize all rotations; dense construction here is deliberately bounded. A BWT is a reversible permutation, not automatically a compression algorithm.',
        ],
      },
      {
        title: '2. Rank and interval conventions prevent off-by-one errors',
        text: [
          'C(c) counts reference characters strictly smaller than c. Occ(c,r) counts c in BWT[0:r], excluding r. Our suffix interval [sp,ep] includes both endpoints.',
          'To prepend c, map the number of c characters before the interval and through its end. The ep+1 argument includes the old end row; the final −1 converts back to an inclusive endpoint.',
          'An absent character or sp>ep gives no match. The empty pattern starts with every suffix, corresponding to all text boundaries including the terminal one.',
        ],
        math: String.raw`sp'=C(c)+\operatorname{Occ}(c,sp),\qquad ep'=C(c)+\operatorname{Occ}(c,ep+1)-1`,
      },
      {
        title: '3. LF follows the same occurrence of a letter',
        text: [
          'The first occurrence of A in BWT maps to the first A in the first column; the second maps to the second. C selects the character block and Occ selects the occurrence within it.',
          'LF(r) leads to the suffix one character earlier, wrapping only through the sentinel. A query containing $ is rejected here because ordinary substring search should not accidentally search cyclic wraparound.',
        ],
        math: String.raw`LF(r)=C(\mathrm{BWT}[r])+\operatorname{Occ}(\mathrm{BWT}[r],r)`,
      },
      {
        title: '4. Count does not require locating every match',
        text: [
          'Count-only backward search never reads full-SA match coordinates. To locate, sample rows whose suffix position is divisible by spacing d.',
          'LF decrements suffix position modulo N. Within at most d−1 hops it reaches a sample; add the hop count back modulo N. Sampling arbitrary row numbers does not provide that guarantee.',
          'The trace reveals construction and LF first, then backward search, count, and locate separately. The full SA shown for teaching lets you verify the sampled result; it is not the locate lookup.',
        ],
        math: String.raw`\mathrm{position}(r)=(\mathrm{sample}(LF^h(r))+h)\bmod N`,
      },
    ],
    complexity:
      'With constant-time rank, backward-search counting takes O(|P|); suffix-position sampling with spacing d adds at most O(occ·d) LF/rank work to locate. Building samples and sorting reported positions are additional costs. This demo materializes O(N²) rotation characters and O(N|Σ|) rank entries, so it does not have a compressed FM-index’s memory footprint.',
    limitations: [
      'Exact matching does not handle substitutions or gaps without an extended search algorithm.',
      'An interval’s width is a count, not confidence or mapping uniqueness beyond exact hits.',
      'Dense teaching tables and a full suffix array must not be described as a compressed production FM-index.',
    ],
    exercises: [
      {
        question: 'Warm-up: why does BANANA’s query ANA have two hits?',
        answer:
          'Backward search ends at rows [2,3], width 2. Sampled LF locating gives text positions 3 and 1 (reported sorted as 1 and 3).',
      },
      {
        question: 'Core: what changes if Occ includes its endpoint?',
        answer:
          'The recurrence arguments must change. Mixing an inclusive Occ with the prefix-exclusive formula creates an off-by-one error; define the rank convention first.',
      },
      {
        question: 'Stretch: why sample by suffix position rather than row number?',
        answer:
          'LF decreases suffix position by exactly one modulo N. Divisibility samples are reached in fewer than d hops; lexicographic row spacing has no such arithmetic relationship.',
      },
    ],
    references: [
      {
        title: 'Ferragina & Manzini: opportunistic indexing',
        href: 'https://people.unipmn.it/manzini/papers/focs00draft.pdf',
        note: 'Original backward search and locating through sampling.',
      },
    ],
    related: [
      { title: 'Minimizers and chaining', href: '/algorithms/minimap2/' },
      { title: 'Wheeler graph post', href: '/posts/wgt/' },
    ],
  },
  wfa: {
    id: 'wfa',
    title: 'Wavefront alignment: follow the furthest-reaching frontier',
    lead: 'Replace a full alignment matrix with score-indexed frontiers. See exactly how mismatches, affine gaps, and matching stretches move along diagonals.',
    prerequisites:
      'The pairwise DP lesson, affine gaps, and coordinates in a two-dimensional grid.',
    scope:
      'Exact global affine alignment with integer costs. The browser keeps an explicit teaching trace; it is not an optimized WFA2 benchmark.',
    intuition: [
      'Ordinary DP asks for the best score at every prefix pair. WFA reverses the question: with a fixed penalty budget s, how far can we reach along each diagonal?',
      'Use i for consumed target letters, j for consumed query letters, and k=j−i. Moving diagonally leaves k unchanged. A query insertion increases k; a target deletion decreases it.',
      'A furthest-reaching offset dominates shorter offsets with the same score, diagonal, and state. After paying for a mismatch or gap, extend matching letters as far as possible. Matching is free in the objective, not free to compute.',
    ],
    example: {
      input: 'ACGT / ACGGT; mismatch 2, opening 3, extension 1, so gap(ℓ)=3+ℓ.',
      steps: [
        'At score 0, compare A, C, G: all match. The next T/G comparison stops the LCP.',
        'A mismatch costs 2 but does not fix the unequal lengths. A one-base insertion costs 3+1=4.',
        'The insertion consumes the extra query G, shifts to k=1, and leaves i unchanged.',
        'Extend T/T, reaching (4,5). The optimum cost is 4; repeated G letters can yield tied gap placements.',
      ],
      question: 'Is a cost-zero alignment computed in constant time?',
      answer:
        'No. Even identical length-n strings need n character comparisons to establish the matching stretch. A single wavefront is not a single machine operation.',
    },
    inputs: [
      ...sequenceInputs.map((input) => ({ ...input, max: 24 })),
      { id: 'mismatch', label: 'Mismatch penalty x', type: 'number', value: '2', min: 1, max: 6 },
      { id: 'open', label: 'Gap opening penalty o', type: 'number', value: '3', min: 0, max: 6 },
      {
        id: 'extend',
        label: 'Gap extension penalty e',
        type: 'number',
        value: '1',
        min: 1,
        max: 6,
      },
    ],
    presets: [
      { label: 'Identical', values: { target: 'ACGT', query: 'ACGT' } },
      { label: 'One SNP', values: { target: 'ACGT', query: 'AGGT' } },
      { label: 'Insertion', values: { target: 'ACGT', query: 'ACGGT' } },
      { label: 'Terminal gap', values: { target: 'A', query: 'AA' } },
    ],
    pseudocode: [
      'Initialize M₀[0] at the origin.',
      'Increase integer penalty s; ignore unreachable predecessors.',
      'Compute I and D from opening / extension candidates.',
      'Select the furthest valid M offset.',
      'Compare letters and extend the LCP at zero penalty.',
      'Stop only at (m,n); follow recorded state predecessors.',
      'Check complete consumption and rescore the alignment.',
    ],
    sections: [
      {
        title: '1. Name the objective and coordinates',
        text: [
          'We minimize cost, with match 0, mismatch x>0, and a nonempty gap costing o+ℓe. The first gap base costs o+e, unlike the pairwise lesson’s first-base parameter.',
          'The stored offset here is i, not the horizontal offset used in some WFA papers. Recover j as i+k. This choice determines where the +1 terms belong.',
        ],
        math: String.raw`\operatorname{cost}=x\,\#\text{mismatches}+\sum_{\text{gap runs}}(o+\ell e),\qquad k=j-i`,
      },
      {
        title: '2. Gap states move between diagonals',
        text: [
          'I consumes a query base: j increases, i does not, so its predecessor is on k−1. D consumes a target base: i increases by one, so its predecessor is on k+1.',
          'Missing states are negative infinity, never zero. Evaluate opening from M at s−o−e and extension from the same gap state at s−e; discard coordinates outside the sequence grid.',
        ],
        math: String.raw`I_{s,k}=\max(M_{s-o-e,k-1},I_{s-e,k-1}),\quad D_{s,k}=1+\max(M_{s-o-e,k+1},D_{s-e,k+1})`,
      },
      {
        title: '3. Choose an offset, then extend matching letters',
        text: [
          'A substitution consumes both letters, adding one to i without changing k. Compare that candidate with the I and D offsets, then extend equal letters.',
          'The trace separates penalty-bearing state calculations from character comparisons. The frontier table names M/I/D and shows both coordinates; the diagram places real recorded events in prefix-coordinate space.',
        ],
        math: String.raw`U_{s,k}=\max(M_{s-x,k}+1,I_{s,k},D_{s,k}),\quad M_{s,k}=U_{s,k}+\operatorname{LCP}(T[U_{s,k}:],Q[U_{s,k}+k:])`,
      },
      {
        title: '4. Termination, traceback, and correctness',
        text: [
          'The endpoint must be (m,n), on k=n−m. Increasing cost makes the first reachable endpoint optimal under the declared penalties.',
          'Traceback undoes LCP matches and then follows the saved predecessor. A switch from M to I/D consumes no character by itself; the gap state performs that consumption.',
          'A valid explicit alignment gives a finite upper bound: substitute across the common length and place the length difference in one gap. Reaching a resource limit is an error, not a zero-cost answer.',
        ],
      },
    ],
    complexity:
      'Original WFA has O(n·s) time and O(s²) wavefront memory for fixed penalties, where n is the larger sequence length and s the optimum cost; cost-zero identity still needs O(n) comparisons. This teaching engine additionally stores/render traces and scans bounded diagonals. BiWFA and optimized WFA2 memory modes are separate algorithms.',
    limitations: [
      'WFA is sensitive to the optimum penalty s; highly divergent sequences expand many wavefronts.',
      'A zero-penalty match extension is not zero computational work.',
      'Stored frontier updates, unique visited coordinates, and character comparisons are different quantities—not measured speedups.',
    ],
    exercises: [
      {
        question: 'Warm-up: what is the cost of A / AA with default penalties?',
        answer: 'One match costs 0 and one one-base gap costs 3+1=4.',
      },
      {
        question: 'Core: why is there no +1 in this implementation’s I recurrence?',
        answer:
          'Its offset is target coordinate i. I consumes a query letter, increasing j and k but leaving i unchanged. Using a horizontal-offset recurrence without conversion would be wrong.',
      },
      {
        question: 'Stretch: what happens when opening o=0?',
        answer:
          'Every gap base costs e; opening and extending are equal-cost alternatives. The integer-score algorithm still works because extension is positive. Several paths may tie.',
      },
    ],
    references: [
      {
        title: 'Marco-Sola et al.: original WFA',
        href: 'https://academic.oup.com/bioinformatics/article/37/4/456/5904262',
        note: 'Exact affine alignment, recurrence, and score-sensitive bounds.',
      },
      {
        title: 'WFA2: author-maintained implementation',
        href: 'https://github.com/smarco/WFA2-lib',
        note: 'Production exact/heuristic and memory modes.',
      },
      {
        title: 'BiWFA',
        href: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9940620/',
        note: 'Bidirectional wavefront alignment with linear memory.',
      },
    ],
    related: [
      { title: 'Pairwise DP', href: '/algorithms/pairwise/' },
      { title: 'Compare the same objective', href: '/algorithms/duel/' },
    ],
  },
  duel: {
    id: 'duel',
    title: 'Affine DP versus WFA: same answer, different computation',
    lead: 'Compare two exact algorithms without changing the alignment objective or confusing animation speed with computational performance.',
    prerequisites:
      'Pairwise alignment and the WFA lesson. Understand a gap run versus a single gap column.',
    scope:
      'An operation-count illustration—not a runtime benchmark. Both engines use match 0, mismatch 2, and gap cost 3+ℓ.',
    intuition: [
      'A fair algorithm comparison fixes the input, objective, and required output first. Otherwise an apparent win can simply come from solving a different problem.',
      'Affine DP evaluates every prefix pair and its gap states. WFA follows furthest-reaching states indexed by penalty and diagonal, extending exact matches between them.',
      'The synchronized stepper advances one recorded teaching event per engine. A DP prefix calculation and a WFA character comparison are not equal-cost CPU instructions; compare their definitions, not a fabricated race clock.',
    ],
    example: {
      input: 'Target ACGT, query ACGGT; match 0, mismatch 2, gap(ℓ)=3+ℓ.',
      steps: [
        'Convert to the maximizing DP engine: match 0, mismatch −2, first gap −4, extension −1.',
        'Run both engines on the same complete sequences.',
        'Both optimum penalties are 4. Different placements of the repeated G gap can be equally correct.',
        'Inspect DP prefix updates, WFA stored-state updates, and WFA character comparisons separately.',
      ],
      question: 'Can we compare DP with match +2 against WFA with match 0?',
      answer:
        'Not as a fair same-objective comparison. Rewarding matches can change the preferred alignment and total score; simply subtracting displayed scores does not fix the objectives.',
    },
    inputs: sequenceInputs.map((input) => ({ ...input, max: 24 })),
    presets: [
      { label: 'Identical', values: { target: 'ACGTACGT', query: 'ACGTACGT' } },
      { label: 'Insertion', values: { target: 'ACGT', query: 'ACGGT' } },
      { label: 'Divergent', values: { target: 'ACGTAC', query: 'TGCATA' } },
    ],
    pseudocode: [
      'Set identical affine costs and boundary rules.',
      'Compute each engine’s genuine trace.',
      'Advance a recorded event in each unfinished engine.',
      'Count DP prefix updates and WFA state updates separately.',
      'Include WFA character comparisons in the explanation.',
      'Require equal optimum costs; ties may have different strings.',
      'Discuss scaling without claiming measured runtime speed.',
    ],
    sections: [
      {
        title: '1. Translate gap conventions exactly',
        text: [
          'The WFA convention is o+ℓe. The pairwise engine uses gfirst+(ℓ−1)gextend. For a cost-maximizing/sign-flipped comparison, gfirst=−(o+e), not merely −o.',
          'A length-two gap therefore costs 5 in both engines: WFA 3+2; DP score −4−1.',
        ],
        math: String.raw`g_{\mathrm{first}}=-(o+e),\quad g_{\mathrm{extend}}=-e,\quad -S_{\mathrm{DP}}=C_{\mathrm{WFA}}`,
      },
      {
        title: '2. Understand what each counter measures',
        text: [
          'DP prefix updates count initialized boundary and computed interior cells, not the number of machine instructions. Interior affine cells calculate three state scores.',
          'WFA stored-state updates count valid M/I/D records. Character comparisons include matching comparisons and mismatches that stop an LCP. Looking only at the number of score layers hides that work.',
          'The tables and inspector show actual event coordinates and formulas. Once an engine finishes computation it stays at its final computational state while the other trace continues.',
        ],
      },
      {
        title: '3. Scaling depends on similarity and the required output',
        text: [
          'Full-table DP uses O(mn) time and memory. Original WFA uses O(n·s) time and O(s²) wavefront memory for fixed penalties.',
          'Low optimum cost can make WFA attractive. Large cost increases the frontier, while score-only rolling-row DP has a different memory/output tradeoff.',
          'Production benchmarks must specify hardware, implementation, sequence distribution, scoring, traceback requirements, heuristics, and repeated wall-clock measurements. This page does not perform those measurements.',
        ],
      },
    ],
    complexity:
      'Affine full-table DP: O(mn) time/space. Original WFA: O(n·s) time and O(s²) wavefront space, with O(n) work for cost-zero identity. Teaching traces and browser rendering add overhead and are not benchmark instrumentation.',
    limitations: [
      'Animation duration is user-controlled and says nothing about algorithm runtime.',
      'Different optimum alignment strings can have the same valid cost.',
      'A smaller number in one type of counter cannot be divided by another counter and called “times faster.”',
    ],
    exercises: [
      {
        question: 'Warm-up: translate WFA o=3, e=1 into the pairwise first-base convention.',
        answer:
          'Use first-base score −4 and additional-base score −1. A gap of length ℓ scores −(3+ℓ).',
      },
      {
        question: 'Core: why does WFA still do work on identical sequences?',
        answer:
          'It must compare each letter while extending its score-zero frontier. n matching comparisons are hidden by a score-layer count of one.',
      },
      {
        question:
          'Stretch: both alignments score 4 but put a gap at different G letters. Which is incorrect?',
        answer:
          'Neither necessarily is. Independently check sequence consumption and affine rescore. Repeated letters can produce multiple optimum tracebacks.',
      },
    ],
    references: [
      {
        title: 'Original WFA paper',
        href: 'https://academic.oup.com/bioinformatics/article/37/4/456/5904262',
        note: 'Affine-cost DP formulation and WFA comparison.',
      },
      {
        title: 'Biopython: affine-gap conventions',
        href: 'https://biopython.org/docs/latest/Tutorial/chapter_pairwise.html',
        note: 'First-base versus open-plus-extension parameterization.',
      },
    ],
    related: [
      { title: 'Pairwise alignment', href: '/algorithms/pairwise/' },
      { title: 'Wavefront alignment', href: '/algorithms/wfa/' },
    ],
  },
  pairwise: {
    id: 'pairwise',
    title: 'Pairwise alignment: build the answer, then trace it back',
    lead: 'Understand global, local, and fitting alignment by computing one prefix problem at a time. Then see why affine gaps need memory of the current state.',
    prerequisites:
      'Strings, a scoring rule, and the idea of reusing smaller subproblems. No prior bioinformatics required.',
    scope:
      'An exact, bounded teaching implementation—not a production read mapper. One deterministic optimum is displayed; ties remain visible.',
    intuition: [
      'An alignment writes two sequences in columns, inserting gaps where needed. Its score rewards matching letters and penalizes mismatches and gaps. We seek the highest total score, not simply the most matches.',
      'At cell (i,j), only the first i target letters and first j query letters matter. The last column must pair two letters, place a gap in the query, or place a gap in the target. These three exhaustive choices give a recurrence.',
      'Global alignment explains both complete sequences. Local alignment may restart at zero and extracts the best pair of substrings. Here, fitting alignment explains the complete query inside any target substring: target flanks are free, query flanks are not.',
    ],
    example: {
      input: 'Target ACGT, query AGT; match +2, mismatch −1, linear gap −3.',
      steps: [
        'Initialize empty-prefix scores: 0, −3, −6, … along each boundary.',
        'Compute prefixes in row order. A diagonal reuses a solution with both last letters removed.',
        'The alignment ACGT / A−GT has three matches and one gap: 6 − 3 = 3.',
        'Traceback follows a predecessor that achieved the stored maximum; a tie need not have a unique answer.',
      ],
      question: 'Why can we not start traceback at an arbitrary large value in global alignment?',
      answer:
        'Global alignment must consume both full sequences, so its endpoint is (m,n). A high interior score describes only prefixes. Local alignment deliberately chooses the highest cell instead.',
    },
    inputs: [
      ...sequenceInputs,
      {
        id: 'mode',
        label: 'Boundary / endpoint rule',
        type: 'select',
        value: 'global',
        options: [
          { value: 'global', label: 'Global: both sequences' },
          { value: 'local', label: 'Local: best substrings' },
          { value: 'semiglobal', label: 'Fitting: complete query' },
        ],
      },
      {
        id: 'gap',
        label: 'Gap model',
        type: 'select',
        value: 'linear',
        options: [
          { value: 'linear', label: 'Linear' },
          { value: 'affine', label: 'Affine: open then extend' },
        ],
      },
      { id: 'match', label: 'Match score', type: 'number', value: '2', min: -20, max: 20 },
      { id: 'mismatch', label: 'Mismatch score', type: 'number', value: '-1', min: -20, max: 20 },
      { id: 'open', label: 'First gap-base score', type: 'number', value: '-3', min: -20, max: 0 },
      {
        id: 'extend',
        label: 'Additional gap-base score',
        type: 'number',
        value: '-1',
        min: -20,
        max: 0,
      },
    ],
    presets: [
      {
        label: 'One deletion',
        values: { target: 'ACGT', query: 'AGT', mode: 'global', gap: 'linear' },
      },
      {
        label: 'Local motif',
        values: { target: 'TTACGG', query: 'CCACAA', mode: 'local', gap: 'linear' },
      },
      {
        label: 'Fitting query',
        values: { target: 'TTACGG', query: 'AC', mode: 'semiglobal', gap: 'linear' },
      },
      {
        label: 'Affine traceback',
        values: { target: 'A', query: 'AAC', mode: 'global', gap: 'affine' },
      },
    ],
    pseudocode: [
      'Initialize permitted empty prefixes.',
      'For each (i,j), score a diagonal substitution.',
      'Compute opening and extending for I and D.',
      'Take the maximum; local mode also permits zero.',
      'Choose endpoint using the alignment mode.',
      'Trace the selected state-aware predecessors.',
      'Rescore the reconstructed columns.',
    ],
    sections: [
      {
        title: '1. Prefixes turn an exponential search into dynamic programming',
        text: [
          'Let H(i,j) be the best score for prefixes x[0:i] and y[0:j]. A substitution contributes s(xᵢ,yⱼ); a linear gap contributes g. The recurrence compares all possible final-column types, so induction on i+j establishes optimality.',
          'For global alignment H(0,0)=0, H(i,0)=ig, and H(0,j)=jg. Fill only after the required neighbors are known.',
        ],
        math: String.raw`H_{i,j}=\max\{H_{i-1,j-1}+s(x_i,y_j),\ H_{i-1,j}+g,\ H_{i,j-1}+g\}`,
      },
      {
        title: '2. The recurrence is not enough: boundaries define the task',
        text: [
          'Local alignment adds zero to the maximum, initializes both boundaries to zero, starts traceback at the maximum anywhere, and stops at a zero-score cell.',
          'Fitting initializes H(i,0)=0 but charges H(0,j). It ends at the best cell in column n and stops when j=0. Both conventions differ from making all four overhangs free.',
        ],
        math: String.raw`\text{fitting endpoint}=\operatorname*{arg\,max}_{0\le i\le m} H_{i,n}`,
      },
      {
        title: '3. Affine gaps remember whether a gap is already open',
        text: [
          'A gap of length ℓ scores gₒ+(ℓ−1)gₑ here: gₒ is the first base cost. Some papers instead use o+ℓe; translate parameters before comparing implementations.',
          'I consumes a target letter (gap in the query), while D consumes a query letter. M is the best score including all endings in this implementation. Open from M or extend the same gap state. Do not traceback using only M’s arrows: extending I may require a predecessor that was not the best M at that coordinate.',
          'The separate M/I/D tables below expose this memory. Diagonal, I, then D is our deterministic tie order; a tied optimum is not evidence of a unique biological alignment.',
        ],
        math: String.raw`I_{i,j}=\max(M_{i-1,j}+g_o,I_{i-1,j}+g_e),\quad D_{i,j}=\max(M_{i,j-1}+g_o,D_{i,j-1}+g_e)`,
      },
      {
        title: '4. Read the answer as a score ledger',
        text: [
          'Traceback traverses the chosen endpoint backwards. A diagonal consumes both letters; a gap state consumes only one. Reversing the collected columns yields the displayed alignment.',
          'Always check complete sequence consumption for global alignment and recompute the score from columns. These invariants detect plausible-looking but incorrect traceback paths.',
          'Identity is matches divided by alignment columns, including gaps, in this lesson. It is not the objective function and other tools may define it differently.',
        ],
      },
    ],
    complexity:
      'For lengths m and n, full-table linear or three-state affine DP uses O(mn) time and O(mn) space. Rolling rows reduce score-only memory to O(min(m,n)); obtaining an alignment then needs a separate traceback strategy. Rendering and stepping are additional teaching costs.',
    limitations: [
      'Real mappers also choose seeds, handle repeats and reverse complements, and estimate mapping uncertainty.',
      'Alignment scores are a user-chosen objective, not calibrated probabilities of homology.',
      'Changing the scoring rule can change the optimal alignment; multiple optima are common.',
    ],
    exercises: [
      {
        question: 'Warm-up: score ACGT / A−GT under the default linear rule.',
        answer: 'Three matches contribute +6; one gap contributes −3. Total = 3.',
      },
      {
        question: 'Core: compare a length-three affine gap with three separately opened gaps.',
        answer:
          'With first base −3 and extension −1, one length-three run scores −5. Three independent one-base runs score −9. Keeping a gap state matters.',
      },
      {
        question: 'Stretch: what changes if a fitting query is longer than the target?',
        answer:
          'The full query must still be consumed. Query letters not paired with target letters incur gap costs; the algorithm cannot discard them for free. Try A / ACCCCC.',
      },
    ],
    references: [
      {
        title: 'Needleman & Wunsch (1970)',
        href: 'https://www.gersteinlab.org/courses/452/05-fall/readings/needleman-wunsch-orig-dyn-prog-paper.pdf',
        note: 'Original global-alignment dynamic programming.',
      },
      {
        title: 'Smith & Waterman (1981)',
        href: 'https://cs.brown.edu/courses/csci1820/spring-2022/resources/Smith_Waterman_1981.pdf',
        note: 'Local restart and optimal-subsequence alignment.',
      },
      {
        title: 'Gotoh (1982)',
        href: 'https://pubmed.ncbi.nlm.nih.gov/7166760/',
        note: 'Affine-gap dynamic programming.',
      },
    ],
    related: [
      { title: 'Wavefront alignment', href: '/algorithms/wfa/' },
      { title: 'DP vs WFA', href: '/algorithms/duel/' },
    ],
  },
};
