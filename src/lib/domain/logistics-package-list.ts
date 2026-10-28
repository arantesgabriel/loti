import {freightPaidSql} from "./logistics-package-status";
import {readDatabaseSnapshot} from "../db/read-snapshot";
import {and,asc,count,eq,isNull,isNotNull,sql} from "drizzle-orm";
import {z} from "zod";
import type {AppDatabase} from "../db/connection";
import * as s from "../db/schema";
import {authorization} from "./authorization";
import {countActivePackageUnitsByPackage} from "./logistics-package-reservations";
export const packageListQuerySchema=z.object({page:z.coerce.number().int().min(0).max(10000).default(0),filter:z.enum(["content_closed","preparing","sent","received","review","closed"]).default("content_closed")}).strict();
export async function listLogisticsPackages(db:AppDatabase,userId:string,q:z.infer<typeof packageListQuerySchema>){
  return readDatabaseSnapshot(db,async tx=>{
    const {workspaceId}=await authorization(tx,userId).requireWorkspaceMember();
    const p=s.logisticsPackages;
    const filters={review:eq(p.reviewState,"pending_review"),closed:isNotNull(p.financialClosedAt),content_closed:and(eq(p.stage,"preparing"),isNotNull(p.contentClosedAt)),preparing:and(eq(p.stage,"preparing"),isNull(p.contentClosedAt)),sent:eq(p.stage,"sent"),received:eq(p.stage,"received")};
    const where=and(eq(p.workspaceId,workspaceId),filters[q.filter]);
    const total=(await tx.select({total:count()}).from(p).where(where).get())!.total;
    const pageRows=await tx.select({pkg:p,freightConfirmed:sql<boolean>`${freightPaidSql("logistics_packages")}`}).from(p).where(where).orderBy(asc(p.id)).limit(20).offset(q.page*20).all();
    const unitCounts=await countActivePackageUnitsByPackage(tx,pageRows.map(row=>row.pkg.id));
    const rows=pageRows.map(row=>({...row,unitCount:unitCounts.get(row.pkg.id)??0}));
    return {rows,pagination:{page:q.page,total,hasMore:(q.page+1)*20<total}};
  });
}
