"use client";

import { createContext, useContext, type ComponentProps, type ReactNode } from "react";
import { Surface } from "@/components/ui/surface";
import { OrdersContextSurface } from "@/components/orders/orders-context-surface";
import "./package-surface.css";

const SurfacePresentation = createContext<{ orders: boolean; error?: string; intro?: ReactNode }>({ orders: false });
/** A caller may adapt presentation without forking the financial forms. */
export function PackageSurfaceProvider({ orders, error, intro, children }: { orders: boolean; error?: string; intro?: ReactNode; children: ReactNode }) {
  return <SurfacePresentation.Provider value={{ orders, error, intro }}>{children}</SurfacePresentation.Provider>;
}

/** Shared drawer proportions for financial forms; dialogs retain their own layout. */
export function PackageSurface({ className = "", sheet, ...props }: ComponentProps<typeof Surface>) {
  const presentation = useContext(SurfacePresentation);
  if (presentation.orders) return <OrdersContextSurface {...props} sheet={sheet} className={className}>{presentation.intro}{presentation.error && <p role="alert" className="orders-form-error">{presentation.error}</p>}{props.children}</OrdersContextSurface>;
  return <Surface {...props} sheet={sheet} className={[sheet && "package-surface", className].filter(Boolean).join(" ")}/>;
}
