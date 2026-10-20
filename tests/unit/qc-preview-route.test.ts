import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUser: mocks.user }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/domain/qc-services", () => ({ qcServices: () => ({ readPreview: mocks.preview }) }));
import { GET } from "@/app/api/qc/images/[imageId]/preview/route";
import { DomainError } from "@/lib/domain/errors";
afterEach(() => vi.resetAllMocks());
describe("private preview HTTP route", () => {
  const context = { params: Promise.resolve({ imageId: "photo" }) };
  it("returns bytes with private revalidation headers and no public caching", async () => {
    mocks.user.mockResolvedValue({ id: "alice" }); mocks.preview.mockResolvedValue({ etag: '"version"', bytes: Buffer.from("preview") });
    const response = await GET(new Request("http://localhost/api/qc/images/photo/preview"), context);
    expect(response.status).toBe(200); expect(await response.text()).toBe("preview");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(response.headers.get("Vary")).toBe("Cookie, Origin"); expect(response.headers.get("ETag")).toBe('"version"');
  });
  it("returns an empty conditional response only after the service authorized it", async () => {
    mocks.user.mockResolvedValue({ id: "alice" }); mocks.preview.mockResolvedValue({ etag: '"version"', bytes: null });
    const response = await GET(new Request("http://localhost/preview", { headers: { "If-None-Match": 'W/"version"' } }), context);
    expect(response.status).toBe(304); expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(mocks.preview).toHaveBeenCalledWith("photo", 'W/"version"');
  });
  it("keeps authentication failures and deleted previews no-store", async () => {
    mocks.user.mockRejectedValueOnce(new DomainError("Session expired", 401));
    const denied = await GET(new Request("http://localhost/preview"), context);
    expect(denied.status).toBe(401); expect(mocks.preview).not.toHaveBeenCalled();
    mocks.user.mockResolvedValue({ id: "alice" }); mocks.preview.mockRejectedValue(new DomainError("Deleted", 404));
    const deleted = await GET(new Request("http://localhost/preview", { headers: { "If-None-Match": "*" } }), context);
    for (const response of [denied, deleted]) expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(deleted.status).toBe(404);
  });
});
