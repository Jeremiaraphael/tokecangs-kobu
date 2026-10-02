// ─────────────────────────────────────────────────────────────────────────────
// Kobu – AI controller (simple heuristics).
//
// Fair play: a bot only "knows" a card if it has really seen it, i.e. its id
// is in card.knownBy (cards it peeked, drew, or that were face-up). Everything
// else is treated as an average unknown card. Bots have perfect memory, but
// swaps are public, so they always know where the cards they've seen went.
// ─────────────────────────────────────────────────────────────────────────────
import type { Rng } from './engine';
import {
  INITIAL_PEEKS,
  POWER_STEPS,
  cardPoints,
  deckFaces,
  type Card,
  type GameAction,
  type GameState,
  type Player,
  type SlotRef,
} from './types';

/** Call Kobu when the bot's estimated hand total is at or below this (per hand size). */
export const KOBU_THRESHOLD: Record<number, number> = { 4: 5, 6: 8 };
/** Minimum point gain before a bot bothers to swap a positive card in. */
const MIN_GAIN = 2;

interface SlotInfo {
  ref: SlotRef;
  card: Card;
  known: boolean;
  /** Real points if known, otherwise the expected value of an unseen card. */
  points: number;
}

const pick = <T>(arr: T[], rng: Rng): T => arr[Math.floor(rng() * arr.length)];
const maxBy = <T>(arr: T[], f: (x: T) => number) => arr.reduce<T | undefined>((m, x) => (m === undefined || f(x) > f(m) ? x : m), undefined);
const minBy = <T>(arr: T[], f: (x: T) => number) => arr.reduce<T | undefined>((m, x) => (m === undefined || f(x) < f(m) ? x : m), undefined);

/** Average points of a random card from the full deck (~5.25 with Ace = 1). */
export function unknownCardValue(state: GameState): number {
  const faces = deckFaces();
  return faces.reduce((s, f) => s + cardPoints(f, state.settings), 0) / faces.length;
}

/** The cards (not gaps) in a player's hand, as seen by the bot. */
function slotsOf(state: GameState, player: Player, botId: string): SlotInfo[] {
  const unknown = unknownCardValue(state);
  return player.hand.flatMap((card, slot) => {
    if (!card) return [];
    const known = card.knownBy.includes(botId);
    return [{ ref: { playerId: player.id, slot }, card, known, points: known ? cardPoints(card, state.settings) : unknown }];
  });
}

/** Is replacing `slot` with a card worth `p` points an improvement? */
function worthReplacing(p: number, slot: SlotInfo | undefined) {
  if (!slot) return false;
  // Jokers and black J/Q/K (≤ 0) are always worth keeping over anything higher.
  return p <= 0 ? slot.points > p : slot.points - p >= MIN_GAIN;
}

/**
 * Snap onto the discard pile (any bot, even out of turn) – only with cards the bot KNOWS
 * have the top card's rank, so it never takes a penalty:
 *  - its own card, if worth points (hand gets smaller);
 *  - otherwise an opponent's known LOW card (out-slam): they get a random replacement,
 *    which is likely worse for them.
 */
export function decideBotSnap(state: GameState, botId: string): GameAction | null {
  const me = state.players.find((p) => p.id === botId);
  const top = state.discardPile.at(-1);
  if (!me?.isBot || !top || state.phase !== 'playing' || state.stage.kind === 'power') return null;
  const expect = { rank: top.rank, suit: top.suit };
  const own = maxBy(
    slotsOf(state, me, botId).filter((s) => s.known && s.card.rank === top.rank && s.points > 0),
    (s) => s.points,
  );
  if (own) return { type: 'snapDiscard', target: own.ref, expect };
  const unknown = unknownCardValue(state);
  const theirs = minBy(
    state.players
      .filter((p) => p.id !== botId)
      .flatMap((p) => slotsOf(state, p, botId))
      .filter((s) => s.known && s.card.rank === top.rank && s.points <= unknown - MIN_GAIN),
    (s) => s.points,
  );
  return theirs ? { type: 'snapDiscard', target: theirs.ref, expect } : null;
}

/** Which bot (if any) should act next, and what it would do. Snaps come first. */
export function nextBotMove(state: GameState, rng: Rng): { botId: string; action: GameAction } | null {
  const bots = state.players.filter((p) => p.isBot);
  for (const bot of bots) {
    const snap = decideBotSnap(state, bot.id);
    if (snap) return { botId: bot.id, action: snap };
  }
  const candidates: Player[] =
    state.phase === 'starterDraw' || state.phase === 'peeking'
      ? bots
      : state.phase === 'playing' && state.players[state.currentPlayerIndex].isBot
        ? [state.players[state.currentPlayerIndex]]
        : [];
  for (const bot of candidates) {
    const action = decideBotAction(state, bot.id, rng);
    if (action) return { botId: bot.id, action };
  }
  return null;
}

/** The move a bot makes right now, or null when it has nothing to do. */
export function decideBotAction(state: GameState, botId: string, rng: Rng): GameAction | null {
  const me = state.players.find((p) => p.id === botId);
  if (!me?.isBot) return null;

  // ── Who goes first: take any free face-down card ──
  if (state.phase === 'starterDraw') {
    const sd = state.starterDraw;
    if (!sd || sd.winnerId || botId in sd.picks) return null;
    const taken = new Set(Object.values(sd.picks));
    const free = sd.offered.map((_, i) => i).filter((i) => !taken.has(i));
    return free.length ? { type: 'pickStarter', index: pick(free, rng) } : null;
  }

  // ── Initial peek ──
  if (state.phase === 'peeking') {
    if (me.ready) return null;
    if (me.initialPeeks.length < INITIAL_PEEKS) {
      const unseen = me.hand.flatMap((c, i) => (c && !me.initialPeeks.includes(i) ? [i] : []));
      return { type: 'initialPeek', slot: pick(unseen, rng) };
    }
    return { type: 'ready' };
  }

  if (state.phase !== 'playing' || state.players[state.currentPlayerIndex].id !== botId) return null;

  const mine = slotsOf(state, me, botId);
  const opps = state.players.filter((p) => p.id !== botId).flatMap((p) => slotsOf(state, p, botId));
  const unknown = unknownCardValue(state);
  // Highest-value own card; on equal value prefer a known one (we're sure it's bad),
  // and pick randomly among equally-unknown cards so play doesn't look robotic.
  const top = maxBy(mine, (s) => s.points + (s.known ? 0.01 : 0));
  const worst = top && !top.known ? pick(mine.filter((s) => !s.known && s.points === top.points), rng) : top;
  const pts = (c: Card) => cardPoints(c, state.settings);
  const stage = state.stage;

  /** Give my worst card away for a lower one: a known-low opponent card, or an unseen one if mine is clearly bad. */
  const tradeDown = (): GameAction | null => {
    if (!worst) return null;
    const lowKnown = minBy(opps.filter((s) => s.known), (s) => s.points);
    if (lowKnown && worst.points - lowKnown.points >= MIN_GAIN) return { type: 'swap', a: worst.ref, b: lowKnown.ref };
    const unseen = opps.filter((s) => !s.known);
    if (unseen.length && worst.known && worst.points - unknown >= MIN_GAIN) {
      return { type: 'swap', a: worst.ref, b: pick(unseen, rng).ref };
    }
    return null;
  };

  switch (stage.kind) {
    case 'draw': {
      const estimate = mine.reduce((s, x) => s + x.points, 0);
      const threshold = KOBU_THRESHOLD[state.settings.handSize] ?? KOBU_THRESHOLD[4];
      if (!state.kobuCallerId && estimate <= threshold) return { type: 'callKobu' };
      return { type: 'drawDeck' };
    }

    case 'decideDrawn': {
      // Match/snap only with a card it KNOWS has the same rank (so it never takes a penalty),
      // and only when that card is worth points (never throw away a Joker or black face).
      const match = maxBy(
        mine.filter((s) => s.known && s.card.rank === stage.card.rank && s.points > 0),
        (s) => s.points,
      );
      if (match) return { type: 'matchDrawn', slot: match.ref.slot };
      // Keep low cards (and any Joker / black face); otherwise discard, which also fires 7/8/J/Q/K powers.
      return worst && worthReplacing(pts(stage.card), worst)
        ? { type: 'swapDrawn', slot: worst.ref.slot }
        : { type: 'discardDrawn' };
    }

    case 'combo': {
      // Throw away the biggest known same-rank group (never Jokers: they're worth −1),
      // else known cards matching the top discard; then end the turn.
      const usable = mine.filter((s) => s.known && s.points >= 0);
      const groups = new Map<string, SlotInfo[]>();
      for (const s of usable) groups.set(s.card.rank, [...(groups.get(s.card.rank) ?? []), s]);
      const pairs = [...groups.values()].filter((g) => g.length >= 2);
      const best = maxBy(pairs, (g) => g.reduce((n, s) => n + s.points, 0) * 10 + g.length);
      if (best) return { type: 'comboMatch', slots: best.map((s) => s.ref.slot) };
      const top = state.discardPile.at(-1);
      const onTop = top ? usable.filter((s) => s.card.rank === top.rank && s.points > 0) : [];
      if (onTop.length) return { type: 'comboMatch', slots: onTop.map((s) => s.ref.slot) };
      return { type: 'finishTurn' };
    }

    case 'power': {
      const step = POWER_STEPS[stage.power][stage.step];
      switch (step) {
        case 'peekOwn': {
          const unseen = mine.filter((s) => !s.known);
          if (unseen.length) return { type: 'peek', target: pick(unseen, rng).ref };
          // A 7 is pointless when we know everything; a King still needs this step to reach its swap.
          return stage.power === 'king' ? { type: 'peek', target: pick(mine, rng).ref } : { type: 'skipPower' };
        }
        case 'peekOpp': {
          const unseen = opps.filter((s) => !s.known);
          return { type: 'peek', target: pick(unseen.length ? unseen : opps, rng).ref };
        }
        case 'review':
          return { type: 'endPeek' };
        case 'blindSwap':
        case 'swapAny':
          return tradeDown() ?? { type: 'skipPower' };
      }
    }
  }
  return null;
}
