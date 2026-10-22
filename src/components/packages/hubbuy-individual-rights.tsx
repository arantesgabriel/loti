"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Coins, UserRound } from "lucide-react";
import { ProductCategoryMarker } from "@/components/product-category-icons";
import { resolveProductCategory } from "@/lib/domain/categories";
import type { BalanceOriginHistory, PersonBalanceHistory } from "@/lib/domain/hubbuy-balance-traceability";
import { formatBrlMinor, formatCnyMinor } from "@/lib/domain/financial-money";
import { Surface } from "@/components/ui/surface";

const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informada";
const brl = (value: number | null) => value === null ? "Não identificado" : formatBrlMinor(value);
const status = (origin: BalanceOriginHistory) => origin.adjustmentDeltaCnyMinor ? `Ajustado · ${origin.availableCnyMinor ? "com saldo" : "sem saldo"}` : origin.state === "exhausted" ? "Esgotado" : origin.state === "partially_used" ? "Parcialmente usado" : "Disponível";
const normalized = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
function Identity({ origin }: { origin: BalanceOriginHistory }) {
  return <div className="hubbuy-history-identity">{origin.kind === "refund_product" ? <ProductCategoryMarker visualKey={resolveProductCategory(origin.label)}/> : <Coins size={18} aria-hidden="true"/>}<span><strong>{origin.label}</strong>{origin.variant && <small>{origin.variant}</small>}{origin.purchaseName && <small>{origin.purchaseName}</small>}<small>{status(origin)}</small></span></div>;
}

function PersonHistory({ history, name, origins, onDetails }: { history: PersonBalanceHistory; name: string; origins: BalanceOriginHistory[]; onDetails: (origin: BalanceOriginHistory) => void }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId(), visible = expanded ? origins : origins.slice(0, 10);
  const adjustments = origins.some(row => row.adjustmentDeltaCnyMinor !== 0);
  return <section className="hubbuy-person-right" aria-label={`Histórico de ${name}`}>
    <div className="hubbuy-right-heading"><h4>{name}</h4><strong className="hubbuy-right-amount">Disponível {formatCnyMinor(history.availableCnyMinor)} · {formatBrlMinor(history.availableHistoricalBrlCents)}</strong></div>
    <table className="hubbuy-history-table" id={id}><caption className="sr-only">Origens do saldo de {name}. Valores registrados no Loti.</caption><thead><tr><th scope="col">Produto / origem</th><th scope="col">Custo pago</th><th scope="col">Creditado</th><th scope="col">Usado em compras</th>{adjustments && <th scope="col">Ajustes</th>}<th scope="col">Restante</th><th scope="col"><span className="sr-only">Detalhes</span></th></tr></thead><tbody>
      {visible.map(origin => <tr key={origin.id}>
        <td data-label="Produto / origem"><Identity origin={origin}/></td>
        <td data-label="Custo pago">{origin.paidCost ? formatBrlMinor(origin.paidCost.totalBrlCents) : origin.kind === "refund_product" ? "Não identificado" : "Não se aplica"}</td>
        <td data-label="Creditado">{formatCnyMinor(origin.creditedCnyMinor)}{origin.kind === "refund_product" && <small>Reembolso · bruto</small>}</td>
        <td data-label="Usado em compras">{formatCnyMinor(origin.purchaseConsumedCnyMinor)}</td>
        {adjustments && <td data-label="Ajustes">{origin.adjustmentDeltaCnyMinor ? `− ${formatCnyMinor(-origin.adjustmentDeltaCnyMinor)}` : "—"}</td>}
        <td data-label="Restante"><strong>{formatCnyMinor(origin.availableCnyMinor)}</strong><small>{formatBrlMinor(origin.availableHistoricalBrlCents)} · base histórica</small></td>
        <td><button className="hubbuy-history-details" type="button" aria-label={`Detalhes de ${origin.label} de ${name}`} onClick={() => onDetails(origin)}>Detalhes</button></td>
      </tr>)}
    </tbody></table>
    {origins.length > 10 && <button type="button" className="hubbuy-right-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>{expanded ? "Recolher" : `Mostrar mais (${origins.length - 10})`}<span className="sr-only"> de {name}</span></button>}
  </section>;
}

function OriginDetails({ origin, personId, goToEntry }: { origin: BalanceOriginHistory; personId: string; goToEntry: (entryId: string) => void }) {
  const paid = origin.paidCost;
  const heading = useRef<HTMLDivElement>(null);
  useEffect(() => { heading.current?.focus(); }, [origin.id]);
  return <div ref={heading} tabIndex={-1} aria-label={`Origem ${origin.label}`} className="hubbuy-history-detail">
    <Identity origin={origin}/>
    <section><h3>Custo pago</h3>{paid ? <><p>Parcela da pessoa no item inteiro, incluindo produto, frete China e taxas. Frete Brasil e Receita não estão incluídos.</p><dl><div><dt>Principal</dt><dd>{formatBrlMinor(paid.principalBrlCents)}</dd></div><div><dt>Taxas capturadas</dt><dd>{formatBrlMinor(paid.feeBrlCents)}</dd></div><div><dt>Total histórico</dt><dd>{formatBrlMinor(paid.totalBrlCents)}</dd></div><div><dt>Dinheiro novo</dt><dd>{brl(paid.newMoneyBrlCents)}</dd></div><div><dt>Saldo anterior utilizado</dt><dd>{paid.previousBalanceCnyMinor === null ? "Não identificado" : formatCnyMinor(paid.previousBalanceCnyMinor)}</dd></div><div><dt>Base do saldo utilizado</dt><dd>{brl(paid.previousBalanceHistoricalBrlCents)}</dd></div></dl></> : <p>{origin.kind === "refund_product" ? "Não há base histórica segura para identificar o custo pago desta pessoa. Ela pode ser titular do crédito sem ser a beneficiária do produto." : "Esta origem não representa o pagamento de um produto."}</p>}</section>
    <section><h3>Composição do crédito</h3><p>Creditado − usado em compras + ajustes = restante.</p><p className="hubbuy-history-equation">{formatCnyMinor(origin.creditedCnyMinor)} − {formatCnyMinor(origin.purchaseConsumedCnyMinor)} − {formatCnyMinor(Math.abs(origin.adjustmentDeltaCnyMinor))} = <strong>{formatCnyMinor(origin.availableCnyMinor)}</strong></p>{origin.validRefundCnyMinor !== null && <p>Reembolso após anulações: <strong>{formatCnyMinor(origin.validRefundCnyMinor)}</strong>. O crédito bruto inclui recebimentos substituídos, identificados abaixo.</p>}<p>Usado em compras é o consumo registrado do lote. Um pagamento corrigido permanece no histórico; sua restauração aparece em outra origem.</p></section>
    {origin.receipts.map(receipt => <section key={receipt.shareId} className="hubbuy-history-event"><h3>{origin.kind === "refund_product" ? "Recebimento" : "Entrada"} · #{receipt.sequence}</h3><strong>{formatCnyMinor(receipt.creditedCnyMinor)} · {formatBrlMinor(receipt.historicalBrlCents)} de base histórica</strong>
      <p>Data do registro: {date(receipt.recordedAt)}<br/>Ocorrência informada: {date(receipt.occurredAt)}<br/>Horários de Brasília. A ocorrência informada não comprova o horário da HubBuy.</p>
      {receipt.reason && <p>{receipt.reason}</p>}<p className="hubbuy-history-reference">Referência Loti: {receipt.sourceReference}</p>
      {receipt.receiptReversedCnyMinor > 0 && <p>Recebimento anulado em {formatCnyMinor(receipt.receiptReversedCnyMinor)}. Consulte os ajustes abaixo.</p>}
      {receipt.restoredFrom.length > 0 && <><p>Este saldo reúne créditos anteriores. O restante é identificado nesta restauração; não há divisão persistida por produto de origem.</p><ul>{receipt.restoredFrom.map((source, index) => <li key={`${source.entryId}:${index}`}><button type="button" className="hubbuy-history-details" onClick={() => goToEntry(source.entryId)}>{source.sourceLabel}</button> · {formatCnyMinor(source.amountCnyMinor)} restaurados</li>)}</ul></>}
      <h4>Destinos e ajustes</h4>{receipt.uses.length === 0 ? <p>Nenhum consumo registrado.</p> : <ol className="hubbuy-history-uses">{receipt.uses.map(use => <li key={use.entryId}>
        <strong>{use.kind === "purchase_payment" ? "Pagamento" : "Ajuste de saída"} · #{use.sequence} · {formatCnyMinor(use.amountCnyMinor)}</strong><small>Base consumida: {formatBrlMinor(use.historicalBrlCents)}</small>
        <p>Registro: {date(use.recordedAt)}<br/>Ocorrência informada: {date(use.occurredAt)}</p>{use.reason && <p>{use.reason}</p>}
        {use.destinations.length ? <ul>{use.destinations.map(target => <li key={target.allocationId}>{target.label} · {formatCnyMinor(target.amountCnyMinor)}{target.orderReference && <small>Pedido: {target.orderReference}</small>}{target.beneficiaryId !== personId && <small>Beneficiário: {target.beneficiaryName}</small>}</li>)}</ul> : <p>{use.kind === "purchase_payment" ? "Destino do pagamento não identificado." : "Saída registrada fora de um pagamento de produto."}</p>}
        {use.restored.map(row => <p key={row.entryId}>Pagamento/saída compensado. <button type="button" className="hubbuy-history-details" onClick={() => goToEntry(row.entryId)}>Ver {row.label.toLocaleLowerCase("pt-BR")}</button> · {formatCnyMinor(row.personCnyMinor)} para este titular no débito completo.</p>)}
      </li>)}</ol>}
    </section>)}
  </div>;
}

export function HubBuyIndividualRights({ traceability, members, loading, failed, reconciled }: { traceability?: PersonBalanceHistory[]; members: { id: string; name: string }[]; loading: boolean; failed: boolean; reconciled: boolean }) {
  const [filter, setFilter] = useState("all"), [search, setSearch] = useState(""), [person, setPerson] = useState("");
  const [selected, setSelected] = useState<{ personId: string; originId: string } | null>(null);
  const currentPerson = traceability?.find(row => row.personId === selected?.personId);
  const selectedOrigin = currentPerson?.origins.find(row => row.id === selected?.originId);
  const name = (id: string) => members.find(row => row.id === id)?.name ?? "Membro";
  const visible = traceability?.filter(row => !person || row.personId === person).map(row => ({ ...row, visibleOrigins: row.origins.filter(origin => (!search || normalized(`${origin.label} ${origin.variant ?? ""}`).includes(normalized(search))) && (filter === "all" || (filter === "available" ? origin.availableCnyMinor > 0 : origin.availableCnyMinor === 0))) })).filter(row => row.visibleOrigins.length);
  return <section className="hubbuy-individual-rights hubbuy-history" aria-label="Histórico do saldo por pessoa" aria-busy={loading}>
    <div className="hubbuy-rights-title"><UserRound size={21} aria-hidden="true"/><div><h3>Histórico do saldo por pessoa</h3><p>Inclui créditos já consumidos. CNY são registros do Loti; R$ representa a base histórica.</p></div></div>
    {traceability && !reconciled && <p className="hubbuy-rights-unreconciled" role="status">Direitos não conciliados. Confira o histórico e o saldo da conta antes de usar.</p>}
    {failed ? <p className="muted">Histórico indisponível. Tente carregar novamente.</p> : !traceability ? <p className="muted">Carregando histórico…</p> : traceability.some(row => row.origins.length) ? <>
      <div className="hubbuy-history-filters"><label>Mostrar origens<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todas</option><option value="available">Com saldo</option><option value="exhausted">Esgotadas</option></select></label><label>Pessoa<select value={person} onChange={event => setPerson(event.target.value)}><option value="">Todas as pessoas</option>{traceability.filter(row => row.origins.length).map(row => <option key={row.personId} value={row.personId}>{name(row.personId)}</option>)}</select></label><label>Buscar produto ou origem<input type="search" value={search} onChange={event => setSearch(event.target.value)}/></label></div>
      {visible?.length ? visible.map(row => <PersonHistory key={`${row.personId}:${filter}:${search}`} history={row} origins={row.visibleOrigins} name={name(row.personId)} onDetails={origin => setSelected({ personId: row.personId, originId: origin.id })}/>) : <p role="status">Nenhuma origem encontrada com esses filtros.</p>}
    </> : <p className="muted">Sem histórico de saldo.</p>}
    {selectedOrigin && currentPerson && <Surface open sheet mobileFullScreen title="Detalhes da origem" subtitle={name(currentPerson.personId)} onOpenChange={open => { if (!open) setSelected(null); }}><OriginDetails origin={selectedOrigin} personId={currentPerson.personId} goToEntry={entryId => { const origin = currentPerson.origins.find(row => row.receipts.some(receipt => receipt.entryId === entryId)); if (origin) setSelected({ personId: currentPerson.personId, originId: origin.id }); }}/></Surface>}
  </section>;
}
