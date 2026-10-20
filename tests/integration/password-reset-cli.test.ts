import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";

const execute = promisify(execFile);

it("executes the reset CLI against a disposable file and fails without exposing secrets", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loti-password-reset-"));
  const url = `file:${join(directory, "db.sqlite")}`;
  const email = "reset-cli@loti.test";
  const password = "CLI-New-Password-2026!";
  const env = { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: "", LOTI_USER_PASSWORD: password, DOTENV_CONFIG_PATH: join(directory, "absent.env") };
  try {
    // Separate processes release native SQLite file handles before Windows cleanup.
    await execute(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import { migrate } from "drizzle-orm/libsql/migrator";
      import { openDatabase } from "./src/lib/db/connection.ts";
      import { createAuth } from "./src/lib/auth/config.ts";
      const { db, client } = openDatabase(process.env.TURSO_DATABASE_URL);
      try {
        await migrate(db, { migrationsFolder: "./drizzle" });
        const auth = createAuth(db, true);
        const body = { name: "CLI QA", email: "reset-cli@loti.test", password: "CLI-Old-Password-2026!" };
        await auth.api.signUpEmail({ body });
        await auth.api.signInEmail({ body });
      } finally { client.close(); }
    `], { env });
    const result = await execute(process.execPath, ["--import", "tsx", "scripts/reset-password.ts", "--email", email], { env });
    expect(result.stdout).toContain("Senha redefinida");
    expect(result.stdout).toContain("Sessões encerradas: 1");
    expect(result.stdout + result.stderr).not.toContain(password);

    for (const invalidEnv of [{ ...env, TURSO_DATABASE_URL: "" }, { ...env, LOTI_USER_PASSWORD: "short" }]) {
      try {
        await execute(process.execPath, ["--import", "tsx", "scripts/reset-password.ts", "--email", email], { env: invalidEnv });
        expect.fail("Invalid configuration should fail");
      } catch (error) {
        const failure = error as Error & { code: number; stdout: string; stderr: string };
        expect(failure.code).toBe(1);
        expect(failure.stdout + failure.stderr).not.toContain(invalidEnv.LOTI_USER_PASSWORD);
      }
    }
    const verified = await execute(process.execPath, ["--import", "tsx", "--input-type=module", "-e", `
      import { createClient } from "@libsql/client";
      import { verifyPassword } from "better-auth/crypto";
      const client = createClient({ url: process.env.TURSO_DATABASE_URL });
      try {
        const account = (await client.execute("SELECT password FROM account")).rows[0];
        const sessions = (await client.execute("SELECT count(*) AS total FROM session")).rows[0];
        console.log(JSON.stringify({ valid: await verifyPassword({ hash: account.password, password: process.env.LOTI_USER_PASSWORD }), sessions: sessions.total }));
      } finally { client.close(); }
    `], { env });
    expect(JSON.parse(verified.stdout.trim())).toEqual({ valid: true, sessions: 0 });
  } finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !directory.includes("loti-password-reset-")) throw new Error("Unexpected test directory");
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
