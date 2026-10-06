"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { Bookmark, ShoppingCart, History, Folder, Plus, ChevronDown } from "lucide-react";
import { Avatar } from "../shared";
import { useWorkspace } from "../workspace-provider";
const nav = [{ href: "/favorites", label: "Favoritos", short: "Favoritos", icon: Bookmark }, { href: "/purchase", label: "Compra atual", short: "Compra", icon: ShoppingCart }, { href: "/history", label: "Histórico", short: "Histórico", icon: History }];
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(), params = useSearchParams(), { data } = useWorkspace();
  const mobileNavRef = useRef<HTMLElement>(null), mobileNavItems = useRef(new Map<string, HTMLAnchorElement>());
  const [mobileNavSelection, setMobileNavSelection] = useState<{ left: number; width: number } | null>(null);
  const activeNav = nav.find(item => path.startsWith(item.href));
  const activeNavHref = activeNav?.href ?? "";
  const selectedCollection = params.get("collection");
  const mine = data.collections.filter(c => c.ownerId === data.currentUser.id);
  const otherOwners = data.members.filter(m => m.id !== data.currentUser.id && data.collections.some(c => c.ownerId === m.id));
  useLayoutEffect(() => {
    const updateSelection = () => {
      const selected = activeNavHref ? mobileNavItems.current.get(activeNavHref) : undefined;
      const container = mobileNavRef.current;
      if (!selected || !container) {
        setMobileNavSelection(null);
        return;
      }
      const itemRect = selected.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setMobileNavSelection({ left: itemRect.left - containerRect.left - container.clientLeft + container.scrollLeft, width: itemRect.width });
    };
    updateSelection();
    window.addEventListener("resize", updateSelection);
    return () => window.removeEventListener("resize", updateSelection);
  }, [activeNavHref]);
  function collectionLinks(ownerId: string) {
    return data.collections.filter(c => c.ownerId === ownerId).map(c => <Link key={c.id} className={`collection-link ${selectedCollection === c.id ? "selected" : ""}`} href={`/favorites?collection=${c.id}`} aria-current={selectedCollection === c.id ? "page" : undefined}><Folder size={17}/><span>{c.name}</span><small>{data.favorites.filter(f => f.collectionId === c.id).length}</small></Link>);
  }
  return <><a className="skip-link" href="#main">Pular para conteúdo</a><aside className="sidebar"><Link className="brand" href="/favorites"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></Link><nav aria-label="Principal">{nav.map(n => <Link key={n.href} className={`nav-item ${path.startsWith(n.href) ? "selected" : ""}`} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined}><n.icon size={21}/>{n.label}</Link>)}</nav>
    {path === "/favorites" && <nav className="sidebar-collections" aria-label="Coleções"><span className="section-label">Minhas coleções</span>{collectionLinks(data.currentUser.id)}{!mine.length && <p className="collection-empty muted">Organize seus favoritos em coleções.</p>}<Link className="collection-link collection-create" href="/favorites?newCollection=1"><Plus size={17}/>Nova coleção</Link>{otherOwners.length > 0 && <details className="group-collections" open={!!selectedCollection && !mine.some(c => c.id === selectedCollection)}><summary>Coleções do grupo<ChevronDown size={15}/></summary>{otherOwners.map(m => <div className="collection-owner-group" key={m.id}><div className="collection-owner-heading"><Avatar name={m.name}/><span>De {m.name}</span></div>{collectionLinks(m.id)}</div>)}</details>}</nav>}
    <Link className="sidebar-profile" href="/profile" aria-label="Perfil"><Avatar name={data.currentUser.name}/><span><strong>{data.currentUser.name}</strong><small>{data.currentUser.email}</small></span></Link>
  </aside><div className="app-content"><header className="mobile-header"><Link className="brand" href="/favorites"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></Link><Link href="/profile" className="profile-link" aria-label="Perfil"><Avatar name={data.currentUser.name}/></Link></header><main id="main" className="page-content">{children}</main></div>
  <nav className="mobile-island" aria-label="Navegação móvel" ref={mobileNavRef} style={{ "--selection-left": `${mobileNavSelection?.left ?? 0}px`, "--selection-width": `${mobileNavSelection?.width ?? 0}px` } as React.CSSProperties}><span className={`mobile-island-selection${mobileNavSelection ? " ready" : ""}`} aria-hidden="true"/>{nav.map(n => { const selected = activeNav?.href === n.href; return <Link key={n.href} ref={element => { if (element) mobileNavItems.current.set(n.href, element); else mobileNavItems.current.delete(n.href); }} href={n.href} className={selected ? "selected" : ""} aria-label={n.label} aria-current={selected ? "page" : undefined}><n.icon size={21} aria-hidden="true"/>{selected && <span>{n.short}</span>}</Link>; })}</nav></>;
}
