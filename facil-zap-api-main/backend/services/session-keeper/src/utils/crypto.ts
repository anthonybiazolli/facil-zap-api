// ============================================
// CRYPTO UTILITIES
// Criptografia para armazenamento seguro de credenciais
// ============================================

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

export function encryptData(data: string, key: string): string {
  // Gerar salt aleatório
  const salt = randomBytes(SALT_LENGTH);
  
  // Derivar chave usando scrypt
  const derivedKey = scryptSync(key, salt, 32);
  
  // Gerar IV aleatório
  const iv = randomBytes(IV_LENGTH);
  
  // Criar cipher
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  
  // Criptografar
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Obter auth tag
  const authTag = cipher.getAuthTag();
  
  // Combinar: salt + iv + authTag + encrypted
  const result = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, 'hex'),
  ]).toString('base64');
  
  return result;
}

export function decryptData(encryptedData: string, key: string): string {
  // Decodificar base64
  const buffer = Buffer.from(encryptedData, 'base64');
  
  // Extrair componentes
  const salt = buffer.subarray(0, SALT_LENGTH);
  const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = buffer.subarray(
    SALT_LENGTH + IV_LENGTH, 
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const encrypted = buffer.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  
  // Derivar chave
  const derivedKey = scryptSync(key, salt, 32);
  
  // Criar decipher
  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);
  
  // Descriptografar
  let decrypted = decipher.update(encrypted.toString('hex'), 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export function generateSecureToken(length: number = 32): string {
  return randomBytes(length).toString('base64url');
}

export function hashData(data: string, salt?: string): { hash: string; salt: string } {
  const usedSalt = salt || randomBytes(16).toString('hex');
  const hash = scryptSync(data, usedSalt, 64).toString('hex');
  return { hash, salt: usedSalt };
}

export function verifyHash(data: string, hash: string, salt: string): boolean {
  const computed = scryptSync(data, salt, 64).toString('hex');
  return computed === hash;
}