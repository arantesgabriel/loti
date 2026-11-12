import {readFileSync} from "node:fs";
import {test,expect,type Page} from "@playwright/test";
const fixture=JSON.parse(readFileSync(process.env.FREIGHT_REVIEW_MANIFEST??"data/freight-review-main.sqlite.scenario.json","utf8"));
async function confirm(page:Page){await page.getByRole("button",{name:"Conferir prévia",exact:true}).click();await expect(page.getByRole("heading",{name:"Confira antes de confirmar"})).toBeVisible();await page.getByLabel("Conferi os valores, participantes e efeitos deste registro.").check();await page.getByRole("button",{name:"Confirmar registro",exact:true}).click();}
test("30 physical units: topup, freight, native settlement, conversion and actual receipts",async({page})=>{
  await page.goto("/login");await page.getByLabel("Email",{exact:true}).fill(fixture.login);await page.getByLabel("Senha",{exact:true}).fill(fixture.password);await page.getByRole("button",{name:"Entrar",exact:true}).click();await page.waitForURL("**/favorites");
  await page.goto("/packages/accounts");
  const beforeCancel=(await (await page.request.get(`/api/hubbuy/accounts/${fixture.accountId}?workspaceId=${fixture.workspaceId}`)).json()).data;
  await page.getByRole("button",{name:"Ações",exact:true}).click();await page.getByRole("menuitem",{name:"Registrar recarga"}).click();await page.getByRole("button",{name:"Cancelar",exact:true}).click();
  const afterCancel=(await (await page.request.get(`/api/hubbuy/accounts/${fixture.accountId}?workspaceId=${fixture.workspaceId}`)).json()).data;expect(afterCancel.account.revision).toBe(beforeCancel.account.revision);expect(afterCancel.account.balanceCnyMinor).toBe(beforeCancel.account.balanceCnyMinor);
  await page.getByRole("button",{name:"Ações",exact:true}).click();await page.getByRole("menuitem",{name:"Registrar recarga"}).click();
  await page.getByLabel("CNY recebidos",{exact:true}).fill("398,30");await page.getByLabel("Valores do comprovante").selectOption("total_with_fee");await page.getByLabel("Total pago em BRL").fill("352,42");await page.getByRole("button",{name:"Atribuir o comprovante inteiro a mim"}).click();await page.getByLabel("Referência externa",{exact:true}).fill("synthetic-review-topup");await page.getByLabel("Motivo / descrição").fill("Synthetic review received topup");
  let lost=false;await page.route(`**/api/hubbuy/accounts/${fixture.accountId}/topups`,async route=>{if(route.request().method()==="POST"&&route.request().postDataJSON().operation==="record"&&!lost){lost=true;const response=await route.fetch();expect(response.ok()).toBe(true);await route.fulfill({status:503,json:{error:"Synthetic lost response"}});}else await route.continue();});
  await confirm(page);await expect(page.getByRole("heading",{name:"Tentativa pendente"})).toBeVisible();await page.getByRole("button",{name:"Conferir tentativa pendente"}).click();await expect(page.getByRole("dialog")).toHaveCount(0);expect(lost).toBe(true);
  await page.goto(`/packages/detail/${fixture.packageId}`);await page.getByRole("button",{name:"Conferir pagamento do frete",exact:true}).click();await page.getByLabel("Frete total em CNY").fill("768,60");await page.getByRole("button",{name:"Sugerir saldo antigo antes da recarga nova"}).click();await page.getByLabel("Autorizo os financiamentos cruzados",{exact:false}).check();await page.getByLabel("Referência do pagamento").fill("synthetic-review-freight");await page.getByLabel("Motivo / descrição").fill("Synthetic observed freight payment");
  await page.getByRole("button",{name:"Conferir prévia",exact:true}).click();await expect(page.locator(".financial-review")).toContainText("641,06");
  const financeUrl=`/api/logistics/packages/${fixture.packageId}/finance?workspaceId=${fixture.workspaceId}`,beforeRace=(await(await page.request.get(financeUrl)).json()).data;
  const changed=await page.request.post(`/api/logistics/packages/${fixture.packageId}`,{headers:{origin:"http://localhost:3147"},data:{workspaceId:fixture.workspaceId,idempotencyKey:"synthetic-content-race",command:{operation:"reopen_content",expectedRevision:beforeRace.freight.pkg.revision,confirmed:true,reason:"Synthetic independent package revision"}}});expect(changed.ok(),await changed.text()).toBe(true);const raceState=(await(await page.request.get(financeUrl)).json()).data;const closed=await page.request.post(`/api/logistics/packages/${fixture.packageId}`,{headers:{origin:"http://localhost:3147"},data:{workspaceId:fixture.workspaceId,idempotencyKey:"synthetic-content-close",command:{operation:"close_content",expectedRevision:raceState.freight.pkg.revision,confirmed:true,reason:"Synthetic content restored after revision"}}});expect(closed.ok(),await closed.text()).toBe(true);
  await page.getByLabel("Conferi os valores, participantes e efeitos deste registro.").check();await page.getByRole("button",{name:"Confirmar registro",exact:true}).click();await expect(page.getByRole("alert")).toContainText("pacote mudou");expect((await(await page.request.get(financeUrl)).json()).data.freight.payment).toBeFalsy();
  await confirm(page);await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button",{name:"Conferir acerto",exact:false}).click();await page.getByLabel("Forma de acerto").selectOption("centralized");await page.getByRole("combobox",{name:"Centralizador",exact:true}).selectOption(fixture.people[0]);await page.getByLabel("Confirmo a compensação",{exact:false}).check();await page.getByLabel("Motivo / descrição").fill("Synthetic native settlement");await confirm(page);await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button",{name:"Revisar / converter",exact:false}).click();await page.getByLabel("Confirmo a compensação",{exact:false}).check();await page.getByLabel("Conversão para o acerto").selectOption("topup");await page.getByRole("combobox",{name:"Recarga de referência",exact:true}).selectOption({index:1});await page.getByLabel("Origem / motivo do par").fill("Synthetic topup captured reference");await page.getByLabel("Motivo / descrição").fill("Synthetic settlement converted");await confirm(page);await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByText("Histórico de financiamento e cálculo por unidade",{exact:true}).click();await page.getByRole("button",{name:"Conferir cálculo por unidade",exact:true}).click();await expect(page.getByRole("list",{name:"Parcelas capturadas"})).toBeVisible();expect(await page.getByRole("list",{name:"Parcelas capturadas"}).getByRole("listitem").count()).toBeLessThanOrEqual(100);
  await page.getByText("Histórico de financiamento e cálculo por unidade",{exact:true}).click();
  for(const width of [320,390,768,1024,1440]){await page.setViewportSize({width,height:1000});await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:`artifacts/freight-review/settlement-${width}.png`,fullPage:true});}
  await receiveAll(page);
});

async function receiveAll(page:Page){
  await page.setViewportSize({width:1440,height:1000});
  let partial=false;
  while(await page.getByRole("button",{name:"Registrar transferência",exact:true}).count()){
    const button=page.getByRole("button",{name:"Registrar transferência",exact:true}).first();
    if(await button.isDisabled())break;
    await button.click();
    if(!partial){await page.getByLabel("BRL efetivamente transferidos").fill("1,00");await page.getByRole("dialog").getByRole("textbox",{name:/Obrigação · aberto/}).fill("1,00");partial=true;}
    await page.getByLabel("Motivo / descrição").fill("Synthetic actual bank transfer observed");await confirm(page);await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(page.locator(".financial-claims")).toContainText("Acertado");
  await page.screenshot({path:"artifacts/freight-review/receipts-desktop.png",fullPage:true});
  await page.evaluate(()=>{localStorage.setItem("loti.theme","dark");});await page.reload();await expect(page.getByRole("heading",{name:"Financiamento do frete",exact:true})).toBeVisible();await page.setViewportSize({width:390,height:1000});await page.screenshot({path:"artifacts/freight-review/receipts-dark-390.png",fullPage:true});
}

test("remaining real receipts on an already converted review fixture",async({page})=>{
  test.skip(process.env.FREIGHT_REVIEW_RECEIPTS_ONLY!=="1","Run only against a previously converted synthetic fixture.");
  await page.goto("/login");await page.getByLabel("Email",{exact:true}).fill(fixture.login);await page.getByLabel("Senha",{exact:true}).fill(fixture.password);await page.getByRole("button",{name:"Entrar",exact:true}).click();await page.waitForURL("**/favorites");await page.goto(`/packages/detail/${fixture.packageId}`);await expect(page.getByRole("heading",{name:"Financiamento do frete",exact:true})).toBeVisible();await receiveAll(page);
});
