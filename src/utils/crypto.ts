import { AES, enc } from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

const privateKey = process.env.MARQUINHOS_SECRET_KEY;

export function encryptToken(token: string): string | null {
  if (!privateKey) {
    return null;
  }
  return AES.encrypt(token, privateKey).toString();
}

export function decryptToken(encryptedToken: string): string | null {
  if (!privateKey) {
    return null;
  }
  const bytes = AES.decrypt(encryptedToken, privateKey);
  return bytes.toString(enc.Utf8);
}
