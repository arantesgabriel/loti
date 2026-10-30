import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "../db/connection";
import { purchases, hubbuyExternalItems, purchaseItemCosts, purchaseCostOrders, hubbuyAccounts } from "../db/schema";
import { authorization } from "./authorization";
import { DomainError } from "./errors";
import { qcServices } from "./qc-services";
import { suggestQcMatch } from "./qc-matching";
import { parseHubBuyImport, type QcOccurrenceInput } from "./qc-validation";

export const ordersQcInput = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("preview"), data: z.unknown() }).strict(),
  z.object({ operation: z.literal("prepare"), data: z.unknown(), choices: z.array(z.object({ externalKey: z.string().min(1).max(610), targetKey: z.string().min(1).max(220).nullable() }).strict()).max(500) }).strict(),
]);

/** Routing only. Parsing, manifests, association, covers and transfer stay in QC. */
export function ordersQcImport(db: AppDatabase, userId: string, config: Parameters<typeof qcServices>[2] = {}) {
  const qc = qcServices(db, userId, config);
  async function scope() {
    const membership = await authorization(db, userId).requireWorkspaceMember();
    if (!qc.managerId || qc.managerId !== userId) throw new DomainError("Você não pode administrar QC.", 403, "QC_FORBIDDEN");
    return membership.workspaceId;
  }
  async function capabilities() { await scope(); return { canManage: true }; }

  async function preview(raw: unknown) {
    const workspaceId = await scope();
    const parsed = parseHubBuyImport(raw);
    const origins = await db.select().from(purchases).where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.status, "finalized"))).orderBy(asc(purchases.createdAt)).limit(101).all();
    if (origins.length > 100) throw new DomainError("A seleção global excede 100 compras. Use a importação contextual da compra.", 422, "QC_GLOBAL_SCOPE_LIMIT");
    const targets = [] as Array<Awaited<ReturnType<typeof qc.getTargets>>[number] & { purchaseId: string; purchaseName: string }>;
    for (const purchase of origins) {
      const rows = await qc.getTargets(purchase.id);
      targets.push(...rows.map(row => ({ ...row, purchaseId: purchase.id, purchaseName: purchase.name })));
      if (targets.length > 10000) throw new DomainError("A seleção global excede 10.000 produtos. Use a importação contextual da compra.", 422, "QC_GLOBAL_SCOPE_LIMIT");
    }
    const accountRows = targets.length ? await db.select({ purchaseItemId: purchaseItemCosts.purchaseItemId, additionalOrderItemId: purchaseItemCosts.additionalOrderItemId, label: hubbuyAccounts.label })
      .from(purchaseItemCosts).innerJoin(purchaseCostOrders, eq(purchaseCostOrders.id, purchaseItemCosts.orderId)).leftJoin(hubbuyAccounts, eq(hubbuyAccounts.id, purchaseCostOrders.accountId))
      .where(or(inArray(purchaseItemCosts.purchaseItemId, targets.filter(target => target.origin === "purchase").map(target => target.id.slice(9))), inArray(purchaseItemCosts.additionalOrderItemId, targets.filter(target => target.origin === "additional").map(target => target.id.slice(11))))).all() : [];
    const ids = [...new Set(parsed.occurrences.flatMap(row => [row.orderGoodsId, row.orderGoodsNo].filter((value): value is string => !!value)))];
    const existing = ids.length ? await db.select().from(hubbuyExternalItems).where(and(eq(hubbuyExternalItems.workspaceId, workspaceId), inArray(hubbuyExternalItems.purchaseId, origins.map(row => row.id)), inArray(hubbuyExternalItems.orderGoodsId, ids))).all() : [];
    const alternate = ids.length && origins.length ? await db.select().from(hubbuyExternalItems).where(and(eq(hubbuyExternalItems.workspaceId, workspaceId), inArray(hubbuyExternalItems.purchaseId, origins.map(row => row.id)), inArray(hubbuyExternalItems.orderGoodsNo, ids))).all() : [];
    const external = [...new Map([...existing, ...alternate].map(row => [row.id, row])).values()];
    const photographed = new Set<string>();
    // Read presentation state once per origin; never expose private image URLs.
    for (const purchase of origins) {
      const summary = await qc.getQcSummary(purchase.id);
      for (const count of summary.counts) if (count.count > 0) photographed.add(count.itemId);
    }
    const rows = parsed.occurrences.map(occurrence => {
      const linked = external.filter(row => row.orderNo === occurrence.orderNo && (occurrence.orderGoodsId && row.orderGoodsId === occurrence.orderGoodsId || occurrence.orderGoodsNo && row.orderGoodsNo === occurrence.orderGoodsNo));
      const conflict = linked.some(row => row.orderGoodsId && occurrence.orderGoodsId && row.orderGoodsId !== occurrence.orderGoodsId || row.orderGoodsNo && occurrence.orderGoodsNo && row.orderGoodsNo !== occurrence.orderGoodsNo);
      const storedKeys = linked.flatMap(row => row.purchaseItemId ? [`purchase:${row.purchaseItemId}`] : row.additionalOrderItemId ? [`additional:${row.additionalOrderItemId}`] : []);
      const suggested = suggestQcMatch(occurrence, targets);
      const candidates = (storedKeys.length ? targets.filter(target => storedKeys.includes(target.id)) : targets.filter(target => target.id === suggested.targetItemId || suggested.candidates.some(candidate => candidate.itemId === target.id)))
        .map(target => ({ targetKey: target.id, purchaseId: target.purchaseId, purchaseName: target.purchaseName, accountLabel: accountRows.find(row => target.id === (row.purchaseItemId ? `purchase:${row.purchaseItemId}` : `additional:${row.additionalOrderItemId}`))?.label ?? "Conta a conferir", purchaseDate: origins.find(origin => origin.id === target.purchaseId)!.createdAt.toISOString(), name: target.name, variant: target.variant, alreadyHasQc: photographed.has(target.id) }));
      const targetKey = !conflict && candidates.length === 1 && (storedKeys.length === 1 || suggested.status === "MATCHED") ? candidates[0].targetKey : null;
      const status = conflict ? "error" : !occurrence.photos.length ? "ignored" : targetKey && photographed.has(targetKey) ? "unchanged" : targetKey ? "matched" : candidates.length ? "ambiguous" : "ignored";
      return { externalKey: occurrence.externalKey, title: occurrence.title, orderNo: occurrence.orderNo, photoCount: occurrence.photos.length, status, targetKey: status === "matched" ? targetKey : null, candidates,
        message: conflict ? "Identificadores HubBuy conflitantes." : status === "unchanged" ? "O produto já possui QC; fotos e capa serão preservadas." : status === "ignored" ? "Sem fotos ou correspondência segura." : status === "ambiguous" ? "Confirme a compra e a variação de destino." : "Correspondência identificada." };
    });
    return { partial: parsed.partial, orderCount: parsed.orderCount, photoCount: parsed.photoCount, rows };
  }

  async function prepare(raw: unknown, choices: Array<{ externalKey: string; targetKey: string | null }>) {
    const result = await preview(raw);
    if (new Set(choices.map(row => row.externalKey)).size !== choices.length) throw new DomainError("Ocorrências repetidas na seleção.", 400, "QC_MATCH_INVALID");
    const parsed = parseHubBuyImport(raw);
    const groups = new Map<string, { purchaseName: string; occurrences: QcOccurrenceInput[]; choices: Array<{ externalKey: string; targetKey: string }> }>();
    for (const choice of choices) {
      const row = result.rows.find(row => row.externalKey === choice.externalKey);
      if (!row) throw new DomainError("Ocorrência desconhecida.", 400, "QC_MATCH_INVALID");
      if (!choice.targetKey) continue;
      const target = row.candidates.find(target => target.targetKey === choice.targetKey);
      if (row.status === "error" || !target || target.alreadyHasQc || !row.photoCount) throw new DomainError("O destino mudou ou já possui QC. Analise o JSON novamente.", 409, "QC_MATCH_INVALID");
      const group = groups.get(target.purchaseId) ?? { purchaseName: target.purchaseName, occurrences: [], choices: [] };
      group.occurrences.push(parsed.occurrences.find(occurrence => occurrence.externalKey === row.externalKey)!);
      group.choices.push({ externalKey: row.externalKey, targetKey: choice.targetKey }); groups.set(target.purchaseId, group);
    }
    if (!groups.size) throw new DomainError("Selecione ao menos uma correspondência elegível.", 400, "QC_MATCH_INVALID");
    const prepared = [];
    for (const [purchaseId, group] of groups) {
      try {
        const orders = new Map<string | null, { orderNo: string | null; goodsList: unknown[] }>();
        for (const occurrence of group.occurrences) {
          const order = orders.get(occurrence.orderNo) ?? { orderNo: occurrence.orderNo, goodsList: [] };
          order.goodsList.push({ ...occurrence, goodsName: occurrence.title, freePhotos: occurrence.photos.map(photo => photo.url) }); orders.set(occurrence.orderNo, order);
        }
        const manifest = await qc.prepare(purchaseId, { code: 0, data: { list: [...orders.values()] } });
        const chosen = group.choices.filter(choice => manifest.rows.some(row => row.externalKey === choice.externalKey));
        prepared.push({ purchaseId, purchaseName: group.purchaseName, importId: manifest.importId, revision: manifest.revision, choices: chosen, error: null });
      } catch (error) {
        prepared.push({ purchaseId, purchaseName: group.purchaseName, importId: null, revision: 0, choices: group.choices, error: error instanceof DomainError ? error.message : "Não foi possível preparar esta compra." });
      }
    }
    return { groups: prepared };
  }
  return { capabilities, preview, prepare };
}
