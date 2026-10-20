import { openDatabase } from "../../src/lib/db/connection";
import { persistentAuthStorage } from "../../src/lib/auth/security-limits";
import { emailService } from "../../src/lib/email/service";
const url = process.env.LOTI_AUTH_RACE_DATABASE;
if (!url?.startsWith("file:") || !url.includes("auth-email-races-")) throw new Error("Disposable auth race database required.");
const connection = openDatabase(url);
let admitted = 0;
let providerCalls = 0;
try {
  if (process.env.LOTI_AUTH_RACE_OPERATION === "counter") {
    const storage = persistentAuthStorage(connection.db);
    for (let i = 0; i < 5; i++) if ((await storage.consume("independent-instance", { max: 3, window: 3600 })).allowed) admitted++;
    console.log(JSON.stringify({ admitted }));
  } else {
    const state = await emailService(connection.db, async () => { providerCalls++; return "sent"; }).send({ kind: "reset", email: "independent@loti.test", token: "independent-token", url: "http://localhost:3000/api/auth/reset-password/independent-token" });
    console.log(JSON.stringify({ state, providerCalls }));
  }
} catch { console.log(JSON.stringify({ state: "rejected", admitted, providerCalls })); }
finally { connection.client.close(); }
