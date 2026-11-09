import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import type {WarehouseData} from "@/components/orders/orders-screen";

test("keeps selections between pages and cancels without writes; rejects an entire stale selection",async({page})=>{
  const marker=JSON.parse(readFileSync(`${resolve(process.env.LOTI_ORDERS_TRANSITION_DATABASE!.slice(5))}.scenario.json`,"utf8"));
  test.skip(marker.scenarioId!=="orders-workflow-v2","Uses the separate new workflow fixture");
  const baseURL=process.env.LOTI_ORDERS_TRANSITION_BASE_URL??"http://localhost:3139";
  expect((await page.request.post("/api/auth/sign-in/email",{headers:{Origin:baseURL},data:{email:"pessoa-a@loti.test",password:"Loti-Orders-QA-Only-2026!"}})).ok()).toBe(true);
  const initial:WarehouseData=(await (await page.request.get("/api/warehouse")).json()).data;
  expect(initial.rows).toHaveLength(2);
  expect(initial.rows.every(r=>r.availableUnits.length>0)).toBe(true);
  const beforePackages=(await (await page.request.get("/api/logistics/packages?filter=preparing")).json()).data;
  // Exercise the page boundary with real synthetic rows; only the GET envelope
  // is paginated artificially. Mutations below hit the actual server/services.
  await page.route("**/api/warehouse?**",async route=>{
    const pageIndex=Number(new URL(route.request().url()).searchParams.get("page")??0);
    await route.fulfill({json:{data:{...initial,rows:[initial.rows[pageIndex]],pagination:{page:pageIndex,pageSize:20,total:21,hasMore:pageIndex===0}}}});
  });
  await page.goto("/orders");
  const firstRowSelection=page.getByLabel(`Unidades de ${initial.rows[0].name} para selecionar`);
  await firstRowSelection.fill("1");
  await page.getByRole("button",{name:"Próxima",exact:true}).click();
  await expect(page.locator(".orders-row").filter({hasText:initial.rows[1].name})).toBeVisible();
  await page.getByLabel(`Unidades de ${initial.rows[1].name} para selecionar`).fill("1");
  await expect(page.locator(".orders-selection")).toContainText("2 unidades selecionadas");
  await page.getByRole("button",{name:"Anterior",exact:true}).click();
  await expect(firstRowSelection).toHaveValue("1");
  await page.getByRole("button",{name:"Montar pacote",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("2 itens · 2 unidades");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  const failed=await page.request.post("/api/warehouse",{headers:{Origin:baseURL},data:{workspaceId:marker.workspaceId,idempotencyKey:crypto.randomUUID(),command:{operation:"reserve",accountId:marker.accountId,name:"Invalid stale synthetic selection",reason:"Validate atomic cross-page selection",selection:initial.rows.map((r,index)=>({costItemId:r.costItemId,expectedRevision:r.revision+(index===1?1:0),units:[r.availableUnits[0]]}))}}});
  expect(failed.status()).toBe(409);
  const after:WarehouseData=(await (await page.request.get("/api/warehouse")).json()).data;
  expect(after.reservations).toEqual(initial.reservations);
  expect(after.rows.map(r=>r.revision)).toEqual(initial.rows.map(r=>r.revision));
  expect((await (await page.request.get("/api/logistics/packages?filter=preparing")).json()).data).toEqual(beforePackages);
});
