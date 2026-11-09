import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { recordQcDatabaseCall } from "../qc/metrics";
import { getQcDatabaseQueueContext } from "../qc/concurrency";
import * as schema from "./schema";

export type AppDatabase = LibSQLDatabase<typeof schema>;

function connectionUrl(value: string) {
  if (value.startsWith("file:")) {
    const filePath = value.slice("file:".length);
    if (filePath && filePath !== ":memory:") mkdirSync(dirname(resolve(filePath)), { recursive: true });
    return value;
  }
  if (value === ":memory:") return "file::memory:";
  mkdirSync(dirname(resolve(value)), { recursive: true });
  return `file:${value}`;
}

function defaultUrl() {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  if (process.env.VERCEL === "1") {
    throw new Error("TURSO_DATABASE_URL precisa estar configurada no ambiente Vercel.");
  }
  return "file:./data/loti.sqlite";
}

export function openDatabase(url = defaultUrl(), options: { localConcurrency?: number } = {}) {
  const normalizedUrl = /^(?:libsql|https?):\/\//.test(url) ? url : connectionUrl(url);
  const isRemoteDatabase = !normalizedUrl.startsWith("file:");
  if (process.env.VERCEL === "1" && isRemoteDatabase && !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("TURSO_AUTH_TOKEN precisa estar configurado para acessar o banco Turso no Vercel.");
  }
  if(options.localConcurrency!==undefined && (!Number.isSafeInteger(options.localConcurrency) || options.localConcurrency<1))throw new Error("Invalid local database concurrency.");
  const client = createClient({ url: normalizedUrl, ...(!isRemoteDatabase && options.localConcurrency!==undefined?{concurrency:options.localConcurrency}:{}), ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}) });
  // Measure adapter calls only inside an explicitly injected, request-local QC
  // metrics context. SQL text and bound values are never retained.
  type DriverTransaction = { execute: (...args: unknown[]) => Promise<unknown>; commit: (...args: unknown[]) => Promise<unknown>; rollback: (...args: unknown[]) => Promise<unknown> };
  const driver = client as unknown as { execute: (...args: unknown[]) => Promise<unknown>; transaction: (...args: unknown[]) => Promise<DriverTransaction> };
  const instrumentExecute = (target: { execute: (...args: unknown[]) => Promise<unknown> }, original: (...args: unknown[]) => Promise<unknown>, queue?: { run<T>(operation: () => Promise<T>): Promise<T> }) => {
    target.execute = async (...args) => {
      const startedAt = performance.now();
      try { return await (queue ? queue.run(() => original(...args)) : original(...args)); }
      finally { recordQcDatabaseCall(performance.now() - startedAt); }
    };
  };
  instrumentExecute(driver, driver.execute.bind(client), { run: <T>(operation: () => Promise<T>) => {
    const queue = getQcDatabaseQueueContext();
    return queue ? queue.run(operation) : operation();
  } });
  const originalTransaction = driver.transaction.bind(client);
  driver.transaction = async (...args) => {
    const queue = getQcDatabaseQueueContext();
    const release = queue ? await queue.acquire() : null;
    try {
      const transaction = await originalTransaction(...args);
      instrumentExecute(transaction, transaction.execute.bind(transaction));
      if (release) {
        let released = false;
        const releaseOnce = () => { if (!released) { released = true; release(); } };
        const commit = transaction.commit.bind(transaction), rollback = transaction.rollback.bind(transaction);
        transaction.commit = async () => { try { return await commit(); } finally { releaseOnce(); } };
        transaction.rollback = async () => { try { return await rollback(); } finally { releaseOnce(); } };
      }
      return transaction;
    } catch (error) { release?.(); throw error; }
  };
  const db = drizzle({ client, schema });
  return { db, client };
}
