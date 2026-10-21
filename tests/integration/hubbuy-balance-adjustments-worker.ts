import { openDatabase } from "@/lib/db/connection";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
const { db, client } = openDatabase(process.env.LOTI_ADJUSTMENT_RACE_DATABASE!);
const { action, accountId, input } = JSON.parse(process.env.LOTI_ADJUSTMENT_RACE_COMMAND!);
try {
  const service = hubbuyBalanceServices(db, "alice");
  const data = action === "reverse" ? await service.reverseManualAdjustment(accountId, input)
    : action === "delete" ? await service.deleteAccount(accountId, input)
    : await service.recordManualAdjustment(accountId, input);
  process.stdout.write(JSON.stringify({ ok: true, data }));
} catch (cause) { const error = cause as { code?: string; message: string }; process.stdout.write(JSON.stringify({ ok: false, code: error.code, message: error.message })); }
finally { client.close(); }
