import { openDatabase } from "@/lib/db/connection";
import { packageCostServices } from "@/lib/domain/package-cost-services";

const trackingId = process.env.LOTI_REFUND_TRACKING_ID!;
const userId = process.env.LOTI_REFUND_USER_ID ?? "alice";
const action = process.env.LOTI_REFUND_ACTION!;
const input = JSON.parse(process.env.LOTI_REFUND_INPUT!);
const refundId = process.env.LOTI_REFUND_ID;
const orderId = process.env.LOTI_REFUND_ORDER_ID;
const { db, client } = openDatabase(process.env.LOTI_REFUND_DATABASE_URL!);

try {
  const service = packageCostServices(db, userId);
  let result;
  if (action === "request") result = await service.requestRefund(trackingId, input);
  else if (action === "receive") result = await service.receiveRefund(trackingId, refundId!, input);
  else if (action === "correct") result = await service.correctRefundReceipt(trackingId, refundId!, input);
  else if (action === "void") result = await service.voidRefund(trackingId, refundId!, input);
  else if (action === "allocate") result = await service.saveAllocations(trackingId, input);
  else if (action === "ship") result = await service.savePackage(trackingId, process.env.LOTI_REFUND_PACKAGE_ID!, input);
  else if (action === "close") result = await service.closeTracking(trackingId, input);
  else if (action === "mixed-payment") result = await service.recordAdditionalOrderMixedPayment(trackingId, orderId!, input);
  else if (action === "correct-order") result = await service.correctAdditionalOrder(trackingId, orderId!, input);
  else throw new Error(`Unknown refund race action: ${action}`);
  void result;
  process.stdout.write(JSON.stringify({ ok: true }));
} catch (error) {
  const row = error as { message?: string; code?: string };
  process.stdout.write(JSON.stringify({ ok: false, message: row.message ?? "Unknown error", code: row.code ?? null }));
} finally {
  await client.close();
}
