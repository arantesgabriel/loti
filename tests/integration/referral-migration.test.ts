import { afterEach, it, expect } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { openDatabase } from "@/lib/db/connection";
import { purchases, purchaseCostTrackings, purchaseItems, user, userPreferences, workspaceInvitations, workspaceMembers, workspaces } from "@/lib/db/schema";

const client = openDatabase(":memory:");
afterEach(() => client.client.close());

it("upgrades a populated 0030 database without changing group, invitation, snapshot or financial rows", async () => {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { tag: string }[] };
  const entries = journal.entries.slice(0, -1);
  journal.entries = entries;
  const folder = resolve(`artifacts/qa/referral-upgrade-${process.pid}-${randomUUID()}`);
  mkdirSync(`${folder}/meta`, { recursive: true });
  writeFileSync(`${folder}/meta/_journal.json`, JSON.stringify(journal));
  for (const entry of entries) copyFileSync(`drizzle/${entry.tag}.sql`, `${folder}/${entry.tag}.sql`);
  try {
    await migrate(client.db, { migrationsFolder: folder });
    const now = new Date("2026-11-05T12:00:00Z");
    await client.db.insert(user).values([
      { id: "referrer", name: "Referrer", email: "referrer@test.local", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "invitee", name: "Invitee", email: "invitee@test.local", emailVerified: false, createdAt: now, updatedAt: now },
    ]).run();
    await client.db.insert(workspaces).values({ id: "group", name: "Group", kind: "shared", ownerUserId: null, createdAt: now }).run();
    await client.db.insert(workspaceMembers).values({ workspaceId: "group", userId: "referrer", createdAt: now }).run();
    await client.db.insert(userPreferences).values({ userId: "referrer", activeWorkspaceId: "group", createdAt: now, updatedAt: now }).run();
    await client.db.insert(workspaceInvitations).values({ id: "invite", workspaceId: "group", email: "invitee@test.local", tokenHash: "a".repeat(64), createdBy: "referrer", createdAt: now, expiresAt: new Date(now.getTime() + 1000) }).run();
    await client.db.insert(purchases).values({ id: "purchase", workspaceId: "group", name: "Historical", status: "finalized", createdBy: "referrer", createdAt: now, finalizedAt: now }).run();
    await client.db.insert(purchaseItems).values({ id: "snapshot", purchaseId: "purchase", personId: "referrer", createdBy: "referrer", name: "Snapshot", url: "https://example.test/item", platform: "other", visualKey: "generic", createdAt: now, updatedAt: now }).run();
    await client.db.insert(purchaseCostTrackings).values({ id: "tracking", purchaseId: "purchase", workspaceId: "group", createdBy: "referrer", updatedBy: "referrer", createdAt: now, updatedAt: now }).run();

    await migrate(client.db, { migrationsFolder: "./drizzle" });
    expect(await client.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, "referrer")).all()).toHaveLength(1);
    expect(await client.db.select().from(workspaceInvitations).where(eq(workspaceInvitations.id, "invite")).get()).toBeTruthy();
    expect(await client.db.select().from(purchaseItems).where(eq(purchaseItems.id, "snapshot")).get()).toMatchObject({ name: "Snapshot", url: "https://example.test/item" });
    expect(await client.db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.id, "tracking")).get()).toMatchObject({ purchaseId: "purchase", status: "open" });
    expect(await client.db.all(sql`PRAGMA foreign_key_check`)).toHaveLength(0);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});
