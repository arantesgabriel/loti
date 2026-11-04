import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "../src/lib/db/connection";
import { workspaces, workspaceMembers, user } from "../src/lib/db/schema";
import { createAuth } from "../src/lib/auth/config";

type WorkspaceQuery = Pick<AppDatabase, "all">;
async function sharedWorkspaceId(db: WorkspaceQuery) {
  const columns = await db.all<{ name: string }>(sql`PRAGMA table_info(workspaces)`);
  const hasKind = columns.some(column => column.name === "kind");
  const rows = hasKind
    ? await db.all<{ id: string }>(sql`SELECT id FROM workspaces WHERE kind = 'shared' ORDER BY created_at LIMIT 2`)
    : await db.all<{ id: string }>(sql`SELECT id FROM workspaces ORDER BY created_at LIMIT 2`);
  if (rows.length > 1) throw new Error("Há mais de um grupo compartilhado. Use o convite do grupo pretendido em vez do comando de bootstrap.");
  return { id: rows[0]?.id ?? null, hasKind };
}

export async function createMember(db: AppDatabase, input: { name: string; email: string; password: string }) {
  const existing = await db.select().from(user).where(eq(user.email, input.email.toLowerCase())).get();
  await sharedWorkspaceId(db);
  const member = existing ?? (await createAuth(db, true).api.signUpEmail({ body: { ...input, email: input.email.toLowerCase() } })).user;
  await db.transaction(async tx => {
    const current = await sharedWorkspaceId(tx);
    let workspaceId = current.id;
    if (!workspaceId) {
      workspaceId = "loti";
      const now = new Date();
      if (current.hasKind) await tx.insert(workspaces).values({ id: workspaceId, name: "Loti", kind: "shared", ownerUserId: null, createdAt: now }).run();
      else await tx.run(sql`INSERT INTO workspaces (id, name, created_at) VALUES (${workspaceId}, 'Loti', ${now.getTime()})`);
    }
    await tx.insert(workspaceMembers).values({ workspaceId, userId: member.id, createdAt: new Date() }).onConflictDoNothing().run();
  });
  return member;
}
