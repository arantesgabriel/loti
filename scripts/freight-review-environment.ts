import {basename,dirname,resolve} from "node:path";
import {existsSync,lstatSync,realpathSync} from "node:fs";
export const freightReviewPassword="Loti-Freight-Review-2026!";
export function freightReviewEnvironment(value:string|undefined){
  if(!value?.startsWith("file:"))throw new Error("Pass --database file:./data/freight-review-<id>.sqlite");
  const path=resolve(value.slice(5));
  if(dirname(path)!==resolve("data")||!/^freight-review-[a-zA-Z0-9_-]+\.sqlite$/.test(basename(path)))throw new Error("Use a disposable data/freight-review-<id>.sqlite file.");
  const data=resolve("data");
  if(existsSync(data)&&realpathSync(data).toLowerCase()!==data.toLowerCase())throw new Error("Review refuses redirected data directories.");
  if(existsSync(path)&&(lstatSync(path).isSymbolicLink()||realpathSync(path).toLowerCase()!==path.toLowerCase()))throw new Error("Review refuses redirected database files.");
  const url=`file:${path.replaceAll("\\","/")}`;
  process.env.TURSO_DATABASE_URL=url;process.env.TURSO_AUTH_TOKEN="";process.env.BETTER_AUTH_URL="http://localhost:3147";process.env.BETTER_AUTH_SECRET="freight-review-local-synthetic-secret-only-2026";process.env.LOTI_EMAIL_MODE="disabled";process.env.LOTI_QC_MANAGER_USER_ID="";process.env.NEXT_TELEMETRY_DISABLED="1";process.env.LOTI_NEXT_DIR=".next-freight-review";
  for(const key of Object.keys(process.env))if(/^(R2_|AWS_|CLOUDFLARE_|RESEND_)/.test(key))process.env[key]="";
  if(process.env.VERCEL==="1")throw new Error("Local review refuses Vercel");
  return {path,url};
}
