"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PackageSurface as Surface } from "./package-surface";
import type { CostTrackingView as Detail } from "@/lib/domain/package-cost-reading";
import { splitByWeights } from "@/lib/domain/package-cost-calculations";
import { formatMoney } from "@/lib/domain/money";
import { parseCostCents, percentFromBasisPoints, basisPointsFromPercent } from "./package-cost-client";
type ItemEditor = { id: string; name: string };
export type ItemCostDraft = { effectivePriceState?: Detail["items"][number]["effectivePriceState"]; effectivePriceUnitCents?: number | null; chinaFreightState?: Detail["items"][number]["chinaFreightState"]; chinaFreightUnitCents?: number | null; composition?: { mode: "equal" | "percentage" | "fixed"; participants: { personId: string; weight: number }[] } };
const amountInput = (value: number | null) => value === null ? "" : (value / 100).toFixed(2).replace(".", ",");
export function ItemCostSurface({
  detail,
  editor,
  busy,
  onClose,
  onSave,
  initialInput,
}: {
  detail: Detail;
  editor: ItemEditor;
  busy: boolean;
  onClose: () => void;
  onSave: (input: unknown) => Promise<void>;
  initialInput?: ItemCostDraft | null;
}) {
  const item = detail.items.find((value) => value.id === editor.id)!;
  const [priceState, setPriceState] = useState(initialInput?.effectivePriceState ?? item.effectivePriceState),
    [price, setPrice] = useState(amountInput(initialInput ? initialInput.effectivePriceUnitCents ?? null : item.effectivePriceUnitCents));
  const [chinaState, setChinaState] = useState(initialInput?.chinaFreightState ?? item.chinaFreightState),
    [china, setChina] = useState(amountInput(initialInput ? initialInput.chinaFreightUnitCents ?? null : item.chinaFreightUnitCents));
  const mode = item.participants[0]?.weightMode ?? "equal";
  const [compositionMode, setCompositionMode] = useState(initialInput?.composition?.mode ?? mode),
    [weights, setWeights] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        item.participants.map((person) => [
          person.personId,
          String(initialInput?.composition?.participants.find(entry => entry.personId === person.personId)?.weight ?? person.weight),
        ]),
      ),
    );
  const priceCents =
      priceState === "known"
        ? parseCostCents(price)
        : priceState === "no_charge"
          ? 0
          : null,
    chinaCents =
      chinaState === "known"
        ? parseCostCents(china)
        : chinaState === "no_charge"
          ? 0
          : null;
  const compositionChanged =
    compositionMode !== mode ||
    item.participants.some(
      (person) => Number(weights[person.personId]) !== person.weight,
    );
  const percentageValues = item.participants.map((person) =>
    Number(weights[person.personId]),
  );
  const percentageInputsValid = item.participants.every(
    (person, index) =>
      weights[person.personId] !== "" &&
      Number.isInteger(percentageValues[index]) &&
      percentageValues[index] >= 0 &&
      percentageValues[index] <= 10_000,
  );
  const percentageTotal = percentageValues.reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0),
    0,
  );
  const compositionValid =
    compositionMode === "equal" ||
    (compositionMode === "percentage"
      ? percentageInputsValid && percentageTotal === 10_000
      : item.participants.some(
          (person) => Number(weights[person.personId]) > 0,
        ));
  const originalProportions = splitByWeights(
    10_000,
    item.participants.map((person) => ({
      personId: person.personId,
      allocationOrder: person.allocationOrder,
      weight: person.weight,
    })),
  );

  function changeCompositionMode(value: string) {
    const nextMode = value as typeof compositionMode;
    if (nextMode === "equal")
      setWeights(
        Object.fromEntries(
          item.participants.map((person) => [person.personId, "1"]),
        ),
      );
    if (nextMode === "fixed" && mode === "fixed")
      setWeights(
        Object.fromEntries(
          item.participants.map((person) => [
            person.personId,
            String(person.weight),
          ]),
        ),
      );
    if (nextMode === "percentage" && compositionMode !== "percentage") {
      const converted = splitByWeights(
        10_000,
        item.participants.map((person) => ({
          personId: person.personId,
          allocationOrder: person.allocationOrder,
          weight: Number(weights[person.personId]) || person.weight,
        })),
      );
      if (converted)
        setWeights(
          Object.fromEntries(
            item.participants.map((person, index) => [
              person.personId,
              String(converted[index]),
            ]),
          ),
        );
    }
    setCompositionMode(nextMode);
  }

  const percentageTotalLabel = percentageInputsValid
    ? `${percentFromBasisPoints(percentageTotal)}%`
    : "—";

  function updatePercent(personId: string, value: string) {
    const basisPoints = basisPointsFromPercent(value);
    setWeights((current) => ({
      ...current,
      [personId]: value === "" ? "" : String(basisPoints ?? value),
    }));
  }

  const canSave =
    (priceState !== "known" || priceCents !== null) &&
    (chinaState !== "known" || chinaCents !== null) &&
    compositionValid;
  return (
    <Surface
      sheet
      open
      title="Custos do produto"
      subtitle={editor.name}
      description="Preço e frete China são valores por unidade. O histórico da compra permanece intacto."
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave({
            expectedRevision: detail.tracking.revision,
            itemId: item.id,
            effectivePriceState: priceState,
            effectivePriceUnitCents: priceState === "known" ? priceCents : null,
            chinaFreightState: chinaState,
            chinaFreightUnitCents: chinaState === "known" ? chinaCents : null,
            ...(compositionChanged
              ? {
                  composition: {
                    mode: compositionMode,
                    participants: item.participants.map((person) => ({
                      personId: person.personId,
                      weight:
                        compositionMode === "equal"
                          ? 1
                          : Number(weights[person.personId]) || 0,
                    })),
                  },
                }
              : {}),
          });
        }}
      >
        <div className="form-row">
          <label>
            Preço efetivo por unidade
            <select
              value={priceState}
              onChange={(event) =>
                setPriceState(event.target.value as typeof priceState)
              }
            >
              <option value="pending">Falta informar</option>
              <option value="known">Informado</option>
              <option value="no_charge">Sem cobrança</option>
            </select>
          </label>
          {priceState === "known" && (
            <label>
              Valor em R$
              <input
                required
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="0,00"
              />
            </label>
          )}
        </div>
        <div className="form-row">
          <label>
            Frete China por unidade
            <select
              value={chinaState}
              onChange={(event) =>
                setChinaState(event.target.value as typeof chinaState)
              }
            >
              <option value="pending">Falta informar</option>
              <option value="known">Informado</option>
              <option value="no_charge">Sem cobrança</option>
            </select>
          </label>
          {chinaState === "known" && (
            <label>
              Valor em R$
              <input
                required
                inputMode="decimal"
                value={china}
                onChange={(event) => setChina(event.target.value)}
                placeholder="0,00"
              />
            </label>
          )}
        </div>
        <div className="cost-composition">
          <label>
            Divisão entre pessoas
            <select
              value={compositionMode}
              onChange={(event) => changeCompositionMode(event.target.value)}
            >
              <option value="equal">Divisão igual</option>
              <option value="percentage">Percentuais</option>
              {mode === "fixed" && (
                <option value="fixed">Proporção original</option>
              )}
            </select>
          </label>
          {compositionMode === "percentage" && (
            <p className="muted">
              Distribua os percentuais. A soma precisa fechar em 100%.
            </p>
          )}
          {compositionMode === "fixed" && (
            <p className="muted">
              Proporção derivada dos valores fixos originais. Os novos custos
              seguem esta proporção; os valores em reais não permanecem fixos.
            </p>
          )}
          {item.participants.map((person, index) =>
            compositionMode === "fixed" ? (
              <div
                className="cost-composition-participant"
                key={person.personId}
              >
                <span>{person.name}</span>
                <strong>
                  {originalProportions
                    ? `${percentFromBasisPoints(originalProportions[index])}% · proporção original`
                    : "Proporção não definida"}
                </strong>
              </div>
            ) : compositionMode === "equal" ? (
              <div
                className="cost-composition-participant"
                key={person.personId}
              >
                <span>{person.name}</span>
                <strong>Divisão igual</strong>
              </div>
            ) : (
              <label key={person.personId}>
                {person.name}
                <span className="cost-composition-input">
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${person.name} (%)`}
                    value={
                      weights[person.personId] === ""
                        ? ""
                        : Number.isFinite(Number(weights[person.personId]))
                          ? percentFromBasisPoints(
                              Number(weights[person.personId]),
                            )
                          : weights[person.personId]
                    }
                    onChange={(event) =>
                      updatePercent(person.personId, event.target.value)
                    }
                  />
                  <small>Percentual</small>
                </span>
              </label>
            ),
          )}
          {compositionMode === "percentage" && (
            <p
              className={compositionValid ? "cost-percent-total" : "error"}
              role={compositionValid ? "status" : "alert"}
            >
              Percentual distribuído: {percentageTotalLabel}
              {compositionValid ? " · total fechado" : " · precisa somar 100%"}
            </p>
          )}
          {compositionMode === "percentage" && !compositionValid && (
            <p className="error" role="alert">
              Ajuste os percentuais antes de salvar.
            </p>
          )}
        </div>
        <div className="cost-editor-preview">
          <span>
            Quantidade <strong>{item.original.quantity}</strong>
          </span>
          <span>
            Subtotal efetivo{" "}
            <strong>
              {priceCents === null
                ? "Pendente"
                : formatMoney(priceCents * item.original.quantity)}
            </strong>
          </span>
          <span>
            Frete China total{" "}
            <strong>
              {chinaCents === null
                ? "Pendente"
                : formatMoney(chinaCents * item.original.quantity)}
            </strong>
          </span>
        </div>
        <div className="form-actions">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={busy || !canSave}>
            {busy ? "Salvando…" : "Salvar custos"}
          </Button>
        </div>
      </form>
    </Surface>
  );
}

