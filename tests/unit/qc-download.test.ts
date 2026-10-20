import { describe, expect, it, vi } from "vitest";
import { downloadHubbuyImage, pinnedLookupReply, requirePublicDnsAnswers, validateHubbuySourceUrl } from "@/lib/qc/download";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

describe("HubBuy SSRF boundary", () => {
  it("allows only the exact HTTPS host with default port and no credentials", () => {
    expect(validateHubbuySourceUrl("https://scm.hubbuy.app/a.jpg#frag").hash).toBe("");
    for (const url of ["http://scm.hubbuy.app/a", "https://scm.hubbuy.app.evil.test/a", "https://evil.scm.hubbuy.app/a", "https://scm.hubbuy.app:444/a", "https://u@scm.hubbuy.app/a", "https://127.0.0.1/a"]) expect(() => validateHubbuySourceUrl(url)).toThrow();
  });

  it("rejects every private/reserved answer in mixed DNS responses", () => {
    expect(requirePublicDnsAnswers([{ address: "1.1.1.1", family: 4 }, { address: "8.8.8.8", family: 4 }])).toHaveLength(2);
    for (const address of ["127.0.0.1", "169.254.169.254", "10.0.0.1", "100.64.0.1", "192.0.2.1", "::1", "::ffff:127.0.0.1", "fc00::1", "64:ff9b::7f00:1"]) expect(() => requirePublicDnsAnswers([{ address: "1.1.1.1", family: 4 }, { address, family: address.includes(":") ? 6 : 4 }])).toThrow();
  });

  it("returns Node's all-address lookup shape with only the validated pinned IP", () => {
    const pinned = { address: "1.1.1.1", family: 4 as const };
    expect(pinnedLookupReply(pinned, true)).toEqual({ all: true, addresses: [pinned] });
    expect(pinnedLookupReply(pinned, false)).toEqual({ all: false, address: pinned.address, family: pinned.family });
  });

  it("connects through the exact validated public address and rejects a mismatched HTTP MIME", async () => {
    const connect = vi.fn(async (_url: URL, address: { address: string }) => {
      expect(address.address).toBe("1.1.1.1");
      return { statusCode: 200, headers: { "content-type": "image/png" }, body: png };
    });
    await expect(downloadHubbuyImage("https://scm.hubbuy.app/photo.png", { resolve: async () => [{ address: "1.1.1.1", family: 4 }, { address: "8.8.8.8", family: 4 }], request: connect })).resolves.toEqual(png);
    await expect(downloadHubbuyImage("https://scm.hubbuy.app/photo.png", { resolve: async () => [{ address: "1.1.1.1", family: 4 }], request: async () => ({ statusCode: 200, headers: { "content-type": "image/jpeg" }, body: png }) })).rejects.toMatchObject({ code: "QC_IMAGE_INVALID" });
    await expect(downloadHubbuyImage("https://scm.hubbuy.app/photo.png", { resolve: async () => [{ address: "127.0.0.1", family: 4 }], request: connect })).rejects.toMatchObject({ code: "QC_SOURCE_REJECTED" });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("bounds a stalled DNS lookup and never attempts a connection after the timeout", async () => {
    vi.useFakeTimers();
    try {
      const connect = vi.fn();
      const response = downloadHubbuyImage("https://scm.hubbuy.app/photo.png", { resolve: () => new Promise(() => {}), request: connect });
      const rejected = expect(response).rejects.toMatchObject({ code: "QC_SOURCE_TIMEOUT" });
      await vi.advanceTimersByTimeAsync(5_000);
      await rejected;
      expect(connect).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("rejects redirects without following their destination", async () => {
    const connect = vi.fn(async () => ({ statusCode: 302, headers: { location: "http://127.0.0.1/latest/meta-data" }, body: Buffer.alloc(0) }));
    await expect(downloadHubbuyImage("https://scm.hubbuy.app/photo.png", { resolve: async () => [{ address: "1.1.1.1", family: 4 }], request: connect })).rejects.toMatchObject({ code: "QC_SOURCE_UNAVAILABLE" });
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
