import ExcelJS from "exceljs";
import { normalizeText } from "../src/lib/domain/visuals";
import { parseMoney } from "../src/lib/domain/money";
import { productUrl } from "../src/lib/domain/validation";
export type LegacyRow = { sheet: string; address: string; owner: string | null; collection: string | null; name: string; url: string; priceCents: number | null; variant: string | null; notes: string | null; qc: string | null; quantity: number };
export type LegacyIssue = { sheet: string; address: string; reason: string };
export function cellText(value: ExcelJS.CellValue | unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if ("richText" in value && Array.isArray(value.richText)) return value.richText.map(v => v.text).join("");
  if ("text" in value) return cellText(value.text);
  if ("result" in value) return cellText(value.result);
  if (value instanceof Date) return value.toISOString();
  return "";
}
export function cellUrl(cell: ExcelJS.Cell): string { const v = cell.value; return v && typeof v === "object" && "hyperlink" in v ? v.hyperlink : cellText(v); }
export function legacyPrice(value: ExcelJS.CellValue): number | null {
  if (value && typeof value === "object" && "formula" in value) {
    if (value.result === undefined) throw new Error("Fórmula de preço sem resultado salvo.");
    return legacyPrice(value.result);
  }
  const s = cellText(value).trim();
  if (!s || ["~", "-", "n/a"].includes(s.toLowerCase())) return null;
  if (typeof value === "number") { if (!Number.isFinite(value) || value < 0) throw new Error("Preço inválido."); return parseMoney(value.toFixed(2)); }
  return parseMoney(s);
}
const headerRole = (s: string) => {
  const n = normalizeText(s).trim();
  if (["item", "produto"].includes(n)) return "name";
  if (["link", "url"].includes(n)) return "url";
  if (/^(valor|preco)( unitario)?$/.test(n)) return "price";
  if (["tipo", "variacao/modelo", "variacao", "modelo"].includes(n)) return "variant";
  if (["de quem", "pessoa", "dono"].includes(n)) return "owner";
  if (n.startsWith("qc")) return "qc";
  if (["qtd", "quantidade"].includes(n)) return "quantity";
  if (["notas", "observacoes"].includes(n)) return "notes";
  return null;
};
export async function readLegacy(path: string) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path);
  const rows: LegacyRow[] = [], issues: LegacyIssue[] = [], warnings: LegacyIssue[] = [], accounts: Record<string, string> = {}, sheets: { name: string; kind: "favorites" | "purchase" | "suppliers" | "unknown"; blocks: number }[] = [];
  for (const sheet of wb.worksheets) {
    const sn = normalizeText(sheet.name).trim();
    const kind = sn.includes("fornecedor") ? "suppliers" : sn.includes("compra") ? "purchase" : sn.includes("favorito") || sn.includes("build pc") || sn.includes("shein") ? "favorites" : "unknown";
    const blocks: { row: number; start: number; fields: Map<string, number> }[] = [];
    sheet.eachRow((row, rn) => {
      row.eachCell((cell, cn) => {
        if (normalizeText(cellText(cell.value)).includes("email usado na compra")) accounts[sheet.name] = cellText(row.getCell(cn + 1).value);
        if (headerRole(cellText(cell.value)) !== "name") return;
        const fields = new Map<string, number>();
        for (let col = cn; col <= Math.min(cn + 10, sheet.columnCount); col++) {
          const s = cellText(row.getCell(col).value), role = headerRole(s);
          if (col !== cn && (role === "name" || !s)) break;
          if (role) fields.set(role, col);
        }
        if (fields.has("url")) blocks.push({ row: rn, start: cn, fields });
      });
    });
    sheets.push({ name: sheet.name, kind, blocks: blocks.length });
    if (kind === "suppliers" || kind === "unknown") {
      sheet.eachRow((row, rn) => { if (rn > 1 && row.hasValues) issues.push({ sheet: sheet.name, address: row.getCell(1).address, reason: kind === "suppliers" ? "Fornecedor fora do escopo do MVP; fonte preservada." : "Aba desconhecida; não importada." }); }); continue;
    }
    for (const block of blocks) {
      const last = Math.max(...block.fields.values());
      const nextHeader = blocks.find(b => b.start === block.start && b.row > block.row)?.row ?? sheet.rowCount + 1;
      const collection = normalizeText(cellText(sheet.getCell(block.row - 1 || 1, block.start).value)).includes("presentes") ? "Presentes" : sn.includes("build pc") ? "Build PC" : sn.includes("shein") ? "Pesquisar na HubBuy" : null;
      for (let rn = block.row + 1; rn < nextHeader; rn++) {
        const row = sheet.getRow(rn), address = row.getCell(block.start).address;
        const get = (field: string) => block.fields.has(field) ? row.getCell(block.fields.get(field)!) : undefined;
        const name = cellText(get("name")?.value).trim(), linkCell = get("url")!, url = cellUrl(linkCell);
        const content = [...block.fields.values()].some(cn => row.getCell(cn).value !== null);
        if (!content) continue;
        if (!name || !url) { issues.push({ sheet: sheet.name, address, reason: "Linha incompleta: falta nome ou link." }); continue; }
        try {
          productUrl.parse(url);
          const priceCents = legacyPrice(get("price")?.value ?? null);
          const variant = cellText(get("variant")?.value).trim() || (block.fields.has("owner") && !cellText(sheet.getCell(block.row, last + 1).value) ? cellText(row.getCell(last + 1).value).trim() : "") || null;
          const owner = cellText(get("owner")?.value).trim() || (sn.includes("gabriel") || sn.includes("build pc") ? "Gabriel" : sn.includes("brunna") ? "Brunna" : null);
          const quantityValue = cellText(get("quantity")?.value).trim();
          const quantity = quantityValue ? Number(quantityValue) : 1;
          if (!Number.isInteger(quantity) || quantity < 1) throw new Error("Quantidade inválida.");
          const displayed = cellText(linkCell.value);
          if (displayed.startsWith("http") && displayed !== url) warnings.push({ sheet: sheet.name, address: linkCell.address, reason: "Texto do link difere do destino; o hyperlink original foi preservado." });
          if (get("price")?.value && typeof get("price")!.value === "object" && "formula" in (get("price")!.value as object)) warnings.push({ sheet: sheet.name, address: get("price")!.address, reason: "Preço usa resultado salvo da fórmula; confira a origem (sem inferir quantidade)." });
          rows.push({ sheet: sheet.name, address, owner, collection, name, url, priceCents, variant, notes: cellText(get("notes")?.value).trim() || null, qc: cellText(get("qc")?.value).trim() || null, quantity });
        } catch (e) { issues.push({ sheet: sheet.name, address, reason: e instanceof Error ? e.message : "Linha inválida." }); }
      }
    }
  }
  return { sheets, rows, issues, warnings, accounts };
}
