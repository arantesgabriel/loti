import "server-only";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { QcStorage } from "./storage";

/** Local synthetic scenario only. Never selected by ordinary dev, Preview or Vercel. */
export function ordersTransitionQcStorage(): QcStorage | null {
  if (process.env.LOTI_ORDERS_TRANSITION_QA !== "1") return null;
  const url = process.env.TURSO_DATABASE_URL ?? "";
  const path = resolve(url.slice(5));
  if (process.env.VERCEL || process.env.NODE_ENV === "production" || process.env.TURSO_AUTH_TOKEN || !url.startsWith("file:")
    || process.env.BETTER_AUTH_URL !== "http://localhost:3139" || dirname(path) !== resolve("data")
    || !/^orders-transition-[a-zA-Z0-9_-]+\.sqlite$/.test(basename(path)) || realpathSync(path).toLowerCase() !== path.toLowerCase()) throw new Error("Orders transition QC requires an explicit local synthetic database.");
  const marker = JSON.parse(readFileSync(`${path}.scenario.json`, "utf8"));
  if (!["orders-transition-v1","orders-workflow-v2"].includes(marker.scenarioId) || marker.databasePath !== path || !["building", "complete"].includes(marker.state)) throw new Error("Orders transition QC ownership marker is invalid.");
  const root = `${path}.qc`;
  mkdirSync(root, { recursive: true });
  if (realpathSync(root).toLowerCase() !== root.toLowerCase()) throw new Error("Orders transition QC refuses redirected storage.");
  const objectPath = (key: string) => `${root}/${createHash("sha256").update(key).digest("hex")}`;
  return {
    async put(object) { writeFileSync(objectPath(object.key), object.bytes, { flag: "w" }); },
    async head(key) { const path = objectPath(key); return existsSync(path) ? { exists: true, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") } : { exists: false }; },
    async get(key, maxBytes) { const bytes = readFileSync(objectPath(key)); if (!bytes.length || bytes.length > maxBytes) throw new Error("Synthetic QC object exceeds bound."); return bytes; },
    async delete(key) { const path = objectPath(key); if (existsSync(path)) unlinkSync(path); },
    async signRead() { throw new Error("Synthetic QC uses authenticated local originals, never public object links."); },
  };
}
