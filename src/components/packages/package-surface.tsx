"use client";

import type { ComponentProps } from "react";
import { Surface } from "@/components/ui/surface";
import "./package-surface.css";

/** Shared drawer proportions for financial forms; dialogs retain their own layout. */
export function PackageSurface({ className = "", sheet, ...props }: ComponentProps<typeof Surface>) {
  return <Surface {...props} sheet={sheet} className={[sheet && "package-surface", className].filter(Boolean).join(" ")}/>;
}
