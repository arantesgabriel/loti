import type {Client} from "@libsql/client";
import {drizzle} from "drizzle-orm/libsql";
import type {AppDatabase} from "./connection";
import * as schema from "./schema";

/** Drizzle's installed libSQL adapter ignores SQLite behavior and opens write
 * transactions. Open an explicit libSQL read transaction for a consistent,
 * non-writing snapshot. Only the select/all surface is exposed to callers. */
export async function readDatabaseSnapshot<T>(db:AppDatabase,read:(snapshot:Pick<AppDatabase,"select"|"all">)=>Promise<T>):Promise<T>{
  const client=(db as AppDatabase & {$client:Client}).$client;
  const transaction=await client.transaction("read");
  try{
    // Read queries require execute only; no batch/migrate/transaction is exposed.
    const snapshot=drizzle({client:transaction as unknown as Client,schema});
    const result=await read(snapshot);
    await transaction.commit();
    return result;
  }catch(error){await transaction.rollback();throw error;}finally{transaction.close();}
}
