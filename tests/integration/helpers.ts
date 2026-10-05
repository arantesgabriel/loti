import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDatabase } from "@/lib/db/connection";
import { user, workspaces, workspaceMembers } from "@/lib/db/schema";
import { createServices } from "@/lib/domain/services";
export function fixture() {
  const { db, sqlite } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  const now = new Date();
  for (const id of ["alice", "bob", "outsider", "foreign"]) db.insert(user).values({ id, name: id, email: `${id}@test.local`, emailVerified: true, createdAt: now, updatedAt: now }).run();
  db.insert(workspaces).values([{ id: "workspace", name: "Loti", createdAt: now }, { id: "other", name: "Other", createdAt: now }]).run();
  for (const id of ["alice", "bob"]) db.insert(workspaceMembers).values({ workspaceId: "workspace", userId: id, createdAt: now }).run();
  db.insert(workspaceMembers).values({ workspaceId: "other", userId: "foreign", createdAt: now }).run();
  return { db, sqlite, alice: createServices(db, "alice"), bob: createServices(db, "bob"), outsider: createServices(db, "outsider"), foreign: createServices(db, "foreign") };
}
export const favorite = { name: "Nike Vomero", url: "https://weidian.com/item.html?itemID=1&spm=x", priceCents: 12500, variant: "42" };
