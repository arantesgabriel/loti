import { eq } from "drizzle-orm";
import type { AppDatabase } from "../src/lib/db/connection";
import { workspaces, workspaceMembers, user } from "../src/lib/db/schema";
import { createAuth } from "../src/lib/auth/config";
export async function createMember(db: AppDatabase, input: { name: string; email: string; password: string }) {
  const existing = await db.select().from(user).where(eq(user.email, input.email.toLowerCase())).get();
  const member = existing ?? (await createAuth(db, true).api.signUpEmail({ body: { ...input, email: input.email.toLowerCase() } })).user;
  await db.transaction(async tx => {
    const workspace = await tx.select().from(workspaces).get() ?? await tx.insert(workspaces).values({ id: "loti", name: "Loti", createdAt: new Date() }).returning().get();
    if (!workspace) throw new Error("Não foi possível criar o espaço Loti.");
    await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: member.id, createdAt: new Date() }).onConflictDoNothing().run();
  });
  return member;
}
