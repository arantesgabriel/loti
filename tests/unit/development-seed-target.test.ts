import { describe, expect, it } from "vitest";
import { developmentSeedTarget } from "../../scripts/development-seed/target";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { migrationHashMatches } from "../../scripts/development-seed/migrations";

const valid = { LOTI_DEV_DATABASE_URL: "libsql://loti-dev-example.turso.io", LOTI_DEV_DATABASE_AUTH_TOKEN: "synthetic-dev-token", LOTI_DEV_SEED_PASSWORD: "Development-only-password-2026" };
describe("development seed destination", () => {
  it("accepts equivalent Windows/Actions migration line endings, never changed SQL", () => {
    const source = "CREATE TABLE example(id TEXT);\n-- migration\n";
    const hash = (text: string) => createHash("sha256").update(text).digest("hex");
    expect(migrationHashMatches(source.replaceAll("\n", "\r\n"), hash(source))).toBe(true);
    expect(migrationHashMatches(source, hash(source.replaceAll("\n", "\r\n")))).toBe(true);
    expect(migrationHashMatches(source + "DROP TABLE example;", hash(source))).toBe(false);
    expect(migrationHashMatches(source, undefined)).toBe(false);
  });
  it("accepts only explicit dev credentials and does not fall back to app secrets", () => {
    expect(developmentSeedTarget(valid).url).toBe("libsql://loti-dev-example.turso.io");
    expect(() => developmentSeedTarget({ TURSO_DATABASE_URL: valid.LOTI_DEV_DATABASE_URL, TURSO_AUTH_TOKEN: "other" })).toThrow(/LOTI_DEV_DATABASE_URL/);
    expect(() => developmentSeedTarget({ ...valid, LOTI_DEV_DATABASE_AUTH_TOKEN: "" })).toThrow(/AUTH_TOKEN/);
    expect(() => developmentSeedTarget({ ...valid, LOTI_DEV_SEED_PASSWORD: "short" })).toThrow(/16 a 128/);
  });
  it.each([
    "libsql://loti-prod-example.turso.io", "libsql://loti-dev-example.turso.io.attacker.example",
    "https://loti-dev-example.turso.io", "file:./data/loti.sqlite", "libsql://loti-dev-example.turso.io/path",
    "libsql://user:pass@loti-dev-example.turso.io", "libsql://loti-dev-example.turso.io?auth=secret",
    "libsql://loti-dev-example.turso.io:8080", "libsql://loti-dev-example.turso.io#fragment",
  ])("refuses %s", url => expect(() => developmentSeedTarget({ ...valid, LOTI_DEV_DATABASE_URL: url })).toThrow(/bloqueado/));
  it("rejects production, hosted runtimes and non-dev Actions refs", () => {
    for (const flags of [{ NODE_ENV: "production" }, { VERCEL: "1" }, { VERCEL_ENV: "production" }, { GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/main" }]) {
      expect(() => developmentSeedTarget({ ...valid, ...flags })).toThrow();
    }
    expect(developmentSeedTarget({ ...valid, GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/dev" })).toBeTruthy();
  });
  it("CLI plan stays offline even with production app credentials present", () => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/seed-development.ts", "--plan"], {
      encoding: "utf8", windowsHide: true,
      env: { ...process.env, TURSO_DATABASE_URL: "libsql://loti-prod-never-contact.turso.io", TURSO_AUTH_TOKEN: "never-print-this-token" },
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ mode: "plan-only", writes: false, favorites: 50 });
    expect(result.stdout + result.stderr).not.toContain("never-print-this-token");
  });
  it("CLI apply fails before importing database providers for a production target", () => {
    const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/seed-development.ts", "--apply"], {
      encoding: "utf8", windowsHide: true,
      env: { ...process.env, ...valid, GITHUB_ACTIONS: "", GITHUB_REF: "", VERCEL: "", VERCEL_ENV: "", NODE_ENV: "test", LOTI_DEV_DATABASE_URL: "libsql://loti-prod-never-contact.turso.io", LOTI_DEV_DATABASE_AUTH_TOKEN: "never-print-this-token" },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("bloqueado");
    expect(result.stdout + result.stderr).not.toContain("never-print-this-token");
  });
});
