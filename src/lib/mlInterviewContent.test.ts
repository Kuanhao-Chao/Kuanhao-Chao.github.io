import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import curriculum from '../data/mlInterviewCurriculum.json';

const CONTENT = 'src/content/deepDives';
const BANKS = 'src/content/deepDiveQuestionBanks';
const EXPECTED_COUNTS = Object.fromEntries(
  curriculum.lessons.map(({ id, questionCount }) => [id, questionCount])
);

interface RawQuestion {
  id: string;
  priority: 'must-know' | 'common' | 'specialist';
  stability: 'evergreen' | 'fast-moving';
  verified?: string | Date;
}

interface RawBank {
  lesson: string;
  questions: RawQuestion[];
}

const bankFiles = () =>
  existsSync(BANKS)
    ? readdirSync(BANKS)
        .filter((file) => /\.ya?ml$/.test(file))
        .sort()
    : [];

const banks = () =>
  bankFiles().map((file) => ({
    file,
    bank: parse(readFileSync(join(BANKS, file), 'utf8')) as RawBank,
  }));

describe('ML interview question-bank content', () => {
  it('keeps the shared curriculum manifest internally consistent', () => {
    const ids = curriculum.lessons.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      curriculum.lessons.reduce((sum, { questionCount }) => sum + questionCount, 0)
    ).toBe(curriculum.totalQuestions);
    expect(curriculum.rapidLessonCount).toBeLessThanOrEqual(curriculum.lessons.length);
  });

  it('ships one exact-count bank for every published curriculum lesson', () => {
    const found = new Map(banks().map(({ bank }) => [bank.lesson, bank.questions.length]));
    expect(Object.fromEntries([...found].filter(([id]) => id in EXPECTED_COUNTS))).toEqual(
      EXPECTED_COUNTS
    );
  });

  it('has 351 unique addressable questions in the complete course', () => {
    const ids = banks()
      .filter(({ bank }) => bank.lesson in EXPECTED_COUNTS)
      .flatMap(({ bank }) => bank.questions.map((question) => question.id));
    expect(ids).toHaveLength(curriculum.totalQuestions);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^q-[a-z0-9-]+$/.test(id))).toBe(true);
  });

  it('keeps the 72-question foundational rapid-review tier calibrated', () => {
    const firstRelease = new Set(
      Object.keys(EXPECTED_COUNTS).slice(0, curriculum.rapidLessonCount)
    );
    const mustKnow = banks()
      .filter(({ bank }) => firstRelease.has(bank.lesson))
      .flatMap(({ bank }) => bank.questions)
      .filter((question) => question.priority === 'must-know');
    expect(mustKnow).toHaveLength(curriculum.rapidQuestionCount);
  });

  it('uses every registered question exactly once in its owning lesson', () => {
    for (const { bank } of banks().filter(({ bank }) => bank.lesson in EXPECTED_COUNTS)) {
      const mdx = readFileSync(join(CONTENT, `${bank.lesson}.mdx`), 'utf8');
      const used = [...mdx.matchAll(/<InterviewQuestion\s+id="([^"]+)"/g)].map((match) => match[1]);
      expect(used, bank.lesson).toHaveLength(bank.questions.length);
      expect(used.sort(), bank.lesson).toEqual(
        bank.questions.map((question) => question.id).sort()
      );
    }
  });

  it('dates every fast-moving question', () => {
    const undated = banks().flatMap(({ bank }) =>
      bank.questions
        .filter((question) => question.stability === 'fast-moving' && !question.verified)
        .map((question) => `${bank.lesson}:${question.id}`)
    );
    expect(undated).toEqual([]);
  });

  it('publishes the complete roadmap without metadata-only placeholders', () => {
    const lessons = readdirSync(CONTENT)
      .filter((file) => /^ml-interview-.*\.mdx$/.test(file))
      .map((file) => ({ file, body: readFileSync(join(CONTENT, file), 'utf8') }));
    expect(lessons.map(({ file }) => file.replace(/\.mdx$/, '')).sort()).toEqual(
      Object.keys(EXPECTED_COUNTS).sort()
    );
    expect(
      lessons.filter(({ body }) => /^draft:\s*true\s*$/m.test(body)).map(({ file }) => file)
    ).toEqual([]);
  });
});
