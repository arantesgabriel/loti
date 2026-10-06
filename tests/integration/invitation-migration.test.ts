import { mkdtemp, mkdir, copyFile, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { openDatabase } from "@/lib/db/connection";
import { favorites, user, userPreferences, workspaceInvitations, workspaceMembers, workspaces } from "@/lib/db/schema";
it("upgrades an existing database without changing records and repeats safely", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loti-migration-"));
  const { db, client } = openDatabase(`file:${join(directory, "db.sqlite")}`);
  try {
    const oldMigrations = join(directory, "old");
    await mkdir(join(oldMigrations, "meta"), { recursive: true });
    await copyFile("drizzle/0000_lean_sir_ram.sql", join(oldMigrations, "0000_lean_sir_ram.sql"));
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    journal.entries = journal.entries.slice(0, 1);
    await writeFile(join(oldMigrations, "meta/_journal.json"), JSON.stringify(journal));
    await migrate(db, { migrationsFolder: oldMigrations });
    const now = Date.now();
    // Insert into the old schema before active_workspace_id exists.
    await client.execute({ sql: "INSERT INTO user (id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)", args: ["old", "Existing", "old@test.local", now, now] });
    await client.execute({ sql: "INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)", args: ["old-group", "Loti", now] });
    await client.execute({ sql: "INSERT INTO workspace_members (workspace_id,user_id,created_at) VALUES (?,?,?)", args: ["old-group", "old", now] });
    await client.execute({ sql: "INSERT INTO user_preferences (user_id,favorites_view,created_at,updated_at) VALUES (?,?,?,?)", args: ["old", "cards", now, now] });
    await client.execute({ sql: "INSERT INTO favorites (id,workspace_id,owner_id,name,url,platform,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", args: ["favorite", "old-group", "old", "Existing favorite", "https://example.com/item", "other", now, now] });
    await migrate(db, { migrationsFolder: "./drizzle" });
    await migrate(db, { migrationsFolder: "./drizzle" });
    expect((await db.select().from(user).all())).toHaveLength(1);
    expect((await db.select().from(workspaces).all())).toHaveLength(1);
    expect((await db.select().from(workspaceMembers).all())).toHaveLength(1);
    expect((await db.select().from(favorites).get())!.name).toBe("Existing favorite");
    expect((await db.select().from(userPreferences).get())!.favoritesView).toBe("cards");
    expect((await db.select().from(userPreferences).get())!.activeWorkspaceId).toBeNull();
    expect(await db.select().from(workspaceInvitations).all()).toHaveLength(0);
  } finally { client.close(); await rm(directory, { recursive: true, force: true }); }
});
