import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/libsql/migrator";
import { legacyMigrationsFolder } from "../fixtures/orders-transition/legacy-migrations";
import { openDatabase } from "@/lib/db/connection";
import { hubbuyExternalItems, purchaseCostRefunds, purchaseItems, qcEvents, qcImages, qcImports, session, user, workspaceMembers, workspaces } from "@/lib/db/schema";
import { qcServices } from "@/lib/domain/qc-services";
import type { QcStorage } from "@/lib/qc/storage";
import { buildLegacyScenario } from "../fixtures/orders-transition/scenario";
import { seedScenarioQc } from "../fixtures/orders-transition/qc";
import { compareLegacyScenario, type ScenarioIdentity } from "../fixtures/orders-transition/compare";

describe("orders transition preservation comparison", () => {
  const { db, client } = openDatabase(":memory:");
  let identity: ScenarioIdentity;
  let baseline: Awaited<ReturnType<typeof compareLegacyScenario>>;
  const objects = new Map<string, { bytes: Buffer; sha256: string }>();
  const storage: QcStorage = {
    async put(object) { objects.set(object.key, object); },
    async get(key) { const object = objects.get(key); if (!object) throw new Error("Missing synthetic object"); return object.bytes; },
    async head(key) { const object = objects.get(key); return object ? { exists: true, sha256: object.sha256 } : { exists: false }; },
    async delete(key) { objects.delete(key); },
    async signRead() { return "http://localhost:3139/synthetic-private-qa"; },
  };
  const verify = () => compareLegacyScenario(db, identity, { mode: "verify", baseline });

  beforeAll(async () => {
    await migrate(db, { migrationsFolder: legacyMigrationsFolder() });
    const people = ["preserve-a", "preserve-b", "preserve-c", "preserve-d"], now = new Date();
    await db.insert(user).values(people.map(id => ({ id, name: id, email: `${id}@loti.test`, emailVerified: true, createdAt: now, updatedAt: now }))).run();
    await db.insert(workspaces).values({ id: "loti", name: "Loti preservation QA", createdAt: now }).run();
    await db.insert(workspaceMembers).values(people.map(userId => ({ workspaceId: "loti", userId, createdAt: now }))).run();
    identity = await buildLegacyScenario(db, people, { beforeCorrections: async value => { await seedScenarioQc(db, value, storage); } });
    baseline = await compareLegacyScenario(db, identity, { mode: "capture" });
    expect(baseline.failures).toEqual([]);
  }, 60000);
  afterAll(() => client.close());

  it("rejects snapshot URL and variant changes even when all financial anchors stay identical", async () => {
    const item = (await db.select().from(purchaseItems).all())[0];
    try {
      await db.update(purchaseItems).set({ url: "https://shop.loti.test/tampered", variant: "Tampered QA" }).where(eq(purchaseItems.id, item.id)).run();
      const result = await verify();
      expect(result.actual).toEqual(baseline.actual);
      expect(result.passed).toBe(false);
      expect(result.failures.join("\n")).toContain("purchaseItems");
    } finally { await db.update(purchaseItems).set({ url: item.url, variant: item.variant }).where(eq(purchaseItems.id, item.id)).run(); }
  });

  it("rejects QC tombstones and changed target links without changing financial totals", async () => {
    const image = (await db.select().from(qcImages).all())[0];
    try {
      await db.update(qcImages).set({ status: "deleted", deleteState: "deleted", deletedAt: new Date(), deletedBy: identity.people[0] }).where(eq(qcImages.id, image.id)).run();
      const result = await verify();
      expect(result.actual).toEqual(baseline.actual);
      expect(result.passed).toBe(false);
      expect(result.failures.join("\n")).toContain("qcImages");
    } finally { await db.update(qcImages).set({ status: image.status, deleteState: image.deleteState, deletedAt: image.deletedAt, deletedBy: image.deletedBy }).where(eq(qcImages.id, image.id)).run(); }
    const external = (await db.select().from(hubbuyExternalItems).all())[0];
    const otherItem = (await db.select().from(purchaseItems).all()).find(item => item.id !== external.purchaseItemId)!;
    try {
      await db.update(hubbuyExternalItems).set({ purchaseItemId: otherItem.id, additionalOrderItemId: null }).where(eq(hubbuyExternalItems.id, external.id)).run();
      const result = await verify();
      expect(result.actual).toEqual(baseline.actual);
      expect(result.passed).toBe(false);
      expect(result.failures.join("\n")).toContain("hubbuyExternalItems");
    } finally { await db.update(hubbuyExternalItems).set({ purchaseItemId: external.purchaseItemId, additionalOrderItemId: external.additionalOrderItemId }).where(eq(hubbuyExternalItems.id, external.id)).run(); }
  });

  it("checks each refund anchor instead of accepting compensating changes to the same aggregate", async () => {
    const rows = await db.select().from(purchaseCostRefunds).all();
    const first = rows[0], second = rows[1];
    try {
      await db.update(purchaseCostRefunds).set({ receivedProductCents: first.receivedProductCents! + 1 }).where(eq(purchaseCostRefunds.id, first.id)).run();
      await db.update(purchaseCostRefunds).set({ receivedProductCents: second.receivedProductCents! - 1 }).where(eq(purchaseCostRefunds.id, second.id)).run();
      const result = await compareLegacyScenario(db, identity, { mode: "capture" });
      expect(result.actual).toEqual(baseline.actual);
      expect(result.passed).toBe(false);
      expect(result.failures.join("\n")).toContain("Refund line anchor failed");
    } finally {
      await db.update(purchaseCostRefunds).set({ receivedProductCents: first.receivedProductCents }).where(eq(purchaseCostRefunds.id, first.id)).run();
      await db.update(purchaseCostRefunds).set({ receivedProductCents: second.receivedProductCents }).where(eq(purchaseCostRefunds.id, second.id)).run();
    }
  });

  it("rejects a different personal distribution in the approved synthetic baseline", async () => {
    const changed = structuredClone(baseline);
    changed.preservation.personal[0].values.net++;
    changed.preservation.personal[1].values.net--;
    const result = await compareLegacyScenario(db, identity, { mode: "verify", baseline: changed });
    expect(result.passed).toBe(false);
    expect(result.failures.join("\n")).toContain("Personal baseline mismatch");
  });

  it.each(["manifest", "actor"] as const)("rejects changes to QC import provenance: %s", async field => {
    const original = (await db.select().from(qcImports).all())[0];
    const manifest = JSON.parse(original.manifestJson);
    manifest.rows[0].occurrence.title = "Changed synthetic QC provenance";
    try {
      await db.update(qcImports).set(field === "manifest"
        ? { manifestJson: JSON.stringify(manifest) }
        : { actorId: identity.people.find(personId => personId !== original.actorId)! }).where(eq(qcImports.id, original.id)).run();
      const result = await verify();
      expect(result.actual).toEqual(baseline.actual);
      expect(result.passed).toBe(false);
      expect(result.failures.join("\n")).toContain("Protected baseline mismatch: qcImports");
    } finally { await db.update(qcImports).set({ manifestJson: original.manifestJson, actorId: original.actorId }).where(eq(qcImports.id, original.id)).run(); }
  });

  it("accepts legitimate sessions, profile labels, gallery limits and appended read audit events", async () => {
    const now = new Date();
    await db.insert(session).values({ id: "preserve-session", token: "synthetic-local-only-session", userId: identity.people[0], expiresAt: new Date(now.getTime() + 60000), createdAt: now, updatedAt: now }).run();
    await db.update(user).set({ name: "Pessoa QA renamed", updatedAt: now }).where(eq(user.id, identity.people[0])).run();
    const qc = qcServices(db, identity.people[0], { managerId: identity.people[0], storage });
    const image = (await db.select().from(qcImages).all())[0];
    const imported = (await db.select().from(qcImports).all())[0];
    await qc.getImport(imported.id);
    await qc.getOriginalSource(image.id);
    await qc.fallback(image.id);
    const result = await verify();
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.personal.some(person => Object.values(person.differences).some(value => value !== 0))).toBe(true);
  });

  it("rejects changes to an earlier QC audit event even though later reads may append new events", async () => {
    const event = (await db.select().from(qcEvents).all())[0];
    try {
      await db.update(qcEvents).set({ contextJson: JSON.stringify({ ...JSON.parse(event.contextJson), qaTampered: true }) }).where(eq(qcEvents.id, event.id)).run();
      const result = await verify();
      expect(result.actual).toEqual(baseline.actual);
      expect(result.passed).toBe(false);
      expect(result.failures.join("\n")).toContain("Protected audit baseline mismatch: qcEvents");
    } finally { await db.update(qcEvents).set({ contextJson: event.contextJson }).where(eq(qcEvents.id, event.id)).run(); }
  });

  it("rejects missing, malformed or foreign baseline metadata instead of silently capturing it", async () => {
    const incomplete = structuredClone(baseline);
    delete incomplete.preservation.tables.qcImports;
    for (const invalid of [undefined, {}, { ...baseline, passed: false }, { ...baseline, preservation: { ...baseline.preservation, version: 1 } }, { ...baseline, preservation: { ...baseline.preservation, version: 999 } }, incomplete]) {
      await expect(compareLegacyScenario(db, identity, { mode: "verify", baseline: invalid })).rejects.toThrow(/baseline/i);
    }
    const changed = structuredClone(baseline);
    changed.preservation.identity.purchaseId = "foreign-qa-purchase";
    const result = await compareLegacyScenario(db, identity, { mode: "verify", baseline: changed });
    expect(result.passed).toBe(false);
    expect(result.failures.join("\n")).toContain("Baseline identity mismatch");
  });
});
