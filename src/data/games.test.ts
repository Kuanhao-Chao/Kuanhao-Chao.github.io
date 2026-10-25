import { describe, expect, it } from 'vitest';
import { sideProjects } from './cv';

describe('side-project catalog', () => {
  it('keeps the requested featured sequence and moves the four lower-priority games to the end', () => {
    expect(sideProjects.map((game) => game.name)).toEqual([
      'Biobaby',
      'Tank Fire',
      'Genome Jumper',
      '100-Floor Descent',
      'Flappy Penguin',
      'Proofreader',
      'Proofreader Classic',
      'Dino Run',
      'Snake',
      'Tetris',
      'Chinese Chess',
      '2048',
      'Minesweeper',
      'CRISPR Commander',
      'Phage Defense',
      'Jetpack Joyride',
      'BayRoute',
    ]);
    expect(new Set(sideProjects.map((game) => game.name)).size).toBe(17);
  });
  it('preserves every game destination independently of its listing position', () => {
    expect(Object.fromEntries(sideProjects.map((game) => [game.name, game.url]))).toEqual({
      Biobaby: 'https://storage.googleapis.com/storage.khchao.com/biobaby/index.html',
      'Tank Fire': 'https://storage.googleapis.com/storage.khchao.com/tanks_fire/index.html',
      'Flappy Penguin':
        'https://storage.googleapis.com/storage.khchao.com/flappy_penguin/index.html',
      'CRISPR Commander': '/games/crispr-commander/',
      'Phage Defense': '/games/phage-defense/',
      'Genome Jumper': '/games/genome-jumper/',
      Proofreader: '/games/proofreader/',
      'Proofreader Classic': '/games/proofreader-classic/',
      'Dino Run': '/games/dino-run/',
      Snake: '/games/snake/',
      Tetris: '/games/tetris/',
      'Jetpack Joyride': '/games/jetpack-joyride/',
      'Chinese Chess': '/games/chinese-chess/',
      BayRoute: '/games/bay-route/',
      '2048': '/games/2048/',
      Minesweeper: '/games/minesweeper/',
      '100-Floor Descent': '/games/100-floor-descent/',
    });
    expect(new Set(sideProjects.map((game) => game.url)).size).toBe(17);
    for (const project of sideProjects) expect(project.detail.length).toBeGreaterThan(50);
  });
  it('presents BayRoute as a learning lab rather than a navigation service', () => {
    expect(sideProjects.find((game) => game.name === 'BayRoute')?.detail).toContain('curated');
    expect(sideProjects.find((game) => game.name === 'BayRoute')?.detail).toContain('teaching lab');
  });
});
