import "dotenv/config";
import { db, client } from "../src/lib/db";
import { user } from "../src/lib/db/schema";
import { ensurePersonalWorkspace } from "../src/lib/domain/personal-workspaces";

try {
  const users = await db.select({ id: user.id }).from(user).orderBy(user.id).all();
  let created = 0;
  for (const account of users) {
    const result = await ensurePersonalWorkspace(db, account.id);
    if (result.created) created += 1;
  }
  console.log(`Espaços pessoais garantidos: ${users.length} contas; ${created} criados nesta execução.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Falha ao provisionar espaços pessoais.");
  process.exitCode = 1;
} finally {
  client.close();
}
