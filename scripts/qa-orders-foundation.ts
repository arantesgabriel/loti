import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Independent localhost UI harness: no dotenv, database, credentials or app routes.
const output = resolve(process.env.LOTI_ORDERS_FOUNDATION_EVIDENCE ?? "artifacts/qa/orders-retomada-r1/foundation", "harness");
mkdirSync(output, { recursive: true });
await build({ entryPoints: ["tests/fixtures/orders-freeze/foundation.tsx"], outfile: `${output}/preview.js`, bundle: true, platform: "browser", format: "esm", jsx: "automatic", alias: { "@": resolve("src") }, external: ["/fonts/*"], define: { "process.env.NODE_ENV": '"development"' } });
const css = await postcss([tailwind()]).process(readFileSync("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") });
const html = `<!doctype html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pedidos · Prévia sintética Fase 1</title><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/preview.css"><style>
@font-face{font-family:Geist;src:url('/fonts/GeistVariable.woff2') format('woff2');font-style:normal;font-weight:100 900;font-display:swap}:root{--font-geist:Geist}
.qa-banner{position:fixed;inset:0 auto auto 0;width:220px;font:12px/1.4 Arial,sans-serif;padding:8px 20px;color:var(--muted);background:var(--surface)}
.qa-content{margin-left:240px}.qa-toolbar{display:flex;gap:12px;align-items:center}.qa-toolbar label{flex:1;min-width:0}.qa-toolbar input,.orders-panel-content input{width:100%;min-width:0;padding:12px;border:1px solid var(--border);border-radius:8px;background:var(--surface)}
.qa-table{width:100%;table-layout:fixed;border-collapse:collapse;background:var(--surface);font-size:13px}.qa-table th:first-child{width:48%}.qa-table th,.qa-table td{text-align:left;padding:18px 16px;border-bottom:1px solid var(--border);overflow-wrap:anywhere}.qa-table thead{background:var(--surface-muted);color:var(--muted);font-size:12px}.qa-table small{display:block;color:var(--muted);font-weight:400;font-size:11px;margin-top:6px}.qa-table .category-marker{float:left;margin-right:12px}.orders-panel-content>label{display:grid;gap:8px;font-size:13px}.orders-panel-content>.button{margin-top:16px}.orders-panel-content{scrollbar-gutter:stable}
@media(max-width:1199px){.qa-content{margin-left:0}.qa-banner{position:static;width:auto}}@media(max-width:767px){.qa-toolbar{flex-wrap:wrap}.qa-toolbar label{flex-basis:100%}.qa-toolbar .button{flex:1}.qa-table th,.qa-table td{padding:14px 8px}.qa-table .category-marker{display:none}.qa-table th:first-child{width:44%}}
</style></head><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>`;
const server = createServer((request, response) => {
  const resources: Record<string, [string, () => string | Buffer]> = {
    "/": ["text/html; charset=utf-8", () => html],
    "/globals.css": ["text/css", () => css.css],
    "/preview.css": ["text/css", () => readFileSync(`${output}/preview.css`)],
    "/preview.js": ["text/javascript", () => readFileSync(`${output}/preview.js`)],
    "/fonts/GeistVariable.woff2": ["font/woff2", () => readFileSync("src/assets/GeistVariable.woff2")],
  };
  const resource = resources[request.url ?? ""];
  if (!resource) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "Content-Type": resource[0], "Cache-Control": "no-store" }).end(resource[1]());
});
server.listen(3141, "localhost", () => process.stdout.write("Synthetic orders foundation: http://localhost:3141\n"));
for (const signal of ["SIGTERM", "SIGINT"] as const) process.on(signal, () => server.close(() => process.exit(0)));
