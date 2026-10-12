// Wall-clock time during which at least one tracked call is running. Overlapping calls count
// once, so parallel requests report how long they held up the search, not their summed time.
export class BusyTimer {
  private active = 0;
  private since = 0;
  ms = 0;

  async time<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active++ === 0) this.since = Date.now();
    try {
      return await fn();
    } finally {
      if (--this.active === 0) this.ms += Date.now() - this.since;
    }
  }

  reset() {
    this.ms = 0;
    this.since = Date.now();
  }
}
