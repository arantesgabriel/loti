import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check, primaryKey } from "drizzle-orm/sqlite-core";
const timestamp = (name: string) => integer(name, { mode: "timestamp_ms" }).notNull();
const dates = () => ({ createdAt: timestamp("created_at"), updatedAt: timestamp("updated_at") });
// Better Auth's canonical field contract; passwords and sessions are managed by its adapter.
export const user = sqliteTable("user", {
  id: text("id").primaryKey(), name: text("name").notNull(), email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false), image: text("image"), ...dates(),
});
export const session = sqliteTable("session", {
  id: text("id").primaryKey(), expiresAt: timestamp("expires_at"), token: text("token").notNull().unique(), ...dates(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"), userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, t => [index("session_user_idx").on(t.userId)]);
export const account = sqliteTable("account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }), accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }), refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }), scope: text("scope"), password: text("password"), ...dates(),
}, t => [index("account_user_idx").on(t.userId)]);
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(), expiresAt: timestamp("expires_at"), ...dates(),
}, t => [index("verification_identifier_idx").on(t.identifier)]);
export const workspaces = sqliteTable("workspaces", { id: text("id").primaryKey(), name: text("name").notNull(), createdAt: timestamp("created_at") });
export const workspaceMembers = sqliteTable("workspace_members", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id), userId: text("user_id").notNull().references(() => user.id), createdAt: timestamp("created_at"),
}, t => [primaryKey({ columns: [t.workspaceId, t.userId] })]);
export const collections = sqliteTable("collections", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), ownerId: text("owner_id").notNull().references(() => user.id), name: text("name").notNull(), ...dates(),
}, t => [index("collections_workspace_idx").on(t.workspaceId), check("collection_name", sql`length(trim(${t.name})) > 0`)]);
export const favorites = sqliteTable("favorites", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), ownerId: text("owner_id").notNull().references(() => user.id),
  collectionId: text("collection_id").references(() => collections.id, { onDelete: "set null" }), name: text("name").notNull(), url: text("url").notNull(), platform: text("platform").notNull(), canonicalProductKey: text("canonical_product_key"),
  priceCents: integer("price_cents"), variant: text("variant"), notes: text("notes"), qcStatus: text("qc_status", { enum: ["not_reviewed", "approved", "rejected"] }).notNull().default("not_reviewed"), visualKey: text("visual_key").notNull().default("generic"), ...dates(),
}, t => [index("favorite_workspace_idx").on(t.workspaceId), index("favorite_owner_idx").on(t.ownerId), index("favorite_collection_idx").on(t.collectionId), index("favorite_key_idx").on(t.canonicalProductKey), index("favorite_created_idx").on(t.createdAt),
  check("favorite_price", sql`${t.priceCents} IS NULL OR (typeof(${t.priceCents}) = 'integer' AND ${t.priceCents} >= 0)`), check("favorite_qc", sql`${t.qcStatus} IN ('not_reviewed','approved','rejected')`), check("favorite_name", sql`length(trim(${t.name})) > 0`)]);
export const purchases = sqliteTable("purchases", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), name: text("name").notNull(), hubbuyAccount: text("hubbuy_account"),
  status: text("status", { enum: ["active", "finalized"] }).notNull().default("active"), createdBy: text("created_by").notNull().references(() => user.id), createdAt: timestamp("created_at"), finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
}, t => [uniqueIndex("one_active_purchase_per_workspace").on(t.workspaceId).where(sql`${t.status} = 'active'`), check("purchase_status", sql`${t.status} IN ('active','finalized')`), check("purchase_finalized_date", sql`(${t.status} = 'active' AND ${t.finalizedAt} IS NULL) OR (${t.status} = 'finalized' AND ${t.finalizedAt} IS NOT NULL)`)]);
export const purchaseItems = sqliteTable("purchase_items", {
  id: text("id").primaryKey(), purchaseId: text("purchase_id").notNull().references(() => purchases.id), sourceFavoriteId: text("source_favorite_id").references(() => favorites.id, { onDelete: "set null" }),
  personId: text("person_id").notNull().references(() => user.id), createdBy: text("created_by").notNull().references(() => user.id),
  name: text("name").notNull(), url: text("url").notNull(), platform: text("platform").notNull(), visualKey: text("visual_key").notNull(), variant: text("variant"), notes: text("notes"),
  quantity: integer("quantity").notNull().default(1), unitPriceCents: integer("unit_price_cents"), sharingMode: text("sharing_mode", { enum: ["equal", "percentage", "fixed"] }).notNull().default("equal"), cartStatus: text("cart_status", { enum: ["pending", "added"] }).notNull().default("pending"), ...dates(),
}, t => [index("item_purchase_idx").on(t.purchaseId), index("item_person_idx").on(t.personId), index("item_cart_idx").on(t.cartStatus), index("item_source_idx").on(t.sourceFavoriteId),
  check("item_quantity", sql`typeof(${t.quantity}) = 'integer' AND ${t.quantity} >= 1`), check("item_price", sql`${t.unitPriceCents} IS NULL OR (typeof(${t.unitPriceCents}) = 'integer' AND ${t.unitPriceCents} >= 0)`), check("item_status", sql`${t.cartStatus} IN ('pending','added')`), check("item_sharing_mode", sql`${t.sharingMode} IN ('equal','percentage','fixed')`)]);
export const purchaseItemParticipants = sqliteTable("purchase_item_participants", {
  purchaseItemId: text("purchase_item_id").notNull().references(() => purchaseItems.id, { onDelete: "cascade" }),
  personId: text("person_id").notNull().references(() => user.id),
  allocationOrder: integer("allocation_order").notNull(),
  percentageBps: integer("percentage_bps"), amountCents: integer("amount_cents"),
}, t => [primaryKey({ columns: [t.purchaseItemId, t.personId] }), uniqueIndex("item_participant_order_idx").on(t.purchaseItemId, t.allocationOrder), index("item_participant_person_idx").on(t.personId),
  check("item_participant_order", sql`typeof(${t.allocationOrder}) = 'integer' AND ${t.allocationOrder} >= 0`),
  check("item_participant_percentage", sql`${t.percentageBps} IS NULL OR (typeof(${t.percentageBps}) = 'integer' AND ${t.percentageBps} BETWEEN 0 AND 10000)`),
  check("item_participant_amount", sql`${t.amountCents} IS NULL OR (typeof(${t.amountCents}) = 'integer' AND ${t.amountCents} BETWEEN 0 AND 1000000000000)`),
  check("item_participant_one_value", sql`${t.percentageBps} IS NULL OR ${t.amountCents} IS NULL`)]);
export const userPreferences = sqliteTable("user_preferences", {
  userId: text("user_id").primaryKey().references(() => user.id), favoritesView: text("favorites_view", { enum: ["list", "cards"] }).notNull().default("list"), activeWorkspaceId: text("active_workspace_id").references(() => workspaces.id), ...dates(),
}, t => [check("preference_view", sql`${t.favoritesView} IN ('list','cards')`)]);
export type Favorite = typeof favorites.$inferSelect;
export type Collection = typeof collections.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type PurchaseItem = typeof purchaseItems.$inferSelect;

export const workspaceInvitations = sqliteTable("workspace_invitations", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  email: text("email").notNull(), tokenHash: text("token_hash").notNull().unique(),
  createdBy: text("created_by").notNull().references(() => user.id), createdAt: timestamp("created_at"), expiresAt: timestamp("expires_at"),
  acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }), acceptedBy: text("accepted_by").references(() => user.id),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }), revokedBy: text("revoked_by").references(() => user.id),
}, t => [index("invitation_workspace_idx").on(t.workspaceId),
  uniqueIndex("invitation_open_email_idx").on(t.workspaceId, t.email).where(sql`${t.acceptedAt} IS NULL AND ${t.revokedAt} IS NULL`),
  check("invitation_terminal_state", sql`${t.acceptedAt} IS NULL OR ${t.revokedAt} IS NULL`)]);
export const invitationLimits = sqliteTable("invitation_limits", {
  key: text("key").primaryKey(), window: integer("window").notNull(), count: integer("count").notNull(),
});

export const workspaceCostSettings = sqliteTable("workspace_cost_settings", {
  workspaceId: text("workspace_id").primaryKey().references(() => workspaces.id),
  pixBps: integer("pix_bps").notNull().default(100),
  cardBps: integer("card_bps").notNull().default(500),
  updatedBy: text("updated_by").notNull().references(() => user.id),
  updatedAt: timestamp("updated_at"),
}, t => [
  check("cost_settings_pix_bps", sql`typeof(${t.pixBps}) = 'integer' AND ${t.pixBps} BETWEEN 0 AND 10000`),
  check("cost_settings_card_bps", sql`typeof(${t.cardBps}) = 'integer' AND ${t.cardBps} BETWEEN 0 AND 10000`),
]);

export const purchaseCostTrackings = sqliteTable("purchase_cost_trackings", {
  id: text("id").primaryKey(),
  purchaseId: text("purchase_id").notNull().references(() => purchases.id),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  revision: integer("revision").notNull().default(0),
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at"),
  updatedBy: text("updated_by").notNull().references(() => user.id),
  updatedAt: timestamp("updated_at"),
  closedBy: text("closed_by").references(() => user.id),
  closedAt: integer("closed_at", { mode: "timestamp_ms" }),
}, t => [
  uniqueIndex("cost_tracking_purchase_idx").on(t.purchaseId),
  index("cost_tracking_workspace_idx").on(t.workspaceId, t.status, t.updatedAt),
  check("cost_tracking_state", sql`(${t.status} = 'open' AND ${t.closedAt} IS NULL AND ${t.closedBy} IS NULL) OR (${t.status} = 'closed' AND ${t.closedAt} IS NOT NULL AND ${t.closedBy} IS NOT NULL)`),
  check("cost_tracking_revision", sql`typeof(${t.revision}) = 'integer' AND ${t.revision} >= 0`),
]);

export const purchaseItemCosts = sqliteTable("purchase_item_costs", {
  id: text("id").primaryKey(),
  trackingId: text("tracking_id").notNull().references(() => purchaseCostTrackings.id),
  purchaseItemId: text("purchase_item_id").notNull().references(() => purchaseItems.id),
  itemOrder: integer("item_order").notNull(),
  effectivePriceState: text("effective_price_state", { enum: ["pending", "known", "no_charge"] }).notNull(),
  effectivePriceUnitCents: integer("effective_price_unit_cents"),
  chinaFreightState: text("china_freight_state", { enum: ["pending", "known", "no_charge"] }).notNull().default("pending"),
  chinaFreightUnitCents: integer("china_freight_unit_cents"),
}, t => [
  uniqueIndex("cost_item_tracking_item_idx").on(t.trackingId, t.purchaseItemId),
  index("cost_item_tracking_order_idx").on(t.trackingId, t.itemOrder),
  check("cost_item_order", sql`typeof(${t.itemOrder}) = 'integer' AND ${t.itemOrder} >= 0`),
  check("cost_item_effective_price_state", sql`(${t.effectivePriceState} = 'known' AND typeof(${t.effectivePriceUnitCents}) = 'integer' AND ${t.effectivePriceUnitCents} BETWEEN 0 AND 1000000000000) OR (${t.effectivePriceState} IN ('pending','no_charge') AND ${t.effectivePriceUnitCents} IS NULL)`),
  check("cost_item_china_freight_state", sql`(${t.chinaFreightState} = 'known' AND typeof(${t.chinaFreightUnitCents}) = 'integer' AND ${t.chinaFreightUnitCents} BETWEEN 0 AND 1000000000000) OR (${t.chinaFreightState} IN ('pending','no_charge') AND ${t.chinaFreightUnitCents} IS NULL)`),
]);

export const purchaseCostParticipants = sqliteTable("purchase_cost_participants", {
  costItemId: text("cost_item_id").notNull().references(() => purchaseItemCosts.id),
  personId: text("person_id").notNull().references(() => user.id),
  allocationOrder: integer("allocation_order").notNull(),
  weightMode: text("weight_mode", { enum: ["equal", "percentage", "fixed"] }).notNull(),
  weight: integer("weight").notNull(),
}, t => [
  primaryKey({ columns: [t.costItemId, t.personId] }),
  uniqueIndex("cost_participant_order_idx").on(t.costItemId, t.allocationOrder),
  index("cost_participant_person_idx").on(t.personId),
  check("cost_participant_order", sql`typeof(${t.allocationOrder}) = 'integer' AND ${t.allocationOrder} >= 0`),
  check("cost_participant_weight", sql`typeof(${t.weight}) = 'integer' AND ${t.weight} BETWEEN 0 AND 1000000000000`),
  check("cost_participant_weight_mode", sql`${t.weightMode} IN ('equal','percentage','fixed')`),
]);

export const purchasePackages = sqliteTable("purchase_packages", {
  id: text("id").primaryKey(),
  trackingId: text("tracking_id").notNull().references(() => purchaseCostTrackings.id),
  name: text("name").notNull(),
  packageOrder: integer("package_order").notNull(),
  logisticsStatus: text("logistics_status", { enum: ["preparing", "sent", "received"] }).notNull().default("preparing"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, t => [
  index("cost_package_tracking_idx").on(t.trackingId, t.packageOrder),
  check("cost_package_name", sql`length(trim(${t.name})) > 0`),
  check("cost_package_order", sql`typeof(${t.packageOrder}) = 'integer' AND ${t.packageOrder} >= 0`),
  check("cost_package_logistics", sql`${t.logisticsStatus} IN ('preparing','sent','received')`),
]);

export const purchasePackageItems = sqliteTable("purchase_package_items", {
  packageId: text("package_id").notNull().references(() => purchasePackages.id),
  costItemId: text("cost_item_id").notNull().references(() => purchaseItemCosts.id),
  quantity: integer("quantity").notNull(),
  allocationOrder: integer("allocation_order").notNull(),
}, t => [
  primaryKey({ columns: [t.packageId, t.costItemId] }),
  uniqueIndex("package_item_order_idx").on(t.packageId, t.allocationOrder),
  index("package_item_cost_item_idx").on(t.costItemId),
  check("package_item_quantity", sql`typeof(${t.quantity}) = 'integer' AND ${t.quantity} >= 1`),
  check("package_item_order", sql`typeof(${t.allocationOrder}) = 'integer' AND ${t.allocationOrder} >= 0`),
]);

export const purchaseCostCharges = sqliteTable("purchase_cost_charges", {
  id: text("id").primaryKey(),
  trackingId: text("tracking_id").notNull().references(() => purchaseCostTrackings.id),
  packageId: text("package_id").references(() => purchasePackages.id),
  chargeType: text("charge_type", { enum: ["products", "brazil_freight", "customs"] }).notNull(),
  valueState: text("value_state", { enum: ["pending", "known", "no_charge"] }),
  amountCents: integer("amount_cents"),
  paymentMethod: text("payment_method", { enum: ["pix", "card"] }),
  feeBps: integer("fee_bps"),
  paymentStatus: text("payment_status", { enum: ["pending", "paid"] }).notNull().default("pending"),
  paidBy: text("paid_by").references(() => user.id),
  paidAt: integer("paid_at", { mode: "timestamp_ms" }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, t => [
  uniqueIndex("cost_charge_products_idx").on(t.trackingId).where(sql`${t.chargeType} = 'products'`),
  uniqueIndex("cost_charge_package_type_idx").on(t.packageId, t.chargeType).where(sql`${t.chargeType} IN ('brazil_freight','customs')`),
  index("cost_charge_tracking_idx").on(t.trackingId, t.chargeType),
  check("cost_charge_package_scope", sql`(${t.chargeType} = 'products' AND ${t.packageId} IS NULL AND ${t.valueState} IS NULL AND ${t.amountCents} IS NULL) OR (${t.chargeType} IN ('brazil_freight','customs') AND ${t.packageId} IS NOT NULL)`),
  check("cost_charge_value_state", sql`${t.chargeType} = 'products' OR (${t.valueState} = 'known' AND typeof(${t.amountCents}) = 'integer' AND ${t.amountCents} BETWEEN 0 AND 1000000000000) OR (${t.valueState} IN ('pending','no_charge') AND ${t.amountCents} IS NULL)`),
  check("cost_charge_fee", sql`(${t.feeBps} IS NULL AND ${t.paymentMethod} IS NULL) OR (typeof(${t.feeBps}) = 'integer' AND ${t.feeBps} BETWEEN 0 AND 10000 AND ${t.paymentMethod} IN ('pix','card'))`),
  check("cost_charge_customs_fee", sql`${t.chargeType} != 'customs' OR (${t.feeBps} IS NULL AND ${t.paymentMethod} IS NULL)`),
  check("cost_charge_paid", sql`(${t.paymentStatus} = 'pending' AND ${t.paidAt} IS NULL AND ${t.paidBy} IS NULL) OR (${t.paymentStatus} = 'paid' AND ${t.paidAt} IS NOT NULL AND ${t.paidBy} IS NOT NULL)`),
]);

export const purchaseCostReopenings = sqliteTable("purchase_cost_reopenings", {
  id: text("id").primaryKey(),
  trackingId: text("tracking_id").notNull().references(() => purchaseCostTrackings.id),
  reopenedBy: text("reopened_by").notNull().references(() => user.id),
  reopenedAt: timestamp("reopened_at"),
  reason: text("reason").notNull(),
}, t => [
  index("cost_reopening_tracking_idx").on(t.trackingId, t.reopenedAt),
  check("cost_reopening_reason", sql`length(trim(${t.reason})) > 0`),
]);
