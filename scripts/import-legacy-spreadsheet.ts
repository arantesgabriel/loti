import "dotenv/config";
import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { db, client } from "../src/lib/db";
import { migrateDatabase } from "./migrate";
import { importLegacy } from "./legacy-importer";
const { values } = parseArgs({ options: { mapping: { type: "string" }, source: { type: "string", default: "legacy/source/Favoritos_Hubbuy_original.xlsx" }, report: { type: "string", default: "legacy/import.report.json" }, execute: { type: "boolean", default: false } } });
try {
  if (!values.mapping) throw new Error("Forneça --mapping legacy/mapping.local.json; revise o relatório antes de usar --execute.");
  await migrateDatabase();
  const report = await importLegacy(db, values.source!, JSON.parse(readFileSync(values.mapping, "utf8")), !values.execute);
  writeFileSync(values.report!, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ dryRun: report.dryRun, created: report.created, existing: report.existing, skipped: report.skipped.length, warnings: report.warnings.length, blockers: report.blockers, favoritesByOwner: report.favoritesByOwner, favoritesByCollection: report.favoritesByCollection, purchases: report.purchases, missingPrices: report.missingPrices, report: values.report }, null, 2));
  if (report.blockers.length) process.exitCode = 1;
} catch (e) { console.error(e instanceof Error ? e.message : "Importação falhou."); process.exitCode = 1; } finally { client.close(); }
