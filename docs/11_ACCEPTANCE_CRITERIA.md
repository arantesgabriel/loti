# Acceptance Criteria

## Authentication

- unauthenticated protected-route visit redirects to login;
- valid user can log in with email/password;
- session survives normal navigation/reload;
- logout invalidates session;
- no public signup CTA/route is exposed as a supported product flow;
- users outside the workspace cannot read workspace data.
- workspace members can update their own trimmed 1–200 character display name; the email remains read-only;
- profile names update in the sidebar and current-user surfaces without logging out and persist across reload/login;
- name mutation rejects invalid, extra and alternate-user payload fields at the native Better Auth endpoint;
- password change requires the current password, 12–128 character new password and exact confirmation; spaces are preserved;
- immediate password reuse is rejected, the current device remains signed in, and every other session becomes invalid;
- the old password stops authenticating and the new password authenticates;
- unauthenticated, nonmember and untrusted-origin profile mutations are rejected; profile forms remain keyboard-accessible and responsive.

## Favorites

- authenticated member can create a favorite with only name + valid URL;
- owner is always current user on creation;
- optional price can be empty;
- platform is detected from URL;
- canonical duplicate check may warn but user can save anyway;
- all workspace members can view favorite;
- non-owner cannot edit/delete it via UI or server action;
- owner can edit/delete it;
- delete does not destroy purchase snapshots;
- `Todos` and `Meus` are correct;
- Favorites has no `Outras pessoas` segment; `Todos` / `Meus` form a single segmented control distinct from member cards; its full-option selection fill moves smoothly (unless reduced motion is requested); person cards show avatar, full display name and favorite count and filter results to the selected member;
- on mobile, the new-favorite action is a lower-right floating plus; the horizontal people rail gives a brief scroll cue and suppresses it for reduced motion;
- search covers name/variant/notes;
- filters combine correctly;
- list and cards both work;
- selected view mode persists after reload/new session;
- external link opens original stored URL;
- category always resolves to a small neutral vector marker/generic fallback;
- name, variation and price dominate; Cards have no large image header;
- markers are decorative and hidden from assistive technology.

## Collections

- user can create/rename/delete own collection;
- other members can see collection but not mutate it;
- favorite can have zero or one collection;
- deleting collection leaves favorites intact and uncollected;
- selecting collection filters Favorites.

## Purchase creation

- when none active, user can create a purchase;
- name may be prefilled `Compra <Mês>/<Ano>` but remains editable;
- HubBuy account is optional;
- creating a second active purchase is rejected safely even under concurrent attempts.

## Purchase items

- active purchase shows separate all, pending, and added totals in a horizontal carousel, navigable by dragging/swiping, keyboard, arrows, or position controls;
- favorite rows show a direct edit icon for the current user's favorites; a favorite already in the active purchase is marked `Na compra` and returns to the normal `Compra` action after its purchase item is removed;
- desktop active purchase has separate `Editar compra` and `Finalizar compra` buttons; a floating plus appears only while the heading `Adicionar item` action is outside the viewport;
- mobile retains the three-dot purchase menu and separate floating plus button;
- any member can add any visible favorite to active purchase;
- person defaults to favorite owner and can be changed;
- favorite price/variation are suggestions and can be changed;
- item snapshot is independent after creation;
- manual item can be created without a favorite;
- manual item does not create a favorite automatically;
- quantity minimum 1 enforced server-side;
- price may be null;
- null price renders `Preço pendente`;
- subtotal = quantity × unit price;
- totals are mathematically correct;
- different variations remain separate rows;
- duplicate rows are not silently merged;
- any member can edit/remove items while purchase active;
- `pending ↔ added` toggle is one-step;
- Todos/Pendentes/Adicionados filters work;
- Purchase status filters use equal, compact selection cards with the full sliding selection animation and preserve their filtering behavior;
- progress is quantity-weighted.
- one physical row can appear under all selected participants without multiplying the overall total, physical units or progress;
- each member sees their allocated cost and a clear shared-item indicator;
- equal, percentage (basis points summing to 100%), and fixed-cent allocations close exactly, including deterministic remainder cents;
- participant selection is explicit, unique, and limited to workspace members; personal items default to the favorite owner or current user;
- invalid compositions and fixed shares without a price fail server-side without partial writes;
- status changes from one participant's group affect all groups; bulk status includes shared items and the UI explains this effect;
- deleting a shared product confirms that it is removed for everyone, while removing one participant preserves the physical item;
- price/quantity and participant edits follow the recomposition rules in [the cost-sharing plan](20_PURCHASE_COST_SHARING_PLAN.md);
- old purchases backfill to one equal participant and historical shares remain immutable after finalization.

## Finalization/history

- finalization warns about pending and no-price items;
- user can still explicitly finalize;
- status becomes finalized and timestamp is stored;
- purchase appears in History;
- historical detail is read-only;
- server rejects post-finalization item/purchase mutations;
- editing/deleting source favorite later does not alter historical display data;
- when active purchase is finalized, a new active purchase may then be created.

## Design/responsiveness

- product branding says `Loti`, not `Importa`;
- desktop structure follows Bookmark App-inspired approved mockups;
- components/interactions reflect Clozy-inspired polish without visual clutter;
- mobile uses a compact rounded floating navigation island with a full-size animated selection fill; only the active destination shows its label;
- navigation has Favorites, Purchase, Pacotes e custos and History; the selected package label is `Pacotes`;
- cards/list toggle exists;
- operational cards/lists display no real product photos, listing thumbnails or large 3D product renders; only the explicitly opened, authorized QC gallery/viewer may show validated `freePhotos`, with the separately authorized Phase 3 exception limited to the selected shared QC cover/private preview on product cost lines/cards in Pacotes e custos;
- operational item lists/cards, purchase/history and drawers use consistent small functional category markers;
- sparse Visor-inspired illustrations are reserved for editorial/branding surfaces;
- purchase markers remain smaller and quieter than pending/added controls;
- layout has no page-level horizontal overflow at 390px and remains usable down to 320px where practical;
- desktop is polished around 1440px;
- focus and keyboard interaction are usable;
- status is not conveyed by color alone.

## Technical

- TypeScript strict passes;
- lint passes;
- production build passes;
- migrations run on empty DB;
- seed works in development;
- tests pass;
- migrations run against a fresh local libSQL database and the remote Turso database;
- production Next.js runtime on Vercel uses Turso/libSQL, not a local file;
- production has no filesystem-persistence or one-replica requirement;
- no secrets committed;
- browser cannot directly query DB;
- critical authorization is server-enforced.

## Overall MVP DoD

A group can do the entire workflow without the legacy spreadsheet:

`login → save favorite → another member sees it → add to purchase → collaborate → mark HubBuy items added → finalize → inspect immutable history → create next purchase`.

## Login editorial community orbit

- desktop has a clear illustrated-scene/form split and central Loti box;
- shopping/favorite objects and generic community portraits orbit continuously in at least three distinct layers with varied speed/direction;
- subjects remain upright throughout a revolution; ambient motion stays subtle;
- focus/submitting feedback is restrained and never delays authentication;
- tablet/mobile use a smaller scene with fewer objects and primary form hierarchy;
- no horizontal overflow at 390/768/1024/1440 px; 320 px remains usable;
- reduced motion stops loops/transitions and preserves a balanced static composition;
- scene is decorative (`aria-hidden`) with no keyboard stops;
- wrong-password feedback, Enter, loading, redirect, persistent session and logout retain behavior;
- no real product imagery, public signup, mascot, heavy 3D or runtime asset generation.

Exact implementation contract: [17_LOGIN_ORBITAL_MOTION.md](17_LOGIN_ORBITAL_MOTION.md).

## Private invitations

- Members generate/share invitation links without a terminal and see pending invitations.
- New users create credentials, join the invited group and land on Favorites.
- Existing users authenticate with the invited email; credentials and prior data are preserved.
- Wrong-email sessions cannot accept; account switching preserves the invitation destination.
- Expired/revoked/replaced/used links cannot grant access.
- Concurrent acceptance/revocation/issuance cannot produce duplicate accounts, links or memberships.
- Failed membership creation rolls back account, credential and invitation consumption.
- Public signup and authorization of existing data remain intact; the approved four primary navigation destinations are preserved.

## Packages and costs extension

- Finalizing a new purchase atomically creates one open cost follow-up; old final purchases require an explicit, idempotent start action.
- Effective price and China freight changes affect only the cost follow-up, not purchase/favorite snapshots. Null, zero and no-charge values remain distinct.
- Product charge uses one method per purchase; Brazil freight uses a method per package; customs never has a transaction fee. Stored fees retain their captured basis points when workspace defaults change.
- Package allocations cover each physical unit at most once; freight/customs and proportional fees distribute exactly in cents by stable order. Overall units/costs count each product once; personal totals show shares.
- Payment, value and manual logistics states are separately labeled. Unknown bases cannot be marked paid; no-charge customs resolves without a payment.
- Only fully allocated follow-ups with resolved product bases and all charges paid/no-charge may close. Closed follow-ups reject every mutation until a confirmed, reasoned reopening. Purchase history remains read-only throughout.
- Desktop uses the financial table and package list; payment Surfaces preview base + fee + total; mobile uses compact rows and contextual details with no horizontal page overflow.

## Product refunds

- Requested cancellation removes only explicitly selected eligible units from package contents; the original purchase item and quantity are unchanged.
- Requested values remain separate from received values. Only confirmed receipt changes liquid cost; original product base, payment status/date/method and captured fee remain identical.
- Component and per-person credits reconcile with original shares to the cent, with no negative member share. Package charges reset only for explicitly affected packages and with confirmation.
- Requested refunds block closure. Corrections and voids require reason and audit event; voided units return unassigned and do not restore sent package contents.
- The additive migration preserves existing paid costs and historical snapshots and creates no refund records automatically. Full acceptance matrix: [23](23_PRODUCT_REFUNDS_PLAN.md#11-fixtures-numéricas-e-matriz-de-testes).

## HubBuy QC import — V1 + V1.1

- Every endpoint requires an authoritative session and server-side membership/access to the selected finalized purchase; management additionally requires the exact configured Better Auth user ID and a matching workspace membership.
- Invalid/missing configuration fails closed; display name/email, browser flags, alternate IDs, and client-computed candidates never grant access.
- Bodies, strings, arrays, image count/bytes/dimensions/pixels, transfer budgets, concurrency and persistent rate limits stay within `docs/24_HUBBUY_QC_IMPORT_PLAN.md`.
- Parsing accepts only successful HubBuy JSON structure and whitelists needed fields; it drops extra properties and rejects oversized or malformed input.
- Exact, unambiguous identity can auto-match only with a non-empty literal variant; names or listing IDs alone never link. Suggestions need explicit confirmation; ambiguous/conflicting records remain unresolved.
- Multiple occurrences may map to one item; shared item galleries do not duplicate images. Rematching is revision-checked/audited and does not move backup objects.
- Only `freePhotos` are considered. Downloads reject redirects and non-allowlisted hosts, private/reserved DNS results, DNS rebinding, MIME/magic-byte mismatch, unsupported images, truncation, animation, excessive stream size, timeout and oversized pixels/dimensions before R2 PUT.
- R2 keys never come from clients; Turso reservation/claim precedes PUT, retries are idempotent, ready-only photos are visible, and mocked storage/transport failures remain recoverable.
- The manager can resume/reconcile known pending operations. Quotas persist across connections; at most one active transfer/cleanup claim exists per manager/workspace.
- Deletion atomically hides the image and writes an audit tombstone before R2 DELETE. Retry handles absent objects, failed deletion and concurrent/late upload without resurrection.
- Private fallback checks the image's active authorized record on each request, rate-limits, and emits only a short-lived GET URL; no signatures or storage keys are persisted or logged.
- QC is visible from package item context and finalized History; financial close/reopen does not control it. Images never become list/card thumbnails.
- Reimport, rematching, package division, refund/cancellation, or QC deletion does not change snapshots, amounts, rates, allocations, refunds, payment status, quantity or logistics.
- Empty and existing-schema migrations are repeat-safe and preserve plan 23 data; no production migration, Cloudflare configuration, bucket creation or publication occurs without separate authorization.

Complete cases and numerical limits: [24 — HubBuy QC import](24_HUBBUY_QC_IMPORT_PLAN.md#11-matriz-mínima-de-testes).

## QC shared cover and viewer — foundation and viewer phases

- A shared cover belongs to a finalized purchase item, is revision-checked, authorized to the configured QC manager and validated against the active purchase/item/occurrence/image chain.
- The first ready linked photo initializes the cover atomically. Adding later photos does not replace a valid/manual cover; deleting the selected cover chooses the next deterministically ordered ready photo or clears the cover. Rematch repairs both affected items and is audited.
- Private previews are versioned WebP, max 160×160 and 128 KiB, preserve aspect ratio, do not upscale and apply EXIF orientation. A preview failure leaves the original usable and can be retried through the manual QC reconciliation action.
- Presentation batches accept at most 20 item IDs and return no more than three ready preview thumbnails per item, with counts/revision and no signed URLs. Gallery reads do not generate or repair database state.
- The viewer paginates, opens image IDs beyond the first page, fetches one original only when selected, supports keyboard/touch navigation and keeps History read-only. Cover/delete controls appear only in the manager's Pacotes e custos viewer.
- Preview/original reads are session-bound and private. Client state is scoped by user and purchase; reopening revalidates and logout/user change clears scope. Original and preview fallback state is component-local, with no document-wide source swapping.
- Responsive Playwright coverage includes 320, 390, 768, 1024 and 1440px, focus return, Escape, previous/next, cover conflict, deletion fallback and image failure recovery.
- Phase 3 shows only the selected, active shared cover through its private bounded preview on desktop product cost lines and responsive mobile product cost cards in Pacotes e custos. Missing covers/previews and failed reads retain the functional category marker. Cover changes and deletion fallback refresh the displayed preview. History, Favorites, Purchase, the separate QC cost list, and every other surface stay photo-free outside the QC gallery/viewer.
