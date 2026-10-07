import { z } from "zod";
const name = z.string().trim().min(1, "Informe um nome.").max(200, "Use até 200 caracteres.");
export const productUrl = z.string().min(1, "Informe o link.").max(4000).refine(s => { try { const u = new URL(s); return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password; } catch { return false; } }, "Use um link http ou https válido.");
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional().transform(v => v || null);
export const cents = z.number().int().min(0).max(100_000_000).nullable();
export const favoriteInput = z.object({ name, url: productUrl, priceCents: cents, variant: optionalText(500), notes: optionalText(4000), collectionId: z.string().nullable().optional().transform(v => v || null), qcStatus: z.enum(["not_reviewed", "approved", "rejected"]).default("not_reviewed") });
export const collectionInput = z.object({ name: name.max(80) });
export const purchaseInput = z.object({ name, hubbuyAccount: optionalText(300) });
const itemDetails = { variant: optionalText(500), notes: optionalText(4000), quantity: z.number().int().min(1, "Quantidade mínima: 1.").max(10000), unitPriceCents: cents };
const participantInput = z.object({ personId: z.string().min(1), percentageBps: z.number().int().min(0).max(10000).optional(), amountCents: z.number().int().min(0).max(1_000_000_000_000).optional() }).strict();
const sharingInput = { sharingMode: z.enum(["equal", "percentage", "fixed"]), participants: z.array(participantInput).min(1).max(100) };
const legacyItemShape = z.object({ name, url: productUrl, personId: z.string().min(1), ...itemDetails }).strict();
const sharedItemShape = z.object({ name, url: productUrl, ...itemDetails, ...sharingInput }).strict();
const legacyFavoriteShape = z.object({ favoriteId: z.string().min(1), personId: z.string().min(1), ...itemDetails }).strict();
const sharedFavoriteShape = z.object({ favoriteId: z.string().min(1), ...itemDetails, ...sharingInput }).strict();
function normalizeItemShape(value: z.infer<typeof legacyItemShape> | z.infer<typeof sharedItemShape>) {
  const participants = "participants" in value ? value.participants : [{ personId: value.personId }];
  const sharingMode = participants.length === 1 || !("sharingMode" in value) ? "equal" : value.sharingMode;
  return { ...value, personId: participants[0].personId, sharingMode, participants: participants.length === 1 ? [{ personId: participants[0].personId }] : participants };
}
function normalizeFavoriteShape(value: z.infer<typeof legacyFavoriteShape> | z.infer<typeof sharedFavoriteShape>) {
  const participants = "participants" in value ? value.participants : [{ personId: value.personId }];
  const sharingMode = participants.length === 1 || !("sharingMode" in value) ? "equal" : value.sharingMode;
  return { ...value, personId: participants[0].personId, sharingMode, participants: participants.length === 1 ? [{ personId: participants[0].personId }] : participants };
}
export const itemInput = z.union([sharedItemShape, legacyItemShape]).transform(normalizeItemShape);
export const favoriteToItemInput = z.union([sharedFavoriteShape, legacyFavoriteShape]).transform(normalizeFavoriteShape);
export type FavoriteInput = z.input<typeof favoriteInput>;
export type ItemInput = z.input<typeof itemInput>;
export type FavoriteToItemInput = z.input<typeof favoriteToItemInput>;
