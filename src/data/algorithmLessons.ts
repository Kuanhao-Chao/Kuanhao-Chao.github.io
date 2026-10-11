import type { LessonDefinition } from '../lib/algorithmLessonTypes';

const sequenceInputs = [
  { id: 'target', label: 'Target (rows)', value: 'ACGT', type: 'text' as const, max: 30, help: 'Letters only; at most 30. Empty prefixes are allowed.' },
  { id: 'query', label: 'Query (columns)', value: 'AGT', type: 'text' as const, max: 30 },
];
export const ALGORITHM_LESSONS: Record<string, LessonDefinition> = {
  pairwise: {
    id: 'pairwise', title: 'Pairwise alignment: build the answer, then trace it back',
    lead: 'Understand global, local, and fitting alignment by computing one prefix problem at a time. Then see why affine gaps need memory of the current state.',
    prerequisites: 'Strings, a scoring rule, and the idea of reusing smaller subproblems. No prior bioinformatics required.',
    scope: 'An exact, bounded teaching implementation—not a production read mapper. One deterministic optimum is displayed; ties remain visible.',
    intuition: [
      'An alignment writes two sequences in columns, inserting gaps where needed. Its score rewards matching letters and penalizes mismatches and gaps. We seek the highest total score, not simply the most matches.',
      'At cell (i,j), only the first i target letters and first j query letters matter. The last column must pair two letters, place a gap in the query, or place a gap in the target. These three exhaustive choices give a recurrence.',
      'Global alignment explains both complete sequences. Local alignment may restart at zero and extracts the best pair of substrings. Here, fitting alignment explains the complete query inside any target substring: target flanks are free, query flanks are not.',
    ],
    example: {
      input: 'Target ACGT, query AGT; match +2, mismatch −1, linear gap −3.',
      steps: ['Initialize empty-prefix scores: 0, −3, −6, … along each boundary.', 'Compute prefixes in row order. A diagonal reuses a solution with both last letters removed.', 'The alignment ACGT / A−GT has three matches and one gap: 6 − 3 = 3.', 'Traceback follows a predecessor that achieved the stored maximum; a tie need not have a unique answer.'],
      question: 'Why can we not start traceback at an arbitrary large value in global alignment?',
      answer: 'Global alignment must consume both full sequences, so its endpoint is (m,n). A high interior score describes only prefixes. Local alignment deliberately chooses the highest cell instead.',
    },
    inputs: [...sequenceInputs,
      { id: 'mode', label: 'Boundary / endpoint rule', type: 'select', value: 'global', options: [{ value: 'global', label: 'Global: both sequences' }, { value: 'local', label: 'Local: best substrings' }, { value: 'semiglobal', label: 'Fitting: complete query' }] },
      { id: 'gap', label: 'Gap model', type: 'select', value: 'linear', options: [{ value: 'linear', label: 'Linear' }, { value: 'affine', label: 'Affine: open then extend' }] },
      { id: 'match', label: 'Match score', type: 'number', value: '2', min: -20, max: 20 },
      { id: 'mismatch', label: 'Mismatch score', type: 'number', value: '-1', min: -20, max: 20 },
      { id: 'open', label: 'First gap-base score', type: 'number', value: '-3', min: -20, max: 0 },
      { id: 'extend', label: 'Additional gap-base score', type: 'number', value: '-1', min: -20, max: 0 },
    ],
    presets: [
      { label: 'One deletion', values: { target: 'ACGT', query: 'AGT', mode: 'global', gap: 'linear' } },
      { label: 'Local motif', values: { target: 'TTACGG', query: 'CCACAA', mode: 'local', gap: 'linear' } },
      { label: 'Fitting query', values: { target: 'TTACGG', query: 'AC', mode: 'semiglobal', gap: 'linear' } },
      { label: 'Affine traceback', values: { target: 'A', query: 'AAC', mode: 'global', gap: 'affine' } },
    ],
    pseudocode: ['Initialize permitted empty prefixes.', 'For each (i,j), score a diagonal substitution.', 'Compute opening and extending for I and D.', 'Take the maximum; local mode also permits zero.', 'Choose endpoint using the alignment mode.', 'Trace the selected state-aware predecessors.', 'Rescore the reconstructed columns.'],
    sections: [
      { title: '1. Prefixes turn an exponential search into dynamic programming', text: ['Let H(i,j) be the best score for prefixes x[0:i] and y[0:j]. A substitution contributes s(xᵢ,yⱼ); a linear gap contributes g. The recurrence compares all possible final-column types, so induction on i+j establishes optimality.', 'For global alignment H(0,0)=0, H(i,0)=ig, and H(0,j)=jg. Fill only after the required neighbors are known.'], math: String.raw`H_{i,j}=\max\{H_{i-1,j-1}+s(x_i,y_j),\ H_{i-1,j}+g,\ H_{i,j-1}+g\}` },
      { title: '2. The recurrence is not enough: boundaries define the task', text: ['Local alignment adds zero to the maximum, initializes both boundaries to zero, starts traceback at the maximum anywhere, and stops at a zero-score cell.', 'Fitting initializes H(i,0)=0 but charges H(0,j). It ends at the best cell in column n and stops when j=0. Both conventions differ from making all four overhangs free.'], math: String.raw`\text{fitting endpoint}=\operatorname*{arg\,max}_{0\le i\le m} H_{i,n}` },
      { title: '3. Affine gaps remember whether a gap is already open', text: ['A gap of length ℓ scores gₒ+(ℓ−1)gₑ here: gₒ is the first base cost. Some papers instead use o+ℓe; translate parameters before comparing implementations.', 'I consumes a target letter (gap in the query), while D consumes a query letter. M is the best score including all endings in this implementation. Open from M or extend the same gap state. Do not traceback using only M’s arrows: extending I may require a predecessor that was not the best M at that coordinate.', 'The separate M/I/D tables below expose this memory. Diagonal, I, then D is our deterministic tie order; a tied optimum is not evidence of a unique biological alignment.'], math: String.raw`I_{i,j}=\max(M_{i-1,j}+g_o,I_{i-1,j}+g_e),\quad D_{i,j}=\max(M_{i,j-1}+g_o,D_{i,j-1}+g_e)` },
      { title: '4. Read the answer as a score ledger', text: ['Traceback traverses the chosen endpoint backwards. A diagonal consumes both letters; a gap state consumes only one. Reversing the collected columns yields the displayed alignment.', 'Always check complete sequence consumption for global alignment and recompute the score from columns. These invariants detect plausible-looking but incorrect traceback paths.', 'Identity is matches divided by alignment columns, including gaps, in this lesson. It is not the objective function and other tools may define it differently.'] },
    ],
    complexity: 'For lengths m and n, full-table linear or three-state affine DP uses O(mn) time and O(mn) space. Rolling rows reduce score-only memory to O(min(m,n)); obtaining an alignment then needs a separate traceback strategy. Rendering and stepping are additional teaching costs.',
    limitations: ['Real mappers also choose seeds, handle repeats and reverse complements, and estimate mapping uncertainty.', 'Alignment scores are a user-chosen objective, not calibrated probabilities of homology.', 'Changing the scoring rule can change the optimal alignment; multiple optima are common.'],
    exercises: [
      { question: 'Warm-up: score ACGT / A−GT under the default linear rule.', answer: 'Three matches contribute +6; one gap contributes −3. Total = 3.' },
      { question: 'Core: compare a length-three affine gap with three separately opened gaps.', answer: 'With first base −3 and extension −1, one length-three run scores −5. Three independent one-base runs score −9. Keeping a gap state matters.' },
      { question: 'Stretch: what changes if a fitting query is longer than the target?', answer: 'The full query must still be consumed. Query letters not paired with target letters incur gap costs; the algorithm cannot discard them for free. Try A / ACCCCC.' },
    ],
    references: [
      { title: 'Needleman & Wunsch (1970)', href: 'https://www.gersteinlab.org/courses/452/05-fall/readings/needleman-wunsch-orig-dyn-prog-paper.pdf', note: 'Original global-alignment dynamic programming.' },
      { title: 'Smith & Waterman (1981)', href: 'https://cs.brown.edu/courses/csci1820/spring-2022/resources/Smith_Waterman_1981.pdf', note: 'Local restart and optimal-subsequence alignment.' },
      { title: 'Gotoh (1982)', href: 'https://pubmed.ncbi.nlm.nih.gov/7166760/', note: 'Affine-gap dynamic programming.' },
    ],
    related: [{ title: 'Wavefront alignment', href: '/algorithms/wfa/' }, { title: 'DP vs WFA', href: '/algorithms/duel/' }],
  },
};
