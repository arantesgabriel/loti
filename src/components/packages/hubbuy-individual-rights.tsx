"use client";

import { useId, useState } from "react";
import { Coins, UserRound } from "lucide-react";
import { ProductCategoryMarker } from "@/components/product-category-icons";
import { resolveProductCategory } from "@/lib/domain/categories";
import type { IndividualRight } from "@/lib/domain/hubbuy-rights-presentation";
import { formatBrlMinor, formatCnyMinor } from "@/lib/domain/financial-money";

function RightDetails({ right, name }: { right: IndividualRight; name: string }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const origins = expanded ? right.origins : right.origins.slice(0, 3);
  return <section className="hubbuy-person-right" aria-label={`Direitos de ${name}`}>
    <div className="hubbuy-right-heading"><h4>{name}</h4><strong className="hubbuy-right-amount">{formatCnyMinor(right.availableCnyMinor)} · {formatBrlMinor(right.availableHistoricalBrlCents)}</strong></div>
    <ul id={listId} className="hubbuy-right-origins">
      {origins.map(origin => <li key={origin.id} className="hubbuy-right-origin">
        <div className="hubbuy-right-origin-identity">
          {origin.kind === "refund_product" ? <ProductCategoryMarker visualKey={resolveProductCategory(origin.label)}/> : <span className="hubbuy-right-origin-marker" aria-hidden="true"><Coins size={18}/></span>}
          <div className="hubbuy-right-origin-copy" title={[origin.label, origin.variant].filter(Boolean).join(" · ")}><span className="hubbuy-right-origin-name">{origin.label}</span>
            {origin.variant && <span className="hubbuy-right-origin-context"> · {origin.variant}</span>}
          </div>
        </div>
        <div className="hubbuy-right-origin-balance">
          <span className="hubbuy-right-amount">{formatCnyMinor(origin.availableCnyMinor)} <span className="hubbuy-right-origin-brl">· {formatBrlMinor(origin.availableHistoricalBrlCents)}</span></span>
          {origin.kind === "refund_product" && <span className="sr-only">Reembolso recebido</span>}
        </div>
      </li>)}
    </ul>
    {right.origins.length > 3 && <button type="button" className="hubbuy-right-toggle" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(current => !current)}>{expanded ? "Recolher" : `Ver todas as origens (${right.origins.length})`}<span className="sr-only"> de {name}</span></button>}
  </section>;
}

export function HubBuyIndividualRights({ rights, members, loading, failed, reconciled }: { rights?: IndividualRight[]; members: { id: string; name: string }[]; loading: boolean; failed: boolean; reconciled: boolean }) {
  const visibleRights = rights?.filter(right => right.availableCnyMinor !== 0 || right.availableHistoricalBrlCents !== 0);
  return <section className="hubbuy-individual-rights" aria-label="Saldo por pessoa" aria-busy={loading}>
    <div className="hubbuy-rights-title"><UserRound size={21} aria-hidden="true"/><div><h3>Saldo por pessoa</h3><p>Valores disponíveis após usos do saldo. R$ representa a base histórica.</p></div></div>
    {rights && !reconciled && <p className="hubbuy-rights-unreconciled" role="status">Direitos não conciliados. Confira a composição e o saldo da conta antes de usar.</p>}
    {failed ? <p className="muted">Direitos indisponíveis. Tente carregar novamente.</p>
      : !rights ? <p className="muted">Carregando direitos…</p>
      : visibleRights?.length ? visibleRights.map(right => <RightDetails key={right.personId} right={right} name={members.find(member => member.id === right.personId)?.name ?? "Membro"}/>)
      : <p className="muted">Sem direitos remanescentes.</p>}
  </section>;
}
