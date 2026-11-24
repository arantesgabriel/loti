import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/lib/domain/errors";
const mocks = vi.hoisted(() => ({ user: vi.fn(), factory: vi.fn(), preview: vi.fn(), record: vi.fn(), previewReversal: vi.fn(), reverse: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/auth/origin", () => ({ authOrigin: () => "http://localhost:3294" }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/domain/hubbuy-topup-services", () => ({ hubbuyTopupServices: mocks.factory }));
import { POST } from "@/app/api/hubbuy/accounts/[accountId]/topups/route";

const context = { params: Promise.resolve({ accountId: "synthetic-account" }) };
const request = (body: unknown, origin = "http://localhost:3294") => new Request("http://localhost:3294/api/hubbuy/accounts/synthetic-account/topups", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "alice" });
  mocks.factory.mockReturnValue({ preview: mocks.preview, record: mocks.record, previewReversal: mocks.previewReversal, reverse: mocks.reverse });
  for (const mock of [mocks.preview, mocks.record, mocks.previewReversal, mocks.reverse]) mock.mockResolvedValue({ accountId: "synthetic-account" });
});

describe("topup private HTTP boundary", () => {
  it.each(["preview", "record", "reversal.preview", "reverse"] as const)("dispatches %s only with authenticated user, account and explicit workspace", async operation => {
    const command = { idempotencyKey: "synthetic-key" };
    const response = await POST(request({ operation, workspaceId: "workspace", command }), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.factory).toHaveBeenCalledWith({}, "alice", "workspace");
    const target = operation === "preview" ? mocks.preview : operation === "record" ? mocks.record : operation === "reversal.preview" ? mocks.previewReversal : mocks.reverse;
    expect(target).toHaveBeenCalledWith("synthetic-account", command);
  });

  it("rejects an untrusted origin before resolving session or starting a service", async () => {
    const response = await POST(request({ operation: "record", workspaceId: "workspace", command: {} }, "https://foreign.invalid"), context);
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.factory).not.toHaveBeenCalled();
  });

  it("rejects missing session without opening the financial service", async () => {
    mocks.user.mockRejectedValue(new DomainError("Sessão necessária.", 401));
    const response = await POST(request({ operation: "record", workspaceId: "workspace", command: {} }), context);
    expect(response.status).toBe(401); expect(mocks.factory).not.toHaveBeenCalled();
  });

  it.each([
    { operation: "record", command: {} },
    { operation: "record", workspaceId: "workspace", command: {}, actorId: "foreign" },
    { operation: "delete", workspaceId: "workspace", command: {} },
  ])("rejects invalid envelopes without dispatch", async body => {
    const response = await POST(request(body), context);
    expect(response.status).toBe(400); expect(mocks.factory).not.toHaveBeenCalled();
  });
});
