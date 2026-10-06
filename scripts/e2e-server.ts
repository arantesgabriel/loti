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

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--webpack", "-p", "3100"], { stdio: "inherit", env: process.env });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
