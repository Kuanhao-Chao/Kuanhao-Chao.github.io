import { describe, it, expect, beforeEach } from 'vitest';
import {
  encryptCredential,
  decryptCredential,
  getSecureStoredApiKey,
  setSecureStoredApiKey,
} from './cryptoStorage';

describe('Web Crypto AES-GCM credential encryption', () => {
  beforeEach(async () => {
    await setSecureStoredApiKey(null);
  });

  it('encrypts and decrypts API credentials losslessly', async () => {
    const rawKey = 'AIzaSyCS9_niZiBx9PvL3Mf1yEe7msOvYBjNX0E';
    const encrypted = await encryptCredential(rawKey);

    expect(encrypted).not.toBe(rawKey);
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = await decryptCredential(encrypted);
    expect(decrypted).toBe(rawKey);
  });

  it('manages encrypted secure storage lifecycle', async () => {
    expect(await getSecureStoredApiKey()).toBeNull();

    const sampleKey = 'AIzaSyTEST_ENCRYPTED_KEY_999';
    await setSecureStoredApiKey(sampleKey);

    const retrieved = await getSecureStoredApiKey();
    expect(retrieved).toBe(sampleKey);

    await setSecureStoredApiKey(null);
    expect(await getSecureStoredApiKey()).toBeNull();
  });
});
