"use client";
import Link from "next/link";
import {useCallback,useEffect,useState} from "react";
import {Button} from "@/components/ui/button";
import {PackageSurface as Surface} from "@/components/packages/package-surface";
import {costRequest,parseCostCents} from "@/components/packages/package-cost-client";
import {formatMoney} from "@/lib/domain/money";
import type {logisticsPackageServices} from "@/lib/domain/logistics-package-services";
import type {WarehouseData} from "./orders-screen";
import {useWorkspace} from "@/components/workspace-provider";
import "./orders.css";
type Detail=Awaited<ReturnType<ReturnType<typeof logisticsPackageServices>["get"]>>;
type Action="review"|"close_content"|"reopen_content"|"dispatch"|"receive"|"close_financial"|"reopen_financial"|"confirm_legacy_content"|"freight"|"customs"|"record_freight"|"record_customs"|"correct_freight"|"correct_customs"|"weight"|"release";
const titles:Record<Action,string>={review:"Conferir pacote legado",close_content:"Fechar conteúdo",reopen_content:"Reabrir conteúdo",dispatch:"Registrar despacho",receive:"Registrar recebimento",close_financial:"Encerrar custos do pacote",reopen_financial:"Reabrir custos do pacote",confirm_legacy_content:"Confirmar conteúdo legado fechado",freight:"Confirmar frete",customs:"Confirmar Receita",record_freight:"Informar frete",record_customs:"Informar Receita",correct_freight:"Corrigir frete",correct_customs:"Corrigir Receita",weight:"Informar peso",release:"Retirar unidades do pacote"};
type AllocationUnit={unitIndex:number;amountCents:number;people:{personId:string;amountCents:number}[]};
function AllocationTable({caption,units,personName}:{caption:string;units:AllocationUnit[];personName:(id:string)=>string}){
  const subtotal=units.reduce((sum,unit)=>sum+unit.amountCents,0);
  return <div className="orders-allocation-table-wrap"><table className="orders-allocation-table">
    <caption className="sr-only">{caption}</caption>
    <thead><tr><th scope="col">Unidade</th><th scope="col">Participante</th><th scope="col">Valor</th></tr></thead>
    {units.map(unit=><tbody key={unit.unitIndex}>
      {unit.people.length?unit.people.map((person,index)=><tr key={person.personId}>
        {index===0&&<th scope="rowgroup" rowSpan={unit.people.length}><span>Unidade {unit.unitIndex+1}</span><small>Total da unidade {formatMoney(unit.amountCents)}</small></th>}
        <td>{personName(person.personId)}</td><td className="orders-allocation-money">{formatMoney(person.amountCents)}</td>
      </tr>):<tr><th scope="row"><span>Unidade {unit.unitIndex+1}</span><small>Total da unidade {formatMoney(unit.amountCents)}</small></th><td>Sem participantes</td><td className="orders-allocation-money">—</td></tr>}
    </tbody>)}
    <tfoot><tr><th scope="row" colSpan={2}>Subtotal neste pacote</th><td className="orders-allocation-money">{formatMoney(subtotal)}</td></tr></tfoot>
  </table></div>;
}
export function LogisticsPackageDetail({packageId}:{packageId:string}){
  const {data:workspace}=useWorkspace(),[data,setData]=useState<Detail|null>(null),[warehouse,setWarehouse]=useState<WarehouseData|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[action,setAction]=useState<Action|null>(null);
  const url=`/api/logistics/packages/${encodeURIComponent(packageId)}`;
  const warehouseUrl=`/api/warehouse?packageId=${encodeURIComponent(packageId)}&pageSize=100`;
  const load=useCallback(async()=>{const [r,w]=await Promise.all([costRequest<Detail>(url),costRequest<WarehouseData>(warehouseUrl)]);if(r.ok && r.data)setData(r.data);else setError(r.error??"Não foi possível carregar o pacote.");if(w.ok && w.data)setWarehouse(w.data);},[url,warehouseUrl]);
  useEffect(()=>{let active=true;void Promise.all([costRequest<Detail>(url),costRequest<WarehouseData>(warehouseUrl)]).then(([r,w])=>{if(!active)return;if(r.ok && r.data)setData(r.data);else setError(r.error??"Não foi possível carregar o pacote.");if(w.ok && w.data)setWarehouse(w.data);});return()=>{active=false;};},[url,warehouseUrl]);
  async function submit(form:FormData){
    if(!data || !action)return;
    const common={expectedRevision:data.pkg.revision,reason:String(form.get("reason"))};
    let command:Record<string,unknown>={...common,operation:action,confirmed:true};
    if(action==="review")command={...command,accountId:String(form.get("account")),confirmClosedContent:form.get("closedContent")==="on"};
    if(action==="weight")command={...common,operation:"weight",weightGrams:Number(form.get("weight"))};
    if(action==="freight" || action==="customs"){
      const amountCents=parseCostCents(String(form.get("amount")));
      if(amountCents===null){setError("Informe um valor válido.");return;}
      command={...common,operation:"pay_charge",charge:action,amountCents,paymentMethod:String(form.get("method")),feeBps:action==="customs"?0:Math.round(Number(String(form.get("fee")).replace(",","."))*100),confirmed:true};
    }
    if(action==="record_freight" || action==="record_customs" || action==="correct_freight" || action==="correct_customs"){
      const valueState=String(form.get("state")),amountCents=valueState==="known"?parseCostCents(String(form.get("amount"))):null;
      if(valueState==="known" && amountCents===null){setError("Informe o valor conhecido.");return;}
      const correcting=action.startsWith("correct_");
      command={...common,operation:correcting?"correct_charge":"record_charge",charge:action.endsWith("freight")?"freight":"customs",valueState,amountCents,paymentMethod:valueState==="known"?"pix":null,feeBps:valueState==="known"?Math.round(Number(form.get("fee")??0)*100):null,...(correcting?{confirmedPaymentReset:form.get("resetPayment")==="on"}:{})};
    }
    setBusy(true);
    const result=action==="release"?await costRequest("/api/warehouse",{workspaceId:workspace.workspaceId,idempotencyKey:crypto.randomUUID(),command:{...common,operation:"release",packageId,reservationIds:form.getAll("reservation").map(String)}}):await costRequest(url,{idempotencyKey:crypto.randomUUID(),command});
    setBusy(false);if(!result.ok){setError(result.error??"Operação não concluída.");return;}setAction(null);setError("");await load();
  }
  if(!data)return <><Link href="/packages">Voltar aos pacotes</Link><p role={error?"alert":"status"}>{error||"Carregando pacote…"}</p></>;
  const pkg=data.pkg,editable=pkg.reviewState==="confirmed" && !pkg.financialClosedAt,mounting=pkg.stage==="preparing" && !pkg.contentClosedAt;
  const inherited=data.valuation?.items.reduce((n,item)=>n+item.components.reduce((v,c)=>v+c.units.reduce((a,u)=>a+u.amountCents,0),0),0);
  const legacyFreight=!data.ownership.freight?data.legacyCharges.find(c=>c.chargeType==="brazil_freight"):undefined,legacyCustoms=!data.ownership.customs?data.legacyCharges.find(c=>c.chargeType==="customs"):undefined;
  const itemName=(id:string)=>warehouse?.rows.find(r=>r.costItemId===id)?.name??`Item ${data.reservations.findIndex(r=>r.costItemId===id)+1}`;
  const personName=(id:string)=>workspace.members.find(m=>m.id===id)?.name??"Membro";
  const freight=pkg.freightState==="no_charge"?0:pkg.freightState==="known"?pkg.freightCents:legacyFreight?.valueState==="no_charge"?0:legacyFreight?.amountCents??null;
  const fee=pkg.freightState==="no_charge"?0:pkg.freightState==="known"?pkg.freightFeeCents:legacyFreight?.valueState==="no_charge"?0:legacyFreight?.amountCents!==null && legacyFreight?.amountCents!==undefined?(data.legacyProjections.find(c=>c.chargeType==="brazil_freight")?.knownCents??0)-legacyFreight.amountCents:null;
  const customs=pkg.customsState==="no_charge"?0:pkg.customsState==="known"?pkg.customsCents:legacyCustoms?.valueState==="no_charge"?0:legacyCustoms?.amountCents??null;
  const finalKnown=inherited!==undefined && freight!==null && fee!==null && customs!==null;
  const sumUnits=(units:readonly {amountCents:number}[])=>units.reduce((sum,unit)=>sum+unit.amountCents,0);
  const logisticsStage=pkg.stage==="preparing"?"Em montagem":pkg.stage==="sent"?"Enviado":"Recebido";
  const capturedManifest=!!pkg.contentClosedAt && data.manifests.length>0;
  return <><Link className="cost-back" href="/packages">Voltar aos pacotes</Link><div className="page-heading"><div><h1>{pkg.name}</h1><p className="muted">{logisticsStage} · {data.unitCount} unidades</p></div></div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {pkg.reviewState==="pending_review" && <p>Conferência legada pendente. Confira primeiro a conta e chegada dos itens em <Link href="/orders">Pedidos</Link>.</p>}

    <section className="orders-package-section orders-logistics-section" aria-labelledby="orders-logistics-heading">
      <div className="orders-package-section-heading"><div><h2 id="orders-logistics-heading">Etapa logística</h2><p className="muted">{logisticsStage} · {data.unitCount} unidades no pacote</p></div>
        <div className="orders-context-actions">
          {pkg.reviewState==="pending_review" && <Button onClick={()=>setAction("review")}>Conferir legado</Button>}
          {editable && pkg.legacyPackageId && !pkg.contentClosedAt && pkg.stage!=="preparing" && <Button onClick={()=>setAction("confirm_legacy_content")}>Confirmar conteúdo legado fechado</Button>}
          {data.inPackage && pkg.stage==="preparing" && <Button onClick={()=>setAction("dispatch")}>Registrar despacho</Button>}
          {pkg.stage==="sent" && pkg.reviewState==="confirmed" && <Button onClick={()=>setAction("receive")}>Registrar recebimento</Button>}
          {data.inPackage && <Button variant="outline" onClick={()=>setAction("weight")}>Informar peso</Button>}
        </div>
      </div>
    </section>

    <section className="orders-package-section orders-package-financial" aria-labelledby="orders-costs-heading">
      <div className="orders-package-section-heading"><div><h2 id="orders-costs-heading">Custos do pacote</h2><p className="muted">Custos dos produtos preservam a origem no pedido. Peso não altera os valores.</p></div>
        {pkg.financialClosedAt?<Button variant="outline" onClick={()=>setAction("reopen_financial")}>Reabrir custos</Button>:editable&&<Button variant="outline" onClick={()=>setAction("close_financial")}>Encerrar custos</Button>}
      </div>
      <dl className="orders-package-cost-summary">
        <div><dt>Itens herdados</dt><dd>{inherited===undefined?"Bases a conferir":formatMoney(inherited)}</dd></div>
        <div><dt>Frete Brasil</dt><dd>{freight===null?"A conferir":formatMoney(freight)}</dd></div>
        <div><dt>Taxa do frete</dt><dd>{fee===null?"A conferir":formatMoney(fee)}</dd></div>
        <div><dt>Receita</dt><dd>{customs===null?"A conferir":formatMoney(customs)}</dd></div>
        <div className="orders-package-total"><dt>{finalKnown?"Total do pacote":"Total parcial conhecido"}</dt><dd>{formatMoney((inherited??0)+(freight??0)+(fee??0)+(customs??0))}</dd></div>
      </dl>
      <div className="orders-charge-controls">
        <article className="orders-charge-control"><div><h3>Frete Brasil</h3><p>{freight===null?"A conferir":formatMoney(freight)} · taxa {fee===null?"a conferir":formatMoney(fee)}</p>{pkg.weightGrams&&<p className="muted">Peso: {pkg.weightGrams} g</p>}</div><div className="orders-context-actions">
          {editable&&!pkg.freightPaidAt&&<><Button variant="outline" onClick={()=>setAction("record_freight")}>Informar frete</Button><Button variant="outline" onClick={()=>setAction("freight")}>Confirmar frete pago</Button></>}
          {editable&&(pkg.freightPaidAt||legacyFreight?.paymentStatus==="paid")&&<Button variant="outline" onClick={()=>setAction("correct_freight")}>Corrigir frete</Button>}
        </div></article>
        <article className="orders-charge-control"><div><h3>Receita</h3><p>{customs===null?"A conferir":formatMoney(customs)}</p></div><div className="orders-context-actions">
          {editable&&!pkg.customsPaidAt&&<><Button variant="outline" onClick={()=>setAction("record_customs")}>Informar Receita</Button><Button variant="outline" onClick={()=>setAction("customs")}>Confirmar Receita paga</Button></>}
          {editable&&(pkg.customsPaidAt||legacyCustoms?.paymentStatus==="paid")&&<Button variant="outline" onClick={()=>setAction("correct_customs")}>Corrigir Receita</Button>}
        </div></article>
      </div>
      {data.legacyCharges.length>0&&<details className="orders-legacy-charges"><summary>Encargos legados preservados</summary>{data.legacyCharges.map(c=><p key={c.id}>{c.chargeType==="brazil_freight"?"Frete":"Receita"}: {c.valueState==="pending"?"Pendente":c.valueState==="no_charge"?"Sem cobrança":formatMoney(c.amountCents??0)} · {c.paymentStatus==="paid"?"Pago":"Não confirmado"}</p>)}</details>}
    </section>

    <section className="orders-package-section orders-package-content" aria-labelledby="orders-content-heading">
      <div className="orders-package-section-heading"><div><h2 id="orders-content-heading">Conteúdo</h2><p className="muted">{data.unitCount} unidades · {pkg.contentClosedAt?"Conteúdo fechado":"Conteúdo em montagem"}</p></div>
        <div className="orders-context-actions">
          {editable&&mounting&&<><Button disabled={!data.reservations.length} onClick={()=>setAction("close_content")}>Fechar conteúdo</Button><Button variant="outline" disabled={!data.reservations.length} onClick={()=>setAction("release")}>Retirar unidades</Button><Link href="/orders">Acrescentar itens</Link></>}
          {editable&&pkg.contentClosedAt&&pkg.stage==="preparing"&&<Button variant="outline" onClick={()=>setAction("reopen_content")}>Reabrir conteúdo</Button>}
        </div>
      </div>
      <div className="orders-package-content-list">{[...new Set(data.reservations.map(r=>r.costItemId))].map(id=>{const row=warehouse?.rows.find(r=>r.costItemId===id),count=data.reservations.filter(r=>r.costItemId===id).length;return <article className="orders-package-content-item" key={id}><div><strong>{row?.name??"Item da origem financeira"}</strong><p>{count} unidades · {pkg.contentClosedAt?"Conteúdo fechado":"Reserva em montagem"}</p></div>{row&&<Link href={"/orders/"+encodeURIComponent(row.order.id)}>Pedido, custos e QC</Link>}</article>;})}</div>
    </section>

    {data.valuation&&<section className="orders-package-section orders-inherited-distribution" aria-labelledby="orders-inherited-heading">
      <h2 id="orders-inherited-heading">Valores herdados dos produtos</h2>
      <p className="muted">{capturedManifest?"Distribuição capturada no manifesto vigente. As versões anteriores permanecem no histórico.":"Prévia da montagem. A distribuição será capturada ao fechar o conteúdo."}</p>
      {data.valuation.items.map(item=>{const row=warehouse?.rows.find(r=>r.costItemId===item.costItemId),origin=warehouse?.origins.find(o=>o.trackingId===item.trackingId),productTotal=item.components.reduce((sum,component)=>sum+sumUnits(component.units),0);return <details className="orders-allocation-product" key={item.costItemId}>
        <summary><span><strong>{itemName(item.costItemId)}</strong><small>{row?.order.kind==="additional"?"Adicional":"Compra"} · {origin?.name??"Origem da compra"}{row?.source.variant?" · "+row.source.variant:""}</small></span><strong>Subtotal {formatMoney(productTotal)}</strong></summary>
        {item.components.map(component=><section className="orders-allocation-component" key={component.name}><div className="orders-allocation-component-heading"><h3>{component.name}</h3><strong>Subtotal {formatMoney(sumUnits(component.units))}</strong></div><AllocationTable caption={itemName(item.costItemId)+" · "+component.name} units={component.units} personName={personName}/></section>)}
      </details>;})}
    </section>}
    <section className="orders-package-section orders-charge-distribution" aria-label="Distribuição dos encargos do pacote">
      <h2>Encargos do pacote</h2>
      <p className="muted">{capturedManifest?"Rateio capturado no manifesto vigente; valores herdados dos produtos estão apresentados separadamente.":"Prévia da montagem; estes encargos serão capturados ao fechar o conteúdo."}</p>
      {data.valuation?.charges.map(charge=><details className="orders-package-charge" key={charge.name}><summary><span>{charge.name}</span><strong>{formatMoney(charge.amountCents)}</strong></summary>{[...new Set(charge.units.map(u=>u.costItemId))].map(id=>{const units=charge.units.filter(u=>u.costItemId===id);return <article className="orders-charge-allocation-item" key={id}><h3>{itemName(id)} <span>Subtotal {formatMoney(sumUnits(units))}</span></h3><AllocationTable caption={charge.name+" · "+itemName(id)} units={units} personName={personName}/></article>;})}</details>)}
      {data.legacyProjections.filter(c=>c.active).map(charge=><details className="orders-package-charge" key={charge.legacyChargeId}><summary><span>{charge.chargeType==="brazil_freight"?"Encargo legado · frete e taxa":"Encargo legado · Receita"}</span><strong>{formatMoney(charge.knownCents)}{charge.finalCents===null?" parcial":""}</strong></summary><p className="muted">Parcelas preservadas da cobrança legada. Não são cobradas novamente nem possuem rateio físico por unidade.</p>{charge.items.map(item=><article className="orders-legacy-allocation-item" key={item.costItemId}><h3>{itemName(item.costItemId)}</h3>{item.components.map(component=><div className="orders-legacy-allocation-component" key={component.name}><h4>{component.name}</h4><p>Componente: {component.amountCents===null?"Pendente":formatMoney(component.amountCents)}</p>{component.people.map(person=><p key={person.personId}>Pessoa: {personName(person.personId)} · {person.amountCents===null?"Pendente":formatMoney(person.amountCents)}</p>)}</div>)}</article>)}</details>)}
      {data.valuation?.charges.length===0&&data.legacyProjections.every(c=>!c.active)&&<p>Nenhum encargo alocado neste pacote.</p>}
      {!data.valuation&&<p>{data.valuationError??"Bases e parcelas a conferir antes da prévia."}</p>}
      {freight===null&&<p>Frete Brasil: pendente</p>}{fee===null&&<p>Taxa do frete: pendente</p>}{customs===null&&<p>Receita: pendente</p>}
    </section>
    <details className="orders-package-history"><summary>Histórico ({data.events.length}) e manifestos ({data.manifests.length})</summary>{data.events.map(e=><p key={e.id}>{e.action}: {e.reason}</p>)}</details>
    <Surface open={!!action} onOpenChange={open=>{if(!open)setAction(null);}} title={action?titles[action]:"Pacote"} sheet><form className="orders-form" onSubmit={e=>{e.preventDefault();void submit(new FormData(e.currentTarget));}}>
      {action==="review" && <><p>A confirmação registra a conferência de agora. Não cria chegada, pagamento ou despacho histórico.</p><label>Conta<select name="account" required defaultValue={pkg.accountId??""}><option value="" disabled>Selecione</option>{warehouse?.accounts.filter(a=>a.status==="active").map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></label>{!pkg.contentClosedAt && <label><span><input type="checkbox" name="closedContent"/> Confirmei por evidência que o conteúdo legado está fechado agora.</span></label>}</>}
      {action==="confirm_legacy_content" && <p>Registra a confirmação atual do conteúdo fechado. A data histórica de fechamento continua desconhecida; pagamentos e despacho não são alterados.</p>}
      {(action==="freight" || action==="customs") && <><label>Valor em reais<input name="amount" required inputMode="decimal" placeholder="0,00"/></label><label>Forma de pagamento<select name="method"><option value="pix">Pix</option><option value="card">Cartão</option></select></label>{action==="freight" && <label>Taxa capturada (%)<input name="fee" type="number" min="0" max="100" step="0.01" defaultValue="0" required/></label>}<p>Confirme apenas um pagamento efetivamente realizado. Zero registra isenção explícita.</p></>}
      {(action==="record_freight" || action==="record_customs") && <><p>Informar o valor não confirma pagamento.</p><label>Situação<select name="state"><option value="known">Valor conhecido</option><option value="pending">Ainda não informado</option><option value="no_charge">Sem cobrança, conferido</option></select></label><label>Valor conhecido em reais<input name="amount" inputMode="decimal" placeholder="0,00"/></label>{action==="record_freight" && <label>Taxa informada (%)<input name="fee" type="number" min="0" max="100" step="0.01" defaultValue="0"/></label>}</>}
      {(action==="correct_freight" || action==="correct_customs") && <><p>O pagamento e o rateio anteriores permanecem no histórico. A cobrança corrigida volta a exigir confirmação; conteúdo e despacho permanecem preservados.</p><label>Situação<select name="state"><option value="known">Valor conhecido</option><option value="no_charge">Sem cobrança, conferido</option></select></label><label>Valor corrigido em reais<input name="amount" inputMode="decimal" placeholder="0,00"/></label>{action==="correct_freight" && <label>Taxa corrigida (%)<input name="fee" type="number" min="0" max="100" step="0.01" defaultValue="0"/></label>}<label><span><input type="checkbox" name="resetPayment" required/> Confirmo a correção e a nova conferência de pagamento.</span></label></>}
      {action==="weight" && <label>Peso em gramas<input name="weight" type="number" required min="1" max="1000000000" defaultValue={pkg.weightGrams??""}/></label>}
      {action==="release" && <fieldset><legend>Unidades que voltarão ao armazém</legend>{data.reservations.map(r=><label key={r.id}><span><input type="checkbox" name="reservation" value={r.id}/> {warehouse?.rows.find(row=>row.costItemId===r.costItemId)?.name??"Item"} · unidade {r.unitIndex+1}</span></label>)}</fieldset>}
      {action==="close_content" && <p>O manifesto congela as unidades e suas parcelas financeiras. O frete não registra despacho.</p>}
      {action==="reopen_content" && <p>O manifesto anterior permanece no histórico. A reabertura não estorna pagamentos.</p>}
      <label>Evidência e motivo<textarea name="reason" required minLength={3} maxLength={1000}/></label><Button type="submit" disabled={busy}>Confirmar</Button>
    </form></Surface>
  </>;
}
