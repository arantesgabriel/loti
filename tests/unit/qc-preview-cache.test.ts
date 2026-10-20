import { afterEach, describe, expect, it, vi } from "vitest";
import { createQcPreviewCache } from "@/components/qc/qc-preview-cache";
import { matchesQcEtag, qcPreviewEtag, qcPreviewVersion } from "@/lib/qc/preview-http";

const blob = (size = 4) => new Blob(["x".repeat(size)], { type: "image/webp" });
const reply = (size = 4) => new Response(blob(size));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
afterEach(() => vi.unstubAllGlobals());

describe("private preview memory cache", () => {
  it("deduplicates consumers and keeps completed bytes through five remounts", async () => {
    const fetcher = vi.fn(async () => reply()), cache = createQcPreviewCache({ fetch: fetcher });
    const first = cache.acquire("a", "/a"), second = cache.acquire("a", "/a");
    first.release();
    expect(await second.promise).toEqual(blob());
    second.release();
    for (let index = 0; index < 5; index++) { const next = cache.acquire("a", "/a"); await next.promise; next.release(); }
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]).toMatchObject(["/a", { cache: "no-cache", credentials: "same-origin" }]);
  });
  it("expires absolutely despite frequent access", async () => {
    let now = 0;
    const fetcher = vi.fn(async () => reply()), cache = createQcPreviewCache({ fetch: fetcher, now: () => now, ttl: 100 });
    await cache.acquire("a", "/a").promise;
    now = 90; await cache.acquire("a", "/a").promise;
    now = 101; await cache.acquire("a", "/a").promise;
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("evicts least recently used entries under both byte and entry budgets", async () => {
    const fetcher = vi.fn(async () => reply()), cache = createQcPreviewCache({ fetch: fetcher, maxEntries: 2, maxBytes: 8 });
    for (const key of ["a", "b", "a", "c", "b"]) await cache.acquire(key, `/${key}`).promise;
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 8 });
    const tiny = createQcPreviewCache({ fetch: fetcher, maxBytes: 3 });
    await tiny.acquire("a", "/a").promise;
    expect(tiny.stats().entries).toBe(0);
  });
  it("bounds concurrency, prioritizes covers and cancels work without consumers", async () => {
    const releases: (() => void)[] = [];
    const fetcher = vi.fn(() => new Promise<Response>(resolve => releases.push(() => resolve(reply()))));
    const cache = createQcPreviewCache({ fetch: fetcher });
    const requests = Array.from({ length: 6 }, (_, index) => cache.acquire(String(index), `/${index}`, index === 5 ? 0 : 1));
    await tick();
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher).toHaveBeenNthCalledWith(1, "/5", expect.anything());
    const canceled = requests[4].promise.catch(error => error.name);
    requests[4].release();
    expect(await canceled).toBe("AbortError");
    releases.splice(0).forEach(release => release()); await tick();
    releases.splice(0).forEach(release => release());
    await Promise.all(requests.filter((_, index) => index !== 4).map(request => request.promise));
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(cache.stats().running).toBeLessThanOrEqual(4);
  });
  it("cannot repopulate an invalidated cache from an uncooperative late response", async () => {
    let release!: (response: Response) => void;
    const cache = createQcPreviewCache({ fetch: () => new Promise(resolve => { release = resolve; }) });
    const first = cache.acquire("a", "/a"), error = first.promise.catch(error => error.name);
    await tick(); cache.invalidate(); release(reply());
    expect(await error).toBe("AbortError"); await tick();
    expect(cache.stats()).toMatchObject({ entries: 0, bytes: 0, pending: 0 });
  });
  it("retries errors and rejects oversized or unexpected content without caching it", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 })).mockResolvedValueOnce(new Response("bad")).mockResolvedValueOnce(reply(131073)).mockResolvedValueOnce(reply());
    const cache = createQcPreviewCache({ fetch: fetcher });
    for (let index = 0; index < 3; index++) await expect(cache.acquire("a", "/a").promise).rejects.toThrow();
    await expect(cache.acquire("a", "/a").promise).resolves.toEqual(blob());
    expect(cache.stats().entries).toBe(1);
  });
  it("isolates users, workspaces, purchases and content generations", async () => {
    const fetcher = vi.fn(async () => reply()), cache = createQcPreviewCache({ fetch: fetcher });
    for (const key of [["a", "w", "p", "v1"], ["b", "w", "p", "v1"], ["a", "x", "p", "v1"], ["a", "w", "q", "v1"], ["a", "w", "p", "v2"]]) await cache.acquire(JSON.stringify(key), "/preview").promise;
    expect(fetcher).toHaveBeenCalledTimes(5);
  });
});

describe("preview validators", () => {
  const preview = { sha256: "a".repeat(64), r2Key: "private-key", transformVersion: "v1", revision: 1 };
  it("separates generations, transformations and users without exposing object keys", () => {
    const version = qcPreviewVersion(preview);
    expect(version).not.toContain("private");
    for (const change of [{ revision: 2 }, { r2Key: "restored" }, { transformVersion: "v2" }, { sha256: "b".repeat(64) }]) expect(qcPreviewVersion({ ...preview, ...change })).not.toBe(version);
    expect(qcPreviewEtag("alice", version)).not.toBe(qcPreviewEtag("bob", version));
  });
  it("compares GET validators weakly, including lists and quoted commas", () => {
    for (const header of ['"same"', 'W/"same"', ' "other,tag", W/"same" ', "*"]) expect(matchesQcEtag(header, '"same"')).toBe(true);
    for (const header of [null, '"other"', 'junk "same"', '"same",', '"same" "other"', '*, "same"', 'w/"same"']) expect(matchesQcEtag(header, '"same"')).toBe(false);
  });
});
