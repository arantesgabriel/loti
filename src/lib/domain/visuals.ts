export const visualKeys = ["generic", "sneaker", "clog", "sandal", "tshirt", "hoodie", "pants", "ssd_nvme", "ssd_sata", "ram", "motherboard", "cpu", "gpu", "laptop", "smartphone", "smartwatch", "keyboard", "mouse", "headphones", "controller"] as const;
export type ProductVisualKey = typeof visualKeys[number];
export const normalizeText = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const rules: [ProductVisualKey, RegExp][] = [
  ["ssd_nvme", /\bnvme\b|m\.2|sn5000/], ["ssd_sata", /\bssd\b|\bsata\b/],
  ["motherboard", /motherboard|placa[- ]mae|b550|b650/], ["ram", /\bram\b|memoria ram|ddr[345]/], ["gpu", /\bgpu\b|graphics card|placa de video|geforce|radeon/], ["cpu", /\bcpu\b|processor|processador|ryzen/],
  ["smartwatch", /smartwatch|apple watch|relogio inteligente/], ["laptop", /notebook|laptop|macbook/], ["smartphone", /smartphone|iphone|celular|\bphone\b/],
  ["keyboard", /teclado|keyboard/], ["mouse", /\bmouse\b/], ["headphones", /headphone|headset|\bfone/], ["controller", /controller|controle|gamepad/],
  ["clog", /crocs|\bclog\b/], ["sandal", /sandalia|sandal|chinelo/], ["sneaker", /tenis|sneaker|vomero|ultraboost|campus|nb\s?9060/],
  ["hoodie", /moletom|hoodie/], ["pants", /calca|\bpants\b/], ["tshirt", /camiseta|camisa|t-shirt|tshirt|\btee\b/],
];
export function resolveProductVisual(name: string): ProductVisualKey { const text = normalizeText(name); return rules.find(([, rule]) => rule.test(text))?.[0] ?? "generic"; }
export function visualPath(key: string) { return `/product-visuals/${visualKeys.includes(key as ProductVisualKey) ? key : "generic"}.svg`; }
