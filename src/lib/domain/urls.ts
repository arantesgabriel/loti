export const platforms = ["hubbuy", "weidian", "taobao", "1688", "goofish", "shopee", "shein", "other"] as const;
export type Platform = typeof platforms[number];
export const platformLabels: Record<Platform, string> = { hubbuy: "HubBuy", weidian: "Weidian", taobao: "Taobao", "1688": "1688", goofish: "Goofish", shopee: "Shopee", shein: "Shein", other: "Outro" };
const domains: [Platform, string[]][] = [
  ["hubbuy", ["hubbuycn.com", "hubbuy.com"]], ["weidian", ["weidian.com"]], ["taobao", ["taobao.com", "tmall.com"]], ["1688", ["1688.com"]], ["goofish", ["goofish.com", "xianyu.com"]],
  ["shopee", ["shopee.com.br", "shopee.com", "shopee.cn", "shope.ee"]], ["shein", ["shein.com", "shein.com.br"]],
];
export function detectPlatform(original: string): Platform {
  try { const host = new URL(original).hostname.toLowerCase(); return domains.find(([, list]) => list.some(d => host === d || host.endsWith(`.${d}`)))?.[0] ?? "other"; } catch { return "other"; }
}
export function normalizeProductUrl(original: string): string | null {
  try {
    const u = new URL(original);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const k of [...u.searchParams.keys()]) if (/^(utm_.+|spm|spm_id_from|ref|referral|referrer|fbclid|gclid|share_token|share_relation|share_source)$/i.test(k)) u.searchParams.delete(k);
    u.searchParams.sort();
    return u.toString();
  } catch { return null; }
}
export function buildCanonicalProductKey(original: string): string | null {
  const normalized = normalizeProductUrl(original);
  if (!normalized) return null;
  const u = new URL(normalized), platform = detectPlatform(original);
  // Only keys with known stable marketplace identity; unknown query fields are retained.
  const id = platform === "weidian" ? u.searchParams.get("itemID") ?? u.searchParams.get("itemId") : ["taobao", "goofish"].includes(platform) ? u.searchParams.get("id") : platform === "1688" ? u.pathname.match(/\/offer\/(\d+)\.html/)?.[1] : null;
  if (id && /^\d+$/.test(id)) return `${platform}:${id}`;
  // HubBuy wrappers differ across sources; preserve source/type query parameters conservatively.
  return normalized;
}
