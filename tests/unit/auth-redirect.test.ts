import { describe, expect, it } from "vitest";
import { loginDestination } from "@/lib/auth/redirect";
describe("invitation login return", () => {
  it("permits only complete internal invitation paths", () => {
    const path = `/invite/${"a".repeat(43)}`;
    expect(loginDestination(path)).toBe(path);
    for (const input of [null, "https://example.com", "//example.com", "/invite/short", `${path}?next=https://example.com`, `/invite/${"a".repeat(43)}/../group`, "/group"]) expect(loginDestination(input)).toBe("/favorites");
  });
});
