import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { fixture } from "./helpers";
import { authEmailDeliveries, authLimits } from "@/lib/db/schema";

it("shares atomic counters and delivery claims across independent processes", async () => {
  await mkdir(resolve("data"), { recursive: true });
  const directory = await mkdtemp(resolve("data/auth-email-races-"));
  const url = `file:${join(directory, "auth.sqlite").replaceAll("\\", "/")}`;
  const first = await fixture(url), execute = promisify(execFile);
  const run = async (operation: string) => {
    const result = await execute(process.execPath, ["--import", "tsx", "tests/integration/auth-email-worker.ts"], { env: { ...process.env, BETTER_AUTH_URL: "http://localhost:3000", LOTI_AUTH_RACE_DATABASE: url, LOTI_AUTH_RACE_OPERATION: operation }, timeout: 30000 });
    return JSON.parse(result.stdout.trim().split("\n").at(-1)!) as { admitted?: number; state?: string; providerCalls?: number };
  };
  try {
    const counts = await Promise.all([run("counter"), run("counter")]);
    expect(counts.reduce((sum, result) => sum + (result.admitted ?? 0), 0)).toBeLessThanOrEqual(3);
    // SQLITE_BUSY may fail closed on local SQLite. A later independent request
    // fills unused capacity; persisted counts must never exceed the shared limit.
    await run("counter");
    expect((await first.db.select().from(authLimits).all()).reduce((sum, row) => sum + row.count, 0)).toBe(3);
    const results = await Promise.all([run("email"), run("email")]);
    expect(results.reduce((sum, result) => sum + (result.providerCalls ?? 0), 0)).toBeLessThanOrEqual(1);
    const retry = await run("email");
    expect([...results, retry].reduce((sum, result) => sum + (result.providerCalls ?? 0), 0)).toBe(1);
    expect((await run("email")).state).toBe("duplicate");
    expect(await first.db.select().from(authEmailDeliveries).all()).toHaveLength(1);
  } finally {
    first.client.close();
    // Windows libSQL can retain native file handles until worker exit. This unique
    // disposable directory stays under ignored data/, like other process-race fixtures.
  }
}, 60000);
