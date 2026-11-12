import "dotenv/config";
import { defineConfig } from "drizzle-kit";
const url = process.env.TURSO_DATABASE_URL ?? "file:./data/loti.sqlite";
export default defineConfig({
  schema: ["./src/lib/db/schema.ts", "./src/lib/db/topup-schema.ts", "./src/lib/db/freight-schema.ts", "./src/lib/db/freight-refund-schema.ts"],
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: { url, ...(process.env.TURSO_AUTH_TOKEN ? { authToken: process.env.TURSO_AUTH_TOKEN } : {}) },
});
