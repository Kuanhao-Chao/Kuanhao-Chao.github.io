import { describe, expect, it } from 'vitest';
import { gameGallery } from './games';
import { sideProjects } from './cv';

describe('browser game gallery', () => {
  it('features the nine requested games exactly once with existing internal destinations', () => {
    expect(gameGallery.map(game => game.name)).toEqual(['CRISPR Commander', 'Phage Defense', 'Genome Jumper', 'Proofreader', 'Dino Run', 'Chinese Chess', 'BayRoute', 'Minesweeper', '2048']);
    expect(new Set(gameGallery.map(game => game.name)).size).toBe(9);
    for (const entry of gameGallery) {
      const project = sideProjects.find(item => item.name === entry.name);
      expect(project?.url).toMatch(/^\/games\/[a-z0-9-]+\/$/);
      expect(project?.detail.length).toBeGreaterThan(50);
      expect(entry.controls.length).toBeGreaterThan(10);
    }
  });
  it('presents BayRoute as a learning lab rather than a navigation service', () => {
    expect(gameGallery.find(game => game.name === 'BayRoute')?.category).toBe('Learning lab');
    expect(sideProjects.find(game => game.name === 'BayRoute')?.detail).toContain('curated');
  });
});
