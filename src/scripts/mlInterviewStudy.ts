import {
  RAPID_REVIEW_LESSON_IDS,
  createStudyState,
  normaliseStudyState,
  updateQuestionProgress,
  type ConfidenceLevel,
  type StudyState,
} from '../lib/mlInterview';

const RAPID_REVIEW_LESSON_SET = new Set(RAPID_REVIEW_LESSON_IDS);

const STORAGE_KEY = 'khc.mlInterview.v1';
let state: StudyState = createStudyState();
let bound = false;

const allQuestionNodes = (root: ParentNode = document) => [
  ...root.querySelectorAll<HTMLElement>('[data-interview-question], [data-ml-question-row]'),
];

function readState(root: ParentNode): StudyState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const raw = JSON.parse(stored ?? 'null') as unknown;
    const manifest = root.querySelector<HTMLElement>('[data-ml-question-manifest]');
    const manifestIds = (manifest?.dataset.questionIds ?? '').split(/\s+/).filter(Boolean);
    // The server-rendered manifest covers the full published course, including
    // questions that are not present on this route. Never let localStorage declare
    // its own IDs valid: removed or renamed questions must be pruned on the next load.
    const known = new Set(
      manifestIds.length
        ? manifestIds
        : (allQuestionNodes(root)
            .map((node) => node.dataset.questionId)
            .filter(Boolean) as string[])
    );
    const normalised = normaliseStudyState(raw, known);
    if (stored !== null && JSON.stringify(raw) !== JSON.stringify(normalised)) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalised));
      } catch {
        // A valid in-memory state is still useful when storage has become read-only.
      }
    }
    return normalised;
  } catch {
    return createStudyState();
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in private or hardened browsing modes. The study
    // controls continue to work for this page view; persistence is an enhancement.
  }
}

function syncProgress(root: ParentNode = document) {
  const bookmarks = new Set(state.bookmarks);
  for (const node of allQuestionNodes(root)) {
    const id = node.dataset.questionId;
    if (!id) continue;
    node.classList.toggle('is-bookmarked', bookmarks.has(id));
    node.dataset.confidence = state.confidence[id] ?? '';
    const button = node.querySelector<HTMLButtonElement>('[data-ml-bookmark]');
    if (button) {
      button.ariaPressed = String(bookmarks.has(id));
      button.textContent = bookmarks.has(id) ? 'Bookmarked' : 'Bookmark';
    }
    const select = node.querySelector<HTMLSelectElement>('[data-ml-confidence]');
    if (select) select.value = state.confidence[id] ?? '';
  }
  for (const toggle of document.querySelectorAll<HTMLButtonElement>('[data-ml-practice-toggle]')) {
    toggle.ariaPressed = String(state.practiceMode);
    toggle.textContent = state.practiceMode ? 'Exit practice mode' : 'Practice mode';
  }
}

function applyPracticeMode(root: ParentNode = document) {
  for (const details of root.querySelectorAll<HTMLDetailsElement>('[data-ml-answer]')) {
    details.open = !state.practiceMode;
  }
  revealHashTarget();
}

function revealEnhancements(root: ParentNode = document) {
  for (const enhancement of root.querySelectorAll<HTMLElement>('[data-ml-enhancement]')) {
    enhancement.hidden = false;
  }
}

function selectedValue(selector: string) {
  return document.querySelector<HTMLSelectElement>(selector)?.value ?? 'all';
}

function applyFilters() {
  const query = (document.querySelector<HTMLInputElement>('[data-ml-question-search]')?.value ?? '')
    .trim()
    .toLowerCase();
  const priority = selectedValue('[data-ml-filter-priority]');
  const difficulty = selectedValue('[data-ml-filter-difficulty]');
  const kind = selectedValue('[data-ml-filter-kind]');
  const round = selectedValue('[data-ml-filter-round]');
  const moduleId = selectedValue('[data-ml-filter-module]');
  const role = selectedValue('[data-ml-filter-role]');
  const confidence = selectedValue('[data-ml-filter-confidence]');
  const bookmarksOnly =
    document.querySelector<HTMLInputElement>('[data-ml-filter-bookmarks]')?.checked ?? false;
  const plan = selectedValue('[data-ml-study-plan]');
  const bookmarkSet = new Set(state.bookmarks);
  let visible = 0;

  for (const node of allQuestionNodes(document)) {
    const id = node.dataset.questionId ?? '';
    const haystack = node.dataset.search ?? node.textContent?.toLowerCase() ?? '';
    const roles = (node.dataset.roles ?? '').split(/\s+/);
    const matchesPlan =
      plan === 'all' ||
      (plan === 'rapid' &&
        node.dataset.priority === 'must-know' &&
        RAPID_REVIEW_LESSON_SET.has(node.dataset.lessonId ?? '')) ||
      (plan === 'core' && node.dataset.priority !== 'specialist') ||
      plan === 'complete';
    const matchesConfidence =
      confidence === 'all' ||
      (confidence === 'unrated' ? !state.confidence[id] : state.confidence[id] === confidence);
    const show =
      (!query || query.split(/\s+/).every((token) => haystack.includes(token))) &&
      (priority === 'all' || node.dataset.priority === priority) &&
      (difficulty === 'all' || node.dataset.difficulty === difficulty) &&
      (kind === 'all' || node.dataset.kind === kind) &&
      (round === 'all' || node.dataset.round === round) &&
      (moduleId === 'all' || node.dataset.module === moduleId) &&
      (role === 'all' || roles.includes(role)) &&
      (!bookmarksOnly || bookmarkSet.has(id)) &&
      matchesConfidence &&
      matchesPlan;
    node.hidden = !show;
    if (show) visible += 1;
  }

  for (const count of document.querySelectorAll<HTMLElement>('[data-ml-result-count]')) {
    count.textContent = `${visible} question${visible === 1 ? '' : 's'}`;
  }
  for (const empty of document.querySelectorAll<HTMLElement>('[data-ml-question-empty]'))
    empty.hidden = visible > 0;
}

function revealHashTarget() {
  if (!location.hash.startsWith('#q-')) return;
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (!target) return;
  target.hidden = false;
  target.querySelector<HTMLDetailsElement>('[data-ml-answer]')?.setAttribute('open', '');
}

function updateProgress(id: string, update: Parameters<typeof updateQuestionProgress>[2]) {
  state = updateQuestionProgress(state, id, update);
  persist();
  syncProgress();
  applyFilters();
}

function handleClick(event: MouseEvent) {
  const target = event.target as Element | null;
  if (!target) return;

  const card = target.closest<HTMLElement>('[data-interview-question], [data-ml-question-row]');
  const id = card?.dataset.questionId;

  const summary = target.closest<HTMLElement>('summary');
  const answer = summary?.closest<HTMLDetailsElement>('[data-ml-answer]');
  if (id && answer && event.isTrusted) {
    // Native summary activation changes `open` after the click handler returns.
    // Recording that explicit gesture, instead of listening to every `toggle`, keeps
    // practice mode, expand-all, and direct anchors from marking a whole lesson read.
    window.setTimeout(() => {
      if (answer.isConnected && answer.open) {
        updateProgress(id, { reviewedAt: new Date().toISOString() });
      }
    }, 0);
    return;
  }

  if (id && target.closest('[data-ml-bookmark]')) {
    updateProgress(id, {
      bookmarked: !state.bookmarks.includes(id),
    });
    return;
  }

  if (target.closest('[data-ml-practice-toggle]')) {
    state = { ...state, practiceMode: !state.practiceMode };
    persist();
    applyPracticeMode();
    syncProgress();
    return;
  }
  if (target.closest('[data-ml-expand]')) {
    document
      .querySelectorAll<HTMLDetailsElement>('[data-ml-answer]')
      .forEach((details) => (details.open = true));
    return;
  }
  if (target.closest('[data-ml-collapse]')) {
    document
      .querySelectorAll<HTMLDetailsElement>('[data-ml-answer]')
      .forEach((details) => (details.open = false));
    return;
  }
  if (target.closest('[data-ml-shuffle]')) {
    const choices = allQuestionNodes(document).filter((node) => !node.hidden);
    const choice = choices[Math.floor(Math.random() * choices.length)];
    if (choice) {
      choice.hidden = false;
      choice.querySelector<HTMLDetailsElement>('[data-ml-answer]')?.removeAttribute('open');
      choice.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
      choice.focus({ preventScroll: true });
    }
    return;
  }
  if (target.closest('[data-ml-reset]')) {
    if (!window.confirm('Reset all local interview-study progress on this device?')) return;
    state = createStudyState();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* no-op */
    }
    applyPracticeMode();
    syncProgress();
    applyFilters();
    return;
  }
  if (target.closest('[data-ml-export]')) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), {
      href,
      download: 'ml-interview-progress.json',
    });
    link.click();
    URL.revokeObjectURL(href);
  }
}

function handleChange(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target) return;
  const card = target.closest<HTMLElement>('[data-interview-question], [data-ml-question-row]');
  const id = card?.dataset.questionId;
  if (id && event.type === 'change' && target.matches('[data-ml-confidence]')) {
    updateProgress(id, {
      confidence: (target.value || null) as ConfidenceLevel | null,
      reviewedAt: new Date().toISOString(),
    });
    return;
  }
  if (target.matches('[data-ml-question-search], [data-ml-question-filter]')) applyFilters();
}

export function mountMlInterviewStudy(root: ParentNode = document) {
  // The module's `astro:page-load` listener survives ClientRouter swaps. Leaving
  // the course must not reinterpret an unrelated page as an empty question bank
  // and erase valid local progress.
  if (!root.querySelector('[data-ml-question-manifest]')) return;

  state = readState(root);
  if (!bound) {
    // Capture keeps the controls reliable inside pages whose global interaction
    // layers intentionally stop bubbling clicks before they reach `document`.
    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleChange, true);
    document.addEventListener('change', handleChange, true);
    window.addEventListener('hashchange', revealHashTarget);
    bound = true;
  }
  applyPracticeMode(root);
  syncProgress(root);
  applyFilters();
  revealEnhancements(root);
}
