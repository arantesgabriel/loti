import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";
import { openDatabase } from "@/lib/db/connection";
import { collections, favorites, purchases, purchaseItems, user, userPreferences, workspaceInvitations, workspaceMembers, workspaces } from "@/lib/db/schema";
import { ensurePersonalWorkspace } from "@/lib/domain/personal-workspaces";

it("upgrades a populated database without changing group IDs, links, invitations or active preferences", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loti-personal-migration-"));
  const { db, client } = openDatabase(":memory:");
  try {
    const oldMigrations = join(directory, "old");
    await mkdir(join(oldMigrations, "meta"), { recursive: true });
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    journal.entries = journal.entries.slice(0, -1);
    await writeFile(join(oldMigrations, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries) await copyFile(`drizzle/${entry.tag}.sql`, join(oldMigrations, `${entry.tag}.sql`));
    await migrate(db, { migrationsFolder: oldMigrations });

    const now = Date.now();
    await client.execute({ sql: "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)", args: ["legacy", "Pessoa antiga", "legacy@test.local", 1, now, now] });
    await client.execute({ sql: "INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)", args: ["legacy-group", "Grupo antigo", now] });
    await client.execute({ sql: "INSERT INTO workspace_members (workspace_id,user_id,created_at) VALUES (?,?,?)", args: ["legacy-group", "legacy", now] });
    await client.execute({ sql: "INSERT INTO user_preferences (user_id,favorites_view,active_workspace_id,created_at,updated_at) VALUES (?,?,?,?,?)", args: ["legacy", "cards", "legacy-group", now, now] });
    await client.execute({ sql: "INSERT INTO collections (id,workspace_id,owner_id,name,created_at,updated_at) VALUES (?,?,?,?,?,?)", args: ["collection", "legacy-group", "legacy", "Guardados", now, now] });
    await client.execute({ sql: "INSERT INTO favorites (id,workspace_id,owner_id,collection_id,name,url,platform,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", args: ["favorite", "legacy-group", "legacy", "collection", "Favorito antigo", "https://example.com/item", "other", now, now] });
    await client.execute({ sql: "INSERT INTO purchases (id,workspace_id,name,status,created_by,created_at,finalized_at) VALUES (?,?,?,?,?,?,?)", args: ["purchase", "legacy-group", "Compra antiga", "finalized", "legacy", now, now] });
    await client.execute({ sql: "INSERT INTO purchase_items (id,purchase_id,person_id,created_by,name,url,platform,visual_key,quantity,unit_price_cents,cart_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", args: ["item", "purchase", "legacy", "legacy", "Snapshot antigo", "https://example.com/item", "other", "generic", 1, 12500, "added", now, now] });
    await client.execute({ sql: "INSERT INTO workspace_invitations (id,workspace_id,email,token_hash,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?)", args: ["invite", "legacy-group", "future@test.local", "hash", "legacy", now, now + 60_000] });

    await migrate(db, { migrationsFolder: "./drizzle" });
    await migrate(db, { migrationsFolder: "./drizzle" });

    expect(await db.select().from(workspaces).where(eq(workspaces.id, "legacy-group")).get()).toMatchObject({ kind: "shared", ownerUserId: null });
    expect(await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, "legacy-group")).all()).toHaveLength(1);
    expect(await db.select().from(collections).where(eq(collections.id, "collection")).get()).toMatchObject({ workspaceId: "legacy-group" });
    expect(await db.select().from(favorites).where(eq(favorites.id, "favorite")).get()).toMatchObject({ workspaceId: "legacy-group", collectionId: "collection" });
    expect(await db.select().from(purchases).where(eq(purchases.id, "purchase")).get()).toMatchObject({ workspaceId: "legacy-group", status: "finalized" });
    expect(await db.select().from(purchaseItems).where(eq(purchaseItems.id, "item")).get()).toMatchObject({ purchaseId: "purchase", name: "Snapshot antigo", unitPriceCents: 12500 });
    expect(await db.select().from(userPreferences).where(eq(userPreferences.userId, "legacy")).get()).toMatchObject({ favoritesView: "cards", activeWorkspaceId: "legacy-group" });
    expect(await db.select().from(workspaceInvitations).where(eq(workspaceInvitations.id, "invite")).get()).toMatchObject({ workspaceId: "legacy-group", email: "future@test.local" });
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);

    const personal = await ensurePersonalWorkspace(db, "legacy");
    expect(personal.created).toBe(true);
    expect((await db.select().from(userPreferences).where(eq(userPreferences.userId, "legacy")).get())?.activeWorkspaceId).toBe("legacy-group");
  } finally {
    client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("applies the personal workspace schema to an empty database and safely repeats migration", async () => {
  const { db, client } = openDatabase(":memory:");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await migrate(db, { migrationsFolder: "./drizzle" });
    const now = new Date();
    await db.insert(user).values({ id: "new-user", name: "Nova conta", email: "new@test.local", emailVerified: true, createdAt: now, updatedAt: now }).run();
    const personal = await ensurePersonalWorkspace(db, "new-user");
    expect(personal.workspace).toMatchObject({ kind: "personal", ownerUserId: "new-user" });
    expect(await db.select().from(workspaces).where(and(eq(workspaces.ownerUserId, "new-user"), eq(workspaces.kind, "personal"))).all()).toHaveLength(1);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  } finally { client.close(); }
});
