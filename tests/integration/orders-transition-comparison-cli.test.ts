import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

describe("orders comparison CLI baseline requirement", () => {
  it.each([undefined, "not-json", JSON.stringify({ scenario: "orders-transition-v1", passed: true, inventory: {} })])("rejects absent, invalid or old baseline before touching the database: %s", async content => {
    const path = resolve(`data/orders-transition-cli-${randomUUID()}.sqlite`);
    const data = resolve("data");
    if (!path.startsWith(`${data}/`) && !path.startsWith(`${data}\\`)) throw new Error("Fixture path escaped data.");
    mkdirSync(data, { recursive: true });
    writeFileSync(path, "not-a-database-do-not-open", { flag: "wx" });
    writeFileSync(`${path}.scenario.json`, JSON.stringify({ scenarioId: "orders-transition-v1", databasePath: path, state: "complete" }), { flag: "wx" });
    if (content !== undefined) writeFileSync(`${path}.baseline.json`, content, { flag: "wx" });
    const env = { ...process.env, TURSO_DATABASE_URL: `file:${path.replaceAll("\\", "/")}`, TURSO_AUTH_TOKEN: "", VERCEL: "", NODE_ENV: "test" as const, RESEND_API_KEY: "", R2_ACCOUNT_ID: "", R2_BUCKET_NAME: "", R2_WRITE_ACCESS_KEY_ID: "", R2_WRITE_SECRET_ACCESS_KEY: "", R2_READ_ACCESS_KEY_ID: "", R2_READ_SECRET_ACCESS_KEY: "" };
    try {
      await expect(promisify(execFile)(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/compare-orders-transition.ts", "--database", env.TURSO_DATABASE_URL], { cwd: process.cwd(), env, timeout: 30000 })).rejects.toThrow(/baseline/i);
      expect(readFileSync(path, "utf8")).toBe("not-a-database-do-not-open");
      if (content !== undefined) expect(readFileSync(`${path}.baseline.json`, "utf8")).toBe(content);
    } finally {
      unlinkSync(path);
      unlinkSync(`${path}.scenario.json`);
      if (content !== undefined) unlinkSync(`${path}.baseline.json`);
    }
  }, 40000);
});
