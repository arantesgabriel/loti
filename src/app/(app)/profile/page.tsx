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
import { ProfileNameForm } from "@/components/profile/profile-name-form";
import { ProfilePasswordForm } from "@/components/profile/profile-password-form";
export default function Profile() {
  const router = useRouter();
  const { data } = useWorkspace(); const [pending, setPending] = useState(false), [logoutBusy, setLogoutBusy] = useState(false);
  async function logout() { setLogoutBusy(true); try { const r = await authClient.signOut(); if (r.error) { toast.error("Não foi possível sair."); return; } router.replace("/login"); router.refresh(); } catch { toast.error("Não foi possível conectar."); } finally { setLogoutBusy(false); } }
  return <><div className="page-heading"><div><h1>Seu perfil</h1><p className="muted">Sua conta no espaço compartilhado.</p></div></div><div className="profile-layout">
    <section className="profile-card"><Avatar name={data.currentUser.name}/><h2>{data.currentUser.name}</h2><p className="muted">{data.currentUser.email}</p><div className="group-actions profile-actions"><Button asChild variant="outline"><Link href="/group"><Users size={18}/>Meu grupo</Link></Button><Button onClick={logout} variant="outline" disabled={pending || logoutBusy}><LogOut size={18}/>{logoutBusy ? "Saindo…" : "Sair da conta"}</Button></div></section>
    <div className="profile-settings"><ProfileNameForm pending={pending || logoutBusy} onPendingChange={setPending}/><ProfilePasswordForm pending={pending || logoutBusy} onPendingChange={setPending}/></div>
  </div></>;
}
