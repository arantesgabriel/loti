"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingState } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { logisticsQuery, packageDestinationsParams } from "./logistics-query";
import { costRequest } from "@/components/packages/package-cost-client";
import { useWorkspace } from "@/components/workspace-provider";
import type { WarehouseData } from "./orders-screen";
import { OrdersContextSurface } from "./orders-context-surface";
import { OpenPackagePicker } from "./open-package-picker";
import "./orders.css";

type Row = WarehouseData["rows"][number];
type Mode = "release" | "move";
type ReservationGroup = { packageId: string; reservations: Row["reservations"] };

export function OrdersReservationActions({
  row,
  data,
  mode,
  onOpenChange,
  onChanged,
}: {
  row: Row | null;
  data: WarehouseData;
  mode: Mode | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { data: workspace, registerWorkspaceDraft } = useWorkspace();
  const open = !!row && mode !== null;
  const [sourcePackageId, setSourcePackageId] = useState("");
  const [targetPackageId, setTargetPackageId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [targetPage, setTargetPage] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const busyRef = useRef(false);
  const attempt = useRef<{ idempotencyKey: string; command: Record<string, unknown> } | null>(null);

  const groups = useMemo<ReservationGroup[]>(() => {
    if (!row) return [];
    const grouped = new Map<string, Row["reservations"]>();
    for (const reservation of row.reservations) {
      grouped.set(reservation.packageId, [...(grouped.get(reservation.packageId) ?? []), reservation]);
    }
    return [...grouped].map(([packageId, reservations]) => ({ packageId, reservations }));
  }, [row]);
  const sourceGroup = groups.find(group => group.packageId === sourcePackageId) ?? groups[0];
  const sourcePackage = sourceGroup && data.packages.find(pkg => pkg.id === sourceGroup.packageId);
  const enabled = open && mode === "move" && !!row?.accountId;
  const targetQuery = useQuery({
    ...logisticsQuery<WarehouseData>(workspace.currentUser.id, workspace.workspaceId, "destinations", "/api/warehouse",
      packageDestinationsParams(row?.accountId ?? "", targetSearch, targetPage), "Não foi possível carregar os pacotes em montagem."),
    enabled,
  });
  const targets = targetQuery.data?.packages ?? [];
  const targetTotal = targetQuery.data?.packageOptions.total ?? 0;
  const targetHasMore = targetQuery.data?.packageOptions.hasMore ?? false;
  const loadingTargets = enabled && targetQuery.isPending;
  const canEditSource = !!sourcePackage
    && sourcePackage.stage === "preparing"
    && sourcePackage.reviewState === "confirmed"
    && !sourcePackage.contentClosedAt
    && !sourcePackage.financialClosedAt;

  useEffect(() => registerWorkspaceDraft("orders-reservation-action", open), [registerWorkspaceDraft, open]);

  function updateTargetSearch(value: string) {
    setTargetSearch(value);
    setTargetPage(0);
    setTargetPackageId("");
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row || !mode || !sourceGroup || !sourcePackage || !canEditSource || busyRef.current) return;
    if (mode === "move" && (!targetPackageId || targetPackageId === sourcePackage.id)) {
      setError("Escolha outro pacote aberto da mesma conta HubBuy.");
      return;
    }
    const command = mode === "release"
      ? {
          operation: "release",
          packageId: sourcePackage.id,
          expectedRevision: sourcePackage.revision,
          reservationIds: sourceGroup.reservations.map(reservation => reservation.id),
          reason: reason.trim(),
        }
      : {
          operation: "move",
          packageId: sourcePackage.id,
          targetPackageId,
          expectedRevision: sourcePackage.revision,
          targetRevision: targets.find(pkg => pkg.id === targetPackageId)?.revision,
          reservationIds: sourceGroup.reservations.map(reservation => reservation.id),
          reason: reason.trim(),
        };
    if (mode === "move" && !Number.isSafeInteger(command.targetRevision)) {
      setError("O pacote de destino mudou. Atualize as opções e escolha novamente.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const payload = attempt.current ??= { idempotencyKey: crypto.randomUUID(), command };
    const result = await costRequest<{ id: string }>("/api/warehouse", {
      workspaceId: workspace.workspaceId,
      ...payload,
    }, workspace.workspaceId);
    busyRef.current = false;
    setBusy(false);
    if (!result.ok) {
      const unknown = result.status === 0 || result.status >= 500;
      setUncertain(unknown);
      if (!unknown) attempt.current = null;
      setError(unknown
        ? "A confirmação não chegou. Tente novamente para consultar a mesma operação com segurança."
        : result.error ?? "A operação não foi concluída. Revise os dados e tente novamente.");
      return;
    }
    attempt.current = null;
    setUncertain(false);
    setError("");
    onOpenChange(false);
    onChanged();
  }

  const eligibleTargets = targets.filter(pkg => pkg.id !== sourcePackage?.id && pkg.accountId === row?.accountId);
  const heading = mode === "move" ? "Trocar pacote" : "Remover do pacote";

  return (
    <OrdersContextSurface
      open={open}
      onOpenChange={onOpenChange}
      title={heading}
      description={row ? `${row.name} · ${row.reservations.length} ${row.reservations.length === 1 ? "unidade vinculada" : "unidades vinculadas"}` : undefined}
      className="orders-reservation-actions-surface"
    >
      {row && mode && (
        <form className="orders-reservation-action-form" onSubmit={event => void confirm(event)}>
          {groups.length > 1 && (
            <fieldset className="orders-reservation-source-picker">
              <legend>Pacote atual</legend>
              {groups.map(group => {
                const pkg = data.packages.find(candidate => candidate.id === group.packageId);
                return (
                  <label key={group.packageId}>
                    <input
                      type="radio"
                      name="source-package"
                      value={group.packageId}
                      checked={sourceGroup?.packageId === group.packageId}
                      onChange={() => { setSourcePackageId(group.packageId); setTargetPackageId(""); setError(""); }}
                    />
                    <span><strong>{pkg?.name ?? "Pacote vinculado"}</strong><small>{group.reservations.length} {group.reservations.length === 1 ? "unidade" : "unidades"}</small></span>
                  </label>
                );
              })}
            </fieldset>
          )}
          {sourcePackage && <p className="orders-reservation-source-summary">
            <strong>{sourcePackage.name}</strong>
            <span>{sourceGroup?.reservations.length} {sourceGroup?.reservations.length === 1 ? "unidade vinculada" : "unidades vinculadas"}</span>
          </p>}
          {!sourcePackage && <p role="alert" className="form-error">Não foi possível localizar o pacote vinculado. Atualize os pedidos antes de continuar.</p>}
          {sourcePackage && !canEditSource && <p className="orders-reservation-locked-note">
            Este pacote não está em montagem. Conteúdo fechado, financeiro encerrado ou envio registrado impede a alteração das unidades.
          </p>}
          {mode === "move" && (
            <>
              {!row.accountId && <p role="alert" className="form-error">Confira a conta HubBuy do produto antes de trocar o pacote.</p>}
              {row.accountId && <>
                <OpenPackagePicker
                  packages={eligibleTargets}
                  selectedId={targetPackageId}
                  onSelect={setTargetPackageId}
                  search={targetSearch}
                  onSearchChange={updateTargetSearch}
                  page={targetPage}
                  total={targetTotal}
                  hasMore={targetHasMore}
                  onPageChange={page => { setTargetPackageId(""); setTargetPage(page); }}
                />
                {loadingTargets && <LoadingState label="Buscando pacotes…" rows={2} />}
                {targetQuery.error?.message && <p role="alert" className="form-error">{targetQuery.error.message}</p>}
              </>}
            </>
          )}
          {mode === "release" && <p className="orders-reservation-release-note">
            As unidades voltarão ao armazém e poderão ser selecionadas para outro pacote. Custos e pagamentos do produto permanecem iguais.
          </p>}
          <label className="orders-reservation-reason">
            Motivo
            <textarea required minLength={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} />
          </label>
          {error && <p role="alert" className="orders-form-error">{error}</p>}
          <div className="orders-reservation-actions-footer">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy || !canEditSource || (mode === "move" && (!targetPackageId || loadingTargets))}>
              {busy ? "Salvando…" : uncertain ? "Tentar novamente" : mode === "move" ? "Trocar pacote" : "Confirmar retirada"}
            </Button>
          </div>
        </form>
      )}
    </OrdersContextSurface>
  );
}
