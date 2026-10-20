import { openDatabase } from "@/lib/db/connection";
import { hubbuyBalanceServices } from "@/lib/domain/hubbuy-balance-services";
import { packageCostServices } from "@/lib/domain/package-cost-services";

const { db, client } = openDatabase(process.env.LOTI_DELETE_RACE_DATABASE!);
const { action, accountId, input, trackingId, refundId, packageId } = JSON.parse(process.env.LOTI_DELETE_RACE_COMMAND!);
try {
  const accounts = hubbuyBalanceServices(db, "alice"), costs = packageCostServices(db, "alice");
  if (action === "delete") await accounts.deleteAccount(accountId, input);
  else if (action === "discard") await accounts.discardIncorrectAccount(accountId, input);
  else if (action === "activate") await accounts.activateEmptyAccountAtZero(accountId, input);
  else if (action === "reconcile") await accounts.startReconciliation(accountId, input);
  else if (action === "order") await costs.createAdditionalOrder(trackingId, input);
  else if (action === "refund") await costs.receiveRefund(trackingId, refundId, input);
  else if (action === "package") {
    // This writer intentionally does not bump account.revision. The database guard,
    // rather than the process-local queue or account CAS alone, must decide the race.
    await client.execute({ sql: "UPDATE purchase_packages SET account_id = ? WHERE id = ?", args: [accountId, packageId] });
  } else throw new Error("Unknown deletion race command");
  process.stdout.write(JSON.stringify({ ok: true }));
} catch (error) {
  const e = error as { code?: string; message?: string };
  process.stdout.write(JSON.stringify({ ok: false, code: e.code, message: e.message }));
} finally { client.close(); }
