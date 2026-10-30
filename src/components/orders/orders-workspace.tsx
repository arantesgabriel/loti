"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentProps, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import "./orders-workspace.css";

export type OrdersPanelState =
  | { kind: "closed" }
  | { kind: "prepare" }
  | { kind: "item-detail"; itemId: string };

export type OrdersPanel = {
  state: Exclude<OrdersPanelState, { kind: "closed" }>;
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
};

const compactQuery = "(max-width: 1199px)";
function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia(compactQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const compactSnapshot = () => window.matchMedia(compactQuery).matches;
const serverSnapshot = () => false;

export function useOrdersCompact() {
  return useSyncExternalStore(subscribeCompact, compactSnapshot, serverSnapshot);
}

type WorkspaceProps = {
  children: ReactNode;
  description?: string;
  tools?: ReactNode;
  toolbar?: ReactNode;
  tabs?: ReactNode;
  footer?: ReactNode;
} & ({ panel?: undefined; onPanelClose?: never } | { panel: OrdersPanel; onPanelClose: () => void });

/** The desktop panel participates in the grid; closed reserves no column. */
export function OrdersWorkspace({
  children, description = "Da compra ao armazém. Seus itens, sem ruído.",
  tools, toolbar, tabs, footer, panel, onPanelClose,
}: WorkspaceProps) {
  const compact = useOrdersCompact();
  const titleId = useId();
  // Retain presentation only while Radix plays the closing animation.
  const [exitingPanel, setExitingPanel] = useState(panel);
  if (panel && panel !== exitingPanel) setExitingPanel(panel);
  const presentedPanel = panel ?? exitingPanel;
  const wasOpen = useRef(false);
  const previousPanelKey = useRef("");
  const panelKey = panel ? panel.state.kind === "item-detail" ? `item:${panel.state.itemId}` : panel.state.kind : "";
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (panel && (!wasOpen.current || (panelKey !== previousPanelKey.current && panelKey.startsWith("item:") && previousPanelKey.current.startsWith("item:")))) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!panel && wasOpen.current && !compact && returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
    wasOpen.current = !!panel;
    previousPanelKey.current = panelKey;
  }, [panel, compact, panelKey]);
  return (
    <section className="orders-foundation orders-workspace" aria-labelledby={titleId} data-panel={panel?.state.kind ?? "closed"}>
      <div className="orders-workspace-main">
        <header className="orders-workspace-heading">
          <div><h1 id={titleId}>Pedidos</h1><p>{description}</p></div>
          {tools && <div className="orders-workspace-tools">{tools}</div>}
        </header>
        {toolbar && <div className="orders-workspace-toolbar">{toolbar}</div>}
        {tabs && <nav className="orders-workspace-tabs" aria-label="Etapas dos pedidos">{tabs}</nav>}
        <div className="orders-workspace-content">{children}</div>
        {footer && <footer className="orders-workspace-footer">{footer}</footer>}
      </div>
      {panel && !compact && <DesktopPanel panel={panel} onClose={onPanelClose} />}
      {compact && (
        <OrdersBottomSheet className="orders-workspace-sheet" open={!!panel} onOpenChange={open => { if (!open) onPanelClose?.(); }} title={presentedPanel?.title ?? "Pedidos"} description={presentedPanel?.description} returnFocusTo={returnFocus}>
          <div className="orders-panel-content">{presentedPanel?.children}</div>
          {presentedPanel?.footer && <footer className="orders-panel-footer">{presentedPanel.footer}</footer>}
        </OrdersBottomSheet>
      )}
    </section>
  );
}

function DesktopPanel({ panel, onClose }: { panel: OrdersPanel; onClose: () => void }) {
  const titleId = useId(), descriptionId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent) => {
      // A nested modal owns Escape; closing it must not also close the workspace.
      if (event.key !== "Escape" || event.defaultPrevented || (event.target instanceof Element && event.target.closest('[role="dialog"]'))) return;
      event.preventDefault();
      close.current();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <aside className="orders-desktop-panel" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <header className="orders-panel-heading">
        <div><h2 id={titleId} ref={heading} tabIndex={-1}>{panel.title}</h2><p id={descriptionId}>{panel.description}</p></div>
        <Button type="button" variant="ghost" size="icon" aria-label="Fechar painel" onClick={onClose}><X size={20} aria-hidden="true" /></Button>
      </header>
      <div className="orders-panel-content">{panel.children}</div>
      {panel.footer && <footer className="orders-panel-footer">{panel.footer}</footer>}
    </aside>
  );
}

/** Reuses Radix focus/portal/scroll-lock from Surface, with a vertical-only entry. */
export function OrdersBottomSheet({ className = "", ...props }: Omit<ComponentProps<typeof Surface>, "sheet" | "mobileFullScreen">) {
  return <Surface {...props} sheet className={`orders-foundation orders-bottom-sheet ${className}`} />;
}

export function OrdersBadge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "info" | "warning"; children: ReactNode }) {
  return <span className="orders-badge" data-tone={tone}>{children}</span>;
}

export function OrdersFeedback({ title, children, error = false }: { title: string; children?: ReactNode; error?: boolean }) {
  return <div className="orders-feedback" role={error ? "alert" : "status"} data-error={error}><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}

/** Tooltip is hoverable, keyboard-visible and dismissible without closing a panel. */
export function OrdersIconButton({ label, children, ...props }: Omit<ComponentProps<typeof Button>, "aria-label" | "title" | "children" | "asChild"> & { label: string; children: ReactNode }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <span className="orders-icon-control" onPointerEnter={() => setVisible(true)} onPointerLeave={() => setVisible(false)}>
      <Button {...props} type={props.type ?? "button"} variant={props.variant ?? "outline"} size="icon" aria-label={label} aria-describedby={visible ? id : undefined}
        onFocus={event => { setVisible(true); props.onFocus?.(event); }}
        onBlur={event => { setVisible(false); props.onBlur?.(event); }}
        onKeyDown={event => { if (event.key === "Escape" && visible) { setVisible(false); event.preventDefault(); event.stopPropagation(); } props.onKeyDown?.(event); }}>
        {children}
      </Button>
      {visible && <span id={id} className="orders-icon-tooltip" role="tooltip">{label}</span>}
    </span>
  );
}
