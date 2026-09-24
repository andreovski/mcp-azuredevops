/**
 * Janela deslizante: no máximo `maxPerInterval` chamadas a cada `intervalMs`.
 * acquire() resolve quando a chamada pode ser feita.
 */
export class RateLimiter {
    maxPerInterval;
    intervalMs;
    timestamps = [];
    queue = Promise.resolve();
    constructor(maxPerInterval = 10, intervalMs = 1000) {
        this.maxPerInterval = maxPerInterval;
        this.intervalMs = intervalMs;
    }
    acquire() {
        const next = this.queue.then(() => this.waitForSlot());
        this.queue = next.catch(() => undefined);
        return next;
    }
    async waitForSlot() {
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
//# sourceMappingURL=rateLimiter.js.map