import { getCollection, type CollectionEntry } from 'astro:content';

type BankQuestion = CollectionEntry<'deepDiveQuestionBanks'>['data']['questions'][number];

export interface ResolvedInterviewQuestion {
  question: BankQuestion;
  lessonId: string;
}

let indexPromise: Promise<Map<string, ResolvedInterviewQuestion>> | undefined;

async function buildQuestionIndex() {
  const index = new Map<string, ResolvedInterviewQuestion>();
  for (const bank of await getCollection('deepDiveQuestionBanks')) {
    for (const question of bank.data.questions) {
      if (index.has(question.id)) {
        throw new Error(
          `Interview question id "${question.id}" is duplicated across question banks.`
        );
      }
      index.set(question.id, { question, lessonId: bank.data.lesson.id });
    }
  }
  return index;
}

/** Resolve from one build-scoped index instead of rescanning every bank for every card. */
export async function getInterviewQuestion(id: string): Promise<ResolvedInterviewQuestion> {
  indexPromise ??= buildQuestionIndex();
  const match = (await indexPromise).get(id);
  if (!match) throw new Error(`Unknown interview question id "${id}".`);
  return match;
}
