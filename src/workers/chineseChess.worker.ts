import { getAIMove, type GameState, type AIDifficulty } from '../lib/chineseChess';

interface SearchJob { id: number; revision: number; state: GameState; difficulty: AIDifficulty; }
self.addEventListener('message', (event: MessageEvent<SearchJob>) => {
  const { id, revision, state, difficulty } = event.data;
  try {
    const move = getAIMove(state, difficulty, { budgetMs: 1500 });
    self.postMessage({ id, revision, move });
  } catch { self.postMessage({ id, revision, move: null }); }
});
