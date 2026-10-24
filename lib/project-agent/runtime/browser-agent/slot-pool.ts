/** Fair, abortable admission control for the shared Playwright process. */
export class BrowserSlotPool {
  private occupied = 0;
  private queue: Array<{ grant: () => void; reject: (error: Error) => void }> = [];
  constructor(readonly capacity: number, readonly waitMs = 30_000) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("Invalid slot capacity");
  }
  get active() { return this.occupied; }
  get waiting() { return this.queue.length; }
  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new Error("Browser task was stopped"));
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timer) clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      };
      const cancel = (message: string) => {
        if (settled) return;
        settled = true;
        this.queue = this.queue.filter(item => item !== waiter);
        cleanup();
        reject(new Error(message));
      };
      const abort = () => cancel("Browser task was stopped");
      const grant = () => {
        if (settled) return;
        if (signal?.aborted) { cancel("Browser task was stopped"); this.transfer(); return; }
        settled = true;
        cleanup();
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.transfer();
        });
      };
      const waiter = { grant, reject: (error: Error) => cancel(error.message) };
      signal?.addEventListener("abort", abort, { once: true });
      if (this.occupied < this.capacity && !this.queue.length) {
        this.occupied++;
        grant();
      } else {
        this.queue.push(waiter);
        timer = setTimeout(() => cancel("Browser capacity wait timed out"), this.waitMs);
        timer.unref?.();
      }
    });
  }
  private transfer() {
    const next = this.queue.shift();
    if (next) next.grant();
    else this.occupied = Math.max(0, this.occupied - 1);
  }
}
