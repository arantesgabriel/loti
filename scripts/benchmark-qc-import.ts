import { randomUUID, createHash } from "node:crypto";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { strict as assert } from "node:assert";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { fixture } from "../tests/integration/helpers";
import { purchases, purchaseItems } from "../src/lib/db/schema";
import { qcServices } from "../src/lib/domain/qc-services";
import { createQcMetricCollector } from "../src/lib/qc/metrics";
import { validateQcImage } from "../src/lib/qc/image-validation";
import { generateQcPreview } from "../src/lib/qc/preview";
import type { QcObject, QcStorage } from "../src/lib/qc/storage";

type Mode = "baseline" | "final";
type Run = { photos: number; destinations: number; concurrency: number; wallMs: number; peakSampledMemory: { rss: number; external: number; arrayBuffers: number }; operations: Record<string, number>; reimport: { downloadAttempts: number; puts: number }; complete: boolean };
const args = process.argv.slice(2);
const mode = (args[args.indexOf("--mode") + 1] as Mode | undefined) ?? "baseline";
const concurrency = Number(args[args.indexOf("--concurrency") + 1] ?? "1");
const memoryOnly = args.includes("--memory-only");
if (mode !== "baseline" && mode !== "final") throw new Error("Use --mode baseline|final.");
if (![1, 2, 3, 5, 10].includes(concurrency)) throw new Error("Benchmark concurrency must be 1, 2, 3, 5 or 10.");
if (process.env.TURSO_DATABASE_URL && !process.env.TURSO_DATABASE_URL.startsWith("file:")) throw new Error("QC benchmark refuses a remote TURSO_DATABASE_URL.");

const root = process.cwd();
const dataDir = resolve(root, "data");
const databasePath = resolve(dataDir, `qc-import-benchmark-${randomUUID()}.sqlite`);
const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
const artifactDir = resolve(root, "artifacts", "benchmarks", "qc-import");
let benchmarkClock = Date.now();
const wait = (ms: number) => new Promise(resolveWait => setTimeout(resolveWait, ms));
const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const median = (values: number[]) => { const rows = sorted(values); return rows[Math.floor(rows.length / 2)] ?? 0; };

function payload(photoCount: number, prefix: string, destinationCount = 1, targetPrefix = prefix) {
  const goodsList = Array.from({ length: destinationCount }, (_, destination) => ({
    orderGoodsId: `${prefix}-goods-${destination}`,
    offerUrl: `https://weidian.com/item.html?itemID=${targetPrefix}-${destination}`,
    skuInfo: `Variant ${destination}`,
    goodsName: `Synthetic item ${destination}`,
    quantity: 1,
    freePhotos: destinationCount === 1
      ? Array.from({ length: photoCount }, (_, index) => `https://scm.hubbuy.app/qc/${prefix}-photo-${index}.png`)
      : [`https://scm.hubbuy.app/qc/${prefix}-photo-${destination}.png`],
  }));
  return { code: 0, data: { count: 1, list: [{ orderNo: `${prefix}-order`, goodsList }] } };
}

async function seedPurchase(db: Awaited<ReturnType<typeof fixture>>["db"], id: string, destinations: number) {
  const now = new Date("2026-10-20T12:00:00.000Z");
  await db.insert(purchases).values({ id, workspaceId: "workspace", name: `Synthetic ${id}`, status: "finalized", createdBy: "alice", createdAt: now, finalizedAt: now }).run();
  await db.insert(purchaseItems).values(Array.from({ length: destinations }, (_, index) => ({
    id: `${id}-item-${index}`, purchaseId: id, sourceFavoriteId: null, personId: "alice", createdBy: "alice",
    name: `Synthetic item ${index}`, url: `https://weidian.com/item.html?itemID=${id}-${index}`, platform: "weidian", visualKey: "generic",
    variant: `Variant ${index}`, notes: null, quantity: 1, unitPriceCents: 100, cartStatus: "added" as const, sharingMode: "equal" as const, createdAt: now, updatedAt: now,
  }))).run();
}

async function benchmarkMemoryProbe(f: Awaited<ReturnType<typeof fixture>>, batchConcurrency: number) {
  const photoCount = 5, width = 3000, height = 2000;
  const purchaseId = `bench-memory-${randomUUID()}`;
  await seedPurchase(f.db, purchaseId, photoCount);
  const samples = new Map<string, Buffer>();
  for (let index = 0; index < photoCount; index++) {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="g${index}" x2="1" y2="1"><stop stop-color="#${(235 - index * 13).toString(16)}${(190 + index * 7).toString(16)}a8"/><stop offset="1" stop-color="#526d${(115 + index * 9).toString(16)}"/></linearGradient><pattern id="p${index}" width="96" height="96" patternUnits="userSpaceOnUse"><path d="M0 0h96v96H0z" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="4"/><circle cx="48" cy="48" r="18" fill="#ffffff" fill-opacity=".16"/></pattern></defs><rect width="${width}" height="${height}" fill="url(#g${index})"/><rect width="${width}" height="${height}" fill="url(#p${index})"/><circle cx="${500 + index * 280}" cy="${420 + index * 190}" r="260" fill="#f7bd81" fill-opacity=".68"/><text x="160" y="1800" font-family="Arial" font-size="96" fill="#fff">Synthetic QC ${index + 1}</text></svg>`);
    const bytes = await sharp(svg).jpeg({ quality: 82, chromaSubsampling: "4:2:0" }).toBuffer();
    samples.set(`/qc/memory-probe-photo-${index}.png`, bytes);
  }
  const objects = new Map<string, { bytes: Buffer; sha256: string }>();
  const operations = { downloads: 0, heads: 0, gets: 0, puts: 0, deletes: 0 };
  const storage: QcStorage = {
    async put(object) { operations.puts++; objects.set(object.key, { bytes: object.bytes, sha256: object.sha256 }); },
    async head(key) { operations.heads++; const object = objects.get(key); return object ? { exists: true, sha256: object.sha256 } : { exists: false }; },
    async get(key, maxBytes) { operations.gets++; const object = objects.get(key); if (!object || object.bytes.byteLength > maxBytes) throw new Error("synthetic memory object missing"); return object.bytes; },
    async delete(key) { operations.deletes++; objects.delete(key); },
    async signRead() { return "https://synthetic.invalid/never-used"; },
  };
  const metrics = createQcMetricCollector();
  const clock = benchmarkClock + 61_000;
  const service = qcServices(f.db, "alice", {
    managerId: "alice", storage, metrics, pipelineConcurrency: batchConcurrency, now: () => clock,
    download: async url => { operations.downloads++; const bytes = samples.get(new URL(url).pathname); if (!bytes) throw new Error("synthetic memory image missing"); return bytes; },
    validate: validateQcImage, makePreview: generateQcPreview,
  });
  let peak = { rss: 0, external: 0, arrayBuffers: 0 };
  const sampler = setInterval(() => {
    const memory = process.memoryUsage();
    peak = { rss: Math.max(peak.rss, memory.rss), external: Math.max(peak.external, memory.external), arrayBuffers: Math.max(peak.arrayBuffers, memory.arrayBuffers) };
  }, 5);
  const inputBytes = [...samples.values()].reduce((sum, bytes) => sum + bytes.byteLength, 0);
  const started = performance.now();
  try {
    const prepared = await service.prepare(purchaseId, payload(photoCount, "memory-probe", photoCount, purchaseId));
    const confirmed = await service.confirmImport(prepared.importId, prepared.revision, []);
    assert.equal(confirmed.eligibleSources, photoCount);
    const result = await service.runImportBatch(prepared.importId, confirmed.revision ?? 0);
    assert.equal(result.processed, photoCount);
    if (result.imported !== photoCount) throw new Error(`High-resolution QC probe did not import every photo: ${JSON.stringify(result.results)}`);
    assert.equal(result.imported, photoCount);
    assert.equal(result.complete, true);
    return { photos: photoCount, destinations: photoCount, dimensions: { width, height }, encodedInputBytes: inputBytes, wallMs: performance.now() - started, peakSampledMemoryBytes: peak, operations, complete: true };
  } finally { clearInterval(sampler); benchmarkClock = clock + 61_000; }
}

async function benchmarkScenario(f: Awaited<ReturnType<typeof fixture>>, runId: string, photoCount: number, destinations: number, batchConcurrency: number): Promise<Run> {
  const purchaseId = `bench-${runId}`;
  await seedPurchase(f.db, purchaseId, destinations);
  const objects = new Map<string, { bytes: Buffer; sha256: string }>();
  const operations = { downloads: 0, heads: 0, gets: 0, puts: 0, deletes: 0 };
  const artificialDelayMs = 2;
  const storage: QcStorage = {
    async put(object: QcObject) { await wait(artificialDelayMs); operations.puts++; objects.set(object.key, { bytes: object.bytes, sha256: object.sha256 }); },
    async head(key) { await wait(artificialDelayMs); operations.heads++; const object = objects.get(key); return object ? { exists: true, sha256: object.sha256 } : { exists: false }; },
    async get(key, maxBytes) { await wait(artificialDelayMs); operations.gets++; const object = objects.get(key); if (!object || object.bytes.byteLength > maxBytes) throw new Error("synthetic object missing"); return object.bytes; },
    async delete(key) { await wait(artificialDelayMs); operations.deletes++; objects.delete(key); },
    async signRead() { return "https://synthetic.invalid/never-used"; },
  };
  let clock = benchmarkClock;
  const metrics = createQcMetricCollector();
  const service = qcServices(f.db, "alice", {
    managerId: "alice", storage, metrics, pipelineConcurrency: batchConcurrency, now: () => clock,
    download: async url => { await wait(artificialDelayMs); operations.downloads++; return Buffer.from(new URL(url).pathname); },
    validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 64, height: 64 }),
    makePreview: async bytes => { const preview = Buffer.concat([Buffer.from("synthetic-webp-preview:"), bytes]); return { bytes: preview, sha256: createHash("sha256").update(preview).digest("hex"), width: 64, height: 64 }; },
  });
  const input = payload(photoCount, runId, destinations, purchaseId);
  let sampledPeak = { rss: 0, external: 0, arrayBuffers: 0 };
  const sampler = setInterval(() => {
    const memory = process.memoryUsage();
    sampledPeak = { rss: Math.max(sampledPeak.rss, memory.rss), external: Math.max(sampledPeak.external, memory.external), arrayBuffers: Math.max(sampledPeak.arrayBuffers, memory.arrayBuffers) };
  }, 10);
  const started = performance.now();
  try {
    clock += 61_000;
    const prepared = await service.prepare(purchaseId, input);
    const confirmed = await service.confirmImport(prepared.importId, prepared.revision, []);
    assert.equal(confirmed.eligibleSources, photoCount);
    let revision = confirmed.revision ?? 0;
    let calls = 0;
    while (true) {
      if (calls && calls % 11 === 0) clock += 61_000;
      const result = await service.runImportBatch(prepared.importId, revision);
      revision = result.revision ?? revision;
      calls++;
      if (!result.hasMore) { assert.equal(result.complete, true); break; }
      if (result.processed === 0) throw new Error("Synthetic processing stopped without progress.");
    }
    const firstSnapshot = metrics.snapshot(performance.now() - started);
    assert.equal(firstSnapshot.counters.photosImported, photoCount);
    // Reimport an identical, already-ready manifest and confirm the server can reuse persisted state.
    clock += 61_000;
    const reimport = await service.prepare(purchaseId, input);
    const reimportConfirmed = await service.confirmImport(reimport.importId, reimport.revision, []);
    const beforeReimport = { downloadAttempts: operations.downloads, puts: operations.puts };
    if (reimportConfirmed.eligibleSources > 0) await service.runImportBatch(reimport.importId, reimportConfirmed.revision);
    const reimportCounts = { downloadAttempts: operations.downloads - beforeReimport.downloadAttempts, puts: operations.puts - beforeReimport.puts };
    assert.deepEqual(reimportCounts, { downloadAttempts: 0, puts: 0 });
    const snapshot = metrics.snapshot(performance.now() - started);
    if (sampledPeak.rss === 0) sampledPeak = snapshot.memory;
    const elapsed = performance.now() - started;
    return { photos: photoCount, destinations, concurrency: batchConcurrency, wallMs: elapsed, peakSampledMemory: sampledPeak, operations: { ...operations, dbCalls: snapshot.counters.dbCalls, bytesObserved: snapshot.counters.bytesObserved, selected: snapshot.counters.photosSelected, imported: snapshot.counters.photosImported, getDurationMs: snapshot.durationsMs.download.sum }, reimport: reimportCounts, complete: true };
  } finally { clearInterval(sampler); benchmarkClock = clock + 61_000; }
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  try { await stat(databasePath); throw new Error("Refusing to use a pre-existing benchmark database."); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await mkdir(artifactDir, { recursive: true });
  const runs: Run[] = [];
  let f: Awaited<ReturnType<typeof fixture>> | undefined;
  try {
    f = await fixture(databaseUrl);
    if (memoryOnly) {
      const memoryProbe = await benchmarkMemoryProbe(f, concurrency);
      const output = { mode: "memory", concurrency, generatedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch }, database: "new disposable file: SQLite (migrated locally; removed in finally)", fixture: { operationsUseSyntheticServices: true, generatedCompressedImages: true, realQcDecoderAndPreview: true, sampledMemoryIsNotAnExactPeak: true }, memoryProbe };
      const outputPath = join(artifactDir, `memory-concurrency-${concurrency}.json`);
      await (await import("node:fs/promises")).writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "w" });
      console.log(JSON.stringify({ outputPath, memoryProbe }, null, 2));
      return;
    }
    for (const photos of [10, 50, 100]) {
      for (let repeat = 0; repeat < 5; repeat++) {
        runs.push(await benchmarkScenario(f, `${mode}-${concurrency}-${photos}-${repeat}-${randomUUID().slice(0, 8)}`, photos, 1, concurrency));
      }
    }
    for (let repeat = 0; repeat < 5; repeat++) {
      runs.push(await benchmarkScenario(f, `${mode}-${concurrency}-multi-${repeat}-${randomUUID().slice(0, 8)}`, 10, 10, concurrency));
    }
    const output = {
      mode, concurrency, generatedAt: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch },
      database: "new disposable file: SQLite (migrated locally; removed in finally)", fixture: { operationsUseSyntheticServices: true, artificialDelayMs: 2, clockAdvancedAtBatchRateWindow: true, timedRepeatsPerScenario: 5, imageBytesGeneratedLocally: true },
      scenarios: [10, 50, 100].map(photos => {
        const samples = runs.filter(run => run.photos === photos && run.destinations === 1);
        return { photos, destinations: 1, repeats: samples.length, wallMsMedian: median(samples.map(run => run.wallMs)), wallMsRange: [Math.min(...samples.map(run => run.wallMs)), Math.max(...samples.map(run => run.wallMs))], totalDownloads: samples.reduce((sum, run) => sum + run.operations.downloads, 0), totalPuts: samples.reduce((sum, run) => sum + run.operations.puts, 0), totalGets: samples.reduce((sum, run) => sum + run.operations.gets, 0), selected: samples.reduce((sum, run) => sum + run.operations.selected, 0), imported: samples.reduce((sum, run) => sum + run.operations.imported, 0), peakSampledMemoryBytes: { rss: Math.max(...samples.map(run => run.peakSampledMemory.rss)), external: Math.max(...samples.map(run => run.peakSampledMemory.external)), arrayBuffers: Math.max(...samples.map(run => run.peakSampledMemory.arrayBuffers)) }, reimportPasses: samples.every(run => run.reimport.downloadAttempts === 0 && run.reimport.puts === 0) };
      }),
      multipleDestinations: { repeats: 5, photos: 10, destinations: 10, wallMsMedian: median(runs.filter(run => run.destinations === 10).map(run => run.wallMs)), totalDownloads: runs.filter(run => run.destinations === 10).reduce((sum, run) => sum + run.operations.downloads, 0) },
      rawRuns: runs,
      deterministicChecks: { manifest300RejectedBeforeTransfer: await reject300(f, concurrency), acceptedAcrossManifests200Plus100: await accept200Plus100(f, concurrency) },
    };
    const outputPath = join(artifactDir, mode === "baseline" ? "baseline.json" : `final-concurrency-${concurrency}.json`);
    await (await import("node:fs/promises")).writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "w" });
    console.log(JSON.stringify({ outputPath, scenarios: output.scenarios, multipleDestinations: output.multipleDestinations, deterministicChecks: output.deterministicChecks }, null, 2));
  } catch (error) {
    console.error("QC synthetic benchmark failed:", error instanceof Error ? error.message : "unknown error");
    throw error;
  } finally {
    benchmarkClock += 61_000;
    if (f) await f.client.close();
    const verifiedPath = resolve(databasePath);
    if (!verifiedPath.startsWith(`${dataDir}${process.platform === "win32" ? "\\" : "/"}`)) throw new Error("Refusing to remove a database outside the benchmark data directory.");
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      let removed = false;
      for (let attempt = 0; attempt < 6 && !removed; attempt++) {
        try { await unlink(`${verifiedPath}${suffix}`); removed = true; }
        catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === "ENOENT") { removed = true; break; }
          if (code !== "EBUSY" && code !== "EPERM") throw error;
          await wait(100 * (attempt + 1));
        }
      }
      if (!removed) console.warn("Disposable QC benchmark database remains locked by the local SQLite runtime:", `${verifiedPath}${suffix}`);
    }
  }
}

async function reject300(f: Awaited<ReturnType<typeof fixture>>, batchConcurrency: number) {
  const purchaseId = `bench-reject-${randomUUID()}`;
  await seedPurchase(f.db, purchaseId, 1);
  const storageCalls = { download: 0, put: 0 };
  const clock = benchmarkClock + 61_000;
  const service = qcServices(f.db, "alice", {
    managerId: "alice", now: () => clock, pipelineConcurrency: batchConcurrency,
    download: async () => { storageCalls.download++; return Buffer.alloc(16); },
    validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 16, height: 16 }),
    makePreview: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), width: 16, height: 16 }),
    storage: { async put() { storageCalls.put++; }, async head() { return { exists: false }; }, async get() { return Buffer.alloc(0); }, async delete() {}, async signRead() { return ""; } },
  });
  try { await service.prepare(purchaseId, payload(300, "reject")); throw new Error("300 photos unexpectedly passed schema validation."); }
  catch (error) { if (!(error instanceof Error) || !("code" in error) || (error as { code?: string }).code !== "QC_IMPORT_LIMIT") throw error; }
  assert.deepEqual(storageCalls, { download: 0, put: 0 });
  benchmarkClock = clock + 61_000;
  return { rejected: true, code: "QC_IMPORT_LIMIT", transferCalls: 0 };
}

async function accept200Plus100(f: Awaited<ReturnType<typeof fixture>>, batchConcurrency: number) {
  const purchaseId = `bench-300-${randomUUID()}`;
  await seedPurchase(f.db, purchaseId, 1);
  let clock = benchmarkClock + 61_000;
  const storageObjects = new Map<string, { bytes: Buffer; sha256: string }>();
  const service = qcServices(f.db, "alice", {
    managerId: "alice", now: () => clock, pipelineConcurrency: batchConcurrency,
    storage: {
      async put(object) { storageObjects.set(object.key, { bytes: object.bytes, sha256: object.sha256 }); },
      async head(key) { const object = storageObjects.get(key); return object ? { exists: true, sha256: object.sha256 } : { exists: false }; },
      async get(key) { const object = storageObjects.get(key); if (!object) throw new Error("missing"); return object.bytes; },
      async delete(key) { storageObjects.delete(key); }, async signRead() { return ""; },
    },
    download: async url => Buffer.from(new URL(url).pathname),
    validate: async bytes => ({ bytes, sha256: createHash("sha256").update(bytes).digest("hex"), mimeType: "image/png", extension: "png", width: 16, height: 16 }),
    makePreview: async bytes => ({ bytes: Buffer.from(`preview:${bytes}`), sha256: createHash("sha256").update(`preview:${bytes}`).digest("hex"), width: 16, height: 16 }),
  });
  let total = 0;
  for (const count of [200, 100]) {
    clock += 61_000;
    const prefix = `accepted-${total}`;
    const prepared = await service.prepare(purchaseId, payload(count, prefix, 1, purchaseId));
    const confirmed = await service.confirmImport(prepared.importId, prepared.revision, []);
    assert.equal(confirmed.eligibleSources, count);
    let revision = confirmed.revision ?? 0, batches = 0;
    while (true) {
      if (batches && batches % 11 === 0) clock += 61_000;
      const result = await service.runImportBatch(prepared.importId, revision);
      revision = result.revision ?? revision;
      batches++;
      if (!result.hasMore) { assert.equal(result.complete, true); break; }
      if (result.processed === 0) throw new Error("200+100 synthetic transfer did not progress.");
    }
    total += count;
  }
  const row = await f.db.select().from(purchases).where(eq(purchases.id, purchaseId)).get();
  assert.equal(row?.status, "finalized");
  benchmarkClock = clock + 61_000;
  return { acceptedAcrossManifests: [200, 100], totalPhotos: total, allBatchesComplete: true };
}

void main();
