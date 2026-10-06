# Product Representation — Functional Markers and Editorial Illustrations

## Operational UI

Favorites Cards/List, Current Purchase, History, detail sheets and favorite pickers use **functional category markers**: small, neutral, low emphasis and independent of the specific item, brand or listing. Product name, variation, price, owner, platform and actions dominate. Purchase status, quantity and subtotal also precede the marker.

Never use large product images, real thumbnails, generic 3D product renders, product logos or per-category colors in these surfaces. Cards have no large image header. No remote classification, image scraping, AI or runtime generation.

## Category resolution and persistence

`src/lib/domain/categories.ts` exports:

```ts
resolveProductCategory(name: string): ProductCategoryKey
productCategoryKey(key: string): ProductCategoryKey
```

The resolver normalizes accents/case and applies ordered keyword rules. NVMe matching precedes generic SSD matching. Examples: Nike Vomero, Ultraboost and Adidas Campus → `sneaker`; Crocs → `clog`; WD Blue SN5000 and SSD NVMe → `ssd_nvme`; Camiseta → `tshirt`; unknown → `generic`.

Keep the existing `visual_key` column and `visualKey` API property as the category key. No schema change or migration is needed. Saving a favorite or editing an active item's name recalculates its own category; adding a favorite copies its key into the independent purchase snapshot. Favorite changes/deletion never mutate existing item keys. Finalized snapshots remain read-only. Unknown or corrupt stored keys render the generic marker without a broken asset request.

## Initial categories

- `generic`
- `sneaker`
- `clog`
- `sandal`
- `tshirt`
- `hoodie`
- `pants`
- `ssd_nvme`
- `ssd_sata`
- `ram`
- `motherboard`
- `cpu`
- `gpu`
- `laptop`
- `smartphone`
- `smartwatch`
- `keyboard`
- `mouse`
- `headphones`
- `controller`

## Keyword examples

| Keywords / name fragments | Key |
|---|---|
| tênis, tenis, sneaker, vomero, ultraboost, campus, nb 9060 | `sneaker` |
| crocs, clog | `clog` |
| sandália, sandalia, sandal | `sandal` |
| camiseta, camisa, t-shirt, tshirt, tee | `tshirt` |
| moletom, hoodie | `hoodie` |
| calça, pants | `pants` |
| nvme, m.2, sn5000 | `ssd_nvme` |
| ssd sata, 2.5 ssd | `ssd_sata` |
| ram, memória ram, memoria ram | `ram` |
| motherboard, placa-mãe, placa mae, b550, b650 | `motherboard` |
| cpu, processor, processador, ryzen | `cpu` |
| gpu, graphics card, placa de vídeo, placa de video, geforce, radeon | `gpu` |
| notebook, laptop, macbook | `laptop` |
| smartphone, iphone, celular, phone | `smartphone` |
| smartwatch, apple watch, relógio inteligente | `smartwatch` |
| teclado, keyboard | `keyboard` |
| mouse | `mouse` |
| headphone, headset, fone | `headphones` |
| controller, controle, gamepad | `controller` |

Normalize accents/case before matching. Use explicit ordered matching so `ssd nvme` beats generic `ssd`.

## Marker library and sizing

`src/components/product-category-icons/index.tsx` contains the 20 original inline SVG silhouettes and `ProductCategoryMarker`. They share a 24px viewBox, 1.5px neutral stroke, rounded joins/caps and no gradients, shadows, brand marks or bitmap dependencies. Color derives from the existing semantic tokens.

| Surface | Desktop tile | Mobile tile | SVG |
| --- | --- | --- | --- |
| Favorites Cards | 36px | 28px | 22px / 18px |
| Favorites List | 30px | 26px | 19px |
| Purchase / History | 24px; 22px at intermediate widths | 20px | 20px / 18px |
| Picker / detail sheets | 36px | 36px | 22px |

Purchase markers have no tile border/background and stay smaller than the checkbox. Markers have `aria-hidden="true"`; SVGs are not focusable. The textual product name is the semantic source. Category is never the sole carrier of critical information.

## Editorial UI

**Visor-inspired editorial illustrations** may appear sparingly on login, relevant empty states, collection covers, future landing/onboarding or branding: soft 3D objects, pastel surfaces, friendly forms, generous negative space and subtle shadows. This is a style reference, not permission to reproduce proprietary artwork or add these future features now. Never use editorial illustrations as repeated product thumbnails.

The existing orbital login uses twelve independent local assets in `public/login-visuals/`. Preserve its composition, form, motion and static reduced-motion fallback. No editorial assets or empty states were added in this refactor. See [login direction](17_LOGIN_ORBITAL_MOTION.md).

## Superseded approach

Large gray 3D/clay archetypes and the public product-render asset directory were removed. The former asset-path resolver, large-image component, rendering CSS and offline generator are no longer used. Do not recreate them. See [decision and consequences](15_DECISIONS.md#operational-category-markers--5-october-2026).

## Validation

Unit tests cover all 20 categories, accents/case, ordered NVMe matching and corrupt-key fallback. E2E checks both favorite modes at 320/390/768/1024/1440px, marker sizes, absent item images, purchase checkbox priority, persisted view preference, immutable history and drawer markers. Screenshots at 390/1440px are inspected for content hierarchy and responsive coherence.
