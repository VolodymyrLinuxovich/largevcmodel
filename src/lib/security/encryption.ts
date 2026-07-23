import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function keyBytes() {
  const configured = process.env.TOKEN_ENCRYPTION_KEY || "";
  if (!configured) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required for token encryption");
  }

  if (/^[a-f0-9]{64}$/i.test(configured)) {
    return Buffer.from(configured, "hex");
  }

  try {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to UTF-8 validation.
  }

  const utf8 = Buffer.from(configured, "utf8");
  if (utf8.length === 32) return utf8;

  throw new Error("TOKEN_ENCRYPTION_KEY must be exactly 32 bytes, or a 32-byte base64/64-character hex value");
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyBytes(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(value: string) {
  const [ivValue, tagValue, ciphertextValue] = value.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted secret format");
  }

  const decipher = createDecipheriv(ALGORITHM, keyBytes(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
