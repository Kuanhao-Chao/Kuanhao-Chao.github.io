import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSecureStoredApiKey,
  setSecureStoredApiKey,
  testGoogleMapsApiKey,
  GOOGLE_MAPS_DARK_STYLE,
} from './googleMaps';

describe('Google Maps API manager & diagnostics', () => {
  beforeEach(async () => {
    await setSecureStoredApiKey(null);
  });

  it('manages API key storage safely', async () => {
    expect(await getSecureStoredApiKey()).toBeNull();

    await setSecureStoredApiKey('AIzaSyDUMMY_KEY_12345');
    expect(await getSecureStoredApiKey()).toBe('AIzaSyDUMMY_KEY_12345');

    await setSecureStoredApiKey(null);
    expect(await getSecureStoredApiKey()).toBeNull();
  });

  it('validates key format and flags empty or malformed keys with recommendations', async () => {
    const emptyResult = await testGoogleMapsApiKey('');
    expect(emptyResult.valid).toBe(false);
    expect(emptyResult.errorMessage).toContain('cannot be empty');

    const malformedResult = await testGoogleMapsApiKey('invalid_key_123');
    expect(malformedResult.valid).toBe(false);
    expect(malformedResult.errorMessage).toContain('AIza');
  });

  it('contains comprehensive dark mode styling JSON for Google Maps', () => {
    expect(GOOGLE_MAPS_DARK_STYLE.length).toBeGreaterThan(5);
    const waterStyle = GOOGLE_MAPS_DARK_STYLE.find((s) => s.featureType === 'water');
    expect(waterStyle).toBeDefined();
  });
});
