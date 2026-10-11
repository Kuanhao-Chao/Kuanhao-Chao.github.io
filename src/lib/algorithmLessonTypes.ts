export interface LessonInput {
  id: string;
  label: string;
  value: string;
  type: 'text' | 'textarea' | 'number' | 'select';
  help?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
}
export interface LessonDefinition {
  id: string;
  title: string;
  lead: string;
  prerequisites: string;
  scope: string;
  intuition: string[];
  example: { input: string; steps: string[]; question: string; answer: string };
  inputs: LessonInput[];
  presets: { label: string; values: Record<string, string> }[];
  pseudocode: string[];
  sections: { title: string; text: string[]; math?: string }[];
  complexity: string;
  limitations: string[];
  exercises: { question: string; answer: string }[];
  references: { title: string; href: string; note: string }[];
  related: { title: string; href: string }[];
}
export interface LessonCell {
  id: string;
  row: number;
  column: number;
  value: string;
  detail: string;
  revealAt: number;
  tone?: 'positive' | 'negative' | 'neutral';
  mutation?: { position: number; base: string };
  action?: { input: string; value: string };
}
export interface LessonTable {
  id: string;
  label: string;
  rows: string[];
  columns: string[];
  cells: LessonCell[];
  hideFutureRows?: boolean;
}
export interface LessonNode {
  id: string;
  label: string;
  x: number;
  y: number;
  detail: string;
  revealAt: number;
}
export interface LessonEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  detail: string;
  revealAt: number;
}
export interface LessonGraph {
  nodes: LessonNode[];
  edges: LessonEdge[];
}
export interface LessonPoint {
  id: string;
  x: number;
  y: number;
  label: string;
  detail: string;
  revealAt: number;
  tone?: 'positive' | 'negative' | 'neutral';
  action?: { input: string; value: string };
}
export interface LessonChart {
  id: string;
  label: string;
  xLabel: string;
  yLabel: string;
  points: LessonPoint[];
  xMax: number;
  yMax: number;
  xMin?: number;
  yMin?: number;
  diagonal?: boolean;
  threshold?: number;
  lines?: { x1: number; y1: number; x2: number; y2: number; label: string; revealAt: number }[];
}
export interface LessonFrame {
  phase: string;
  title: string;
  explanation: string;
  line: number;
  active: string[];
  predecessors?: string[];
  removed?: string[];
  metrics: { label: string; value: string }[];
  result?: string;
}
export interface LessonRun {
  frames: LessonFrame[];
  tables?: LessonTable[];
  graph?: LessonGraph;
  charts?: LessonChart[];
}
export type LessonValues = Record<string, string>;
