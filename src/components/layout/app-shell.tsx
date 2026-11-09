"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Fragment } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bookmark, ShoppingCart, History, Folder, Plus, ChevronDown, ChevronRight, Package, WalletCards, PanelLeftClose, PanelLeftOpen, ReceiptText, Ellipsis, UserRound, UsersRound, Check, LoaderCircle } from "lucide-react";
import { Avatar } from "../shared";
import { useWorkspace } from "../workspace-provider";
import { ThemeSwitch } from "../theme-switch";
import { Confirm } from "../ui/surface";
import { profileSettingsCategories, requestProfileSettingsCategory, type ProfileSettingsCategory } from "../profile/settings-categories";
import "./sidebar.css";

const collapseKey = "loti.sidebar.collapsed";
const collapseEvent = "loti:sidebar";
let collapsedFallback = false;
function subscribeCollapse(callback: () => void) { window.addEventListener(collapseEvent, callback); window.addEventListener("storage", callback); return () => { window.removeEventListener(collapseEvent, callback); window.removeEventListener("storage", callback); }; }
function getCollapsed() { try { return localStorage.getItem(collapseKey) === "true"; } catch { return collapsedFallback; } }
const nav = [{ href: "/favorites", label: "Favoritos", short: "Favoritos", icon: Bookmark }, { href: "/purchase", label: "Compra atual", short: "Compra", icon: ShoppingCart }, { href: "/orders", label: "Pedidos", short: "Pedidos", icon: ReceiptText }, { href: "/packages", label: "Pacotes", short: "Pacotes", icon: Package }, { href: "/history", label: "Histórico", short: "Histórico", icon: History }];
const hubbuyAccountsNav = { href: "/packages/accounts", label: "Contas HubBuy", short: "Contas", icon: WalletCards };
const moreNav = { href: "/more", label: "Mais", short: "Mais", icon: Ellipsis };

function workspaceLabel(workspace: ReturnType<typeof useWorkspace>["data"]["workspaces"][number] | undefined) {
  return workspace?.kind === "personal" ? "Espaço pessoal" : workspace?.name ?? "Espaço";
}

function workspaceTypeLabel(workspace: ReturnType<typeof useWorkspace>["data"]["workspaces"][number] | undefined) {
  return workspace?.kind === "personal" ? "Pessoal · só você" : "Compartilhado";
}

function WorkspaceRadioOptions({ data, busy, onChange }: {
  data: ReturnType<typeof useWorkspace>["data"];
  busy: boolean;
  onChange: (workspaceId: string) => void;
}) {
  return <DropdownMenu.RadioGroup className="workspace-menu-options" aria-label="Espaços disponíveis" value={data.workspaceId} onValueChange={onChange}>
    {data.workspaces.map(workspace => {
      const OptionIcon = workspace.kind === "personal" ? UserRound : UsersRound;
      const label = workspaceLabel(workspace);
      return <DropdownMenu.RadioItem key={workspace.id} className="workspace-menu-option" value={workspace.id} disabled={busy}>
        <span className="workspace-menu-option-icon"><OptionIcon size={17} aria-hidden="true" /></span>
        <span className="workspace-menu-option-copy"><strong title={label}>{label}</strong><small>{workspaceTypeLabel(workspace)}</small></span>
        <DropdownMenu.ItemIndicator className="workspace-menu-option-check"><Check size={16} strokeWidth={2.3} aria-hidden="true" /></DropdownMenu.ItemIndicator>
      </DropdownMenu.RadioItem>;
    })}
  </DropdownMenu.RadioGroup>;
}

function WorkspaceContextControl({ data, busy, switching, onChange, compact = false }: {
  data: ReturnType<typeof useWorkspace>["data"];
  busy: boolean;
  switching: boolean;
  onChange: (workspaceId: string) => void;
  compact?: boolean;
}) {
  const currentWorkspace = data.workspaces.find(item => item.id === data.workspaceId);
  const current = workspaceLabel(currentWorkspace);
  const status = switching ? "Trocando de espaço…" : busy ? "Salvando alterações…" : null;
  const statusId = "workspace-status-" + useId().replace(/:/g, "");
  const Icon = currentWorkspace?.kind === "personal" ? UserRound : UsersRound;
  const className = "workspace-context sidebar-workspace" + (compact ? " compact" : "");

  if (data.workspaces.length <= 1) return <div className={className + " workspace-context-static"} role="group" aria-label={`Espaço atual: ${current} (${workspaceTypeLabel(currentWorkspace)})`}>
    <span className="workspace-context-label">Espaço atual</span>
    <span className="workspace-context-trigger">
      <span className="workspace-context-icon"><Icon size={18} aria-hidden="true" /></span>
      <span className="workspace-context-copy"><strong className="workspace-context-name" title={current}>{current}</strong><span className="workspace-context-kind">{workspaceTypeLabel(currentWorkspace)}</span></span>
    </span>
  </div>;

  return <div className={className} aria-busy={busy}>
    <span className="workspace-context-label">Espaço atual</span>
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="workspace-context-trigger" disabled={busy} aria-label={`Espaço atual: ${current} (${workspaceTypeLabel(currentWorkspace)}). Selecionar espaço`} title={compact ? `Espaço atual: ${current}. Selecionar espaço` : undefined} aria-describedby={status ? statusId : undefined}>
          <span className="workspace-context-icon"><Icon size={18} aria-hidden="true" /></span>
          <span className="workspace-context-copy"><strong className="workspace-context-name" title={current}>{current}</strong><span className="workspace-context-kind">{workspaceTypeLabel(currentWorkspace)}</span></span>
          {switching ? <LoaderCircle className="workspace-context-loader" size={16} aria-hidden="true" /> : <ChevronDown className="workspace-context-caret" size={16} aria-hidden="true" />}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="workspace-menu" side="right" align="end" sideOffset={6} collisionPadding={12} aria-label="Seus espaços">
          <DropdownMenu.Label className="workspace-menu-label">Seus espaços</DropdownMenu.Label>
          <WorkspaceRadioOptions data={data} busy={busy} onChange={onChange} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    {status && <span className="workspace-context-status" id={statusId} role="status">{status}</span>}
  </div>;
}

function MobileAccountMenu({ data, busy, switching, onWorkspaceChange, onSettingsCategory }: {
  data: ReturnType<typeof useWorkspace>["data"];
  busy: boolean;
  switching: boolean;
  onWorkspaceChange: (workspaceId: string) => void;
  onSettingsCategory: (category: ProfileSettingsCategory) => void;
}) {
  const currentWorkspace = data.workspaces.find(item => item.id === data.workspaceId);
  const CurrentWorkspaceIcon = currentWorkspace?.kind === "personal" ? UserRound : UsersRound;
  return <DropdownMenu.Root modal={false}>
    <DropdownMenu.Trigger asChild>
      <button className="mobile-account-menu-trigger" type="button" aria-label="Abrir menu de navegação e conta" aria-busy={switching} title="Menu de navegação e conta">
        <Avatar name={data.currentUser.name} />
        {switching ? <LoaderCircle className="mobile-account-menu-trigger-indicator is-loading" size={13} aria-hidden="true" /> : <ChevronDown className="mobile-account-menu-trigger-indicator" size={13} aria-hidden="true" />}
      </button>
    </DropdownMenu.Trigger>
    <DropdownMenu.Portal>
      <DropdownMenu.Content className="mobile-account-menu" side="bottom" align="end" sideOffset={9} collisionPadding={12} aria-label="Menu de navegação e conta">
        <DropdownMenu.Label className="mobile-account-menu-user">
          <Avatar name={data.currentUser.name} />
          <span className="mobile-account-menu-user-copy"><strong>{data.currentUser.name}</strong><small>{data.currentUser.email}</small></span>
        </DropdownMenu.Label>
        <DropdownMenu.Separator className="mobile-account-menu-separator" />
        <DropdownMenu.Label className="mobile-account-menu-section-label">Espaço atual</DropdownMenu.Label>
        {data.workspaces.length > 1
          ? <WorkspaceRadioOptions data={data} busy={busy} onChange={onWorkspaceChange} />
          : <div className="mobile-account-menu-current-space">
            <span className="workspace-menu-option-icon"><CurrentWorkspaceIcon size={17} aria-hidden="true" /></span>
            <span className="workspace-menu-option-copy"><strong>{workspaceLabel(currentWorkspace)}</strong><small>{workspaceTypeLabel(currentWorkspace)}</small></span>
          </div>}
        {busy && <span className="mobile-account-menu-status" role="status">{switching ? "Trocando de espaço…" : "Aguarde a operação atual antes de trocar."}</span>}
        <DropdownMenu.Separator className="mobile-account-menu-separator" />
        <DropdownMenu.Label className="mobile-account-menu-section-label">Configurações</DropdownMenu.Label>
        <div className="mobile-account-menu-categories" role="group" aria-label="Categorias de configurações">
          {profileSettingsCategories.map(category => <DropdownMenu.Item key={category.id} className="mobile-account-menu-category" onSelect={() => onSettingsCategory(category.id)}>
            <category.Icon size={18} aria-hidden="true" /><span>{category.label}</span><ChevronRight className="mobile-account-menu-category-arrow" size={16} aria-hidden="true" />
          </DropdownMenu.Item>)}
        </div>
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  </DropdownMenu.Root>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribeCollapse, getCollapsed, () => false);
  const router = useRouter();
  const path = usePathname(), params = useSearchParams();
  const { data, busy, switching, switchWorkspace } = useWorkspace();
  const personal = data.workspaceKind === "personal";
  const desktopNav = nav;
  const mobileNav = [...nav.slice(0, 4), moreNav];
  const mobileNavRef = useRef<HTMLElement>(null), mobileNavItems = useRef(new Map<string, HTMLAnchorElement>());
  const [mobileNavSelection, setMobileNavSelection] = useState<{ left: number; width: number } | null>(null);
  const [pendingWorkspaceId, setPendingWorkspaceId] = useState<string | null>(null);
  const previousWorkspaceId = useRef(data.workspaceId);
  const selectedCollection = params.get("collection");
  const activeNav = path === hubbuyAccountsNav.href ? hubbuyAccountsNav : nav.find(item => path.startsWith(item.href));
  const activeNavHref = path === "/more" || path === "/history" || path === hubbuyAccountsNav.href ? moreNav.href : activeNav?.href ?? "";
  const mine = data.collections.filter(collection => collection.ownerId === data.currentUser.id);
  const otherOwners = data.members.filter(member => member.id !== data.currentUser.id && data.collections.some(collection => collection.ownerId === member.id));

  useEffect(() => {
    const changed = previousWorkspaceId.current !== data.workspaceId;
    previousWorkspaceId.current = data.workspaceId;
    if (changed && path.startsWith("/history/")) {
      router.replace("/history");
      return;
    }
    if (changed && (path.startsWith("/orders/") || path.startsWith("/packages/detail/") || /^\/packages\/[^/]+$/.test(path))) {
      router.replace(path.startsWith("/orders/") ? "/orders" : "/packages");
      return;
    }
    if (changed && path === "/favorites" && selectedCollection && selectedCollection !== "none" && !data.collections.some(collection => collection.id === selectedCollection)) {
      router.replace("/favorites");
    }
  }, [data.workspaceId, data.collections, path, selectedCollection, router]);

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

  function openSettingsCategory(category: ProfileSettingsCategory) {
    if (path === "/profile") requestProfileSettingsCategory(category);
    else router.push("/profile?section=" + encodeURIComponent(category));
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
      <nav aria-label="Principal">{desktopNav.map(item => <Fragment key={item.href}>
        <Link className={"nav-item" + (path.startsWith(item.href) && !(item.href === "/packages" && path === "/packages/accounts") ? " selected" : "")} href={item.href} aria-label={item.label} title={collapsed ? item.label : undefined} aria-current={path.startsWith(item.href) && !(item.href === "/packages" && path === "/packages/accounts") ? "page" : undefined}><item.icon size={19} aria-hidden="true"/><span className="sidebar-label">{item.label}</span></Link>
        {item.href === "/packages" && <Link className={"nav-item nav-item-accounts" + (path === hubbuyAccountsNav.href ? " selected" : "")} href={hubbuyAccountsNav.href} aria-label={hubbuyAccountsNav.label} title={collapsed ? hubbuyAccountsNav.label : undefined} aria-current={path === hubbuyAccountsNav.href ? "page" : undefined}><WalletCards size={19} aria-hidden="true"/><span className="sidebar-label">{hubbuyAccountsNav.label}</span></Link>}
      </Fragment>)}</nav>
      {!collapsed && path === "/favorites" && <nav className="sidebar-collections" aria-label="Coleções">
        <span className="section-label">Minhas coleções</span>{collectionLinks(data.currentUser.id)}{!mine.length && <p className="collection-empty muted">Organize seus favoritos em coleções.</p>}
        <Link className="collection-link collection-create" href="/favorites?newCollection=1"><Plus size={17} aria-hidden="true"/>Nova coleção</Link>
        {!personal && otherOwners.length > 0 && <details className="group-collections" open={!!selectedCollection && !mine.some(collection => collection.id === selectedCollection)}><summary>Coleções do grupo<ChevronDown size={15} aria-hidden="true"/></summary>{otherOwners.map(member => <div className="collection-owner-group" key={member.id}><div className="collection-owner-heading"><Avatar name={member.name}/><span>De {member.name}</span></div>{collectionLinks(member.id)}</div>)}</details>}
      </nav>}
      <div className="sidebar-bottom">
        <WorkspaceContextControl data={data} busy={busy} switching={switching} onChange={requestWorkspaceChange} compact={collapsed}/>
        <div className="sidebar-account-card">
          <Link className={"sidebar-profile" + (path === "/profile" ? " selected" : "")} href="/profile" aria-label="Perfil e configurações" title={collapsed ? "Perfil e configurações" : data.currentUser.email} aria-current={path === "/profile" ? "page" : undefined}>
            <Avatar name={data.currentUser.name}/>
            <span className="sidebar-label"><strong>{data.currentUser.name}</strong><small>Minha conta</small></span>
            <ChevronRight className="sidebar-account-chevron" size={17} aria-hidden="true"/>
          </Link>
          <div className="sidebar-appearance">
            <span className="sidebar-appearance-label">Aparência</span>
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </aside>
    <div className="app-content">
      <header className="mobile-header">
        <div className="mobile-header-top"><Link className="brand" href="/favorites"><Bookmark size={30} fill="currentColor" strokeWidth={0} aria-hidden="true"/><span>Loti</span></Link><div className="mobile-header-actions"><ThemeSwitch className="mobile-header-theme" /><MobileAccountMenu data={data} busy={busy} switching={switching} onWorkspaceChange={requestWorkspaceChange} onSettingsCategory={openSettingsCategory} /></div></div>
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
