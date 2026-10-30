"use client";

import type { ReactNode } from "react";
import { Surface } from "@/components/ui/surface";
import { OrdersBottomSheet, useOrdersCompact } from "./orders-workspace";

export function OrdersFilterSurface({ open, onOpenChange, children }: { open: boolean; onOpenChange: (value: boolean) => void; children: ReactNode }) {
  const compact = useOrdersCompact();
  return compact ? <OrdersBottomSheet open={open} onOpenChange={onOpenChange} title="Filtros" description="Combine etapa, conta, pessoa e origem." className="orders-filter-surface">{children}</OrdersBottomSheet>
    : <Surface open={open} onOpenChange={onOpenChange} title="Filtros" description="Combine etapa, conta, pessoa e origem." className="orders-foundation orders-filter-surface">{children}</Surface>;
}
