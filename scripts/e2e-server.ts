import "dotenv/config";
import { existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { relative, resolve } from "node:path";
const explicitE2eDatabaseUrl = process.env.LOTI_E2E_DATABASE_URL;
let explicitE2eDatabasePath: string | null = null;
if (explicitE2eDatabaseUrl) {
  if (!explicitE2eDatabaseUrl.startsWith("file:./data/e2e-refunds-")) throw new Error("LOTI_E2E_DATABASE_URL must target a new file under data/e2e-refunds-*.sqlite.");
  explicitE2eDatabasePath = resolve(explicitE2eDatabaseUrl.slice("file:".length));
  const dataPath = resolve("data");
  const pathFromData = relative(dataPath, explicitE2eDatabasePath);
  if (!/^e2e-refunds-[a-zA-Z0-9_-]+\.sqlite$/.test(pathFromData)) throw new Error("The E2E database path must be a new e2e-refunds-*.sqlite file directly under data/.");
  if (existsSync(explicitE2eDatabasePath)) throw new Error("The explicitly selected E2E database already exists; choose a fresh disposable path.");
  process.env.TURSO_DATABASE_URL = explicitE2eDatabaseUrl;
} else {
  process.env.TURSO_DATABASE_URL = "file:./data/e2e.sqlite";
  rmSync("./data/e2e.sqlite", { force: true });
}
process.env.BETTER_AUTH_URL = "http://localhost:3100";
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
const productionE2e = process.env.LOTI_E2E_PRODUCTION === "1";
process.env.LOTI_NEXT_DIR = productionE2e ? ".next" : ".next-e2e";
for (const name of ["R2_ACCOUNT_ID", "R2_BUCKET_NAME", "R2_WRITE_ACCESS_KEY_ID", "R2_WRITE_SECRET_ACCESS_KEY", "R2_READ_ACCESS_KEY_ID", "R2_READ_SECRET_ACCESS_KEY"]) process.env[name] = "";
await import("./seed");
// Configure the exact seeded Better Auth ID as the QC manager only in this
// disposable E2E process; production/dev configuration remains untouched.
const { openDatabase } = await import("../src/lib/db/connection");
const qcManagerFixture = openDatabase();
try {
  const { user } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const manager = await qcManagerFixture.db.select({ id: user.id }).from(user).where(eq(user.email, "gabriel@loti.test")).get();
  if (!manager) throw new Error("The isolated QC E2E manager could not be provisioned.");
  process.env.LOTI_QC_MANAGER_USER_ID = manager.id;
} finally { qcManagerFixture.client.close(); }
// An existing credential account without group membership exercises invitation login.
const { createAuth } = await import("../src/lib/auth/config");
const invitationFixture = openDatabase();
try {
  await createAuth(invitationFixture.db, true).api.signUpEmail({ body: { name: "Existing invite account", email: "existing-invite@loti.test", password: "Loti-Dev-Only-2026!" } });
  const { user, workspaces, workspaceMembers } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await createAuth(invitationFixture.db, true).api.signUpEmail({ body: { name: "Profile QA", email: "profile-qa@loti.test", password: "Profile-QA-Old-2026!" } });
  await createAuth(invitationFixture.db, true).api.signUpEmail({ body: { name: "Profile Reader QA", email: "profile-reader@loti.test", password: "Profile-Reader-2026!" } });
  const qa = await invitationFixture.db.select({ id: user.id }).from(user).where(eq(user.email, "profile-qa@loti.test")).get();
  const reader = await invitationFixture.db.select({ id: user.id }).from(user).where(eq(user.email, "profile-reader@loti.test")).get();
  if (!qa || !reader) throw new Error("The isolated profile E2E members could not be provisioned.");
  const workspaceId = "profile-qa-workspace", createdAt = new Date();
  await invitationFixture.db.insert(workspaces).values({ id: workspaceId, name: "Perfil QA", createdAt }).run();
  await invitationFixture.db.insert(workspaceMembers).values([{ workspaceId, userId: qa.id, createdAt }, { workspaceId, userId: reader.id, createdAt }]).run();
} finally { invitationFixture.client.close(); }

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...(productionE2e ? ["start"] : ["dev", "--webpack"]), "-H", "localhost", "-p", "3100"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", code => {
  if (explicitE2eDatabasePath) rmSync(explicitE2eDatabasePath, { force: true });
  process.exit(code ?? 0);
});
