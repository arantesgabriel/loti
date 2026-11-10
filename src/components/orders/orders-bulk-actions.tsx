"use client";

import { Button } from "@/components/ui/button";
import type { WarehouseData } from "./orders-screen";

type Row = WarehouseData["rows"][number];
type Account = WarehouseData["accounts"][number];

export function remainingArrivalUnits(row: Row) {
  const cancelled = new Set(row.cancelledUnits);
  const recorded = row.reviewState === "confirmed" ? row.receivedUnits.filter(unit => !cancelled.has(unit)).length : 0;
  return Math.max(0, row.quantity - cancelled.size - recorded);
}

export function arrivalAccounts(row: Row, accounts: Account[]) {
  const linked = row.order.accountId ?? row.accountId;
  return accounts.filter(account => account.status === "active" && (!linked || account.id === linked));
}

export function BulkArrivalFields({ rows, accounts, suggestion, disabled, draft, onRemove }: {
  rows: Row[]; accounts: Account[]; suggestion: string | null; disabled: boolean; draft: { costItemId: string; quantity: number; accountId: string }[]; onRemove: (id: string) => void;
}) {
  return <fieldset disabled={disabled} className="orders-bulk-fields">
    {rows.map(row => {
      const eligible = arrivalAccounts(row, accounts);
      const previous = draft.find(line => line.costItemId === row.costItemId);
      const preferred = previous?.accountId ?? row.order.accountId ?? row.accountId ?? suggestion;
      const defaultAccount = eligible.find(account => account.id === preferred)?.id ?? (eligible.length === 1 ? eligible[0].id : "");
      const remaining = remainingArrivalUnits(row);
      return <fieldset key={row.costItemId}>
        <legend>{row.name}</legend>
        {row.reviewState === "pending_review" && <p>Chegada sem registro. Confira a quantidade antes de confirmar.</p>}
        <label>Quantidade que chegou agora<input name={`quantity-${row.costItemId}`} type="number" min={1} max={remaining} defaultValue={previous?.quantity ?? remaining} required /></label>
        <label>Conta HubBuy<select name={`account-${row.costItemId}`} defaultValue={defaultAccount} required>
          <option value="" disabled>Escolha a conta HubBuy</option>
          {eligible.map(account => <option key={account.id} value={account.id}>{account.label}</option>)}
        </select></label>
        {draft.length > 0 && <Button type="button" variant="ghost" onClick={() => onRemove(row.costItemId)}>Retirar item</Button>}
      </fieldset>;
    })}
  </fieldset>;
}

export function BulkOrderActions({ count, disabled, onClear, onArrival, onReserve }: {
  count: number; disabled: boolean; onClear: () => void; onArrival: () => void; onReserve: () => void;
}) {
  return <div className="orders-selection-summary orders-bulk-actions">
    <span role="status">{count} {count === 1 ? "item marcado" : "itens marcados"}</span>
    <Button type="button" variant="outline" disabled={disabled} onClick={onArrival}>Registrar chegada ao armazém</Button>
    <Button type="button" variant="outline" disabled={disabled} onClick={onReserve}>Adicionar a um pacote</Button>
    <Button type="button" variant="ghost" onClick={onClear}>Limpar itens marcados</Button>
  </div>;
}
