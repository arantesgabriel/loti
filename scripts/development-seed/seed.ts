import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "../../src/lib/db/connection";
import * as s from "../../src/lib/db/schema";
import journal from "../../drizzle/meta/_journal.json";
import { createAuth } from "../../src/lib/auth/config";
import { createServices } from "../../src/lib/domain/services";
import { packageCostServices } from "../../src/lib/domain/package-cost-services";
import { warehouseServices } from "../../src/lib/domain/warehouse-services";
import { logisticsPackageServices } from "../../src/lib/domain/logistics-package-services";
import { hubbuyBalanceServices } from "../../src/lib/domain/hubbuy-balance-services";
import { invitationService } from "../../src/lib/domain/invitations";
import { resolveProductCategory } from "../../src/lib/domain/categories";
import { people, products, rounds, seedVersion, seedWorkspaceId } from "./catalog";
import { migrationHashMatches } from "./migrations";

export class DevelopmentSeedError extends Error {
  constructor(message: string) { super(message); this.name = "DevelopmentSeedError"; }
}
const fingerprint = createHash("sha256").update(JSON.stringify({ seedVersion, people, products, rounds })).digest("hex");
type Receipt = { catalog_hash: string; status: string; report_json: string | null };
type SeedOptions = { beforeCheckpointCommit?: (key: string) => void };

/** Internal builder. Public CLI is the sole remote entrypoint and validates dev first.
 * Each domain command + receipt commits together. Short transactions support Turso;
 * a retry resumes without repeating payments, users, reservations or refunds.
 */
export async function seedDevelopmentWorkspace(db: AppDatabase, password: string, options: SeedOptions = {}) {
  if (password.length < 16 || password.length > 128) throw new DevelopmentSeedError("A senha de desenvolvimento deve ter 16 a 128 caracteres.");
  const migrationTable = (await db.all(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`))[0];
  if (!migrationTable) throw new DevelopmentSeedError("Aplique primeiro as migrations pelo workflow de dev. O seed não aplica migrations.");
  const latest = journal.entries.at(-1)!;
  const migrationSource = readFileSync(resolve("drizzle", `${latest.tag}.sql`), "utf8");
  const applied = (await db.all<{ hash: string; created_at: number }>(sql`SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1`))[0];
  if (Number(applied?.created_at) !== latest.when || !migrationHashMatches(migrationSource, applied?.hash)) {
    throw new DevelopmentSeedError("Migrations incompatíveis com este checkout. Aguarde o workflow de dev correspondente antes do seed.");
  }
  // Tool-only receipts in dev; not application migrations or domain tables.
  await db.run(sql`CREATE TABLE IF NOT EXISTS loti_dev_seed_runs (id TEXT PRIMARY KEY, catalog_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('building','complete')), report_json TEXT)`);
  await db.run(sql`CREATE TABLE IF NOT EXISTS loti_dev_seed_steps (seed_id TEXT NOT NULL REFERENCES loti_dev_seed_runs(id), step_key TEXT NOT NULL, result_json TEXT NOT NULL, PRIMARY KEY(seed_id,step_key))`);
  await db.transaction(async tx => {
    const receipt = (await tx.all<Receipt>(sql`SELECT * FROM loti_dev_seed_runs WHERE id=${seedVersion}`))[0];
    if (receipt && receipt.catalog_hash !== fingerprint) throw new DevelopmentSeedError("O catálogo mudou sem nova versão do seed. Recusada a mistura de cenários.");
    if (!receipt) {
      if (await tx.select().from(s.workspaces).where(eq(s.workspaces.id, seedWorkspaceId)).get()) {
        throw new DevelopmentSeedError("Já existe um grupo com o ID reservado, sem recibo deste seed. Nenhum grupo será adotado ou sobrescrito.");
      }
      await tx.run(sql`INSERT INTO loti_dev_seed_runs(id,catalog_hash,status) VALUES(${seedVersion},${fingerprint},'building')`);
    }
  }, { behavior: "immediate" });
  const prior = (await db.all<Receipt>(sql`SELECT * FROM loti_dev_seed_runs WHERE id=${seedVersion}`))[0];
  if (prior?.status === "complete") return { ...JSON.parse(prior.report_json!), status: "already-applied" as const };

  async function step<T>(key: string, operation: (tx: AppDatabase) => Promise<T>): Promise<T> {
    return db.transaction(async tx => {
      const receipt = (await tx.all<{ result_json: string }>(sql`SELECT result_json FROM loti_dev_seed_steps WHERE seed_id=${seedVersion} AND step_key=${key}`))[0];
      if (receipt) return JSON.parse(receipt.result_json) as T;
      const result = await operation(tx as unknown as AppDatabase);
      options.beforeCheckpointCommit?.(key);
      await tx.run(sql`INSERT INTO loti_dev_seed_steps(seed_id,step_key,result_json) VALUES(${seedVersion},${key},${JSON.stringify(result)})`);
      return result;
    }, { behavior: "immediate" });
  }

  await step("workspace", async tx => {
    await tx.insert(s.workspaces).values({ id: seedWorkspaceId, name: "Compras entre amigos", createdAt: new Date() }).run();
    return seedWorkspaceId;
  });
  const members: string[] = [];
  for (const [index, person] of people.entries()) {
    members.push(await step(`member-${index}`, async tx => {
      if (await tx.select().from(s.user).where(eq(s.user.email, person.email)).get()) throw new DevelopmentSeedError("Um email reservado já existe fora deste seed. Nenhuma conta ou senha existente será alterada.");
      const member = (await createAuth(tx, true).api.signUpEmail({ body: { ...person, password } })).user;
      const now = new Date();
      await tx.insert(s.workspaceMembers).values({ workspaceId: seedWorkspaceId, userId: member.id, createdAt: now }).run();
      await tx.insert(s.userPreferences).values({ userId: member.id, activeWorkspaceId: seedWorkspaceId, favoritesView: index % 2 ? "cards" : "list", createdAt: now, updatedAt: now }).run();
      return member.id;
    }));
  }
  const actor = members[0];
  const accountIds: string[] = [];
  for (const [index, label] of ["Compras compartilhadas", "Eletrônicos e acessórios", "Compras anteriores"].entries()) {
    accountIds.push(await step(`account-${index}`, async tx => (await hubbuyBalanceServices(tx, actor).createAccount({ workspaceId: seedWorkspaceId, label, email: `compras${index + 1}@loti.test`, confirmZeroBalance: true, idempotencyKey: `${seedVersion}-account-${index}` })).accountId));
  }
  await step("archive-account", async tx => {
    const service = hubbuyBalanceServices(tx, actor), state = await service.getAccountBalance(accountIds[2]);
    await service.archiveAccount(accountIds[2], { expectedRevision: state.account.revision, idempotencyKey: `${seedVersion}-archive`, reason: "Rodada anterior encerrada sem saldo pendente." });
    return accountIds[2];
  });

  for (let owner = 0; owner < members.length; owner++) {
    for (let index = 0; index < 10; index++) {
      const product = products[(owner * 6 + index) % products.length];
      const collectionId = await step(`collection-${owner}-${product.collection}`, async tx => (await createServices(tx, members[owner]).saveCollection({ name: product.collection }))!.id);
      await step(`favorite-${owner}-${index}`, async tx => (await createServices(tx, members[owner]).saveFavorite({
        name: product.name, variant: product.variant, url: product.url, priceCents: index === 9 ? null : product.priceCents,
        collectionId, qcStatus: index % 5 === 0 ? "approved" : index % 7 === 0 ? "rejected" : "not_reviewed",
        notes: index % 3 === 0 ? "Conferir medidas e disponibilidade antes da próxima compra." : null,
      }))!.id);
    }
  }

  const trackings: string[] = [];
  const costIds: string[][] = [];
  for (const [round, specification] of rounds.entries()) {
    const purchaseId = await step(`purchase-${round}`, async tx => (await createServices(tx, actor).savePurchase({ name: specification.name, hubbuyAccount: "Compras compartilhadas" })).id);
    for (let index = 0; index < specification.size; index++) {
      const product = products[specification.start + index], owner = (round * 2 + index) % members.length;
      await step(`item-${round}-${index}`, async tx => (await createServices(tx, actor).saveManualItem({
        name: product.name, url: product.url, variant: product.variant, quantity: 1 + index % 3,
        unitPriceCents: !specification.paid && index === specification.size - 1 ? null : product.priceCents,
        sharingMode: "equal", participants: (index % 4 === 0 ? [members[owner], members[(owner + 1) % members.length]] : [members[owner]]).map(personId => ({ personId })),
      }))!.id);
    }
    await step(`finalize-${round}`, async tx => { await createServices(tx, actor).finalizePurchase(purchaseId, true); return purchaseId; });
    const trackingId = await step(`tracking-${round}`, async tx => (await packageCostServices(tx, actor).startTracking(purchaseId)).id);
    trackings.push(trackingId);
    costIds.push([]);
    for (let index = 0; index < specification.size; index++) {
      const product = products[specification.start + index];
      const costId = await step(`cost-${round}-${index}`, async tx => {
        const service = packageCostServices(tx, actor), detail = await service.getTracking(trackingId);
        const item = detail.items.find(item => item.original.name === product.name)!;
        if (specification.paid || index < specification.size - 1) await service.saveItemCosts(trackingId, {
          expectedRevision: detail.tracking.revision, itemId: item.id, effectivePriceState: "known", effectivePriceUnitCents: product.priceCents,
          chinaFreightState: index % 3 ? "known" : "no_charge", chinaFreightUnitCents: index % 3 ? 350 + index * 50 : null,
        });
        return item.id;
      });
      costIds[round].push(costId);
    }
    if (specification.paid) {
      await step(`payment-method-${round}`, async tx => {
        const service = packageCostServices(tx, actor), detail = await service.getTracking(trackingId);
        await service.saveCharge(trackingId, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision, chargeType: "products", paymentMethod: round === 1 ? "card" : "pix", feeBps: round === 1 ? 500 : 100 });
        return detail.productsCharge!.id;
      });
      await step(`payment-${round}`, async tx => {
        const service = packageCostServices(tx, actor), detail = await service.getTracking(trackingId);
        await service.markChargePaid(trackingId, detail.productsCharge!.id, { expectedRevision: detail.tracking.revision });
        return trackingId;
      });
      for (let index = 0; index < specification.size; index++) {
        if (round === 0 && index >= 8) continue;
        const row = (await warehouseServices(db, actor).list()).rows.find(row => row.costItemId === costIds[round][index])!;
        await step(`arrival-${round}-${index}`, async tx => {
          const service = warehouseServices(tx, actor);
          const count = round === 1 ? Math.max(1, row.quantity - 1) : row.quantity;
          await service.execute(seedWorkspaceId, `${seedVersion}-arrival-${round}-${index}`, { operation: "receive", costItemId: row.costItemId, expectedRevision: row.revision, accountId: accountIds[0], units: Array.from({ length: count }, (_, unit) => unit), reason: "Conferência manual das unidades recebidas no armazém." });
          return row.costItemId;
        });
      }
    }
  }

  const packagePlans = [
    { name: "Roupas e calçados", round: 0, items: [0, 1, 2], stage: "received", close: true, freight: true, customs: true },
    { name: "Acessórios em viagem", round: 0, items: [3, 4, 5], stage: "sent", close: true, freight: true, customs: false },
    { name: "Peças para o próximo envio", round: 0, items: [6, 7], stage: "preparing", close: false, freight: false, customs: false },
    { name: "Componentes do computador", round: 1, items: [0, 1, 2], stage: "preparing", close: true, freight: true, customs: false },
    { name: "Periféricos do escritório", round: 1, items: [3, 4, 5], stage: "preparing", close: false, freight: false, customs: false },
    { name: "Áudio e utilidades", round: 3, items: [0, 1, 2, 3], stage: "preparing", close: true, freight: false, customs: false },
  ] as const;
  const packageIds: string[] = [];
  for (const [index, plan] of packagePlans.entries()) {
    const rows = (await warehouseServices(db, actor).list()).rows;
    const packageId = await step(`package-${index}`, async tx => {
      const service = warehouseServices(tx, actor);
      return (await service.execute(seedWorkspaceId, `${seedVersion}-package-${index}`, {
        operation: "reserve", accountId: accountIds[0], name: plan.name, reason: "Agrupar unidades disponíveis para envio coletivo.",
        selection: plan.items.map(item => { const row = rows.find(row => row.costItemId === costIds[plan.round][item])!; return { costItemId: row.costItemId, expectedRevision: row.revision, units: [row.availableUnits[0]] }; }),
      })).id;
    });
    packageIds.push(packageId);
    async function command(key: string, body: Record<string, unknown>) {
      const detail = await logisticsPackageServices(db, actor).get(packageId);
      await step(`package-${index}-${key}`, async tx => {
        const service = logisticsPackageServices(tx, actor);
        await service.execute(packageId, `${seedVersion}-package-${index}-${key}`, { expectedRevision: detail.pkg.revision, reason: "Registro manual para a rodada de compras compartilhadas.", ...body });
        return packageId;
      });
    }
    if (plan.close) await command("close", { operation: "close_content", confirmed: true });
    if (plan.freight) {
      await command("freight", { operation: "pay_charge", charge: "freight", amountCents: 18990 + index * 4500, paymentMethod: "pix", feeBps: 100, confirmed: true });
      await command("weight", { operation: "weight", weightGrams: 1850 + index * 620 });
    }
    if (plan.customs) {
      await command("customs", { operation: "pay_charge", charge: "customs", amountCents: 8790, paymentMethod: "pix", feeBps: 0, confirmed: true });
      await command("financial", { operation: "close_financial", confirmed: true });
    }
    if (plan.stage === "sent" || plan.stage === "received") await command("dispatch", { operation: "dispatch", confirmed: true });
    if (plan.stage === "received") await command("receive", { operation: "receive", confirmed: true });
  }

  const refundIds: string[] = [];
  for (const index of [8, 9]) {
    refundIds.push(await step(`refund-${index}`, async tx => {
      const service = packageCostServices(tx, actor), detail = await service.getTracking(trackings[0]);
      const item = detail.items.find(item => item.id === costIds[0][index])!;
      const next = await service.requestRefund(trackings[0], { expectedRevision: detail.tracking.revision, costItemId: item.id, quantity: 1,
        requestedProductCents: products[index].priceCents, requestedChinaCents: 0, packageRemovals: [], unassignedQuantity: 1,
        reason: index === 8 ? "Vendedor sem estoque da variação selecionada." : "Pedido cancelado antes do envio pelo vendedor.",
      });
      return next.refunds.find(refund => refund.costItemId === item.id)!.id;
    }));
  }
  await step("refund-received", async tx => {
    const service = packageCostServices(tx, actor), detail = await service.getTracking(trackings[0]);
    await service.receiveRefund(trackings[0], refundIds[1], { expectedRevision: detail.tracking.revision,
      receivedProductCents: products[9].priceCents - 1000, receivedChinaCents: 0, destination: "hubbuy", accountId: accountIds[0],
      receivedProductCnyMinor: 60000, receivedChinaCnyMinor: 0, nativeEvidence: "Par BRL/CNY representativo registrado para o cenário de desenvolvimento.", confirmed: true });
    return refundIds[1];
  });
  for (const [index, kind] of ["promotional_bonus", "documented_debit"].entries()) {
    await step(`balance-${kind}`, async tx => {
      const service = hubbuyBalanceServices(tx, actor), state = await service.getAccountBalance(accountIds[0]);
      await service.recordManualAdjustment(accountIds[0], { kind, expectedRevision: state.account.revision, idempotencyKey: `${seedVersion}-${kind}`,
        occurredAt: new Date().toISOString(), amountCnyMinor: index ? 1800 : 500, shares: [{ personId: members[4], amountCnyMinor: index ? 1800 : 500 }],
        reason: index ? "Simulação e pesagem do envio." : "Bônus promocional da conta.",
      });
      return accountIds[0];
    });
  }
  for (const index of [0, 1]) {
    const product = products[index ? 22 : 28];
    const orderId = await step(`additional-${index}`, async tx => {
      const service = packageCostServices(tx, actor), detail = await service.getTracking(trackings[1]);
      return (await service.createAdditionalOrder(trackings[1], { expectedRevision: detail.tracking.revision, idempotencyKey: `${seedVersion}-additional-${index}`, accountId: accountIds[0],
        items: [{ name: product.name, variant: product.variant, url: product.url, platform: "other", visualKey: resolveProductCategory(product.name), quantity: index ? 1 : 2, itemOrder: 0,
          nativeProductState: "known", nativeProductCnyMinor: index ? 12900 : 5000, nativeChinaState: "no_charge", nativeChinaCnyMinor: null,
          participants: [{ personId: members[4], weightMode: "equal", weight: 1 }],
        }],
      })).orderId;
    });
    if (!index) await step("additional-paid", async tx => {
      const service = packageCostServices(tx, actor), detail = await service.getTracking(trackings[1]);
      await service.recordAdditionalOrderMixedPayment(trackings[1], orderId, { expectedRevision: detail.tracking.revision, idempotencyKey: `${seedVersion}-additional-paid`, useOwnBalance: true, external: null, balanceFunding: [] });
      return orderId;
    });
  }
  for (const email of ["mariana.ferreira@loti.test", "lucas.oliveira@loti.test"]) {
    await step(`invitation-${email}`, async tx => { await invitationService(tx).issue(actor, email); return email; });
  }
  const activePurchaseId = await step("active-purchase", async tx => (await createServices(tx, actor).savePurchase({ name: "Próxima compra coletiva", hubbuyAccount: "Eletrônicos e acessórios" })).id);
  for (let index = 0; index < 10; index++) {
    const product = products[(index + 13) % products.length];
    const itemId = await step(`active-item-${index}`, async tx => (await createServices(tx, actor).saveManualItem({
      name: product.name, url: product.url, variant: product.variant, quantity: 1 + index % 4, unitPriceCents: index === 9 ? null : product.priceCents,
      sharingMode: index === 0 ? "percentage" : "equal", participants: index === 0 ? [{ personId: members[0], percentageBps: 6000 }, { personId: members[1], percentageBps: 4000 }] : [{ personId: members[index % members.length] }],
      notes: index === 9 ? "Aguardando confirmação do preço do fornecedor." : null,
    }))!.id);
    if (index < 4) await step(`active-cart-${index}`, async tx => { await createServices(tx, actor).setCartStatus(itemId, "added"); return itemId; });
  }
  const report = await (async () => {
    const tx = db;
    const data = await createServices(tx, actor).getData(), warehouse = await warehouseServices(tx, actor).list();
    const accounts = await hubbuyBalanceServices(tx, actor).listAccounts(seedWorkspaceId);
    const account = await hubbuyBalanceServices(tx, actor).getAccountBalance(accountIds[0]);
    const packageRows = await tx.select().from(s.logisticsPackages).where(eq(s.logisticsPackages.workspaceId, seedWorkspaceId)).all();
    if (data.members.length !== 5 || data.favorites.length !== 50 || data.purchases.length !== 5 || packageRows.length !== 6 || !account.reconciled) throw new DevelopmentSeedError("O cenário não fechou as contagens ou a conciliação financeira esperadas.");
    return { version: seedVersion, workspaceId: seedWorkspaceId, logins: people.map(person => person.email),
      members: data.members.length, collections: data.collections.length, favorites: data.favorites.length,
      finalizedPurchases: data.purchases.filter(purchase => purchase.status === "finalized").length,
      activePurchaseId, purchaseProductLines: data.items.length, purchaseUnits: data.items.reduce((n, item) => n + item.quantity, 0),
      orderLines: warehouse.rows.length, availableWarehouseUnits: warehouse.rows.reduce((n, row) => n + row.availableUnits.length, 0),
      packages: packageRows.map(pkg => ({ id: pkg.id, name: pkg.name, stage: pkg.stage, contentClosed: !!pkg.contentClosedAt, freightPaid: !!pkg.freightPaidAt, financialClosed: !!pkg.financialClosedAt })),
      hubbuyAccounts: accounts.length, balanceCnyMinor: account.ledgerBalanceCnyMinor,
      refunds: refundIds.length, pendingInvitations: 2, qcPhotos: 0,
    };
  })();
  await db.run(sql`UPDATE loti_dev_seed_runs SET status='complete',report_json=${JSON.stringify(report)} WHERE id=${seedVersion} AND catalog_hash=${fingerprint}`);
  return { ...report, status: "created" as const };
}
