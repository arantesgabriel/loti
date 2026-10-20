import "dotenv/config";
import { parseArgs } from "node:util";
import { z } from "zod";
import { db, client } from "../src/lib/db";
import { createMember } from "./operator";
import { migrateDatabase } from "./migrate";
const { values } = parseArgs({ options: { name: { type: "string" }, email: { type: "string" } } });
try {
  await migrateDatabase();
  const input = z.object({ name: z.string().trim().min(1).max(200), email: z.email(), password: z.string().min(12).max(128) }).parse({ ...values, password: process.env.LOTI_USER_PASSWORD });
  const member = await createMember(db, input);
  console.log(`Membro configurado: ${member.name} (${member.email}). Contas existentes mantêm a senha atual.`);
} catch (e) { console.error(e instanceof z.ZodError ? "Use --name e --email; forneça LOTI_USER_PASSWORD (12–128 caracteres) no ambiente." : e instanceof Error ? e.message : "Falha ao criar usuário."); process.exitCode = 1; } finally { client.close(); }
