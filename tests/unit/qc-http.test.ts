import { describe, expect, it } from "vitest";
import { qcFailure } from "@/lib/domain/qc-http";
import { QcDomainError } from "@/lib/domain/qc-errors";

describe("QC structured transport failures", () => {
  it("returns retry metadata without private provider details", async () => {
    const response = qcFailure(new QcDomainError("Rate limited", 429, "QC_RATE_LIMIT", { retryAfterSeconds: 17 }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("17");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Rate limited", code: "QC_RATE_LIMIT", retryAfterSeconds: 17 });
  });

  it("exposes only the sanitized upstream status and no provider payload", async () => {
    const response = qcFailure(new QcDomainError("Source unavailable", 502, "QC_SOURCE_UNAVAILABLE", { upstreamStatus: 503 }));
    await expect(response.json()).resolves.toEqual({ error: "Source unavailable", code: "QC_SOURCE_UNAVAILABLE", upstreamStatus: 503 });
  });
});
