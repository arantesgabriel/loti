import { openDatabase } from "./connection";
const globalDb = globalThis as typeof globalThis & { lotiDb?: ReturnType<typeof openDatabase> };
const connection = globalDb.lotiDb ?? openDatabase();
if (process.env.NODE_ENV !== "production") globalDb.lotiDb = connection;
export const { db, client } = connection;
