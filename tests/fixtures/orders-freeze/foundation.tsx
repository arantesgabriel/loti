import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ImagePlus } from "lucide-react";
import { OrdersWorkspace, OrdersBadge, OrdersFeedback, OrdersIconButton, OrdersBottomSheet, type OrdersPanelState } from "../../../src/components/orders/orders-workspace";
import { Button } from "../../../src/components/ui/button";
import { ProductCategoryMarker } from "../../../src/components/product-category-icons";

// Browser-only synthetic composition. Not imported by any app route or service.
function FoundationPreview() {
  const [panel, setPanel] = useState<OrdersPanelState>({ kind: "closed" });
  const [nested, setNested] = useState(false);
  const [tab, setTab] = useState("Todos");
  const [search, setSearch] = useState("");
  const [long, setLong] = useState(false);
  const products = ["Anker USB-C Cable", "UGREEN Nexode 65W", "Baseus Blade Power Bank", "JBL Flip 6", "Fender 351 Premium Picks", "D’Addario EXL110"];
  const close = () => setPanel({ kind: "closed" });
  const body = <>
    <OrdersBadge tone={panel.kind === "item-detail" ? "success" : "neutral"}>{panel.kind === "item-detail" ? "No armazém" : "Prévia da infraestrutura"}</OrdersBadge>
    <OrdersFeedback title={panel.kind === "item-detail" ? "JBL Flip 6" : "Nenhum produto selecionado"}>Conteúdo sintético. A conexão com os dados pertence às próximas fases.</OrdersFeedback>
    <label>Observação de teste<input aria-label="Observação de teste" placeholder="Teste o foco e o teclado" /></label>
    <Button variant="outline" onClick={() => setNested(true)}>Abrir confirmação de teste</Button>
    <Button variant="ghost" onClick={() => setLong(value => !value)}>Alternar conteúdo longo</Button>
    {long && Array.from({ length: 24 }, (_, index) => <p key={index}>Linha de teste {index + 1}. A sheet mantém sua própria rolagem.</p>)}
  </>;
  const panelProps = panel.kind === "closed" ? {} : {
    panel: { state: panel, title: panel.kind === "prepare" ? "Preparar pacote" : "Detalhes do item", description: "Composição sintética para validar a Fase 1", children: body, footer: <Button variant="outline" onClick={close}>Voltar à lista</Button> },
    onPanelClose: close,
  };
  return <>
    <div className="qa-banner">Prévia sintética da Fase 1. Sem dados ou operações de produto.</div>
    <main className="qa-content">
      <OrdersWorkspace {...panelProps}
        tools={<OrdersIconButton label="Abrir teste de importação QC" onClick={() => setNested(true)}><ImagePlus size={20} aria-hidden="true" /></OrdersIconButton>}
        toolbar={<div className="qa-toolbar"><label><span className="sr-only">Buscar produto</span><input placeholder="Buscar produto ou pedido" value={search} onChange={event => setSearch(event.target.value)} /></label><Button onClick={() => setPanel({ kind: "prepare" })}>Preparar pacote</Button><Button variant="outline" onClick={() => setPanel({ kind: "item-detail", itemId: "fixture-jbl" })}>Abrir detalhe sintético</Button></div>}
        tabs={["Todos", "No armazém", "Disponíveis"].map(label => <button key={label} aria-current={tab === label ? "true" : undefined} onClick={() => setTab(label)}>{label}</button>)}
        footer={<span>Dados sintéticos · filtro de teste: {tab}</span>}>
        <table className="qa-table"><caption className="sr-only">Pedidos sintéticos para validar o espaço da lista</caption><thead><tr><th>Produto</th><th>Etapa</th><th>Unidades</th></tr></thead><tbody>{products.filter(name => name.toLowerCase().includes(search.toLowerCase())).map((name, index) => <tr key={name}><th scope="row"><ProductCategoryMarker visualKey="generic" />{name}<small>Item sintético · Sem integração</small></th><td><OrdersBadge tone={index === 0 ? "info" : "success"}>{index === 0 ? "A caminho" : "Recebido"}</OrdersBadge></td><td>{index % 3} disponíveis</td></tr>)}</tbody></table>
        {!products.some(name => name.toLowerCase().includes(search.toLowerCase())) && <OrdersFeedback title="Nenhum resultado">Altere a busca de teste.</OrdersFeedback>}
      </OrdersWorkspace>
    </main>
    <OrdersBottomSheet open={nested} onOpenChange={setNested} title="Confirmação de teste" description="Esta é uma sobreposição sintética, sem escrita de dados."><Button onClick={() => setNested(false)}>Concluir teste</Button></OrdersBottomSheet>
  </>;
}

createRoot(document.getElementById("root")!).render(<FoundationPreview />);
