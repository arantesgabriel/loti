"use client";

import type { ComponentProps } from "react";
import { Surface } from "@/components/ui/surface";
import { OrdersBottomSheet, useOrdersCompact } from "./orders-workspace";

/** Existing item actions keep their commands; only their presentation changes. */
export function OrdersContextSurface({ className = "", ...props }: ComponentProps<typeof Surface>) {
  const compact = useOrdersCompact();
  return compact ? <OrdersBottomSheet {...props} className={`orders-action-surface ${className}`} />
    : <Surface {...props} sheet={false} className={`orders-foundation orders-action-surface ${className}`} />;
}
