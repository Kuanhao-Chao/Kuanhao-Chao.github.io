import { describe, expect, it } from 'vitest';
import {
  createStudyState,
  filterInterviewQuestions,
  flattenQuestionBanks,
  normaliseStudyState,
  questionsForStudyPlan,
  RAPID_REVIEW_LESSON_IDS,
  updateQuestionProgress,
  type InterviewQuestion,
} from './mlInterview';

const question = (id: string, overrides: Partial<InterviewQuestion> = {}): InterviewQuestion => ({
  id,
  question: `Question ${id}`,
  conciseAnswer: `Answer ${id}`,
  lessonId: 'lesson-a',
  priority: 'common',
  difficulty: 'intermediate',
  roles: ['general-mle'],
  kind: 'concept',
  round: 'knowledge',
  stability: 'evergreen',
  tags: ['modeling'],
  aliases: [],
  ...overrides,
});

describe('interview-question filtering', () => {
  const questions = [
    question('q-linear', {
      question: 'Why does feature scaling affect gradient descent?',
      priority: 'must-know',
      difficulty: 'foundational',
      roles: ['general-mle', 'applied-scientist'],
      kind: 'mathematics',
      tags: ['optimization', 'scaling'],
    }),
    question('q-serving', {
      question: 'How would you monitor an online ranking model?',
      priority: 'specialist',
      difficulty: 'advanced',
      roles: ['ml-platform'],
      kind: 'system-design',
      round: 'system-design',
      tags: ['monitoring', 'ranking'],
    }),
  ];

  it('matches normalized prompt, answer, tag, and alias text', () => {
    expect(
      filterInterviewQuestions(questions, { query: 'GRADIENT scaling' }).map((q) => q.id)
    ).toEqual(['q-linear']);
    expect(filterInterviewQuestions(questions, { query: 'monitoring' }).map((q) => q.id)).toEqual([
      'q-serving',
    ]);
  });

  it('combines metadata filters with AND semantics and array membership', () => {
    expect(
      filterInterviewQuestions(questions, {
        priority: 'must-know',
        difficulty: 'foundational',
        role: 'applied-scientist',
        kind: 'mathematics',
        round: 'knowledge',
      }).map((q) => q.id)
    ).toEqual(['q-linear']);
    expect(filterInterviewQuestions(questions, { role: 'research-scientist' })).toEqual([]);
    expect(
      filterInterviewQuestions(questions, { round: 'system-design' }).map((q) => q.id)
    ).toEqual(['q-serving']);
  });
});

describe('local study state', () => {
  it('starts with readable answers and no stored progress', () => {
    expect(createStudyState()).toEqual({
      version: 1,
      practiceMode: false,
      bookmarks: [],
      confidence: {},
      reviewedAt: {},
    });
  });

  it('discards unknown ids and malformed values during schema upgrades', () => {
    expect(
      normaliseStudyState(
        {
          version: 99,
          practiceMode: true,
          bookmarks: ['q-a', 'missing', 'q-a'],
          confidence: { 'q-a': 'confident', missing: 'again', 'q-b': 'invalid' },
          reviewedAt: { 'q-a': '2026-08-22T01:02:03.000Z', missing: 'yesterday' },
        },
        new Set(['q-a', 'q-b'])
      )
    ).toEqual({
      version: 1,
      practiceMode: true,
      bookmarks: ['q-a'],
      confidence: { 'q-a': 'confident' },
      reviewedAt: { 'q-a': '2026-08-22T01:02:03.000Z' },
    });
  });

  it('updates one question immutably', () => {
    const start = createStudyState();
    const next = updateQuestionProgress(start, 'q-a', {
      bookmarked: true,
      confidence: 'learning',
      reviewedAt: '2026-08-22T02:00:00.000Z',
    });
    expect(start.bookmarks).toEqual([]);
    expect(next.bookmarks).toEqual(['q-a']);
    expect(next.confidence['q-a']).toBe('learning');
  });
});

describe('study paths', () => {
  const questions = [
    question('q-must', {
      lessonId: RAPID_REVIEW_LESSON_IDS[0],
      priority: 'must-know',
    }),
    question('q-later-must', { lessonId: 'ml-interview-cnn-vision', priority: 'must-know' }),
    question('q-common', { priority: 'common' }),
    question('q-specialist', { priority: 'specialist' }),
  ];

  it('uses the calibrated foundational must-know tier for rapid review', () => {
    expect(questionsForStudyPlan(questions, 'rapid').map((q) => q.id)).toEqual(['q-must']);
  });

  it('adds common questions for core review and everything for complete review', () => {
    expect(questionsForStudyPlan(questions, 'core').map((q) => q.id)).toEqual([
      'q-must',
      'q-later-must',
      'q-common',
    ]);
    expect(questionsForStudyPlan(questions, 'complete').map((q) => q.id)).toEqual([
      'q-must',
      'q-later-must',
      'q-common',
      'q-specialist',
    ]);
  });
});

describe('question-bank contract', () => {
  it('flattens lesson-owned banks into question records', () => {
    const out = flattenQuestionBanks([
      {
        lessonId: 'lesson-a',
        questions: [
          {
            ...question('q-a'),
            lessonId: undefined,
          },
        ],
      },
    ]);
    expect(out).toEqual([question('q-a')]);
  });

  it('rejects duplicate ids and undated fast-moving answers', () => {
    expect(() =>
      flattenQuestionBanks([
        {
          lessonId: 'a',
          questions: [
            { ...question('same'), lessonId: undefined },
            { ...question('same'), lessonId: undefined },
          ],
        },
      ])
    ).toThrow(/duplicate interview question id "same"/i);

    expect(() =>
      flattenQuestionBanks([
        {
          lessonId: 'a',
          questions: [{ ...question('fresh'), lessonId: undefined, stability: 'fast-moving' }],
        },
      ])
    ).toThrow(/fast-moving question "fresh" requires a verified date/i);
  });
});
