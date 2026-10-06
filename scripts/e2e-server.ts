import "dotenv/config";
import { rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
process.env.TURSO_DATABASE_URL = "file:./data/e2e.sqlite";
process.env.BETTER_AUTH_URL = "http://localhost:3100";
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.LOTI_NEXT_DIR = ".next-e2e";
rmSync("./data/e2e.sqlite", { force: true });
await import("./seed");
// An existing credential account without group membership exercises invitation login.
const { openDatabase } = await import("../src/lib/db/connection");
const { createAuth } = await import("../src/lib/auth/config");
const invitationFixture = openDatabase();
try {
  await createAuth(invitationFixture.db, true).api.signUpEmail({ body: { name: "Existing invite account", email: "existing-invite@loti.test", password: "Loti-Dev-Only-2026!" } });
} finally { invitationFixture.client.close(); }

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", "3100"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
