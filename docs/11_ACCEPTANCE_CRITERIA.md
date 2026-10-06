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

- active purchase places desktop `Adicionar item` directly to the right of the three-dot options menu and uses a separate floating plus button on mobile;
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
- navigation has only Favorites/Purchase/History primary destinations;
- cards/list toggle exists;
- operational item surfaces display no real product photos, listing thumbnails or large 3D product renders;
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
- Public signup, authorization of existing data and the three primary navigation destinations remain intact.
