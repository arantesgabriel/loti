import "dotenv/config";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { existsSync, realpathSync } from "node:fs";
import { sqlite } from "../src/lib/db";
const { values } = parseArgs({ options: { output: { type: "string" } } });
try {
  if (!values.output) throw new Error("Forneça --output /caminho/backup.sqlite.");
  const target = existsSync(values.output) ? realpathSync(values.output) : resolve(values.output);
  if (target === realpathSync(sqlite.name)) throw new Error("O destino do backup deve ser diferente do banco ativo.");
  await sqlite.backup(values.output); console.log("Backup SQLite consistente criado.");
}
finally { sqlite.close(); }
