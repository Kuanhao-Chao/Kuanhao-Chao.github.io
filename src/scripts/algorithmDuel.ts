/**
 * Algorithm Duel & Benchmark Controller
 * Manages live execution stepping, synchronized pseudocode highlighting, and state updates.
 */

import { runAlgorithmDuel, type DuelResult, DUEL_PRESETS } from '../lib/algorithmDuel';

export interface DuelController {
  destroy: () => void;
}

export function initAlgorithmDuel(root: ParentNode = document): DuelController | null {
  const container = root.querySelector<HTMLElement>('[data-algorithm-duel]');
  if (!container) return null;
  if (container.dataset.duelReady === 'true') return null;
  container.dataset.duelReady = 'true';

  // DOM Elements
  const seq1Input = container.querySelector<HTMLInputElement>('[data-duel-seq1]');
  const seq2Input = container.querySelector<HTMLInputElement>('[data-duel-seq2]');
  const presetBtns = container.querySelectorAll<HTMLButtonElement>('[data-duel-preset]');

  const playBtn = container.querySelector<HTMLButtonElement>('[data-duel-play]');
  const stepBtn = container.querySelector<HTMLButtonElement>('[data-duel-step]');
  const resetBtn = container.querySelector<HTMLButtonElement>('[data-duel-reset]');
  const speedSelect = container.querySelector<HTMLSelectElement>('[data-duel-speed]');

  // NW Telemetry Elements
  const nwCellsVal = container.querySelector<HTMLElement>('[data-nw-cells]');
  const nwProgressVal = container.querySelector<HTMLElement>('[data-nw-progress]');
  const nwScoreVal = container.querySelector<HTMLElement>('[data-nw-score]');
  const nwProgressFill = container.querySelector<HTMLElement>('[data-nw-fill]');
  const nwPillI = container.querySelector<HTMLElement>('[data-nw-pill-i]');
  const nwPillJ = container.querySelector<HTMLElement>('[data-nw-pill-j]');
  const nwPillFormula = container.querySelector<HTMLElement>('[data-nw-pill-formula]');
  const nwCodeLines = container.querySelectorAll<HTMLElement>('[data-nw-code-line]');

  // WFA Telemetry Elements
  const wfaCellsVal = container.querySelector<HTMLElement>('[data-wfa-cells]');
  const wfaProgressVal = container.querySelector<HTMLElement>('[data-wfa-progress]');
  const wfaScoreVal = container.querySelector<HTMLElement>('[data-wfa-score]');
  const wfaProgressFill = container.querySelector<HTMLElement>('[data-wfa-fill]');
  const wfaPillScore = container.querySelector<HTMLElement>('[data-wfa-pill-s]');
  const wfaPillDiag = container.querySelector<HTMLElement>('[data-wfa-pill-k]');
  const wfaPillOffset = container.querySelector<HTMLElement>('[data-wfa-pill-offset]');
  const wfaPillLcp = container.querySelector<HTMLElement>('[data-wfa-pill-lcp]');
  const wfaPillFormula = container.querySelector<HTMLElement>('[data-wfa-pill-formula]');
  const wfaCodeLines = container.querySelectorAll<HTMLElement>('[data-wfa-code-line]');

  // Duel Banner
  const speedupVal = container.querySelector<HTMLElement>('[data-duel-speedup]');
  const winnerTitle = container.querySelector<HTMLElement>('[data-duel-winner-title]');
  const winnerDesc = container.querySelector<HTMLElement>('[data-duel-winner-desc]');

  let result: DuelResult = runAlgorithmDuel(
    seq1Input?.value || 'ACGTAGCTAGTCGATCGAT',
    seq2Input?.value || 'ACGTAGCTAGTCGATCGAT'
  );

  let currentStepIdx = 0;
  let isPlaying = false;
  let timerId: number | null = null;
  let speedMs = parseInt(speedSelect?.value || '100', 10);

  function compute() {
    const s1 = (seq1Input?.value || 'ACGTAGCTAGTCGATCGAT').trim().toUpperCase();
    const s2 = (seq2Input?.value || 'ACGTAGCTAGTCGATCGAT').trim().toUpperCase();

    result = runAlgorithmDuel(s1, s2);
    currentStepIdx = 0;
    pause();
    renderCurrentStep();
  }

  function renderCurrentStep() {
    if (!result.steps.length) return;

    const step = result.steps[Math.min(currentStepIdx, result.steps.length - 1)];
    const nwFraction = (step.nw.cellsEvaluated / step.nw.totalCells) * 100;
    const wfaFraction = step.wfa.isDone ? 100 : Math.min(95, ((step.wfa.score + 1) / (result.wfaResult.totalSteps + 1)) * 100);

    // Update NW Telemetry
    if (nwCellsVal) nwCellsVal.textContent = `${step.nw.cellsEvaluated} / ${step.nw.totalCells}`;
    if (nwProgressVal) nwProgressVal.textContent = `${nwFraction.toFixed(0)}%`;
    if (nwScoreVal) nwScoreVal.textContent = String(step.nw.score);
    if (nwProgressFill) nwProgressFill.style.width = `${nwFraction}%`;
    if (nwPillI) nwPillI.textContent = String(step.nw.i);
    if (nwPillJ) nwPillJ.textContent = String(step.nw.j);
    if (nwPillFormula) nwPillFormula.textContent = step.nw.activeFormula;

    // Highlight NW Pseudocode
    nwCodeLines.forEach((line) => {
      const lineNum = parseInt(line.dataset.nwCodeLine || '0', 10);
      if (lineNum === step.nw.pseudocodeLine) {
        line.classList.add('active');
      } else {
        line.classList.remove('active');
      }
    });

    // Update WFA Telemetry
    if (wfaCellsVal) wfaCellsVal.textContent = `${step.wfa.cellsEvaluated} cells`;
    if (wfaProgressVal) wfaProgressVal.textContent = `${wfaFraction.toFixed(0)}%`;
    if (wfaScoreVal) wfaScoreVal.textContent = String(step.wfa.score);
    if (wfaProgressFill) wfaProgressFill.style.width = `${wfaFraction}%`;
    if (wfaPillScore) wfaPillScore.textContent = String(step.wfa.score);
    if (wfaPillDiag) wfaPillDiag.textContent = String(step.wfa.diagonal);
    if (wfaPillOffset) wfaPillOffset.textContent = String(step.wfa.offset);
    if (wfaPillLcp) wfaPillLcp.textContent = String(step.wfa.lcpExtended);
    if (wfaPillFormula) wfaPillFormula.textContent = step.wfa.activeFormula;

    // Highlight WFA Pseudocode
    wfaCodeLines.forEach((line) => {
      const lineNum = parseInt(line.dataset.wfaCodeLine || '0', 10);
      if (lineNum === step.wfa.pseudocodeLine) {
        line.classList.add('active');
      } else {
        line.classList.remove('active');
      }
    });

    // Update Head-to-Head Banner
    if (speedupVal) speedupVal.textContent = `${result.speedupRatio}x`;
    if (winnerTitle) {
      winnerTitle.textContent =
        result.winner === 'wfa'
          ? `🏆 Wavefront Alignment (WFA) Wins! (${result.speedupRatio}x Faster)`
          : '⚡ Benchmark Race Complete';
    }
    if (winnerDesc) winnerDesc.textContent = result.winnerExplanation;

    if (currentStepIdx >= result.steps.length - 1) {
      pause();
    }
  }

  function tick() {
    if (!isPlaying) return;
    if (currentStepIdx < result.steps.length - 1) {
      currentStepIdx++;
      renderCurrentStep();
      timerId = window.setTimeout(tick, speedMs);
    } else {
      pause();
    }
  }

  function play() {
    if (isPlaying) return;
    if (currentStepIdx >= result.steps.length - 1) {
      currentStepIdx = 0;
    }
    isPlaying = true;
    if (playBtn) playBtn.textContent = '⏸ Pause';
    tick();
  }

  function pause() {
    isPlaying = false;
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (playBtn) playBtn.textContent = '▶ Run Race';
  }

  function stepForward() {
    pause();
    if (currentStepIdx < result.steps.length - 1) {
      currentStepIdx++;
      renderCurrentStep();
    }
  }

  function reset() {
    pause();
    currentStepIdx = 0;
    renderCurrentStep();
  }

  // Event Listeners
  const onSeq1Input = () => compute();
  const onSeq2Input = () => compute();

  seq1Input?.addEventListener('input', onSeq1Input);
  seq2Input?.addEventListener('input', onSeq2Input);

  const onPlayClick = () => {
    if (isPlaying) pause();
    else play();
  };
  playBtn?.addEventListener('click', onPlayClick);

  stepBtn?.addEventListener('click', stepForward);
  resetBtn?.addEventListener('click', reset);

  const onSpeedChange = () => {
    speedMs = parseInt(speedSelect?.value || '100', 10);
  };
  speedSelect?.addEventListener('change', onSpeedChange);

  const onPresetClick = (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-duel-preset]');
    if (!btn) return;
    const presetId = btn.dataset.duelPreset;
    const preset = DUEL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    presetBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    if (seq1Input) seq1Input.value = preset.seq1;
    if (seq2Input) seq2Input.value = preset.seq2;

    compute();
  };
  container.addEventListener('click', onPresetClick);

  function handleKeydown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (isPlaying) pause();
      else play();
    } else if (e.code === 'ArrowRight' || e.key === 'l' || e.key === 'n') {
      e.preventDefault();
      pause();
      stepForward();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      reset();
    }
  }

  window.addEventListener('keydown', handleKeydown);

  // Initial render
  compute();

  return {
    destroy: () => {
      pause();
      window.removeEventListener('keydown', handleKeydown);
      seq1Input?.removeEventListener('input', onSeq1Input);
      seq2Input?.removeEventListener('input', onSeq2Input);
      playBtn?.removeEventListener('click', onPlayClick);
      stepBtn?.removeEventListener('click', stepForward);
      resetBtn?.removeEventListener('click', reset);
      speedSelect?.removeEventListener('change', onSpeedChange);
      container.removeEventListener('click', onPresetClick);
    },
  };
}
