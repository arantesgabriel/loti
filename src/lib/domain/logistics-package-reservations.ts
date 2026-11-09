import { and, count, inArray, isNull } from "drizzle-orm";
import type { AppDatabase } from "../db/connection";
import * as s from "../db/schema";

/**
 * One active reservation row represents one physical unit. Keep package list
 * and detail counts on the same grouped query and active-state predicate.
 */
export async function countActivePackageUnitsByPackage(
  db: Pick<AppDatabase, "select">,
  packageIds: readonly string[],
) {
  const ids = [...new Set(packageIds)];
  if (!ids.length) return new Map<string, number>();

  const rows = await db
    .select({
      packageId: s.logisticsReservations.packageId,
      unitCount: count(),
    })
    .from(s.logisticsReservations)
    .where(
      and(
        inArray(s.logisticsReservations.packageId, ids),
        isNull(s.logisticsReservations.releasedAt),
      ),
    )
    .groupBy(s.logisticsReservations.packageId)
    .all();

  return new Map(rows.map(({ packageId, unitCount }) => [packageId, unitCount]));
}
