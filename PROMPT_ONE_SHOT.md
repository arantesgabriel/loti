# LOTI — ONE-SHOT MVP IMPLEMENTATION PROMPT

You are the primary implementation agent responsible for building the complete Loti MVP in this repository from the current repository state through a production-ready codebase.

Do not treat this as a brainstorming task. Product, UX and architecture decisions have already been made. Your job is to **implement the specification faithfully, validate it continuously, and finish the MVP**.

---

## 0. Mandatory preparation

Before changing code, read all canonical files in this order:

1. `AGENTS.md`
2. `docs/00_CONTEXT.md`
3. `docs/01_PRODUCT.md`
4. `docs/02_MVP_SCOPE.md`
5. `docs/03_BUSINESS_RULES.md`
6. `docs/04_USER_FLOWS.md`
7. `docs/05_INFORMATION_ARCHITECTURE.md`
8. `docs/06_DESIGN.md`
9. `docs/design/REFERENCES.md`
10. `docs/design/MOCKUPS.md`
11. `docs/07_PRODUCT_VISUALS.md`
12. `docs/08_TECHNICAL_ARCHITECTURE.md`
13. `docs/09_DATABASE_SCHEMA.md`
14. `docs/10_IMPLEMENTATION_PLAN.md`
15. `docs/11_ACCEPTANCE_CRITERIA.md`
16. `docs/12_TEST_PLAN.md`
17. `docs/13_DEPLOYMENT.md`
18. `docs/14_LEGACY_MIGRATION.md`
19. `docs/15_DECISIONS.md`
20. `docs/16_HUMAN_INPUTS.md`
21. `docs/17_LOGIN_ORBITAL_MOTION.md`

Then inspect the existing repository before making assumptions.

The approved mockups are:

- `docs/design/mockups/favorites-desktop.png`
- `docs/design/mockups/favorites-mobile.png`
- `docs/design/mockups/purchase-desktop.png`
- `docs/design/mockups/purchase-mobile.png`

Important: the approved mockups were produced before the final name was chosen and display **Importa**. The product name is **Loti**. Use Loti everywhere in the implementation.

---

## 1. Mission

Build Loti, a private collaborative responsive web application for a small group that:

- keeps personal product favorites visible to the group;
- organizes favorites into personal collections;
- moves favorites into one shared active purchase without copy/paste;
- supports manual purchase-only items;
- calculates purchase totals by person and overall;
- tracks whether each purchase item has already been added to the real HubBuy cart;
- finalizes purchases into immutable history;
- replaces the existing spreadsheet workflow.

The first production workspace has five trusted users, but domain logic must not hardcode their identities.

---

## 2. Frozen stack

Use this stack unless an already-existing repository dependency makes an equivalent minor adjustment strictly necessary:

- Next.js
- TypeScript with strict mode
- Tailwind CSS
- shadcn/ui as component foundation
- Geist typography
- Lucide icons
- Better Auth with email/password
- Drizzle ORM
- SQLite schema dialect via Drizzle, running on Turso/libSQL through `@libsql/client`
- Zod
- React Hook Form where useful
- Playwright
- Node 24 LTS-compatible package versions
- npm scripts
- Vercel production deployment
- Turso/libSQL production database

Do **not** use:

- Supabase
- Neon
- PostgreSQL
- Firebase
- PocketBase
- Prisma
- Clerk
- Auth.js/NextAuth instead of Better Auth
- a separate backend service
- browser-direct database access
- RLS
- realtime/websockets

---

## 3. Runtime architecture

Implement a single Next.js application.

Browser → Next.js on Vercel → Better Auth session → centralized authorization → Zod validation → Drizzle's SQLite dialect → `@libsql/client` → Turso/libSQL.

Production database credentials are `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; keep them server-only. Local development and tests may use a file-backed or in-memory libSQL database through the same client. Production must not depend on a local writable file or persistent application volume.

Database calls are asynchronous. Migrations are versioned and applied explicitly before deployment; never run migrations in a request lifecycle.

All sensitive reads/mutations are server-side. The client must never receive a raw database connection or bypass authorization helpers.

---

## 4. Authentication

Implement Better Auth email/password.

Required:

- `/login`;
- protected application routes;
- persistent session;
- logout;
- no public signup flow;
- operator script/command to create an initial user and add that user to the singleton workspace;
- development seed users may use safe clearly-dev-only credentials.

Create centralized authorization helpers such as:

- `requireUser()`
- `requireWorkspaceMember()`
- `requireFavoriteOwner()`
- `requireCollectionOwner()`
- `requireActivePurchase()`
- `requireEditablePurchase()`

Do not duplicate authorization logic across components/actions.

---

## 5. Database

Follow `docs/09_DATABASE_SCHEMA.md` exactly in intent.

Application tables:

- workspaces
- workspace_members
- collections
- favorites
- purchases
- purchase_items
- user_preferences

Better Auth owns its required user/session/account/verification schema.

Use text IDs generated application-side for app entities. Reference Better Auth user IDs as strings.

Money is integer cents.

Important constraints:

- workspace member pair unique;
- favorite price >= 0 when present;
- quantity >= 1;
- allowed QC/status/view values constrained;
- `collection_id` deletion sets null;
- `source_favorite_id` deletion sets null;
- only one `active` purchase per workspace using a partial unique index;
- do not persist subtotals, totals or progress.

Migrations must work against an empty DB.

---

## 6. Domain behavior

### Favorites

A favorite:

- belongs to one owner;
- is visible to all workspace members;
- can only be edited/deleted by its owner;
- requires name + URL;
- has optional price, variation/model, notes and collection;
- has QC state: not_reviewed / approved / rejected;
- derives platform from URL;
- stores original URL unchanged;
- optionally stores a canonical product key for duplicate detection;
- warns on likely duplicate but never blocks saving;
- has no quantity.

All members may add another person's favorite to the active purchase.

### Collections

- personal ownership;
- visible to group;
- owner-only rename/delete;
- zero or one collection per favorite;
- deleting collection sets affected favorites to no collection.

### Purchase

- exactly one active purchase per workspace;
- optional HubBuy account/email metadata;
- all workspace members collaborate on active purchase;
- any member may create/edit/remove active-purchase items and finalize the purchase;
- finalized purchase is immutable server-side and UI read-only;
- no reopen feature.

### Purchase item

- may originate from favorite or be manual;
- `person_id` means who item is for;
- `created_by` means who added it;
- favorite→purchase creates a snapshot of display fields;
- default person = favorite owner, editable;
- default quantity = 1;
- default price/variation may copy favorite values, editable;
- price may be null;
- null price displays `Preço pendente`, not zero;
- cart status = pending/added;
- manual item does not become favorite automatically;
- do not auto-merge duplicate rows.

### Calculations

`subtotal = quantity * unit_price_cents` when price exists.

Purchase total = sum of priced subtotals.

Person total = sum of that person's priced subtotals.

Progress is quantity-weighted:

`sum(quantity of added rows) / sum(quantity of all rows)`.

If no items, present an appropriate zero/empty state rather than NaN.

### Finalization

Before finalizing, detect:

- pending items;
- no-price items.

Show warnings and explicit confirmation, but do not hard-block. Then set purchase finalized/read-only and expose it in History.

---

## 7. Platform detection and URL normalization

Implement centralized helpers.

Recognize at least:

- HubBuy
- Weidian
- Taobao
- 1688
- Goofish
- Shopee
- Shein
- Other

Keep original URLs for opening.

Canonicalization is only for duplicate comparison. Safely strip/ignore known tracking/referral noise where possible. If reliable product identity cannot be determined, use a conservative normalized URL or null canonical key rather than inventing identity.

---

## 8. Product visual system

Never show real marketplace/listing photos.

Implement the functional category marker and separate editorial illustration system in `docs/07_PRODUCT_VISUALS.md`.

Minimum keys:

- generic
- sneaker
- clog
- sandal
- tshirt
- hoodie
- pants
- ssd_nvme
- ssd_sata
- ram
- motherboard
- cpu
- gpu
- laptop
- smartphone
- smartwatch
- keyboard
- mouse
- headphones
- controller

Implement `resolveProductCategory(name)` with normalized case/accent handling and ordered keyword rules.

Store category keys in the existing `visual_key` on favorites and independent purchase-item snapshots; do not rename the column merely for aesthetics.

Use the internal inline SVG library in `src/components/product-category-icons/`: consistent neutral stroke/fill, small size, no brand, gradient or large shadow. Cards have a 36px marker tile (28px mobile), List 30px (26px mobile), Purchase/History 20–24px, smaller than status controls. Keep names and values primary. Markers are decorative (`aria-hidden`), never extra keyboard stops. Drawers use the same system.

Never use real thumbnails, large product images or generic 3D product renders in operational cards/lists. No public operational render directory, image APIs, runtime generation or per-item upload. Unknown or corrupt key → generic inline SVG marker.

Reserve Visor-inspired editorial illustrations (soft 3D, pastel, friendly, spacious, subtle shadows) for sparse branding surfaces such as existing login, suitable empty states or collection covers; do not add future landing/onboarding features merely for imagery.

---

## 9. Information architecture

Primary destinations only:

- Favorites
- Purchase
- History

Profile/logout via avatar.

Collections live inside Favorites.

Routes:

```text
/login
/favorites
/purchase
/history
/history/[purchaseId]
/profile
```

Use Sheets/Drawers for object creation/editing/details and Dialogs for short confirmations. Do not create unnecessary CRUD pages.

---

## 10. Design implementation

The approved visual hierarchy is mandatory.

### Inspiration roles

- Bookmark App = primary structure/navigation/collections/content density.
- Clozy = component polish, spacing, rounded surfaces, fluid states.
- Loti palette = identity.

Read exact source URLs in `docs/design/REFERENCES.md`.

Do not hotlink or import design assets from Figma. Rebuild with our own code/components.

### Palette

Semantic base colors:

- brand dark `#1C0113`
- primary `#F77014`
- primary hover `#E33C08`
- text primary `#221D21`
- text secondary `#433D3D`
- neutral source `#B7AEA5`
- danger `#A30006`
- warm off-white background
- white/near-white surfaces

Centralize as design tokens/CSS variables.

### General style

- clean, warm, minimal;
- neutral surfaces dominate;
- orange only for interaction/selection emphasis;
- subtle borders/shadows;
- generous but efficient spacing;
- no analytics dashboard look;
- no glassmorphism/glow-heavy styling;
- Geist;
- Lucide for primary UI; original consistent inline SVGs for category markers;
- ~150–250ms restrained transitions with reduced-motion support.

### Login — editorial community orbit

Follow `docs/17_LOGIN_ORBITAL_MOTION.md` and `docs/design/mockups/login-orbital.png`.

- desktop split: illustrated scene left, simple private login form right;
- central orange Loti box; generic people and shopping/favorite objects in at least three orbital layers;
- different radii, durations and directions; counterrotation keeps objects upright;
- soft local pastel illustration assets separate from operational functional category markers;
- subtle float/breathing motion and focus/submitting convergence, without timing jumps or delayed redirects;
- tablet/mobile: simplified compact scene above the form, fewer objects, no horizontal overflow;
- `prefers-reduced-motion`: fully static, balanced equivalent;
- decorative scene is `aria-hidden`, has no keyboard stops and cannot interfere with login;
- preserve Better Auth, React Hook Form, validation, errors, Enter, loading, sessions and logout;
- no public signup, mascot, video, Three.js/WebGL, runtime generation or new animation dependency when CSS suffices.

The editorial scene may use orange for the central symbol and pastel object backplates. The operational palette remains unchanged and product items use the small functional category-marker system.

### Favorites

- title + add action;
- Todos / Meus;
- a single segmented control for `Todos` / `Meus`, visually distinct from individual member cards, with a full-option selection fill that moves smoothly between all options; person cards show avatar, full name and favorite count; the row scrolls horizontally on narrow screens and honors reduced-motion preferences; do not show an `Outras pessoas` segment;
- on mobile, use a lower-right floating plus for new favorites and a brief reduced-motion-aware cue beside the first person card to suggest horizontal scrolling;
- search;
- compact filters;
- List/Cards toggle;
- collections integrated;
- small neutral functional category markers with no large image header;
- name, variation, price, owner, platform;
- Abrir produto and + Compra actions;
- notes stay primarily in detail surface.

List/card view is a per-user preference persisted in `user_preferences`.

### Desktop shell

- clean left sidebar;
- Favorites / Purchase / History;
- collections shown contextually with Favorites;
- profile at bottom.

### Mobile shell

Use the approved **rounded floating navigation island**, not a full-width bottom bar.
Keep it compact. Show each destination icon, show the short label only for the selected destination, and animate a full-size selection fill between items.

Three items only:

- Favorites
- Purchase
- History

Selected item uses its own inner rounded pill/tint. Ensure safe-area spacing and large touch targets.

### Mockup QA

Use:

- `docs/design/mockups/favorites-desktop.png`
- `docs/design/mockups/favorites-mobile.png`
- `docs/design/mockups/purchase-desktop.png`
- `docs/design/mockups/purchase-mobile.png`

Large operational product renders in the mockups are superseded by small functional category markers. Validate both Cards and List at 390/1440px plus compact Purchase/History; keep navigation, palette and macro layout. Generated-image textual details may contain accidental inconsistencies; preserve the canonical product/domain rules from the docs while matching layout, hierarchy and feel.

---

## 11. Favorites feature

Implement:

- Todos/Meus;
- search over name/variant/notes;
- filters: person, platform, collection, QC, price presence;
- newest-first default ordering;
- list/cards toggle;
- persisted view preference;
- create favorite Sheet;
- progressive disclosure: link/name/price first, optional details behind “Mais detalhes” or equivalent;
- detail Sheet;
- edit own favorite;
- delete own favorite with confirmation;
- duplicate warning;
- platform badge;
- owner display;
- QC state;
- small decorative category marker;
- Abrir produto;
- + Compra.

Mutations must provide user-friendly feedback/toasts and revalidate appropriate data.

---

## 12. Collections feature

Implement inside Favorites:

- create;
- rename;
- delete with confirmation that favorites remain;
- filtering/navigation;
- owner-only mutation permissions.

No separate top-level Collections page.

---

## 13. Active Purchase feature

When none exists:

- show empty state;
- allow create purchase;
- suggest `Compra <Mês>/<Ano>` based on current locale/date;
- name remains editable;
- HubBuy account optional.

Active purchase page must show:

- purchase name/status;
- unit count;
- people count;
- HubBuy account if defined;
- estimated total;
- progress;
- Todos / Pendentes / Adicionados;
- status filters use compact selection cards and the same full-fill sliding animation as the Favorites people selector;
- person summary strip/cards;
- items grouped by person;
- desktop: place `Adicionar item` immediately to the right of the purchase three-dot options menu; mobile: use a separate floating plus button at the lower right.

Item rows show:

- pending/added control;
- small neutral category marker, less prominent than status;
- name/variation;
- quantity × price;
- subtotal or pending-price state;
- open product;
- item menu/edit.

Add-item flow:

1. choose `Dos favoritos` or `Manual`;
2. if from favorite, search/select one;
3. fill/adjust person, variation, quantity, unit price, notes;
4. save snapshot.

All active-purchase members can edit/remove rows.

---

## 14. History

`/history` shows finalized purchases newest first with useful summary.

`/history/[purchaseId]` reuses purchase display components in read-only mode.

Do not show mutation controls for finalized purchases. Server must reject them even if called directly.

---

## 15. Legacy migration

Source workbook:

`legacy/source/Favoritos_Hubbuy_original.xlsx`

Implement:

`scripts/import-legacy-spreadsheet.ts`

The script is operator tooling, not product UI.

Follow `docs/14_LEGACY_MIGRATION.md`.

Requirements:

- inspect workbook structure robustly;
- map known favorite owners/collections;
- map purchases;
- preserve original URLs and nullable prices;
- map legacy person names to actual created users via operator-supplied mapping;
- avoid silently inventing data;
- be idempotent;
- provide a useful summary/report;
- repeated execution must not duplicate imported data.

Do not automatically assume `Compra Out26` is still active at runtime; this requires operator confirmation/mapping at migration execution.

---

## 16. Seed/operator tooling

Provide predictable scripts such as:

```text
npm run db:generate
npm run db:migrate
npm run db:seed
npm run user:create -- ...
npm run import:legacy
```

Exact CLI syntax can be improved, but it must be documented and easy to execute.

Development seed should populate a representative workspace, users and sample products similar to the mockups without using production secrets.

---

## 17. Tests

Implement and run the plan in `docs/12_TEST_PLAN.md`.

Mandatory unit coverage:

- detectPlatform
- URL normalization/canonical key behavior
- category resolver, all initial categories, corrupt-key fallback and ordered NVMe matching
- money helpers
- subtotal/person/purchase total
- progress calculations

Mandatory integration coverage:

- workspace membership
- favorite ownership
- collection ownership
- single active purchase
- snapshots
- deleting favorite with purchase snapshot
- finalized-purchase immutability
- quantity/price constraints

Mandatory Playwright flows:

1. Gabriel-like user logs in, creates/finds/edits favorite.
2. Another member can view but cannot edit it.
3. Favorite → purchase → quantity/price → totals.
4. One user adds an item for another person.
5. Pending → Added changes progress/filter.
6. Finalize → History → read-only.
7. List/Cards preference persists.
8. Mobile rounded navigation island works.
9. Login split/compact layouts, orbital orientation, focus/loading/error, Enter, session/logout and static reduced motion work at 390/768/1024/1440 px.

Use test users, not production credentials.

---

## 18. Vercel + Turso production readiness

Prepare the repository for Vercel and Turso:

- Next.js project deploys from the GitHub repository at its root;
- `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are server-only variables;
- production uses an isolated Turso database; Preview uses development data;
- Better Auth uses `BETTER_AUTH_URL` and a strong server-side `BETTER_AUTH_SECRET`;
- migrations are applied explicitly to Turso before dependent code is deployed;
- `/api/health` checks application/database reachability without leaking sensitive data;
- document Turso backup/restore expectations;
- no secrets or private workbook data are committed.

Use already-authenticated Vercel/Turso sessions or a CLI that is already authenticated. Complete all repository-side work and report a concrete external permission blocker only when necessary.

---

## 19. Non-goals — do not implement

Even if they seem useful, do not add:

- scraping;
- automatic product metadata retrieval;
- real product images;
- runtime AI;
- HubBuy API integration;
- shipment tracking;
- freight/weight/tax calculations;
- RMB currency conversion;
- payments;
- notifications;
- comments/chat;
- realtime/websockets;
- admin dashboard;
- public signup;
- social auth;
- MFA;
- multiple workspace UI;
- tags many-to-many;
- bulk favorite-to-purchase flow;
- PWA/native app;
- spreadsheet import UI;
- re-opening finalized purchases;
- analytics dashboard.

Do not expand scope merely because a library makes a feature easy.

---

## 20. Implementation sequence

Follow these phases in order:

1. Foundation
2. Database
3. Authentication/authorization
4. App shell/design tokens
5. Favorites
6. Collections
7. Active Purchase
8. History
9. Complete product visual system
10. Legacy migration
11. QA and production readiness

You may implement a small dependency from a later phase earlier when necessary (e.g. visual resolver while building Favorites), but preserve the overall sequence and gates.

After every major phase:

- run typecheck;
- run lint;
- run relevant tests;
- fix failures;
- keep the app buildable.

Do **not** stop for approval between phases.

---

## 21. Stop conditions

Continue autonomously unless you encounter a true human-only blocker, such as:

- a required Vercel/Turso account permission or explicit confirmation to create scoped database credentials or grant repository access;
- production user emails/passwords;
- missing workbook owner/status mappings required for a production import;
- operator decision whether a stale legacy purchase should be active or historical.

If blocked:

1. finish all work not dependent on the blocker;
2. leave the repository in a passing state;
3. document the exact missing human input and exact next command/action;
4. do not invent production identities or claim data was migrated when it was not.

Ordinary bugs, test failures, UI decisions already in docs, and missing real product images are **not** blockers.

---

## 22. Required completion checks

Before declaring the MVP complete, verify:

- TypeScript strict passes;
- lint passes;
- unit tests pass;
- integration tests pass;
- required Playwright E2E tests pass;
- production build passes;
- empty database migrations pass;
- development seed works;
- user-create/operator tooling works;
- isolated local libSQL migrations and tests pass;
- production runtime connects to Turso and does not depend on a local database file;
- production server fails closed when the Turso URL or remote database token is missing;
- no public signup;
- no client DB access;
- server authorization prevents forbidden mutations;
- only one active purchase can exist;
- finalized purchases cannot mutate;
- legacy import is idempotent;
- no real product photos are used;
- Loti branding replaces Importa;
- four primary screens match approved visual hierarchy;
- mobile navigation is the rounded floating island;
- List/Cards preference persists.

---

## 23. Final Definition of Done

The MVP is functionally done only when this entire scenario works without the spreadsheet:

1. user logs in;
2. user saves a favorite from a marketplace link;
3. another member sees it but cannot edit it;
4. favorite has a small neutral category marker and dominant textual content;
5. favorite is added to the active purchase;
6. person, price, variation and quantity are configured;
7. other members add their items;
8. totals and progress are correct;
9. group filters pending items on buying day;
10. group opens each original product link and marks it Added after placing it in HubBuy;
11. purchase reaches completion or is explicitly finalized with warnings;
12. purchase moves to immutable history;
13. favorite edits do not alter history;
14. a new active purchase can be created.

---

## 24. Final report

When finished, provide a concise but complete final report with:

### Implemented

Features completed by domain.

### Architecture

Actual final stack/structure and any justified minor deviation.

### Database

Migrations/schema/SQLite location and commands.

### Authentication

How operator creates initial users and how production auth is configured.

### Tests

Report actual results/counts for unit, integration and E2E suites plus build/type/lint status.

### Legacy migration

Exact command, mapping inputs and result/report behavior.

### Deployment

Actual Vercel project, Turso database, migration, environment, deployment and URL status. Report only completed actions; identify concrete blockers and remaining operator inputs.

### Known limitations

Only real MVP limitations, not invented future work.

### Post-MVP suggestions

Optional short list only. Do not implement them during this task.

Proceed now. Read the canonical docs first, inspect the repository, implement the phases continuously, test aggressively, and stop only for a genuine human-only blocker.

## Private group invitations — approved extension

Members may invite people through Profile → Meu grupo → email → generated link. Links last seven days, are email/workspace-bound and single-use; all members may revoke or regenerate pending invitations. Signup remains disabled on the public Better Auth handler; invited account creation runs only after server validation of the token, inside the account/membership/consumption transaction. Existing accounts must authenticate with the invited email and retain their password. The accepted workspace becomes the user's active context, without deleting existing memberships. No automatic email delivery, member removal, role management or workspace switcher is included. See `docs/18_WORKSPACE_INVITATIONS_PLAN.md`.

## Profile editing — approved extension

Profile lets each authenticated workspace member change their complete display name (`user.name`) and separately change their password. Name accepts 1–200 characters after edge trimming; email is read-only. Password change requires current password, 12–128 character new password, exact confirmation, rejects immediate reuse, and forces revocation of all other sessions while preserving the current device through Better Auth's rotated cookie. Enforce session, membership, trusted origin and strict self-only payload rules in hooks on the native `/update-user` and `/change-password` endpoints. Keep the three existing primary destinations and Meu grupo/logout actions. No migration, email change, avatar upload, recovery flow or historical identity snapshots. See `docs/19_PROFILE_EDITING_PLAN.md`.
