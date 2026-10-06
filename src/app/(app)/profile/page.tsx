"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Users, LogOut } from "lucide-react";
import { useWorkspace } from "@/components/workspace-provider";
import { Avatar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { useState } from "react";
import { toast } from "sonner";
export default function Profile() {
  const router = useRouter();
  const { data } = useWorkspace(); const [busy, setBusy] = useState(false);
  async function logout() { setBusy(true); try { const r = await authClient.signOut(); if (r.error) { toast.error("Não foi possível sair."); return; } router.replace("/login"); router.refresh(); } catch { toast.error("Não foi possível conectar."); } finally { setBusy(false); } }
  return <><div className="page-heading"><div><h1>Seu perfil</h1><p className="muted">Sua conta no espaço compartilhado.</p></div></div><section className="profile-card"><Avatar name={data.currentUser.name}/><h2>{data.currentUser.name}</h2><p className="muted">{data.currentUser.email}</p><div className="group-actions profile-actions"><Button asChild variant="outline"><Link href="/group"><Users size={18}/>Meu grupo</Link></Button><Button onClick={logout} variant="outline" disabled={busy}><LogOut size={18}/>Sair da conta</Button></div></section></>;
}
