import {test,expect} from "@playwright/test";
import {readFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
test("multi-purchase package completes independent content, quote, payment, weight and manual dispatch through UI",async({page})=>{
  const marker=JSON.parse(readFileSync(`${resolve(process.env.LOTI_ORDERS_TRANSITION_DATABASE!.slice(5))}.scenario.json`,"utf8"));
  test.skip(marker.scenarioId!=="orders-workflow-v2","Uses the separate new workflow fixture");
  const baseURL=process.env.LOTI_ORDERS_TRANSITION_BASE_URL??"http://localhost:3139";
  const login=await page.request.post("/api/auth/sign-in/email",{headers:{Origin:baseURL},data:{email:"pessoa-a@loti.test",password:"Loti-Orders-QA-Only-2026!"}});expect(login.ok()).toBe(true);
  const initialResponse=await page.request.get("/api/warehouse",{timeout:60000});expect(initialResponse.ok(),await initialResponse.text()).toBe(true);
  const initial=(await initialResponse.json()).data;
  expect(initial.rows).toHaveLength(2);expect(initial.rows.reduce((n:number,r:{reservations:unknown[]})=>n+r.reservations.length,0)).toBe(2);
  await page.goto("/orders");await expect(page.getByText("Camiseta retida QA",{exact:true})).toBeVisible({timeout:30000});
  await page.goto(`/packages/detail/${marker.packageId}`);
  await expect(page.getByRole("heading",{name:"Camiseta retida + compra posterior QA"})).toBeVisible({timeout:30000});
  const logistics=page.getByRole("region",{name:"Etapa logística"}),content=page.getByRole("region",{name:"Conteúdo"}),costs=page.getByRole("region",{name:"Custos do pacote"});
  await expect(logistics).toContainText("Em montagem");await expect(logistics.getByRole("button",{name:"Registrar despacho",exact:true})).toHaveCount(0);
  await expect(content.getByRole("button",{name:"Fechar conteúdo",exact:true})).toBeVisible();await expect(content.getByRole("button",{name:"Retirar unidades",exact:true})).toBeVisible();await expect(content.getByRole("link",{name:"Acrescentar itens",exact:true})).toBeVisible();
  await expect(costs.getByRole("button",{name:"Informar frete",exact:true})).toBeVisible();await expect(costs.getByRole("button",{name:"Confirmar frete pago",exact:true})).toBeVisible();await expect(costs.getByRole("button",{name:"Informar Receita",exact:true})).toBeVisible();await expect(costs.getByRole("button",{name:"Encerrar custos",exact:true})).toBeVisible();
  await expect(content.locator(".button-primary")).toHaveCount(1);await expect(costs.locator(".button-primary")).toHaveCount(0);
  const inheritedDistribution=page.getByRole("region",{name:"Valores herdados dos produtos"}),preview=(await (await page.request.get(`/api/logistics/packages/${marker.packageId}`)).json()).data;
  mkdirSync("artifacts/qa/orders-transition",{recursive:true});
  expect(preview.valuation.items).toHaveLength(2);
  for(const item of preview.valuation.items){const component=item.components.find((row:{name:string})=>row.name==="Preço efetivo");expect(component).toBeDefined();expect(component.units).toHaveLength(1);for(const unit of component.units){expect(unit.amountCents).toBe(1);expect(unit.people).toHaveLength(2);expect(unit.people.reduce((sum:number,person:{amountCents:number})=>sum+person.amountCents,0)).toBe(unit.amountCents);}}
  for(const product of await inheritedDistribution.locator("details.orders-allocation-product").all())await product.locator("summary").click();
  await expect(inheritedDistribution).toContainText("Compra QA anterior");await expect(inheritedDistribution).toContainText("Compra QA posterior");await expect(inheritedDistribution).toContainText("Preço efetivo");await expect(inheritedDistribution).toContainText("Pessoa A");await expect(inheritedDistribution).toContainText("Pessoa B");await expect(inheritedDistribution).toContainText("R$ 0,01");await expect(inheritedDistribution).toContainText("R$ 0,00");
  await expect(inheritedDistribution.getByRole("columnheader",{name:"Participante"}).first()).toBeAttached();await expect(inheritedDistribution.getByRole("columnheader",{name:"Valor"}).first()).toBeAttached();
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:"artifacts/qa/orders-transition/package-actions-light-1440.png"});
  await page.setViewportSize({width:390,height:900});await page.evaluate(()=>window.scrollTo(0,0));await expect.poll(()=>page.locator(".app-content").evaluate(el=>getComputedStyle(el).marginLeft),{timeout:3000}).toBe("0px");const initialMobile=await page.evaluate(()=>({excess:document.documentElement.scrollWidth-innerWidth,scrollX:window.scrollX}));expect(initialMobile.excess).toBeLessThanOrEqual(1);expect(initialMobile.scrollX).toBe(0);await page.screenshot({path:"artifacts/qa/orders-transition/package-actions-light-390.png"});
  await page.setViewportSize({width:1440,height:900});await page.evaluate(()=>window.scrollTo(0,0));
  async function confirm(action:string,reason:string,fill?:(dialog:ReturnType<typeof page.getByRole>)=>Promise<void>){
    await page.getByRole("button",{name:action,exact:true}).click();const dialog=page.getByRole("dialog");await expect(dialog).toBeVisible();if(fill)await fill(dialog);await dialog.getByLabel("Evidência e motivo").fill(reason);const response=page.waitForResponse(r=>r.url().includes("/api/logistics/packages/") && r.request().method()==="POST",{timeout:30000});await dialog.getByRole("button",{name:"Confirmar",exact:true}).click();const result=await response;expect(result.ok(),await result.text()).toBe(true);await expect(dialog).not.toBeVisible();
  }
  await confirm("Informar frete","Cotação sintética conferida",async dialog=>{await dialog.getByLabel("Valor conhecido em reais").fill("12,34");await dialog.getByLabel("Taxa informada (%)").fill("1");});
  let detail=(await (await page.request.get(`/api/logistics/packages/${marker.packageId}`)).json()).data;
  expect(detail.pkg.freightPaidAt).toBeNull();expect(detail.inPackage).toBe(false);
  const distribution=page.getByRole("region",{name:"Distribuição dos encargos do pacote"});
  await expect(distribution).toContainText("Prévia da montagem");
  await distribution.getByText("Frete Brasil",{exact:true}).click();
  await expect(distribution).toContainText("Pessoa A");await expect(distribution).toContainText("Pessoa B");
  expect(detail.valuation.charges.reduce((n:number,c:{amountCents:number})=>n+c.amountCents,0)).toBe(1246);
  await confirm("Fechar conteúdo","Manifesto sintético revisado");await expect(page.getByRole("button",{name:"Informar peso",exact:true})).toHaveCount(0);
  await confirm("Confirmar frete pago","Comprovante sintético de frete",async dialog=>{await dialog.getByLabel("Valor em reais",{exact:true}).fill("12,34");await dialog.getByLabel("Taxa capturada (%)").fill("1");});
  detail=(await (await page.request.get(`/api/logistics/packages/${marker.packageId}`)).json()).data;expect(detail.inPackage).toBe(true);expect(detail.pkg.stage).toBe("preparing");
  const inherited=detail.valuation.items;
  await confirm("Informar peso","Pesagem sintética conferida",async dialog=>{await dialog.getByLabel("Peso em gramas").fill("1500");});
  detail=(await (await page.request.get(`/api/logistics/packages/${marker.packageId}`)).json()).data;expect(detail.valuation.items).toEqual(inherited);
  await confirm("Informar Receita","Isenção sintética conferida",async dialog=>{await dialog.getByRole("combobox",{name:"Situação",exact:true}).selectOption("no_charge");});
  await confirm("Encerrar custos","Conciliação sintética do pacote");
  await confirm("Registrar despacho","Comprovante sintético de despacho manual");
  detail=(await (await page.request.get(`/api/logistics/packages/${marker.packageId}`)).json()).data;expect(detail.pkg.stage).toBe("sent");expect(detail.pkg.freightCents).toBe(1234);expect(detail.pkg.freightFeeCents).toBe(12);
  await confirm("Registrar recebimento","Entrega sintética conferida manualmente");
  await expect(distribution).toContainText("Rateio capturado");
  for(const section of await distribution.locator("details").all())await section.evaluate(e=>{e.setAttribute("open","");});
  for(const product of await inheritedDistribution.locator("details.orders-allocation-product").all())await product.evaluate(e=>{e.setAttribute("open","");});
  mkdirSync("artifacts/qa/orders-transition",{recursive:true});
  for(const theme of ["light","dark"]){
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;window.scrollTo(0,0);},theme);
    for(const width of [1440,1024,768,390,320]){
      await page.setViewportSize({width,height:900});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      if(width===390 || width===1440){
        await page.screenshot({path:`artifacts/qa/orders-transition/new-package-${theme}-${width}.png`});
        if(width===390){
          await distribution.scrollIntoViewIfNeeded();
          await page.screenshot({path:`artifacts/qa/orders-transition/new-package-charges-${theme}-${width}.png`});
          await distribution.locator("details.orders-package-charge").first().screenshot({path:`artifacts/qa/orders-transition/package-distribution-charges-${theme}-${width}.png`});
          await inheritedDistribution.scrollIntoViewIfNeeded();
          await page.screenshot({path:`artifacts/qa/orders-transition/new-package-products-${theme}-${width}.png`});
          await inheritedDistribution.locator("details.orders-allocation-product").first().screenshot({path:`artifacts/qa/orders-transition/package-distribution-products-${theme}-${width}.png`});
          await page.evaluate(()=>window.scrollTo(0,0));
        }else{
          await distribution.screenshot({path:`artifacts/qa/orders-transition/new-package-charges-${theme}-${width}.png`});
          await inheritedDistribution.screenshot({path:`artifacts/qa/orders-transition/new-package-products-${theme}-${width}.png`});
        }
      }
    }
  }
  detail=(await (await page.request.get(`/api/logistics/packages/${marker.packageId}`)).json()).data;expect(detail.pkg.stage).toBe("received");expect(detail.pkg.weightGrams).toBe(1500);
});
