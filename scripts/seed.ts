import "dotenv/config";
import { db, client } from "../src/lib/db";
import { createMember } from "./operator";
import { migrateDatabase } from "./migrate";
import { createServices } from "../src/lib/domain/services";
if (process.env.NODE_ENV === "production" || (process.env.TURSO_DATABASE_URL && !process.env.TURSO_DATABASE_URL.startsWith("file:"))) throw new Error("Seed bloqueado para bancos remotos/de produção.");
try {
  await migrateDatabase();
  const names = ["Gabriel", "Brunna", "Amanda", "Bola", "Vinicius"];
  const users: Awaited<ReturnType<typeof createMember>>[] = [];
  for (const name of names) users.push(await createMember(db, { name, email: `${name.toLowerCase()}@loti.test`, password: "Loti-Dev-Only-2026!" }));
  const samples = [
    ["Nike Vomero 18", "Branco · HM6803-101 · 46", 12500, 0, "hubbuy"], ["Adidas Campus", "Preto · W2 Batch · 42", 7000, 1, "weidian"], ["Crocs Bottom", "Marrom · 41/42", 4500, 2, "hubbuy"], ["Ultraboost 5", "Preto · 42", 11000, 3, "weidian"], ["WD Blue SN5000", "1TB · M.2 NVMe", 39900, 4, "hubbuy"], ["Camiseta Uniqlo", "Branco · Tamanho L", null, 0, "weidian"],
  ] as const;
  for (const [index, sample] of samples.entries()) {
    const [name, variant, priceCents, owner, platform] = sample;
    const ownerUser = users[owner];
    if (!ownerUser) throw new Error(`Usuário seed ausente no índice ${owner}.`);
    const service = createServices(db, ownerUser.id);
    const collectionName = name.includes("SN5000") ? "Build PC" : name.includes("Camiseta") ? "Presentes" : "Tênis";
    const data = await service.getData();
    const collection = data.collections.find(c => c.name === collectionName && c.ownerId === ownerUser.id) ?? await service.saveCollection({ name: collectionName });
    if (!collection) throw new Error(`Coleção seed não criada: ${collectionName}.`);
    if (!data.favorites.some(f => f.name === name && f.ownerId === ownerUser.id)) await service.saveFavorite({ name, variant, priceCents, url: platform === "hubbuy" ? `https://www.hubbuycn.com/product?id=${1000 + index}&source=weidian` : `https://weidian.com/item.html?itemID=${1000 + index}`, collectionId: collection.id, qcStatus: index % 2 === 0 ? "approved" : "not_reviewed" });
  }
  console.log("Seed de desenvolvimento pronto: cinco membros, seis favoritos. Email: <nome>@loti.test; senha: Loti-Dev-Only-2026!");
} finally { client.close(); }
