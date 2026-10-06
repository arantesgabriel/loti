import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { readLegacy, cellText, legacyPrice } from "../../scripts/legacy-reader";
import { importLegacy, type LegacyMapping } from "../../scripts/legacy-importer";
import { fixture, type Fixture } from "./helpers";
import { eq } from "drizzle-orm";
import { favorites, purchaseItems, user, workspaceMembers } from "@/lib/db/schema";

const source = "legacy/source/Favoritos_Hubbuy_original.xlsx";
let f: Fixture;
beforeEach(async () => { f = await fixture(); });
afterEach(() => f.client.close());

async function mapping(): Promise<LegacyMapping> {
  for (const id of ["Amanda", "Bola", "Vinicius"]) {
    await f.db.insert(user).values({ id, name: id, email: `${id.toLowerCase()}@test.local`, createdAt: new Date(), updatedAt: new Date() }).run();
    await f.db.insert(workspaceMembers).values({ userId: id, workspaceId: "workspace", createdAt: new Date() }).run();
  }
  return { users: { Gabriel: "alice@test.local", Brunna: "bob@test.local", Amanda: "amanda@test.local", Bola: "bola@test.local", Vinicius: "vinicius@test.local" }, createdBy: "Gabriel", qcValues: {}, purchases: {
    "Próxima compra Set26": { status: "finalized", createdAt: "2026-09-01T12:00:00Z", finalizedAt: "2026-09-30T12:00:00Z", cartStatus: "added" },
    "Compra Out26": { status: "active", createdAt: "2026-10-01T12:00:00Z", finalizedAt: null, cartStatus: "pending" },
  } };
}

// The original private workbook is operator-supplied, never bundled in Git or the image.
describe.skipIf(!existsSync(source))("legacy migration (requires private source workbook)", () => {
  it("reads side sections, research variants and real hyperlinks", async () => {
    const parsed = await readLegacy(source);
    expect(parsed.sheets).toHaveLength(7); expect(parsed.rows).toHaveLength(151);
    expect(parsed.rows.filter(r => r.collection === "Presentes")).toHaveLength(3);
    expect(parsed.rows.filter(r => r.collection === "Build PC")).toHaveLength(6);
    expect(parsed.rows.find(r => r.sheet === "SheinShoppee" && r.address === "A4")?.variant).toBe("S");
    expect(parsed.rows.find(r => r.sheet === "Favoritos Gabriel" && r.address === "A2")?.url).toContain("https://x.yupoo.com/external?");
  });
  it("unwraps rich text and saved formulas without inventing blanks", () => {
    expect(cellText({ text: { richText: [{ text: "a" }, { text: "b" }] } })).toBe("ab");
    expect(legacyPrice({ formula: "SUM(11.22+11.22)", result: 22.44 })).toBe(2244);
    expect(legacyPrice("~")).toBeNull(); expect(() => legacyPrice({ formula: "A1*2" })).toThrow("resultado");
  });
  it("requires users and purchase decisions before writing", async () => {
    const config = await mapping(); delete config.purchases["Compra Out26"];
    const report = await importLegacy(f.db, source, config, false);
    expect(report.blockers.length).toBeGreaterThan(0); expect((await f.alice.getData()).favorites).toHaveLength(0);
  });
  it("dry-run creates nothing and reports source counts", async () => {
    const report = await importLegacy(f.db, source, await mapping());
    expect(report.created).toEqual({ favorites: 125, collections: 3, purchases: 2, items: 26 });
    expect((await f.alice.getData()).favorites).toHaveLength(0); expect(report.skipped).toHaveLength(6);
    expect(report.purchases["Próxima compra Set26"]?.rows).toBe(25);
  });
  it("is idempotent, preserves nullable prices/QC and snapshots", async () => {
    const config = await mapping(), first = await importLegacy(f.db, source, config, false);
    expect(first.blockers).toHaveLength(0); expect(first.created.favorites).toBe(125);
    const second = await importLegacy(f.db, source, config, false);
    expect(second.created).toEqual({ favorites: 0, collections: 0, purchases: 0, items: 0 });
    expect(second.existing).toEqual({ favorites: 125, purchases: 2, items: 26 });
    const items = await f.db.select().from(purchaseItems).all();
    expect(items).toHaveLength(26);
    const data = await f.alice.getData(); expect(data.favorites.some(x => x.priceCents === null)).toBe(true);
    expect(data.favorites.some(x => x.notes?.includes("QC original: SIM"))).toBe(true);
    const firstItem = items[0], fav = data.favorites.find(x => x.ownerId === "alice")!;
    await f.db.update(favorites).set({ name: "changed" }).where(eq(favorites.id, fav.id)).run();
    expect((await f.db.select().from(purchaseItems).where(eq(purchaseItems.id, firstItem!.id)).get())?.name).toBe(firstItem?.name);
  });
  it("does not reopen an imported active purchase later finalized", async () => {
    const config = await mapping(); await importLegacy(f.db, source, config, false);
    const active = (await f.alice.getData()).purchases.find(p => p.status === "active")!;
    await f.alice.finalizePurchase(active.id, true); await importLegacy(f.db, source, config, false);
    expect((await f.alice.getData()).purchases.every(p => p.status === "finalized")).toBe(true);
  });
  it("rejects conflict with an existing active purchase without partial writes", async () => {
    const config = await mapping(); await f.alice.savePurchase({ name: "Current" });
    const report = await importLegacy(f.db, source, config, false);
    expect(report.blockers).toHaveLength(1); expect((await f.alice.getData()).favorites).toHaveLength(0);
  });
});
