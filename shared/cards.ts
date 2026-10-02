// ─────────────────────────────────────────────────────────────────────────────
// Kobu – card model & utilities (shared by server engine and React client)
//
// Deck: standard 52 cards (A, 2–10, J, Q, K × ♠♣♥♦) + 4 Jokers = 56 cards.
// Points: A = 1 (or 0 by room setting), 2–10 face value,
//         black J/Q/K = 0, red J/Q/K = 13, Joker = -1.
// Powers (only when DRAWN from the draw pile and discarded):
//   7 peek own · 8 spy opponent · J blind swap · Q spy + swap any · K peek own + spy + swap any
// ─────────────────────────────────────────────────────────────────────────────

export type Suit = 'S' | 'C' | 'H' | 'D';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JOKER';

/** What is printed on a card. Jokers have no suit. */
export interface CardFace {
  rank: Rank;
  suit: Suit | null;
}

export interface ScoringRules {
  aceValue: 0 | 1;
}

export const SUITS: Suit[] = ['S', 'C', 'H', 'D'];
export const RANKS: Exclude<Rank, 'JOKER'>[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const JOKER_COUNT = 4;

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', C: '♣', H: '♥', D: '♦' };
export const SUIT_NAME: Record<Suit, string> = { S: 'Spades', C: 'Clubs', H: 'Hearts', D: 'Diamonds' };

export const isJoker = (f: CardFace) => f.rank === 'JOKER';
export const isRed = (f: CardFace) => f.suit === 'H' || f.suit === 'D';
export const isFaceCard = (f: CardFace) => f.rank === 'J' || f.rank === 'Q' || f.rank === 'K';

/** Points this card is worth if it is still in your hand at the end of the round. */
export function cardPoints(f: CardFace, rules: ScoringRules = { aceValue: 1 }): number {
  if (f.rank === 'JOKER') return -1;
  if (f.rank === 'A') return rules.aceValue;
  if (isFaceCard(f)) return isRed(f) ? 13 : 0;
  return Number(f.rank);
}

export function handPoints(hand: CardFace[], rules?: ScoringRules): number {
  return hand.reduce((sum, f) => sum + cardPoints(f, rules), 0);
}

/** e.g. "Q♥", "10♠", "Joker" */
export function cardLabel(f: CardFace): string {
  return f.rank === 'JOKER' ? 'Joker' : `${f.rank}${SUIT_SYMBOL[f.suit!]}`;
}

export const sameFace = (a: CardFace, b: CardFace) => a.rank === b.rank && a.suit === b.suit;

const RANK_NAME: Partial<Record<Rank, string>> = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King', JOKER: 'Joker' };

/** "an Ace", "a Queen", "an 8", "a 7" – for prompts and the log. */
export function aRank(rank: Rank): string {
  const name = RANK_NAME[rank] ?? rank;
  return `${/^(Ace|8)/.test(name) ? 'an' : 'a'} ${name}`;
}

/** All 56 faces, unshuffled. */
export function deckFaces(): CardFace[] {
  const faces: CardFace[] = [];
  for (const suit of SUITS) for (const rank of RANKS) faces.push({ rank, suit });
  for (let i = 0; i < JOKER_COUNT; i++) faces.push({ rank: 'JOKER', suit: null });
  return faces;
}

// ── Powers ──────────────────────────────────────────────────────────────────

export type Power = 'peekOwn' | 'spy' | 'blindSwap' | 'queen' | 'king';

/** One interaction inside a power. A power is a fixed sequence of steps. */
export type PowerStep =
  | 'peekOwn' // tap one of your cards to look at it
  | 'peekOpp' // tap an opponent's card to look at it
  | 'blindSwap' // pick 1 own + 1 opponent card, swap unseen
  | 'swapAny' // optionally pick ANY 2 cards on the table and swap them
  | 'review'; // look at what you peeked, then press Done

export const POWER_STEPS: Record<Power, PowerStep[]> = {
  peekOwn: ['peekOwn', 'review'],
  spy: ['peekOpp', 'review'],
  blindSwap: ['blindSwap'],
  queen: ['peekOpp', 'swapAny'],
  king: ['peekOwn', 'peekOpp', 'swapAny'],
};

export const POWER_INFO: Record<Power, { name: string; short: string; help: string }> = {
  peekOwn: { name: 'Peek', short: 'Peek', help: 'Look at one of your own cards.' },
  spy: { name: 'Spy', short: 'Spy', help: "Look at one opponent's card." },
  blindSwap: { name: 'Blind Swap', short: 'Swap', help: 'Swap one of your cards with an opponent’s card, unseen.' },
  queen: { name: 'Queen', short: 'Spy+Swap', help: "Look at an opponent's card, then you may swap ANY two cards on the table." },
  king: { name: 'King', short: 'Peek×2+Swap', help: 'Look at one of your cards and one opponent card, then you may swap ANY two cards.' },
};

/** The power a card triggers when drawn from the pile and discarded (red & black alike). */
export function cardPower(f: CardFace): Power | null {
  switch (f.rank) {
    case '7':
      return 'peekOwn';
    case '8':
      return 'spy';
    case 'J':
      return 'blindSwap';
    case 'Q':
      return 'queen';
    case 'K':
      return 'king';
    default:
      return null;
  }
}
