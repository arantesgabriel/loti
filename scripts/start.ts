import "dotenv/config";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { z } from "zod";
import { migrateDatabase } from "./migrate";
const production = process.env.NODE_ENV !== "development";
if (production) {
  z.string().min(32, "Defina BETTER_AUTH_SECRET com pelo menos 32 caracteres.").parse(process.env.BETTER_AUTH_SECRET);
  z.url({ protocol: /^https$/ }).parse(process.env.BETTER_AUTH_URL);
  if (resolve(process.env.DATABASE_PATH ?? "") !== "/data/loti.sqlite") throw new Error("Produção exige DATABASE_PATH=/data/loti.sqlite no volume persistente.");
}
// Start lifecycle runs after Railway mounts /data. A failure prevents serving traffic.
migrateDatabase();
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", process.env.PORT ?? "3000"], { stdio: "inherit", env: { ...process.env, NODE_ENV: production ? "production" : "development" } });
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
