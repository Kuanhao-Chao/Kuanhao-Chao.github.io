/** A bounded request queue. Failures stay failures until the reader explicitly retries. */
export class GenomeResources {
  readonly failures = new Map<string, string>();
  private jobs = new Map<string, Promise<unknown>>();
  private queue: (() => void)[] = [];
  private active = 0;
  private stopped = false;
  private abort = new AbortController();

  constructor(private changed: () => void, private limit = 6) {}

  get pending(): number { return this.jobs.size; }

  request<T>(key: string, read: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    if (this.stopped || this.failures.has(key)) return Promise.resolve(null);
    const existing = this.jobs.get(key);
    if (existing) return existing as Promise<T | null>;
    const job = new Promise<T | null>((resolve) => {
      this.queue.push(() => {
        if (this.stopped) { resolve(null); return; }
        this.active++;
        Promise.resolve().then(() => read(this.abort.signal)).then(resolve, (e: unknown) => {
          if (!this.stopped) this.failures.set(key, e instanceof Error ? e.message : 'Request failed');
          resolve(null);
        }).finally(() => {
          this.active--;
          this.drain();
        });
      });
    });
    this.jobs.set(key, job);
    void job.finally(() => {
      this.jobs.delete(key);
      if (!this.stopped) this.changed();
    });
    this.drain();
    return job;
  }

  private drain(): void {
    while (this.queue.length && (this.stopped || this.active < this.limit)) this.queue.shift()!();
  }

  async idle(): Promise<void> {
    while (this.jobs.size && !this.stopped) await Promise.all(this.jobs.values());
  }

  retry(): void { this.failures.clear(); }

  dispose(): void {
    this.stopped = true;
    this.abort.abort();
    this.drain();
  }
}
