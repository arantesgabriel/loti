// Isolated browser QA only: no dotenv, no existing database, no external email.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
const filename = `data/e2e-refunds-onboarding-${crypto.randomUUID()}.sqlite`;
if (existsSync(resolve(filename))) throw new Error("Fresh QA target required.");
Object.assign(process.env, { TURSO_DATABASE_URL: `file:./${filename}`, TURSO_AUTH_TOKEN: "", BETTER_AUTH_URL: "http://localhost:3120",
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64url"), LOTI_EMAIL_MODE: "disabled", RESEND_API_KEY: "", VERCEL: "", VERCEL_ENV: "",
  LOTI_NEXT_DIR: process.env.LOTI_ONBOARDING_QA_PRODUCTION === "1" ? ".next-onboarding-release" : ".next-onboarding-qa" });
for (const key of ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_WRITE_ACCESS_KEY_ID", "R2_WRITE_SECRET_ACCESS_KEY", "R2_READ_ACCESS_KEY_ID", "R2_READ_SECRET_ACCESS_KEY"]) process.env[key] = "";
const { openDatabase } = await import("../src/lib/db/connection");
const { migrate } = await import("drizzle-orm/libsql/migrator");
const { createAuth } = await import("../src/lib/auth/config");
const { ensurePersonalWorkspace } = await import("../src/lib/domain/personal-workspaces");
const schema = await import("../src/lib/db/schema");
const { eq } = await import("drizzle-orm");
const connection = openDatabase();
try {
  await migrate(connection.db, { migrationsFolder: "./drizzle" });
  const auth = createAuth(connection.db, true);
  for (const name of ["onboarding-new", "onboarding-other", "onboarding-old", "onboarding-pending", "onboarding-blank", "onboarding-deep", "onboarding-conflict", "onboarding-invite-pause", ...[320, 390, 768, 1440, 1920].map(width => `onboarding-matrix${width}`)]) {
    const result = await auth.api.signUpEmail({ body: { name: "Synthetic onboarding QA", email: `${name}@loti.test`, password: "Onboarding-QA-Only-2026!" } });
    const id = result.user.id;
    if (name !== "onboarding-pending") await connection.db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, id)).run();
    await ensurePersonalWorkspace(connection.db, id);
    if (name !== "onboarding-old") await connection.db.insert(schema.accountActivationRequirements).values({ userId: id, source: "public_signup", createdAt: new Date() }).run();
  }
} finally { connection.client.close(); }
console.log(JSON.stringify({ qaDatabase: filename, origin: "http://localhost:3120", synthetic: true }));
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...(process.env.LOTI_ONBOARDING_QA_PRODUCTION === "1" ? ["start"] : ["dev", "--webpack"]), "-H", "localhost", "-p", "3120"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
