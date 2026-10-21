import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check, primaryKey, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
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

export const authLimits = sqliteTable("auth_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), expiresAt: integer("expires_at").notNull(),
}, t => [index("auth_limit_expiry_idx").on(t.expiresAt), check("auth_limit_count", sql`${t.count} > 0`)]);
export const authEmailDeliveries = sqliteTable("auth_email_deliveries", {
  id: text("id").primaryKey(), kind: text("kind", { enum: ["reset", "verification", "invitation"] }).notNull(),
  recipientKey: text("recipient_key").notNull(), userId: text("user_id").references(() => user.id),
  state: text("state", { enum: ["reserved", "sent", "failed", "uncertain"] }).notNull(),
  createdAt: timestamp("created_at"), expiresAt: timestamp("expires_at"), consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
}, t => [index("auth_email_expiry_idx").on(t.expiresAt), check("auth_email_kind", sql`${t.kind} IN ('reset','verification','invitation')`), check("auth_email_state", sql`${t.state} IN ('reserved','sent','failed','uncertain')`)]);

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

export const purchaseCostOrders = sqliteTable("purchase_cost_orders", {
  id: text("id").primaryKey(), trackingId: text("tracking_id").notNull().references(() => purchaseCostTrackings.id),
  kind: text("kind", { enum: ["original", "additional"] }).notNull(),
  accountId: text("account_id").references((): AnySQLiteColumn => hubbuyAccounts.id),
  externalReference: text("external_reference"), state: text("state", { enum: ["draft", "recorded", "voided"] }).notNull(),
  revision: integer("revision").notNull().default(0), createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at"), updatedBy: text("updated_by").notNull().references(() => user.id), updatedAt: timestamp("updated_at"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }), recordedAt: integer("recorded_at", { mode: "timestamp_ms" }),
  operationId: text("operation_id").references((): AnySQLiteColumn => financialOperations.id),
}, t => [
  uniqueIndex("cost_order_original_idx").on(t.trackingId).where(sql`${t.kind} = 'original'`),
  uniqueIndex("cost_order_external_reference_idx").on(t.accountId, t.externalReference).where(sql`${t.externalReference} IS NOT NULL`),
  index("cost_order_tracking_idx").on(t.trackingId, t.state, t.createdAt),
  check("cost_order_kind", sql`${t.kind} IN ('original','additional')`),
  check("cost_order_state", sql`(${t.kind} = 'original' AND ${t.state} = 'recorded') OR (${t.kind} = 'additional' AND ${t.state} IN ('draft','recorded','voided'))`),
  check("cost_order_revision", sql`typeof(${t.revision}) = 'integer' AND ${t.revision} >= 0`),
  check("cost_order_external_reference", sql`${t.externalReference} IS NULL OR length(trim(${t.externalReference})) BETWEEN 1 AND 200`),
  check("cost_order_recorded", sql`(${t.state} = 'recorded' AND (${t.recordedAt} IS NOT NULL OR (${t.kind} = 'original' AND ${t.accountId} IS NULL AND ${t.operationId} IS NULL))) OR (${t.state} != 'recorded' AND ${t.recordedAt} IS NULL)`),
]);

export const purchaseOrderCorrections = sqliteTable("purchase_order_corrections", {
  id: text("id").primaryKey(),
  trackingId: text("tracking_id").notNull().references(() => purchaseCostTrackings.id),
  previousOrderId: text("previous_order_id").notNull().references(() => purchaseCostOrders.id),
  replacementOrderId: text("replacement_order_id").notNull().references(() => purchaseCostOrders.id),
  operationId: text("operation_id").notNull().references((): AnySQLiteColumn => financialOperations.id),
}, t => [
  uniqueIndex("order_correction_previous_idx").on(t.previousOrderId),
  uniqueIndex("order_correction_replacement_idx").on(t.replacementOrderId),
  index("order_correction_tracking_idx").on(t.trackingId),
  check("order_correction_distinct", sql`${t.previousOrderId} != ${t.replacementOrderId}`),
]);

export const purchaseAdditionalOrderItems = sqliteTable("purchase_additional_order_items", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => purchaseCostOrders.id),
  sourceFavoriteId: text("source_favorite_id").references(() => favorites.id, { onDelete: "set null" }),
  name: text("name").notNull(), url: text("url").notNull(), platform: text("platform").notNull(), visualKey: text("visual_key").notNull(),
  variant: text("variant"), notes: text("notes"), quantity: integer("quantity").notNull(), itemOrder: integer("item_order").notNull(),
  createdBy: text("created_by").notNull().references(() => user.id), createdAt: timestamp("created_at"),
}, t => [
  uniqueIndex("additional_order_item_order_idx").on(t.orderId, t.itemOrder),
  index("additional_order_item_favorite_idx").on(t.sourceFavoriteId),
  check("additional_order_item_name", sql`length(trim(${t.name})) BETWEEN 1 AND 200`),
  check("additional_order_item_quantity", sql`typeof(${t.quantity}) = 'integer' AND ${t.quantity} BETWEEN 1 AND 10000`),
  check("additional_order_item_order", sql`typeof(${t.itemOrder}) = 'integer' AND ${t.itemOrder} >= 0`),
]);

export const purchaseItemCosts = sqliteTable("purchase_item_costs", {
  id: text("id").primaryKey(),
  trackingId: text("tracking_id").notNull().references(() => purchaseCostTrackings.id),
  orderId: text("order_id").notNull().references(() => purchaseCostOrders.id),
  purchaseItemId: text("purchase_item_id").references(() => purchaseItems.id),
  additionalOrderItemId: text("additional_order_item_id").references((): AnySQLiteColumn => purchaseAdditionalOrderItems.id),
  itemOrder: integer("item_order").notNull(),
  effectivePriceState: text("effective_price_state", { enum: ["pending", "known", "no_charge"] }).notNull(),
  effectivePriceUnitCents: integer("effective_price_unit_cents"),
  chinaFreightState: text("china_freight_state", { enum: ["pending", "known", "no_charge"] }).notNull().default("pending"),
  chinaFreightUnitCents: integer("china_freight_unit_cents"),
  nativeProductState: text("native_product_state", { enum: ["unknown", "known", "no_charge"] }).notNull().default("unknown"),
  nativeProductCnyMinor: integer("native_product_cny_minor"),
  nativeChinaState: text("native_china_state", { enum: ["unknown", "known", "no_charge"] }).notNull().default("unknown"),
  nativeChinaCnyMinor: integer("native_china_cny_minor"), valuationVersion: integer("valuation_version").notNull().default(1),
}, t => [
  uniqueIndex("cost_item_tracking_item_idx").on(t.trackingId, t.purchaseItemId).where(sql`${t.purchaseItemId} IS NOT NULL`),
  uniqueIndex("cost_item_additional_order_idx").on(t.trackingId, t.additionalOrderItemId).where(sql`${t.additionalOrderItemId} IS NOT NULL`),
  index("cost_item_tracking_order_idx").on(t.trackingId, t.orderId, t.itemOrder),
  index("cost_item_order_idx").on(t.orderId, t.itemOrder),
  check("cost_item_origin", sql`(${t.purchaseItemId} IS NOT NULL AND ${t.additionalOrderItemId} IS NULL) OR (${t.purchaseItemId} IS NULL AND ${t.additionalOrderItemId} IS NOT NULL)`),
  check("cost_item_order", sql`typeof(${t.itemOrder}) = 'integer' AND ${t.itemOrder} >= 0`),
  check("cost_item_effective_price_state", sql`(${t.effectivePriceState} = 'known' AND typeof(${t.effectivePriceUnitCents}) = 'integer' AND ${t.effectivePriceUnitCents} BETWEEN 0 AND 1000000000000) OR (${t.effectivePriceState} IN ('pending','no_charge') AND ${t.effectivePriceUnitCents} IS NULL)`),
  check("cost_item_china_freight_state", sql`(${t.chinaFreightState} = 'known' AND typeof(${t.chinaFreightUnitCents}) = 'integer' AND ${t.chinaFreightUnitCents} BETWEEN 0 AND 1000000000000) OR (${t.chinaFreightState} IN ('pending','no_charge') AND ${t.chinaFreightUnitCents} IS NULL)`),
  check("cost_item_native_product_state", sql`(${t.nativeProductState} = 'known' AND typeof(${t.nativeProductCnyMinor}) = 'integer' AND ${t.nativeProductCnyMinor} BETWEEN 0 AND 1000000000000) OR (${t.nativeProductState} IN ('unknown','no_charge') AND ${t.nativeProductCnyMinor} IS NULL)`),
  check("cost_item_native_china_state", sql`(${t.nativeChinaState} = 'known' AND typeof(${t.nativeChinaCnyMinor}) = 'integer' AND ${t.nativeChinaCnyMinor} BETWEEN 0 AND 1000000000000) OR (${t.nativeChinaState} IN ('unknown','no_charge') AND ${t.nativeChinaCnyMinor} IS NULL)`),
  check("cost_item_valuation_version", sql`typeof(${t.valuationVersion}) = 'integer' AND ${t.valuationVersion} IN (1,2)`),
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
  accountId: text("account_id").references((): AnySQLiteColumn => hubbuyAccounts.id),
  contentRevision: integer("content_revision").notNull().default(0),
  contentSealedAt: integer("content_sealed_at", { mode: "timestamp_ms" }), contentSealedBy: text("content_sealed_by").references(() => user.id),
  contentSealSource: text("content_seal_source", { enum: ["user", "legacy_locked"] }),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
}, t => [
  index("cost_package_tracking_idx").on(t.trackingId, t.packageOrder),
  check("cost_package_name", sql`length(trim(${t.name})) > 0`),
  check("cost_package_order", sql`typeof(${t.packageOrder}) = 'integer' AND ${t.packageOrder} >= 0`),
  check("cost_package_logistics", sql`${t.logisticsStatus} IN ('preparing','sent','received')`),
  check("cost_package_content_revision", sql`typeof(${t.contentRevision}) = 'integer' AND ${t.contentRevision} >= 0`),
  check("cost_package_content_seal", sql`(${t.contentSealSource} IS NULL AND ${t.contentSealedAt} IS NULL AND ${t.contentSealedBy} IS NULL) OR (${t.contentSealSource} = 'legacy_locked' AND ${t.contentSealedAt} IS NULL AND ${t.contentSealedBy} IS NULL) OR (${t.contentSealSource} = 'user' AND ${t.contentSealedAt} IS NOT NULL AND ${t.contentSealedBy} IS NOT NULL)`),
]);

export const purchaseCostPackageEvents = sqliteTable("purchase_cost_package_events", {
  id: text("id").primaryKey(), trackingId: text("tracking_id").notNull().references(() => purchaseCostTrackings.id),
  packageId: text("package_id").notNull().references(() => purchasePackages.id), eventOrder: integer("event_order").notNull(),
  eventType: text("event_type", { enum: ["content_sealed", "content_changed", "content_unsealed"] }).notNull(),
  contentRevision: integer("content_revision").notNull(), actorId: text("actor_id").notNull().references(() => user.id),
  reason: text("reason"), createdAt: timestamp("created_at"),
}, t => [
  uniqueIndex("cost_package_event_order_idx").on(t.packageId, t.eventOrder),
  index("cost_package_event_tracking_idx").on(t.trackingId, t.packageId, t.eventOrder),
  check("cost_package_event_type", sql`${t.eventType} IN ('content_sealed','content_changed','content_unsealed')`),
  check("cost_package_event_order", sql`typeof(${t.eventOrder}) = 'integer' AND ${t.eventOrder} >= 0`),
  check("cost_package_event_revision", sql`typeof(${t.contentRevision}) = 'integer' AND ${t.contentRevision} >= 0`),
  check("cost_package_event_reason", sql`(${t.eventType} = 'content_unsealed' AND length(trim(${t.reason})) BETWEEN 1 AND 1000) OR (${t.eventType} != 'content_unsealed' AND ${t.reason} IS NULL)`),
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
  orderId: text("order_id").references(() => purchaseCostOrders.id),
  packageId: text("package_id").references(() => purchasePackages.id),
  chargeType: text("charge_type", { enum: ["products", "brazil_freight", "customs"] }).notNull(),
  paymentModel: text("payment_model", { enum: ["legacy_single", "components_v1"] }).notNull().default("legacy_single"),
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
  uniqueIndex("cost_charge_products_order_idx").on(t.orderId).where(sql`${t.chargeType} = 'products'`),
  uniqueIndex("cost_charge_package_type_idx").on(t.packageId, t.chargeType).where(sql`${t.chargeType} IN ('brazil_freight','customs')`),
  index("cost_charge_tracking_idx").on(t.trackingId, t.chargeType),
  check("cost_charge_package_scope", sql`(${t.chargeType} = 'products' AND ${t.orderId} IS NOT NULL AND ${t.packageId} IS NULL AND ${t.valueState} IS NULL AND ${t.amountCents} IS NULL) OR (${t.chargeType} IN ('brazil_freight','customs') AND ${t.orderId} IS NULL AND ${t.packageId} IS NOT NULL)`),
  check("cost_charge_value_state", sql`${t.chargeType} = 'products' OR (${t.valueState} = 'known' AND typeof(${t.amountCents}) = 'integer' AND ${t.amountCents} BETWEEN 0 AND 1000000000000) OR (${t.valueState} IN ('pending','no_charge') AND ${t.amountCents} IS NULL)`),
  check("cost_charge_fee", sql`(${t.feeBps} IS NULL AND ${t.paymentMethod} IS NULL) OR (typeof(${t.feeBps}) = 'integer' AND ${t.feeBps} BETWEEN 0 AND 10000 AND ${t.paymentMethod} IN ('pix','card'))`),
  check("cost_charge_customs_fee", sql`${t.chargeType} != 'customs' OR (${t.feeBps} IS NULL AND ${t.paymentMethod} IS NULL)`),
  check("cost_charge_paid", sql`(${t.paymentStatus} = 'pending' AND ${t.paidAt} IS NULL AND ${t.paidBy} IS NULL) OR (${t.paymentStatus} = 'paid' AND ${t.paidAt} IS NOT NULL AND ${t.paidBy} IS NOT NULL)`),
]);

export const purchasePaymentComponents = sqliteTable("purchase_payment_components", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => purchaseCostOrders.id),
  chargeId: text("charge_id").notNull().references(() => purchaseCostCharges.id), operationId: text("operation_id").notNull().references((): AnySQLiteColumn => financialOperations.id),
  componentOrder: integer("component_order").notNull(), sourceType: text("source_type", { enum: ["balance", "pix", "card"] }).notNull(),
  sourceCurrency: text("source_currency", { enum: ["CNY", "BRL"] }).notNull(), sourceAccountId: text("source_account_id").references((): AnySQLiteColumn => hubbuyAccounts.id),
  principalAmountMinor: integer("principal_amount_minor").notNull(), cnyMinor: integer("cny_minor").notNull(), principalBrlCents: integer("principal_brl_cents").notNull(),
  feeBps: integer("fee_bps").notNull(), feeBrlCents: integer("fee_brl_cents").notNull(),
  conversionCnyMinor: integer("conversion_cny_minor"), conversionBrlCents: integer("conversion_brl_cents"),
  confirmedBy: text("confirmed_by").notNull().references(() => user.id), confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: timestamp("created_at"),
}, t => [
  uniqueIndex("payment_component_order_idx").on(t.orderId, t.componentOrder),
  index("payment_component_charge_idx").on(t.chargeId, t.componentOrder),
  index("payment_component_operation_idx").on(t.operationId),
  check("payment_component_order", sql`typeof(${t.componentOrder}) = 'integer' AND ${t.componentOrder} >= 0`),
  check("payment_component_source", sql`${t.sourceType} IN ('balance','pix','card')`),
  check("payment_component_source_amount", sql`typeof(${t.principalAmountMinor}) = 'integer' AND ${t.principalAmountMinor} BETWEEN 1 AND 1000000000000 AND typeof(${t.cnyMinor}) = 'integer' AND ${t.cnyMinor} BETWEEN 1 AND 1000000000000`),
  check("payment_component_brl", sql`typeof(${t.principalBrlCents}) = 'integer' AND ${t.principalBrlCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.feeBrlCents}) = 'integer' AND ${t.feeBrlCents} BETWEEN 0 AND 1000000000000`),
  check("payment_component_fee", sql`typeof(${t.feeBps}) = 'integer' AND ${t.feeBps} BETWEEN 0 AND 10000`),
  check("payment_component_conversion", sql`(${t.conversionCnyMinor} IS NULL AND ${t.conversionBrlCents} IS NULL) OR (typeof(${t.conversionCnyMinor}) = 'integer' AND ${t.conversionCnyMinor} BETWEEN 1 AND 1000000000000 AND typeof(${t.conversionBrlCents}) = 'integer' AND ${t.conversionBrlCents} BETWEEN 1 AND 1000000000000)`),
  check("payment_component_balance", sql`(${t.sourceType} = 'balance' AND ${t.sourceCurrency} = 'CNY' AND ${t.sourceAccountId} IS NOT NULL AND ${t.feeBps} = 0 AND ${t.feeBrlCents} = 0 AND ${t.principalAmountMinor} = ${t.cnyMinor}) OR (${t.sourceType} IN ('pix','card') AND ${t.sourceCurrency} = 'BRL' AND ${t.sourceAccountId} IS NULL AND ${t.principalAmountMinor} = ${t.principalBrlCents} AND (${t.conversionCnyMinor} IS NOT NULL))`),
]);

export const purchasePaymentAllocations = sqliteTable("purchase_payment_allocations", {
  id: text("id").primaryKey(), componentId: text("component_id").notNull().references(() => purchasePaymentComponents.id),
  costItemId: text("cost_item_id").notNull().references(() => purchaseItemCosts.id),
  costComponent: text("cost_component", { enum: ["product", "china"] }).notNull(), personId: text("person_id").notNull().references(() => user.id),
  allocationOrder: integer("allocation_order").notNull(), cnyMinor: integer("cny_minor").notNull(), principalBrlCents: integer("principal_brl_cents").notNull(),
  feeBrlCents: integer("fee_brl_cents").notNull(), historicalBrlCents: integer("historical_brl_cents").notNull(),
}, t => [
  uniqueIndex("payment_allocation_person_idx").on(t.componentId, t.costItemId, t.costComponent, t.personId),
  uniqueIndex("payment_allocation_order_idx").on(t.componentId, t.allocationOrder),
  index("payment_allocation_cost_item_idx").on(t.costItemId, t.costComponent),
  check("payment_allocation_order", sql`typeof(${t.allocationOrder}) = 'integer' AND ${t.allocationOrder} >= 0`),
  check("payment_allocation_cny", sql`typeof(${t.cnyMinor}) = 'integer' AND ${t.cnyMinor} BETWEEN 1 AND 1000000000000`),
  check("payment_allocation_brl", sql`typeof(${t.principalBrlCents}) = 'integer' AND ${t.principalBrlCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.feeBrlCents}) = 'integer' AND ${t.feeBrlCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.historicalBrlCents}) = 'integer' AND ${t.historicalBrlCents} BETWEEN 0 AND 1000000000000`),
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

export const purchaseCostRefunds = sqliteTable("purchase_cost_refunds", {
  id: text("id").primaryKey(),
  trackingId: text("tracking_id").notNull().references(() => purchaseCostTrackings.id),
  costItemId: text("cost_item_id").notNull().references(() => purchaseItemCosts.id),
  status: text("status", { enum: ["requested", "received", "voided"] }).notNull(),
  quantity: integer("quantity").notNull(),
  requestedProductCents: integer("requested_product_cents").notNull(),
  requestedChinaCents: integer("requested_china_cents").notNull(),
  requestedProductCnyMinor: integer("requested_product_cny_minor"),
  requestedChinaCnyMinor: integer("requested_china_cny_minor"),
  receivedProductCents: integer("received_product_cents"),
  receivedChinaCents: integer("received_china_cents"),
  refundDestination: text("refund_destination", { enum: ["hubbuy", "external"] }),
  hubbuyAccountId: text("hubbuy_account_id").references((): AnySQLiteColumn => hubbuyAccounts.id),
  receivedProductCnyMinor: integer("received_product_cny_minor"),
  receivedChinaCnyMinor: integer("received_china_cny_minor"),
  nativeEvidence: text("native_evidence"),
  creditOperationId: text("credit_operation_id").references((): AnySQLiteColumn => financialOperations.id),
  receiptOperationId: text("receipt_operation_id").references((): AnySQLiteColumn => financialOperations.id),
  reason: text("reason").notNull(),
  unitStart: integer("unit_start").notNull().default(0),
  originalItemQuantity: integer("original_item_quantity").notNull(),
  originalProductUnitCents: integer("original_product_unit_cents").notNull(),
  originalChinaUnitCents: integer("original_china_unit_cents").notNull(),
  originalChargeBaseCents: integer("original_charge_base_cents"),
  originalChargeFeeCents: integer("original_charge_fee_cents"),
  originalItemFeeCents: integer("original_item_fee_cents"),
  originalPaymentMethod: text("original_payment_method", { enum: ["pix", "card"] }),
  originalFeeBps: integer("original_fee_bps"),
  originalPaidAt: integer("original_paid_at", { mode: "timestamp_ms" }),
  originalPaidBy: text("original_paid_by").references(() => user.id),
  requestedAt: timestamp("requested_at"),
  requestedBy: text("requested_by").notNull().references(() => user.id),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }),
  receivedBy: text("received_by").references(() => user.id),
  voidedAt: integer("voided_at", { mode: "timestamp_ms" }),
  voidedBy: text("voided_by").references(() => user.id),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
  updatedBy: text("updated_by").notNull().references(() => user.id),
}, t => [
  index("cost_refund_tracking_status_idx").on(t.trackingId, t.status),
  index("cost_refund_item_status_idx").on(t.costItemId, t.status),
  index("cost_refund_requested_order_idx").on(t.trackingId, t.requestedAt, t.id),
  check("cost_refund_status", sql`${t.status} IN ('requested','received','voided')`),
  check("cost_refund_destination", sql`(${t.refundDestination} IS NULL AND ${t.hubbuyAccountId} IS NULL AND ${t.receivedProductCnyMinor} IS NULL AND ${t.receivedChinaCnyMinor} IS NULL AND ${t.nativeEvidence} IS NULL AND ${t.creditOperationId} IS NULL) OR (${t.refundDestination} = 'external' AND ${t.hubbuyAccountId} IS NULL AND ${t.receivedProductCnyMinor} IS NULL AND ${t.receivedChinaCnyMinor} IS NULL AND ${t.nativeEvidence} IS NULL AND ${t.creditOperationId} IS NULL) OR (${t.refundDestination} = 'hubbuy' AND ${t.hubbuyAccountId} IS NOT NULL AND typeof(${t.receivedProductCnyMinor}) = 'integer' AND ${t.receivedProductCnyMinor} BETWEEN 0 AND 1000000000000 AND typeof(${t.receivedChinaCnyMinor}) = 'integer' AND ${t.receivedChinaCnyMinor} BETWEEN 0 AND 1000000000000 AND length(trim(${t.nativeEvidence})) BETWEEN 3 AND 1000 AND ((${t.receivedProductCnyMinor} + ${t.receivedChinaCnyMinor} = 0 AND ${t.creditOperationId} IS NULL) OR (${t.receivedProductCnyMinor} + ${t.receivedChinaCnyMinor} > 0 AND ${t.creditOperationId} IS NOT NULL)))`),
  check("cost_refund_quantity", sql`typeof(${t.quantity}) = 'integer' AND ${t.quantity} BETWEEN 1 AND 10000`),
  check("cost_refund_requested_amounts", sql`typeof(${t.requestedProductCents}) = 'integer' AND ${t.requestedProductCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.requestedChinaCents}) = 'integer' AND ${t.requestedChinaCents} BETWEEN 0 AND 1000000000000 AND ((${t.requestedProductCnyMinor} IS NULL AND ${t.requestedChinaCnyMinor} IS NULL AND ${t.requestedProductCents} + ${t.requestedChinaCents} > 0) OR (typeof(${t.requestedProductCnyMinor}) = 'integer' AND ${t.requestedProductCnyMinor} BETWEEN 0 AND 1000000000000 AND typeof(${t.requestedChinaCnyMinor}) = 'integer' AND ${t.requestedChinaCnyMinor} BETWEEN 0 AND 1000000000000 AND ${t.requestedProductCnyMinor} + ${t.requestedChinaCnyMinor} BETWEEN 1 AND 1000000000000))`),
  check("cost_refund_received_state", sql`(${t.status} = 'requested' AND ${t.receivedProductCents} IS NULL AND ${t.receivedChinaCents} IS NULL AND ${t.receivedAt} IS NULL AND ${t.receivedBy} IS NULL) OR (${t.status} IN ('received','voided') AND ((${t.receivedProductCents} IS NULL AND ${t.receivedChinaCents} IS NULL AND ${t.receivedAt} IS NULL AND ${t.receivedBy} IS NULL) OR (typeof(${t.receivedProductCents}) = 'integer' AND ${t.receivedProductCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.receivedChinaCents}) = 'integer' AND ${t.receivedChinaCents} BETWEEN 0 AND 1000000000000 AND ${t.receivedAt} IS NOT NULL AND ${t.receivedBy} IS NOT NULL)))`),
  check("cost_refund_void_state", sql`(${t.status} = 'voided' AND ${t.voidedAt} IS NOT NULL AND ${t.voidedBy} IS NOT NULL AND length(trim(${t.voidReason})) > 0) OR (${t.status} != 'voided' AND ${t.voidedAt} IS NULL AND ${t.voidedBy} IS NULL AND ${t.voidReason} IS NULL)`),
  check("cost_refund_original_values", sql`typeof(${t.originalItemQuantity}) = 'integer' AND ${t.originalItemQuantity} BETWEEN 1 AND 10000 AND typeof(${t.originalProductUnitCents}) = 'integer' AND ${t.originalProductUnitCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.originalChinaUnitCents}) = 'integer' AND ${t.originalChinaUnitCents} BETWEEN 0 AND 1000000000000`),
  check("cost_refund_unit_range", sql`typeof(${t.unitStart}) = 'integer' AND ${t.unitStart} >= 0 AND ${t.unitStart} + ${t.quantity} <= ${t.originalItemQuantity}`),
  check("cost_refund_fee_snapshot", sql`(${t.originalPaymentMethod} IS NULL AND ${t.originalFeeBps} IS NULL) OR (${t.originalPaymentMethod} IN ('pix','card') AND typeof(${t.originalFeeBps}) = 'integer' AND ${t.originalFeeBps} BETWEEN 0 AND 10000)`),
  check("cost_refund_reason", sql`length(trim(${t.reason})) BETWEEN 1 AND 1000`),
]);

export const purchaseRefundPaymentAllocations = sqliteTable("purchase_refund_payment_allocations", {
  id: text("id").primaryKey(), refundId: text("refund_id").notNull().references(() => purchaseCostRefunds.id),
  operationId: text("operation_id").notNull().references((): AnySQLiteColumn => financialOperations.id),
  paymentAllocationId: text("payment_allocation_id").references((): AnySQLiteColumn => purchasePaymentAllocations.id),
  balanceConsumptionId: text("balance_consumption_id").references((): AnySQLiteColumn => hubbuyBalanceConsumptions.id),
  costComponent: text("cost_component", { enum: ["product", "china"] }).notNull(),
  sourceType: text("source_type", { enum: ["legacy_single", "balance", "pix", "card"] }).notNull(),
  personId: text("person_id").notNull().references(() => user.id), allocationOrder: integer("allocation_order").notNull(),
  cnyMinor: integer("cny_minor").notNull(), principalBrlCents: integer("principal_brl_cents").notNull(),
  feeBrlCents: integer("fee_brl_cents").notNull(), historicalBrlCents: integer("historical_brl_cents").notNull(),
}, t => [
  uniqueIndex("refund_payment_allocation_order_idx").on(t.refundId, t.operationId, t.allocationOrder),
  index("refund_payment_allocation_source_idx").on(t.paymentAllocationId, t.costComponent),
  index("refund_payment_allocation_operation_idx").on(t.operationId, t.refundId),
  index("refund_payment_allocation_person_idx").on(t.refundId, t.personId, t.costComponent),
  check("refund_payment_allocation_order", sql`typeof(${t.allocationOrder}) = 'integer' AND ${t.allocationOrder} >= 0`),
  check("refund_payment_allocation_cny", sql`typeof(${t.cnyMinor}) = 'integer' AND ${t.cnyMinor} BETWEEN 0 AND 1000000000000`),
  check("refund_payment_allocation_brl", sql`typeof(${t.principalBrlCents}) = 'integer' AND ${t.principalBrlCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.feeBrlCents}) = 'integer' AND ${t.feeBrlCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.historicalBrlCents}) = 'integer' AND ${t.historicalBrlCents} BETWEEN 0 AND 1000000000000`),
  check("refund_payment_allocation_origin", sql`(${t.sourceType} = 'legacy_single' AND ${t.paymentAllocationId} IS NULL) OR (${t.sourceType} != 'legacy_single' AND ${t.paymentAllocationId} IS NOT NULL)`),
  check("refund_payment_allocation_consumption", sql`${t.balanceConsumptionId} IS NULL OR (${t.sourceType} = 'balance' AND ${t.paymentAllocationId} IS NOT NULL)`),
]);

export const purchaseCostRefundParticipants = sqliteTable("purchase_cost_refund_participants", {
  refundId: text("refund_id").notNull().references(() => purchaseCostRefunds.id),
  personId: text("person_id").notNull().references(() => user.id),
  allocationOrder: integer("allocation_order").notNull(),
  weightMode: text("weight_mode", { enum: ["equal", "percentage", "fixed"] }).notNull(),
  weight: integer("weight").notNull(),
  originalProductShareCents: integer("original_product_share_cents").notNull(),
  originalChinaShareCents: integer("original_china_share_cents").notNull(),
  originalProductFeeShareCents: integer("original_product_fee_share_cents").notNull(),
}, t => [
  primaryKey({ columns: [t.refundId, t.personId] }),
  uniqueIndex("cost_refund_participant_order_idx").on(t.refundId, t.allocationOrder),
  check("cost_refund_participant_order", sql`typeof(${t.allocationOrder}) = 'integer' AND ${t.allocationOrder} >= 0`),
  check("cost_refund_participant_weight", sql`typeof(${t.weight}) = 'integer' AND ${t.weight} BETWEEN 0 AND 1000000000000`),
  check("cost_refund_participant_mode", sql`${t.weightMode} IN ('equal','percentage','fixed')`),
  check("cost_refund_participant_shares", sql`typeof(${t.originalProductShareCents}) = 'integer' AND ${t.originalProductShareCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.originalChinaShareCents}) = 'integer' AND ${t.originalChinaShareCents} BETWEEN 0 AND 1000000000000 AND typeof(${t.originalProductFeeShareCents}) = 'integer' AND ${t.originalProductFeeShareCents} BETWEEN 0 AND 1000000000000`),
]);

export const purchaseCostRefundEvents = sqliteTable("purchase_cost_refund_events", {
  id: text("id").primaryKey(),
  refundId: text("refund_id").notNull().references(() => purchaseCostRefunds.id),
  eventOrder: integer("event_order").notNull(),
  eventType: text("event_type", { enum: ["requested", "request_updated", "received", "receipt_corrected", "voided"] }).notNull(),
  actorId: text("actor_id").notNull().references(() => user.id),
  createdAt: timestamp("created_at"),
  reason: text("reason"),
  detailsJson: text("details_json").notNull(),
}, t => [
  uniqueIndex("cost_refund_event_order_idx").on(t.refundId, t.eventOrder),
  index("cost_refund_event_refund_idx").on(t.refundId, t.createdAt),
  check("cost_refund_event_order", sql`typeof(${t.eventOrder}) = 'integer' AND ${t.eventOrder} >= 0`),
  check("cost_refund_event_type", sql`${t.eventType} IN ('requested','request_updated','received','receipt_corrected','voided')`),
  check("cost_refund_event_json", sql`json_valid(${t.detailsJson})`),
]);

// HubBuy QC is an independent evidence catalog. It deliberately has no writes
// to purchases, snapshots, package costs, payments or refunds.
export const qcImports = sqliteTable("qc_imports", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  purchaseId: text("purchase_id").notNull().references(() => purchases.id), actorId: text("actor_id").notNull().references(() => user.id),
  manifestJson: text("manifest_json").notNull(), status: text("status", { enum: ["prepared", "confirmed", "expired"] }).notNull(),
  revision: integer("revision").notNull().default(0), bytesReserved: integer("bytes_reserved").notNull().default(0), bytesConsumed: integer("bytes_consumed").notNull().default(0),
  expiresAt: timestamp("expires_at"), createdAt: timestamp("created_at"), updatedAt: timestamp("updated_at"),
}, t => [index("qc_import_purchase_idx").on(t.purchaseId, t.createdAt), check("qc_import_manifest_json", sql`json_valid(${t.manifestJson})`), check("qc_import_status", sql`${t.status} IN ('prepared','confirmed','expired')`), check("qc_import_revision", sql`typeof(${t.revision}) = 'integer' AND ${t.revision} >= 0`), check("qc_import_bytes", sql`typeof(${t.bytesReserved}) = 'integer' AND ${t.bytesReserved} BETWEEN 0 AND 209715200 AND typeof(${t.bytesConsumed}) = 'integer' AND ${t.bytesConsumed} BETWEEN 0 AND 209715200`)]);

export const hubbuyExternalItems = sqliteTable("hubbuy_external_items", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), purchaseId: text("purchase_id").notNull().references(() => purchases.id),
  purchaseItemId: text("purchase_item_id").references(() => purchaseItems.id), additionalOrderItemId: text("additional_order_item_id").references(() => purchaseAdditionalOrderItems.id), orderGoodsId: text("order_goods_id"), orderGoodsNo: text("order_goods_no"),
  orderNo: text("order_no"), offerId: text("offer_id"), channel: text("channel"), offerUrl: text("offer_url"), skuInfo: text("sku_info"), title: text("title"), quantity: integer("quantity"),
  revision: integer("revision").notNull().default(0), confirmedBy: text("confirmed_by").references(() => user.id), confirmedAt: integer("confirmed_at", { mode: "timestamp_ms" }), createdAt: timestamp("created_at"), updatedAt: timestamp("updated_at"),
}, t => [uniqueIndex("qc_external_purchase_order_goods_idx").on(t.purchaseId, t.orderNo, t.orderGoodsId).where(sql`${t.orderGoodsId} IS NOT NULL`), uniqueIndex("qc_external_purchase_goods_no_idx").on(t.purchaseId, t.orderNo, t.orderGoodsNo).where(sql`${t.orderGoodsNo} IS NOT NULL`), index("qc_external_purchase_item_idx").on(t.purchaseItemId), index("qc_external_additional_item_idx").on(t.additionalOrderItemId), check("qc_external_target_origin", sql`NOT (${t.purchaseItemId} IS NOT NULL AND ${t.additionalOrderItemId} IS NOT NULL)`), check("qc_external_revision", sql`typeof(${t.revision}) = 'integer' AND ${t.revision} >= 0`), check("qc_external_quantity", sql`${t.quantity} IS NULL OR (typeof(${t.quantity}) = 'integer' AND ${t.quantity} BETWEEN 0 AND 10000)`)]);

export const qcImages = sqliteTable("qc_images", {
  id: text("id").primaryKey(), externalItemId: text("external_item_id").notNull().references(() => hubbuyExternalItems.id),
  sourceUrl: text("source_url").notNull(), sourceUrlHash: text("source_url_hash").notNull(), contentSha256: text("content_sha256"), r2Key: text("r2_key").notNull(),
  status: text("status", { enum: ["pending", "ready", "failed", "deleted"] }).notNull(), deleteState: text("delete_state", { enum: ["none", "pending", "deleted"] }).notNull().default("none"),
  mimeType: text("mime_type"), byteSize: integer("byte_size"), width: integer("width"), height: integer("height"), ordinal: integer("ordinal").notNull(),
  revision: integer("revision").notNull().default(0), claimToken: text("claim_token"), claimExpiresAt: integer("claim_expires_at", { mode: "timestamp_ms" }), errorCode: text("error_code"),
  createdBy: text("created_by").notNull().references(() => user.id), createdAt: timestamp("created_at"), updatedAt: timestamp("updated_at"), deletedAt: integer("deleted_at", { mode: "timestamp_ms" }), deletedBy: text("deleted_by").references(() => user.id),
}, t => [uniqueIndex("qc_image_external_content_idx").on(t.externalItemId, t.contentSha256).where(sql`${t.contentSha256} IS NOT NULL`), uniqueIndex("qc_image_external_source_idx").on(t.externalItemId, t.sourceUrlHash), uniqueIndex("qc_image_r2_key_idx").on(t.r2Key), index("qc_image_external_state_idx").on(t.externalItemId, t.status, t.ordinal), check("qc_image_state", sql`(${t.status} = 'deleted' AND ${t.deletedAt} IS NOT NULL AND ${t.deletedBy} IS NOT NULL AND ${t.deleteState} IN ('pending','deleted')) OR (${t.status} != 'deleted' AND ${t.deletedAt} IS NULL AND ${t.deletedBy} IS NULL AND ${t.deleteState} = 'none')`), check("qc_image_ready", sql`${t.status} != 'ready' OR (${t.contentSha256} IS NOT NULL AND ${t.mimeType} IN ('image/jpeg','image/png','image/webp') AND typeof(${t.byteSize}) = 'integer' AND ${t.byteSize} BETWEEN 1 AND 8388608 AND typeof(${t.width}) = 'integer' AND ${t.width} BETWEEN 1 AND 8192 AND typeof(${t.height}) = 'integer' AND ${t.height} BETWEEN 1 AND 8192)`), check("qc_image_ordinal", sql`typeof(${t.ordinal}) = 'integer' AND ${t.ordinal} BETWEEN 0 AND 199`)]);

// A shared cover is presentation state for one purchased item. It never
// changes the immutable purchase snapshot or package/cost calculations.
export const qcPresentations = sqliteTable("qc_presentations", {
  purchaseItemId: text("purchase_item_id").primaryKey().references(() => purchaseItems.id),
  primaryImageId: text("primary_image_id").references(() => qcImages.id),
  revision: integer("revision").notNull().default(0),
  updatedBy: text("updated_by").references(() => user.id),
  updatedAt: timestamp("updated_at"),
}, t => [check("qc_presentation_revision", sql`typeof(${t.revision}) = 'integer' AND ${t.revision} >= 0`)]);

export const qcAdditionalPresentations = sqliteTable("qc_additional_presentations", {
  additionalOrderItemId: text("additional_order_item_id").primaryKey().references(() => purchaseAdditionalOrderItems.id),
  primaryImageId: text("primary_image_id").references(() => qcImages.id),
  revision: integer("revision").notNull().default(0),
  updatedBy: text("updated_by").references(() => user.id),
  updatedAt: timestamp("updated_at"),
}, t => [check("qc_additional_presentation_revision", sql`typeof(${t.revision}) = 'integer' AND ${t.revision} >= 0`)]);

// Private, generated, versioned 160px previews. The object key is generated
// server-side and is never exposed to clients.
export const qcImagePreviews = sqliteTable("qc_image_previews", {
  imageId: text("image_id").primaryKey().references(() => qcImages.id),
  r2Key: text("r2_key").notNull(), transformVersion: text("transform_version").notNull(),
  status: text("status", { enum: ["pending", "ready", "failed", "deleted"] }).notNull(),
  deleteState: text("delete_state", { enum: ["none", "pending", "deleted"] }).notNull().default("none"),
  sha256: text("sha256"), byteSize: integer("byte_size"), width: integer("width"), height: integer("height"),
  revision: integer("revision").notNull().default(0), claimToken: text("claim_token"), claimExpiresAt: integer("claim_expires_at", { mode: "timestamp_ms" }),
  errorCode: text("error_code"), deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  createdAt: timestamp("created_at"), updatedAt: timestamp("updated_at"),
}, t => [uniqueIndex("qc_image_preview_key_idx").on(t.r2Key), index("qc_preview_state_idx").on(t.status, t.updatedAt), check("qc_preview_state", sql`(${t.status} = 'deleted' AND ${t.deletedAt} IS NOT NULL AND ${t.deleteState} IN ('pending','deleted')) OR (${t.status} != 'deleted' AND ${t.deletedAt} IS NULL AND ${t.deleteState} = 'none')`), check("qc_preview_revision", sql`typeof(${t.revision}) = 'integer' AND ${t.revision} >= 0`), check("qc_preview_ready", sql`${t.status} != 'ready' OR (${t.sha256} IS NOT NULL AND typeof(${t.byteSize}) = 'integer' AND ${t.byteSize} BETWEEN 1 AND 131072 AND typeof(${t.width}) = 'integer' AND ${t.width} BETWEEN 1 AND 160 AND typeof(${t.height}) = 'integer' AND ${t.height} BETWEEN 1 AND 160)`)]);

export const qcImageSources = sqliteTable("qc_image_sources", {
  id: text("id").primaryKey(), importId: text("import_id").references(() => qcImports.id), externalItemId: text("external_item_id").notNull().references(() => hubbuyExternalItems.id), imageId: text("image_id").references(() => qcImages.id),
  sourceUrl: text("source_url").notNull(), sourceUrlHash: text("source_url_hash").notNull(), ordinal: integer("ordinal").notNull(),
  state: text("state", { enum: ["pending", "ready", "failed", "deleted"] }).notNull(), attempts: integer("attempts").notNull().default(0), bytesReserved: integer("bytes_reserved").notNull().default(0), bytesConsumed: integer("bytes_consumed").notNull().default(0), errorCode: text("error_code"), createdAt: timestamp("created_at"), updatedAt: timestamp("updated_at"),
}, t => [uniqueIndex("qc_source_external_hash_idx").on(t.externalItemId, t.sourceUrlHash), index("qc_source_work_idx").on(t.state, t.updatedAt), check("qc_source_ordinal", sql`typeof(${t.ordinal}) = 'integer' AND ${t.ordinal} BETWEEN 0 AND 199`), check("qc_source_attempts", sql`typeof(${t.attempts}) = 'integer' AND ${t.attempts} >= 0`), check("qc_source_budget", sql`typeof(${t.bytesReserved}) = 'integer' AND ${t.bytesReserved} BETWEEN 0 AND 8388608 AND typeof(${t.bytesConsumed}) = 'integer' AND ${t.bytesConsumed} BETWEEN 0 AND 209715200`)]);

export const qcEvents = sqliteTable("qc_events", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id), purchaseId: text("purchase_id").notNull().references(() => purchases.id), actorId: text("actor_id").references(() => user.id),
  eventType: text("event_type", { enum: ["QC_IMPORT", "QC_MATCH", "QC_DELETE", "QC_FALLBACK"] }).notNull(), resultCode: text("result_code").notNull(), contextJson: text("context_json").notNull(), createdAt: timestamp("created_at"),
}, t => [index("qc_event_purchase_idx").on(t.purchaseId, t.createdAt), check("qc_event_context_json", sql`json_valid(${t.contextJson})`)]);

export const qcRateLimits = sqliteTable("qc_rate_limits", {
  key: text("key").primaryKey(), windowStart: integer("window_start").notNull(), count: integer("count").notNull(),
}, t => [check("qc_rate_count", sql`typeof(${t.count}) = 'integer' AND ${t.count} >= 0`)]);

export const qcTransferLocks = sqliteTable("qc_transfer_locks", {
  scope: text("scope").primaryKey(), ownerId: text("owner_id").notNull(), version: integer("version").notNull(), leaseUntil: integer("lease_until").notNull(), updatedAt: timestamp("updated_at"),
}, t => [check("qc_transfer_lock_version", sql`typeof(${t.version}) = 'integer' AND ${t.version} >= 0`)]);

export const hubbuyAccounts = sqliteTable("hubbuy_accounts", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  label: text("label").notNull(), email: text("email"), currency: text("currency", { enum: ["CNY"] }).notNull().default("CNY"),
  status: text("status", { enum: ["reconciling", "active", "archived"] }).notNull().default("reconciling"),
  balanceCnyMinor: integer("balance_cny_minor").notNull().default(0), revision: integer("revision").notNull().default(0),
  createdBy: text("created_by").notNull().references(() => user.id), createdAt: timestamp("created_at"),
  updatedBy: text("updated_by").notNull().references(() => user.id), updatedAt: timestamp("updated_at"),
  reconciledBy: text("reconciled_by").references(() => user.id), reconciledAt: integer("reconciled_at", { mode: "timestamp_ms" }),
  // Paired tombstone and retained audit identity; enforced by lifecycle triggers.
  deletedAt: integer("deleted_at", { mode: "timestamp_ms" }), deletedBy: text("deleted_by").references(() => user.id),
}, t => [
  index("hubbuy_account_workspace_idx").on(t.workspaceId, t.status, t.createdAt),
  check("hubbuy_account_label", sql`length(trim(${t.label})) BETWEEN 1 AND 100`),
  check("hubbuy_account_currency", sql`${t.currency} = 'CNY'`),
  check("hubbuy_account_status", sql`${t.status} IN ('reconciling','active','archived')`),
  check("hubbuy_account_balance", sql`typeof(${t.balanceCnyMinor}) = 'integer' AND ${t.balanceCnyMinor} BETWEEN 0 AND 1000000000000`),
  check("hubbuy_account_revision", sql`typeof(${t.revision}) = 'integer' AND ${t.revision} >= 0`),
  check("hubbuy_account_reconciled", sql`(${t.status} = 'active' AND ${t.reconciledAt} IS NOT NULL AND ${t.reconciledBy} IS NOT NULL) OR (${t.status} != 'active')`),
]);

export const hubbuyReconciliationRuns = sqliteTable("hubbuy_reconciliation_runs", {
  accountId: text("account_id").primaryKey().references(() => hubbuyAccounts.id),
  mode: text("mode", { enum: ["chronological", "remainder"] }).notNull(),
  priorActivityDescription: text("prior_activity_description"), priorActivityOccurredAt: integer("prior_activity_occurred_at", { mode: "timestamp_ms" }),
  startedBy: text("started_by").notNull().references(() => user.id), startedAt: timestamp("started_at"),
}, t => [
  check("hubbuy_reconciliation_mode", sql`(${t.mode} = 'chronological' AND ${t.priorActivityDescription} IS NULL) OR (${t.mode} = 'remainder' AND length(trim(${t.priorActivityDescription})) BETWEEN 1 AND 1000)`),
]);

export const financialOperations = sqliteTable("financial_operations", {
  id: text("id").primaryKey(), workspaceId: text("workspace_id").notNull().references(() => workspaces.id),
  operationType: text("operation_type").notNull(), idempotencyKey: text("idempotency_key").notNull(), payloadHash: text("payload_hash").notNull(),
  actorId: text("actor_id").notNull().references(() => user.id), occurredAt: integer("occurred_at", { mode: "timestamp_ms" }),
  recordedAt: timestamp("recorded_at"), reason: text("reason"), reversalOfId: text("reversal_of_id"), contextJson: text("context_json").notNull(),
}, t => [
  uniqueIndex("financial_operation_idempotency_idx").on(t.workspaceId, t.idempotencyKey),
  index("financial_operation_type_idx").on(t.workspaceId, t.operationType, t.recordedAt),
  check("financial_operation_key", sql`length(trim(${t.idempotencyKey})) BETWEEN 1 AND 200`),
  check("financial_operation_hash", sql`length(${t.payloadHash}) = 64`),
  check("financial_operation_context", sql`json_valid(${t.contextJson})`),
  check("financial_operation_reason", sql`${t.reason} IS NULL OR length(trim(${t.reason})) BETWEEN 1 AND 1000`),
]);

export const hubbuyBalanceEntries = sqliteTable("hubbuy_balance_entries", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => hubbuyAccounts.id),
  operationId: text("operation_id").notNull().references(() => financialOperations.id), sequence: integer("sequence").notNull(),
  direction: text("direction", { enum: ["credit", "debit"] }).notNull(), amountCnyMinor: integer("amount_cny_minor").notNull(),
  historicalBrlCents: integer("historical_brl_cents"), sourceType: text("source_type", { enum: ["refund_received", "manual_adjustment", "opening_balance", "purchase_payment", "refund_offset", "reversal"] }).notNull(), sourceId: text("source_id").notNull(),
  reversalOfEntryId: text("reversal_of_entry_id").references((): AnySQLiteColumn => hubbuyBalanceEntries.id), createdAt: timestamp("created_at"),
}, t => [
  uniqueIndex("hubbuy_balance_sequence_idx").on(t.accountId, t.sequence),
  uniqueIndex("hubbuy_balance_operation_source_idx").on(t.operationId, t.accountId, t.direction, t.sourceType, t.sourceId),
  index("hubbuy_balance_account_order_idx").on(t.accountId, t.sequence),
  check("hubbuy_balance_entry_sequence", sql`typeof(${t.sequence}) = 'integer' AND ${t.sequence} >= 0`),
  check("hubbuy_balance_entry_direction", sql`${t.direction} IN ('credit','debit')`),
  check("hubbuy_balance_entry_amount", sql`typeof(${t.amountCnyMinor}) = 'integer' AND ${t.amountCnyMinor} BETWEEN 1 AND 1000000000000`),
  check("hubbuy_balance_entry_basis", sql`${t.historicalBrlCents} IS NULL OR (typeof(${t.historicalBrlCents}) = 'integer' AND ${t.historicalBrlCents} BETWEEN 0 AND 1000000000000)`),
  check("hubbuy_balance_entry_source", sql`${t.sourceType} IN ('refund_received','manual_adjustment','opening_balance','purchase_payment','refund_offset','reversal') AND length(trim(${t.sourceId})) BETWEEN 1 AND 200`),
]);

export const hubbuyBalanceAdjustments = sqliteTable("hubbuy_balance_adjustments", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull().references(() => hubbuyAccounts.id),
  operationId: text("operation_id").notNull().references(() => financialOperations.id),
  balanceEntryId: text("balance_entry_id").notNull().references(() => hubbuyBalanceEntries.id),
  kind: text("kind", { enum: ["promotional_bonus", "documented_credit", "documented_debit", "reversal"] }).notNull(),
  externalReference: text("external_reference"),
  reversesAdjustmentId: text("reverses_adjustment_id").references((): AnySQLiteColumn => hubbuyBalanceAdjustments.id),
}, t => [
  uniqueIndex("hubbuy_adjustment_operation_idx").on(t.operationId),
  uniqueIndex("hubbuy_adjustment_entry_idx").on(t.balanceEntryId),
  uniqueIndex("hubbuy_adjustment_reversal_idx").on(t.reversesAdjustmentId),
  index("hubbuy_adjustment_reference_idx").on(t.accountId, t.externalReference),
  check("hubbuy_adjustment_kind", sql`${t.kind} IN ('promotional_bonus','documented_credit','documented_debit','reversal')`),
  check("hubbuy_adjustment_reference", sql`${t.externalReference} IS NULL OR length(trim(${t.externalReference})) BETWEEN 1 AND 200`),
  check("hubbuy_adjustment_reversal", sql`(${t.kind} = 'reversal' AND ${t.reversesAdjustmentId} IS NOT NULL AND ${t.externalReference} IS NULL) OR (${t.kind} != 'reversal' AND ${t.reversesAdjustmentId} IS NULL)`),
]);

export const hubbuyReconciliationEvents = sqliteTable("hubbuy_reconciliation_events", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull().references(() => hubbuyAccounts.id),
  operationId: text("operation_id").notNull().references(() => financialOperations.id), balanceEntryId: text("balance_entry_id").notNull().references(() => hubbuyBalanceEntries.id),
  eventType: text("event_type", { enum: ["legacy_receipt", "synthetic_use"] }).notNull(), sourceReference: text("source_reference"), description: text("description").notNull(),
  amountCnyMinor: integer("amount_cny_minor").notNull(), historicalBrlCents: integer("historical_brl_cents").notNull(), occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  createdBy: text("created_by").notNull().references(() => user.id), recordedAt: timestamp("recorded_at"),
}, t => [
  uniqueIndex("hubbuy_reconciliation_event_operation_idx").on(t.operationId),
  uniqueIndex("hubbuy_reconciliation_event_entry_idx").on(t.balanceEntryId),
  uniqueIndex("hubbuy_reconciliation_source_reference_idx").on(t.accountId, t.sourceReference).where(sql`${t.sourceReference} IS NOT NULL`),
  index("hubbuy_reconciliation_event_order_idx").on(t.accountId, t.occurredAt, t.recordedAt),
  check("hubbuy_reconciliation_event_type", sql`${t.eventType} IN ('legacy_receipt','synthetic_use')`),
  check("hubbuy_reconciliation_event_description", sql`length(trim(${t.description})) BETWEEN 1 AND 1000`),
  check("hubbuy_reconciliation_event_reference", sql`${t.sourceReference} IS NULL OR length(trim(${t.sourceReference})) BETWEEN 1 AND 200`),
  check("hubbuy_reconciliation_event_amount", sql`typeof(${t.amountCnyMinor}) = 'integer' AND ${t.amountCnyMinor} BETWEEN 1 AND 1000000000000`),
  check("hubbuy_reconciliation_event_basis", sql`typeof(${t.historicalBrlCents}) = 'integer' AND ${t.historicalBrlCents} BETWEEN 0 AND 1000000000000`),
]);

export const hubbuyBalanceCreditShares = sqliteTable("hubbuy_balance_credit_shares", {
  id: text("id").primaryKey(), creditEntryId: text("credit_entry_id").notNull().references(() => hubbuyBalanceEntries.id),
  personId: text("person_id").notNull().references(() => user.id), allocationOrder: integer("allocation_order").notNull(),
  amountCnyMinor: integer("amount_cny_minor").notNull(), historicalBrlCents: integer("historical_brl_cents").notNull(),
}, t => [
  uniqueIndex("hubbuy_credit_share_person_idx").on(t.creditEntryId, t.personId),
  uniqueIndex("hubbuy_credit_share_order_idx").on(t.creditEntryId, t.allocationOrder),
  index("hubbuy_credit_share_person_order_idx").on(t.personId, t.creditEntryId),
  check("hubbuy_credit_share_order", sql`typeof(${t.allocationOrder}) = 'integer' AND ${t.allocationOrder} >= 0`),
  check("hubbuy_credit_share_cny", sql`typeof(${t.amountCnyMinor}) = 'integer' AND ${t.amountCnyMinor} BETWEEN 1 AND 1000000000000`),
  check("hubbuy_credit_share_brl", sql`typeof(${t.historicalBrlCents}) = 'integer' AND ${t.historicalBrlCents} BETWEEN 0 AND 1000000000000`),
]);

export const hubbuyBalanceConsumptions = sqliteTable("hubbuy_balance_consumptions", {
  id: text("id").primaryKey(), debitEntryId: text("debit_entry_id").notNull().references(() => hubbuyBalanceEntries.id),
  creditShareId: text("credit_share_id").notNull().references(() => hubbuyBalanceCreditShares.id), allocationOrder: integer("allocation_order").notNull(),
  amountCnyMinor: integer("amount_cny_minor").notNull(), historicalBrlCents: integer("historical_brl_cents").notNull(),
  paymentAllocationId: text("payment_allocation_id").references((): AnySQLiteColumn => purchasePaymentAllocations.id), createdAt: timestamp("created_at"),
}, t => [
  uniqueIndex("hubbuy_consumption_order_idx").on(t.debitEntryId, t.allocationOrder),
  index("hubbuy_consumption_share_idx").on(t.creditShareId),
  check("hubbuy_consumption_order", sql`typeof(${t.allocationOrder}) = 'integer' AND ${t.allocationOrder} >= 0`),
  check("hubbuy_consumption_cny", sql`typeof(${t.amountCnyMinor}) = 'integer' AND ${t.amountCnyMinor} BETWEEN 1 AND 1000000000000`),
  check("hubbuy_consumption_brl", sql`typeof(${t.historicalBrlCents}) = 'integer' AND ${t.historicalBrlCents} BETWEEN 0 AND 1000000000000`),
]);

export const memberBalanceFinancingEntries = sqliteTable("member_balance_financing_entries", {
  id: text("id").primaryKey(), operationId: text("operation_id").notNull().references(() => financialOperations.id),
  consumptionId: text("consumption_id").notNull().references(() => hubbuyBalanceConsumptions.id),
  entryType: text("entry_type", { enum: ["advance", "settlement", "refund_offset", "reversal"] }).notNull(),
  lenderId: text("lender_id").notNull().references(() => user.id), beneficiaryId: text("beneficiary_id").notNull().references(() => user.id),
  amountCnyMinor: integer("amount_cny_minor").notNull(), historicalBrlCents: integer("historical_brl_cents").notNull(),
  settledAmountCents: integer("settled_amount_cents"), settledCurrency: text("settled_currency", { enum: ["BRL", "CNY"] }),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }), recordedAt: timestamp("recorded_at"),
}, t => [
  index("member_financing_people_idx").on(t.lenderId, t.beneficiaryId, t.recordedAt),
  index("member_financing_consumption_idx").on(t.consumptionId, t.entryType),
  check("member_financing_type", sql`${t.entryType} IN ('advance','settlement','refund_offset','reversal')`),
  check("member_financing_people", sql`${t.lenderId} != ${t.beneficiaryId}`),
  check("member_financing_cny", sql`typeof(${t.amountCnyMinor}) = 'integer' AND ${t.amountCnyMinor} BETWEEN 1 AND 1000000000000`),
  check("member_financing_basis", sql`typeof(${t.historicalBrlCents}) = 'integer' AND ${t.historicalBrlCents} BETWEEN 0 AND 1000000000000`),
  check("member_financing_settlement", sql`(${t.settledAmountCents} IS NULL AND ${t.settledCurrency} IS NULL) OR (typeof(${t.settledAmountCents}) = 'integer' AND ${t.settledAmountCents} BETWEEN 0 AND 1000000000000 AND ${t.settledCurrency} IN ('BRL','CNY'))`),
]);
