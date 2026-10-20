import { ExternalLink, Package, type LucideIcon } from "lucide-react";
import { platformLabels, type Platform } from "@/lib/domain/urls";
import { Button } from "./ui/button";
export { ProductCategoryMarker } from "./product-category-icons";
export function Avatar({ name }: { name: string }) { return <span className="avatar" aria-hidden="true">{(name.trim().includes(" ") ? name.trim().split(/\s+/).map(p => p[0]).join("") : name).slice(0, 2).toUpperCase()}</span>; }
export function PlatformBadge({ platform }: { platform: string }) { return <span className={`badge platform-${platform}`}>{platformLabels[platform as Platform] ?? "Outro"}</span>; }
export function OpenProduct({ url, compact = false }: { url: string; compact?: boolean }) { return <Button asChild variant="outline" size="sm"><a href={url} target="_blank" rel="noopener noreferrer" aria-label="Abrir produto">{!compact && <span>Abrir produto</span>}<ExternalLink size={15}/></a></Button>; }
export function EmptyState({ title, description, children, icon: Icon = Package }: { title: string; description: string; children?: React.ReactNode; icon?: LucideIcon }) { return <div className="empty-state"><div className="empty-icon"><Icon size={32} strokeWidth={1.4}/></div><h2>{title}</h2><p className="muted">{description}</p>{children}</div>; }
