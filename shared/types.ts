// ─────────────────────────────────────────────────────────────────────────────
// Kobu – shared types (used by both the Socket.io server and the React client)
// ─────────────────────────────────────────────────────────────────────────────
import type { CardFace, Power, PowerStep } from './cards';
import type { Msg } from './i18n';

export * from './cards';
export * from './i18n';

export type HandSize = 4 | 6;
export const HAND_SIZES: HandSize[] = [4, 6];
export const INITIAL_PEEKS = 1; // cards each player may look at before the round starts
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const KOBU_PENALTY = 10;

/** 'multiplayer' = friends join by code; 'ai' = one human host + computer players. */
export type GameMode = 'multiplayer' | 'ai';
export const BOT_NAMES = ['Ayu', 'Budi', 'Citra', 'Dimas', 'Eka', 'Fajar', 'Gita', 'Hadi'];

/** A physical card. `knownBy` = ids of players who have seen this exact card (travels with it). */
export interface Card extends CardFace {
  id: string;
  knownBy: string[];
}

export interface SlotRef {
  playerId: string;
  slot: number;
}

export const sameSlot = (a: SlotRef, b: SlotRef) => a.playerId === b.playerId && a.slot === b.slot;

/**
 * Hands can shrink (match/snap) and grow (penalty cards). A matched card leaves a
 * `null` gap so every other card keeps its position – players memorise positions.
 * Trailing gaps are trimmed; a penalty card fills the first gap (or goes at the end).
 */
export const cardsIn = <T>(hand: (T | null)[]): T[] => hand.filter((c): c is T => c !== null);

/** A card the current player looked at during a power (only the actor ever sees `face`). */
export interface Peek {
  ref: SlotRef; // where it was when peeked
  cardId: string; // follows the card if it is moved afterwards (rearranging)
  face: CardFace;
}

/** Where the current player is inside their turn. */
export type TurnStage =
  | { kind: 'draw' } // draw from pile / take discard / call Kobu
  | { kind: 'decideDrawn'; card: Card } // drew from pile: swap it in, or discard it (→ power)
  | { kind: 'combo'; placedSlot: number } // just swapped the drawn card in: optional match combos, then end turn
  | { kind: 'power'; power: Power; card: Card; step: number; peeked: Peek[] }; // resolving POWER_STEPS[power][step]

export type Phase = 'lobby' | 'starterDraw' | 'peeking' | 'playing' | 'roundOver' | 'gameOver';

/**
 * "Who goes first" draw at the start of a game: one face-down card per player
 * is offered, each player takes one, and the lowest card (by points) starts.
 * Players tied for lowest automatically get a new card until one is lowest.
 */
export interface StarterDraw {
  offered: Card[]; // index = position on the table
  picks: Record<string, number>; // playerId → index in `offered`
  /** Tie-break rounds: each round deals a fresh card to every player still tied for lowest. */
  redraws: { playerId: string; card: Card }[][];
  pool: Card[]; // remaining cards used for tie-break redraws
  winnerId: string | null;
}

export interface Player {
  id: string;
  name: string;
  /** Computer player, driven by shared/ai.ts on the server. */
  isBot: boolean;
  connected: boolean;
  hand: (Card | null)[]; // null = gap left by a matched card
  /** Slots chosen during the initial peek phase. */
  initialPeeks: number[];
  ready: boolean;
  totalScore: number;
}

export interface LogEntry {
  id: number;
  ts: number;
  /** English text (server logs, fallback). Clients render `msg` in their own language. */
  text: string;
  msg: Msg;
  playerId?: string;
}

export interface RoundResultRow {
  playerId: string;
  name: string;
  cards: CardFace[];
  handTotal: number;
  roundScore: number;
  /** Kobu caller who failed: hand + KOBU_PENALTY. */
  penalty: boolean;
  /** Best standing this round (successful caller, or lowest player when the caller failed). */
  lowest: boolean;
  totalScore: number;
}

export interface RoundResult {
  round: number;
  kobuCallerId: string | null;
  callerSucceeded: boolean;
  rows: RoundResultRow[];
}

/**
 * A successful match/snap, for the client's "card flies onto the pile" animation.
 * `seq` increases with every event; `faces` are the cards that landed (bottom first).
 */
export interface MatchEvent {
  seq: number;
  /** match = with the drawn card · snap = own card onto the pile · slam = an opponent's card onto the pile · combo = several own cards after a swap */
  kind: 'match' | 'snap' | 'slam' | 'combo';
  playerId: string; // whose hand the card came from
  slot: number; // where in that hand
  slots?: number[]; // combo: every slot that was thrown away, in the same order as `faces`
  byPlayerId: string; // who made the play
  faces: CardFace[];
}

/**
 * Card movements for the client's animations (public info only – face-down cards carry no face).
 * `seq` increases forever; clients replay events they haven't seen yet.
 */
export type MotionEvent = { seq: number } & (
  | { kind: 'draw'; playerId: string } // draw pile → "drawn" spot
  | { kind: 'toPile'; from: SlotRef | 'drawn'; face: CardFace; pileIndex: number } // card thrown onto the discard pile (pileIndex: 1-based)
  | { kind: 'toHand'; from: 'drawn' | 'deck'; to: SlotRef; delayMs?: number } // face-down card into a hand spot
  | { kind: 'swap'; a: SlotRef; b: SlotRef; by?: string } // two cards trade places (by = who rearranged their own hand)
);
/** A MotionEvent before the engine stamps its `seq`. */
export type NewMotion = MotionEvent extends infer E ? (E extends { seq: number } ? Omit<E, 'seq'> : never) : never;

export interface GameSettings {
  handSize: HandSize; // 4-card or 6-card mode
  aceValue: 0 | 1; // Ace scores 1 (default) or 0
  targetScore: number; // game ends when someone reaches this
}

export const DEFAULT_SETTINGS: GameSettings = { handSize: 4, aceValue: 1, targetScore: 100 };

/** Full authoritative state – lives ONLY on the server. */
export interface GameState {
  roomCode: string;
  mode: GameMode;
  hostId: string;
  phase: Phase;
  settings: GameSettings;
  round: number;
  players: Player[];
  drawPile: Card[]; // last element = top
  discardPile: Card[]; // last element = top
  currentPlayerIndex: number;
  startingPlayerIndex: number;
  stage: TurnStage;
  kobuCallerId: string | null;
  highlights: SlotRef[];
  log: LogEntry[];
  logSeq: number;
  lastResult: RoundResult | null;
  winnerIds: string[];
  starterDraw: StarterDraw | null;
  lastMatch: MatchEvent | null;
  motions: MotionEvent[]; // the most recent card movements (for animations)
  motionSeq: number;
}

// ── Actions (client → server) ───────────────────────────────────────────────

export type GameAction =
  | { type: 'configure'; settings: Partial<Pick<GameSettings, 'handSize' | 'aceValue'>> } // host, before a game
  | { type: 'addBot' } // host, AI rooms, lobby only
  | { type: 'removeBot'; playerId: string } // host, AI rooms, lobby only
  | { type: 'startGame' } // host: begins the "who goes first" draw
  | { type: 'pickStarter'; index: number } // take one of the offered face-down cards
  | { type: 'autoPickStarter' } // host: pick at random for everyone who hasn't picked yet
  | { type: 'dealCards' } // host: after the starter draw is decided, deal the first round
  | { type: 'nextRound' }
  | { type: 'initialPeek'; slot: number }
  | { type: 'ready' }
  | { type: 'drawDeck' }
  | { type: 'swapDrawn'; slot: number } // → combo step (same turn)
  // Combo step after a swap: throw away own cards that ALL share one rank, if there are 2+ of them
  // (they match each other) or they match the top discard. Wrong → revealed, +1 penalty, turn ends.
  | { type: 'comboMatch'; slots: number[] }
  | { type: 'finishTurn' } // end the combo step
  // Bluff: swap two of your own spots (face-down) any time during play. Everyone sees the cards
  // move, but other players lose track of what those cards were.
  | { type: 'reorder'; from: number; to: number }
  | { type: 'discardDrawn' }
  | { type: 'matchDrawn'; slot: number } // match: your card at `slot` has the same rank as the drawn card
  // snap (any player, any time except mid-power): the card at `target` – yours, or an OPPONENT's
  // ("out-slam") – has the same rank as the top discard. `expect` = the top card you saw; if the
  // pile changed meanwhile the snap is rejected without penalty.
  | { type: 'snapDiscard'; target: SlotRef; expect: CardFace }
  | { type: 'callKobu' }
  | { type: 'peek'; target: SlotRef } // power step peekOwn / peekOpp
  | { type: 'swap'; a: SlotRef; b: SlotRef } // power step blindSwap / swapAny
  | { type: 'skipPower' } // give up the rest of the power (= "don't swap" in swapAny)
  | { type: 'endPeek' } // power step review
  | { type: 'skipTurn' }; // host only: skip a disconnected player's turn

// ── Per-player sanitized view (server → client) ────────────────────────────

export interface CardView {
  /** Only present when this viewer is allowed to see the card right now. */
  face?: CardFace;
  /** Has the viewer ever seen this card? (memory hint, never the value) */
  knownByMe: boolean;
  /** Names of OTHER players who have seen this card. */
  seenBy: string[];
  highlighted: boolean;
}

export interface PlayerPublicView {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  totalScore: number;
  hand: (CardView | null)[]; // null = gap left by a matched card
}

export type StageView =
  | { kind: 'draw' }
  | { kind: 'decideDrawn'; face?: CardFace }
  | { kind: 'combo'; placedSlot: number }
  | {
      kind: 'power';
      power: Power;
      face: CardFace; // the discarded card that triggered it (public)
      step: PowerStep;
      stepIndex: number;
      stepCount: number;
      peeked: { ref: SlotRef; face?: CardFace }[]; // which slots were peeked is public; faces only for the actor
    };

export interface StarterDrawView {
  offered: { takenBy: string | null; face?: CardFace }[]; // faces revealed once everyone has picked
  redraws: { playerId: string; face: CardFace }[][];
  winnerId: string | null;
}

export interface PlayerView {
  roomCode: string;
  mode: GameMode;
  you: string;
  hostId: string;
  phase: Phase;
  settings: GameSettings;
  round: number;
  players: PlayerPublicView[];
  drawPileCount: number;
  discardTop: CardFace | null;
  /** Up to the top 3 discard cards, bottom first – for the stacked pile. */
  discardStack: CardFace[];
  discardCount: number;
  lastMatch: MatchEvent | null;
  motions: MotionEvent[];
  currentPlayerId: string | null;
  stage: StageView;
  kobuCallerId: string | null;
  log: LogEntry[];
  lastResult: RoundResult | null;
  winnerIds: string[];
  starterDraw: StarterDrawView | null;
}

// ── Socket.io event contracts ───────────────────────────────────────────────

export type Ack<T = object> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'room:create': (p: { name: string; token: string; mode?: GameMode }, ack: Ack<{ code: string }>) => void;
  'room:join': (p: { code: string; name: string; token: string }, ack: Ack<{ code: string }>) => void;
  'room:resume': (p: { token: string }, ack: Ack<{ code: string }>) => void;
  'room:leave': () => void;
  'game:action': (action: GameAction, ack: Ack) => void;
}

export interface ServerToClientEvents {
  state: (view: PlayerView) => void;
}
