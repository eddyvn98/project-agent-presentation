import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface SealedPayload { v: 1; iv: string; tag: string; data: string }
const bytes = (value: string) => Buffer.from(value, "base64");

export function masterVaultKey(): Buffer {
  const encoded = process.env.PROJECT_AGENT_SESSION_VAULT_MASTER_KEY ?? "";
  const key = bytes(encoded);
  if (key.byteLength !== 32 || key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, ""))
    throw new Error("Session Vault is disabled: configure a stable, random 32-byte base64 master key");
  return key;
}

export function seal(value: Uint8Array, key: Buffer, aad: string): SealedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const data = Buffer.concat([cipher.update(value), cipher.final()]);
  return { v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

export function unseal(value: SealedPayload, key: Buffer, aad: string): Buffer {
  if (value?.v !== 1) throw new Error("Unsupported session encryption envelope");
  const iv = bytes(value.iv), tag = bytes(value.tag);
  if (iv.length !== 12 || tag.length !== 16) throw new Error("Invalid encrypted session envelope");
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(bytes(value.data)), cipher.final()]);
}
