import "dotenv/config";
import Database from "better-sqlite3";
const sqlite = new Database(process.env.DATABASE_PATH ?? "./data/loti.sqlite", { readonly: true, fileMustExist: true });
try {
  sqlite.pragma("foreign_keys = ON");
  const integrity = sqlite.pragma("integrity_check", { simple: true });
  const violations = sqlite.pragma("foreign_key_check") as unknown[];
  if (integrity !== "ok" || violations.length) throw new Error("Banco falhou na verificação de integridade ou referências.");
  sqlite.prepare("SELECT 1 FROM workspaces LIMIT 1").get();
  console.log(JSON.stringify({ integrity, foreignKeyViolations: violations.length, journalMode: sqlite.pragma("journal_mode", { simple: true }), foreignKeys: sqlite.pragma("foreign_keys", { simple: true }) }));
} finally { sqlite.close(); }
