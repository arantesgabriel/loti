import { expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { eq, sql } from "drizzle-orm";
import { openDatabase } from "@/lib/db/connection";
import * as s from "@/lib/db/schema";
import { createServices } from "@/lib/domain/services";
import { seedDevelopmentWorkspace } from "../../scripts/development-seed/seed";
import { people, seedWorkspaceId } from "../../scripts/development-seed/catalog";
import { verifyDatabase } from "../../scripts/database-verification";

it("populates all menus, resumes a rolled-back step and never duplicates or resets data", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "development-seed-integration-secret-only-2026");
  vi.stubEnv("LOTI_EMAIL_MODE", "disabled");
  const { db, client } = openDatabase(":memory:");
  try {
    await expect(seedDevelopmentWorkspace(db, "Development-only-password-2026")).rejects.toThrow(/migrations/);
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.insert(s.workspaces).values({ id: "existing", name: "Grupo existente", createdAt: new Date() }).run();
    await expect(seedDevelopmentWorkspace(db, "Development-only-password-2026", {
      beforeCheckpointCommit(key) { if (key === "member-1") throw new Error("Injected interruption after signup"); },
    })).rejects.toThrow(/Injected interruption/);
    expect(await db.select().from(s.user).where(eq(s.user.email, people[1].email)).get()).toBeUndefined();
    await expect(seedDevelopmentWorkspace(db, "Development-only-password-2026", {
      beforeCheckpointCommit(key) { if (key === "additional-paid") throw new Error("Injected payment interruption"); },
    })).rejects.toThrow(/Injected payment interruption/);
    const fundedAccount = (await db.select().from(s.hubbuyAccounts).where(eq(s.hubbuyAccounts.label, "Compras compartilhadas")).get())!;
    expect(fundedAccount.balanceCnyMinor).toBe(58700);
    const result = await seedDevelopmentWorkspace(db, "Development-only-password-2026");
    expect(result).toMatchObject({ status: "created", members: 5, favorites: 50, finalizedPurchases: 4, purchaseProductLines: 44, hubbuyAccounts: 3, refunds: 2, pendingInvitations: 2 });
    expect(result.packages).toHaveLength(6);
    expect(result.packages.filter((pkg: { stage: string }) => pkg.stage === "received")).toHaveLength(1);
    expect(result.packages.filter((pkg: { stage: string }) => pkg.stage === "sent")).toHaveLength(1);
    expect(result.balanceCnyMinor).toBe(53700);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    expect(await verifyDatabase(client)).toMatchObject({ status: "ok", foreignKeyViolations: 0 });
    const actor = (await db.select().from(s.user).where(eq(s.user.email, people[0].email)).get())!;
    const data = await createServices(db, actor.id).getData();
    expect(data.workspaceId).toBe(seedWorkspaceId);
    expect(data.purchases.filter(p => p.status === "active")).toHaveLength(1);
    expect(data.favorites.every(f => !/\bQA\b|teste|Produto original|Pessoa A/i.test(f.name))).toBe(true);
    const customized = data.favorites[0];
    await db.update(s.favorites).set({ notes: "Editado durante a conferência" }).where(eq(s.favorites.id, customized.id)).run();
    const before = await db.all(sql`SELECT id, name, email FROM user ORDER BY id`);
    expect(await seedDevelopmentWorkspace(db, "Another-password-never-replaces-existing")).toMatchObject({ status: "already-applied" });
    expect(await db.all(sql`SELECT id, name, email FROM user ORDER BY id`)).toEqual(before);
    expect((await db.select().from(s.favorites).where(eq(s.favorites.id, customized.id)).get())!.notes).toBe("Editado durante a conferência");
    expect((await db.select().from(s.workspaces).where(eq(s.workspaces.id, "existing")).get())!.name).toBe("Grupo existente");
  } finally { client.close(); vi.unstubAllEnvs(); }
}, 120_000);
