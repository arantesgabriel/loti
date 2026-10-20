import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowRight, Bookmark, Check, ChevronRight, Gift, Heart, Monitor, ShoppingBag } from "lucide-react";
import { ProductCategoryMarker } from "@/components/product-category-icons";

export function StoryDecoration({ asset, className }: { asset: string; className: string }) {
  return <Image src={`/login-stories/${asset}.svg`} alt="" aria-hidden="true" width={512} height={512} className={`story-decoration ${className}`} loading="eager" />;
}
export function StoryBackdrop() {
  return <><StoryDecoration asset="warm-blob" className="story-blob" /><StoryDecoration asset="pedestal" className="story-pedestal" /></>;
}
export function FavoritePreviewItem({ name, category, price, index }: { name: string; category: string; price: string; index: number }) {
  return <li className={`favorite-preview-item reveal-item item-${index}`}>
    <ProductCategoryMarker visualKey={category} /><div><strong>{name}</strong><small>{price}</small></div><Heart size={17} fill="currentColor" aria-hidden="true" />
  </li>;
}
export function FavoritePreviewCard() {
  return <div className="story-ui favorite-preview-card reveal-card">
    <h3><Bookmark size={20} fill="currentColor" aria-hidden="true" />Meus favoritos<ChevronRight size={18} aria-hidden="true" /></h3>
    <ul><FavoritePreviewItem name="Tênis casual" category="sneaker" price="R$ 349,90" index={0} />
      <FavoritePreviewItem name="SSD NVMe" category="ssd_nvme" price="R$ 259,00" index={1} />
      <FavoritePreviewItem name="Fone de ouvido" category="headphones" price="R$ 299,00" index={2} /></ul>
    <div className="preview-footer">3 achados, um só lugar<Bookmark size={14} aria-hidden="true" /></div>
  </div>;
}
export function SaveFavoritesStory() {
  return <><StoryBackdrop /><StoryDecoration asset="bookmark" className="save-bookmark" /><FavoritePreviewCard />
    <StoryDecoration asset="sneaker" className="save-sneaker" /><StoryDecoration asset="smartphone" className="save-phone" /></>;
}

export function MemberInitialChip({ initials, index }: { initials: string; index: number }) {
  return <span className={`member-initial member-${index}`}>{initials}</span>;
}
export function CollectionPreviewCard({ title, count, categories, index }: { title: string; count: number; categories: string[]; index: number }) {
  const Icon = index === 0 ? Gift : index === 1 ? Monitor : Bookmark;
  return <div className={`story-ui collection-preview collection-${index}`}>
    <h3><Icon size={20} aria-hidden="true" />{title}<ChevronRight size={18} aria-hidden="true" /></h3>
    <div className="collection-samples">{categories.map(category => <ProductCategoryMarker key={category} visualKey={category} />)}<span>+{count}</span></div>
    <small>{count + categories.length} favoritos</small>
  </div>;
}
export function OrganizeGroupStory() {
  return <><StoryBackdrop />
    <div className="story-ui member-preview" aria-label="Membros do grupo">{["GA", "BR", "AM", "BO", "VI"].map((initials, index) => <MemberInitialChip key={initials} initials={initials} index={index} />)}</div>
    <CollectionPreviewCard title="Presentes" count={12} categories={["headphones", "smartwatch", "generic"]} index={0} />
    <CollectionPreviewCard title="Build PC" count={8} categories={["gpu", "keyboard", "mouse"]} index={1} />
    <CollectionPreviewCard title="Tênis" count={16} categories={["sneaker", "clog", "sandal"]} index={2} />
    <StoryDecoration asset="group" className="group-decoration" /><StoryDecoration asset="bookmark" className="group-bookmark" />
  </>;
}

const purchaseItems = [
  { name: "Tênis casual", category: "sneaker", cents: 34990 },
  { name: "Fone de ouvido", category: "headphones", cents: 29900 },
  { name: "Garrafa térmica", category: "generic", cents: 12990 },
];
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function FavoritesPreview() {
  return <div className="story-ui transfer-favorites">
    <h3><Bookmark size={18} fill="currentColor" aria-hidden="true" />Meus favoritos</h3>
    <ul>{purchaseItems.map((item, index) => <li className={`transfer-source source-${index}`} key={item.name}>
      <ProductCategoryMarker visualKey={item.category} /><span>{item.name}</span><Heart size={14} fill="currentColor" aria-hidden="true" />
    </li>)}</ul>
  </div>;
}
export function PurchasePreview({ added, progress, transferred }: { added: number; progress: number; transferred: number }) {
  const total = purchaseItems.reduce((sum, item) => sum + item.cents, 0);
  return <div className="story-ui transfer-purchase">
    <h3><ShoppingBag size={18} aria-hidden="true" />Compra atual</h3>
    <ul>{purchaseItems.map((item, index) => <li className={`purchase-preview-line purchase-line-${index}`} data-arrived={index === 2 || index < transferred} key={item.name}>
      <span role="checkbox" aria-readonly="true" aria-checked={index < added} aria-label={`${item.name}: ${index < added ? "Adicionado" : "Pendente"}`} className={`preview-check${index < added ? " checked" : ""}`}>
        {index < added && <Check size={12} aria-hidden="true" />}
      </span>
      <ProductCategoryMarker visualKey={item.category} />
      <div><strong>{item.name}</strong><small><span className="preview-status">{index < added ? "Adicionado" : "Pendente"}</span><span className="preview-quantity">Qtd. 1</span></small></div>
      <span className="preview-price">{currency.format(item.cents / 100)}</span>
    </li>)}</ul>
    <div className="preview-progress-label">{progress} de 3 itens adicionados</div>
    <div className="preview-progress" role="progressbar" aria-label="Itens adicionados à compra" aria-valuemin={0} aria-valuemax={3} aria-valuenow={progress}><span style={{ width: `${progress / 3 * 100}%` }} /></div>
    <div className="preview-total"><span>Total estimado</span><strong>{currency.format(total / 100)}</strong></div>
  </div>;
}
export function BuildPurchaseStory({ reducedMotion }: { reducedMotion: boolean }) {
  const [sequence, setSequence] = useState({ transferred: 0, added: 0, progress: 0 });
  useEffect(() => {
    if (reducedMotion) return;
    const steps = [
      [700, { transferred: 1, added: 0, progress: 0 }],
      [950, { transferred: 1, added: 1, progress: 0 }],
      [1150, { transferred: 1, added: 1, progress: 1 }],
      [1650, { transferred: 2, added: 1, progress: 1 }],
      [1750, { transferred: 2, added: 2, progress: 1 }],
      [1800, { transferred: 2, added: 2, progress: 2 }],
    ] as const;
    const timers = steps.map(([delay, state]) => window.setTimeout(() => setSequence(state), delay));
    return () => timers.forEach(window.clearTimeout);
  }, [reducedMotion]);
  return <><StoryBackdrop /><FavoritesPreview />
    <span className="transfer-arrow" aria-label="Dos favoritos para a compra"><ArrowRight size={42} aria-hidden="true" /></span>
    <PurchasePreview {...(reducedMotion ? { transferred: 2, added: 2, progress: 2 } : sequence)} />
    <StoryDecoration asset="shopping-bag" className="purchase-bag" /><StoryDecoration asset="package" className="purchase-package" />
  </>;
}
