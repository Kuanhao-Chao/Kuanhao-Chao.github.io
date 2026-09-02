import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEY_GMAP_API_KEY,
  getSavedGoogleMapsApiKey,
  setSavedGoogleMapsApiKey,
  testGoogleMapsApiKey,
  GOOGLE_MAPS_DARK_STYLE,
} from './googleMaps';

describe('Google Maps API manager & diagnostics', () => {
  beforeEach(() => {
    setSavedGoogleMapsApiKey(null);
  });

  it('manages API key storage in localStorage safely', () => {
    expect(getSavedGoogleMapsApiKey()).toBeNull();

    setSavedGoogleMapsApiKey('AIzaSyDUMMY_KEY_12345');
    expect(getSavedGoogleMapsApiKey()).toBe('AIzaSyDUMMY_KEY_12345');

    setSavedGoogleMapsApiKey(null);
    expect(getSavedGoogleMapsApiKey()).toBeNull();
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
