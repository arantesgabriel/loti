import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { expect, it } from "vitest";
import { openDatabase } from "@/lib/db/connection";
import { accountActivationRequirements, onboardingEnrollments, onboardingHelpPreferences, onboardingRuns, user, userGuidanceProfiles, workspaceMembers, workspaces } from "@/lib/db/schema";
import { onboardingServices } from "@/lib/onboarding/services";
import { ensurePersonalWorkspace } from "@/lib/domain/personal-workspaces";

it("upgrades 0031 additively, classifies existing accounts without fabricating progress and safely repeats", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loti-onboarding-migration-"));
  const connection = openDatabase(":memory:");
  try {
    const baseline = join(directory, "0031");
    await mkdir(join(baseline, "meta"), { recursive: true });
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
    const boundary = journal.entries.findIndex(entry => entry.tag === "0031_referral_attributions");
    expect(boundary).toBeGreaterThanOrEqual(0);
    journal.entries = journal.entries.slice(0, boundary + 1);
    await writeFile(join(baseline, "meta/_journal.json"), JSON.stringify(journal));
    for (const entry of journal.entries) await copyFile(`drizzle/${entry.tag}.sql`, join(baseline, `${entry.tag}.sql`));
    await migrate(connection.db, { migrationsFolder: baseline });
    const now = Date.now();
    await connection.client.execute({ sql: "INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES (?,?,?,?,?,?)", args: ["legacy", "Legacy", "legacy@loti.test", 1, now, now] });
    await connection.client.execute({ sql: "INSERT INTO workspaces (id,name,created_at) VALUES (?,?,?)", args: ["group", "Group", now] });
    await connection.client.execute({ sql: "INSERT INTO workspace_members (workspace_id,user_id,created_at) VALUES (?,?,?)", args: ["group", "legacy", now] });
    await connection.client.execute({ sql: "INSERT INTO user_preferences (user_id,favorites_view,active_workspace_id,created_at,updated_at) VALUES (?,?,?,?,?)", args: ["legacy", "cards", "group", now, now] });
    await connection.client.execute({ sql: "INSERT INTO favorites (id,workspace_id,owner_id,name,url,platform,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)", args: ["favorite", "group", "legacy", "Actual legacy favorite", "https://example.test/legacy", "other", now, now] });
    await connection.client.execute({ sql: "INSERT INTO purchases (id,workspace_id,name,status,created_by,created_at,finalized_at) VALUES (?,?,?,?,?,?,?)", args: ["purchase", "group", "Historical", "finalized", "legacy", now, now] });
    await connection.client.execute({ sql: "INSERT INTO purchase_items (id,purchase_id,person_id,created_by,name,url,platform,visual_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)", args: ["snapshot", "purchase", "legacy", "legacy", "Snapshot", "https://example.test/item", "other", "generic", now, now] });
    await connection.client.execute({ sql: "INSERT INTO purchase_cost_trackings (id,purchase_id,workspace_id,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?)", args: ["tracking", "purchase", "group", "legacy", "legacy", now, now] });
    await connection.client.execute({ sql: "INSERT INTO workspace_invitations (id,workspace_id,email,token_hash,created_by,created_at,expires_at) VALUES (?,?,?,?,?,?,?)", args: ["invitation", "group", "future@loti.test", "a".repeat(64), "legacy", now, now + 60000] });
    const tableNames = (await connection.client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '__drizzle_migrations' ORDER BY name")).rows.map(row => String(row.name));
    const before = await Promise.all(tableNames.map(name => connection.client.execute(`SELECT * FROM "${name.replaceAll('"', '""')}"`)));

    await migrate(connection.db, { migrationsFolder: "./drizzle" });
    await migrate(connection.db, { migrationsFolder: "./drizzle" });
    for (const [index, name] of tableNames.entries()) {
      expect((await connection.client.execute(`SELECT * FROM "${name.replaceAll('"', '""')}"`)).rows, name).toEqual(before[index].rows);
    }
    expect(await connection.db.select().from(onboardingEnrollments).all()).toEqual([expect.objectContaining({ userId: "legacy", cohort: "existing", initialFlowVersion: 1 })]);
    for (const table of [userGuidanceProfiles, onboardingRuns, onboardingHelpPreferences]) expect(await connection.db.select().from(table).all()).toHaveLength(0);
    const legacy = await onboardingServices(connection.db, "legacy").read("group");
    expect(legacy.enrollment.cohort).toBe("existing");
    expect(legacy.introduction.status).toBe("not_started");
    expect(legacy.profile.revision).toBe(0);
    await expect(connection.client.execute("UPDATE onboarding_enrollments SET cohort='new' WHERE user_id='legacy'")).rejects.toThrow(/immutable/);
    expect((await connection.db.select().from(onboardingEnrollments).where(eq(onboardingEnrollments.userId, "legacy")).get())!.cohort).toBe("existing");
    expect((await connection.client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  } finally {
    connection.client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

it("supports empty installation, new registration cohorts and database-enforced state constraints", async () => {
  const { db, client } = openDatabase(":memory:");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await migrate(db, { migrationsFolder: "./drizzle" });
    expect(await db.select().from(onboardingEnrollments).all()).toHaveLength(0);
    const now = new Date();
    await db.insert(user).values({ id: "new", name: "Synthetic New", email: "new@loti.test", emailVerified: true, createdAt: now, updatedAt: now }).run();
    await db.insert(accountActivationRequirements).values({ userId: "new", source: "public_signup", createdAt: now }).run();
    const personal = (await ensurePersonalWorkspace(db, "new")).workspace.id;
    const service = onboardingServices(db, "new");
    expect((await service.read(personal)).enrollment.cohort).toBe("new");
    expect(await db.select().from(onboardingEnrollments).all()).toHaveLength(0);
    const saved = await service.execute({ command: "intro.skip", workspaceId: personal, flowVersion: 1, expectedRevision: 0 });
    expect(saved.enrollment).toEqual({ cohort: "new", initialFlowVersion: 1 });
    const run = (await db.select().from(onboardingRuns).get())!;
    await expect(db.insert(onboardingRuns).values(run).run()).rejects.toThrow();
    await expect(db.update(onboardingRuns).set({ status: "completed" }).run()).rejects.toThrow();
    await expect(db.update(onboardingRuns).set({ revision: 0 }).run()).rejects.toThrow();
    await expect(client.execute("INSERT INTO user_guidance_profiles (user_id,experience,usage_intent,revision,created_at,updated_at) VALUES ('new','invalid','unspecified',1,0,0)")).rejects.toThrow();
    await expect(client.execute("INSERT INTO onboarding_help_preferences (user_id,help_id,help_version,proactive,revision,created_at,updated_at) VALUES ('new','all',1,2,1,0,0)")).rejects.toThrow();
    expect(await db.select().from(workspaceMembers).all()).toHaveLength(0);
    expect(await db.select().from(workspaces).all()).toHaveLength(1);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
  } finally { client.close(); }
});
