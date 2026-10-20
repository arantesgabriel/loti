import "server-only";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client, type S3Client as S3ClientType } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { QC_LIMITS } from "../domain/qc-limits";
import { DomainError } from "../domain/errors";

export type QcObject = { key: string; bytes: Buffer; mimeType: string; sha256: string };
export interface QcStorage {
  put(object: QcObject, signal?: AbortSignal): Promise<void>;
  head(key: string, signal?: AbortSignal): Promise<{ exists: boolean; sha256?: string }>;
  get(key: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer>;
  delete(key: string, signal?: AbortSignal): Promise<void>;
  signRead(key: string): Promise<string>;
}
type StorageClients = { bucket: string; write: S3ClientType; read: S3ClientType };
let clients: StorageClients | null = null;

function storageClients(): StorageClients {
  if (clients) return clients;
  const accountId = process.env.R2_ACCOUNT_ID, bucket = process.env.R2_BUCKET_NAME;
  const writeId = process.env.R2_WRITE_ACCESS_KEY_ID, writeSecret = process.env.R2_WRITE_SECRET_ACCESS_KEY;
  const readId = process.env.R2_READ_ACCESS_KEY_ID, readSecret = process.env.R2_READ_SECRET_ACCESS_KEY;
  if (![accountId, bucket, writeId, writeSecret, readId, readSecret].every(Boolean) || !/^[a-f0-9]{32}$/.test(accountId!)) throw new DomainError("Backup QC indisponível: configure as credenciais R2 do ambiente.", 503, "QC_STORAGE_UNAVAILABLE");
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  clients = {
    bucket: bucket!,
    write: new S3Client({ region: "auto", endpoint, forcePathStyle: true, maxAttempts: 1, credentials: { accessKeyId: writeId!, secretAccessKey: writeSecret! } }),
    read: new S3Client({ region: "auto", endpoint, forcePathStyle: true, maxAttempts: 1, credentials: { accessKeyId: readId!, secretAccessKey: readSecret! } }),
  };
  return clients;
}

export function assertQcStorageConfigured() { storageClients(); }

export const r2QcStorage: QcStorage = {
  async put({ key, bytes, mimeType, sha256 }, signal) {
    const config = storageClients();
    await config.write.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: bytes, ContentLength: bytes.byteLength, ContentType: mimeType, CacheControl: "private, max-age=0, no-store", Metadata: { sha256 } }), { abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(QC_LIMITS.transferMs)]) : AbortSignal.timeout(QC_LIMITS.transferMs) });
  },
  async head(key, signal) {
    const config = storageClients();
    try { const result = await config.write.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(QC_LIMITS.transferMs)]) : AbortSignal.timeout(QC_LIMITS.transferMs) }); return { exists: true, sha256: result.Metadata?.sha256 }; }
    catch (error) {
      const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (candidate.name === "NotFound" || candidate.name === "NoSuchKey" || candidate.$metadata?.httpStatusCode === 404) return { exists: false };
      throw new DomainError("Não foi possível verificar um backup QC pendente.", 502, "QC_STORAGE_UNAVAILABLE");
    }
  },
  async get(key, maxBytes, signal) {
    const config = storageClients();
    try {
      const result = await config.read.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(QC_LIMITS.transferMs)]) : AbortSignal.timeout(QC_LIMITS.transferMs) });
      if (!result.Body || result.ContentLength === undefined || result.ContentLength < 1 || result.ContentLength > maxBytes) throw new DomainError("O preview privado excedeu o limite esperado.", 502, "QC_PREVIEW_INVALID");
      const bytes = Buffer.from(await result.Body.transformToByteArray());
      if (!bytes.byteLength || bytes.byteLength > maxBytes || bytes.byteLength !== result.ContentLength) throw new DomainError("O preview privado está incompleto.", 502, "QC_PREVIEW_INVALID");
      return bytes;
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError("O preview privado está indisponível.", 502, "QC_STORAGE_UNAVAILABLE");
    }
  },
  async delete(key, signal) {
    const config = storageClients();
    try { await config.write.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }), { abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(QC_LIMITS.transferMs)]) : AbortSignal.timeout(QC_LIMITS.transferMs) }); }
    catch { throw new DomainError("A remoção física do backup QC está pendente.", 502, "QC_DELETE_PENDING"); }
  },
  async signRead(key) {
    const config = storageClients();
    try { return await getSignedUrl(config.read, new GetObjectCommand({ Bucket: config.bucket, Key: key, ResponseCacheControl: "private, no-store" }), { expiresIn: QC_LIMITS.signedUrlSeconds }); }
    catch { throw new DomainError("O backup privado está indisponível.", 502, "QC_STORAGE_UNAVAILABLE"); }
  },
};
