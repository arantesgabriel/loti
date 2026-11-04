"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Fragment } from "react";
import { Bookmark, ShoppingCart, History, Folder, Plus, ChevronDown, Package, WalletCards, Settings, PanelLeftClose, PanelLeftOpen, Sun, Moon, ReceiptText, Ellipsis } from "lucide-react";
import { Avatar } from "../shared";
import { useWorkspace } from "../workspace-provider";
import { useTheme } from "../theme-provider";
import { Confirm } from "../ui/surface";
import "./sidebar.css";

const collapseKey = "loti.sidebar.collapsed";
const collapseEvent = "loti:sidebar";
let collapsedFallback = false;
function subscribeCollapse(callback: () => void) { window.addEventListener(collapseEvent, callback); window.addEventListener("storage", callback); return () => { window.removeEventListener(collapseEvent, callback); window.removeEventListener("storage", callback); }; }
function getCollapsed() { try { return localStorage.getItem(collapseKey) === "true"; } catch { return collapsedFallback; } }
const nav = [{ href: "/favorites", label: "Favoritos", short: "Favoritos", icon: Bookmark }, { href: "/purchase", label: "Compra atual", short: "Compra", icon: ShoppingCart }, { href: "/orders", label: "Pedidos", short: "Pedidos", icon: ReceiptText }, { href: "/packages", label: "Pacotes", short: "Pacotes", icon: Package }, { href: "/history", label: "Histórico", short: "Histórico", icon: History }];
const hubbuyAccountsNav = { href: "/packages/accounts", label: "Contas HubBuy", short: "Contas", icon: WalletCards };
const moreNav = { href: "/more", label: "Mais", short: "Mais", icon: Ellipsis };

function workspaceLabel(data: ReturnType<typeof useWorkspace>["data"], workspaceId: string) {
  const workspace = data.workspaces.find(item => item.id === workspaceId);
  return workspace?.kind === "personal" ? "Espaço pessoal" : workspace?.name ?? "Espaço";
}

function WorkspaceContextControl({ data, busy, switching, onChange, compact = false }: {
  data: ReturnType<typeof useWorkspace>["data"];
  busy: boolean;
  switching: boolean;
  onChange: (workspaceId: string) => void;
  compact?: boolean;
}) {
  const current = workspaceLabel(data, data.workspaceId);
  if (data.workspaces.length <= 1) return <div className={"workspace-context workspace-context-static" + (compact ? " compact" : "")} aria-label={"Espaço atual: " + current}>
    <span className="workspace-context-label">Espaço atual</span>
    <strong title={current}>{current}</strong>
  </div>;
  return <label className={"workspace-context" + (compact ? " compact" : "")}>
    <span className="workspace-context-label">Espaço atual</span>
    <span className="workspace-context-select">
      <select aria-label="Espaço atual" value={data.workspaceId} disabled={busy} aria-busy={switching} onChange={event => onChange(event.target.value)}>
        {data.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.kind === "personal" ? "Espaço pessoal" : workspace.name}</option>)}
      </select>
      <ChevronDown size={15} aria-hidden="true" />
    </span>
    {switching && <span className="workspace-context-status" role="status">Carregando espaço…</span>}
  </label>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribeCollapse, getCollapsed, () => false);
  const { resolvedTheme, setPreference } = useTheme();
  const router = useRouter();
  const path = usePathname(), params = useSearchParams();
  const { data, busy, switching, switchWorkspace } = useWorkspace();
  const personal = data.workspaceKind === "personal";
  const personalNav = [nav[0], nav[1], nav[4]];
  const desktopNav = personal ? personalNav : nav;
  const mobileNav = personal ? personalNav : [...nav.slice(0, 4), moreNav];
  const mobileNavRef = useRef<HTMLElement>(null), mobileNavItems = useRef(new Map<string, HTMLAnchorElement>());
  const [mobileNavSelection, setMobileNavSelection] = useState<{ left: number; width: number } | null>(null);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const previousWorkspaceId = useRef(data.workspaceId);
  const selectedCollection = params.get("collection");
  const activeNav = path === hubbuyAccountsNav.href ? hubbuyAccountsNav : nav.find(item => path.startsWith(item.href));
  const activeNavHref = personal ? activeNav?.href ?? "" : path === "/more" || path === "/history" || path === hubbuyAccountsNav.href ? moreNav.href : activeNav?.href ?? "";
  const mine = data.collections.filter(collection => collection.ownerId === data.currentUser.id);
  const otherOwners = data.members.filter(member => member.id !== data.currentUser.id && data.collections.some(collection => collection.ownerId === member.id));

  useEffect(() => {
    const changed = previousWorkspaceId.current !== data.workspaceId;
    previousWorkspaceId.current = data.workspaceId;
    if (changed && path.startsWith("/history/")) {
      router.replace("/history");
      return;
    }
    if (personal && (path.startsWith("/orders") || path.startsWith("/packages") || path === "/more")) {
      router.replace("/favorites");
      return;
    }
    if (changed && path === "/favorites" && selectedCollection && selectedCollection !== "none" && !data.collections.some(collection => collection.id === selectedCollection)) {
      router.replace("/favorites");
    }
  }, [data.workspaceId, data.collections, personal, path, selectedCollection, router]);

  useLayoutEffect(() => {
    const updateSelection = () => {
      const selected = activeNavHref ? mobileNavItems.current.get(activeNavHref) : undefined;
      const container = mobileNavRef.current;
      if (!selected || !container) { setMobileNavSelection(null); return; }
      const itemRect = selected.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setMobileNavSelection({ left: itemRect.left - containerRect.left - container.clientLeft + container.scrollLeft, width: itemRect.width });
    };
    updateSelection();
    window.addEventListener("resize", updateSelection);
    return () => window.removeEventListener("resize", updateSelection);
  }, [activeNavHref, personal]);

  function toggleCollapsed() {
    collapsedFallback = !collapsed;
    try { localStorage.setItem(collapseKey, String(!collapsed)); } catch {}
    window.dispatchEvent(new Event(collapseEvent));
  }

  async function requestWorkspaceChange(workspaceId: string) {
    const result = await switchWorkspace(workspaceId);
    if (result === "confirm") setPendingWorkspaceId(workspaceId);
  }

  async function confirmWorkspaceChange() {
    if (!pendingWorkspaceId) return;
    const target = pendingWorkspaceId;
    setPendingWorkspaceId(null);
    await switchWorkspace(target, true);
  }

  function collectionLinks(ownerId: string) {
    return data.collections.filter(collection => collection.ownerId === ownerId).map(collection => <Link key={collection.id} className={"collection-link" + (selectedCollection === collection.id ? " selected" : "")} href={"/favorites?collection=" + encodeURIComponent(collection.id)} aria-current={selectedCollection === collection.id ? "page" : undefined}><Folder size={17} aria-hidden="true"/><span>{collection.name}</span><small>{data.favorites.filter(favorite => favorite.collectionId === collection.id).length}</small></Link>);
  }

  return <>
    <a className="skip-link" href="#main">Pular para conteúdo</a>
    <aside className={"sidebar" + (collapsed ? " is-collapsed" : "")} aria-label="Barra lateral">
      <div className="sidebar-heading">
        <Link className="brand" href="/favorites"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></Link>
        <button className="sidebar-collapse" type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expandir sidebar" : "Recolher sidebar"} aria-expanded={!collapsed} title={collapsed ? "Expandir sidebar" : "Recolher sidebar"}>{collapsed ? <PanelLeftOpen size={17} aria-hidden="true"/> : <PanelLeftClose size={17} aria-hidden="true"/>}</button>
      </div>
      <WorkspaceContextControl data={data} busy={busy} switching={switching} onChange={requestWorkspaceChange} compact={collapsed}/>
      <nav aria-label="Principal">{desktopNav.map(item => <Fragment key={item.href}>
        <Link className={"nav-item" + (path.startsWith(item.href) && !(item.href === "/packages" && path === "/packages/accounts") ? " selected" : "")} href={item.href} aria-label={item.label} title={collapsed ? item.label : undefined} aria-current={path.startsWith(item.href) && !(item.href === "/packages" && path === "/packages/accounts") ? "page" : undefined}><item.icon size={19} aria-hidden="true"/><span className="sidebar-label">{item.label}</span></Link>
        {!personal && item.href === "/packages" && <Link className={"nav-item nav-item-accounts" + (path === hubbuyAccountsNav.href ? " selected" : "")} href={hubbuyAccountsNav.href} aria-label={hubbuyAccountsNav.label} title={collapsed ? hubbuyAccountsNav.label : undefined} aria-current={path === hubbuyAccountsNav.href ? "page" : undefined}><WalletCards size={19} aria-hidden="true"/><span className="sidebar-label">{hubbuyAccountsNav.label}</span></Link>}
      </Fragment>)}</nav>
      {!collapsed && path === "/favorites" && <nav className="sidebar-collections" aria-label="Coleções">
        <span className="section-label">Minhas coleções</span>{collectionLinks(data.currentUser.id)}{!mine.length && <p className="collection-empty muted">Organize seus favoritos em coleções.</p>}
        <Link className="collection-link collection-create" href="/favorites?newCollection=1"><Plus size={17} aria-hidden="true"/>Nova coleção</Link>
        {!personal && otherOwners.length > 0 && <details className="group-collections" open={!!selectedCollection && !mine.some(collection => collection.id === selectedCollection)}><summary>Coleções do grupo<ChevronDown size={15} aria-hidden="true"/></summary>{otherOwners.map(member => <div className="collection-owner-group" key={member.id}><div className="collection-owner-heading"><Avatar name={member.name}/><span>De {member.name}</span></div>{collectionLinks(member.id)}</div>)}</details>}
      </nav>}
      <div className="sidebar-bottom"><button className="sidebar-theme" type="button" role="switch" aria-label="Tema escuro" aria-checked={resolvedTheme === "dark"} title={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}><Sun className="theme-sun" size={22} aria-hidden="true"/><Moon className="theme-moon" size={21} aria-hidden="true"/><span className="theme-track" aria-hidden="true"><span className="theme-thumb"/></span></button></div>
      <Link className={"sidebar-profile" + (path === "/profile" ? " selected" : "")} href="/profile" aria-label="Perfil e configurações" title={collapsed ? "Perfil e configurações" : data.currentUser.email} aria-current={path === "/profile" ? "page" : undefined}><span className="sidebar-account-avatar"><Avatar name={data.currentUser.name}/><Settings className="sidebar-account-badge" size={13} aria-hidden="true"/></span><span className="sidebar-label"><strong>{data.currentUser.name}</strong><small>Conta e configurações</small></span><Settings className="sidebar-account-settings" size={18} aria-hidden="true"/></Link>
    </aside>
    <div className="app-content">
      <header className="mobile-header">
        <div className="mobile-header-top"><Link className="brand" href="/favorites"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></Link><div className="mobile-header-actions"><button className="sidebar-theme mobile-header-theme" type="button" role="switch" aria-label="Tema escuro" aria-checked={resolvedTheme === "dark"} title={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"} onClick={() => setPreference(resolvedTheme === "dark" ? "light" : "dark")}><Sun className="theme-sun" size={22} aria-hidden="true"/><Moon className="theme-moon" size={21} aria-hidden="true"/><span className="theme-track" aria-hidden="true"><span className="theme-thumb"/></span></button><Link href="/profile" className="profile-link" aria-label="Perfil"><Avatar name={data.currentUser.name}/></Link></div></div>
        <WorkspaceContextControl data={data} busy={busy} switching={switching} onChange={requestWorkspaceChange} compact />
      </header>
      <main id="main" className="page-content" key={data.workspaceId}>{children}</main>
    </div>
    <nav className="mobile-island" aria-label="Navegação móvel" ref={mobileNavRef} style={{ "--selection-left": (mobileNavSelection?.left ?? 0) + "px", "--selection-width": (mobileNavSelection?.width ?? 0) + "px" } as React.CSSProperties}>
      <span className={"mobile-island-selection" + (mobileNavSelection ? " ready" : "")} aria-hidden="true"/>
      {mobileNav.map(item => { const selected = activeNavHref === item.href; return <Link key={item.href} ref={element => { if (element) mobileNavItems.current.set(item.href, element); else mobileNavItems.current.delete(item.href); }} href={item.href} className={selected ? "selected" : ""} aria-label={item.label} aria-current={selected ? "page" : undefined}><item.icon size={21} aria-hidden="true"/>{selected && <span>{item.short}</span>}</Link>; })}
    </nav>
    <Confirm open={pendingWorkspaceId !== null} onOpenChange={open => { if (!open) setPendingWorkspaceId(null); }} title="Descartar alterações?" description="Há uma edição aberta. Trocar de espaço vai descartar os dados que ainda não foram salvos." label="Descartar e trocar" busy={switching} onConfirm={confirmWorkspaceChange}/>
  </>;
}
