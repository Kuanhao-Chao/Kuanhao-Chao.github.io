import { describe, expect, it } from 'vitest';
import { sideProjects } from './cv';

describe('side-project catalog', () => {
  it('preserves the original fifteen games and appends 100-Floor Descent as the sixteenth entry', () => {
    expect(sideProjects.map((game) => game.name)).toEqual([
      'Biobaby',
      'Tank Fire',
      'Flappy Penguin',
      'CRISPR Commander',
      'Phage Defense',
      'Genome Jumper',
      'Proofreader',
      'Dino Run',
      'Snake',
      'Tetris',
      'Jetpack Joyride',
      'Chinese Chess',
      'BayRoute',
      '2048',
      'Minesweeper',
      '100-Floor Descent',
    ]);
    expect(new Set(sideProjects.map((game) => game.url)).size).toBe(16);
    for (const [index, project] of sideProjects.entries()) {
      expect(project.url).toMatch(
        index < 3
          ? /^https:\/\/storage\.googleapis\.com\/storage\.khchao\.com\/[^/]+\/index\.html$/
          : /^\/games\/[a-z0-9-]+\/$/
      );
      expect(project.detail.length).toBeGreaterThan(50);
    }
  });
  it('presents BayRoute as a learning lab rather than a navigation service', () => {
    expect(sideProjects.find((game) => game.name === 'BayRoute')?.detail).toContain('curated');
    expect(sideProjects.find((game) => game.name === 'BayRoute')?.detail).toContain('teaching lab');
  });
});
