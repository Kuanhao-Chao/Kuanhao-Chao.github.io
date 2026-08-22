import curriculum from '../data/mlInterviewCurriculum.json';

export const INTERVIEW_ROLES = [
  'general-mle',
  'applied-scientist',
  'research-scientist',
  'dl-specialist',
  'genai',
  'ml-platform',
  'leadership',
] as const;

export const INTERVIEW_PRIORITIES = ['must-know', 'common', 'specialist'] as const;
export const INTERVIEW_DIFFICULTIES = ['foundational', 'intermediate', 'advanced'] as const;
export const INTERVIEW_KINDS = [
  'concept',
  'mathematics',
  'implementation',
  'debugging',
  'system-design',
  'trade-off',
  'behavioral',
] as const;
export const INTERVIEW_ROUNDS = [
  'knowledge',
  'coding',
  'experimentation',
  'system-design',
  'project-defense',
  'behavioral',
] as const;
export const INTERVIEW_STABILITIES = ['evergreen', 'fast-moving'] as const;
export const CONFIDENCE_LEVELS = ['again', 'learning', 'confident'] as const;
export const STUDY_PLANS = ['rapid', 'core', 'complete'] as const;
export const RAPID_REVIEW_LESSON_IDS = curriculum.lessons
  .slice(0, curriculum.rapidLessonCount)
  .map(({ id }) => id);
const RAPID_REVIEW_LESSON_SET = new Set(RAPID_REVIEW_LESSON_IDS);

export const INTERVIEW_LABELS = {
  priority: {
    'must-know': 'Must know',
    common: 'Common',
    specialist: 'Specialist',
  },
  difficulty: {
    foundational: 'Foundational',
    intermediate: 'Intermediate',
    advanced: 'Advanced',
  },
  role: {
    'general-mle': 'General MLE',
    'applied-scientist': 'Applied scientist',
    'research-scientist': 'Research scientist',
    'dl-specialist': 'DL specialist',
    genai: 'GenAI / LLM',
    'ml-platform': 'ML platform',
    leadership: 'Leadership',
  },
  kind: {
    concept: 'Concept',
    mathematics: 'Mathematics',
    implementation: 'Implementation',
    debugging: 'Debugging',
    'system-design': 'System design',
    'trade-off': 'Trade-off',
    behavioral: 'Behavioral',
  },
  round: {
    knowledge: 'Knowledge',
    coding: 'Coding',
    experimentation: 'Experimentation',
    'system-design': 'System design',
    'project-defense': 'Project defense',
    behavioral: 'Behavioral',
  },
  confidence: {
    again: 'Review again',
    learning: 'Learning',
    confident: 'Confident',
  },
  plan: {
    rapid: `7-day · ${curriculum.rapidQuestionCount} foundations`,
    core: '2-week · core',
    complete: '4-week · complete',
  },
} as const;

export type InterviewRole = (typeof INTERVIEW_ROLES)[number];
export type InterviewPriority = (typeof INTERVIEW_PRIORITIES)[number];
export type InterviewDifficulty = (typeof INTERVIEW_DIFFICULTIES)[number];
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];
export type InterviewRound = (typeof INTERVIEW_ROUNDS)[number];
export type InterviewStability = (typeof INTERVIEW_STABILITIES)[number];
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type StudyPlan = (typeof STUDY_PLANS)[number];

export interface InterviewQuestion {
  id: string;
  question: string;
  conciseAnswer: string;
  lessonId: string;
  priority: InterviewPriority;
  difficulty: InterviewDifficulty;
  roles: InterviewRole[];
  kind: InterviewKind;
  round: InterviewRound;
  stability: InterviewStability;
  verified?: string;
  tags: string[];
  aliases: string[];
}

export type BankQuestion = Omit<InterviewQuestion, 'lessonId'> & { lessonId?: never };

export interface InterviewQuestionBank {
  lessonId: string;
  questions: BankQuestion[];
}

export interface QuestionFilter {
  query?: string;
  priority?: InterviewPriority | 'all';
  difficulty?: InterviewDifficulty | 'all';
  role?: InterviewRole | 'all';
  kind?: InterviewKind | 'all';
  round?: InterviewRound | 'all';
  lessonId?: string | 'all';
  bookmarkedIds?: ReadonlySet<string>;
  bookmarksOnly?: boolean;
  confidence?: ConfidenceLevel | 'unrated' | 'all';
  confidenceById?: Readonly<Record<string, ConfidenceLevel>>;
}

export interface StudyState {
  version: 1;
  practiceMode: boolean;
  bookmarks: string[];
  confidence: Record<string, ConfidenceLevel>;
  reviewedAt: Record<string, string>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConfidence = (value: unknown): value is ConfidenceLevel =>
  typeof value === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(value);

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));

export function createStudyState(): StudyState {
  return { version: 1, practiceMode: false, bookmarks: [], confidence: {}, reviewedAt: {} };
}

export function normaliseStudyState(value: unknown, knownIds: ReadonlySet<string>): StudyState {
  if (!isRecord(value)) return createStudyState();

  const bookmarks = Array.isArray(value.bookmarks)
    ? [
        ...new Set(
          value.bookmarks.filter((id): id is string => typeof id === 'string' && knownIds.has(id))
        ),
      ]
    : [];
  const confidence: Record<string, ConfidenceLevel> = isRecord(value.confidence)
    ? Object.fromEntries(
        Object.entries(value.confidence).filter(
          (entry): entry is [string, ConfidenceLevel] =>
            knownIds.has(entry[0]) && isConfidence(entry[1])
        )
      )
    : {};
  const reviewedAt: Record<string, string> = isRecord(value.reviewedAt)
    ? Object.fromEntries(
        Object.entries(value.reviewedAt).filter(
          (entry): entry is [string, string] => knownIds.has(entry[0]) && isIsoDate(entry[1])
        )
      )
    : {};

  return {
    version: 1,
    practiceMode: value.practiceMode === true,
    bookmarks,
    confidence,
    reviewedAt,
  };
}

export function updateQuestionProgress(
  state: StudyState,
  id: string,
  update: { bookmarked?: boolean; confidence?: ConfidenceLevel | null; reviewedAt?: string | null }
): StudyState {
  const bookmarks = new Set(state.bookmarks);
  if (update.bookmarked === true) bookmarks.add(id);
  if (update.bookmarked === false) bookmarks.delete(id);

  const confidence = { ...state.confidence };
  if (update.confidence === null) delete confidence[id];
  else if (update.confidence) confidence[id] = update.confidence;

  const reviewedAt = { ...state.reviewedAt };
  if (update.reviewedAt === null) delete reviewedAt[id];
  else if (update.reviewedAt && isIsoDate(update.reviewedAt)) reviewedAt[id] = update.reviewedAt;

  return { ...state, bookmarks: [...bookmarks], confidence, reviewedAt };
}

const normalizedTokens = (query = '') =>
  query.normalize('NFKD').toLocaleLowerCase('en').trim().split(/\s+/).filter(Boolean);

export function filterInterviewQuestions(
  questions: readonly InterviewQuestion[],
  filter: QuestionFilter
): InterviewQuestion[] {
  const tokens = normalizedTokens(filter.query);
  return questions.filter((q) => {
    const haystack = [q.question, q.conciseAnswer, q.id, ...q.tags, ...q.aliases]
      .join(' ')
      .normalize('NFKD')
      .toLocaleLowerCase('en');
    if (tokens.some((token) => !haystack.includes(token))) return false;
    if (filter.priority && filter.priority !== 'all' && q.priority !== filter.priority)
      return false;
    if (filter.difficulty && filter.difficulty !== 'all' && q.difficulty !== filter.difficulty)
      return false;
    if (filter.role && filter.role !== 'all' && !q.roles.includes(filter.role)) return false;
    if (filter.kind && filter.kind !== 'all' && q.kind !== filter.kind) return false;
    if (filter.round && filter.round !== 'all' && q.round !== filter.round) return false;
    if (filter.lessonId && filter.lessonId !== 'all' && q.lessonId !== filter.lessonId)
      return false;
    if (filter.bookmarksOnly && !filter.bookmarkedIds?.has(q.id)) return false;
    if (filter.confidence && filter.confidence !== 'all') {
      const current = filter.confidenceById?.[q.id];
      if (filter.confidence === 'unrated' ? current !== undefined : current !== filter.confidence)
        return false;
    }
    return true;
  });
}

export function questionsForStudyPlan(
  questions: readonly InterviewQuestion[],
  plan: StudyPlan
): InterviewQuestion[] {
  if (plan === 'complete') return [...questions];
  if (plan === 'rapid') {
    return questions.filter(
      (q) => q.priority === 'must-know' && RAPID_REVIEW_LESSON_SET.has(q.lessonId)
    );
  }
  return questions.filter((q) => q.priority !== 'specialist');
}

export function flattenQuestionBanks(banks: readonly InterviewQuestionBank[]): InterviewQuestion[] {
  const seen = new Set<string>();
  const questions: InterviewQuestion[] = [];

  for (const bank of banks) {
    for (const question of bank.questions) {
      if (seen.has(question.id))
        throw new Error(`Duplicate interview question id "${question.id}"`);
      if (question.stability === 'fast-moving' && !isIsoDate(question.verified)) {
        throw new Error(`Fast-moving question "${question.id}" requires a verified date`);
      }
      seen.add(question.id);
      questions.push({ ...question, lessonId: bank.lessonId });
    }
  }

  return questions;
}
