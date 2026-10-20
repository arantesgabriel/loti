import "server-only";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns/promises";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import ipaddr from "ipaddr.js";
import { DomainError } from "../domain/errors";
import { QC_LIMITS } from "../domain/qc-limits";

export type PublicAddress = { address: string; family: 4 | 6 };
export type DownloadResult = { statusCode: number; headers: IncomingHttpHeaders; body: Buffer };

export function pinnedLookupReply(address: PublicAddress, all: boolean) {
  return all ? { all: true as const, addresses: [{ address: address.address, family: address.family }] }
    : { all: false as const, address: address.address, family: address.family };
}

export function validateHubbuySourceUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new DomainError("URL QC inválida.", 422, "QC_SOURCE_REJECTED"); }
  if (url.protocol !== "https:" || url.hostname !== "scm.hubbuy.app" || url.port !== "" || url.username || url.password) throw new DomainError("A URL da foto não pertence à origem HubBuy permitida.", 422, "QC_SOURCE_REJECTED");
  url.hash = "";
  return url;
}

export function requirePublicDnsAnswers(addresses: PublicAddress[]): PublicAddress[] {
  if (!addresses.length) throw new DomainError("A origem QC não resolveu para um IP público.", 422, "QC_SOURCE_REJECTED");
  for (const answer of addresses) {
    let parsed: ipaddr.IPv4 | ipaddr.IPv6;
    try { parsed = ipaddr.parse(answer.address); } catch { throw new DomainError("Resposta DNS QC inválida.", 422, "QC_SOURCE_REJECTED"); }
    if (parsed.kind() !== (answer.family === 4 ? "ipv4" : "ipv6") || parsed.range() !== "unicast" || parsed.kind() === "ipv6" && (parsed as ipaddr.IPv6).isIPv4MappedAddress()) throw new DomainError("A origem QC resolveu para um endereço bloqueado.", 422, "QC_SOURCE_REJECTED");
  }
  return addresses;
}

async function resolvePublic(hostname: string): Promise<PublicAddress[]> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const answers = await Promise.race([
    dnsLookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new DomainError("A consulta DNS da origem QC excedeu o prazo.", 504, "QC_SOURCE_TIMEOUT")), QC_LIMITS.dnsMs); }),
  ]).finally(() => { if (timeout) clearTimeout(timeout); });
  return requirePublicDnsAnswers(answers.map(answer => ({ address: answer.address, family: answer.family as 4 | 6 })));
}

function requestPinned(url: URL, address: PublicAddress): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = https.request({
      protocol: "https:", hostname: url.hostname, port: 443, path: `${url.pathname}${url.search}`, method: "GET",
      servername: url.hostname, agent: false, maxHeaderSize: 16 * 1024,
      lookup: (_hostname, options, callback) => {
        const reply = pinnedLookupReply(address, typeof options === "object" && options !== null && "all" in options && options.all === true);
        if (reply.all) (callback as unknown as (error: null, addresses: PublicAddress[]) => void)(null, reply.addresses);
        else (callback as unknown as (error: null, address: string, family: number) => void)(null, reply.address, reply.family);
      },
      headers: { "Accept": "image/jpeg,image/png,image/webp", "Accept-Encoding": "identity", "User-Agent": "Loti-QC/1.0" },
    }, response => {
      void collectResponse(response, () => request.destroy(new Error("QC download limit"))).then(result => {
        if (!settled) { settled = true; clearTimeout(timer); resolve(result); }
      }).catch(error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    });
    const timer = setTimeout(() => request.destroy(new Error("QC download timeout")), QC_LIMITS.transferMs);
    request.on("error", () => { if (!settled) { settled = true; clearTimeout(timer); reject(new DomainError("Falha temporária ao acessar a foto HubBuy.", 502, "QC_SOURCE_UNAVAILABLE")); } });
    request.end();
  });
}

async function collectResponse(response: IncomingMessage, abort: () => void): Promise<DownloadResult> {
  const statusCode = response.statusCode ?? 0;
  const encoding = response.headers["content-encoding"];
  const lengthText = response.headers["content-length"];
  if (statusCode !== 200) { response.destroy(); throw new DomainError(statusCode >= 300 && statusCode < 400 ? "A origem QC respondeu com redirecionamento, bloqueado por segurança." : "A origem QC não disponibilizou a foto.", statusCode >= 300 && statusCode < 400 ? 422 : 502, "QC_SOURCE_UNAVAILABLE"); }
  if (encoding && encoding.toLowerCase() !== "identity") { response.destroy(); throw new DomainError("A origem QC respondeu com codificação inesperada.", 422, "QC_SOURCE_REJECTED"); }
  if (lengthText && (!/^\d+$/.test(lengthText) || Number(lengthText) > QC_LIMITS.imageBytes)) { response.destroy(); throw new DomainError("A foto excede 8 MiB.", 422, "QC_IMAGE_LIMIT"); }
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of response) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.byteLength;
      if (total > QC_LIMITS.imageBytes) { abort(); throw new DomainError("A foto excede 8 MiB.", 422, "QC_IMAGE_LIMIT"); }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("A transferência da foto foi interrompida.", 502, "QC_SOURCE_UNAVAILABLE");
  }
  if (lengthText && Number(lengthText) !== total) throw new DomainError("A foto veio truncada.", 422, "QC_IMAGE_INVALID");
  return { statusCode, headers: response.headers, body: Buffer.concat(chunks, total) };
}

export async function downloadHubbuyImage(value: string, deps: { resolve?: typeof resolvePublic; request?: typeof requestPinned } = {}): Promise<Buffer> {
  const url = validateHubbuySourceUrl(value);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    (deps.resolve ?? resolvePublic)(url.hostname),
    new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new DomainError("A consulta DNS da origem QC excedeu o prazo.", 504, "QC_SOURCE_TIMEOUT")), QC_LIMITS.dnsMs); }),
  ]).finally(() => { if (timeout) clearTimeout(timeout); });
  // Every DNS answer is checked and the socket lookup returns this exact pinned address.
  requirePublicDnsAnswers(addresses);
  const result = await (deps.request ?? requestPinned)(url, addresses[0]!);
  if (result.statusCode !== 200) throw new DomainError("A origem QC não disponibilizou a foto.", 502, "QC_SOURCE_UNAVAILABLE");
  if (result.body.byteLength < 12 || result.body.byteLength > QC_LIMITS.imageBytes) throw new DomainError("Tamanho de foto inválido.", 422, "QC_IMAGE_LIMIT");
  const contentType = result.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  const detected = result.body[0] === 0xff && result.body[1] === 0xd8 && result.body[2] === 0xff ? "image/jpeg"
    : result.body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
      : result.body.toString("ascii", 0, 4) === "RIFF" && result.body.toString("ascii", 8, 12) === "WEBP" ? "image/webp" : null;
  const compatible = !contentType || contentType === detected || contentType === "image/jpg" && detected === "image/jpeg";
  if (!detected || !compatible) throw new DomainError("O MIME informado não corresponde à imagem recebida.", 422, "QC_IMAGE_INVALID");
  return result.body;
}
