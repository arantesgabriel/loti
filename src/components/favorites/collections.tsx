"use client";
import { useState } from "react";
import type { ClientData } from "@/lib/domain/services";
import { Surface, Confirm } from "../ui/surface";
import { Button } from "../ui/button";
import { useWorkspace } from "../workspace-provider";
export function CollectionEditor({ collection, onClose }: { collection?: ClientData["collections"][number]; onClose: () => void }) {
  const { busy, mutate } = useWorkspace(); const [name, setName] = useState(collection?.name ?? ""), [remove, setRemove] = useState(false);
  async function save(e: React.FormEvent) { e.preventDefault(); if (await mutate("collection.save", { name }, collection?.id, collection ? "Coleção renomeada" : "Coleção criada")) onClose(); }
  return <><Surface title={collection ? "Editar coleção" : "Nova coleção"} description="Uma pasta sua, visível para o grupo." open onOpenChange={v => { if (!v && !busy) onClose(); }}><form onSubmit={save}><label>Nome da coleção<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Presentes" /></label><div className="form-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={busy || !name.trim()}>{busy ? "Salvando…" : "Salvar coleção"}</Button></div>{collection && <Button type="button" variant="ghost" className="danger-text" onClick={() => setRemove(true)}>Excluir coleção</Button>}</form></Surface>
  <Confirm open={remove} onOpenChange={setRemove} title="Excluir coleção?" description="Os favoritos continuam salvos e ficam sem coleção." label="Excluir coleção" danger busy={busy} onConfirm={async () => { if (await mutate("collection.delete", undefined, collection?.id, "Coleção excluída")) onClose(); }}/></>;
}
