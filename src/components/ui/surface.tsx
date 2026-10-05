"use client";
import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "./button";
export function Surface({ title, description, children, open, onOpenChange, sheet = false }: { title: string; description?: string; children: React.ReactNode; open: boolean; onOpenChange: (open: boolean) => void; sheet?: boolean }) {
  const [initialFocus] = useState<HTMLElement | null>(() => typeof document === "undefined" ? null : document.activeElement as HTMLElement);
  const returnFocus = useRef<HTMLElement | null>(initialFocus);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="modal-overlay" /><Dialog.Content className={sheet ? "sheet" : "dialog"} onOpenAutoFocus={e => { const active = document.activeElement as HTMLElement; if (!(e.target as HTMLElement).contains(active)) returnFocus.current = active; }} onCloseAutoFocus={e => { e.preventDefault(); if (returnFocus.current?.isConnected) returnFocus.current.focus(); }}>
    <div className="surface-head"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description className={description ? "muted" : "sr-only"}>{description ?? title}</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Fechar"><X size={20}/></Button></Dialog.Close></div><div className="surface-body">{children}</div>
  </Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Confirm({ title, description, children, onConfirm, open, onOpenChange, busy = false, danger = false, label = "Confirmar" }: { title: string; description: string; children?: React.ReactNode; onConfirm: () => void; open: boolean; onOpenChange: (v: boolean) => void; busy?: boolean; danger?: boolean; label?: string }) {
  return <Surface title={title} description={description} open={open} onOpenChange={onOpenChange}>{children}<div className="form-actions"><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button><Button variant={danger ? "destructive" : "default"} disabled={busy} onClick={onConfirm}>{busy ? "Aguarde…" : label}</Button></div></Surface>;
}
