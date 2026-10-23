"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Fragment } from "react";
import { Bookmark, ShoppingCart, History, Folder, Plus, ChevronDown, Package, WalletCards, Settings, PanelLeftClose, PanelLeftOpen, Sun, Moon } from "lucide-react";
import { Avatar } from "../shared";
import { useWorkspace } from "../workspace-provider";
import { useTheme } from "../theme-provider";
import "./sidebar.css";
const collapseKey = "loti.sidebar.collapsed";
const collapseEvent = "loti:sidebar";
let collapsedFallback = false;
function subscribeCollapse(callback: () => void) { window.addEventListener(collapseEvent, callback); window.addEventListener("storage", callback); return () => { window.removeEventListener(collapseEvent, callback); window.removeEventListener("storage", callback); }; }
function getCollapsed() { try { return localStorage.getItem(collapseKey) === "true"; } catch { return collapsedFallback; } }
const nav = [{ href: "/favorites", label: "Favoritos", short: "Favoritos", icon: Bookmark }, { href: "/purchase", label: "Compra atual", short: "Compra", icon: ShoppingCart }, { href: "/packages", label: "Pacotes e custos", short: "Pacotes", icon: Package }, { href: "/history", label: "Histórico", short: "Histórico", icon: History }];
const hubbuyAccountsNav = { href: "/packages/accounts", label: "Contas HubBuy", short: "Contas", icon: WalletCards };
const mobileNav = [...nav.slice(0, 3), hubbuyAccountsNav, nav[3]];
export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribeCollapse, getCollapsed, () => false);
  const { resolvedTheme, setPreference } = useTheme();
  function toggleCollapsed() { collapsedFallback = !collapsed; try { localStorage.setItem(collapseKey, String(!collapsed)); } catch {} window.dispatchEvent(new Event(collapseEvent)); }
  const path = usePathname(), params = useSearchParams(), { data } = useWorkspace();
  const mobileNavRef = useRef<HTMLElement>(null), mobileNavItems = useRef(new Map<string, HTMLAnchorElement>());
  const [mobileNavSelection, setMobileNavSelection] = useState<{ left: number; width: number } | null>(null);
  const activeNav = path === hubbuyAccountsNav.href ? hubbuyAccountsNav : nav.find(item => path.startsWith(item.href));
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
  return <><a className="skip-link" href="#main">Pular para conteúdo</a><aside className={`sidebar${collapsed ? " is-collapsed" : ""}`} aria-label="Barra lateral"><div className="sidebar-heading"><Link className="brand" href="/favorites"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></Link><button className="sidebar-collapse" type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}>{collapsed ? <PanelLeftOpen size={17}/> : <PanelLeftClose size={17}/>}</button></div><nav aria-label="Principal">{nav.map(n => <Fragment key={n.href}><Link className={`nav-item ${path.startsWith(n.href) && !(n.href === "/packages" && path === "/packages/accounts") ? "selected" : ""}`} href={n.href} aria-label={n.label} title={collapsed ? n.label : undefined} aria-current={path.startsWith(n.href) && !(n.href === "/packages" && path === "/packages/accounts") ? "page" : undefined}><n.icon size={19} aria-hidden="true"/><span className="sidebar-label">{n.label}</span></Link>{n.href === "/packages" && <Link className={`nav-item nav-item-accounts ${path === "/packages/accounts" ? "selected" : ""}`} href="/packages/accounts" aria-label="Contas HubBuy" title={collapsed ? "Contas HubBuy" : undefined} aria-current={path === "/packages/accounts" ? "page" : undefined}><WalletCards size={19} aria-hidden="true"/><span className="sidebar-label">Contas HubBuy</span></Link>}</Fragment>)}</nav>
    {!collapsed && path === "/favorites" && <nav className="sidebar-collections" aria-label="Coleções"><span className="section-label">Minhas coleções</span>{collectionLinks(data.currentUser.id)}{!mine.length && <p className="collection-empty muted">Organize seus favoritos em coleções.</p>}<Link className="collection-link collection-create" href="/favorites?newCollection=1"><Plus size={17}/>Nova coleção</Link>{otherOwners.length > 0 && <details className="group-collections" open={!!selectedCollection && !mine.some(c => c.id === selectedCollection)}><summary>Coleções do grupo<ChevronDown size={15}/></summary>{otherOwners.map(m => <div className="collection-owner-group" key={m.id}><div className="collection-owner-heading"><Avatar name={m.name}/><span>De {m.name}</span></div>{collectionLinks(m.id)}</div>)}</details>}</nav>}
    <div className="sidebar-bottom">
    <button className="sidebar-theme" type="button" role="switch" aria-label="Tema escuro" aria-checked={resolvedTheme === "dark"} title={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}><Sun className="theme-sun" size={22} aria-hidden="true"/><Moon className="theme-moon" size={21} aria-hidden="true"/><span className="theme-track" aria-hidden="true"><span className="theme-thumb"/></span></button></div>
    <Link className={`sidebar-profile${path === "/profile" ? " selected" : ""}`} href="/profile" aria-label="Perfil e configurações" title={collapsed ? "Perfil e configurações" : data.currentUser.email} aria-current={path === "/profile" ? "page" : undefined}><span className="sidebar-account-avatar"><Avatar name={data.currentUser.name}/><Settings className="sidebar-account-badge" size={13} aria-hidden="true"/></span><span className="sidebar-label"><strong>{data.currentUser.name}</strong><small>Conta e configurações</small></span><Settings className="sidebar-account-settings" size={18} aria-hidden="true"/></Link>
  </aside><div className="app-content"><header className="mobile-header"><Link className="brand" href="/favorites"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></Link><div className="mobile-header-actions"><button className="sidebar-theme mobile-header-theme" type="button" role="switch" aria-label="Tema escuro" aria-checked={resolvedTheme === "dark"} title={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}><Sun className="theme-sun" size={22} aria-hidden="true"/><Moon className="theme-moon" size={21} aria-hidden="true"/><span className="theme-track" aria-hidden="true"><span className="theme-thumb"/></span></button><Link href="/profile" className="profile-link" aria-label="Perfil"><Avatar name={data.currentUser.name}/></Link></div></header><main id="main" className="page-content">{children}</main></div>
  <nav className="mobile-island" aria-label="Navegação móvel" ref={mobileNavRef} style={{ "--selection-left": `${mobileNavSelection?.left ?? 0}px`, "--selection-width": `${mobileNavSelection?.width ?? 0}px` } as React.CSSProperties}><span className={`mobile-island-selection${mobileNavSelection ? " ready" : ""}`} aria-hidden="true"/>{mobileNav.map(n => { const selected = activeNav?.href === n.href; return <Link key={n.href} ref={element => { if (element) mobileNavItems.current.set(n.href, element); else mobileNavItems.current.delete(n.href); }} href={n.href} className={selected ? "selected" : ""} aria-label={n.label} aria-current={selected ? "page" : undefined}><n.icon size={21} aria-hidden="true"/>{selected && <span>{n.short}</span>}</Link>; })}</nav></>;
}
