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
9. The favorite owner is the default sole cost participant when the favorite is added to a purchase; participants can be changed while the purchase is active.
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
34. When a favorite is added to a purchase, copy snapshot fields into the purchase item: name, URL, platform, category key (stored in `visual_key`), variation and suggested price.
35. `source_favorite_id` is optional metadata, never the source of historical display data.
36. A purchase item is one physical product row. Its cost participants are a separate relation; they are not extra units or duplicate products.
37. `created_by` records who performed the action.
38. Quantity is required, integer, and minimum 1.
39. Unit price may be null while preparing the purchase.
40. A null price must display as `Preço pendente`, never `R$ 0,00`.
41. Subtotal is derived: `quantity * unit_price_cents`; never persist subtotal.
42. Purchase total is derived from items with prices; never persist total.
43. Personal totals sum allocated priced shares, not full item subtotals. `purchase_items.person_id` is retained as a compatibility mirror of the first participant by stable allocation order and does not determine recipients, access, filtering or totals.
44. The UI must indicate how many items/units remain without price when totals are incomplete.
45. Different variations are separate purchase-item rows.
46. Same person + same variation may use quantity > 1.
47. Do not automatically merge duplicate purchase-item rows.
48. Each item has one of `equal`, `percentage`, or `fixed` allocation modes. A one-person item normalizes to `equal`.
49. Participants are selected explicitly from the purchase workspace, unique per item, and kept in a persisted stable order. New members do not join existing items automatically.
50. Equal shares divide subtotal cents with remainder cents assigned in participant order. Percentage shares use integer basis points summing to 10,000 and the largest-remainder method. Fixed shares use nonnegative integer cents summing exactly to the priced subtotal.
51. Equal and percentage allocations preserve participants when price is null and show shares as pending. Fixed allocations require a known price. Zero price and zero shares are valid.
52. Item edits, removals and HubBuy status are global to the single item. Marking all items for one person also changes shared items they participate in. Removing the product removes all its participations; removing one participant only edits the allocation.
53. Changing participants in unequal modes requires an explicit recomposition. Changing price or quantity recalculates equal/percentage shares; fixed shares must be revised to match the new subtotal.
54. Item and participant writes are atomic, and all purchase mutations remain prohibited after finalization. The complete rounding and input contract is in [the cost-sharing plan](20_PURCHASE_COST_SHARING_PLAN.md).

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

## Private group invitations

1. Every member may invite people to their active workspace and revoke/regenerate its pending invitations.
2. Invites bind normalized email and workspace, expire after seven days, and are consumed once. Regeneration revokes the previous link.
3. Only one open invitation per workspace/email; expired invitations are closed when replaced. Already-member emails cannot be invited again.
4. Existing accounts require an authenticated session of the invited email; acceptance never changes their credentials.
5. Account/credential creation, membership, active workspace preference and invitation consumption commit atomically. Failure rolls everything back.
6. Session creation occurs after commit. Failure to establish a session leaves membership intact and is recovered through normal login.
7. The token authorizes invited account creation; manual sharing does not independently verify mailbox ownership.
8. Existing memberships and Favorites view preferences are preserved. The accepted workspace becomes the active context and is checked by centralized authorization.

## Profile editing

1. A signed-in workspace member may update only their own display name and credential password.
2. A display name is trimmed at the edges and must contain 1–200 characters; one-word names are valid. Email remains read-only.
3. Name changes preserve the Better Auth user ID and every workspace, favorite, collection, purchase and preference relationship.
4. Password changes require the current password and a new password of 12–128 characters. Password contents are never trimmed or normalized, and the confirmation is an exact client-side check.
5. A password change rejects immediate reuse of the current password, revokes every other session, and rotates the session for the current device.
6. Profile mutations require a valid session, workspace membership, and a trusted request origin. Request payloads cannot select another user or change email/image.
7. Historical purchase items remain product snapshots; identity labels continue to resolve from the current member record.

## Packages and costs extension

The finalized purchase remains immutable. A separate workspace-authorized follow-up stores effective unit prices, manual China freight, package allocations, Brazil freight/customs values, captured Pix/card fee rates and manual paid states. One follow-up is created atomically when a new purchase is finalized; older finalized purchases require an explicit idempotent start action. See [the complete rules and invariants](21_PACKAGES_AND_COSTS_PLAN.md).

- One physical purchase line and its original participant composition remain the source; editable cost snapshots never write back to favorites or purchase history.
- Unit costs are in integer BRL cents. Package allocation quantities are positive integers whose sum cannot exceed the purchased quantity. Fees and package charges are allocated deterministically and close to the cent.
- Value state (`pending`, `known`, `no_charge`), payment state, and manual logistics state are independent. Unknown is not zero; no-charge obligations require no payment.
- Product payment is one charge for the whole purchase with one method. Brazil freight is charged once per package with its own method and captured fee; customs has no transaction fee. Fee defaults are 1% Pix and 5% card and changes do not rewrite existing charges.
- Financial closure requires complete unit coverage, resolved values/compositions, and resolved paid/no-charge obligations. Closed follow-ups are read-only; reopening requires confirmation and a reason. Neither operation changes `purchases.status`.
