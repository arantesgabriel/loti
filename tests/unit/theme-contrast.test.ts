import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../../src/app/theme.css", import.meta.url), "utf8");
function tokens(selector: string) {
  const block = css.slice(css.indexOf(selector)).split("}")[0];
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}
const light = tokens(":root {");
const dark = { ...light, ...tokens(':root[data-theme="dark"] {') };
function resolve(value: string, palette: Record<string, string>): string {
  const match = value.match(/^var\((--[\w-]+)\)$/);
  return match ? resolve(palette[match[1]], palette) : value;
}
function luminance(hex: string) {
  const full = hex.length === 4 ? hex.slice(1).split("").map(c => c + c).join("") : hex.slice(1);
  const rgb = full.match(/../g)!.map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function ratio(a: string, b: string, palette: Record<string, string>) {
  const values = [a, b].map(key => luminance(resolve(palette[key], palette))).sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}

describe.each([["light", light], ["dark", dark]] as const)("%s semantic contrast", (_name, palette) => {
  it("keeps normal financial, status and action text at WCAG AA contrast", () => {
    const pairs = [
      ["--foreground", "--background"], ["--foreground", "--surface"], ["--muted", "--surface"], ["--muted", "--surface-muted"],
      ["--primary-ink", "--primary-soft"], ["--on-primary", "--primary"], ["--on-primary-hover", "--primary-hover"],
      ["--danger", "--surface"], ["--on-danger", "--danger-fill"], ["--success", "--success-soft"],
      ["--warning", "--warning-soft"], ["--info", "--info-soft"], ["--financial-muted", "--financial-background"],
      ["--financial-audit", "--financial-background"], ["--financial-success", "--financial-success-soft"],
      ["--financial-accent", "--primary-soft"], ["--financial-accent", "--financial-detail-surface"],
      ["--account-link", "--surface"], ["--on-avatar-strong", "--avatar-strong"], ["--on-primary-ink", "--primary-ink"],
    ];
    for (const [text, background] of pairs) expect(ratio(text, background, palette), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps focus indicators visible against adjacent surfaces", () => {
    expect(ratio("--focus-ring", "--surface", palette)).toBeGreaterThanOrEqual(3);
    expect(ratio("--field-focus", "--surface", palette)).toBeGreaterThanOrEqual(3);
    expect(ratio("--border-control", "--surface", palette)).toBeGreaterThanOrEqual(3);
    expect(ratio("--checkbox-border", "--surface", palette)).toBeGreaterThanOrEqual(3);
  });
});
