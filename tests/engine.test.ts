import { describe, expect, it } from 'vitest';
import { GameError, addPlayer, applyAction, buildDeck, createGame, scoreRound } from '../shared/engine';
import {
  cardLabel,
  cardPoints,
  cardPower,
  handPoints,
  type Card,
  type CardFace,
  type GameAction,
  type GameState,
  type Rank,
  type Suit,
} from '../shared/types';
import { toPlayerView } from '../shared/view';

// Deterministic RNG so deals are reproducible.
function seeded(seed = 42) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

/** Card shorthand: '7S', '10H', 'QD', 'KC', 'AS', 'JK' (Joker). */
let uid = 0;
function c(code: string): Card {
  if (code === 'JK') return { rank: 'JOKER', suit: null, id: `t${uid++}`, knownBy: [] };
  return { rank: code.slice(0, -1) as Rank, suit: code.slice(-1) as Suit, id: `t${uid++}`, knownBy: [] };
}
const f = (code: string): CardFace => {
  const { rank, suit } = c(code);
  return { rank, suit };
};

/**
 * Start a game, rig the "who goes first" draw so `starterId` gets the Joker
 * (lowest card), let everyone pick, and deal the first round.
 */
function startAndDeal(s: GameState, starterId = s.players[0].id, rng = seeded()) {
  applyAction(s, s.hostId, { type: 'startGame' }, rng);
  s.starterDraw!.offered = s.players.map((p, i) => c(p.id === starterId ? 'JK' : `${i + 2}S`));
  s.players.forEach((p, i) => applyAction(s, p.id, { type: 'pickStarter', index: i }, rng));
  applyAction(s, s.hostId, { type: 'dealCards' }, rng);
}

/** A 3-player game past the peek phase, with A to move. */
function setup(handSize: 4 | 6 = 4): GameState {
  const s = createGame('TEST1', { id: 'A', name: 'Alice' }, { handSize });
  addPlayer(s, 'B', 'Bob');
  addPlayer(s, 'C', 'Cara');
  startAndDeal(s);
  for (const id of ['A', 'B', 'C']) {
    applyAction(s, id, { type: 'initialPeek', slot: 0 });
    applyAction(s, id, { type: 'ready' });
  }
  return s;
}

const player = (s: GameState, id: string) => s.players.find((p) => p.id === id)!;
const setHand = (s: GameState, id: string, codes: string[]) => {
  player(s, id).hand = codes.map(c);
};
/** Labels of a hand; '_' marks a gap left by a matched card. */
const hand = (s: GameState, id: string) => player(s, id).hand.map((x) => (x ? cardLabel(x) : '_'));
const act = (s: GameState, id: string, a: GameAction) => applyAction(s, id, a, seeded(7));
const current = (s: GameState) => s.players[s.currentPlayerIndex].id;
/** Put `code` on top of the draw pile, have `id` draw it and discard it (→ power). */
const drawAndDiscard = (s: GameState, id: string, code: string) => {
  s.drawPile.push(c(code));
  act(s, id, { type: 'drawDeck' });
  act(s, id, { type: 'discardDrawn' });
};
const ref = (playerId: string, slot: number) => ({ playerId, slot });

describe('cards & points', () => {
  it('builds a 56-card deck: 52 standard cards + 4 Jokers', () => {
    const deck = buildDeck(1);
    expect(deck).toHaveLength(56);
    expect(deck.filter((x) => x.rank === 'JOKER')).toHaveLength(4);
    expect(deck.filter((x) => x.rank === 'Q')).toHaveLength(4);
    expect(new Set(deck.filter((x) => x.rank === 'K').map((x) => x.suit))).toEqual(new Set(['S', 'C', 'H', 'D']));
  });

  it('scores number cards at face value and Ace as 1 (or 0)', () => {
    expect(cardPoints(f('7S'))).toBe(7);
    expect(cardPoints(f('10D'))).toBe(10);
    expect(cardPoints(f('AH'))).toBe(1);
    expect(cardPoints(f('AH'), { aceValue: 0 })).toBe(0);
  });

  it('scores black J/Q/K as 0, red J/Q/K as 13, Joker as -1', () => {
    for (const r of ['J', 'Q', 'K']) {
      expect(cardPoints(f(`${r}S`))).toBe(0);
      expect(cardPoints(f(`${r}C`))).toBe(0);
      expect(cardPoints(f(`${r}H`))).toBe(13);
      expect(cardPoints(f(`${r}D`))).toBe(13);
    }
    expect(cardPoints(f('JK'))).toBe(-1);
    expect(handPoints(['JK', 'JK', 'JK', 'JK'].map(f))).toBe(-4);
  });

  it('maps powers by rank regardless of colour', () => {
    expect(cardPower(f('7H'))).toBe('peekOwn');
    expect(cardPower(f('8C'))).toBe('spy');
    expect(cardPower(f('9D'))).toBeNull();
    expect(cardPower(f('10S'))).toBeNull();
    expect(cardPower(f('JH'))).toBe('blindSwap');
    expect(cardPower(f('JS'))).toBe('blindSwap');
    expect(cardPower(f('QD'))).toBe('queen');
    expect(cardPower(f('KC'))).toBe('king');
    expect(cardPower(f('JK'))).toBeNull();
  });
});

describe('setup & modes', () => {
  it('deals 4 cards in 4-card mode and 6 in 6-card mode', () => {
    for (const handSize of [4, 6] as const) {
      const s = createGame('X', { id: 'A', name: 'Alice' }, { handSize });
      addPlayer(s, 'B', 'Bob');
      startAndDeal(s);
      expect(s.players.every((p) => p.hand.length === handSize)).toBe(true);
      expect(s.drawPile).toHaveLength(56 - 2 * handSize);
      expect(s.discardPile).toHaveLength(0);
    }
  });

  it('starts with an empty discard pile: 2 players × 4 cards → draw pile 48, discard 0', () => {
    const s = createGame('X', { id: 'A', name: 'Alice' });
    addPlayer(s, 'B', 'Bob');
    startAndDeal(s);
    expect(s.drawPile).toHaveLength(48);
    expect(s.discardPile).toHaveLength(0);
    const v = toPlayerView(s, 'A');
    expect(v).toMatchObject({ drawPileCount: 48, discardCount: 0, discardTop: null });
    for (const id of ['A', 'B']) {
      act(s, id, { type: 'initialPeek', slot: 0 });
      act(s, id, { type: 'ready' });
    }
    // The first discard happens only when the first player draws and throws a card away.
    act(s, 'A', { type: 'drawDeck' });
    expect(s.discardPile).toHaveLength(0);
    act(s, 'A', { type: 'swapDrawn', slot: 0 });
    expect(s.drawPile).toHaveLength(47);
    expect(s.discardPile).toHaveLength(1);
  });

  it('6 players × 6 cards fits in the deck', () => {
    const s = createGame('X', { id: 'P0', name: 'P0' }, { handSize: 6 });
    for (let i = 1; i < 6; i++) addPlayer(s, `P${i}`, `P${i}`);
    startAndDeal(s);
    expect(s.drawPile).toHaveLength(56 - 36);
  });

  it('host can switch modes before the game, not during', () => {
    const s = createGame('X', { id: 'A', name: 'Alice' });
    addPlayer(s, 'B', 'Bob');
    expect(() => act(s, 'B', { type: 'configure', settings: { handSize: 6 } })).toThrow(/host/);
    act(s, 'A', { type: 'configure', settings: { handSize: 6, aceValue: 0 } });
    expect(s.settings).toMatchObject({ handSize: 6, aceValue: 0 });
    expect(() => act(s, 'A', { type: 'configure', settings: { handSize: 5 as 4 } })).toThrow(/4 or 6/);
    act(s, 'A', { type: 'startGame' });
    expect(() => act(s, 'A', { type: 'configure', settings: { handSize: 4 } })).toThrow(/before a game/);
  });

  it('peek phase: exactly 1 peek in both modes, slots validated against hand size', () => {
    for (const handSize of [4, 6] as const) {
      const s = createGame('X', { id: 'A', name: 'Alice' }, { handSize });
      addPlayer(s, 'B', 'Bob');
      startAndDeal(s);
      expect(() => act(s, 'A', { type: 'ready' })).toThrow(/Peek at 1 card first/);
      expect(() => act(s, 'A', { type: 'initialPeek', slot: handSize })).toThrow(/Invalid card slot/);
      act(s, 'A', { type: 'initialPeek', slot: handSize - 1 });
      expect(() => act(s, 'A', { type: 'initialPeek', slot: 0 })).toThrow(/only peek at 1 card/);
      const mine = toPlayerView(s, 'A').players[0].hand;
      expect(mine.filter((x) => x?.face)).toHaveLength(1);
      expect(mine.at(-1)!.face).toBeDefined();
      act(s, 'A', { type: 'ready' });
      expect(toPlayerView(s, 'A').players[0].hand.every((x) => !x?.face)).toBe(true);
    }
  });
});

describe('who goes first', () => {
  const three = () => {
    const s = createGame('X', { id: 'A', name: 'Alice' });
    addPlayer(s, 'B', 'Bob');
    addPlayer(s, 'C', 'Cara');
    act(s, 'A', { type: 'startGame' });
    return s;
  };
  const rig = (s: GameState, codes: string[]) => {
    s.starterDraw!.offered = codes.map(c);
  };
  const pickAll = (s: GameState) => s.players.forEach((p, i) => act(s, p.id, { type: 'pickStarter', index: i }));

  it('offers one face-down card per player; faces stay hidden until everyone has picked', () => {
    const s = three();
    expect(s.phase).toBe('starterDraw');
    expect(s.starterDraw!.offered).toHaveLength(3);
    expect(s.players.every((p) => p.hand.length === 0)).toBe(true);
    act(s, 'B', { type: 'pickStarter', index: 1 });
    const v = toPlayerView(s, 'A').starterDraw!;
    expect(v.offered.map((o) => o.takenBy)).toEqual([null, 'B', null]);
    expect(v.offered.every((o) => o.face === undefined)).toBe(true);
    expect(toPlayerView(s, 'B').starterDraw!.offered[1].face).toBeUndefined(); // not even your own yet
  });

  it('validates picks', () => {
    const s = three();
    act(s, 'A', { type: 'pickStarter', index: 0 });
    expect(() => act(s, 'A', { type: 'pickStarter', index: 1 })).toThrow(/already took/);
    expect(() => act(s, 'B', { type: 'pickStarter', index: 0 })).toThrow(/Someone already took/);
    expect(() => act(s, 'B', { type: 'pickStarter', index: 3 })).toThrow(/Invalid card/);
    expect(() => act(s, 'A', { type: 'dealCards' })).toThrow(/Finish choosing/);
  });

  it('lowest card by points starts: Joker < black face (0) < Ace < ... < red face (13)', () => {
    const s = three();
    rig(s, ['5S', 'KC', 'AH']); // A=5, B=0, C=1
    pickAll(s);
    expect(s.starterDraw!.winnerId).toBe('B');
    expect(toPlayerView(s, 'C').starterDraw!.offered.map((o) => cardLabel(o.face!))).toEqual(['5♠', 'K♣', 'A♥']);
    expect(() => act(s, 'B', { type: 'dealCards' })).toThrow(/host/);
    act(s, 'A', { type: 'dealCards' });
    // Offered cards went back into a fresh shuffled deck; nothing is on the discard pile yet.
    expect(s.phase).toBe('peeking');
    expect(s.discardPile).toHaveLength(0);
    expect(s.drawPile).toHaveLength(56 - 12);
    for (const id of ['A', 'B', 'C']) {
      act(s, id, { type: 'initialPeek', slot: 0 });
      act(s, id, { type: 'ready' });
    }
    expect(current(s)).toBe('B');
  });

  it('red faces are high: K of hearts (13) loses to a 10', () => {
    const s = three();
    rig(s, ['KH', '10S', 'QD']);
    pickAll(s);
    expect(s.starterDraw!.winnerId).toBe('B');
  });

  it('players tied for lowest get new cards automatically until one is lowest', () => {
    const s = three();
    rig(s, ['2S', '2H', '9S']); // A and B tie at 2
    // Popped in order: A=K♠ (0), B=Q♣ (0) → tie again; then A=9♣, B=4♦ → B wins.
    s.starterDraw!.pool.push(c('4D'), c('9C'), c('QC'), c('KS'));
    pickAll(s);
    const sd = s.starterDraw!;
    expect(sd.redraws.map((r) => r.map((x) => `${x.playerId}:${cardLabel(x.card)}`))).toEqual([
      ['A:K♠', 'B:Q♣'],
      ['A:9♣', 'B:4♦'],
    ]);
    expect(sd.winnerId).toBe('B');
    expect(toPlayerView(s, 'C').starterDraw!.redraws).toHaveLength(2);
  });

  it('a tie that is NOT for lowest needs no redraw', () => {
    const s = three();
    rig(s, ['JK', '8S', '8H']);
    pickAll(s);
    expect(s.starterDraw!.redraws).toHaveLength(0);
    expect(s.starterDraw!.winnerId).toBe('A');
  });

  it('host can pick for players who have not picked (e.g. offline)', () => {
    const s = three();
    act(s, 'B', { type: 'pickStarter', index: 2 });
    expect(() => act(s, 'B', { type: 'autoPickStarter' })).toThrow(/host/);
    act(s, 'A', { type: 'autoPickStarter' });
    const picks = s.starterDraw!.picks;
    expect(picks.B).toBe(2);
    expect(new Set(Object.values(picks)).size).toBe(3);
    expect(s.starterDraw!.winnerId).not.toBeNull();
  });

  it('a new game after game over starts with a fresh draw and zeroed scores', () => {
    const s = setup();
    s.settings.targetScore = 1;
    act(s, 'A', { type: 'callKobu' });
    drawAndDiscard(s, 'B', '4S');
    drawAndDiscard(s, 'C', '4S');
    expect(s.phase).toBe('gameOver');
    act(s, 'A', { type: 'startGame' });
    expect(s.phase).toBe('starterDraw');
    expect(s.players.every((p) => p.totalScore === 0 && p.hand.length === 0)).toBe(true);
  });
});

describe('hidden information', () => {
  it('reveals the drawn card only to the drawer', () => {
    const s = setup();
    act(s, 'A', { type: 'drawDeck' });
    expect(toPlayerView(s, 'A').stage).toMatchObject({ kind: 'decideDrawn', face: expect.any(Object) });
    expect(toPlayerView(s, 'B').stage).toEqual({ kind: 'decideDrawn', face: undefined });
  });

  it('no opponent faces are sent during play', () => {
    const s = setup(6);
    const v = JSON.parse(JSON.stringify(toPlayerView(s, 'B')));
    for (const p of v.players) for (const x of p.hand) expect(x.face).toBeUndefined();
  });
});

describe('turn actions', () => {
  it('rejects moves out of turn', () => {
    const s = setup();
    expect(() => act(s, 'B', { type: 'drawDeck' })).toThrow(/not your turn/);
  });

  it('the discard pile can never be taken into your hand', () => {
    const s = setup();
    setHand(s, 'A', ['5S', '6S', '7S', '8S']);
    s.discardPile = [c('JK')];
    const takeDiscard = { type: 'takeDiscard', slot: 1 } as unknown as GameAction; // e.g. an old cached client
    expect(() => act(s, 'A', takeDiscard)).toThrow(/Unknown action/);
    expect(hand(s, 'A')).toEqual(['5♠', '6♠', '7♠', '8♠']);
    expect(s.discardPile.map(cardLabel)).toEqual(['Joker']);
    expect(current(s)).toBe('A');
  });

  it('draw then swap in does NOT trigger the power', () => {
    const s = setup();
    setHand(s, 'A', ['AS', 'AS', 'AS', 'AS']);
    s.drawPile.push(c('KH'));
    act(s, 'A', { type: 'drawDeck' });
    act(s, 'A', { type: 'swapDrawn', slot: 3 });
    expect(hand(s, 'A')[3]).toBe('K♥');
    expect(s.stage).toEqual({ kind: 'combo', placedSlot: 3 }); // no power – an optional combo step instead
    act(s, 'A', { type: 'finishTurn' });
    expect(current(s)).toBe('B');
  });

  it('9, 10 and Jokers have no power', () => {
    for (const code of ['9H', '10C', 'JK']) {
      const s = setup();
      drawAndDiscard(s, 'A', code);
      expect(current(s)).toBe('B');
    }
  });
});

describe('powers', () => {
  it('7: peek one of your own cards, then Done', () => {
    const s = setup();
    setHand(s, 'A', ['3S', '4S', 'QH', '6S']);
    drawAndDiscard(s, 'A', '7D');
    expect(s.stage).toMatchObject({ kind: 'power', power: 'peekOwn', step: 0 });
    expect(() => act(s, 'A', { type: 'peek', target: ref('B', 0) })).toThrow(/YOUR/);
    act(s, 'A', { type: 'peek', target: ref('A', 2) });
    expect(toPlayerView(s, 'A').stage).toMatchObject({ kind: 'power', step: 'review' });
    expect(toPlayerView(s, 'A').players[0].hand[2]!.face).toEqual({ rank: 'Q', suit: 'H' });
    expect(toPlayerView(s, 'B').players[0].hand[2]!.face).toBeUndefined();
    act(s, 'A', { type: 'endPeek' });
    expect(current(s)).toBe('B');
  });

  it('8: peek an opponent card only', () => {
    const s = setup();
    setHand(s, 'B', ['AS', 'JK', '2S', '3S']);
    drawAndDiscard(s, 'A', '8H');
    expect(() => act(s, 'A', { type: 'peek', target: ref('A', 0) })).toThrow(/opponent/);
    act(s, 'A', { type: 'peek', target: ref('B', 1) });
    expect(toPlayerView(s, 'A').players[1].hand[1]!.face).toEqual({ rank: 'JOKER', suit: null });
    expect(toPlayerView(s, 'B').players[1].hand[1]!.seenBy).toContain('Alice');
  });

  it('J: blind swap needs exactly one own + one opponent card', () => {
    const s = setup();
    setHand(s, 'A', ['9S', '9S', '9S', '9S']);
    setHand(s, 'C', ['AS', '2S', '3S', '4S']);
    drawAndDiscard(s, 'A', 'JS');
    expect(() => act(s, 'A', { type: 'swap', a: ref('B', 0), b: ref('C', 0) })).toThrow(/one of your cards/);
    expect(() => act(s, 'A', { type: 'swap', a: ref('A', 0), b: ref('A', 1) })).toThrow(/one of your cards/);
    act(s, 'A', { type: 'swap', a: ref('C', 2), b: ref('A', 0) });
    expect(hand(s, 'A')[0]).toBe('3♠');
    expect(hand(s, 'C')[2]).toBe('9♠');
    expect(toPlayerView(s, 'A').players[0].hand[0]!.face).toBeUndefined(); // still unseen
    expect(current(s)).toBe('B');
  });

  it('Q: peek opponent, then swap ANY two cards (even between two opponents)', () => {
    const s = setup();
    setHand(s, 'B', ['KH', '2S', '3S', '4S']);
    setHand(s, 'C', ['JK', '6S', '7S', '8S']);
    drawAndDiscard(s, 'A', 'QS');
    act(s, 'A', { type: 'peek', target: ref('B', 0) });
    // Peeked card stays visible to A while choosing the swap.
    const v = toPlayerView(s, 'A');
    expect(v.stage).toMatchObject({ kind: 'power', power: 'queen', step: 'swapAny', stepIndex: 1, stepCount: 2 });
    expect(v.players[1].hand[0]!.face).toEqual({ rank: 'K', suit: 'H' });
    expect(() => act(s, 'A', { type: 'swap', a: ref('B', 0), b: ref('B', 0) })).toThrow(/two different/);
    act(s, 'A', { type: 'swap', a: ref('B', 0), b: ref('C', 0) });
    expect(hand(s, 'B')[0]).toBe('Joker');
    expect(hand(s, 'C')[0]).toBe('K♥');
    expect(current(s)).toBe('B');
  });

  it('Q: swap is optional', () => {
    const s = setup();
    drawAndDiscard(s, 'A', 'QH');
    act(s, 'A', { type: 'peek', target: ref('C', 3) });
    act(s, 'A', { type: 'skipPower' });
    expect(current(s)).toBe('B');
  });

  it('K: peek own, peek opponent, then swap any two (including two of your own)', () => {
    const s = setup();
    setHand(s, 'A', ['10H', 'AS', '2S', '3S']);
    setHand(s, 'B', ['JK', '5S', '6S', '7S']);
    drawAndDiscard(s, 'A', 'KD');
    expect(() => act(s, 'A', { type: 'peek', target: ref('B', 0) })).toThrow(/YOUR/);
    act(s, 'A', { type: 'peek', target: ref('A', 0) });
    expect(() => act(s, 'A', { type: 'swap', a: ref('A', 0), b: ref('B', 0) })).toThrow(/not a swap/);
    act(s, 'A', { type: 'peek', target: ref('B', 0) });
    const v = toPlayerView(s, 'A');
    expect(v.stage).toMatchObject({ step: 'swapAny', stepIndex: 2, stepCount: 3 });
    expect(v.players[0].hand[0]!.face?.rank).toBe('10');
    expect(v.players[1].hand[0]!.face?.rank).toBe('JOKER');
    // Others see that a King is in progress and which slots were peeked, never the faces.
    const bv = toPlayerView(s, 'B');
    expect(bv.stage).toMatchObject({ kind: 'power', power: 'king' });
    if (bv.stage.kind === 'power') expect(bv.stage.peeked.every((p) => p.face === undefined)).toBe(true);
    act(s, 'A', { type: 'swap', a: ref('A', 0), b: ref('B', 0) });
    expect(hand(s, 'A')[0]).toBe('Joker');
    expect(hand(s, 'B')[0]).toBe('10♥');
  });

  it('powers can be skipped part-way', () => {
    const s = setup();
    drawAndDiscard(s, 'A', 'KS');
    act(s, 'A', { type: 'peek', target: ref('A', 1) });
    act(s, 'A', { type: 'skipPower' });
    expect(current(s)).toBe('B');
  });

  it('powers work with 6-card hands', () => {
    const s = setup(6);
    drawAndDiscard(s, 'A', '7C');
    act(s, 'A', { type: 'peek', target: ref('A', 5) });
    act(s, 'A', { type: 'endPeek' });
    s.drawPile.push(c('JD'));
    act(s, 'B', { type: 'drawDeck' });
    act(s, 'B', { type: 'discardDrawn' });
    expect(() => act(s, 'B', { type: 'swap', a: ref('B', 6), b: ref('A', 0) })).toThrow(/Invalid card slot/);
    act(s, 'B', { type: 'swap', a: ref('B', 5), b: ref('A', 5) });
    expect(current(s)).toBe('C');
  });
});

describe('match / snap', () => {
  /** Put `code` on top of the draw pile and have `id` draw it. */
  const draw = (s: GameState, id: string, code: string) => {
    s.drawPile.push(c(code));
    act(s, id, { type: 'drawDeck' });
  };

  it('success: both cards go to the discard pile and the hand shrinks by one (gap keeps positions)', () => {
    const s = setup();
    setHand(s, 'A', ['4H', '7S', '9S', '2S']);
    draw(s, 'A', '4C');
    act(s, 'A', { type: 'matchDrawn', slot: 0 });
    expect(hand(s, 'A')).toEqual(['_', '7♠', '9♠', '2♠']);
    expect(s.discardPile.slice(-2).map(cardLabel)).toEqual(['4♣', '4♥']); // hand card lands on top
    expect(current(s)).toBe('B');
    const v = toPlayerView(s, 'B');
    expect(v.players[0].hand[0]).toBeNull(); // gap is sent as null
    expect(v.lastMatch).toMatchObject({ kind: 'match', playerId: 'A', slot: 0, faces: [{ rank: '4', suit: 'C' }, { rank: '4', suit: 'H' }] });
    expect(v.discardStack.map(cardLabel).slice(-2)).toEqual(['4♣', '4♥']);
  });

  it('matches by rank only: any suit/colour, and Joker with Joker', () => {
    for (const [mine, drawn] of [['QH', 'QS'], ['JK', 'JK'], ['10D', '10C'], ['AS', 'AH']]) {
      const s = setup();
      setHand(s, 'A', ['5S', mine, '6S', '8S']);
      draw(s, 'A', drawn);
      act(s, 'A', { type: 'matchDrawn', slot: 1 });
      expect(hand(s, 'A')).toEqual(['5♠', '_', '6♠', '8♠']);
    }
  });

  it('a matched power card does not trigger its power', () => {
    const s = setup();
    setHand(s, 'A', ['7H', '2S', '3S', '5S']);
    draw(s, 'A', '7C');
    act(s, 'A', { type: 'matchDrawn', slot: 0 });
    expect(s.stage.kind).toBe('draw');
    expect(current(s)).toBe('B');
  });

  it('gaps at the end of a hand are trimmed', () => {
    const s = setup();
    setHand(s, 'A', ['2S', '3S', '5S', '9H']);
    draw(s, 'A', '9C');
    act(s, 'A', { type: 'matchDrawn', slot: 3 });
    expect(hand(s, 'A')).toEqual(['2♠', '3♠', '5♠']);
  });

  it('miss: the revealed card goes back (now seen by all), the drawn card is discarded, +1 face-down penalty card', () => {
    const s = setup();
    setHand(s, 'A', ['7D', '2S', '3S', '5S']);
    s.drawPile.push(c('KH')); // will be the penalty card
    draw(s, 'A', '4C');
    act(s, 'A', { type: 'matchDrawn', slot: 0 });
    expect(hand(s, 'A')).toEqual(['7♦', '2♠', '3♠', '5♠', 'K♥']);
    expect(player(s, 'A').hand[0]!.knownBy.sort()).toEqual(['A', 'B', 'C']);
    expect(player(s, 'A').hand[4]!.knownBy).toEqual([]); // nobody has seen the penalty card
    expect(cardLabel(s.discardPile.at(-1)!)).toBe('4♣');
    expect(s.stage.kind).toBe('draw'); // no power for the drawn card
    expect(current(s)).toBe('B');
    expect(toPlayerView(s, 'A').players[0].hand).toHaveLength(5);
  });

  it('a penalty card fills the first gap', () => {
    const s = setup();
    player(s, 'A').hand = [c('5S'), null, c('6S'), c('8S')];
    s.drawPile.push(c('QD'));
    draw(s, 'A', '9C');
    act(s, 'A', { type: 'matchDrawn', slot: 0 });
    expect(hand(s, 'A')).toEqual(['5♠', 'Q♦', '6♠', '8♠']);
  });

  it('gaps can never be targeted', () => {
    const s = setup();
    player(s, 'A').hand = [null, c('2S'), c('3S')];
    draw(s, 'A', '9C');
    expect(() => act(s, 'A', { type: 'swapDrawn', slot: 0 })).toThrow(/no card there/);
    expect(() => act(s, 'A', { type: 'matchDrawn', slot: 0 })).toThrow(/no card there/);
    expect(() => act(s, 'A', { type: 'matchDrawn', slot: 7 })).toThrow(/Invalid card slot/);
    act(s, 'A', { type: 'discardDrawn' });
    player(s, 'C').hand = [c('2S'), null];
    drawAndDiscard(s, 'B', '8H');
    expect(() => act(s, 'B', { type: 'peek', target: ref('C', 1) })).toThrow(/no card there/);
  });

  it('powers skip steps that are impossible with an empty hand', () => {
    const s = setup();
    player(s, 'A').hand = [];
    drawAndDiscard(s, 'A', '7S'); // peek own: nothing to peek → turn just ends
    expect(current(s)).toBe('B');
    player(s, 'B').hand = [];
    drawAndDiscard(s, 'B', 'KS'); // King: skips "peek own", starts at "peek opponent"
    expect(toPlayerView(s, 'B').stage).toMatchObject({ kind: 'power', step: 'peekOpp', stepIndex: 1 });
  });

  it('fewer cards wins a points tie at scoring time', () => {
    const P = (id: string, hand: (string | null)[]) => ({ id, name: id, totalScore: 0, hand: hand.map((x) => (x ? c(x) : null)) });
    const r = scoreRound([P('A', ['KS', null, 'QC']), P('B', ['JS', 'KC', 'QS', 'JC'])], 'A', 1, { aceValue: 1 });
    expect(r.callerSucceeded).toBe(true); // 0 points in 2 cards beats 0 points in 4 cards
    expect(r.rows[0].cards).toHaveLength(2);
  });
});

describe('snap onto the discard pile (any time, any player)', () => {
  const top = (s: GameState) => {
    const t = s.discardPile.at(-1)!;
    return { rank: t.rank, suit: t.suit };
  };
  /** `id` snaps the card at `owner`'s `slot` (owner defaults to themselves). */
  const snap = (s: GameState, id: string, slot: number, owner = id) =>
    act(s, id, { type: 'snapDiscard', target: ref(owner, slot), expect: top(s) });

  it('any player can snap out of turn; the turn does not change', () => {
    const s = setup(); // A to move
    s.discardPile = [c('9H')];
    setHand(s, 'C', ['2S', '5S', '9S', '3S']);
    snap(s, 'C', 2);
    expect(hand(s, 'C')).toEqual(['2♠', '5♠', '_', '3♠']);
    expect(s.discardPile.map(cardLabel)).toEqual(['9♥', '9♠']);
    expect(current(s)).toBe('A');
    expect(s.stage.kind).toBe('draw');
    expect(s.lastMatch).toMatchObject({ kind: 'snap', playerId: 'C', slot: 2 });
  });

  it('snaps stack: the next player can snap the same rank on top', () => {
    const s = setup();
    s.discardPile = [c('QH')];
    setHand(s, 'B', ['QS', '2S', '3S', '4S']);
    setHand(s, 'C', ['2S', '3S', '4S', 'QD']);
    snap(s, 'B', 0);
    snap(s, 'C', 3);
    expect(s.discardPile.map(cardLabel)).toEqual(['Q♥', 'Q♠', 'Q♦']);
    expect(hand(s, 'C')).toEqual(['2♠', '3♠', '4♠']); // trailing gap trimmed
  });

  it('the current player can snap too, even while holding a drawn card', () => {
    const s = setup();
    s.discardPile = [c('5D')];
    setHand(s, 'A', ['5C', '2S', '3S', '4S']);
    s.drawPile.push(c('KH'));
    act(s, 'A', { type: 'drawDeck' });
    snap(s, 'A', 0);
    expect(s.stage.kind).toBe('decideDrawn'); // still their turn, still holding the K♥
    act(s, 'A', { type: 'discardDrawn' });
    expect(s.stage).toMatchObject({ kind: 'power', power: 'king' });
  });

  it('miss: the card is revealed and stays, +1 penalty card, turn unchanged', () => {
    const s = setup();
    s.discardPile = [c('9H')];
    setHand(s, 'B', ['4S', '2S', '3S', '5S']);
    s.drawPile.push(c('JK'));
    snap(s, 'B', 0);
    expect(hand(s, 'B')).toEqual(['4♠', '2♠', '3♠', '5♠', 'Joker']);
    expect(player(s, 'B').hand[0]!.knownBy.sort()).toEqual(['A', 'B', 'C']);
    expect(s.discardPile.map(cardLabel)).toEqual(['9♥']);
    expect(current(s)).toBe('A');
  });

  it('is rejected WITHOUT penalty if the pile changed, is empty, mid-power, or outside play', () => {
    const s = setup();
    s.discardPile = [c('9H')];
    setHand(s, 'B', ['9S', '2S', '3S', '4S']);
    expect(() => act(s, 'B', { type: 'snapDiscard', target: ref('B', 0), expect: { rank: '7', suit: 'C' } })).toThrow(/changed/);
    expect(hand(s, 'B')).toHaveLength(4);
    s.discardPile = [];
    expect(() => act(s, 'B', { type: 'snapDiscard', target: ref('B', 0), expect: { rank: '9', suit: 'H' } })).toThrow(/empty/);
    drawAndDiscard(s, 'A', '8C'); // A is now using the 8's power
    expect(() => snap(s, 'B', 0)).toThrow(/power/);
    const lobby = createGame('L', { id: 'A', name: 'Alice' });
    expect(() => act(lobby, 'A', { type: 'snapDiscard', target: ref('A', 0), expect: { rank: '9', suit: 'H' } })).toThrow(/during play/);
  });

  describe("out-slam: an OPPONENT's card", () => {
    it('correct: their card goes on the pile and they get an unseen face-down replacement in the same spot', () => {
      const s = setup(); // A to move
      s.discardPile = [c('7C')];
      setHand(s, 'B', ['2S', '7H', '3S', '4S']);
      setHand(s, 'C', ['5S', '6S', '8S', '9S']);
      s.drawPile.push(c('KD')); // the replacement
      snap(s, 'C', 1, 'B'); // Cara slams Bob's 7♥
      expect(s.discardPile.map(cardLabel)).toEqual(['7♣', '7♥']);
      expect(hand(s, 'B')).toEqual(['2♠', 'K♦', '3♠', '4♠']); // same size, replacement in the same spot
      expect(hand(s, 'C')).toEqual(['5♠', '6♠', '8♠', '9♠']); // the slammer's hand is untouched
      expect(player(s, 'B').hand[1]!.knownBy).toEqual([]); // nobody has seen the replacement
      for (const viewer of ['A', 'B', 'C']) expect(toPlayerView(s, viewer).players[1].hand[1]!.face).toBeUndefined();
      expect(s.lastMatch).toMatchObject({ kind: 'slam', playerId: 'B', byPlayerId: 'C', slot: 1 });
      expect(current(s)).toBe('A');
      expect(s.log.at(-1)!.text).toMatch(/Cara correctly matched Bob's card #2/);
    });

    it("wrong: the opponent's card is flipped back in place and the GUESSER gets the penalty card", () => {
      const s = setup();
      s.discardPile = [c('7C')];
      setHand(s, 'B', ['2S', 'QH', '3S', '4S']);
      setHand(s, 'C', ['5S', '6S', '8S', '9S']);
      s.drawPile.push(c('JK'));
      snap(s, 'C', 1, 'B');
      expect(hand(s, 'B')).toEqual(['2♠', 'Q♥', '3♠', '4♠']); // unchanged…
      expect(player(s, 'B').hand[1]!.knownBy.sort()).toEqual(['A', 'B', 'C']); // …but everyone saw it
      expect(hand(s, 'C')).toEqual(['5♠', '6♠', '8♠', '9♠', 'Joker']); // penalty for the guesser
      expect(s.discardPile.map(cardLabel)).toEqual(['7♣']);
      expect(s.log.at(-1)!.text).toMatch(/Cara incorrectly guessed Bob's card #2 .* received a penalty card/);
    });

    it('works out of turn and also against the current player', () => {
      const s = setup(); // A to move
      s.discardPile = [c('AD')];
      setHand(s, 'A', ['AS', '2S', '3S', '4S']);
      snap(s, 'B', 0, 'A');
      expect(cardLabel(s.discardPile.at(-1)!)).toBe('A♠');
      expect(player(s, 'A').hand).toHaveLength(4);
      expect(current(s)).toBe('A');
    });

    it('cannot target a gap', () => {
      const s = setup();
      s.discardPile = [c('7C')];
      player(s, 'B').hand = [null, c('7H')];
      expect(() => snap(s, 'C', 0, 'B')).toThrow(/no card there/);
    });
  });
});

describe('swap & match combo (replace & multi-slam)', () => {
  /** A draws `code` and swaps it into `slot`. */
  const drawSwap = (s: GameState, code: string, slot: number) => {
    s.drawPile.push(c(code));
    act(s, 'A', { type: 'drawDeck' });
    act(s, 'A', { type: 'swapDrawn', slot });
  };

  it('the walkthrough: [4, K♠, A, J♣] → draw an Ace, swap out the 4 → throw both Aces away → [K♠, J♣] = 0', () => {
    const s = setup();
    setHand(s, 'A', ['4H', 'KS', 'AD', 'JC']);
    drawSwap(s, 'AC', 0);
    // Hand updated instantly, turn still running.
    expect(hand(s, 'A')).toEqual(['A♣', 'K♠', 'A♦', 'J♣']);
    expect(cardLabel(s.discardPile.at(-1)!)).toBe('4♥');
    expect(current(s)).toBe('A');
    act(s, 'A', { type: 'comboMatch', slots: [0, 2] });
    expect(hand(s, 'A')).toEqual(['_', 'K♠', '_', 'J♣']);
    expect(s.discardPile.slice(-3).map(cardLabel)).toEqual(['4♥', 'A♣', 'A♦']);
    expect(s.lastMatch).toMatchObject({ kind: 'combo', playerId: 'A', slots: [0, 2] });
    const r = scoreRound(s.players, null, 1, s.settings);
    expect(r.rows[0]).toMatchObject({ handTotal: 0 });
    expect(r.rows[0].cards).toHaveLength(2);
    // Still A's combo step until they end the turn.
    expect(s.stage.kind).toBe('combo');
    act(s, 'A', { type: 'finishTurn' });
    expect(current(s)).toBe('B');
  });

  it('three of a kind at once', () => {
    const s = setup();
    setHand(s, 'A', ['7H', '7S', '2S', '9C']);
    drawSwap(s, '7D', 3);
    act(s, 'A', { type: 'comboMatch', slots: [0, 1, 3] });
    expect(hand(s, 'A')).toEqual(['_', '_', '2♠']);
  });

  it('one or more cards can also go onto the matching top discard', () => {
    const s = setup();
    setHand(s, 'A', ['4H', '9S', '4C', '2S']);
    drawSwap(s, 'KS', 0); // throws away the 4♥ → top discard is a 4
    act(s, 'A', { type: 'comboMatch', slots: [2] }); // the other 4 goes onto it
    expect(hand(s, 'A')).toEqual(['K♠', '9♠', '_', '2♠']);
    expect(s.discardPile.slice(-2).map(cardLabel)).toEqual(['4♥', '4♣']);
  });

  it('several combos in one step, then the turn ends', () => {
    const s = setup();
    setHand(s, 'A', ['5H', '5S', '8S', '8C']);
    drawSwap(s, '3D', 1); // throws away 5♠ (top = 5)
    act(s, 'A', { type: 'comboMatch', slots: [0] }); // 5♥ onto the 5♠
    act(s, 'A', { type: 'comboMatch', slots: [2, 3] }); // pair of 8s
    expect(hand(s, 'A')).toEqual(['_', '3♦']);
    act(s, 'A', { type: 'finishTurn' });
    expect(current(s)).toBe('B');
  });

  it('wrong combo: cards revealed and kept, +1 penalty card, turn ends', () => {
    const s = setup();
    setHand(s, 'A', ['4H', 'KS', '9D', 'JC']);
    s.drawPile.push(c('QD')); // penalty card
    drawSwap(s, 'AC', 0);
    act(s, 'A', { type: 'comboMatch', slots: [0, 2] }); // A♣ + 9♦ – not the same rank
    expect(hand(s, 'A')).toEqual(['A♣', 'K♠', '9♦', 'J♣', 'Q♦']);
    expect(player(s, 'A').hand[2]!.knownBy.sort()).toEqual(['A', 'B', 'C']);
    expect(current(s)).toBe('B');
  });

  it('a single card that does not match the top discard fails', () => {
    const s = setup();
    setHand(s, 'A', ['4H', '9S', '2C', '2S']);
    drawSwap(s, 'KS', 0); // top = 4♥
    act(s, 'A', { type: 'comboMatch', slots: [2] }); // a 2 is not a 4
    expect(player(s, 'A').hand).toHaveLength(5);
    expect(current(s)).toBe('B');
  });

  it('combos only exist right after a swap', () => {
    const s = setup();
    expect(() => act(s, 'A', { type: 'comboMatch', slots: [0, 1] })).toThrow(/right after swapping/);
    expect(() => act(s, 'A', { type: 'finishTurn' })).toThrow(/Nothing to finish/);
    drawAndDiscard(s, 'A', '9H');
    expect(() => act(s, 'B', { type: 'comboMatch', slots: [0, 1] })).toThrow(/right after swapping/);
  });

  it('other players can still snap during the combo step', () => {
    const s = setup();
    setHand(s, 'A', ['4H', '9S', '3C', '2S']);
    setHand(s, 'B', ['4S', '6S', '7S', '8S']);
    drawSwap(s, 'KS', 0); // top = 4♥
    act(s, 'B', { type: 'snapDiscard', target: ref('B', 0), expect: { rank: '4', suit: 'H' } });
    expect(cardLabel(s.discardPile.at(-1)!)).toBe('4♠');
    expect(s.stage.kind).toBe('combo');
  });
});

describe('card movement events (for animations)', () => {
  const kinds = (s: GameState, since: number) => s.motions.filter((m) => m.seq > since).map((m) => m.kind);
  const last = (s: GameState) => s.motionSeq;

  it('draw → swap: draw, then the old card flies to the pile while the drawn card goes into the spot', () => {
    const s = setup();
    setHand(s, 'A', ['4H', '2S', '3S', '5S']);
    const t = last(s);
    s.drawPile.push(c('9C'));
    act(s, 'A', { type: 'drawDeck' });
    act(s, 'A', { type: 'swapDrawn', slot: 0 });
    expect(kinds(s, t)).toEqual(['draw', 'toPile', 'toHand']);
    expect(s.motions.at(-2)).toMatchObject({ kind: 'toPile', from: { playerId: 'A', slot: 0 }, face: { rank: '4', suit: 'H' }, pileIndex: s.discardPile.length });
    expect(s.motions.at(-1)).toEqual({ seq: s.motionSeq, kind: 'toHand', from: 'drawn', to: { playerId: 'A', slot: 0 } }); // no face!
  });

  it('discarding the drawn card flies it from the drawn spot to the pile', () => {
    const s = setup();
    const t = last(s);
    drawAndDiscard(s, 'A', '9H');
    expect(kinds(s, t)).toEqual(['draw', 'toPile']);
    expect(s.motions.at(-1)).toMatchObject({ from: 'drawn', face: { rank: '9', suit: 'H' } });
  });

  it('power swaps cross-slide both cards', () => {
    const s = setup();
    drawAndDiscard(s, 'A', 'JS');
    act(s, 'A', { type: 'swap', a: ref('A', 0), b: ref('C', 2) });
    expect(s.motions.at(-1)).toMatchObject({ kind: 'swap', a: { playerId: 'A', slot: 0 }, b: { playerId: 'C', slot: 2 } });
  });

  it('penalty and slam-replacement cards fly in face-down from the draw pile', () => {
    const s = setup();
    s.discardPile = [c('7C')];
    setHand(s, 'B', ['2S', '7H', '3S', '4S']);
    act(s, 'C', { type: 'snapDiscard', target: ref('B', 1), expect: { rank: '7', suit: 'C' } });
    expect(s.motions.at(-1)).toMatchObject({ kind: 'toHand', from: 'deck', to: { playerId: 'B', slot: 1 }, delayMs: 650 });
    s.discardPile = [c('9C')];
    act(s, 'C', { type: 'snapDiscard', target: ref('B', 0), expect: { rank: '9', suit: 'C' } }); // wrong → C's penalty
    expect(s.motions.at(-1)).toMatchObject({ kind: 'toHand', from: 'deck', to: { playerId: 'C', slot: 4 } });
    expect(s.motions.every((m) => m.kind !== 'toHand' || !('face' in m))).toBe(true);
  });

  it('views carry the events; a new round clears them but keeps counting', () => {
    const s = setup();
    drawAndDiscard(s, 'A', '9H');
    expect(toPlayerView(s, 'B').motions.length).toBeGreaterThan(0);
    const seq = s.motionSeq;
    act(s, 'B', { type: 'callKobu' });
    drawAndDiscard(s, 'C', '4S');
    drawAndDiscard(s, 'A', '4S');
    act(s, 'A', { type: 'nextRound' });
    expect(s.motions).toEqual([]);
    expect(s.motionSeq).toBeGreaterThan(seq);
  });
});

describe('rearranging your own cards (bluffing)', () => {
  it('swaps two of your spots, face-down, any time during play – even on someone else\'s turn', () => {
    const s = setup(); // A to move
    setHand(s, 'B', ['2S', '9H', '3S', '4S']);
    act(s, 'B', { type: 'reorder', from: 1, to: 3 });
    expect(hand(s, 'B')).toEqual(['2♠', '4♠', '3♠', '9♥']);
    expect(s.motions.at(-1)).toMatchObject({ kind: 'swap', a: { playerId: 'B', slot: 1 }, b: { playerId: 'B', slot: 3 }, by: 'B' });
    expect(current(s)).toBe('A');
  });

  it('other players (and bots) lose track of the moved cards; the owner keeps what they knew', () => {
    const s = setup();
    player(s, 'B').hand = [c('2S'), c('9H'), c('3S'), c('4S')];
    player(s, 'B').hand[1]!.knownBy = ['A', 'B', 'C']; // everyone had seen the 9♥
    player(s, 'B').hand[3]!.knownBy = ['A']; // only Alice had spied the 4♠
    act(s, 'B', { type: 'reorder', from: 1, to: 3 });
    expect(player(s, 'B').hand[3]!.knownBy).toEqual(['B']); // the 9♥: Bob still knows it
    expect(player(s, 'B').hand[1]!.knownBy).toEqual([]); // the 4♠: Alice lost track
    expect(toPlayerView(s, 'A').players[1].hand[1]!.knownByMe).toBe(false);
  });

  it('can move a card into a gap, and logs one line per burst of rearranging', () => {
    const s = setup();
    player(s, 'B').hand = [c('2S'), null, c('3S'), c('4S')];
    const before = s.log.length;
    act(s, 'B', { type: 'reorder', from: 0, to: 1 });
    act(s, 'B', { type: 'reorder', from: 3, to: 0 });
    expect(hand(s, 'B')).toEqual(['4♠', '2♠', '3♠']); // trailing gap trimmed
    expect(s.log.length - before).toBe(1);
    expect(s.log.at(-1)!.msg).toEqual({ key: 'log.reorder', params: { name: 'Bob' } });
  });

  it('is rejected outside play, for gaps as the source, and for bad slots', () => {
    const s = createGame('X', { id: 'A', name: 'Alice' });
    addPlayer(s, 'B', 'Bob');
    startAndDeal(s); // peeking phase
    expect(() => act(s, 'A', { type: 'reorder', from: 0, to: 1 })).toThrow(/during play/);
    const p = setup();
    player(p, 'B').hand = [null, c('3S')];
    expect(() => act(p, 'B', { type: 'reorder', from: 0, to: 1 })).toThrow(/no card there/);
    expect(() => act(p, 'B', { type: 'reorder', from: 1, to: 5 })).toThrow(/Invalid card slot/);
    expect(() => act(p, 'B', { type: 'reorder', from: 1, to: 1 })).toThrow(/Invalid card slot/);
  });

  it('a peeked card stays visible to the peeker when its owner moves it – and nothing else becomes visible', () => {
    const s = setup();
    setHand(s, 'B', ['2S', '9H', '3S', '4S']);
    drawAndDiscard(s, 'A', 'QH'); // Alice: Queen
    act(s, 'A', { type: 'peek', target: ref('B', 1) }); // sees the 9♥
    act(s, 'B', { type: 'reorder', from: 1, to: 2 }); // Bob moves it while Alice decides
    const v = toPlayerView(s, 'A');
    expect(v.players[1].hand[2]!.face).toEqual({ rank: '9', suit: 'H' });
    expect(v.players[1].hand[1]!.face).toBeUndefined();
    if (v.stage.kind === 'power') expect(v.stage.peeked[0].ref).toEqual({ playerId: 'B', slot: 2 });
  });
});

describe('Kobu & scoring', () => {
  const P = (id: string, codes: string[], totalScore = 0) => ({ id, name: id, totalScore, hand: codes.map(c) });
  const rules = { aceValue: 1 as const };
  const scores = (r: ReturnType<typeof scoreRound>) => r.rows.map((x) => x.roundScore);

  it('everyone else gets exactly one final turn after Kobu', () => {
    const s = setup();
    act(s, 'A', { type: 'callKobu' });
    expect(() => act(s, 'B', { type: 'callKobu' })).toThrow(/already/);
    drawAndDiscard(s, 'B', '4S');
    expect(s.phase).toBe('playing');
    drawAndDiscard(s, 'C', '4S');
    expect(s.phase).toBe('roundOver');
    expect(toPlayerView(s, 'B').players[0].hand.every((x) => x?.face)).toBe(true);
  });

  it('successful caller scores their actual hand (can be negative), no penalty', () => {
    const r = scoreRound([P('A', ['JK', 'JK', 'KS', 'QC']), P('B', ['2S', '2S', '2S', '2S']), P('C', ['9S', '9S', '9S', '9S'])], 'A', 1, rules);
    expect(r.callerSucceeded).toBe(true);
    expect(scores(r)).toEqual([-2, 8, 36]);
    expect(r.rows[0]).toMatchObject({ lowest: true, penalty: false });
  });

  it('successful caller with a positive hand also just scores the hand', () => {
    const r = scoreRound([P('A', ['AS', '2S', 'JS', 'QS']), P('B', ['5S', '5S', '5S', '5S'])], 'A', 1, rules);
    expect(scores(r)).toEqual([3, 20]);
  });

  it('red faces count 13, black faces 0, Jokers -1 in the total', () => {
    const r = scoreRound([P('A', ['KH', 'QD', 'JS', 'JK']), P('B', ['AS', 'AS', 'AS', 'AS'])], null, 1, rules);
    expect(r.rows.map((x) => x.handTotal)).toEqual([25, 4]);
  });

  it('caller tied with an equal-card-count player → caller penalised, other is lowest', () => {
    const r = scoreRound([P('A', ['AS', 'AS', 'AS', 'AS']), P('B', ['2S', '2S', 'KS', 'QC']), P('C', ['9S', '9S', '9S', '9S'])], 'A', 1, rules);
    expect(r.callerSucceeded).toBe(false);
    expect(scores(r)).toEqual([14, 0, 36]);
    expect(r.rows.map((x) => [x.penalty, x.lowest])).toEqual([[true, false], [false, true], [false, false]]);
  });

  it('tie-breaker: fewer cards wins the tie', () => {
    // Caller has 0 points in 2 cards; B has 0 points in 4 cards → caller wins.
    const won = scoreRound([P('A', ['KS', 'QC']), P('B', ['JS', 'KC', 'QS', 'JC'])], 'A', 1, rules);
    expect(won.callerSucceeded).toBe(true);
    // Same points, B has FEWER cards → caller loses.
    const lost = scoreRound([P('A', ['KS', 'QC', 'JS', 'JC']), P('B', ['KC', 'QS'])], 'A', 1, rules);
    expect(lost.callerSucceeded).toBe(false);
    expect(scores(lost)).toEqual([10, 0]);
  });

  it('failed caller: lowest player keeps a negative hand instead of 0', () => {
    const r = scoreRound([P('A', ['AS', 'AS', 'AS', 'AS']), P('B', ['JK', 'JK', 'KS', 'AS'])], 'A', 1, rules);
    expect(scores(r)).toEqual([14, -1]);
  });

  it('Ace-as-0 setting changes the hand total', () => {
    const r = scoreRound([P('A', ['AS', 'AH', 'AD', 'AC'])], null, 1, { aceValue: 0 });
    expect(r.rows[0].handTotal).toBe(0);
  });

  it('accumulates totals and ends the game at the target score', () => {
    const s = setup();
    s.settings.targetScore = 20;
    setHand(s, 'A', ['KH', 'QH', 'JH', 'KD']);
    setHand(s, 'B', ['JK', 'JK', 'KS', 'QS']);
    setHand(s, 'C', ['AS', 'AS', 'AS', 'AS']);
    act(s, 'A', { type: 'callKobu' });
    drawAndDiscard(s, 'B', '4S');
    drawAndDiscard(s, 'C', '4S');
    expect(s.phase).toBe('gameOver');
    expect(s.players.map((p) => p.totalScore)).toEqual([62, -2, 4]);
    expect(s.winnerIds).toEqual(['B']);
  });

  it('next round rotates the starting player and keeps the hand size', () => {
    const s = setup(6);
    act(s, 'A', { type: 'callKobu' });
    drawAndDiscard(s, 'B', '4S');
    drawAndDiscard(s, 'C', '4S');
    act(s, 'A', { type: 'nextRound' });
    expect(s.round).toBe(2);
    expect(current(s)).toBe('B');
    expect(s.players.every((p) => p.hand.length === 6)).toBe(true);
  });

  it('a GameError is thrown for unknown players', () => {
    const s = setup();
    expect(() => act(s, 'Z', { type: 'drawDeck' })).toThrow(GameError);
  });
});
