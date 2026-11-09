import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
/** Tests of the old workflow deliberately run the actual historical schema. */
export function legacyMigrationsFolder() {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json","utf8"));
  const boundary = journal.entries.findIndex((e: {tag:string}) => e.tag === "0022_hubbuy_manual_adjustments");
  if (boundary < 0) throw new Error("Missing legacy boundary");
  journal.entries = journal.entries.slice(0,boundary+1);
  const folder = resolve(`artifacts/qa/orders-transition/legacy-migrations-${process.pid}-${randomUUID()}`);
  mkdirSync(`${folder}/meta`,{recursive:true});
  writeFileSync(`${folder}/meta/_journal.json`,JSON.stringify(journal));
  for (const e of journal.entries) copyFileSync(`drizzle/${e.tag}.sql`,`${folder}/${e.tag}.sql`);
  return folder;
}
