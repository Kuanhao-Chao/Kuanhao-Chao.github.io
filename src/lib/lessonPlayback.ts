/** Pure transport state; the DOM adapter owns timers and never mutates computed frames. */
export class LessonPlayback {
  index = 0;
  playing = false;
  valid = true;
  constructor(public length: number) {
    if (!Number.isInteger(length) || length < 1) throw new Error('A lesson needs at least one frame.');
  }
  load(length: number) {
    if (!Number.isInteger(length) || length < 1) throw new Error('A lesson needs at least one frame.');
    this.length = length; this.index = 0; this.playing = false; this.valid = true;
  }
  invalidate() { this.valid = false; this.playing = false; }
  play() {
    if (!this.valid) return;
    if (this.index === this.length - 1) this.index = 0;
    this.playing = this.length > 1;
  }
  pause() { this.playing = false; }
  next() {
    if (!this.valid) return;
    this.index = Math.min(this.length - 1, this.index + 1);
    if (this.index === this.length - 1) this.pause();
  }
  previous() { this.pause(); if (this.valid) this.index = Math.max(0, this.index - 1); }
  seek(index: number) { this.pause(); if (this.valid) this.index = Math.max(0, Math.min(this.length - 1, Math.round(index))); }
  reset() { this.seek(0); }
}
