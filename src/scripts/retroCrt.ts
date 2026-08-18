/**
 * 1988 NIH Supercomputer CRT Mode Controller.
 */

let isCrtActive = false;
let currentPhosphor: 'amber' | 'green' | 'cyan' = 'amber';
let overlayEl: HTMLElement | null = null;
let hudEl: HTMLElement | null = null;

// Mechanical IBM Model M keyboard switch acoustic synthesizer
function playKeyClickSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(1200 + Math.random() * 400, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.025);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.03);
  } catch {
    // Audio is non-blocking
  }
}

function playCrtPowerSound(isOn: boolean) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (isOn) {
      osc.frequency.setValueAtTime(80, now);
      osc.frequency.exponentialRampToValueAtTime(15734, now + 0.15);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    } else {
      osc.frequency.setValueAtTime(15734, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.2);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch {
    // Audio is non-blocking
  }
}

function createCrtHud(): HTMLElement {
  const hud = document.createElement('div');
  hud.id = 'crt-screen-hud';
  hud.style.position = 'fixed';
  hud.style.bottom = '16px';
  hud.style.left = '50%';
  hud.style.transform = 'translateX(-50%)';
  hud.style.zIndex = '999999';
  hud.style.display = 'flex';
  hud.style.alignItems = 'center';
  hud.style.gap = '12px';
  hud.style.padding = '8px 18px';
  hud.style.background = 'rgba(0,0,0,0.85)';

  const phosphorColor =
    currentPhosphor === 'amber' ? '#ffb000' : currentPhosphor === 'green' ? '#33ff33' : '#38fdf8';
  const glowColor =
    currentPhosphor === 'amber'
      ? 'rgba(255,176,0,0.4)'
      : currentPhosphor === 'green'
        ? 'rgba(51,255,51,0.4)'
        : 'rgba(56,253,248,0.4)';

  hud.style.border = `1px solid ${phosphorColor}`;
  hud.style.borderRadius = '999px';
  hud.style.boxShadow = `0 0 20px ${glowColor}`;
  hud.style.fontFamily = 'monospace';
  hud.style.fontSize = '12px';
  hud.style.color = phosphorColor;

  const label = document.createElement('span');
  label.id = 'crt-hud-label';
  label.style.fontWeight = 'bold';
  label.textContent = `📺 1988 ${currentPhosphor === 'cyan' ? 'DEC VT220' : 'NIH Alpha VAX'} · ${currentPhosphor.toUpperCase()} PHOSPHOR`;
  hud.appendChild(label);

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.style.background = 'transparent';
  toggleBtn.style.color = 'inherit';
  toggleBtn.style.border = '1px solid currentColor';
  toggleBtn.style.borderRadius = '999px';
  toggleBtn.style.padding = '4px 12px';
  toggleBtn.style.fontWeight = 'bold';
  toggleBtn.style.fontSize = '11px';
  toggleBtn.style.cursor = 'pointer';
  toggleBtn.textContent = 'Switch Phosphor (P)';
  toggleBtn.addEventListener('click', togglePhosphor);
  hud.appendChild(toggleBtn);

  const exitBtn = document.createElement('button');
  exitBtn.type = 'button';
  exitBtn.style.background = 'transparent';
  exitBtn.style.color = 'inherit';
  exitBtn.style.border = '1px solid currentColor';
  exitBtn.style.borderRadius = '999px';
  exitBtn.style.padding = '4px 10px';
  exitBtn.style.fontWeight = 'bold';
  exitBtn.style.fontSize = '11px';
  exitBtn.style.cursor = 'pointer';
  exitBtn.textContent = 'Power Off (ESC)';
  exitBtn.addEventListener('click', stopCrtMode);
  hud.appendChild(exitBtn);

  document.body.appendChild(hud);
  return hud;
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if (!isCrtActive) return;

  if (e.key === 'Escape') {
    stopCrtMode();
    return;
  }

  if (e.key === 'p' || e.key === 'P') {
    if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      togglePhosphor();
      return;
    }
  }

  // Play mechanical keyboard click sound
  playKeyClickSound();
}

export function startCrtMode(phosphor: 'amber' | 'green' | 'cyan' = 'amber') {
  if (isCrtActive && currentPhosphor === phosphor) return;

  isCrtActive = true;
  currentPhosphor = phosphor;

  playCrtPowerSound(true);

  if ((window as unknown as { __khcCrt?: { set: (m: string) => void } }).__khcCrt) {
    (window as unknown as { __khcCrt: { set: (m: string) => void } }).__khcCrt.set(phosphor);
  } else {
    document.documentElement.dataset.crtMode = currentPhosphor;
    if (!overlayEl) {
      overlayEl = document.createElement('div');
      overlayEl.id = 'crt-screen-overlay';
      document.body.appendChild(overlayEl);
    }
  }

  if (hudEl) {
    hudEl.remove();
  }
  hudEl = createCrtHud();

  window.addEventListener('keydown', onGlobalKeyDown);
}

export function togglePhosphor() {
  if (!isCrtActive) {
    startCrtMode('amber');
    return;
  }
  const next = currentPhosphor === 'amber' ? 'green' : currentPhosphor === 'green' ? 'cyan' : 'amber';
  startCrtMode(next);
}

export function stopCrtMode() {
  if (!isCrtActive) return;
  isCrtActive = false;

  playCrtPowerSound(false);

  if ((window as unknown as { __khcCrt?: { set: (m: string) => void } }).__khcCrt) {
    (window as unknown as { __khcCrt: { set: (m: string) => void } }).__khcCrt.set('off');
  } else {
    delete document.documentElement.dataset.crtMode;
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  if (hudEl) {
    hudEl.remove();
    hudEl = null;
  }

  window.removeEventListener('keydown', onGlobalKeyDown);
}
