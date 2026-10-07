# Information Architecture

## Primary navigation

Loti has only three operational areas:

1. **Favoritos**
2. **Compra atual**
3. **Histórico**

Profile/logout is accessed from the user avatar. Collections live inside Favorites.

## Routes

```text
/login

/favorites
/purchase
/history
/history/[purchaseId]
/profile
```

Creation/editing should generally stay in context via Sheet/Drawer/Dialog instead of dedicated routes.

## Desktop shell

- persistent left sidebar;
- brand at top;
- Favoritos / Compra atual / Histórico;
- Favorites context includes collections in the sidebar/secondary area;
- profile identity at bottom;
- main content to the right.

## Mobile shell

- no sidebar;
- page header + avatar/menu;
- compact floating rounded bottom navigation island with exactly three items: Favoritos, Compra, Histórico;
- only the active destination shows its short label; the full selected fill moves between destinations;
- on desktop, show separate `Editar compra` and `Finalizar compra` buttons beside `Adicionar item`; retain the three-dot options menu on mobile;
- on desktop, show a lower-right floating `+` only while the heading `Adicionar item` action is outside the viewport; hide it again when that action returns into view. Mobile keeps its separate floating `+` action;
- navigation island remains visually separated from content and respects device safe area.

## Surface inventory

### Pages

- Login
- Favorites
- Active Purchase
- History
- Historical Purchase Detail
- Profile

Profile contains a read-only account email, complete display-name form, independent expandable password-change form, Meu grupo access and logout. It adds no route or primary navigation item.

### Drawers / Sheets

- Favorite detail
- New favorite
- Edit favorite
- Pick favorite for purchase
- Add favorite to purchase
- Add manual purchase item
- Edit purchase item

### Dialogs

- Confirm favorite deletion
- New/rename collection
- Confirm collection deletion
- Create purchase
- Remove purchase item
- Finalize purchase

## Page: Login

Editorial community-orbit scene + private login form. At desktop width, scene is left and form is right; tablet/mobile place a simplified compact scene above the form. Brand, heading, email/password, submit and private-access note remain the interaction hierarchy. There are no extra routes or keyboard stops in the illustration. See `17_LOGIN_ORBITAL_MOTION.md`.

## Page: Favorites

Hierarchy:

1. page title + add favorite action;
2. `Todos` / `Meus` segmented control;
3. compact member cards on the same row for browsing other people's favorites;
4. search;
5. compact filters;
6. list/card view toggle;
7. collection navigation/filter;
8. favorite content.

Show one segmented control for `Todos` / `Meus` beside individual cards for other members. Use functional icons and a shared neutral background for the segmented control; member cards show their avatar, complete display name and favorite count. Selecting any option filters the list and smoothly moves its full fill to the active option. Allow horizontal scrolling on narrow screens and honor reduced-motion preferences. Do not show a separate `Outras pessoas` segment.
On mobile, place the new-favorite action in a floating plus button at the lower right and give the horizontal people rail a brief one-time scroll cue.

### Favorite card/list item shows

Primary:

- name;
- variation/model;
- price or `Sem preço`;
- owner;
- platform.

Secondary where space permits:

- QC;
- collection.

Primary actions:

- Abrir produto;
- + Compra.

Small decorative category markers support scanning after the textual hierarchy and actions. They are not primary content or product thumbnails. Full notes belong in detail/edit surfaces, not the dense list.

## Page: Active Purchase

Hierarchy:

1. purchase name + status;
2. unit/person/account metadata;
3. estimated total in a draggable carousel for all, pending, and added items;
4. progress;
5. compact Todos / Pendentes / Adicionados selection cards with the same sliding full-selection animation as the Favorites person selector;
6. person summaries;
7. items grouped by person;
8. separate edit/finalize actions and add-item action in the heading; on desktop, a floating plus appears only while the heading add action is outside the viewport.

Each item should make its status and open-product action obvious. Its neutral category marker is smaller than the status control; name, variation, quantity, unit price and subtotal remain primary.

## Page: History

Simple chronological list. No analytics dashboard and no advanced filters in MVP.

## Historical detail

Visually similar to Active Purchase but strictly read-only. `Abrir produto` may remain available.

## Page vs drawer vs dialog rule

- **Page:** changes primary context.
- **Drawer/Sheet:** views, creates or edits an object while preserving context.
- **Dialog:** short decision/confirmation.

## Empty states

Sparse Visor-inspired editorial illustrations may support these states; do not repeat them inside operational items or introduce new business flows. Existing functional empty states need no replacement.

Must cover:

- no favorites;
- search with no results;
- empty collection;
- no active purchase;
- active purchase with no items;
- no history.

## Private invitation surfaces

- `/group`: secondary authenticated page reached from Profile through **Meu grupo**. Members, pending invitations and invitation dialog.
- `/invite/[token]`: public page accessible only with a valid invitation; outside the membership-protected app layout.
- Login accepts only a validated internal `/invite/<token>` return destination.
- Primary desktop/mobile navigation retains Favorites, Purchase and History; Group is not a fourth primary destination.
