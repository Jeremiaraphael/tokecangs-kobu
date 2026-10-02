import { describe, expect, it } from 'vitest';
import { decideBotAction, decideBotSnap, nextBotMove, unknownCardValue } from '../shared/ai';
import { applyAction, createGame, type Rng } from '../shared/engine';
import { MAX_PLAYERS, type Card, type GameState, type Rank, type Suit } from '../shared/types';

function seeded(seed = 1): Rng {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 2 ** 32;
    return seed / 2 ** 32;
  };
}

let uid = 0;
/** '7S', '10H', 'QD', 'JK' (Joker) … `knownBy` lists who has seen it. */
function c(code: string, knownBy: string[] = []): Card {
  const base = code === 'JK' ? { rank: 'JOKER' as Rank, suit: null } : { rank: code.slice(0, -1) as Rank, suit: code.slice(-1) as Suit };
  return { ...base, id: `t${uid++}`, knownBy };
}

/** Human host 'H' plus `bots` AI players, in the lobby. */
function aiLobby(bots = 2, handSize: 4 | 6 = 4, rng = seeded()) {
  const s = createGame('AI', { id: 'H', name: 'Human' }, { handSize }, 'ai');
  for (let i = 0; i < bots; i++) applyAction(s, 'H', { type: 'addBot' }, rng);
  return s;
}

/** Apply bot moves until no bot has anything to do. */
function runBots(s: GameState, rng: Rng, limit = 200) {
  for (let i = 0; i < limit; i++) {
    const m = nextBotMove(s, rng);
    if (!m) return;
    applyAction(s, m.botId, m.action, rng);
  }
}

/** A game in the playing phase where it's `botIndex`'s turn. Hands can then be rigged. */
function playing(bots = 2, handSize: 4 | 6 = 4) {
  const rng = seeded(3);
  const s = aiLobby(bots, handSize, rng);
  applyAction(s, 'H', { type: 'startGame' }, rng);
  applyAction(s, 'H', { type: 'pickStarter', index: 0 }, rng);
  runBots(s, rng);
  applyAction(s, 'H', { type: 'dealCards' }, rng);
  applyAction(s, 'H', { type: 'initialPeek', slot: 0 }, rng);
  applyAction(s, 'H', { type: 'ready' }, rng);
  runBots(s, rng);
  expect(s.phase).toBe('playing');
  return s;
}

const bot = (s: GameState, i = 1) => s.players[i];
const turnTo = (s: GameState, i: number) => {
  s.currentPlayerIndex = i;
  s.stage = { kind: 'draw' };
};
const decide = (s: GameState, i = 1, rng = seeded(9)) => decideBotAction(s, bot(s, i).id, rng);
/** Give player i a hand; `known` true = the bot (player 1) has seen those cards. */
const hand = (s: GameState, i: number, codes: string[], knownByBot = true) => {
  s.players[i].hand = codes.map((x) => c(x, knownByBot ? [bot(s).id] : []));
};

describe('AI rooms', () => {
  it('host adds and removes AI players, up to 6 seats, with unique names', () => {
    const s = aiLobby(0);
    for (let i = 1; i < MAX_PLAYERS; i++) applyAction(s, 'H', { type: 'addBot' }, seeded(i));
    expect(s.players).toHaveLength(MAX_PLAYERS);
    expect(new Set(s.players.map((p) => p.name)).size).toBe(MAX_PLAYERS);
    expect(s.players.slice(1).every((p) => p.isBot)).toBe(true);
    expect(() => applyAction(s, 'H', { type: 'addBot' }, seeded())).toThrow(/full/);
    applyAction(s, 'H', { type: 'removeBot', playerId: s.players[2].id });
    expect(s.players).toHaveLength(MAX_PLAYERS - 1);
    expect(() => applyAction(s, 'H', { type: 'removeBot', playerId: 'H' })).toThrow(/not an AI/);
  });

  it('only the host, only in AI rooms, only in the lobby', () => {
    const s = aiLobby(1);
    expect(() => applyAction(s, s.players[1].id, { type: 'addBot' })).toThrow(/host/);
    const mp = createGame('MP', { id: 'H', name: 'Human' });
    expect(() => applyAction(mp, 'H', { type: 'addBot' })).toThrow(/Play with AI/);
    applyAction(s, 'H', { type: 'startGame' });
    expect(() => applyAction(s, 'H', { type: 'addBot' })).toThrow(/before the game/);
  });

  it('bots take a starter card and do their initial peek on their own', () => {
    const rng = seeded(5);
    const s = aiLobby(3, 6, rng);
    applyAction(s, 'H', { type: 'startGame' }, rng);
    runBots(s, rng);
    expect(Object.keys(s.starterDraw!.picks).sort()).toEqual(s.players.slice(1).map((p) => p.id).sort());
    applyAction(s, 'H', { type: 'pickStarter', index: s.starterDraw!.offered.findIndex((_, i) => !Object.values(s.starterDraw!.picks).includes(i)) }, rng);
    applyAction(s, 'H', { type: 'dealCards' }, rng);
    runBots(s, rng);
    expect(s.players.slice(1).every((p) => p.ready && p.initialPeeks.length === 1)).toBe(true);
    expect(s.phase).toBe('peeking'); // still waiting for the human
  });
});

describe('AI decisions', () => {
  it('keeps a drawn Joker, replacing its highest known card', () => {
    const s = playing();
    hand(s, 1, ['3S', 'KH', '2S', '4S']); // K♥ = 13
    turnTo(s, 1);
    s.stage = { kind: 'decideDrawn', card: c('JK', [bot(s).id]) };
    expect(decide(s)).toEqual({ type: 'swapDrawn', slot: 1 });
  });

  it('keeps a black face card (0 points)', () => {
    const s = playing();
    hand(s, 1, ['3S', '2S', '9C', '4S']);
    turnTo(s, 1);
    s.stage = { kind: 'decideDrawn', card: c('QS', [bot(s).id]) };
    expect(decide(s)).toEqual({ type: 'swapDrawn', slot: 2 });
  });

  it('swaps a clearly lower card in, otherwise discards (using the power)', () => {
    const s = playing();
    hand(s, 1, ['AS', '9H', '2S', '3S']);
    turnTo(s, 1);
    s.stage = { kind: 'decideDrawn', card: c('4D', [bot(s).id]) }; // no 4 in hand → no match
    expect(decide(s)).toEqual({ type: 'swapDrawn', slot: 1 });
    s.stage = { kind: 'decideDrawn', card: c('KD', [bot(s).id]) }; // red K = 13: use its power instead
    expect(decide(s)).toEqual({ type: 'discardDrawn' });
    hand(s, 1, ['AS', 'AH', '2S', '3S']);
    s.stage = { kind: 'decideDrawn', card: c('8D', [bot(s).id]) };
    expect(decide(s)).toEqual({ type: 'discardDrawn' });
  });

  it('never takes from the discard pile, even a great card: it draws instead', () => {
    const s = playing();
    hand(s, 1, ['10S', '2S', '3S', '4S']);
    turnTo(s, 1);
    s.discardPile.push(c('JK', s.players.map((p) => p.id)));
    expect(decide(s)).toEqual({ type: 'drawDeck' });
  });

  it('calls Kobu when its known total is low enough (≤5 in 4-card mode)', () => {
    const s = playing();
    hand(s, 1, ['JK', 'KS', 'AS', '2S']); // −1 + 0 + 1 + 2 = 2
    turnTo(s, 1);
    expect(decide(s)).toEqual({ type: 'callKobu' });
  });

  it('does not call Kobu while cards are unknown (they count as ~5 each)', () => {
    const s = playing();
    hand(s, 1, ['JK', 'KS', 'AS', '2S']);
    s.players[1].hand[3]!.knownBy = [];
    turnTo(s, 1);
    s.discardPile.push(c('9S', s.players.map((p) => p.id)));
    expect(decide(s)).toEqual({ type: 'drawDeck' });
  });

  it('uses the 6-card threshold (≤8)', () => {
    const s = playing(2, 6);
    hand(s, 1, ['2S', '2H', '2D', 'AS', 'AH', 'KS']); // 8
    turnTo(s, 1);
    expect(decide(s)).toEqual({ type: 'callKobu' });
    hand(s, 1, ['2S', '2H', '2D', 'AS', 'AH', '3S']); // 9
    s.discardPile.push(c('9S', s.players.map((p) => p.id)));
    expect(decide(s)).toEqual({ type: 'drawDeck' });
  });

  it('7: peeks at an own card it has not seen yet', () => {
    const s = playing();
    hand(s, 1, ['2S', '3S', '4S', '5S']);
    s.players[1].hand[2]!.knownBy = [];
    turnTo(s, 1);
    s.stage = { kind: 'power', power: 'peekOwn', card: c('7S'), step: 0, peeked: [] };
    expect(decide(s)).toEqual({ type: 'peek', target: { playerId: bot(s).id, slot: 2 } });
  });

  it('Q/K: swaps its highest known card for a lower known opponent card', () => {
    const s = playing();
    hand(s, 1, ['2S', 'QH', '3S', '4S']); // Q♥ = 13 at slot 1
    hand(s, 0, ['9S', '8S', 'JK', '7S'], false);
    s.players[0].hand[2]!.knownBy = [bot(s).id]; // the bot peeked the human's Joker
    turnTo(s, 1);
    s.stage = { kind: 'power', power: 'queen', card: c('QS'), step: 1, peeked: [] };
    expect(decide(s)).toEqual({ type: 'swap', a: { playerId: bot(s).id, slot: 1 }, b: { playerId: 'H', slot: 2 } });
  });

  it('J: blind-swaps a known high card for an unseen opponent card, or skips if its hand is low', () => {
    const s = playing();
    hand(s, 1, ['2S', '3S', 'KD', '4S']);
    turnTo(s, 1);
    s.stage = { kind: 'power', power: 'blindSwap', card: c('JS'), step: 0, peeked: [] };
    const a = decide(s);
    expect(a).toMatchObject({ type: 'swap', a: { playerId: bot(s).id, slot: 2 } });
    hand(s, 1, ['2S', '3S', 'AS', '4S']);
    expect(decide(s)).toEqual({ type: 'skipPower' });
  });

  it('plays fair: decisions never depend on cards it has not seen', () => {
    const run = (humanHand: string[]) => {
      const s = playing();
      hand(s, 1, ['2S', '3S', 'KD', '4S']);
      hand(s, 0, humanHand, false);
      hand(s, 2, ['9S', '9H', '9D', '9C'], false);
      turnTo(s, 1);
      s.stage = { kind: 'power', power: 'blindSwap', card: c('JS'), step: 0, peeked: [] };
      return decide(s, 1, seeded(42));
    };
    expect(run(['JK', 'JK', 'JK', 'JK'])).toEqual(run(['KH', 'KD', 'QH', 'QD']));
  });

  it('matches a drawn card with a KNOWN same-rank card worth points (highest first)', () => {
    const s = playing();
    hand(s, 1, ['QS', '2S', 'QH', '4S']); // Q♠ = 0, Q♥ = 13
    turnTo(s, 1);
    s.stage = { kind: 'decideDrawn', card: c('QD', [bot(s).id]) };
    expect(decide(s)).toEqual({ type: 'matchDrawn', slot: 2 });
  });

  it('never matches a card it has not seen (no penalty risk), and keeps Jokers', () => {
    const s = playing();
    hand(s, 1, ['9S', '2S', '3S', '4S']);
    s.players[1].hand[0]!.knownBy = [];
    turnTo(s, 1);
    s.stage = { kind: 'decideDrawn', card: c('9D', [bot(s).id]) };
    expect(decide(s)).not.toMatchObject({ type: 'matchDrawn' });
    hand(s, 1, ['JK', '9S', '3S', '4S']);
    s.stage = { kind: 'decideDrawn', card: c('JK', [bot(s).id]) };
    expect(decide(s)).toEqual({ type: 'swapDrawn', slot: 1 }); // swap the Joker in for the 9 instead
  });

  it('snaps out of turn with a KNOWN card of the top discard\'s rank, and that goes first', () => {
    const s = playing(2);
    turnTo(s, 0); // the human's turn
    s.discardPile.push(c('8H', s.players.map((p) => p.id)));
    hand(s, 2, ['2S', '8C', '3S', '4S'], false);
    s.players[2].hand[1]!.knownBy = [s.players[2].id]; // bot 2 has seen its 8
    expect(decideBotSnap(s, s.players[2].id)).toEqual({
      type: 'snapDiscard',
      target: { playerId: s.players[2].id, slot: 1 },
      expect: { rank: '8', suit: 'H' },
    });
    expect(nextBotMove(s, seeded())).toMatchObject({ botId: s.players[2].id, action: { type: 'snapDiscard' } });
    s.players[2].hand[1]!.knownBy = []; // unseen → never risks a penalty
    expect(decideBotSnap(s, s.players[2].id)).toBeNull();
  });

  it("out-slams an opponent's KNOWN low card of the top rank, but never their high card", () => {
    const s = playing(2);
    turnTo(s, 0);
    const b1 = s.players[1].id;
    s.discardPile.push(c('2D', s.players.map((p) => p.id)));
    hand(s, 1, ['9S', '9H', '9D', '9C']); // bot 1 has no 2 of its own
    hand(s, 0, ['5S', '2C', '6S', '7S'], false);
    s.players[0].hand[1]!.knownBy = [b1]; // bot 1 knows the human's 2♣
    expect(decideBotSnap(s, b1)).toEqual({ type: 'snapDiscard', target: { playerId: 'H', slot: 1 }, expect: { rank: '2', suit: 'D' } });
    s.discardPile.push(c('KS', s.players.map((p) => p.id)));
    hand(s, 0, ['5S', 'KH', '6S', '7S'], false); // a red K (13) – slamming it would HELP the human
    s.players[0].hand[1]!.knownBy = [b1];
    expect(decideBotSnap(s, b1)).toBeNull();
  });

  it('combo step: throws away a known same-rank group (not Jokers), then ends the turn', () => {
    const s = playing();
    hand(s, 1, ['AC', 'KS', 'AD', 'JC']);
    turnTo(s, 1);
    s.stage = { kind: 'combo', placedSlot: 0 };
    expect(decide(s)).toEqual({ type: 'comboMatch', slots: [0, 2] });
    hand(s, 1, ['JK', 'KS', 'JK', '5C']);
    s.discardPile.push(c('9H', s.players.map((p) => p.id)));
    expect(decide(s)).toEqual({ type: 'finishTurn' }); // two Jokers are worth −2: keep them
  });

  it('values unknown cards at the deck average', () => {
    const s = playing();
    expect(unknownCardValue(s)).toBeCloseTo(294 / 56, 5);
  });
});

describe('AI-only games', () => {
  it('bots can play many complete games without getting stuck', () => {
    for (let g = 0; g < 25; g++) {
      const rng = seeded(100 + g);
      const s = aiLobby(1 + (g % 5), g % 2 ? 6 : 4, rng);
      s.players[0].isBot = true; // let the AI play the host's seat too
      applyAction(s, 'H', { type: 'startGame' }, rng);
      let steps = 0;
      while (s.phase !== 'gameOver') {
        expect(++steps).toBeLessThan(20000);
        const m = nextBotMove(s, rng);
        if (m) applyAction(s, m.botId, m.action, rng);
        else if (s.phase === 'starterDraw') applyAction(s, 'H', { type: 'dealCards' }, rng);
        else if (s.phase === 'roundOver') applyAction(s, 'H', { type: 'nextRound' }, rng);
        else throw new Error(`stuck in ${s.phase} / ${s.stage.kind}`);
      }
      expect(s.winnerIds.length).toBeGreaterThan(0);
    }
  });
});
