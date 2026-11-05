import { afterEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth/api";
const mocks = vi.hoisted(() => ({ getSession: vi.fn(), activationState: vi.fn(), headers: vi.fn(async () => new Headers()) }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth/index", () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock("@/lib/auth/activation", () => ({ activationState: mocks.activationState }));
import { requireUser } from "@/lib/auth/session";

afterEach(() => vi.restoreAllMocks());
describe("session availability", () => {
  it("returns the authenticated user", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "member" } });
    mocks.activationState.mockResolvedValue({ pending: false });
    await expect(requireUser()).resolves.toEqual({ id: "member" });
  });
  it("blocks pending activation unless the caller explicitly allows it", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "member" } });
    mocks.activationState.mockResolvedValue({ pending: true });
    await expect(requireUser()).rejects.toMatchObject({ status: 403, code: "EMAIL_ACTIVATION_REQUIRED" });
    await expect(requireUser({ allowPendingActivation: true })).resolves.toEqual({ id: "member" });
  });
  it("keeps missing and rejected sessions unauthorized", async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
    mocks.getSession.mockRejectedValue(APIError.from("UNAUTHORIZED", { code: "FAILED_TO_GET_SESSION", message: "Failed to get session" }));
    await expect(requireUser()).rejects.toMatchObject({ status: 401 });
  });
  it("reports unavailable session storage without treating it as logout or logging credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getSession.mockRejectedValue(APIError.from("INTERNAL_SERVER_ERROR", { code: "FAILED_TO_GET_SESSION", message: "Failed to get session" }));
    await expect(requireUser()).rejects.toMatchObject({ status: 503, code: "SESSION_UNAVAILABLE" });
    expect(log).toHaveBeenCalledWith("Loti session unavailable", { code: "FAILED_TO_GET_SESSION", status: 500 });
  });
  it("does not hide unexpected programming errors", async () => {
    const error = new TypeError("unexpected");
    mocks.getSession.mockRejectedValue(error);
    await expect(requireUser()).rejects.toBe(error);
  });
});
