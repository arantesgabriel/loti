import { openDatabase } from "./connection";
const globalDb = globalThis as typeof globalThis & { lotiDb?: ReturnType<typeof openDatabase> };
const connection = globalDb.lotiDb ?? openDatabase(process.env.DATABASE_PATH ?? "./data/loti.sqlite");
if (process.env.NODE_ENV !== "production") globalDb.lotiDb = connection;
export const { db, sqlite } = connection;
