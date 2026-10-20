import { performance } from "node:perf_hooks";
import { AsyncLocalStorage } from "node:async_hooks";

export type QcMetricCounter =
  | "photosSelected"
  | "photosImported"
  | "photosExisting"
  | "photosFailed"
  | "photosPending"
  | "dbCalls"
  | "dnsCalls"
  | "downloadAttempts"
  | "downloadRetries"
  | "headCalls"
  | "getCalls"
  | "putCalls"
  | "deleteCalls"
  | "bytesObserved"
  | "deadlineInterruptions"
  | "quotaInterruptions";

export type QcMetricStage =
  | "parse"
  | "matching"
  | "database"
  | "download"
  | "validation"
  | "preview"
  | "storage"
  | "total";

export type QcMetricsSnapshot = {
  counters: Record<QcMetricCounter, number>;
  durationsMs: Record<QcMetricStage, { count: number; sum: number; min: number; max: number }>;
  wallMs: number;
  memory: { rss: number; external: number; arrayBuffers: number };
};

const counters = [
  "photosSelected", "photosImported", "photosExisting", "photosFailed", "photosPending", "dbCalls", "dnsCalls",
  "downloadAttempts", "downloadRetries", "headCalls", "getCalls", "putCalls", "deleteCalls", "bytesObserved",
  "deadlineInterruptions", "quotaInterruptions",
] as const satisfies readonly QcMetricCounter[];
const stages = ["parse", "matching", "database", "download", "validation", "preview", "storage", "total"] as const satisfies readonly QcMetricStage[];

export interface QcMetricCollector {
  increment(name: QcMetricCounter, amount?: number): void;
  observe(name: QcMetricStage, durationMs: number): void;
  snapshot(wallMs?: number): QcMetricsSnapshot;
}

const qcMetricContext = new AsyncLocalStorage<QcMetricCollector>();

export function withQcMetricContext<T>(metrics: QcMetricCollector, operation: () => Promise<T>): Promise<T> {
  return qcMetricContext.run(metrics, operation);
}

export function recordQcDatabaseCall(durationMs?: number) {
  const metrics = qcMetricContext.getStore();
  metrics?.increment("dbCalls");
  if (durationMs !== undefined) metrics?.observe("database", durationMs);
}

export function createQcMetricCollector(): QcMetricCollector {
  const countValues = Object.fromEntries(counters.map(name => [name, 0])) as Record<QcMetricCounter, number>;
  const durationValues = Object.fromEntries(stages.map(name => [name, { count: 0, sum: 0, min: Number.POSITIVE_INFINITY, max: 0 }])) as Record<QcMetricStage, { count: number; sum: number; min: number; max: number }>;
  return {
    increment(name, amount = 1) { if (Number.isFinite(amount) && amount > 0) countValues[name] += amount; },
    observe(name, durationMs) {
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      const stage = durationValues[name];
      stage.count++;
      stage.sum += durationMs;
      stage.min = Math.min(stage.min, durationMs);
      stage.max = Math.max(stage.max, durationMs);
    },
    snapshot(wallMs) {
      const memory = process.memoryUsage();
      const durationsMs = Object.fromEntries(stages.map(name => {
        const stage = durationValues[name];
        return [name, { count: stage.count, sum: stage.sum, min: stage.count ? stage.min : 0, max: stage.max }];
      })) as QcMetricsSnapshot["durationsMs"];
      return {
        counters: { ...countValues },
        durationsMs,
        wallMs: wallMs ?? 0,
        memory: { rss: memory.rss, external: memory.external, arrayBuffers: memory.arrayBuffers },
      };
    },
  };
}

export const noopQcMetrics: QcMetricCollector = {
  increment() {}, observe() {}, snapshot() { return createQcMetricCollector().snapshot(); },
};

export async function measureQcStage<T>(metrics: QcMetricCollector, stage: QcMetricStage, operation: () => Promise<T> | T): Promise<T> {
  const startedAt = performance.now();
  try { return await operation(); }
  finally { metrics.observe(stage, performance.now() - startedAt); }
}
