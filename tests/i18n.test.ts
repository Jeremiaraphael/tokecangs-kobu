import { describe, expect, it } from 'vitest';
import { msg, translate, translateError, translateMsg, translationProblems } from '../shared/i18n';

describe('i18n', () => {
  it('names the app per language', () => {
    expect(translate('en', 'app.name')).toBe("Tokecang's Kobu");
    expect(translate('id', 'app.name')).toBe('Kobu Tokecang');
  });

  it('fills placeholders, English plurals and rank names', () => {
    expect(translate('en', 'player.cards', { n: 1 })).toBe('1 card');
    expect(translate('en', 'player.cards', { n: 3 })).toBe('3 cards');
    expect(translate('id', 'player.cards', { n: 3 })).toBe('3 kartu');
    expect(translate('en', 'tc.matchPrompt', { rank: 'A' })).toContain('also an Ace');
    expect(translate('en', 'tc.matchPrompt', { rank: '8' })).toContain('also an 8');
    expect(translate('en', 'tc.matchPrompt', { rank: 'Q' })).toContain('also a Queen');
    expect(translate('id', 'tc.matchPrompt', { rank: 'A' })).toContain('juga As');
  });

  it('renders nested log messages in either language', () => {
    const m = msg('log.peeked', { name: 'Alice', ref: msg('ref.other', { owner: 'Bob', slot: 2 }) });
    expect(translateMsg('en', m)).toBe("Alice peeked at Bob's card #2");
    expect(translateMsg('id', m)).toBe('Alice mengintip kartu #2 milik Bob');
  });

  it('has an Indonesian translation for every English key, with the same placeholders', () => {
    expect(translationProblems('id')).toEqual([]);
  });

  it('translates server errors, including ones with values', () => {
    expect(translateError('id', "It's not your turn")).toBe('Bukan giliranmu');
    expect(translateError('id', 'Need at least 2 players')).toBe('Butuh minimal 2 pemain');
    expect(translateError('id', 'Bob is still connected')).toBe('Bob masih terhubung');
    expect(translateError('en', "It's not your turn")).toBe("It's not your turn");
  });
});
