import { qcPreviewCache } from "./qc-preview-cache";

export type QcPreview = { imageId: string; previewUrl: string; previewVersion: string; width: number; height: number; occurrence: string };
export type QcPresentation = { itemId: string; purchaseItemId: string; qcCount: number; primaryImageId: string | null; presentationRevision: number; canSetCover: boolean; coverPreview: QcPreview | null; previews: QcPreview[] };
type Entry = { value?: QcPresentation; expiresAt: number; promise: Promise<QcPresentation>; resolve: (value: QcPresentation) => void; reject: (cause: unknown) => void };
const entries = new Map<string, Entry>(), pending = new Map<string, { scope: string; purchaseId: string; itemId: string; entry: Entry }>();
const listeners = new Set<() => void>();
const controllers = new Set<AbortController>();
let scope: string | null = null, generation = 0, scheduled = false;
export const qcScope = (userId: string, workspaceId: string) => JSON.stringify([userId, workspaceId]);
const entryKey = (scope: string, purchaseId: string, itemId: string) => JSON.stringify([scope, purchaseId, itemId]);
export const subscribeQcChanges = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const isQcScopeActive = (value: string) => scope === value;
export function resetQcClient(next: string | null = null) {
  scope = next; generation++;
  for (const controller of controllers) controller.abort();
  controllers.clear();
  for (const entry of entries.values()) entry.reject(new DOMException("Aborted", "AbortError"));
  entries.clear(); pending.clear(); qcPreviewCache.invalidate();
  for (const listener of listeners) listener();
}
export function setQcClientScope(next: string) { if (scope !== next) resetQcClient(next); }
export function invalidateQcPresentation(purchaseId: string, clearBytes = true) {
  for (const [key, entry] of entries) if ((JSON.parse(key) as string[])[1] === purchaseId) { entries.delete(key); pending.delete(key); entry.reject(new DOMException("Aborted", "AbortError")); }
  if (clearBytes) qcPreviewCache.invalidate(key => (JSON.parse(key) as string[])[1] === purchaseId);
  for (const listener of listeners) listener();
}
async function flush() {
  scheduled = false;
  const work = [...pending.values()]; pending.clear();
  const groups = new Map<string, typeof work>();
  for (const row of work) { const key = JSON.stringify([row.scope, row.purchaseId]); const group = groups.get(key) ?? []; group.push(row); groups.set(key, group); }
  for (const group of groups.values()) for (let offset = 0; offset < group.length; offset += 20) {
    const batch = group.slice(offset, offset + 20), controller = new AbortController(), token = generation;
    controllers.add(controller);
    void fetch(`/api/purchases/${encodeURIComponent(batch[0].purchaseId)}/qc?itemIds=${encodeURIComponent(batch.map(row => row.itemId).join(","))}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) { if (response.status === 401) resetQcClient(); throw Object.assign(new Error("Apresentação QC indisponível"), { status: response.status }); }
      const body = await response.json() as { data: { items: QcPresentation[] } };
      if (token !== generation) throw new DOMException("Aborted", "AbortError");
      for (const row of batch) {
        const key = entryKey(row.scope, row.purchaseId, row.itemId);
        if (entries.get(key) !== row.entry) continue;
        const value = body.data.items.find(item => item.itemId === row.itemId);
        if (!value) throw new Error("Apresentação QC ausente");
        row.entry.value = value; row.entry.expiresAt = Date.now() + 30_000; row.entry.resolve(value);
      }
    }).catch(error => {
      for (const row of batch) {
        const key = entryKey(row.scope, row.purchaseId, row.itemId);
        if (entries.get(key) === row.entry) entries.delete(key);
        row.entry.reject(error);
      }
    }).finally(() => { controllers.delete(controller); });
  }
}
export function qcPresentation(scope: string, purchaseId: string, itemId: string) {
  if (!isQcScopeActive(scope)) return { promise: Promise.reject<QcPresentation>(new DOMException("Aborted", "AbortError")), expiresAt: 0, value: undefined };
  const key = entryKey(scope, purchaseId, itemId), existing = entries.get(key);
  if (existing && (!existing.value || existing.expiresAt > Date.now())) { entries.delete(key); entries.set(key, existing); return existing; }
  entries.delete(key);
  for (const [oldKey, old] of entries) { if (entries.size < 200) break; if (old.value) entries.delete(oldKey); }
  if (entries.size >= 200) return { promise: Promise.reject<QcPresentation>(new Error("Limite de apresentações QC em andamento")), expiresAt: 0, value: undefined };
  let resolve!: Entry["resolve"], reject!: Entry["reject"];
  const promise = new Promise<QcPresentation>((done, fail) => { resolve = done; reject = fail; });
  const entry: Entry = { promise, resolve, reject, expiresAt: 0 };
  entries.set(key, entry); pending.set(key, { scope, purchaseId, itemId, entry });
  if (!scheduled) { scheduled = true; setTimeout(() => { void flush(); }, 0); }
  return entry;
}

export function isQcPresentationFresh(scope: string, purchaseId: string, itemId: string, value: QcPresentation) {
  const entry = entries.get(entryKey(scope, purchaseId, itemId));
  return isQcScopeActive(scope) && entry?.value === value && entry.expiresAt > Date.now();
}
