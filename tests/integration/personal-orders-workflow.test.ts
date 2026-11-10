import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { hubbuyAccounts, logisticsPackages, purchaseCostTrackings } from "@/lib/db/schema";
import { ensurePersonalWorkspace } from "@/lib/domain/personal-workspaces";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { logisticsPackageServices } from "@/lib/domain/logistics-package-services";
import { listLogisticsPackages } from "@/lib/domain/logistics-package-list";
import { packageCostServices } from "@/lib/domain/package-cost-services";
import { warehouseQuerySchema, warehouseServices } from "@/lib/domain/warehouse-services";
import { favorite, fixture, type Fixture } from "./helpers";

let f: Fixture;
beforeEach(async () => { f = await fixture(":memory:", "orders"); });
afterEach(() => f.client.close());

describe("personal orders, warehouse and packages", () => {
  it("keeps costs, receipt, reservations and package history inside the owner's active space", async () => {
    const { workspace } = await ensurePersonalWorkspace(f.db, "alice");
    await f.alice.selectWorkspace(workspace.id, "workspace");

    const savedFavorite = await f.alice.saveFavorite({ ...favorite, name: "Favorito pessoal" }, undefined, workspace.id);
    const purchase = await f.alice.savePurchase({ name: "Compra pessoal de logística" }, undefined, workspace.id);
    await f.alice.addFavoriteToPurchase({ favoriteId: savedFavorite!.id, personId: "alice", quantity: 2, unitPriceCents: favorite.priceCents }, workspace.id);
    await f.alice.finalizePurchase(purchase!.id, true, workspace.id);

    const tracking = await f.db.select().from(purchaseCostTrackings).where(eq(purchaseCostTrackings.purchaseId, purchase!.id)).get();
    expect(tracking?.workspaceId).toBe(workspace.id);
    const costs = packageCostServices(f.db, "alice", undefined, workspace.id);
    const detail = await costs.getTracking(tracking!.id);
    expect(detail.tracking.workspaceId).toBe(workspace.id);
    expect(detail.members.map(person => person.id)).toEqual(["alice"]);
    expect((await costs.list(workspace.id)).map(row => row.tracking.id)).toEqual([tracking!.id]);
    expect(await costs.getSettings(workspace.id)).toMatchObject({ workspaceId: workspace.id, pixBps: 100, cardBps: 500 });

    const account = await hubbuyBalanceServices(f.db, "alice", workspace.id).createAccount({
      workspaceId: workspace.id,
      idempotencyKey: "personal-orders-account",
      label: "Conta pessoal",
      confirmZeroBalance: true,
    });
    expect(await f.db.select().from(hubbuyAccounts).where(eq(hubbuyAccounts.id, account.accountId)).get()).toMatchObject({ workspaceId: workspace.id, status: "active" });

    const warehouse = warehouseServices(f.db, "alice");
    const query = warehouseQuerySchema.parse({ workspaceId: workspace.id, pageSize: "100" });
    let stock = await warehouse.list(query, workspace.id);
    expect(stock.rows).toHaveLength(1);
    expect(stock.rows[0].participants.map(person => person.personId)).toEqual(["alice"]);
    await warehouse.execute(workspace.id, "personal-receive", {
      operation: "receive", costItemId: stock.rows[0].costItemId, expectedRevision: stock.rows[0].revision,
      accountId: account.accountId, units: [0, 1], reason: "Chegada pessoal conferida",
    });
    stock = await warehouse.list(query, workspace.id);
    expect(stock.rows[0].availableUnits).toEqual([0, 1]);

    const reservation = await warehouse.execute(workspace.id, "personal-reserve", {
      operation: "reserve", accountId: account.accountId, name: "Pacote pessoal",
      selection: [{ costItemId: stock.rows[0].costItemId, expectedRevision: stock.rows[0].revision, units: [1] }],
      reason: "Reserva pessoal conferida",
    });
    const packages = logisticsPackageServices(f.db, "alice");
    let packageDetail = await packages.get(reservation.id);
    expect(packageDetail.pkg).toMatchObject({ workspaceId: workspace.id, name: "Pacote pessoal" });
    expect(packageDetail.unitCount).toBe(1);
    expect((await listLogisticsPackages(f.db, "alice", { workspaceId: workspace.id })).rows.map(row => row.pkg.id)).toContain(reservation.id);

    await f.alice.selectWorkspace("workspace", workspace.id);
    await expect(costs.getTracking(tracking!.id)).rejects.toMatchObject({ status: 409, code: "WORKSPACE_CONTEXT_CHANGED" });
    await expect(warehouse.execute(workspace.id, "stale-personal-reserve", {
      operation: "release", packageId: reservation.id, expectedRevision: packageDetail.pkg.revision,
      reservationIds: packageDetail.reservations.map(row => row.id), reason: "Tentativa em espaço desatualizado",
    })).rejects.toMatchObject({ status: 409, code: "WORKSPACE_CONTEXT_CHANGED" });
    await expect(logisticsPackageServices(f.db, "bob").get(reservation.id)).rejects.toMatchObject({ status: 403 });
    expect(await f.db.select().from(logisticsPackages).where(eq(logisticsPackages.id, reservation.id)).get()).toMatchObject({ revision: packageDetail.pkg.revision, workspaceId: workspace.id });

    await f.alice.selectWorkspace(workspace.id, "workspace");
    packageDetail = await packages.get(reservation.id);
    expect(packageDetail.reservations).toHaveLength(1);
  });
});
