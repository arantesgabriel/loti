import { openDatabase } from "@/lib/db/connection";
import { hubbuyTopupServices } from "@/lib/domain/hubbuy-topup-services";
const url = process.env.LOTI_TOPUP_RACE_DATABASE!;
if (!url.startsWith("file:")) throw new Error("Synthetic local database required");
const { db, client } = openDatabase(url);
try {
  const { accountId, input } = JSON.parse(process.env.LOTI_TOPUP_RACE_COMMAND!);
  const data = await hubbuyTopupServices(db, "alice", "workspace").record(accountId, input);
  process.stdout.write(JSON.stringify({ ok: true, data }));
} catch (cause) {
  const error = cause as { code?: string; message: string };
  process.stdout.write(JSON.stringify({ ok: false, code: error.code, message: error.message }));
} finally { client.close(); }
