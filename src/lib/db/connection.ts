import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
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

export function openDatabase(url = defaultUrl()) {
  const normalizedUrl = /^(?:libsql|https?):\/\//.test(url) ? url : connectionUrl(url);
  const isRemoteDatabase = !normalizedUrl.startsWith("file:");
  if (process.env.VERCEL === "1" && isRemoteDatabase && !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("TURSO_AUTH_TOKEN precisa estar configurado para acessar o banco Turso no Vercel.");
  }
  const client = createClient({ url: normalizedUrl, ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}) });
  return { db: drizzle({ client, schema }), client };
}
