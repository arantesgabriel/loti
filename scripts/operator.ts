import { eq } from "drizzle-orm";
import type { AppDatabase } from "../src/lib/db/connection";
import { workspaces, workspaceMembers, user } from "../src/lib/db/schema";
import { createAuth } from "../src/lib/auth/config";
export async function createMember(db: AppDatabase, input: { name: string; email: string; password: string }) {
  const existing = db.select().from(user).where(eq(user.email, input.email.toLowerCase())).get();
  const member = existing ?? (await createAuth(db, true).api.signUpEmail({ body: { ...input, email: input.email.toLowerCase() } })).user;
  db.transaction(() => {
    let workspace = db.select().from(workspaces).get();
    if (!workspace) workspace = db.insert(workspaces).values({ id: "loti", name: "Loti", createdAt: new Date() }).returning().get()!;
    db.insert(workspaceMembers).values({ workspaceId: workspace.id, userId: member.id, createdAt: new Date() }).onConflictDoNothing().run();
  });
  return member;
}
