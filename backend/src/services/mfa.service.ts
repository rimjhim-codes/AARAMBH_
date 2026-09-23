import { authenticator } from "otplib";
import qrcode from "qrcode";
import crypto from "node:crypto";
import { env } from "../config/env";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey() {
  if (!env.mfaEncryptionKey || env.mfaEncryptionKey.length < 32) {
    return crypto.createHash("sha256").update(env.mfaEncryptionKey || "default-dev-key-change-me").digest();
  }
  return Buffer.from(env.mfaEncryptionKey.slice(0, 32).padEnd(32, "0"));
}

export function encryptMfaSecret(secret: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(secret, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decryptMfaSecret(encryptedPayload: string): string {
  if (!encryptedPayload) return "";
  try {
    const parts = encryptedPayload.split(":");
    if (parts.length !== 3) return "";
    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getEncryptionKey(),
      Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("MFA decryption failed", err);
    return "";
  }
}

export function generateMfaSecret() {
  return authenticator.generateSecret();
}

export async function generateMfaQrCode(userEmail: string, secret: string) {
  const otpauthUrl = authenticator.keyuri(userEmail, "AARAMBH", secret);
  const dataUrl = await qrcode.toDataURL(otpauthUrl);
  return { otpauthUrl, dataUrl };
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}

export function generateRecoveryCodes(count = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(crypto.randomBytes(4).toString("hex")); // 8 character hex codes
  }
  return codes;
}
