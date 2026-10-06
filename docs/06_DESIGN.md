# Design System

## Direction

The visual direction is intentionally a combination of:

- **Bookmark App** — primary structural reference: navigation, tabs, collection organization, separation of content, clean density;
- **Clozy Cloud Platform Component** — interaction/component polish: smoother surfaces, spacing, rounded components, states and fluidity;
- **Visor Finance** — editorial illustration language only: soft 3D, friendly shapes, pastels and whitespace, used sparingly;
- **Loti palette** — warm, restrained identity with orange as interaction accent.

Do not build an enterprise admin dashboard. The result should feel like a clean consumer SaaS/bookmark tool.

See `design/REFERENCES.md` and `design/mockups/`.

## Critical mockup note

Approved mockups still show the temporary brand name **Importa**. Implementation must replace it with **Loti**. Do not alter the approved structural/layout intent because of this branding mismatch.

## Visual ratio

Prefer roughly:

- 80% neutral surfaces/text;
- 15% primary/brand interaction color;
- 5% semantic state color.

Orange is an interaction signal, not decoration.

## Canonical palette

| Semantic role | Base color | Notes |
|---|---|---|
| brand dark | `#1C0113` | logo/brand accents, strong contrast details |
| primary | `#F77014` | CTA, active navigation, selection, FAB |
| primary hover/pressed | `#E33C08` | hover/pressed |
| text primary | `#221D21` | main typography |
| text secondary | `#433D3D` | secondary copy |
| neutral source | `#B7AEA5` | derive subdued borders/tints, do not overuse as small text |
| danger | `#A30006` | destructive actions only |
| background | warm off-white | derive token, not pure decorative orange |
| surface | white / near-white | cards, sheets, island |

Use semantic CSS variables/tokens. Do not scatter raw hex values throughout components.

## Typography

- primary typeface: **Geist**;
- fallback: sensible system sans-serif stack;
- strong but not oversized titles;
- high legibility for prices and compact metadata.

## Iconography

Use **Lucide** consistently for primary UI. Category markers use the small internal SVG library with consistent neutral strokes and optical weight; no logos, gradients, detailed renders or category colors.

## Spacing scale

Base on 4px, primarily using:

`4, 8, 12, 16, 24, 32, 40, 48`

Typical card padding: 16–20px.

## Radius guidance

- inputs: ~10px;
- buttons: ~10px;
- cards: 14–16px;
- drawers: ~16px;
- dialogs: ~18px;
- pills/chips: full/pill radius.

The UI should feel soft but not childish.

## Surfaces

- warm light page background;
- white/near-white cards;
- subtle borders;
- very restrained shadows;
- generous separation between groups;
- no large gradients, glow or glossy glassmorphism.

## Favorites view modes

Users can choose:

- **List** — denser, closest to Bookmark App structure;
- **Cards** — simple, airy cards, not ecommerce product tiles.

A persistent toggle must exist near search/filters. The setting is per user.

## Favorite visual content

Do **not** use real product photos, listing thumbnails or large 3D renders. Operational items use small functional category markers described in `07_PRODUCT_VISUALS.md`. Cards use a 36px tile (28px mobile) beside name/variation, with price, ownership and actions using the full card width. List markers are 30px (26px mobile). Purchase/History markers are 20–24px, quieter than the status control. Markers are decorative (`aria-hidden`); product names carry semantics.

## Desktop Favorites

Use approved mockup `design/mockups/favorites-desktop.png` as structural reference:

- clean sidebar;
- integrated collections;
- title/search/filter/view-mode area;
- restrained grid/list;
- visible open-product and add-to-purchase actions;
- small neutral category markers; no large image area.

## Mobile Favorites

Use `design/mockups/favorites-mobile.png`:

- strong page title;
- `Todos / Meus`;
- search + filter + list/card toggle;
- compact item rows/cards;
- rounded floating bottom navigation island;
- primary action remains easy to reach.

## Desktop Active Purchase

Use `design/mockups/purchase-desktop.png`:

- purchase title/status;
- clear progress and total;
- Todos/Pendentes/Adicionados;
- person summary strip;
- compact table/list grouped by person;
- small functional category markers;
- strong operational readability.

## Mobile Active Purchase

Use `design/mockups/purchase-mobile.png`:

- total + progress high in hierarchy;
- status tabs;
- horizontal/compact person summaries;
- item rows optimized for one-hand scanning;
- add-item action;
- same floating bottom navigation island.

## Mobile navigation island

The final mobile navigation is **not** a full-width fixed bar. It is a floating rounded white/near-white island inspired by the user-provided reference image.

Properties:

- three destinations only;
- broad rounded container;
- selected destination has its own inner pill/tint;
- icon + short label;
- strong touch targets;
- slight separation/shadow/border from content;
- safe-area aware;
- no horizontal clipping at 320–390px widths.

Reference image: `design/references/mobile-nav-island-reference.png`.

## Microinteractions

Use restrained transitions (~150–250ms) for:

- hover/focus border emphasis;
- selected segmented controls;
- list/card toggle;
- drawer slide;
- checkbox/status change;
- toast feedback.

Respect `prefers-reduced-motion`.

## Feedback

Prefer contextual toasts rather than success pages:

- `Favorito salvo`;
- `Adicionado à compra`;
- `Alterações salvas`.

## Accessibility

- visible focus;
- native buttons/inputs;
- labels for fields;
- no status conveyed by color alone;
- adequate contrast;
- keyboard-accessible dialogs/sheets;
- comfortable touch targets on mobile.

## Login editorial direction and motion

Login is an editorial surface with an approved community-orbit composition: central orange Loti box, generic portraits and local pastel shopping/favorite objects. Richer illustration and ambient motion apply here while operational surfaces use small neutral functional category markers. Desktop is split; tablet/mobile use a compact simplified scene above the clean form.

Use three independent radii/durations, alternating direction and counterrotation to keep subjects upright. The implementation uses 44/72/108 s revolutions, short focus/submitting convergence and gentle float/breathing cycles. Avoid changing animation duration mid-loop. All animation stops for reduced motion, leaving balanced static positions. The scene is decorative and never blocks or delays authentication. Exact assets, layout, states and QA: [login specification](17_LOGIN_ORBITAL_MOTION.md).

## Meu grupo and invitation acceptance

Use operational Loti typography, colors, buttons and compact rows. Group lists are separated by thin borders. Invite generation uses the existing accessible Surface/Confirm components, with a readonly selectable link and copy/share feedback. The acceptance page uses a narrow responsive form with fixed invited email, explicit password help, confirmation, visibility toggle and inline announced errors. It has no editorial assets or third-party requests.
