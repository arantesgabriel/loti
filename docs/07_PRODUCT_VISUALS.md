# Product Visual Archetype System

## Goal

Provide useful visual recognition without scraping or displaying the actual marketplace product.

Example:

- `WD Blue SN5000 SSD NVMe` → generic grayscale 3D/clay NVMe silhouette;
- `Nike Vomero 18` → generic grayscale 3D/clay sneaker silhouette;
- `Camiseta Uniqlo` → generic grayscale 3D/clay T-shirt silhouette.

The visual communicates **shape/category**, not brand, exact model, colorway or listing content.

## Non-goals

- no runtime AI generation;
- no scraping image URLs;
- no hotlinking marketplace thumbnails;
- no brand logos;
- no exact replication of a commercial product;
- no per-item image uploads in MVP.

## Implementation model

A deterministic function:

```ts
resolveProductVisual(name: string): ProductVisualKey
```

returns a stable local archetype key saved to `visual_key`.

Recalculate `visual_key` when a favorite/purchase item's name is intentionally changed. Purchase-item snapshots otherwise remain independent.

## Initial archetypes

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

## Asset requirements

Preferred production assets:

- local files under `/public/product-visuals/`;
- grayscale / light gray clay render;
- transparent or neutral background;
- consistent camera angle and lighting;
- no branding;
- optimized WebP or SVG/PNG as appropriate.

A coding agent without image-generation capability may initially create clean monochrome pseudo-3D SVG archetypes as local assets, but must preserve the exact contract and file/key structure so higher-fidelity renders can replace them later without component changes.

## Fallback

Unknown items use `generic`, a neutral 3D package/object form. Never show a broken image.

## Editorial login assets

The grayscale resolver/archetype contract above applies to operational product rows and cards. Login is a distinct editorial surface, permitted to use pastel object backplates, soft dimensional SVGs and generic illustrated community portraits. Its twelve local assets live under `/public/login-visuals/`; they are independent from resolver keys and never replace historical purchase visuals. No real listing photos, brand marks, external image dependency or runtime generation. See [login direction](17_LOGIN_ORBITAL_MOTION.md).
