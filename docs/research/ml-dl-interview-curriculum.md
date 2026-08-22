# Machine learning and deep learning interview curriculum — research record

Verified: 2026-08-22

## Purpose and editorial decision

The curriculum is designed for candidates preparing for machine-learning engineer,
applied-scientist, research-scientist, deep-learning, GenAI, and ML-platform interviews.
It is a course and a question bank, not a list of trivia. The public hub is
`/deep_dives/ml-dl-interview/`; durable concepts are taught in prerequisite order, while
fast-moving material is explicitly dated.

A single mega-page was rejected. It would make prerequisite relationships invisible,
produce an unusable mobile document, and encourage short disconnected answers. The release
uses one course hub and focused lessons. Every question has a linkable ID, a concise
interview answer, and a detailed explanation in its owning lesson.

The question design follows the strongest useful signal in Chip Huyen's interview corpus:
real understanding is better exposed by **why, when, and failure-mode** questions than by
definition recall. Huyen reports more than 200 knowledge questions, about 30 open-ended
system-design questions, and notes that system design is common and often the hardest part
of the process. This curriculum does not copy that bank; it uses the observation to define
its own original prompts, answers, examples, and figures.

Primary interview-orientation sources:

- Chip Huyen, [Machine Learning Interviews](https://huyenchip.com/ml-interviews-book/)
- Chip Huyen, [About the questions](https://huyenchip.com/ml-interviews-book/contents/0-about-the-questions.html)
- Stanford CS 329S, [Machine Learning Systems Design](https://stanford-cs329s.github.io/)

## Scope model

The course deliberately covers five kinds of evidence an interviewer can ask for:

1. **Conceptual model** — what problem a method solves, which assumptions make it valid,
   and when it is the wrong tool.
2. **Mathematical model** — objective, likelihood, geometry, gradient, uncertainty, and
   computational complexity, derived rather than merely quoted.
3. **Implementation model** — shapes, vectorization, numerical stability, memory,
   testing, and debugging.
4. **Decision model** — metrics, validation design, trade-offs, responsible deployment,
   and how evidence changes a choice.
5. **System model** — product requirements, data and label contracts, training and
   serving architecture, capacity estimates, rollout, monitoring, and failure recovery.

Role labels are filters, not separate truths. The same core mechanism may be questioned at
different depths for a general MLE, applied scientist, research scientist, DL specialist,
GenAI engineer, platform engineer, or technical leader.

## Curriculum coverage

The dependency order is:

1. Linear algebra, calculus, probability, statistics, information theory.
2. Learning theory, generalization, data, features, validation, metrics, and experiments.
3. Linear and probabilistic models, kernels, trees, ensembles, and unsupervised learning.
4. Neural networks, backpropagation, optimization, regularization, vision, sequence models,
   attention, Transformers, generative and self-supervised models, and graph models.
5. Reinforcement learning, recommenders, ranking, time series, foundation models, adaptation,
   retrieval, agents, uncertainty, robustness, interpretation, fairness, and privacy.
6. Data-centric development, production systems, debugging, coding, project defense,
   system design, and senior leadership.

Every technical lesson follows the same learning sequence where it is useful:

> direct answer → intuition → notation → formal statement or derivation → numerical example
> → assumptions and trade-offs → failure modes and diagnostics → interview follow-ups

Behavioral and leadership questions replace unnecessary equations with evidence, decision,
stakeholder, and reflection frameworks. Mathematical decoration is not treated as rigor.

## Primary-source map

### Mathematical and statistical foundations

- Deisenroth, Faisal, and Ong, [Mathematics for Machine Learning](https://mml-book.github.io/)
- Murphy, [Probabilistic Machine Learning](https://probml.github.io/pml-book/)
- Boyd and Vandenberghe, [Convex Optimization](https://web.stanford.edu/~boyd/cvxbook/)
- James et al., [An Introduction to Statistical Learning](https://www.statlearning.com/)
- Goodfellow, Bengio, and Courville, [Deep Learning](https://www.deeplearningbook.org/)

Historical results are cited to their primary publications: likelihood, hypothesis testing,
PCA and low-rank approximation, information theory and KL divergence, bootstrap, uniform
convergence/PAC learning, ridge and lasso, SVMs, trees, bagging, random forests, boosting,
EM, and nearest neighbours.

### Neural networks, architectures, and optimization

Primary anchors include the original or canonical papers for backpropagation, ReLU,
initialization, dropout, batch normalization, layer normalization, Adam and AdamW, residual
networks, LSTM, sequence-to-sequence learning, the Transformer, Vision Transformer,
message-passing graph networks, VAEs, GANs, contrastive learning, and diffusion models.
Architecture diagrams are redrawn from first principles; publisher figures are not copied.

### Foundation models, retrieval, and alignment

Durable mechanisms are anchored to primary sources including:

- Vaswani et al., [Attention Is All You Need](https://arxiv.org/abs/1706.03762)
- Devlin et al., [BERT](https://arxiv.org/abs/1810.04805)
- Hoffmann et al., [Chinchilla scaling](https://arxiv.org/abs/2203.15556)
- Lewis et al., [Retrieval-Augmented Generation](https://arxiv.org/abs/2005.11401)
- Hu et al., [LoRA](https://arxiv.org/abs/2106.09685)
- Ouyang et al., [InstructGPT](https://arxiv.org/abs/2203.02155)
- Rafailov et al., [Direct Preference Optimization](https://arxiv.org/abs/2305.18290)
- Dao et al., [FlashAttention](https://arxiv.org/abs/2205.14135)
- Liang et al., [HELM](https://arxiv.org/abs/2211.09110)

The content separates an algorithmic idea from a product implementation. It does not maintain
a vendor leaderboard, imply that RAG guarantees factuality, claim that an agent is reliable
because it can call tools, or treat an LLM judge as ground truth. Model/version-specific
claims are marked `fast-moving` and carry the verification date.

### Production and responsible ML

- Sculley et al., [Hidden Technical Debt in Machine Learning Systems](https://research.google/pubs/hidden-technical-debt-in-machine-learning-systems/)
- Breck et al., [The ML Test Score](https://research.google/pubs/whats-your-ml-test-score-a-rubric-for-ml-production-systems/)
- NIST, [AI Risk Management Framework 1.0](https://doi.org/10.6028/NIST.AI.100-1)
- NIST, [Generative AI Profile](https://doi.org/10.6028/NIST.AI.600-1)
- NIST, [Adversarial Machine Learning Taxonomy](https://doi.org/10.6028/NIST.AI.100-2e2025)
- OWASP, [Top 10 for LLM Applications 2025](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- Mitchell et al., [Model Cards](https://arxiv.org/abs/1810.03993)
- Gebru et al., [Datasheets for Datasets](https://doi.org/10.1145/3458723)

NIST states that the AI RMF is voluntary and risk-management oriented; the GenAI Profile is
a companion profile, not a certification. OWASP's list is a community security taxonomy, not
a complete threat model. Lessons preserve these qualifications.

## Accuracy policy

- Numerical claims are either derived in the lesson, reproduced by a tested helper, or tied
  to a source. Examples use small transparent numbers and label synthetic data as synthetic.
- A benchmark result never becomes a general claim about all datasets, groups, or deployment
  settings.
- Correlation, predictive utility, causal identification, calibration, and uncertainty are
  kept distinct.
- “Bias” is qualified: statistical estimator bias, inductive bias, dataset bias, and social
  harms are different concepts.
- Model confidence is not automatically a calibrated probability; explanation scores are not
  causal effects; offline metrics are not business outcomes.
- Questions may be intentionally underspecified, but the answer must respond by clarifying
  the target, constraints, data-generating process, and cost of errors.

## Figures, interaction, and copyright

Figures are original SVG explanations expressed in site-native code. They use text and shape
in addition to colour, include accessible titles/descriptions through the existing Figure
component, survive print, and remain understandable without animation. Interaction is added
only when changing a parameter materially teaches a relationship (for example a decision
threshold, learning rate, regularization strength, or attention weights). No decorative
autoplay is used, and reduced-motion/no-JavaScript states retain the explanation.

Books and papers are cited and linked; their prose, diagrams, and exercises are not copied.
Open access and arXiv availability are not treated as permission to adapt figures.

## Maintenance policy

Evergreen lessons are reviewed when a mathematical or implementation error is reported.
Fast-moving questions are revalidated at least annually and whenever a linked standard is
superseded. The following require explicit re-checks before their verification date changes:

- foundation-model scale, context, memory, and latency examples;
- RAG, agent, evaluation, and inference-stack practices;
- OWASP and NIST taxonomies;
- hardware- or vendor-specific serving claims;
- regulatory statements and model/version comparisons.

The release audit checks question ownership, unique anchors, source closure, required worked
examples/exercises/figures, rendered math, responsive overflow, no-JavaScript/print answer
visibility, local-only study progress, search/terminal discovery, canonical URLs, sitemap
inclusion, and draft exclusion.
