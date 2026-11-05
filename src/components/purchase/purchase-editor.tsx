"use client";
import { useEffect, useState } from "react";
import { Surface } from "../ui/surface";
import { Button } from "../ui/button";
import { useWorkspace } from "../workspace-provider";
import type { ClientData } from "@/lib/domain/services";
export function suggestedPurchaseName() { const month = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" }).format(new Date()); const year = new Intl.DateTimeFormat("pt-BR", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()); return `Compra ${month[0].toUpperCase()}${month.slice(1)}/${year}`; }
export function PurchaseEditor({ purchase, onClose }: { purchase?: ClientData["purchases"][number]; onClose: () => void }) {
  const { data, busy, mutate, registerWorkspaceDraft } = useWorkspace();
  const initialName = purchase?.name ?? suggestedPurchaseName(), initialAccount = purchase?.hubbuyAccount ?? "";
  const [name, setName] = useState(initialName), [account, setAccount] = useState(initialAccount);
  useEffect(() => registerWorkspaceDraft("purchase-editor", name !== initialName || account !== initialAccount), [account, initialAccount, initialName, name, registerWorkspaceDraft]);
  async function save(e: React.FormEvent) { e.preventDefault(); if (await mutate("purchase.save", { name, hubbuyAccount: account || null }, purchase?.id, purchase ? "Alterações salvas" : "Compra criada")) onClose(); }
  return <Surface title={purchase ? "Editar compra" : "Criar compra"} description={data.workspaceKind === "personal" ? "Uma compra privada neste espaço pessoal." : "Uma nova rodada para comprar juntos."} open mobileFullScreen onOpenChange={v => { if (!v && !busy) onClose(); }}><form onSubmit={save}><label>Nome da compra<input autoFocus required maxLength={200} value={name} onChange={e => setName(e.target.value)}/></label><label>Conta HubBuy<input value={account} onChange={e => setAccount(e.target.value)} maxLength={300} placeholder="Email ou nome da conta (opcional)"/></label><div className="form-actions"><Button variant="outline" type="button" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? "Salvando…" : purchase ? "Salvar alterações" : "Criar compra"}</Button></div></form></Surface>;
}
