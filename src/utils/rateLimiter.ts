/**
 * Janela deslizante: no máximo `maxPerInterval` chamadas a cada `intervalMs`.
 * acquire() resolve quando a chamada pode ser feita.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly maxPerInterval = 10,
    private readonly intervalMs = 1000,
  ) {}

  acquire(): Promise<void> {
    const next = this.queue.then(() => this.waitForSlot());
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async waitForSlot(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.intervalMs);
      if (this.timestamps.length < this.maxPerInterval) {
        this.timestamps.push(now);
        return;
      }
      const wait = this.intervalMs - (now - this.timestamps[0]) + 1;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
