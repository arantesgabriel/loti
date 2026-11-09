import { migrate } from "drizzle-orm/libsql/migrator";
import { sql } from "drizzle-orm";
import { openDatabase } from "@/lib/db/connection";
import { user, workspaces, workspaceMembers } from "@/lib/db/schema";
import { createServices } from "@/lib/domain/services";
import { initializeLegacyPurchaseCosts } from "@/lib/domain/purchase-cost-initialization";
import { legacyMigrationsFolder } from "../fixtures/orders-transition/legacy-migrations";

type DatabaseConnection = ReturnType<typeof openDatabase>;

export async function insertSharedWorkspaces(connection: DatabaseConnection, rows: { id: string; name: string; createdAt: Date }[]) {
  const columns = await connection.db.all<{ name: string }>(sql`PRAGMA table_info(workspaces)`);
  if (columns.some(column => column.name === "kind")) {
    await connection.db.insert(workspaces).values(rows.map(row => ({ ...row, kind: "shared" as const, ownerUserId: null }))).run();
    return;
  }

  const tuples = rows.map(() => "(?,?,?)").join(",");
  const args = rows.flatMap(row => [row.id, row.name, row.createdAt.getTime()]);
  await connection.client.execute({ sql: `INSERT INTO workspaces (id,name,created_at) VALUES ${tuples}`, args });
}

export async function fixture(url = ":memory:", workflow: "legacy" | "orders" = "legacy", connectionOptions?:Parameters<typeof openDatabase>[1]) {
  const { db, client } = openDatabase(url,connectionOptions);
  await migrate(db, { migrationsFolder: workflow === "legacy" ? legacyMigrationsFolder() : "./drizzle" });
  const now = new Date();
  await db.insert(user).values(["alice", "bob", "outsider", "foreign"].map(id => ({ id, name: id, email: `${id}@test.local`, emailVerified: true, createdAt: now, updatedAt: now }))).run();
  await insertSharedWorkspaces({ db, client }, [{ id: "workspace", name: "Loti", createdAt: now }, { id: "other", name: "Other", createdAt: now }]);
  await db.insert(workspaceMembers).values([{ workspaceId: "workspace", userId: "alice", createdAt: now }, { workspaceId: "workspace", userId: "bob", createdAt: now }, { workspaceId: "other", userId: "foreign", createdAt: now }]).run();
  const initializer = workflow === "legacy" ? initializeLegacyPurchaseCosts : undefined;
  return { db, client, alice: createServices(db, "alice",initializer), bob: createServices(db, "bob",initializer), outsider: createServices(db, "outsider",initializer), foreign: createServices(db, "foreign",initializer) };
}

export type Fixture = Awaited<ReturnType<typeof fixture>>;
export const favorite = { name: "Nike Vomero", url: "https://weidian.com/item.html?itemID=1&spm=x", priceCents: 12500, variant: "42" };
