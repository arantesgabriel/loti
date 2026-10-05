# Business Rules

## Workspace and users

1. Every application record belongs to a workspace, directly or through its parent.
2. The MVP UI exposes one workspace only.
3. All initial members have equal collaborative rights in purchases; there is no admin/editor/viewer role system.
4. User identity comes from Better Auth.

## Favorites

5. Every favorite has exactly one owner: the authenticated user who created it.
6. Every workspace member can view every favorite in that workspace.
7. Only the favorite owner can edit or delete that favorite.
8. Any workspace member can add another member's favorite to the active purchase.
9. The person receiving the purchase item defaults to the favorite owner, but can be changed.
10. Favorite price is optional and is only a reference price.
11. Favorite variation/model and notes are optional.
12. Quantity does not exist on a favorite.
13. A favorite belongs to zero or one collection.
14. QC belongs to the favorite and defaults to `not_reviewed`.
15. Product URL is required.
16. Platform is derived from URL; unsupported domains become `other`.
17. Duplicate detection warns; it never blocks saving.
18. The same marketplace product can legitimately exist as favorites for different people.
19. Editing a favorite never updates existing purchase-item snapshots.
20. Deleting a favorite never deletes historical/current purchase items. `source_favorite_id` becomes null if necessary.

## Collections

21. A collection belongs to one user and one workspace.
22. All workspace members may view collections.
23. Only the collection owner can rename/delete it.
24. Deleting a collection must not delete favorites; affected favorites become uncollected.

## Purchases

25. A purchase represents one collective buying round.
26. Only one purchase may have status `active` per workspace.
27. A new active purchase cannot be created while another active purchase exists.
28. Any workspace member can create the purchase, add items, edit active-purchase items, remove active-purchase items and finalize the purchase.
29. HubBuy account/email is optional and editable while the purchase is active.
30. A finalized purchase is immutable/read-only at the server boundary, not only in the UI.
31. Re-opening a finalized purchase is out of scope.

## Purchase items

32. A purchase item may originate from a favorite or be created manually.
33. Manual purchase items do not automatically become favorites.
34. When a favorite is added to a purchase, copy snapshot fields into the purchase item: name, URL, platform, visual key, variation and suggested price.
35. `source_favorite_id` is optional metadata, never the source of historical display data.
36. `person_id` means “who this item is for”, not “who created it”.
37. `created_by` records who performed the action.
38. Quantity is required, integer, and minimum 1.
39. Unit price may be null while preparing the purchase.
40. A null price must display as `Preço pendente`, never `R$ 0,00`.
41. Subtotal is derived: `quantity * unit_price_cents`; never persist subtotal.
42. Purchase total is derived from items with prices; never persist total.
43. Person total is derived from that person's priced items.
44. The UI must indicate how many items/units remain without price when totals are incomplete.
45. Different variations are separate purchase-item rows.
46. Same person + same variation may use quantity > 1.
47. Do not automatically merge duplicate purchase-item rows.

## HubBuy transfer status

48. Every purchase item starts with `cart_status = pending`.
49. Status values are `pending` and `added` only.
50. Marking an item as added is a one-tap action and represents all units on that row.
51. Purchase progress is quantity-weighted:

`sum(quantity where status = added) / sum(quantity all items)`.

52. Finalization may proceed even with pending or no-price items, but requires a clear warning/confirmation.

## History

53. Finalization sets `status = finalized` and `finalized_at`.
54. Finalized purchase data is read-only.
55. Historical links, names, prices, variations, quantities and people must remain stable even if favorites later change or disappear.

## User preferences

56. Favorites view mode is per-user: `list` or `cards`.
57. View-mode preference persists across sessions/devices.
58. Filters do not need to persist between sessions.

## Money and links

59. Money is stored as integer cents, never floating point.
60. Preserve the user's original URL for opening the product.
61. Separately compute an optional canonical product key for duplicate detection.
62. Removing tracking/referral data for comparison must never corrupt the original stored URL.
