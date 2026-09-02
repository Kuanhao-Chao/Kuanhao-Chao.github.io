/**
 * Web Crypto API Client-Side Credential Encryption & Obfuscation.
 * Stores sensitive API keys encrypted using AES-GCM in localStorage.
 */

const STORAGE_ENC_KEY = 'bayroute_gmap_enc';
const SALT_STRING = 'BayRoute_Security_Salt_2026_v1';

let memoryEncryptedStore: string | null = null;

/**
 * Derives a deterministic cryptographic AES key from the client origin and salt.
 */
async function getCryptoKey(): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }

  const enc = new TextEncoder();
  const originSeed = typeof window !== 'undefined' ? window.location.origin : 'localhost';
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${originSeed}_${SALT_STRING}`),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(SALT_STRING),
      iterations: 10000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a plaintext string using AES-GCM and returns a Base64 payload.
 */
export async function encryptCredential(plaintext: string): Promise<string> {
  const clean = plaintext.trim();
  if (!clean) return '';

  try {
    const key = await getCryptoKey();
    if (!key || typeof crypto === 'undefined') {
      // Fallback base64 obfuscation for environments without crypto.subtle
      return btoa(encodeURIComponent(clean));
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(clean)
    );

    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);

    let binary = '';
    for (let i = 0; i < combined.length; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    return btoa(binary);
  } catch (_e) {
    return btoa(encodeURIComponent(clean));
  }
}

/**
 * Decrypts an AES-GCM Base64 payload back to plaintext.
 */
export async function decryptCredential(payload: string): Promise<string | null> {
  const clean = payload.trim();
  if (!clean) return null;

  try {
    const key = await getCryptoKey();
    const rawBinary = atob(clean);

    if (!key || typeof crypto === 'undefined') {
      return decodeURIComponent(rawBinary);
    }

    const bytes = new Uint8Array(rawBinary.length);
    for (let i = 0; i < rawBinary.length; i++) {
      bytes[i] = rawBinary.charCodeAt(i);
    }

    if (bytes.length < 13) {
      // Not an AES-GCM buffer, try raw base64 decode
      return decodeURIComponent(atob(clean));
    }

    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decryptedBuffer);
  } catch (_e) {
    try {
      return decodeURIComponent(atob(clean));
    } catch (_fallbackErr) {
      return null;
    }
  }
}

/**
 * Retrieves the stored Google Maps API key from encrypted localStorage, window global, or env.
 */
export async function getSecureStoredApiKey(): Promise<string | null> {
  // 1. Check local .env (injected at build time if present)
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PUBLIC_GOOGLE_MAPS_API_KEY) {
    const envKey = String(import.meta.env.PUBLIC_GOOGLE_MAPS_API_KEY).trim();
    if (envKey) return envKey;
  }

  // 2. Check encrypted localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const encrypted = localStorage.getItem(STORAGE_ENC_KEY);
      if (encrypted) {
        const decrypted = await decryptCredential(encrypted);
        if (decrypted && decrypted.trim().length > 0) {
          return decrypted.trim();
        }
      }
    } catch (_e) {}
  }

  if (memoryEncryptedStore) {
    return decryptCredential(memoryEncryptedStore);
  }

  return null;
}

/**
 * Encrypts and saves the Google Maps API key in localStorage.
 */
export async function setSecureStoredApiKey(keyString: string | null): Promise<void> {
  const clean = keyString && keyString.trim().length > 0 ? keyString.trim() : null;

  if (!clean) {
    memoryEncryptedStore = null;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.removeItem(STORAGE_ENC_KEY);
      } catch (_e) {}
    }
    return;
  }

  const encrypted = await encryptCredential(clean);
  memoryEncryptedStore = encrypted;

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_ENC_KEY, encrypted);
    } catch (_e) {}
  }
}
