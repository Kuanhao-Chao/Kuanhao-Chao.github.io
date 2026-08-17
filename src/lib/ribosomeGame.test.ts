import { describe, it, expect } from 'vitest';
import {
  createRibosomeGame,
  stepGame,
  generateAnticodonChoices,
} from './ribosomeGame';

describe('Ribosome Translation Rush Game Engine', () => {
  it('initializes with standard Methionine start codon AUG and 100 ATP energy', () => {
    const game = createRibosomeGame(1200);
    expect(game.status).toBe('ready');
    expect(game.score).toBe(0);
    expect(game.highScore).toBe(1200);
    expect(game.energy).toBe(100);
    expect(game.stream[0].codon).toBe('AUG');
    expect(game.stream[0].anticodon).toBe('UAC');
    expect(game.stream[0].aminoAcid).toBe('M');
  });

  it('starts the game on START action', () => {
    const game = createRibosomeGame();
    const playing = stepGame(game, { type: 'START' });
    expect(playing.status).toBe('playing');
  });

  it('advances peptide chain on correct tRNA anticodon match', () => {
    let game = createRibosomeGame();
    game = stepGame(game, { type: 'START' });

    // First codon is AUG -> anticodon UAC
    game = stepGame(game, { type: 'MATCH_TRNA', anticodon: 'UAC' });
    expect(game.score).toBeGreaterThan(0);
    expect(game.chain).toEqual(['M']);
    expect(game.combo).toBe(1);
    expect(game.currentIndex).toBe(1);
  });

  it('deducts energy and breaks combo on mismatched tRNA', () => {
    let game = createRibosomeGame();
    game = stepGame(game, { type: 'START' });

    // Wrong anticodon
    game = stepGame(game, { type: 'MATCH_TRNA', anticodon: 'ZZZ' });
    expect(game.energy).toBe(85);
    expect(game.combo).toBe(0);
    expect(game.chain.length).toBe(0);
  });

  it('splices introns when encountering an intron element', () => {
    let game = createRibosomeGame();
    game = stepGame(game, { type: 'START' });

    // Force current item to be an intron
    game.stream[game.currentIndex] = {
      id: 99,
      codon: 'GURAG',
      anticodon: '---',
      aminoAcid: '?',
      aminoName: 'Intron Loop',
      isStop: false,
      isIntron: true,
    };

    game = stepGame(game, { type: 'SPLICE' });
    expect(game.score).toBeGreaterThan(0);
    expect(game.combo).toBe(1);
    expect(game.message).toContain('Spliceosome');
  });

  it('penalizes incorrect splicing on mature coding exons', () => {
    let game = createRibosomeGame();
    game = stepGame(game, { type: 'START' });

    // Item 0 is coding AUG exon
    game = stepGame(game, { type: 'SPLICE' });
    expect(game.energy).toBe(85);
    expect(game.message).toContain('Mis-splicing');
  });

  it('handles game over when ATP energy reaches zero', () => {
    let game = createRibosomeGame();
    game = stepGame(game, { type: 'START' });
    game.energy = 10;

    game = stepGame(game, { type: 'MATCH_TRNA', anticodon: 'WRONG' });
    expect(game.energy).toBe(0);
    expect(game.status).toBe('gameover');
  });

  it('generates 4 valid anticodon choices containing the correct one', () => {
    const choices = generateAnticodonChoices('UAC');
    expect(choices.length).toBe(4);
    expect(choices.includes('UAC')).toBe(true);
  });
});
