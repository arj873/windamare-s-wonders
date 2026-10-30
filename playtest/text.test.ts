import { describe, expect, it } from 'vitest';
import { matchChoice, normalize, parseFlags, parseSeat, slugify } from './text';

describe('normalize', () => {
  it('drops emoji, punctuation and case', () => {
    expect(normalize('🌾 Reed Hive!')).toBe('reed hive');
    expect(normalize('  Buy:   Salt 3g ')).toBe('buy: salt 3g');
  });
});

describe('matchChoice', () => {
  const hand = ['Reed Hut', 'Reed Hall', 'Beacon', 'Moot Hall'];

  it('prefers an exact label over looser matches', () => {
    expect(matchChoice('Beacon', hand)).toEqual({ kind: 'one', index: 2, how: 'exact' });
    expect(matchChoice('beacon', hand)).toEqual({ kind: 'one', index: 2, how: 'exact' });
  });

  it('accepts word prefixes and substrings when they are unique', () => {
    expect(matchChoice('moot', hand)).toMatchObject({ kind: 'one', index: 3, how: 'fuzzy' });
    expect(matchChoice('ea', hand)).toMatchObject({ kind: 'one', index: 2 });
  });

  it('never guesses between several fuzzy hits', () => {
    expect(matchChoice('reed', hand)).toEqual({ kind: 'many', indices: [0, 1] });
    expect(matchChoice('hall', hand)).toEqual({ kind: 'many', indices: [1, 3] });
  });

  it('reports no match for an empty or unknown query', () => {
    expect(matchChoice('', hand)).toEqual({ kind: 'none' });
    expect(matchChoice('castle', hand)).toEqual({ kind: 'none' });
  });
});

describe('parseSeat', () => {
  it('reads 1-based seat numbers in several spellings', () => {
    expect(parseSeat('2', 4)).toBe(1);
    expect(parseSeat('seat3', 4)).toBe(2);
    expect(parseSeat('Seat 4', 4)).toBe(3);
  });
  it('rejects out of range and junk', () => {
    expect(parseSeat('0', 4)).toBeNull();
    expect(parseSeat('5', 4)).toBeNull();
    expect(parseSeat('two', 4)).toBeNull();
    expect(parseSeat(undefined, 4)).toBeNull();
  });
});

describe('slugify', () => {
  it('makes a file-name-safe slug', () => {
    expect(slugify("Pick screen can't scroll!")).toBe('pick-screen-can-t-scroll');
    expect(slugify('!!!')).toBe('bug');
    expect(slugify('a'.repeat(100)).length).toBe(40);
  });
});

describe('parseFlags', () => {
  it('splits positional words from --flag values', () => {
    expect(parseFlags(['2', 'build', '--cover', 'Reed', 'Hut', '--any=salt,peat'])).toEqual({
      positional: ['2', 'build'],
      flags: { cover: 'Reed Hut', any: 'salt,peat' },
    });
  });
  it('gives a bare flag an empty value', () => {
    expect(parseFlags(['--help'])).toEqual({ positional: [], flags: { help: '' } });
  });
});
