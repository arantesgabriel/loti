import { describe, expect, it } from "vitest";
import { FifoSemaphore, SerialQueue } from "@/lib/qc/concurrency";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("QC concurrency primitives", () => {
  it("admits callers in FIFO order and respects capacity", async () => {
    const semaphore = new FifoSemaphore(2), firstRelease = deferred(), order: number[] = [];
    let active = 0, peak = 0;
    const run = async (id: number, wait?: Promise<void>) => semaphore.run(async () => {
      active++; peak = Math.max(peak, active); order.push(id);
      await wait;
      active--;
    });
    const first = run(1, firstRelease.promise), second = run(2);
    await Promise.resolve();
    const third = run(3);
    await Promise.resolve();
    expect(semaphore.activeCount).toBe(2);
    expect(semaphore.waitingCount).toBe(1);
    firstRelease.resolve();
    await Promise.all([first, second, third]);
    expect(order).toEqual([1, 2, 3]);
    expect(peak).toBe(2);
    expect(semaphore.activeCount).toBe(0);
  });

  it("releases serial DB slots when a command fails and cancels queued work", async () => {
    const queue = new SerialQueue(), hold = deferred(), controller = new AbortController();
    const first = queue.run(async () => { await hold.promise; });
    await Promise.resolve();
    const canceled = queue.run(async () => "should not run", controller.signal);
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: "AbortError" });
    hold.resolve();
    await first;
    await expect(queue.run(async () => { throw new Error("synthetic DB failure"); })).rejects.toThrow("synthetic DB failure");
    await expect(queue.run(async () => "released")).resolves.toBe("released");
    expect(queue.activeCount).toBe(0);
  });
});
