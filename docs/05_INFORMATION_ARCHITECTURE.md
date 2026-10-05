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
- floating rounded bottom navigation island with exactly three items: Favoritos, Compra, Histórico;
- active destination uses a rounded selected pill/tint;
- context-specific floating/primary add action where appropriate;
- navigation island remains visually separated from content and respects device safe area.

## Surface inventory

### Pages

- Login
- Favorites
- Active Purchase
- History
- Historical Purchase Detail
- Profile

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

## Page: Favorites

Hierarchy:

1. page title + add favorite action;
2. `Todos` / `Meus` segmented control;
3. search;
4. compact filters;
5. list/card view toggle;
6. collection navigation/filter;
7. favorite content.

### Favorite card/list item shows

Primary:

- grayscale archetype visual;
- name;
- price or `Sem preço`;
- owner;
- platform.

Secondary where space permits:

- variation/model;
- QC;
- collection.

Primary actions:

- Abrir produto;
- + Compra.

Full notes belong in detail/edit surfaces, not the dense list.

## Page: Active Purchase

Hierarchy:

1. purchase name + status;
2. unit/person/account metadata;
3. estimated total;
4. progress;
5. Todos / Pendentes / Adicionados;
6. person summaries;
7. items grouped by person;
8. add-item action.

Each item should make its status and open-product action obvious.

## Page: History

Simple chronological list. No analytics dashboard and no advanced filters in MVP.

## Historical detail

Visually similar to Active Purchase but strictly read-only. `Abrir produto` may remain available.

## Page vs drawer vs dialog rule

- **Page:** changes primary context.
- **Drawer/Sheet:** views, creates or edits an object while preserving context.
- **Dialog:** short decision/confirmation.

## Empty states

Must cover:

- no favorites;
- search with no results;
- empty collection;
- no active purchase;
- active purchase with no items;
- no history.
