import { readCostTracking, readWarehouseCostKeys } from "@/lib/domain/package-cost-reading";
import { expect, it } from "vitest";
import { fixture } from "./helpers";
import { warehouseServices, warehouseQuerySchema } from "@/lib/domain/warehouse-services";
import { warehousePage } from "@/lib/domain/warehouse-query";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { orderStage } from "@/components/orders/orders-list-state";

it("searches real product, variant and order origin across pages, combines views with filters and preserves scope", async () => {
  const f = await fixture(":memory:", "orders");
  try {
    const purchase = await f.alice.savePurchase({ name: "Pedido coletivo QA identificável" });
    for (let index = 0; index < 25; index++) await f.alice.saveManualItem({ name: `Produto catálogo QA ${String(index).padStart(2, "0")}`, url: `https://shop.test/catalog-${index}`, variant: index === 24 ? "Modelo exclusivo índigo" : "Padrão", quantity: index === 24 ? 3 : 1, unitPriceCents: 100, sharingMode: "equal", participants: [{ personId: "alice" }] });
    await f.alice.finalizePurchase(purchase.id, true);
    const service = warehouseServices(f.db, "alice");
    const first = await service.list(warehouseQuerySchema.parse({ pageSize: 20 }));
    const second = await service.list(warehouseQuerySchema.parse({ pageSize: 20, page: 1 }));
    expect(first.pagination).toMatchObject({ total: 25, hasMore: true });
    expect(first.rows).toHaveLength(20);
    expect(second.rows).toHaveLength(5);
    const exactIds = [first.rows[0].costItemId, second.rows[0].costItemId];
    const exact = await service.list(warehouseQuerySchema.parse({ itemIds: exactIds.join(","), pageSize: 100 }));
    expect(exact.rows.map(row => row.costItemId).sort()).toEqual(exactIds.sort());
    expect((await warehousePage(f.db, "other", warehouseQuerySchema.parse({ itemIds: exactIds.join(",") }))).total).toBe(0);
    expect(warehouseQuerySchema.safeParse({ itemIds: "same,same" }).success).toBe(false);
    expect(warehouseQuerySchema.safeParse({ itemIds: Array.from({ length: 101 }, (_, i) => String(i)).join(",") }).success).toBe(false);
    expect(new Set([...first.rows, ...second.rows].map(row => row.costItemId)).size).toBe(25);
    const query = (raw: object) => warehousePage(f.db, "workspace", warehouseQuerySchema.parse(raw));
    expect((await query({ search: "modelo exclusivo" })).total).toBe(1);
    expect((await query({ search: "COLETIVO QA" })).total).toBe(25);
    expect((await query({ search: first.rows[0].order.id })).total).toBe(25);
    expect((await query({ search: "%' OR 1=1 --" })).total).toBe(0);
    expect((await query({ view: "awaiting" })).total).toBe(25);
    expect((await query({ view: "available" })).total).toBe(0);
    const account = await hubbuyBalanceServices(f.db, "alice").createAccount({ workspaceId: "workspace", idempotencyKey: "catalog-account", label: "Catálogo QA", confirmZeroBalance: true });
    let row = (await service.list()).rows.find(item => item.quantity === 3)!;
    await service.execute("workspace", "catalog-receipt", { operation: "receive", costItemId: row.costItemId, expectedRevision: row.revision, accountId: account.accountId, units: [0, 1], reason: "Conferência sintética parcial" });
    expect((await query({ view: "warehouse", status: "awaiting", person: "alice", account: account.accountId })).total).toBe(1);
    expect((await query({ view: "warehouse", person: "bob" })).total).toBe(0);
    expect((await query({ view: "warehouse", origin: "additional" })).total).toBe(0);
    row = (await service.list()).rows.find(item => item.costItemId === row.costItemId)!;
    expect(orderStage(row, [])).toMatchObject({ label: "Etapas diferentes", detail: "1 a caminho · 2 no armazém" });
    await service.execute("workspace", "catalog-reserve", { operation: "reserve", accountId: account.accountId, name: "Reserva catálogo", selection: [{ costItemId: row.costItemId, expectedRevision: row.revision, units: [0, 1] }], reason: "Reserva sintética completa" });
    expect((await query({ view: "warehouse" })).total).toBe(1);
    expect((await query({ view: "available" })).total).toBe(0);
    const reservedData = await service.list(warehouseQuerySchema.parse({ view: "warehouse" }));
    expect(orderStage(reservedData.rows[0], reservedData.packages)).toMatchObject({ label: "Etapas diferentes", detail: "1 a caminho · 2 no armazém · Reservadas no pacote Reserva catálogo · 2 unidades" });
    expect((await query({ view: "warehouse", status: "sent" })).total).toBe(0);
    expect((await warehousePage(f.db, "other", warehouseQuerySchema.parse({ search: "catálogo" }))).total).toBe(0);
    await expect(warehouseServices(f.db, "outsider").list(warehouseQuerySchema.parse({}))).rejects.toMatchObject({ status: 403 });
    expect(warehouseQuerySchema.safeParse({ view: "invalid" }).success).toBe(false);
  } finally { f.client.close(); }
});

it("reads cost keys across trackings with fewer queries and preserves both page orders", async () => {
  const f = await fixture(":memory:", "orders");
  try {
    for (const price of [450, 150, 450, 200]) {
      const purchase = await f.alice.savePurchase({ name: "Compra de ordenação" });
      await f.alice.saveManualItem({ name: "Custo QA", url: "https://shop.test/cost", quantity: 2, unitPriceCents: price, personId: "alice" });
      await f.alice.finalizePurchase(purchase.id, true);
    }
    const service = warehouseServices(f.db, "alice");
    const rows = (await service.list(warehouseQuerySchema.parse({ search: "Custo QA" }))).rows;
    const ids = [...new Set(rows.map(row => row.cost.trackingId))];
    let selects = 0;
    const counting = { select: ((...args: unknown[]) => {
      selects++;
      return Reflect.apply(f.db.select, f.db, args);
    }) as typeof f.db.select };
    const baselineStart = performance.now();
    for (const id of ids) await readCostTracking(counting, "alice", id, "order");
    const baseline = selects;
    const baselineMs = performance.now() - baselineStart;
    selects = 0;
    const batchStart = performance.now();
    const keys = await readWarehouseCostKeys(counting, "workspace", ids);
    const batchedMs = performance.now() - batchStart;
    expect(selects).toBe(13);
    expect(selects).toBeLessThan(baseline);
    const cents = (row: typeof rows[number]) => row.financial!.total.finalCents ?? row.financial!.total.knownCents;
    expect(new Map(keys.map(key => [key.id, key.cents]))).toEqual(new Map(rows.map(row => [row.costItemId, cents(row)])));
    for (const direction of ["asc", "desc"]) {
      const expected = [...rows].sort((a,b) => (direction === "asc" ? 1 : -1) * (cents(a) - cents(b)) || (a.costItemId < b.costItemId ? -1 : 1));
      const actual = [];
      for (const page of [0, 1]) actual.push(...(await service.list(warehouseQuerySchema.parse({ search: "Custo QA", sort: "cost", direction, pageSize: 2, page }))).rows);
      expect(actual.map(row => row.costItemId)).toEqual(expected.map(row => row.costItemId));
    }
    console.info("Cost-key SELECT builders and elapsed ms", { baseline, batched: selects, baselineMs, batchedMs });
  } finally { f.client.close(); }
});
