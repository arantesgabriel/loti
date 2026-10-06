# MVP Scope

## In scope

### Authentication and workspace

- private email/password login;
- no public signup screen;
- one shared workspace in the UI;
- five initial users created by operator/seed tooling;
- logout and persistent sessions.
- edit the authenticated member's complete display name and change their password from Profile;
- changing a password requires the current password and revokes other sessions while preserving the current session.

### Favorites

- view all workspace favorites;
- quick `Meus` view;
- create, edit and delete own favorite;
- product name and URL required;
- optional price, variation/model and notes;
- optional collection;
- QC state: `Não avaliado`, `Aprovado`, `Reprovado`;
- automatic platform detection from URL;
- duplicate-product warning without blocking save;
- search by name/variation/notes;
- filters by person, platform, collection, QC and price presence;
- list and simple-card view modes;
- view-mode preference persisted per user;
- external “Abrir produto” action;
- add any visible favorite to the active purchase.

### Collections

- create personal collection;
- rename own collection;
- delete own collection;
- collections visible to workspace;
- deleting a collection preserves favorites and sets them to no collection;
- a favorite belongs to zero or one collection.

### Purchases

- create one active purchase;
- optional HubBuy account/email metadata;
- add favorite to active purchase;
- add manual item directly to purchase;
- choose person receiving the item;
- variation/model per purchase item;
- quantity >= 1;
- optional unit price;
- automatic subtotal and totals;
- total by person;
- total overall;
- unit count;
- group items by person;
- `Pendente` / `Adicionado` HubBuy-cart status;
- filters: Todos / Pendentes / Adicionados;
- progress based on quantity, not row count;
- all workspace members can edit active-purchase items;
- finalization with warnings for pending/no-price items but no hard block;
- finalized purchase becomes read-only.

### History

- list finalized purchases, newest first;
- purchase detail page;
- historical snapshots remain stable after favorites change.

### Product visuals

- no real product/listing images;
- small neutral functional category marker inferred from product name;
- deterministic keyword-based resolver;
- generic fallback;
- editorial illustrations inspired by Visor Finance are reserved for sparse branding surfaces; existing login remains independent.

### Legacy migration

- one-time script for the provided workbook;
- no spreadsheet-import feature in the UI.

## Explicitly out of scope

Do not implement any of the following in the MVP:

- Supabase, Neon, PostgreSQL or RLS;
- marketplace scraping;
- automatic listing metadata extraction;
- runtime generative AI or runtime image generation;
- real product thumbnails;
- live marketplace integrations;
- HubBuy API integration;
- tracking/shipping status;
- freight calculation or allocation;
- weight management;
- taxes/customs calculations;
- RMB/BRL exchange conversion;
- inventory/resale management;
- payments/Pix between members;
- notifications;
- chat/comments;
- realtime/websockets;
- public signup;
- social login;
- MFA;
- multiple-workspace management UI;
- admin dashboard;
- advanced user-management UI;
- many-to-many tags;
- bulk add-to-purchase flow;
- re-open finalized purchase;
- offline mode;
- native iOS/Android app;
- PWA requirement;
- analytics dashboard;
- advanced reports;
- Excel upload/import screen.

## Definition of MVP success

The MVP succeeds when the five users can complete the full favorite → shared purchase → HubBuy transfer checklist → history cycle without opening the spreadsheet.

## Approved extension: private invitations

- Profile → Meu grupo: current members, pending invitations, email input and manual sharing.
- Any member may invite, revoke or regenerate links valid for seven days.
- New invited users choose their name/password; existing users authenticate before accepting.
- Public signup stays disabled. Operator tooling remains for bootstrap.
- No automatic invitation email, member removal, roles or multiple-workspace navigation.
