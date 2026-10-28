import { randomBytes } from "node:crypto";
import { seedPlan } from "./development-seed/catalog";
import { developmentSeedTarget } from "./development-seed/target";

const args = process.argv.slice(2);
if (args.some(arg => !["--apply", "--plan"].includes(arg)) || (args.includes("--apply") && args.includes("--plan"))) {
  throw new Error("Uso: npm run db:seed:dev -- [--plan | --apply]. Sem argumento, apenas apresenta o plano.");
}
if (!args.includes("--apply")) {
  console.log(JSON.stringify({ mode: "plan-only", writes: false, ...seedPlan }, null, 2));
} else {
  // All destination checks precede imports that can initialize auth/database providers.
  const target = developmentSeedTarget(process.env);
  process.env.BETTER_AUTH_URL = "https://dev.useloti.com";
  process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
  process.env.LOTI_EMAIL_MODE = "disabled";
  process.env.LOTI_ORDERS_TRANSITION_QA = "";
  const [{ createClient }, { drizzle }, schema, { seedDevelopmentWorkspace }, { verifyDatabase }] = await Promise.all([
    import("@libsql/client"), import("drizzle-orm/libsql"), import("../src/lib/db/schema"), import("./development-seed/seed"), import("./database-verification"),
  ]);
  const client = createClient({ url: target.url, authToken: target.token });
  try {
    const result = await seedDevelopmentWorkspace(drizzle({ client, schema }), target.password);
    const integrity = await verifyDatabase(client);
    console.log(JSON.stringify({ database: "loti-dev", ...result, integrity }, null, 2));
  } catch (error) {
    // Do not log provider errors: their fields may contain a token or a signed URL.
    console.error(error instanceof Error && error.name === "DevelopmentSeedError" ? error.message : "O seed não concluiu. Nenhum passo confirmado será duplicado; corrija a causa e execute novamente. Consulte os checks locais e a documentação do seed.");
    process.exitCode = 1;
  } finally { client.close(); }
}
