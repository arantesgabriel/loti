import { createHash } from "node:crypto";

/** Git may check SQL out as CRLF on Windows and LF in Actions. Only line-ending
 * equivalents are accepted; SQL content and migration timestamp stay exact. */
export function migrationHashMatches(source: string, appliedHash: string | undefined) {
  const lf = source.replaceAll("\r\n", "\n");
  return [source, lf, lf.replaceAll("\n", "\r\n")].some(content =>
    createHash("sha256").update(content).digest("hex") === appliedHash,
  );
}
