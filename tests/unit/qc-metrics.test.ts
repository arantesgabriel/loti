import { describe, expect, it } from "vitest";
import { createQcMetricCollector, measureQcStage, withQcMetricContext, recordQcDatabaseCall } from "@/lib/qc/metrics";

describe("QC run metrics", () => {
  it("collects request local counters and monotonic stage durations without SQL data", async () => {
    const metrics = createQcMetricCollector();
    await withQcMetricContext(metrics, async () => {
      recordQcDatabaseCall();
      await measureQcStage(metrics, "download", async () => { await Promise.resolve(); });
    });

    expect(metrics.snapshot(9)).toMatchObject({
      counters: { dbCalls: 1 },
      durationsMs: { download: { count: 1 } },
      wallMs: 9,
    });
  });

  it("does not leak counters between collectors", async () => {
    const first = createQcMetricCollector(), second = createQcMetricCollector();
    await withQcMetricContext(first, async () => { recordQcDatabaseCall(); });
    expect(first.snapshot().counters.dbCalls).toBe(1);
    expect(second.snapshot().counters.dbCalls).toBe(0);
  });
});
