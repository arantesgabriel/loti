import { describe, expect, it } from "vitest";
import { transactionalTemplate } from "@/lib/email/templates";
describe("transactional email templates", () => {
  it.each(["reset", "verification", "invitation"] as const)("renders safe HTML and plain text for %s", kind => {
    const message = transactionalTemplate(kind, 'https://useloti.com/path?a=1&b="x"', '<img src=x onerror=alert(1)>');
    expect(message.subject).toMatch(/^Loti \|/); expect(message.text).toContain("https://useloti.com");
    expect(message.html).not.toContain("<img"); expect(message.html).not.toContain('href="https://useloti.com/path?a=1&b="x"');
    expect(message.html).toContain('lang="pt-BR"'); expect(message.html).not.toContain("tracking");
  });
});
