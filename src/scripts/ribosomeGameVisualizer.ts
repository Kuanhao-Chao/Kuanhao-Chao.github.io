/**
 * Ribosome Translation Rush Arcade Visualizer & Modal.
 */
import {
  createRibosomeGame,
  stepGame,
  type RibosomeGameState,
} from '../lib/ribosomeGame';

let modalEl: HTMLElement | null = null;
let gameState: RibosomeGameState | null = null;
let animTimer: number | null = null;

function playPeptideChime(combo: number) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const baseFreq = 440;
    const pitchMultiplier = Math.pow(2, ((combo % 8) * 2) / 12);
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * pitchMultiplier, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * pitchMultiplier * 1.5, now + 0.12);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  } catch {}
}

function playSpliceChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.28);
  } catch {}
}

function renderGameUi(modal: HTMLElement, state: RibosomeGameState) {
  const content = modal.querySelector<HTMLElement>('#ribosome-game-content');
  if (!content) return;

  const currentItem = state.stream[state.currentIndex];

  // Header HUD
  const scoreVal = content.querySelector('#rib-score');
  if (scoreVal) scoreVal.textContent = `${state.score}`;

  const highVal = content.querySelector('#rib-high');
  if (highVal) highVal.textContent = `${state.highScore}`;

  const energyBar = content.querySelector<HTMLElement>('#rib-energy-fill');
  if (energyBar) {
    energyBar.style.width = `${Math.max(0, state.energy)}%`;
    energyBar.style.background = state.energy > 40 ? 'var(--color-accent, #2e6e5e)' : '#e11d48';
  }

  const comboBadge = content.querySelector('#rib-combo');
  if (comboBadge) {
    comboBadge.textContent = state.combo > 1 ? `${state.combo}x COMBO` : '';
  }

  const statusMsg = content.querySelector('#rib-message');
  if (statusMsg) statusMsg.textContent = state.message;

  // Growing Peptide Chain
  const peptideEl = content.querySelector('#rib-peptide-chain');
  if (peptideEl) {
    peptideEl.textContent = state.chain.length > 0 ? `N-term · ${state.chain.join(' — ')} · C-term` : 'N-term · [Translating...]';
  }

  // mRNA Transcript Stream Strip
  const streamEl = content.querySelector<HTMLElement>('#rib-stream-track');
  if (streamEl) {
    const visibleWindow = state.stream.slice(state.currentIndex, state.currentIndex + 8);
    streamEl.replaceChildren();

    visibleWindow.forEach((item, idx) => {
      const codonBox = document.createElement('div');
      codonBox.style.display = 'flex';
      codonBox.style.flexDirection = 'column';
      codonBox.style.alignItems = 'center';
      codonBox.style.justifyContent = 'center';
      codonBox.style.padding = '8px 12px';
      codonBox.style.borderRadius = '6px';
      codonBox.style.fontFamily = 'monospace';
      codonBox.style.fontSize = idx === 0 ? '16px' : '13px';
      codonBox.style.fontWeight = 'bold';
      codonBox.style.border = idx === 0 ? '2px solid var(--color-accent, #2e6e5e)' : '1px solid var(--color-rule, rgba(0,0,0,0.15))';
      codonBox.style.background = idx === 0 ? 'color-mix(in srgb, var(--color-accent, #2e6e5e) 15%, var(--color-surface, #fff))' : 'var(--color-bg, #fafaf8)';
      codonBox.style.transform = idx === 0 ? 'scale(1.08)' : 'scale(1)';
      codonBox.style.transition = 'all 0.15s ease';

      if (item.isIntron) {
        codonBox.style.background = '#fef3c7';
        codonBox.style.borderColor = '#d97706';
        codonBox.style.color = '#b45309';
        const label = document.createElement('span');
        label.textContent = '✂️ INTRON';
        const sub = document.createElement('span');
        sub.style.fontSize = '9px';
        sub.textContent = 'SPACE to splice';
        codonBox.appendChild(label);
        codonBox.appendChild(sub);
      } else {
        const codonText = document.createElement('span');
        codonText.textContent = item.codon;
        const aaText = document.createElement('span');
        aaText.style.fontSize = '10px';
        aaText.style.color = 'var(--color-muted, #707070)';
        aaText.textContent = `(${item.aminoAcid})`;
        codonBox.appendChild(codonText);
        codonBox.appendChild(aaText);
      }

      streamEl.appendChild(codonBox);
    });
  }

  // Active Choices / Controls
  const choicesTrack = content.querySelector<HTMLElement>('#rib-choices-track');
  if (choicesTrack) {
    choicesTrack.replaceChildren();

    if (state.status === 'ready') {
      const startBtn = document.createElement('button');
      startBtn.type = 'button';
      startBtn.style.padding = '10px 24px';
      startBtn.style.fontSize = '15px';
      startBtn.style.fontWeight = 'bold';
      startBtn.style.background = 'var(--color-accent, #2e6e5e)';
      startBtn.style.color = '#ffffff';
      startBtn.style.border = 'none';
      startBtn.style.borderRadius = '999px';
      startBtn.style.cursor = 'pointer';
      startBtn.textContent = '🚀 Start Translation (Space or Enter)';
      startBtn.addEventListener('click', () => {
        if (gameState) {
          gameState = stepGame(gameState, { type: 'START' });
          renderGameUi(modal, gameState);
        }
      });
      choicesTrack.appendChild(startBtn);
    } else if (state.status === 'gameover' || state.status === 'victory') {
      const restartBtn = document.createElement('button');
      restartBtn.type = 'button';
      restartBtn.style.padding = '8px 20px';
      restartBtn.style.fontSize = '14px';
      restartBtn.style.fontWeight = 'bold';
      restartBtn.style.background = 'var(--color-accent, #2e6e5e)';
      restartBtn.style.color = '#ffffff';
      restartBtn.style.border = 'none';
      restartBtn.style.borderRadius = '999px';
      restartBtn.style.cursor = 'pointer';
      restartBtn.textContent = '🔄 Play Again (Space)';
      restartBtn.addEventListener('click', () => {
        const hs = parseInt(localStorage.getItem('khc-ribosome-highscore') || '0', 10);
        gameState = createRibosomeGame(hs);
        gameState = stepGame(gameState, { type: 'START' });
        renderGameUi(modal, gameState);
      });
      choicesTrack.appendChild(restartBtn);
    } else if (currentItem?.isIntron) {
      const spliceBtn = document.createElement('button');
      spliceBtn.type = 'button';
      spliceBtn.style.padding = '10px 24px';
      spliceBtn.style.fontSize = '15px';
      spliceBtn.style.fontWeight = 'bold';
      spliceBtn.style.background = '#d97706';
      spliceBtn.style.color = '#ffffff';
      spliceBtn.style.border = 'none';
      spliceBtn.style.borderRadius = '999px';
      spliceBtn.style.cursor = 'pointer';
      spliceBtn.textContent = '✂️ SPLICE INTRON (Hit Space)';
      spliceBtn.addEventListener('click', () => {
        if (gameState) {
          gameState = stepGame(gameState, { type: 'SPLICE' });
          playSpliceChime();
          renderGameUi(modal, gameState);
        }
      });
      choicesTrack.appendChild(spliceBtn);
    } else {
      state.activeAnticodonChoices.forEach((anti, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.display = 'flex';
        btn.style.flexDirection = 'column';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.padding = '10px 16px';
        btn.style.background = 'var(--color-surface, #fff)';
        btn.style.border = '1.5px solid var(--color-rule, rgba(0,0,0,0.15))';
        btn.style.borderRadius = '8px';
        btn.style.cursor = 'pointer';
        btn.style.fontFamily = 'monospace';
        btn.style.fontWeight = 'bold';
        btn.style.fontSize = '15px';
        btn.style.color = 'var(--color-ink, #202020)';
        btn.style.transition = 'all 0.1s ease';

        const hotkey = document.createElement('span');
        hotkey.style.fontSize = '9px';
        hotkey.style.color = 'var(--color-muted, #707070)';
        hotkey.textContent = `[Key ${idx + 1}]`;

        const label = document.createElement('span');
        label.textContent = `tRNA: ${anti}`;

        btn.appendChild(hotkey);
        btn.appendChild(label);

        btn.addEventListener('click', () => {
          if (gameState) {
            const beforeCombo = gameState.combo;
            gameState = stepGame(gameState, { type: 'MATCH_TRNA', anticodon: anti });
            if (gameState.combo > beforeCombo) {
              playPeptideChime(gameState.combo);
            }
            // Update highscore
            if (gameState.score > gameState.highScore) {
              gameState.highScore = gameState.score;
              try {
                localStorage.setItem('khc-ribosome-highscore', String(gameState.highScore));
              } catch {}
            }
            renderGameUi(modal, gameState);
          }
        });

        choicesTrack.appendChild(btn);
      });
    }
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (!modalEl || !gameState) return;

  if (e.key === 'Escape') {
    closeRibosomeGame();
    return;
  }

  if (gameState.status === 'ready') {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      gameState = stepGame(gameState, { type: 'START' });
      renderGameUi(modalEl, gameState);
      return;
    }
  }

  if (gameState.status === 'gameover' || gameState.status === 'victory') {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      const hs = parseInt(localStorage.getItem('khc-ribosome-highscore') || '0', 10);
      gameState = createRibosomeGame(hs);
      gameState = stepGame(gameState, { type: 'START' });
      renderGameUi(modalEl, gameState);
      return;
    }
  }

  if (gameState.status === 'playing') {
    const currentItem = gameState.stream[gameState.currentIndex];

    if (e.key === ' ') {
      e.preventDefault();
      gameState = stepGame(gameState, { type: 'SPLICE' });
      if (currentItem?.isIntron) {
        playSpliceChime();
      }
      renderGameUi(modalEl, gameState);
      return;
    }

    const keyIndex = parseInt(e.key, 10) - 1;
    if (keyIndex >= 0 && keyIndex < gameState.activeAnticodonChoices.length) {
      e.preventDefault();
      const anti = gameState.activeAnticodonChoices[keyIndex];
      const beforeCombo = gameState.combo;
      gameState = stepGame(gameState, { type: 'MATCH_TRNA', anticodon: anti });
      if (gameState.combo > beforeCombo) {
        playPeptideChime(gameState.combo);
      }
      if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        try {
          localStorage.setItem('khc-ribosome-highscore', String(gameState.highScore));
        } catch {}
      }
      renderGameUi(modalEl, gameState);
    }
  }
}

export function openRibosomeGame() {
  if (modalEl) return;

  const hs = parseInt(localStorage.getItem('khc-ribosome-highscore') || '0', 10);
  gameState = createRibosomeGame(hs);

  modalEl = document.createElement('div');
  modalEl.id = 'ribosome-game-modal';
  modalEl.style.position = 'fixed';
  modalEl.style.inset = '0';
  modalEl.style.zIndex = '999999';
  modalEl.style.display = 'flex';
  modalEl.style.alignItems = 'center';
  modalEl.style.justifyContent = 'center';
  modalEl.style.background = 'rgba(0, 0, 0, 0.75)';
  modalEl.style.backdropFilter = 'blur(8px)';
  modalEl.style.padding = '20px';

  const content = document.createElement('div');
  content.id = 'ribosome-game-content';
  content.style.background = 'var(--color-surface, #ffffff)';
  content.style.border = '1px solid var(--color-rule, rgba(0,0,0,0.15))';
  content.style.borderRadius = '16px';
  content.style.width = '100%';
  content.style.maxWidth = '680px';
  content.style.padding = '24px';
  content.style.boxShadow = '0 20px 50px rgba(0,0,0,0.3)';
  content.style.display = 'flex';
  content.style.flexDirection = 'column';
  content.style.gap = '16px';
  content.style.fontFamily = 'system-ui, -apple-system, sans-serif';
  content.style.color = 'var(--color-ink, #202020)';

  // Header Row
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.borderBottom = '1px solid var(--color-rule, rgba(0,0,0,0.1))';
  header.style.paddingBottom = '12px';

  const titleWrap = document.createElement('div');
  titleWrap.style.display = 'flex';
  titleWrap.style.alignItems = 'center';
  titleWrap.style.gap = '8px';

  const icon = document.createElement('span');
  icon.style.fontSize = '20px';
  icon.textContent = '🧬';

  const title = document.createElement('span');
  title.style.fontWeight = 'bold';
  title.style.fontSize = '17px';
  title.textContent = 'Ribosome Translation Rush';

  titleWrap.appendChild(icon);
  titleWrap.appendChild(title);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'rib-close-btn';
  closeBtn.type = 'button';
  closeBtn.style.background = 'transparent';
  closeBtn.style.border = 'none';
  closeBtn.style.fontSize = '16px';
  closeBtn.style.cursor = 'pointer';
  closeBtn.style.color = 'var(--color-muted, #707070)';
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', closeRibosomeGame);

  header.appendChild(titleWrap);
  header.appendChild(closeBtn);
  content.appendChild(header);

  // Scoreboard Row
  const scoresRow = document.createElement('div');
  scoresRow.style.display = 'flex';
  scoresRow.style.justifyContent = 'space-between';
  scoresRow.style.fontSize = '13px';
  scoresRow.style.fontWeight = '600';

  const scoreBox = document.createElement('div');
  scoreBox.textContent = 'SCORE: ';
  const scoreVal = document.createElement('span');
  scoreVal.id = 'rib-score';
  scoreVal.style.color = 'var(--color-accent, #2e6e5e)';
  scoreVal.style.fontFamily = 'monospace';
  scoreVal.style.fontSize = '15px';
  scoreVal.textContent = '0';
  scoreBox.appendChild(scoreVal);

  const comboVal = document.createElement('div');
  comboVal.id = 'rib-combo';
  comboVal.style.color = '#d97706';
  comboVal.style.fontWeight = 'bold';

  const highBox = document.createElement('div');
  highBox.textContent = 'HIGH SCORE: ';
  const highVal = document.createElement('span');
  highVal.id = 'rib-high';
  highVal.style.fontFamily = 'monospace';
  highVal.style.fontSize = '15px';
  highVal.textContent = '0';
  highBox.appendChild(highVal);

  scoresRow.appendChild(scoreBox);
  scoresRow.appendChild(comboVal);
  scoresRow.appendChild(highBox);
  content.appendChild(scoresRow);

  // Energy Meter
  const energyWrap = document.createElement('div');
  energyWrap.style.display = 'flex';
  energyWrap.style.flexDirection = 'column';
  energyWrap.style.gap = '4px';

  const energyLabelWrap = document.createElement('div');
  energyLabelWrap.style.display = 'flex';
  energyLabelWrap.style.justifyContent = 'space-between';
  energyLabelWrap.style.fontSize = '11px';
  energyLabelWrap.style.color = 'var(--color-muted, #707070)';
  energyLabelWrap.style.textTransform = 'uppercase';

  const energyLabel = document.createElement('span');
  energyLabel.textContent = 'Ribosome ATP / GTP Energy';
  energyLabelWrap.appendChild(energyLabel);
  energyWrap.appendChild(energyLabelWrap);

  const energyTrack = document.createElement('div');
  energyTrack.style.height = '6px';
  energyTrack.style.background = 'rgba(0,0,0,0.1)';
  energyTrack.style.borderRadius = '999px';
  energyTrack.style.overflow = 'hidden';

  const energyFill = document.createElement('div');
  energyFill.id = 'rib-energy-fill';
  energyFill.style.height = '100%';
  energyFill.style.width = '100%';
  energyFill.style.background = 'var(--color-accent, #2e6e5e)';
  energyFill.style.transition = 'width 0.2s ease';
  energyTrack.appendChild(energyFill);
  energyWrap.appendChild(energyTrack);
  content.appendChild(energyWrap);

  // Polypeptide Chain
  const peptideBox = document.createElement('div');
  peptideBox.style.background = 'var(--color-bg, #fafaf8)';
  peptideBox.style.border = '1px solid var(--color-rule, rgba(0,0,0,0.1))';
  peptideBox.style.borderRadius = '8px';
  peptideBox.style.padding = '12px';

  const peptideTitle = document.createElement('div');
  peptideTitle.style.fontSize = '11px';
  peptideTitle.style.color = 'var(--color-muted, #707070)';
  peptideTitle.style.marginBottom = '6px';
  peptideTitle.style.textTransform = 'uppercase';
  peptideTitle.style.fontWeight = '600';
  peptideTitle.textContent = 'Growing Polypeptide Chain';
  peptideBox.appendChild(peptideTitle);

  const peptideChain = document.createElement('div');
  peptideChain.id = 'rib-peptide-chain';
  peptideChain.style.fontFamily = 'monospace';
  peptideChain.style.fontSize = '13px';
  peptideChain.style.fontWeight = 'bold';
  peptideChain.style.color = 'var(--color-accent, #2e6e5e)';
  peptideChain.style.overflowX = 'auto';
  peptideChain.style.whiteSpace = 'nowrap';
  peptideChain.style.paddingBottom = '2px';
  peptideBox.appendChild(peptideChain);
  content.appendChild(peptideBox);

  // mRNA Stream Section
  const streamSection = document.createElement('div');
  streamSection.style.position = 'relative';
  streamSection.style.padding = '10px 0';

  const streamHeader = document.createElement('div');
  streamHeader.style.fontSize = '11px';
  streamHeader.style.color = 'var(--color-muted, #707070)';
  streamHeader.style.marginBottom = '8px';
  streamHeader.style.textTransform = 'uppercase';
  streamHeader.style.fontWeight = '600';
  streamHeader.textContent = "5' ── mRNA Transcript Stream ── 3'";
  streamSection.appendChild(streamHeader);

  const streamTrack = document.createElement('div');
  streamTrack.id = 'rib-stream-track';
  streamTrack.style.display = 'flex';
  streamTrack.style.gap = '8px';
  streamTrack.style.overflow = 'hidden';
  streamSection.appendChild(streamTrack);
  content.appendChild(streamSection);

  // Message area
  const messageBox = document.createElement('div');
  messageBox.id = 'rib-message';
  messageBox.style.fontSize = '13px';
  messageBox.style.textAlign = 'center';
  messageBox.style.minHeight = '20px';
  messageBox.style.fontWeight = '600';
  messageBox.style.color = 'var(--color-ink, #202020)';
  content.appendChild(messageBox);

  // Choices Track
  const choicesTrack = document.createElement('div');
  choicesTrack.id = 'rib-choices-track';
  choicesTrack.style.display = 'grid';
  choicesTrack.style.gridTemplateColumns = 'repeat(4, 1fr)';
  choicesTrack.style.gap = '8px';
  choicesTrack.style.minHeight = '48px';
  choicesTrack.style.alignItems = 'center';
  choicesTrack.style.justifyContent = 'center';
  content.appendChild(choicesTrack);

  modalEl.appendChild(content);
  document.body.appendChild(modalEl);

  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) closeRibosomeGame();
  });

  window.addEventListener('keydown', onKeyDown);

  renderGameUi(modalEl, gameState);

  animTimer = window.setInterval(() => {
    if (gameState && gameState.status === 'playing') {
      gameState = stepGame(gameState, { type: 'TICK' });
      if (modalEl) renderGameUi(modalEl, gameState);
    }
  }, 100);
}

export function closeRibosomeGame() {
  if (!modalEl) return;

  if (animTimer !== null) {
    clearInterval(animTimer);
    animTimer = null;
  }

  modalEl.remove();
  modalEl = null;
  gameState = null;

  window.removeEventListener('keydown', onKeyDown);
}
