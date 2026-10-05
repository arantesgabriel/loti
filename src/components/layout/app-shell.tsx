"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, ShoppingCart, History, Package, Folder, Plus } from "lucide-react";
import { Avatar } from "../shared";
import { useWorkspace } from "../workspace-provider";
const nav = [{ href: "/favorites", label: "Favoritos", short: "Favoritos", icon: Bookmark }, { href: "/purchase", label: "Compra atual", short: "Compra", icon: ShoppingCart }, { href: "/history", label: "Histórico", short: "Histórico", icon: History }];
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(), { data } = useWorkspace();
  return <><a className="skip-link" href="#main">Pular para conteúdo</a><aside className="sidebar"><Link className="brand" href="/favorites"><Package size={29} strokeWidth={1.7}/><span>Loti</span></Link><nav aria-label="Principal">{nav.map(n => <Link key={n.href} className={`nav-item ${path.startsWith(n.href) ? "selected" : ""}`} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}><n.icon size={21}/>{n.label}</Link>)}</nav>
    {path === "/favorites" && <div className="sidebar-collections"><span className="section-label">Coleções</span><Link className="collection-link" href="/favorites"><Bookmark size={18}/><span>Todos os favoritos</span><small>{data.favorites.length}</small></Link>{data.collections.map(c => <Link key={c.id} className="collection-link" href={`/favorites?collection=${c.id}`}><Folder size={18}/><span>{c.name}<small className="collection-owner">{data.members.find(m => m.id === c.ownerId)?.name}</small></span><small>{data.favorites.filter(f => f.collectionId === c.id).length}</small></Link>)}<Link className="collection-link" href="/favorites?newCollection=1"><Plus size={18}/>Nova coleção</Link></div>}
    <Link className="sidebar-profile" href="/profile"><Avatar name={data.currentUser.name}/><span><strong>{data.currentUser.name}</strong><small>{data.currentUser.email}</small></span></Link>
  </aside><div className="app-content"><header className="topbar"><Link className="brand mobile-brand" href="/favorites"><Package size={27}/><span>Loti</span></Link><Link href="/profile" className="profile-link" aria-label="Perfil"><Avatar name={data.currentUser.name}/></Link></header><main id="main" className="page-content">{children}</main></div>
  <nav className="mobile-island" aria-label="Navegação móvel">{nav.map(n => <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? "selected" : ""} aria-current={path.startsWith(n.href) ? "page" : undefined}><n.icon size={23}/><span>{n.short}</span></Link>)}</nav></>;
}
