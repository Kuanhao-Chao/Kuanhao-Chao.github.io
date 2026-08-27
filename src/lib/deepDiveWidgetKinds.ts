/**
 * Single source of truth for every interactive deep-dive figure.
 *
 * The Astro shell, browser controller, and curriculum contract all consume this
 * registry so a lesson cannot silently mount a kind that the client cannot render.
 */
export const DEEP_DIVE_WIDGET_KINDS = [
  'ld-decay',
  'drift',
  'power',
  'selection',
  'finemap',
  'prs',
  'bias-variance',
  'decision-threshold',
  'gradient-descent',
  'attention-temperature',
  'sc-dropout',
  'sc-normalize',
  'sc-knn-graph',
  'sc-resolution',
  'sc-embedding',
  'sc-marker-contrast',
  'sc-pseudobulk',
  'sc-composition',
  'pca-structure',
  'sweep-age',
  'fdr-staircase',
  'assortative-mating',
  'twas-ld',
  'three-tests',
  'mr-pleiotropy',
  'burden-skat',
] as const;

export type DeepDiveWidgetKind = (typeof DEEP_DIVE_WIDGET_KINDS)[number];
