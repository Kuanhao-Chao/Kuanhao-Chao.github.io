import { describe, it, expect } from 'vitest';
import {
  LOCAL_BAY_GAZETTEER,
  isWithinBayArea,
  searchBayAreaPlaces,
  reverseGeocodeLocal,
} from './geocoding';

describe('geocoding and gazetteer engine', () => {
  it('contains comprehensive gazetteer entries all inside Bay Area bounds', () => {
    expect(LOCAL_BAY_GAZETTEER.length).toBeGreaterThan(40);

    for (const place of LOCAL_BAY_GAZETTEER) {
      expect(isWithinBayArea(place.lat, place.lng)).toBe(true);
      expect(place.name.length).toBeGreaterThan(0);
      expect(place.address.length).toBeGreaterThan(0);
      expect(place.city.length).toBeGreaterThan(0);
    }
  });

  it('searches iconic tech campuses and landmarks instantly from local gazetteer', async () => {
    const appleResults = await searchBayAreaPlaces('Apple Park');
    expect(appleResults.length).toBeGreaterThan(0);
    expect(appleResults[0].city).toBe('Cupertino');

    const berkeleyResults = await searchBayAreaPlaces('Campanile Berkeley');
    expect(berkeleyResults.length).toBeGreaterThan(0);
    expect(berkeleyResults[0].city).toBe('Berkeley');

    const metaResults = await searchBayAreaPlaces('Hacker Way');
    expect(metaResults.length).toBeGreaterThan(0);
    expect(metaResults[0].city).toBe('Menlo Park');

    const fidiResults = await searchBayAreaPlaces('Transamerica');
    expect(fidiResults.length).toBeGreaterThan(0);
    expect(fidiResults[0].city).toBe('San Francisco');
  });

  it('reverse geocodes GPS coordinates to the nearest landmark or formatted location', () => {
    // Exact SF Ferry Building coords
    const ferryRes = reverseGeocodeLocal(37.7955, -122.3937);
    expect(ferryRes.city).toBe('San Francisco');
    expect(ferryRes.name).toContain('Ferry');

    // Stanford coords
    const stanfordRes = reverseGeocodeLocal(37.4275, -122.1697);
    expect(stanfordRes.city).toBe('Palo Alto');
    expect(stanfordRes.name).toContain('Stanford');
  });
});
