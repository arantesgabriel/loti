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
  quantity: integer("quantity").notNull().default(1), unitPriceCents: integer("unit_price_cents"), cartStatus: text("cart_status", { enum: ["pending", "added"] }).notNull().default("pending"), ...dates(),
}, t => [index("item_purchase_idx").on(t.purchaseId), index("item_person_idx").on(t.personId), index("item_cart_idx").on(t.cartStatus), index("item_source_idx").on(t.sourceFavoriteId),
  check("item_quantity", sql`typeof(${t.quantity}) = 'integer' AND ${t.quantity} >= 1`), check("item_price", sql`${t.unitPriceCents} IS NULL OR (typeof(${t.unitPriceCents}) = 'integer' AND ${t.unitPriceCents} >= 0)`), check("item_status", sql`${t.cartStatus} IN ('pending','added')`)]);
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
