type Job = {
  key: string; url: string; priority: number; users: number; started: boolean; controller: AbortController;
  promise: Promise<Blob>; resolve: (blob: Blob) => void; reject: (error: unknown) => void;
};

export function createQcPreviewCache(options: {
  fetch?: typeof fetch; now?: () => number; ttl?: number; maxEntries?: number; maxBytes?: number; concurrency?: number;
} = {}) {
  const request = options.fetch ?? fetch, now = options.now ?? Date.now;
  const ttl = options.ttl ?? 300_000, maxEntries = options.maxEntries ?? 200, maxBytes = options.maxBytes ?? 16 * 1024 * 1024, concurrency = options.concurrency ?? 4;
  const cache = new Map<string, { blob: Blob; expiresAt: number }>(), jobs = new Map<string, Job>();
  const queue: Job[] = [];
  let bytes = 0, running = 0, scheduled = false;
  function remove(key: string) { const entry = cache.get(key); if (entry) bytes -= entry.blob.size; cache.delete(key); }
  function prune() {
    for (const [key, entry] of cache) if (entry.expiresAt <= now()) remove(key);
    while (cache.size > maxEntries || bytes > maxBytes) remove(cache.keys().next().value!);
  }
  function drain() {
    scheduled = false;
    queue.sort((a, b) => a.priority - b.priority);
    while (running < concurrency && queue.length) {
      const job = queue.shift()!;
      if (jobs.get(job.key) !== job || !job.users) continue;
      running++; job.started = true;
      void request(job.url, { credentials: "same-origin", cache: "no-cache", referrerPolicy: "no-referrer", signal: job.controller.signal }).then(async response => {
        if (!response.ok) throw Object.assign(new Error("Preview indisponível"), { status: response.status });
        const blob = await response.blob();
        if (jobs.get(job.key) !== job || job.controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        if (blob.size > 128 * 1024 || blob.type !== "image/webp") throw new Error("Preview inválido");
        remove(job.key); cache.set(job.key, { blob, expiresAt: now() + ttl }); bytes += blob.size; prune();
        jobs.delete(job.key); job.resolve(blob);
      }).catch(error => {
        if (jobs.get(job.key) === job) jobs.delete(job.key);
        job.reject(error);
      }).finally(() => {
        if (jobs.get(job.key) === job) jobs.delete(job.key);
        running--; drain();
      });
    }
  }
  function cancel(job: Job) {
    jobs.delete(job.key); job.controller.abort(); job.reject(new DOMException("Aborted", "AbortError"));
  }
  return {
    acquire(key: string, url: string, priority = 1) {
      prune();
      const cached = cache.get(key);
      if (cached) { cache.delete(key); cache.set(key, cached); return { promise: Promise.resolve(cached.blob), release() {} }; }
      let job = jobs.get(key);
      if (!job) {
        let resolve!: Job["resolve"], reject!: Job["reject"];
        const promise = new Promise<Blob>((done, fail) => { resolve = done; reject = fail; });
        job = { key, url, priority, promise, resolve, reject, users: 0, started: false, controller: new AbortController() };
        jobs.set(key, job); queue.push(job);
      }
      job.users++; job.priority = Math.min(job.priority, priority);
      if (!scheduled) { scheduled = true; queueMicrotask(drain); }
      const owned = job;
      let released = false;
      return { promise: owned.promise, release() {
        if (released) return;
        released = true; owned.users--;
        if (!owned.users && jobs.get(key) === owned) cancel(owned);
      } };
    },
    invalidate(matches: (key: string) => boolean = () => true) {
      for (const key of cache.keys()) if (matches(key)) remove(key);
      for (const [key, job] of jobs) if (matches(key)) cancel(job);
      // Drop canceled queued entries immediately; running work still owns a slot.
      for (let index = queue.length - 1; index >= 0; index--) if (jobs.get(queue[index].key) !== queue[index]) queue.splice(index, 1);
    },
    stats: () => ({ entries: cache.size, bytes, running, pending: jobs.size, queued: queue.length }),
  };
}

export const qcPreviewCache = createQcPreviewCache();
