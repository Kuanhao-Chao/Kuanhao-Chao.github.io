/** Rendering may run at any refresh rate; gameplay advances at a fixed 60 Hz. */
export function createGameClock(stepSeconds = 1 / 60, maxSteps = 8) {
  let accumulator = 0;
  return {
    advance(elapsedSeconds: number, update: (dt: number) => void) {
      if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 0;
      accumulator = Math.min(accumulator + elapsedSeconds, stepSeconds * maxSteps);
      let steps = 0;
      while (accumulator + 1e-10 >= stepSeconds && steps < maxSteps) {
        update(stepSeconds);
        accumulator -= stepSeconds;
        steps++;
      }
      return Math.max(0, accumulator / stepSeconds);
    },
    reset() { accumulator = 0; },
  };
}
