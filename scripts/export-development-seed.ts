import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { people } from "./development-seed/catalog";

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output")) throw new Error("Uso: npm run db:seed:dev:sql -- [--output artifacts/development-seed/loti-dev-seed.sql]");
const output = resolve(args[1] ?? "artifacts/development-seed/loti-dev-seed.sql");
const distance = relative(resolve("artifacts"), output);
if (distance.startsWith("..") || isAbsolute(distance) || !output.endsWith(".sql")) throw new Error("Escolha um arquivo .sql dentro de artifacts/, fora do versionamento.");
const credentials = `${output}.credentials.json`, report = `${output}.summary.json`;
if ([output, credentials, report].some(existsSync)) throw new Error("Os arquivos já existem. Escolha outro nome; nenhum seed ou senha será sobrescrito.");

// Isolate auth/mail from the application's environment. Database is always memory.
process.env.BETTER_AUTH_URL = "https://dev.useloti.com";
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.LOTI_EMAIL_MODE = "disabled";
process.env.LOTI_ORDERS_TRANSITION_QA = "";
const password = process.env.LOTI_DEV_SEED_PASSWORD ?? randomBytes(24).toString("base64url");
const { buildDevelopmentSeedSql } = await import("./development-seed/sql");
const generated = await buildDevelopmentSeedSql(password);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(credentials, JSON.stringify({ environment: "development", database: "loti-dev", logins: people.map(person => person.email), password }, null, 2), { flag: "wx", mode: 0o600 });
writeFileSync(output, generated.sql, { flag: "wx", mode: 0o600 });
writeFileSync(report, JSON.stringify({ statements: generated.statements, ...generated.summary }, null, 2), { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ sql: output, credentials, summary: report, statements: generated.statements, remoteConnections: 0, appliedRemotely: false }, null, 2));
