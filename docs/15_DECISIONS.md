# Final Decisions

This file prevents old alternatives from re-entering implementation.

## Product name

**Loti**.

## Product structure

Final primary areas:

- Favorites
- Active Purchase
- History

Collections are inside Favorites. No dashboard.

## Visual direction

- Bookmark App = structural reference;
- Clozy = component/interaction polish;
- warm orange Loti palette;
- Geist + Lucide;
- desktop sidebar;
- mobile rounded floating navigation island;
- List + Cards favorite modes;
- small functional category markers on operational items;
- sparse Visor-inspired soft 3D/pastel editorial illustrations;
- no real product photos.

## Final backend architecture — supersedes the Railway decision

Chosen:

**Next.js on Vercel + Better Auth + Drizzle SQLite dialect + Turso/libSQL through `@libsql/client`.**

This decision supersedes the earlier Railway/local-file choice below. Production uses a remote database and has no dependency on a writable application filesystem, Railway volumes, or `better-sqlite3`. Better Auth remains on the Drizzle adapter with `provider: "sqlite"`.

Reasons: keep the current cost low, preserve the SQLite schema and domain, remove persistent application storage, and support Git-based serverless deployments. Database credentials are server-only environment variables. Migrations are applied explicitly, not per request.

Rejected:

### Supabase

Powerful but unnecessary for this five-user private product. Direct browser data API/RLS, managed auth and extra platform services add concepts the MVP does not need.

### Neon/PostgreSQL

Also valid, and likely a future migration target if scaling requirements appear. Rejected for initial MVP because network database + managed auth/service setup is more infrastructure than required.

### Vercel + local production SQLite

Rejected because ephemeral function filesystems are not a shared persistent database.

### PocketBase

Very simple, but would move application architecture toward PocketBase's backend model/API. The selected Next.js + Better Auth + Drizzle stack is nearly as simple while remaining more application-controlled.

### Firebase / document DB

Rejected because the domain is naturally relational and SQL-friendly.

### Previous decision, retained as history

The earlier MVP decision used Railway + a persistent volume + `better-sqlite3`. It is no longer canonical. The switch to Vercel + Turso/libSQL removes file persistence while preserving the SQLite schema and adapter.

## Authorization

Chosen: centralized server-side authorization helpers. No RLS because the DB is never exposed directly to the browser.

## Realtime

Not needed. Explicit mutation + revalidation/refetch is sufficient.

## Product visuals

Chosen: deterministic keyword → category key → small internal inline SVG marker. Retain `visual_key` and purchase snapshots; no schema migration. Runtime AI/image generation rejected.

## History

Chosen: purchase-item snapshots. Historical records never read mutable favorite fields as their source of truth.

## Active purchase rule

Exactly one active purchase per workspace, enforced at the database level with a partial unique index and at the application level for user-friendly errors.

## Login visual direction

Chosen: editorial community-orbit composition to communicate **save → organize → buy together**. Desktop uses a split layout with a central Loti box, multiple subtle continuous orbital layers, products and people. Mobile uses fewer objects and a compact composition above the primary form. Motion includes gentle ambient loops, focus/submitting reactions and a fully static reduced-motion fallback.

Use separate local pastel editorial assets. Preserve Better Auth and the existing form behavior. Reject a lone centered card, ecommerce storefront, mascot, video background, heavy 3D/WebGL and animation-delayed login. Detailed contract: [17_LOGIN_ORBITAL_MOTION.md](17_LOGIN_ORBITAL_MOTION.md).

## Operational category markers — 5 October 2026

Previous approach: large gray 3D/clay archetype for each product. Superseded because its excessive visual weight made repeated cards noisy, reduced information density and competed with product name, price and actions.

Decision: Favorites, Purchase, History and item drawers use small neutral **functional category markers**, drawn as original vector silhouettes. Classification is deterministic and stored in existing `visual_key` fields; no database migration. Unknown keys use a generic marker. Text and purchase status carry meaning; category markers are decorative.

Editorial direction: reserve **Visor-inspired editorial illustrations** (soft 3D, pastels, friendly shapes, whitespace, subtle shadows) for sparse branding surfaces such as existing login or appropriate empty states/collection covers. This does not add new features or require new illustrations now.

Consequences: cleaner operational UI, faster scanning, fewer assets, simpler maintenance and clear separation of functional and decorative imagery. Removed the twenty public operational renders, offline generator, asset-path resolver, large visual component and obsolete rendering CSS. Login remains independent and unchanged. Bookmark/Clozy structure, palette, navigation, business rules and historical data remain intact.

## Private group invitations — 5 October 2026

Approved extension: any member can invite through Profile → Meu grupo → email → generated link → manual sharing. New people define credentials in the token-gated acceptance page; existing accounts authenticate with the invited email. Links expire in seven days, are single-use, and may be revoked/regenerated. No role system, automated email delivery, member removal or workspace switcher is introduced. Public signup remains disabled. Acceptance atomically creates credentials where needed, adds membership, selects the invited workspace and consumes the invitation. Details: `18_WORKSPACE_INVITATIONS_PLAN.md`.

## Purchase cost sharing — 7 October 2026

One purchase row represents one physical product regardless of how many people share its cost. Store participant composition in `purchase_item_participants`; retain `purchase_items.person_id` only as a compatibility mirror of the first participant. Support equal shares, percentages in integer basis points, and fixed integer-cent amounts. Physical purchase totals, quantity and progress count each row once; each person's summary uses their allocated share. Participants are explicitly selected and ordered, and item status/edit/removal are shared across their groups. Active-purchase mutations and participant writes are atomic; finalized records remain read-only. This extension allocates cost only and adds no stock, resale, payments, revenue, profit, freight or tax behavior. Detailed rounding, editing and migration contract: `20_PURCHASE_COST_SHARING_PLAN.md`.

## Profile editing — 6 October 2026

Chosen: one **Nome completo** field stored in Better Auth's existing `user.name`, plus a separate password form. No name-part migration is needed; existing surfaces already resolve identity by user ID. The native Better Auth update/password endpoints remain the only credential-writing path. Path-scoped hooks enforce membership, strict profile payloads and trusted origin; password changes force revocation of other sessions and let Better Auth rotate the current session. No email editing, password recovery, avatar upload or historical identity snapshots are included. Implementation contract: `19_PROFILE_EDITING_PLAN.md`.
