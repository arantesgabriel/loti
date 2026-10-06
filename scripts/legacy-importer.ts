import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../src/lib/db/connection";
import { user, collections, favorites, purchases, purchaseItems, workspaceMembers } from "../src/lib/db/schema";
import { readLegacy, type LegacyIssue } from "./legacy-reader";
import { buildCanonicalProductKey, detectPlatform } from "../src/lib/domain/urls";
import { resolveProductCategory } from "../src/lib/domain/categories";
import { favoriteInput, itemInput } from "../src/lib/domain/validation";
import { purchaseSummary, personSummary } from "../src/lib/domain/money";

export const mappingSchema = z.object({
  users: z.record(z.string(), z.email()), createdBy: z.string().min(1), workspaceId: z.string().optional(),
  sheetOwners: z.record(z.string(), z.string()).default({}), qcValues: z.record(z.string(), z.enum(["not_reviewed", "approved", "rejected"])).default({}),
  purchases: z.record(z.string(), z.object({ name: z.string().min(1).max(200).optional(), status: z.enum(["active", "finalized"]), createdAt: z.iso.datetime(), finalizedAt: z.iso.datetime().nullable(), cartStatus: z.enum(["pending", "added"]), hubbuyAccount: z.string().nullable().optional() }).refine(v => v.status === "finalized" ? v.finalizedAt !== null : v.finalizedAt === null, "Confirme a data de finalização ou null para compra ativa.")),
});
export type LegacyMapping = z.input<typeof mappingSchema>;
const legacyId = (workspace: string, key: string) => `legacy:${createHash("sha256").update(`${workspace}|${key}`).digest("hex").slice(0, 32)}`;

export async function importLegacy(db: AppDatabase, path: string, input: unknown, dryRun = true) {
  const mapping = mappingSchema.parse(input), source = await readLegacy(path), blockers: LegacyIssue[] = [];
  const users = new Map<string, string>();
  for (const [label, email] of Object.entries(mapping.users)) {
    const member = await db.select().from(user).where(eq(user.email, email.toLowerCase())).get();
    if (!member) blockers.push({ sheet: "mapping", address: label, reason: `Usuário não criado: ${email}` });
    else users.set(label, member.id);
  }
  const creatorId = users.get(mapping.createdBy);
  if (!creatorId) blockers.push({ sheet: "mapping", address: "createdBy", reason: "Operador sem usuário mapeado." });
  const creatorMembership = creatorId ? await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, creatorId)).get() : undefined;
  const workspaceId = mapping.workspaceId ?? creatorMembership?.workspaceId;
  if (!workspaceId) blockers.push({ sheet: "mapping", address: "workspaceId", reason: "Espaço compartilhado não encontrado." });
  for (const [label, id] of users) {
    if (workspaceId && !await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.userId, id), eq(workspaceMembers.workspaceId, workspaceId))).get()) {
      blockers.push({ sheet: "mapping", address: label, reason: "Usuário não é membro deste espaço." });
    }
  }
  const purchaseSheets = source.sheets.filter(s => s.kind === "purchase");
  for (const sheet of purchaseSheets) if (!mapping.purchases[sheet.name]) blockers.push({ sheet: sheet.name, address: "status", reason: "Confirme status, datas e estado do carrinho na configuração de migração." });
  if (Object.values(mapping.purchases).filter(p => p.status === "active").length > 1) blockers.push({ sheet: "mapping", address: "purchases", reason: "Somente uma compra pode ser ativa." });
  for (const row of source.rows) if (!users.has(row.owner ?? mapping.sheetOwners[row.sheet])) blockers.push({ sheet: row.sheet, address: row.address, reason: `Pessoa sem mapeamento: ${row.owner ?? "não informada"}` });
  const report = { dryRun, sheets: source.sheets, skipped: source.issues, warnings: source.warnings, blockers, favoritesByOwner: {} as Record<string, number>, favoritesByCollection: {} as Record<string, number>, purchases: {} as Record<string, { rows: number; units: number; totalCents: number; byPerson: Record<string, number> }>, missingPrices: source.rows.filter(r => r.priceCents === null).length, created: { favorites: 0, collections: 0, purchases: 0, items: 0 }, existing: { favorites: 0, purchases: 0, items: 0 } };
  for (const row of source.rows) {
    if (source.sheets.find(s => s.name === row.sheet)?.kind === "purchase") continue;
    const owner = row.owner ?? mapping.sheetOwners[row.sheet] ?? "Não mapeado";
    report.favoritesByOwner[owner] = (report.favoritesByOwner[owner] ?? 0) + 1;
    const collection = row.collection ?? "Sem coleção"; report.favoritesByCollection[collection] = (report.favoritesByCollection[collection] ?? 0) + 1;
  }
  for (const sheet of purchaseSheets) {
    const rows = source.rows.filter(r => r.sheet === sheet.name), items = rows.map(r => ({ personId: r.owner ?? "unknown", quantity: r.quantity, unitPriceCents: r.priceCents, cartStatus: mapping.purchases[sheet.name]?.cartStatus ?? "pending" as const }));
    const summary = purchaseSummary(items);
    report.purchases[sheet.name] = { rows: rows.length, units: summary.units, totalCents: summary.totalCents, byPerson: Object.fromEntries([...new Set(items.map(i => i.personId))].map(id => [id, personSummary(items, id).totalCents])) };
  }
  if (blockers.length || !workspaceId || !creatorId) return report;
  const now = new Date();
  const preexistingPurchases = new Set((await db.select({ id: purchases.id }).from(purchases).where(eq(purchases.workspaceId, workspaceId)).all()).map(p => p.id));
  const active = await db.select().from(purchases).where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.status, "active"))).get();
  for (const sheet of purchaseSheets) if (mapping.purchases[sheet.name].status === "active" && active && active.id !== legacyId(workspaceId, `purchase|${sheet.name}`)) blockers.push({ sheet: sheet.name, address: "status", reason: "Já há outra compra ativa. Finalize-a ou importe esta rodada como histórico." });
  if (blockers.length) return report;

  // Dry-run validates every prospective row; execution commits the whole workbook atomically.
  await db.transaction(async tx => {
    const collectionCache = new Map<string, string>();
    for (const sheet of purchaseSheets) {
      const id = legacyId(workspaceId, `purchase|${sheet.name}`), config = mapping.purchases[sheet.name];
      if (await tx.select().from(purchases).where(eq(purchases.id, id)).get()) { report.existing.purchases++; continue; }
      report.created.purchases++;
      if (!dryRun) await tx.insert(purchases).values({ id, workspaceId, name: config.name ?? sheet.name, status: config.status, hubbuyAccount: config.hubbuyAccount === undefined ? source.accounts[sheet.name] ?? null : config.hubbuyAccount, createdBy: creatorId, createdAt: new Date(config.createdAt), finalizedAt: config.finalizedAt ? new Date(config.finalizedAt) : null }).run();
    }
    for (const row of source.rows) {
      const ownerLabel = row.owner ?? mapping.sheetOwners[row.sheet], ownerId = users.get(ownerLabel)!;
      const id = legacyId(workspaceId, `${row.sheet}|${row.address}`), kind = source.sheets.find(s => s.name === row.sheet)!.kind;
      const common = { name: row.name, url: row.url, variant: row.variant, notes: [row.notes, row.qc && !mapping.qcValues[row.qc] ? `QC original: ${row.qc}` : null].filter(Boolean).join("\n") || null };
      if (kind === "purchase") {
        if (await tx.select().from(purchaseItems).where(eq(purchaseItems.id, id)).get()) { report.existing.items++; continue; }
        const value = itemInput.parse({ ...common, personId: ownerId, quantity: row.quantity, unitPriceCents: row.priceCents });
        const purchaseId = legacyId(workspaceId, `purchase|${row.sheet}`);
        const existingPurchase = await tx.select().from(purchases).where(eq(purchases.id, purchaseId)).get();
        if (existingPurchase?.status === "finalized" && preexistingPurchases.has(purchaseId)) {
          report.warnings.push({ sheet: row.sheet, address: row.address, reason: "Compra já importada e finalizada; linha nova não foi acrescentada ao histórico." }); continue;
        }
        report.created.items++;
        if (!dryRun) await tx.insert(purchaseItems).values({ id, purchaseId, sourceFavoriteId: null, createdBy: creatorId, ...value, platform: detectPlatform(row.url), visualKey: resolveProductCategory(row.name), cartStatus: mapping.purchases[row.sheet].cartStatus, createdAt: new Date(mapping.purchases[row.sheet].createdAt), updatedAt: now }).run();
      } else {
        if (await tx.select().from(favorites).where(eq(favorites.id, id)).get()) { report.existing.favorites++; continue; }
        let collectionId: string | null = null;
        if (row.collection) {
          const key = `${ownerId}|${row.collection}`;
          const existing = await tx.select().from(collections).where(and(eq(collections.workspaceId, workspaceId), eq(collections.ownerId, ownerId), eq(collections.name, row.collection))).get();
          collectionId = existing?.id ?? collectionCache.get(key) ?? legacyId(workspaceId, `collection|${key}`);
          if (!existing && !collectionCache.has(key)) {
            report.created.collections++;
            if (!dryRun) await tx.insert(collections).values({ id: collectionId, workspaceId, ownerId, name: row.collection, createdAt: now, updatedAt: now }).run();
          }
          collectionCache.set(key, collectionId);
        }
        const value = favoriteInput.parse({ ...common, priceCents: row.priceCents, collectionId, qcStatus: row.qc ? mapping.qcValues[row.qc] ?? "not_reviewed" : "not_reviewed" });
        report.created.favorites++;
        if (!dryRun) await tx.insert(favorites).values({ id, workspaceId, ownerId, ...value, platform: detectPlatform(row.url), canonicalProductKey: buildCanonicalProductKey(row.url), visualKey: resolveProductCategory(row.name), createdAt: now, updatedAt: now }).run();
      }
    }
  });
  return report;
}
