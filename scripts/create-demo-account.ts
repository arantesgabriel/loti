import "dotenv/config";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../src/lib/db/schema";
import { createAuth } from "../src/lib/auth/config";
import { ensurePersonalWorkspaceInTransaction } from "../src/lib/domain/personal-workspaces";
import { developmentDatabaseTarget } from "./development-seed/target";
import { seedVersion, seedWorkspaceId } from "./development-seed/catalog";

const target = developmentDatabaseTarget({
  ...process.env,
  LOTI_DEV_DATABASE_URL: process.env.LOTI_DEV_DATABASE_URL ?? process.env.TURSO_DATABASE_URL,
  LOTI_DEV_DATABASE_AUTH_TOKEN: process.env.LOTI_DEV_DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN,
});
const name = process.env.LOTI_DEMO_ACCOUNT_NAME ?? "Enebinha";
const email = (process.env.LOTI_DEMO_ACCOUNT_EMAIL ?? "enebinha@loti.test").toLowerCase();
const password = process.env.LOTI_DEMO_ACCOUNT_PASSWORD ?? "Enebinha-Demo-2026!";

process.env.BETTER_AUTH_URL = "https://dev.useloti.com";
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.LOTI_EMAIL_MODE = "disabled";

const client = createClient({ url: target.url, authToken: target.token });
const db = drizzle({ client, schema });
try {
  const seedRun = await db.all<{ status: string }>(sql`SELECT status FROM loti_dev_seed_runs WHERE id=${seedVersion}`);
  if (seedRun[0]?.status !== "complete") throw new Error("O seed de demonstração não está completo no banco loti-dev.");

  const created = await db.transaction(async tx => {
    const workspace = await tx.select({ id: schema.workspaces.id, kind: schema.workspaces.kind })
      .from(schema.workspaces).where(eq(schema.workspaces.id, seedWorkspaceId)).get();
    if (!workspace || workspace.kind !== "shared") throw new Error("O grupo sintético do seed não está disponível.");
    if (await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email)).get()) {
      throw new Error("O email de demonstração já existe. Nenhuma senha ou associação foi alterada.");
    }

    const member = (await createAuth(tx, true).api.signUpEmail({ body: { name, email, password } })).user;
    const now = new Date();
    await tx.insert(schema.workspaceMembers).values({ workspaceId: workspace.id, userId: member.id, createdAt: now }).run();
    await tx.insert(schema.userPreferences).values({
      userId: member.id, activeWorkspaceId: workspace.id, favoritesView: "list", createdAt: now, updatedAt: now,
    }).run();
    await ensurePersonalWorkspaceInTransaction(tx, member.id);
    return { name: member.name, email: member.email };
  }, { behavior: "immediate" });

  console.log(JSON.stringify({ status: "created", ...created, workspace: "loti-development-v1" }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha ao criar a conta de demonstração.");
  process.exitCode = 1;
} finally {
  client.close();
}
