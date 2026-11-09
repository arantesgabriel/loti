// Deliberately does not load dotenv. Remote databases are not accepted by this
// local review/apply tool; production backfill needs its own explicit decision.
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { z } from "zod";
import { openDatabase } from "../src/lib/db/connection";
import { recordPreexisting } from "../src/lib/onboarding/milestones";
const args = process.argv.slice(2);
const filename = args[args.indexOf("--database") + 1];
const manifestFile = args[args.indexOf("--manifest") + 1];
if (!args.includes("--database") || !args.includes("--manifest")) throw new Error("Use --database data/onboarding-backfill-<review>.sqlite --manifest <reviewed.json> [--apply]. Default: dry-run.");
const path = resolve(filename), local = relative(resolve("data"), path).replaceAll("\\", "/");
if (!/^onboarding-backfill-[a-zA-Z0-9_-]+\.sqlite$/.test(local)) throw new Error("Only an explicitly named local review database under data/onboarding-backfill-*.sqlite is allowed.");
await stat(path); // never silently create an empty replacement database
const manifest = z.object({ review: z.string().min(8).max(200), purpose: z.enum(["reviewed-existing-data", "synthetic-local-validation"]),
  references: z.array(z.object({ userId: z.string().min(1), workspaceId: z.string().min(1), source: z.enum(["favorite", "purchase_item"]), entityId: z.string().min(1) }).strict()).max(10000),
}).strict().parse(JSON.parse(await readFile(resolve(manifestFile), "utf8")));
process.env.TURSO_AUTH_TOKEN = "";
const connection = openDatabase(`file:${path.replaceAll("\\", "/")}`);
try {
  // Validate the entire manifest with the same transaction and constraints used
  // on apply. Dry-run rolls everything back intentionally.
  const dryRun = Symbol("dry-run");
  try { await connection.db.transaction(async tx => {
    for (const reference of manifest.references) await recordPreexisting(tx, reference);
    if (!args.includes("--apply")) throw dryRun;
  }); } catch (error) { if (error !== dryRun) throw error; }
  console.log(JSON.stringify({ mode: args.includes("--apply") ? "applied" : "dry-run", references: manifest.references.length, historicalEvents: 0, review: manifest.review }));
} finally { connection.client.close(); }
