import { AsyncLocalStorage } from "node:async_hooks";

type Waiter = { resolve: (release: () => void) => void; reject: (error: Error) => void; signal?: AbortSignal; abort?: () => void };

/** A small FIFO semaphore used only within one QC request/service instance. */
export class FifoSemaphore {
  private active = 0;
  private readonly waiters: Waiter[] = [];

  constructor(readonly capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError("Semaphore capacity must be a positive integer.");
  }

  get activeCount() { return this.active; }
  get waitingCount() { return this.waiters.length; }

  acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    if (this.active < this.capacity && this.waiters.length === 0) {
      this.active++;
      return Promise.resolve(this.createRelease());
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      if (signal) {
        waiter.abort = () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", waiter.abort, { once: true });
      }
      this.waiters.push(waiter);
    });
  }

  async run<T>(operation: () => Promise<T> | T, signal?: AbortSignal): Promise<T> {
    const release = await this.acquire(signal);
    try { return await operation(); }
    finally { release(); }
  }

  private createRelease() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      while (this.waiters.length) {
        const waiter = this.waiters.shift()!;
        if (waiter.signal?.aborted) {
          if (waiter.abort) waiter.signal.removeEventListener("abort", waiter.abort);
          waiter.reject(new DOMException("Aborted", "AbortError"));
          continue;
        }
        if (waiter.abort) waiter.signal?.removeEventListener("abort", waiter.abort);
        this.active++;
        waiter.resolve(this.createRelease());
        break;
      }
    };
  }
}

export class SerialQueue extends FifoSemaphore {
  constructor() { super(1); }
}

const qcDatabaseQueueContext = new AsyncLocalStorage<SerialQueue>();

export function withQcDatabaseQueueContext<T>(queue: SerialQueue, operation: () => Promise<T>): Promise<T> {
  return qcDatabaseQueueContext.run(queue, operation);
}

export function getQcDatabaseQueueContext() {
  return qcDatabaseQueueContext.getStore() ?? null;
}
