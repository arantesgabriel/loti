import "dotenv/config";
import { existsSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { relative, resolve } from "node:path";
import { createServer } from "node:http";
// Local fake provider: synthetic addresses only; never contact Resend during E2E.
if (process.env.VERCEL === "1") throw new Error("The disposable E2E server cannot run on Vercel.");
const mailbox: { to: string[]; text: string; html: string }[] = [];
const mailServer = createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/emails") {
    let body = "";
    for await (const chunk of request) { body += chunk; if (body.length > 100_000) { response.writeHead(413).end(); return; } }
    const message = JSON.parse(body);
    const recipients: string[] = Array.isArray(message.to) ? message.to : [message.to];
    if (!recipients.every(value => /^[a-zA-Z0-9._-]+@loti\.test$/.test(value))) { response.writeHead(400).end(); return; }
    mailbox.push({ ...message, to: recipients });
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ id: crypto.randomUUID() }));
  } else if (request.method === "GET" && request.headers["x-loti-test-mailbox"] === "disposable-local-only") {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(mailbox));
  } else response.writeHead(404).end();
});
await new Promise<void>(resolve => mailServer.listen(3101, "localhost", resolve));
process.env.LOTI_EMAIL_MODE = "resend";
process.env.RESEND_API_KEY = "re_disposable_local_test_only";
process.env.LOTI_EMAIL_TEST_API_URL = "http://localhost:3101";
process.env.LOTI_EMAIL_TEST_RECIPIENTS = "new-invite@loti.test,session-recovery@loti.test,existing-invite@loti.test,reset-email-e2e@loti.test";
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
const requestedNextDir = process.env.LOTI_E2E_NEXT_DIR;
if (requestedNextDir && !/^\.next(?:-[a-z0-9-]+)?$/.test(requestedNextDir)) throw new Error("Invalid isolated E2E build directory.");
process.env.LOTI_NEXT_DIR = requestedNextDir ?? (productionE2e ? ".next" : ".next-e2e-auth-email");
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
  // This fixture represents a previously verified account; no production user is updated.
  await invitationFixture.db.update(user).set({ emailVerified: true }).where(eq(user.email, "existing-invite@loti.test")).run();
  await createAuth(invitationFixture.db, true).api.signUpEmail({ body: { name: "Reset Email QA", email: "reset-email-e2e@loti.test", password: "Reset-Email-E2E-2026!" } });
  await createAuth(invitationFixture.db, true).api.signUpEmail({ body: { name: "Profile QA", email: "profile-qa@loti.test", password: "Profile-QA-Old-2026!" } });
  await createAuth(invitationFixture.db, true).api.signUpEmail({ body: { name: "Profile Reader QA", email: "profile-reader@loti.test", password: "Profile-Reader-2026!" } });
  const qa = await invitationFixture.db.select({ id: user.id }).from(user).where(eq(user.email, "profile-qa@loti.test")).get();
  const reader = await invitationFixture.db.select({ id: user.id }).from(user).where(eq(user.email, "profile-reader@loti.test")).get();
  if (!qa || !reader) throw new Error("The isolated profile E2E members could not be provisioned.");
  const workspaceId = "profile-qa-workspace", createdAt = new Date();
  await invitationFixture.db.insert(workspaces).values({ id: workspaceId, name: "Perfil QA", createdAt }).run();
  await invitationFixture.db.insert(workspaceMembers).values([{ workspaceId, userId: qa.id, createdAt }, { workspaceId, userId: reader.id, createdAt }]).run();
} finally { invitationFixture.client.close(); }

const closeQcFixture = process.env.LOTI_E2E_QC_VIEWER === "1" ? await (await import("./qc-viewer-fixture")).startQcViewerFixture() : null;
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...(productionE2e ? ["start"] : ["dev", "--webpack"]), "-H", "localhost", "-p", "3100"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", code => {
  closeQcFixture?.();
  mailServer.close();
  if (explicitE2eDatabasePath) rmSync(explicitE2eDatabasePath, { force: true });
  process.exit(code ?? 0);
});
