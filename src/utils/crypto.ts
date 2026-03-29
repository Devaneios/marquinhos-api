import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

function getKey(): Buffer {
  const secret = process.env.MARQUINHOS_SECRET_KEY;
  if (!secret) throw new Error('MARQUINHOS_SECRET_KEY is not set');
  // Accept a 64-char hex string as a raw 32-byte key; otherwise derive via scrypt
  if (/^[0-9a-f]{64}$/i.test(secret)) return Buffer.from(secret, 'hex');
  return scryptSync(secret, 'marquinhos-salt', 32);
}

const ALGORITHM = 'aes-256-gcm';

export function encryptToken(token: string): string | null {
  try {
    const key = getKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    // Format: base64(iv):base64(gcmTag):base64(ciphertext)
    return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
  } catch {
    return null;
  }
}

export function decryptToken(encryptedToken: string): string | null {
  try {
    const key = getKey();
    const parts = encryptedToken.split(':');
    if (parts.length !== 3) return null;
    const [ivB64, tagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Covers: auth-tag mismatch (tampered), wrong format, missing env key
    return null;
  }
}
