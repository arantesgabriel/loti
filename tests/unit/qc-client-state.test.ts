import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateQcPresentation, qcPresentation, qcScope, resetQcClient, setQcClientScope } from "@/components/qc/qc-client-state";

const scope = qcScope("alice", "workspace");
const presentation = (itemId: string, count = 4) => ({ itemId, purchaseItemId: itemId, qcCount: count, primaryImageId: null, presentationRevision: 1, canSetCover: false, coverPreview: null, previews: [] });
beforeEach(() => { vi.useFakeTimers(); setQcClientScope(scope); });
afterEach(() => { resetQcClient(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("bounded presentation reads", () => {
  it("coalesces consumers into batches of twenty and reuses fresh metadata", async () => {
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify({ data: { items: new URL(url, "http://localhost").searchParams.get("itemIds")!.split(",").map(id => presentation(id)) } })));
    vi.stubGlobal("fetch", fetcher);
    const requests = Array.from({ length: 26 }, (_, index) => qcPresentation(scope, "purchase", `purchase:${index}`).promise);
    const same = qcPresentation(scope, "purchase", "purchase:0");
    expect(same.promise).toBe(requests[0]);
    await vi.runOnlyPendingTimersAsync();
    await Promise.all(requests);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await qcPresentation(scope, "purchase", "purchase:0").promise;
    expect(fetcher).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(30_001);
    const refreshed = qcPresentation(scope, "purchase", "purchase:0");
    expect(refreshed.value).toBeUndefined();
    await vi.runOnlyPendingTimersAsync(); await refreshed.promise;
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("ignores late replies after mutation and never repopulates a previous session", async () => {
    const releases: ((response: Response) => void)[] = [];
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => releases.push(resolve))));
    const old = qcPresentation(scope, "purchase", "purchase:1").promise.catch(error => error.name);
    await vi.runOnlyPendingTimersAsync();
    invalidateQcPresentation("purchase");
    expect(await old).toBe("AbortError");
    const next = qcPresentation(scope, "purchase", "purchase:1");
    await vi.runOnlyPendingTimersAsync();
    releases[0](new Response(JSON.stringify({ data: { items: [presentation("purchase:1", 99)] } })));
    releases[1](new Response(JSON.stringify({ data: { items: [presentation("purchase:1", 3)] } })));
    expect((await next.promise).qcCount).toBe(3);
    setQcClientScope(qcScope("bob", "workspace"));
    await expect(qcPresentation(scope, "purchase", "purchase:1").promise).rejects.toMatchObject({ name: "AbortError" });
  });
  it("does not store errors or automatically retry rate limits", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 429 })); vi.stubGlobal("fetch", fetcher);
    const request = qcPresentation(scope, "purchase", "purchase:1").promise.catch(error => error.status);
    await vi.runOnlyPendingTimersAsync(); expect(await request).toBe(429);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("caps even pending metadata at two hundred destinations", async () => {
    const requests = Array.from({ length: 200 }, (_, index) => qcPresentation(scope, "purchase", `purchase:${index}`).promise.catch(() => null));
    await expect(qcPresentation(scope, "purchase", "purchase:overflow").promise).rejects.toThrow("Limite");
    resetQcClient(); await Promise.all(requests);
  });
});
