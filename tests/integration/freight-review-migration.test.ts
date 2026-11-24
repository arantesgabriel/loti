import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {randomUUID,createHash} from "node:crypto";
import {migrate} from "drizzle-orm/libsql/migrator";
import {expect,it} from "vitest";
import {openDatabase} from "@/lib/db/connection";
import {hubbuyBalanceServices} from "@/lib/domain/hubbuy-balance-services";
import {fixture} from "./helpers";
import {verifyDatabase} from "../../scripts/database-verification";
function folder(max:number,broken=false){const path=`artifacts/freight-review-migrations/${randomUUID()}`;mkdirSync(`${path}/meta`,{recursive:true});const journal=JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));journal.entries=journal.entries.filter((row:{idx:number})=>row.idx<=max);writeFileSync(`${path}/meta/_journal.json`,JSON.stringify(journal));for(const entry of journal.entries)writeFileSync(`${path}/${entry.tag}.sql`,readFileSync(`drizzle/${entry.tag}.sql`));if(broken){const file=`${path}/0038_freight_review_restitution_guards.sql`;writeFileSync(file,readFileSync(file,"utf8")+"\n--> statement-breakpoint\nSELECT * FROM synthetic_missing_restitution_table;\n");}return path;}
it("applies restitution guards to an explicit empty disposable local database and repeats without money",async()=>{
 const {db,client}=openDatabase(`file:./data/freight-review-empty-${randomUUID()}.sqlite`);
 try{await migrate(db,{migrationsFolder:"./drizzle"});await migrate(db,{migrationsFolder:"./drizzle"});expect((await client.execute("SELECT count(*) n FROM hubbuy_balance_entries")).rows[0].n).toBe(0);expect((await verifyDatabase(client)).foreignKeyViolations).toBe(0);}finally{client.close();}
});
it("upgrades populated 0037 atomically, preserves original financial rows and reapplies without movement",async()=>{
 const f=await fixture(`file:./data/freight-review-upgrade-${randomUUID()}.sqlite`,"legacy");
 try{
  await migrate(f.db,{migrationsFolder:folder(37)});
  const balance=hubbuyBalanceServices(f.db,"alice","workspace"),account=await balance.createAccount({workspaceId:"workspace",idempotencyKey:"upgrade-account",label:"Synthetic migration",confirmZeroBalance:true});
  await balance.recordManualAdjustment(account.accountId,{expectedRevision:0,idempotencyKey:"upgrade-credit",kind:"documented_credit",amountCnyMinor:2000,occurredAt:"2026-11-12T10:00:00Z",reason:"Synthetic migration credit",shares:[{personId:"bob",amountCnyMinor:2000,historicalBrlCents:1500}]});
  const debit=await balance.recordManualAdjustment(account.accountId,{expectedRevision:1,idempotencyKey:"upgrade-debit",kind:"documented_debit",amountCnyMinor:1000,occurredAt:"2026-11-12T10:01:00Z",reason:"Synthetic migration debit",shares:[{personId:"bob",amountCnyMinor:1000}]}) as {adjustmentId:string};
  await balance.reverseManualAdjustment(account.accountId,{expectedRevision:2,idempotencyKey:"upgrade-undo",adjustmentId:debit.adjustmentId,occurredAt:"2026-11-12T10:02:00Z",reason:"Synthetic migration compensation"});
  const tables=["hubbuy_accounts","financial_operations","hubbuy_balance_entries","hubbuy_balance_credit_shares","hubbuy_balance_consumptions","hubbuy_balance_adjustments","hubbuy_topups","package_freight_payments","package_settlement_receipts"];
  const snapshot=async()=>createHash("sha256").update(JSON.stringify(await Promise.all(tables.map(async table=>(await f.client.execute(`SELECT * FROM ${table} ORDER BY rowid`)).rows)))).digest("hex");
  const before=await snapshot();await expect(migrate(f.db,{migrationsFolder:folder(38,true)})).rejects.toThrow();expect(await snapshot()).toBe(before);expect((await f.client.execute("SELECT 1 FROM sqlite_master WHERE name='hubbuy_full_restitution_edges'")).rows).toHaveLength(0);
  await migrate(f.db,{migrationsFolder:"./drizzle"});expect(await snapshot()).toBe(before);await migrate(f.db,{migrationsFolder:"./drizzle"});expect(await snapshot()).toBe(before);expect((await verifyDatabase(f.client)).foreignKeyViolations).toBe(0);expect((await balance.getAccountBalance(account.accountId)).ledgerBalanceCnyMinor).toBe(2000);
 }finally{f.client.close();}
});
