import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENEBINHA_BRAND_REFERENCES,
  ENEBINHA_COMMUNITY,
  ENEBINHA_DISCLOSURES,
  ENEBINHA_DISPLAY_COUNTS,
  ENEBINHA_GUIDES,
  ENEBINHA_HUBBUY,
  ENEBINHA_MARQUEE_SUPPLIERS,
  ENEBINHA_MASCOT,
  ENEBINHA_SUPPLIERS,
  ENEBINHA_SUPPLIER_CATEGORIES,
  ENEBINHA_VITRINE,
  filterCommunity,
  filterGuides,
  filterSupplierCategories,
  getSupplierLogoAuditSummary,
} from "@/lib/enebinha/manifest";

const rootDir = process.cwd();

function sha256File(filePath: string): string {
  const bytes = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function readWebpDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12)).toBe("WEBP");
  const chunkType = buf.toString("ascii", 12, 16);
  if (chunkType === "VP8 ") {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  if (chunkType === "VP8L") {
    const b0 = buf[21]!;
    const b1 = buf[22]!;
    const b2 = buf[23]!;
    const b3 = buf[24]!;
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  if (chunkType === "VP8X") {
    const width = 1 + buf.readUIntLE(24, 3);
    const height = 1 + buf.readUIntLE(27, 3);
    return { width, height };
  }
  throw new Error(`Unsupported WebP chunk: ${chunkType}`);
}

describe("ENEBINHA V2.1 + D7 manifest and asset invariants", () => {
  it("preserves exact counts across suppliers, categories, vitrine, guides, community, HubBuy, and brands", () => {
    expect(ENEBINHA_SUPPLIER_CATEGORIES).toHaveLength(7);
    const categoryCounts = ENEBINHA_SUPPLIER_CATEGORIES.map((c) => ({
      category: c.category,
      count: c.entries.length,
      declaredCount: c.count,
    }));

    expect(categoryCounts).toEqual([
      { category: "Eletrônicos e periféricos", count: 17, declaredCount: 17 },
      { category: "Relógios e óculos", count: 10, declaredCount: 10 },
      { category: "Roupas e moda", count: 17, declaredCount: 17 },
      { category: "Tênis e calçados", count: 6, declaredCount: 6 },
      { category: "Esportes e camisas", count: 10, declaredCount: 10 },
      { category: "Brinquedos e colecionáveis", count: 5, declaredCount: 5 },
      { category: "Automotivos e peças", count: 8, declaredCount: 8 },
    ]);

    expect(ENEBINHA_SUPPLIERS).toHaveLength(73);
    expect(ENEBINHA_SUPPLIERS.filter((s) => s.isStorefront)).toHaveLength(
      ENEBINHA_DISPLAY_COUNTS.storefrontsIdentifiedWithinCatalog
    );
    expect(ENEBINHA_GUIDES).toHaveLength(8);
    expect(ENEBINHA_COMMUNITY).toHaveLength(6);
    expect(ENEBINHA_BRAND_REFERENCES).toHaveLength(20);

    const totalDisplayed =
      ENEBINHA_SUPPLIERS.length +
      1 + // Vitrine Enebinha
      ENEBINHA_GUIDES.length +
      ENEBINHA_COMMUNITY.length +
      1; // Cadastro HubBuy
    expect(totalDisplayed).toBe(89);
    expect(ENEBINHA_DISPLAY_COUNTS.totalDisplayedEntries).toBe(89);
  });

  it("matches every literal URL and title from the canonical JSON inventory", () => {
    const rawInventory = JSON.parse(
      fs.readFileSync(
        path.join(rootDir, "docs/handoffs/enebinha-v2-1-d7/ENEBINHA_inventario_original_2026-11-06.json"),
        "utf8"
      )
    );

    expect(ENEBINHA_HUBBUY.url).toBe(rawInventory.hub_buy.url);
    expect(ENEBINHA_HUBBUY.url).toContain("inviteCode=65EAVN8o");
    expect(ENEBINHA_VITRINE.url).toBe(rawInventory.vitrine_enebinha.url);

    const rawSuppliers = rawInventory.supplier_categories.flatMap((c: { category: string; entries: Array<{ source_title: string; title: string; url: string }> }) =>
      c.entries.map((e) => ({
        category: c.category,
        sourceTitle: e.source_title,
        title: e.title,
        url: e.url,
      }))
    );

    expect(
      ENEBINHA_SUPPLIERS.map((s) => ({
        category: s.category,
        sourceTitle: s.sourceTitle,
        title: s.title,
        url: s.url,
      }))
    ).toEqual(rawSuppliers);

    expect(
      ENEBINHA_GUIDES.map((g) => ({
        source_title: g.sourceTitle,
        title: g.title,
        url: g.url,
      }))
    ).toEqual(rawInventory.guides);

    expect(
      ENEBINHA_COMMUNITY.map((c) => ({
        source_title: c.sourceTitle,
        title: c.title,
        url: c.url,
      }))
    ).toEqual(rawInventory.community);

    expect([
      ENEBINHA_DISCLOSURES.catalogDisclaimer,
      ENEBINHA_DISCLOSURES.brandReferenceDisclaimer,
      ENEBINHA_DISCLOSURES.hubBuyReferralDisclaimer,
    ]).toEqual(rawInventory.disclosures);
  });

  it("verifies untouched mascot WebP SHA-256 and 780x355 dimensions", () => {
    const mascotPath = path.join(rootDir, "public", ENEBINHA_MASCOT.publicPath);
    expect(fs.existsSync(mascotPath)).toBe(true);
    expect(sha256File(mascotPath)).toBe(
      "487929fe8501456317095c37c8cafd808db8a8733ae64b85f07aa6013bf096bf"
    );
    const dims = readWebpDimensions(mascotPath);
    expect(dims).toEqual({ width: 780, height: 355 });
  });

  it("verifies all 20 original brand reference logos exist with exact SHA-256 and are distinct from supplier logos", () => {
    const brandPaths = new Set<string>();
    for (const brand of ENEBINHA_BRAND_REFERENCES) {
      const fullPath = path.join(rootDir, "public", brand.publicPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).size).toBe(brand.bytes);
      expect(sha256File(fullPath)).toBe(brand.sha256);
      brandPaths.add(brand.publicPath);
    }

    // D7 rule: reference brand logos must never be assigned as fake supplier logos
    for (const supplier of ENEBINHA_SUPPLIERS) {
      if (supplier.logoAudit.logoAssetLocal) {
        expect(brandPaths.has(supplier.logoAudit.logoAssetLocal)).toBe(false);
      }
    }
  });

  it("validates D7 marquee ordering (73 unique suppliers) and 1:1 audit CSV coverage", () => {
    expect(ENEBINHA_MARQUEE_SUPPLIERS).toHaveLength(73);
    const uniqueIds = new Set(ENEBINHA_MARQUEE_SUPPLIERS.map((s) => s.id));
    expect(uniqueIds.size).toBe(73);

    expect(ENEBINHA_MARQUEE_SUPPLIERS.slice(0, 12).map((s) => s.title)).toEqual([
      "Husky Reps",
      "GOAT Official",
      "MacBook",
      "WWTOP",
      "ARTIEMASTER",
      "Garmin",
      "Jersey-go",
      "iPhones",
      "Ray-Ban",
      "Hot Wheels",
      "PAI",
      "TigerRep",
    ]);

    const csvLines = fs
      .readFileSync(path.join(rootDir, "docs/handoffs/enebinha-v2-1-d7/supplier-logo-audit.csv"), "utf8")
      .trim()
      .split("\n");
    expect(csvLines).toHaveLength(74); // header + 73 suppliers

    for (let i = 0; i < 73; i++) {
      const expectedId = `supplier-${String(i + 1).padStart(3, "0")}`;
      expect(ENEBINHA_SUPPLIERS[i]?.id).toBe(expectedId);
      expect(csvLines[i + 1]?.startsWith(`${expectedId},`)).toBe(true);
    }

    const auditSummary = getSupplierLogoAuditSummary();
    expect(auditSummary.total).toBe(73);
    expect(auditSummary.verified + auditSummary.pending + auditSummary.blocked).toBe(73);
  });

  it("filters suppliers, guides, and community with accent-insensitive matching", () => {
    const camisas = filterSupplierCategories({ categorySlug: "all", query: "câmeras" });
    expect(camisas.flatMap((c) => c.entries).map((e) => e.title)).toContain("Câmeras");

    const camerasWithoutAccent = filterSupplierCategories({ categorySlug: "all", query: "cameras" });
    expect(camerasWithoutAccent.flatMap((c) => c.entries).map((e) => e.title)).toContain("Câmeras");

    const switchSource = filterSupplierCategories({ categorySlug: "all", query: "Switch" });
    expect(switchSource.flatMap((c) => c.entries).map((e) => e.title)).toContain("Nintendo Switch");

    const emptyResult = filterSupplierCategories({ categorySlug: "all", query: "termo-inexistente-xyz" });
    expect(emptyResult).toHaveLength(0);

    expect(filterGuides("batchs")).toHaveLength(1);
    expect(filterCommunity("telegram")).toHaveLength(2);
  });
});