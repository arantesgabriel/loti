import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { user, workspaces, workspaceMembers } from "@/lib/db/schema";
import { createServices } from "@/lib/domain/services";

export async function fixture() {
  const { db, client } = openDatabase(":memory:");
  await migrate(db, { migrationsFolder: "./drizzle" });
  const now = new Date();
  await db.insert(user).values(["alice", "bob", "outsider", "foreign"].map(id => ({ id, name: id, email: `${id}@test.local`, emailVerified: true, createdAt: now, updatedAt: now }))).run();
  await db.insert(workspaces).values([{ id: "workspace", name: "Loti", createdAt: now }, { id: "other", name: "Other", createdAt: now }]).run();
  await db.insert(workspaceMembers).values([{ workspaceId: "workspace", userId: "alice", createdAt: now }, { workspaceId: "workspace", userId: "bob", createdAt: now }, { workspaceId: "other", userId: "foreign", createdAt: now }]).run();
  return { db, client, alice: createServices(db, "alice"), bob: createServices(db, "bob"), outsider: createServices(db, "outsider"), foreign: createServices(db, "foreign") };
}

export type Fixture = Awaited<ReturnType<typeof fixture>>;
export const favorite = { name: "Nike Vomero", url: "https://weidian.com/item.html?itemID=1&spm=x", priceCents: 12500, variant: "42" };
