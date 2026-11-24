import assert from "node:assert/strict";
import { principalFromTopupTotal, previewTopupFee } from "../src/lib/domain/hubbuy-topup-calculations";
import { allocateFreightComponent, type FreightUnit } from "../src/lib/domain/package-freight-calculations";
import { compensateSettlementPositions, convertSettlementPositions } from "../src/lib/domain/package-settlement-calculations";
import { previewFifoConsumption } from "../src/lib/domain/hubbuy-balance-calculations";

// Pure synthetic contract: no dotenv, database, session or external service.
const receipt = principalFromTopupTotal(35242, 100);
const people = ["A", "B", "C", "D"];
let order = 0;
const units: FreightUnit[] = [9, 8, 2, 5].flatMap((count, personIndex) => Array.from({ length: count }, (_, unitIndex) => ({
  costItemId: `synthetic-${people[personIndex]}`, unitIndex, order: order++, participants: [{ personId: people[personIndex], order: 0, weight: 1 }],
})));
for (let unitIndex = 0; unitIndex < 6; unitIndex++) units.push({ costItemId: "synthetic-shared", unitIndex, order: order++, participants: ["A", "C", "D"].map((personId, order) => ({ personId, order, weight: 1 })) });
const sources = [{ sourceId: "synthetic-freight", order: 0, amountMinor: 76860 }];
const native = allocateFreightComponent({ units, sources });
const sumByPerson = (rows: { personId: string; amountMinor: number }[]) => people.map(person => rows.filter(row => row.personId === person).reduce((sum, row) => sum + row.amountMinor, 0));
const obligations = sumByPerson(native.allocations);
assert.deepEqual(obligations, [28182, 20496, 10248, 17934]);
const oldBalance = [14233, 1898, 13894, 7009];
const consumedTopup = previewFifoConsumption(39826, [{ creditId: "synthetic-topup", sequence: 5, availableCnyMinor: 39830, availableHistoricalBrlCents: 34893 }]);
assert.equal(consumedTopup.historicalBrlCents, 34889);
const principal = obligations.map((amount, index) => ({ personId: people[index], order: index, amountMinor: amount - oldBalance[index] - (index === 0 ? 39826 : 0) }));
assert.deepEqual(principal.map(row => row.amountMinor), [-25877, 18598, -3646, 10925]);
const converted = convertSettlementPositions(principal, { fromCnyMinor: 39830, toBrlCents: 34893 });
assert.deepEqual(converted.map(row => row.amountMinor), [-22670, 16293, -3194, 9571]);
const fee = previewTopupFee({ creditedCnyMinor: 39830, originalFeeBrlCents: 349, consumedBeforeCnyMinor: 0, consumeCnyMinor: 39826, assignedBeforeBrlCents: 0 });
assert.equal(fee.assignedBrlCents, 349);
const feeAllocation = allocateFreightComponent({ units, sources: [{ sourceId: "synthetic-topup-fee", order: 0, amountMinor: fee.assignedBrlCents }] });
const feeByPerson = sumByPerson(feeAllocation.allocations);
assert.deepEqual(feeByPerson, [130, 96, 46, 77]);
const totals = converted.map((row, index) => ({ ...row, amountMinor: row.amountMinor + feeByPerson[index] - (index === 0 ? 349 : 0) }));
assert.deepEqual(totals.map(row => row.amountMinor), [-22889, 16389, -3148, 9648]);
assert.equal(totals.reduce((sum, row) => sum + row.amountMinor, 0), 0);
const historicalFreightBrlCents = 28868 + consumedTopup.historicalBrlCents + fee.assignedBrlCents;
assert.equal(historicalFreightBrlCents, 64106);
assert.deepEqual(allocateFreightComponent({ units: [...units].reverse(), sources }), native);
console.log(JSON.stringify({
  status: "ok", scope: "pure-calculations-only", physicalUnits: units.length,
  receipt, obligationsCnyMinor: obligations, principalPositionsCnyMinor: principal.map(row => row.amountMinor),
  convertedPrincipalBrlCents: converted.map(row => row.amountMinor), feeByPersonBrlCents: feeByPerson,
  finalPositionsBrlCents: totals.map(row => row.amountMinor), historicalFreightBrlCents,
  remainingTopupCnyMinor: 4, remainingTopupHistoricalBrlCents: 4,
  explicitlySelectedSyntheticPolicy: "centralized",
  claims: compensateSettlementPositions(totals, { mode: "centralized", centralizerId: "A" }),
  note: "Unit order produces different fee margins from the plan's aggregate example; neither overrides the other.",
}, null, 2));
