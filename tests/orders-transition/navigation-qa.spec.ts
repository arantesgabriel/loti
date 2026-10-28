import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
test("orders and independent packages preserve accessible responsive navigation",async({page})=>{
  const login=await page.request.post("/api/auth/sign-in/email",{headers:{Origin:"http://localhost:3139"},data:{email:"pessoa-a@loti.test",password:"Loti-Orders-QA-Only-2026!"}});
  expect(login.ok()).toBe(true);
  mkdirSync("artifacts/qa/orders-transition",{recursive:true});
  for(const route of ["orders","packages","more"]){
    await page.goto(`/${route}`);await expect(page.getByRole("heading",{name:route==="orders"?"Pedidos":route==="packages"?"Pacotes":"Mais",exact:true})).toBeVisible();
    for(const theme of ["light","dark"]){
      await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
      for(const width of [1440,1024,768,390,320]){
        await page.setViewportSize({width,height:900});
        await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
        if(width===390 || width===1440)await page.screenshot({path:`artifacts/qa/orders-transition/${route}-${theme}-${width}.png`});
        if(width<768)await expect(page.getByRole("navigation",{name:"Navegação móvel"}).getByRole("link")).toHaveCount(5);
      }
    }
  }
});
