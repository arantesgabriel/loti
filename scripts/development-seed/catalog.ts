/** Real models, representative BRL prices. No live quotation or production data. */
export const seedVersion = "loti-development-v1";
export const seedWorkspaceId = "loti-development-v1";
export const people = [
  { name: "Gabriel Almeida", email: "gabriel.almeida@loti.test" },
  { name: "Bruna Martins", email: "bruna.martins@loti.test" },
  { name: "Amanda Costa", email: "amanda.costa@loti.test" },
  { name: "Vinícius Rocha", email: "vinicius.rocha@loti.test" },
  { name: "Rafael Lima", email: "rafael.lima@loti.test" },
] as const;

// Links deliberately target manufacturer/model searches rather than invented listing IDs.
const rows = [
  ["Nike Vomero 18", "Preto e branco · 42", 42990, "Tênis e corrida", "nike.com.br"],
  ["Adidas Campus 00s", "Cinza · 38", 34990, "Tênis e corrida", "adidas.com.br"],
  ["New Balance 9060", "Sea Salt · 41", 59990, "Tênis e corrida", "newbalance.com.br"],
  ["ASICS Gel-Nimbus 26", "Azul · 40", 69990, "Tênis e corrida", "asics.com.br"],
  ["Crocs Classic Clog", "Bone · 37/38", 17990, "Roupas e acessórios", "crocs.com.br"],
  ["Uniqlo AIRism Cotton Oversized", "Branca · M", 8990, "Roupas e acessórios", "uniqlo.com"],
  ["Uniqlo Dry Pique Polo", "Azul-marinho · L", 11990, "Roupas e acessórios", "uniqlo.com"],
  ["Levi's 501 Original", "Stonewash · 32/32", 24990, "Roupas e acessórios", "levi.com.br"],
  ["Logitech MX Master 3S", "Grafite · Bluetooth", 39990, "Setup do escritório", "logitech.com"],
  ["Keychron K2", "RGB · Switch marrom · ABNT2", 48990, "Setup do escritório", "keychron.com"],
  ["WD Blue SN5000", "1 TB · M.2 NVMe", 39990, "Computador", "westerndigital.com"],
  ["Samsung 990 PRO", "2 TB · M.2 NVMe", 99990, "Computador", "samsung.com"],
  ["Kingston Fury Beast DDR5", "32 GB · 2×16 GB · 6000 MHz", 64990, "Computador", "kingston.com"],
  ["AMD Ryzen 7 7700", "AM5 · 8 núcleos", 139990, "Computador", "amd.com"],
  ["MSI B650M Mortar WiFi", "AM5 · Micro ATX", 109990, "Computador", "msi.com"],
  ["Logitech G Pro X Superlight 2", "Branco · USB-C", 64990, "Setup do escritório", "logitechg.com"],
  ["Sony WH-1000XM5", "Prata · Cancelamento de ruído", 159990, "Áudio e eletrônicos", "sony.com.br"],
  ["Anker Soundcore Space A40", "Preto · Bluetooth", 27990, "Áudio e eletrônicos", "soundcore.com"],
  ["8BitDo Ultimate 2C", "Verde · Sem fio", 15990, "Áudio e eletrônicos", "8bitdo.com"],
  ["Nintendo Switch Pro Controller", "Preto · USB-C", 32990, "Áudio e eletrônicos", "nintendo.com"],
  ["Amazfit Bip 5", "Soft Black · 46 mm", 29990, "Áudio e eletrônicos", "amazfit.com"],
  ["Xiaomi Smart Band 9", "Midnight Black", 21990, "Áudio e eletrônicos", "mi.com"],
  ["UGREEN Nexode 65W", "GaN · 2 USB-C e 1 USB-A", 17990, "Setup do escritório", "ugreen.com"],
  ["Baseus Blade Power Bank", "20.000 mAh · 100 W", 32990, "Áudio e eletrônicos", "baseus.com"],
  ["JBL Flip 6", "Azul · Bluetooth", 44990, "Áudio e eletrônicos", "jbl.com.br"],
  ["Fender 351 Premium Picks", "Medium · Kit com 12 palhetas", 3990, "Música e presentes", "fender.com"],
  ["D'Addario EXL110", "Guitarra · .010–.046", 4990, "Música e presentes", "daddario.com"],
  ["Stanley Quencher H2.0", "Rose Quartz · 887 ml", 19990, "Casa e organização", "stanley1913.com"],
  ["Anker USB-C Cable", "Nylon · 100 W · 1,8 m", 4990, "Setup do escritório", "anker.com"],
  ["Xiaomi Mi Precision Screwdriver Kit", "24 bits · Cinza", 9990, "Casa e organização", "mi.com"],
] as const;

export const products = rows.map(([name, variant, priceCents, collection, host]) => ({
  name, variant, priceCents, collection,
  url: `https://${host}/?q=${encodeURIComponent(name)}`,
}));

export const rounds = [
  { name: "Renovação do guarda-roupa", start: 0, size: 10, paid: true },
  { name: "Setup do escritório", start: 10, size: 8, paid: true },
  { name: "Presentes de fim de ano", start: 18, size: 8, paid: false },
  { name: "Tecnologia e acessórios", start: 22, size: 8, paid: true },
] as const;

export const seedPlan = {
  version: seedVersion, workspace: "Compras entre amigos", members: people,
  favorites: 50, finalizedPurchases: 4, historicalProductLines: 34,
  activePurchase: "Próxima compra coletiva", activeProductLines: 10,
  logisticsPackages: 6, hubbuyAccounts: 3, refunds: 2,
  additionalOrders: { recorded: 1, draft: 1 }, pendingInvitations: 2,
  note: "Produtos reais, pessoas fictícias e valores representativos. Não são cotações nem dados de produção. QC sem fotos; nenhum serviço externo é acionado.",
};
