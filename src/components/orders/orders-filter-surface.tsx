"use client";

import type { ReactNode } from "react";
import { Surface } from "@/components/ui/surface";
import { OrdersBottomSheet, useOrdersCompact } from "./orders-workspace";

export function OrdersFilterSurface({ open, onOpenChange, children, description = "Combine etapa, conta, pessoa e origem." }: { open: boolean; onOpenChange: (value: boolean) => void; children: ReactNode; description?: string }) {
  const compact = useOrdersCompact();
  return compact ? <OrdersBottomSheet open={open} onOpenChange={onOpenChange} title="Filtros" description={description} className="orders-filter-surface">{children}</OrdersBottomSheet>
    : <Surface open={open} onOpenChange={onOpenChange} title="Filtros" description={description} className="orders-foundation orders-filter-surface">{children}</Surface>;
}
