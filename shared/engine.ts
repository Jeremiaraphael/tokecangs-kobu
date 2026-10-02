// ─────────────────────────────────────────────────────────────────────────────
// Kobu – authoritative game engine.
// Every function mutates the state it is given. The server clones the state
// before calling `applyAction`, so a thrown GameError never leaves a
// half-applied move behind.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BOT_NAMES,
  DEFAULT_SETTINGS,
  HAND_SIZES,
  INITIAL_PEEKS,
  KOBU_PENALTY,
  MAX_PLAYERS,
  MIN_PLAYERS,
  POWER_STEPS,
  cardLabel,
  cardPoints,
  cardsIn,
  msg,
  sameFace,
  translate,
  cardPower,
  deckFaces,
  sameSlot,
  type Card,
  type CardFace,
  type GameAction,
  type GameMode,
  type GameSettings,
  type GameState,
  type Msg,
  type NewMotion,
  type Player,
  type PowerStep,
  type RoundResult,
  type RoundResultRow,
  type ScoringRules,
  type SlotRef,
} from './types';

export class GameError extends Error {}
export type Rng = () => number;

const MAX_LOG = 200;
const cardsWord = (n: number) => (n === 1 ? '1 card' : `${n} cards`);
const nameList = (names: string[]) => names.join(' & ');

// ── Deck ────────────────────────────────────────────────────────────────────

/** 56 cards: A–10, J, Q, K in four suits + 4 Jokers. */
export function buildDeck(round: number): Card[] {
  return deckFaces().map((face, i) => ({ ...face, id: `r${round}-${i}`, knownBy: [] }));
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const faceOf = (c: Card): CardFace => ({ rank: c.rank, suit: c.suit });

// ── Room / lobby helpers ────────────────────────────────────────────────────

export function createGame(
  roomCode: string,
  host: { id: string; name: string },
  settings: Partial<GameSettings> = {},
  mode: GameMode = 'multiplayer',
): GameState {
  const state: GameState = {
    roomCode,
    mode,
    hostId: host.id,
    phase: 'lobby',
    settings: { ...DEFAULT_SETTINGS, ...settings },
    round: 0,
    players: [],
    drawPile: [],
    discardPile: [],
    currentPlayerIndex: 0,
    startingPlayerIndex: 0,
    stage: { kind: 'draw' },
    kobuCallerId: null,
    highlights: [],
    log: [],
    logSeq: 0,
    lastResult: null,
    winnerIds: [],
    starterDraw: null,
    lastMatch: null,
    motions: [],
    motionSeq: 0,
  };
  addPlayer(state, host.id, host.name);
  return state;
}

export function addPlayer(state: GameState, id: string, name: string, isBot = false): void {
  if (state.phase !== 'lobby') throw new GameError('Game already in progress');
  if (state.players.length >= MAX_PLAYERS) throw new GameError(`Room is full (max ${MAX_PLAYERS})`);
  if (state.players.some((p) => p.id === id)) return;
  state.players.push({
    id,
    name,
    isBot,
    connected: true,
    hand: [],
    initialPeeks: [],
    ready: false,
    totalScore: 0,
  });
  log(state, msg('log.joined', { name }), id);
}

/** Only possible in the lobby; mid-game a leaver simply stays disconnected. */
export function removePlayer(state: GameState, id: string): void {
  const p = findPlayer(state, id);
  if (!p) return;
  state.players = state.players.filter((x) => x.id !== id);
  log(state, msg('log.left', { name: p.name }));
  // The host must be a human; bots never run the room.
  const nextHost = state.players.find((x) => !x.isBot);
  if (state.hostId === id && nextHost) {
    state.hostId = nextHost.id;
    log(state, msg('log.newHost', { name: nextHost.name }));
  }
}

export function setConnected(state: GameState, id: string, connected: boolean): void {
  const p = findPlayer(state, id);
  if (!p || p.connected === connected) return;
  p.connected = connected;
  log(state, msg(connected ? 'log.reconnected' : 'log.disconnected', { name: p.name }), id);
}

// ── Internal helpers ────────────────────────────────────────────────────────

/** Add an activity-log entry; clients show `msg` in their own language. */
function log(state: GameState, m: Msg, playerId?: string) {
  state.log.push({ id: ++state.logSeq, ts: Date.now(), text: translate('en', m.key, m.params), msg: m, playerId });
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
}

function findPlayer(state: GameState, id: string): Player | undefined {
  return state.players.find((p) => p.id === id);
}

function mustPlayer(state: GameState, id: string): Player {
  const p = findPlayer(state, id);
  if (!p) throw new GameError('Unknown player');
  return p;
}

/** The card in `player`'s `slot`; throws for an invalid slot or a gap. */
function cardIn(player: Player, slot: unknown): Card {
  const card = Number.isInteger(slot) ? player.hand[slot as number] : undefined;
  if (card === undefined) throw new GameError('Invalid card slot');
  if (card === null) throw new GameError('There is no card there');
  return card;
}

function cardAtRef(state: GameState, ref: SlotRef | undefined): Card {
  if (!ref) throw new GameError('Missing card');
  return cardIn(mustPlayer(state, ref.playerId), ref.slot);
}

/** Put a card into the first gap of a hand (or at the end); returns its slot. */
function addToHand(player: Player, card: Card): number {
  const gap = player.hand.indexOf(null);
  if (gap >= 0) {
    player.hand[gap] = card;
    return gap;
  }
  return player.hand.push(card) - 1;
}

/** Drop gaps at the end of a hand (inner gaps stay so positions don't shift). */
function trimGaps(player: Player) {
  while (player.hand.length && player.hand[player.hand.length - 1] === null) player.hand.pop();
}

const countCards = (p: Player) => cardsIn(p.hand).length;

const MAX_MOTIONS = 24;
/** Record a card movement so every client can animate it. */
function motion(state: GameState, ev: NewMotion) {
  state.motions.push({ ...ev, seq: ++state.motionSeq } as GameState['motions'][number]);
  if (state.motions.length > MAX_MOTIONS) state.motions.splice(0, state.motions.length - MAX_MOTIONS);
}
const pileTop = (state: GameState) => state.discardPile.length;

/** Failed match/snap: +1 face-down card from the draw pile. Returns text for the log. */
function givePenaltyCard(state: GameState, player: Player, rng: Rng): Msg {
  try {
    ensureDrawPile(state, rng);
    const slot = addToHand(player, state.drawPile.pop()!);
    state.highlights.push({ playerId: player.id, slot });
    motion(state, { kind: 'toHand', from: 'deck', to: { playerId: player.id, slot } });
    return msg('penalty.card', { slot: slot + 1 });
  } catch (e) {
    if (!(e instanceof GameError)) throw e;
    return msg('penalty.none');
  }
}

function learn(card: Card, playerId: string) {
  if (!card.knownBy.includes(playerId)) card.knownBy.push(playerId);
}

function makePublic(state: GameState, card: Card) {
  card.knownBy = state.players.map((p) => p.id);
}

/** "their own card #2" / "Bob's card #3" (from the actor's point of view), for the log. */
function describe(state: GameState, actorId: string, ref: SlotRef): Msg {
  return ref.playerId === actorId
    ? msg('ref.own', { slot: ref.slot + 1 })
    : msg('ref.other', { owner: mustPlayer(state, ref.playerId).name, slot: ref.slot + 1 });
}

function swapSlots(state: GameState, a: SlotRef, b: SlotRef) {
  const pa = mustPlayer(state, a.playerId);
  const pb = mustPlayer(state, b.playerId);
  const tmp = pa.hand[a.slot];
  pa.hand[a.slot] = pb.hand[b.slot];
  pb.hand[b.slot] = tmp;
}

function ensureDrawPile(state: GameState, rng: Rng) {
  if (state.drawPile.length) return;
  const top = state.discardPile.pop();
  const rest = state.discardPile;
  if (!rest.length) {
    if (top) state.discardPile.push(top);
    throw new GameError('No cards left to draw');
  }
  rest.forEach((c) => (c.knownBy = []));
  state.drawPile = shuffle(rest, rng);
  state.discardPile = top ? [top] : [];
  log(state, msg('log.reshuffled'));
}

// ── "Who goes first" draw ───────────────────────────────────────────────────

/** Offer one face-down card per player from a freshly shuffled deck. */
function beginStarterDraw(state: GameState, rng: Rng) {
  const deck = shuffle(buildDeck(0), rng);
  const n = state.players.length;
  for (const p of state.players) {
    p.hand = [];
    p.initialPeeks = [];
    p.ready = false;
  }
  state.drawPile = [];
  state.discardPile = [];
  state.stage = { kind: 'draw' };
  state.kobuCallerId = null;
  state.highlights = [];
  state.lastResult = null;
  state.winnerIds = [];
  state.starterDraw = { offered: deck.splice(-n, n), picks: {}, redraws: [], pool: deck, winnerId: null };
  state.phase = 'starterDraw';
  log(state, msg('log.whoFirst', { n }));
}

/**
 * Everyone has picked: reveal, and find the single lowest card (by points).
 * Players tied for lowest automatically get a new card until exactly one is lowest.
 */
function resolveStarterDraw(state: GameState, rng: Rng) {
  const sd = state.starterDraw!;
  const pts = (c: Card) => cardPoints(c, state.settings);
  const name = (id: string) => mustPlayer(state, id).name;
  let contenders = state.players.map((p) => ({ playerId: p.id, card: sd.offered[sd.picks[p.id]] }));
  log(state, msg('log.revealed', { list: contenders.map((x) => `${name(x.playerId)} ${cardLabel(x.card)}`).join(', ') }));

  for (;;) {
    const low = Math.min(...contenders.map((x) => pts(x.card)));
    const tied = contenders.filter((x) => pts(x.card) === low);
    if (tied.length === 1) {
      sd.winnerId = tied[0].playerId;
      break;
    }
    if (sd.pool.length < tied.length) {
      // Practically unreachable (50+ spare cards), but never loop forever.
      sd.winnerId = tied[Math.floor(rng() * tied.length)].playerId;
      break;
    }
    log(state, msg('log.tie', { low, names: nameList(tied.map((x) => name(x.playerId))) }));
    contenders = tied.map((x) => ({ playerId: x.playerId, card: sd.pool.pop()! }));
    sd.redraws.push(contenders);
    log(state, msg('log.redraw', { list: contenders.map((x) => `${name(x.playerId)} ${cardLabel(x.card)}`).join(', ') }));
  }
  log(state, msg('log.starter', { name: name(sd.winnerId) }));
}

// ── Round lifecycle ─────────────────────────────────────────────────────────

export function startRound(state: GameState, rng: Rng): void {
  const { handSize } = state.settings;
  state.round += 1;
  const deck = shuffle(buildDeck(state.round), rng);
  for (const p of state.players) {
    p.hand = deck.splice(-handSize, handSize);
    p.initialPeeks = [];
    p.ready = false;
  }
  // Everything not dealt is the draw pile (56 − players × hand size).
  // The discard pile starts EMPTY: the first card only lands there when a player discards.
  state.drawPile = deck;
  state.discardPile = [];
  state.currentPlayerIndex = state.startingPlayerIndex % state.players.length;
  state.stage = { kind: 'draw' };
  state.kobuCallerId = null;
  state.highlights = [];
  state.lastResult = null;
  state.winnerIds = [];
  state.lastMatch = null;
  state.motions = [];
  state.phase = 'peeking';
  log(state, msg('log.round', { round: state.round, size: handSize, n: INITIAL_PEEKS }));
}

function endTurn(state: GameState) {
  state.stage = { kind: 'draw' };
  const next = (state.currentPlayerIndex + 1) % state.players.length;
  if (state.kobuCallerId && state.players[next].id === state.kobuCallerId) {
    endRound(state);
    return;
  }
  state.currentPlayerIndex = next;
}

/**
 * Round scoring.
 * Standing = (hand points, then number of cards): lower is better, fewer cards breaks ties.
 * - Caller strictly better than everyone → caller scores their hand (no penalty).
 * - Otherwise caller scores hand + 10, and the best-standing other player(s)
 *   score min(0, hand) – never punished for a negative hand.
 * - Everyone else scores their hand.
 */
export function scoreRound(
  players: Pick<Player, 'id' | 'name' | 'hand' | 'totalScore'>[],
  kobuCallerId: string | null,
  round: number,
  rules: ScoringRules,
): RoundResult {
  const stats = players.map((p) => {
    const cards = cardsIn(p.hand);
    return { p, cards, total: cards.reduce((s, c) => s + cardPoints(c, rules), 0), count: cards.length };
  });
  const better = (a: (typeof stats)[number], b: (typeof stats)[number]) =>
    a.total < b.total || (a.total === b.total && a.count < b.count);

  const caller = stats.find((s) => s.p.id === kobuCallerId);
  const others = stats.filter((s) => s !== caller);
  const callerSucceeded = !!caller && others.every((o) => better(caller, o));
  // Best standing among non-callers (used when the caller fails).
  const best = others.reduce<(typeof stats)[number] | null>((acc, s) => (!acc || better(s, acc) ? s : acc), null);

  const rows: RoundResultRow[] = stats.map((s) => {
    let roundScore = s.total;
    let penalty = false;
    let lowest = false;
    if (caller) {
      if (s === caller) {
        if (callerSucceeded) lowest = true;
        else {
          roundScore = s.total + KOBU_PENALTY;
          penalty = true;
        }
      } else if (!callerSucceeded && best && s.total === best.total && s.count === best.count) {
        roundScore = Math.min(0, s.total);
        lowest = true;
      }
    }
    return {
      playerId: s.p.id,
      name: s.p.name,
      cards: s.cards.map(faceOf),
      handTotal: s.total,
      roundScore,
      penalty,
      lowest,
      totalScore: s.p.totalScore + roundScore,
    };
  });
  return { round, kobuCallerId, callerSucceeded, rows };
}

function endRound(state: GameState) {
  const result = scoreRound(state.players, state.kobuCallerId, state.round, state.settings);
  for (const row of result.rows) mustPlayer(state, row.playerId).totalScore = row.totalScore;
  state.lastResult = result;
  state.highlights = [];
  state.stage = { kind: 'draw' };

  if (state.kobuCallerId) {
    const caller = mustPlayer(state, state.kobuCallerId).name;
    log(state, result.callerSucceeded ? msg('log.kobuOk', { name: caller }) : msg('log.kobuFail', { name: caller, penalty: KOBU_PENALTY }));
  }
  log(state, msg('log.roundOver', { round: state.round, list: result.rows.map((r) => `${r.name} ${r.roundScore >= 0 ? '+' : ''}${r.roundScore}`).join(', ') }));

  if (state.players.some((p) => p.totalScore >= state.settings.targetScore)) {
    const top = Math.min(...state.players.map((p) => p.totalScore));
    state.winnerIds = state.players.filter((p) => p.totalScore === top).map((p) => p.id);
    state.phase = 'gameOver';
    log(state, msg('log.gameOver', { names: nameList(state.winnerIds.map((id) => mustPlayer(state, id).name)) }));
  } else {
    state.phase = 'roundOver';
  }
}

/** Can this power step be done at all? (Hands can be empty after matching.) */
function stepPossible(state: GameState, actorId: string, step: PowerStep, peekedCount: number): boolean {
  const own = countCards(mustPlayer(state, actorId));
  const opp = state.players.filter((p) => p.id !== actorId).reduce((n, p) => n + countCards(p), 0);
  switch (step) {
    case 'peekOwn':
      return own > 0;
    case 'peekOpp':
      return opp > 0;
    case 'blindSwap':
      return own > 0 && opp > 0;
    case 'swapAny':
      return own + opp >= 2;
    case 'review':
      return peekedCount > 0;
  }
}

/** Skip impossible steps from the current one; finish the turn when none are left. Returns false if the turn ended. */
function settlePower(state: GameState): boolean {
  const stage = state.stage;
  if (stage.kind !== 'power') return false;
  const steps = POWER_STEPS[stage.power];
  const actorId = state.players[state.currentPlayerIndex].id;
  while (stage.step < steps.length && !stepPossible(state, actorId, steps[stage.step], stage.peeked.length)) stage.step += 1;
  if (stage.step >= steps.length) {
    endTurn(state);
    return false;
  }
  return true;
}

/** Move a power to its next step, or finish the turn after the last one. */
function advancePower(state: GameState) {
  const stage = state.stage;
  if (stage.kind !== 'power') return;
  stage.step += 1;
  settlePower(state);
}

// ── The reducer ─────────────────────────────────────────────────────────────

export function applyAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  rng: Rng = Math.random,
): void {
  const me = mustPlayer(state, playerId);
  const isHost = state.hostId === playerId;

  // ── Host / lifecycle actions ──
  switch (action.type) {
    case 'configure': {
      if (!isHost) throw new GameError('Only the host can change the rules');
      if (state.phase !== 'lobby' && state.phase !== 'gameOver') throw new GameError('Rules can only change before a game');
      const { handSize, aceValue } = action.settings ?? {};
      if (handSize !== undefined) {
        if (!HAND_SIZES.includes(handSize)) throw new GameError('Hand size must be 4 or 6');
        state.settings.handSize = handSize;
      }
      if (aceValue !== undefined) {
        if (aceValue !== 0 && aceValue !== 1) throw new GameError('Ace must be worth 0 or 1');
        state.settings.aceValue = aceValue;
      }
      return;
    }
    case 'addBot': {
      if (!isHost) throw new GameError('Only the host can add AI players');
      if (state.mode !== 'ai') throw new GameError('AI players are only available in Play with AI');
      if (state.phase !== 'lobby') throw new GameError('Add AI players before the game starts');
      const taken = new Set(state.players.map((p) => p.name));
      const name = BOT_NAMES.find((n) => !taken.has(n)) ?? `Bot ${state.players.length}`;
      let id: string;
      do id = `bot-${Math.floor(rng() * 36 ** 6).toString(36)}`;
      while (state.players.some((p) => p.id === id));
      addPlayer(state, id, name, true); // throws when the table is full
      return;
    }
    case 'removeBot': {
      if (!isHost) throw new GameError('Only the host can remove AI players');
      if (state.phase !== 'lobby') throw new GameError('AI players can only be removed before the game starts');
      const bot = state.players.find((p) => p.id === action.playerId);
      if (!bot?.isBot) throw new GameError('That is not an AI player');
      removePlayer(state, bot.id);
      return;
    }
    case 'startGame': {
      if (!isHost) throw new GameError('Only the host can start the game');
      if (state.phase !== 'lobby' && state.phase !== 'gameOver') throw new GameError('Game already running');
      if (state.players.length < MIN_PLAYERS) throw new GameError(`Need at least ${MIN_PLAYERS} players`);
      if (state.phase === 'gameOver') {
        state.players.forEach((p) => (p.totalScore = 0));
        state.round = 0;
      }
      beginStarterDraw(state, rng);
      return;
    }
    case 'pickStarter': {
      const sd = state.starterDraw;
      if (state.phase !== 'starterDraw' || !sd || sd.winnerId) throw new GameError('Not picking a starting card now');
      if (me.id in sd.picks) throw new GameError('You already took a card');
      if (!Number.isInteger(action.index) || action.index < 0 || action.index >= sd.offered.length) {
        throw new GameError('Invalid card');
      }
      if (Object.values(sd.picks).includes(action.index)) throw new GameError('Someone already took that card');
      sd.picks[me.id] = action.index;
      log(state, msg('log.tookCard', { name: me.name }), me.id);
      if (Object.keys(sd.picks).length === state.players.length) resolveStarterDraw(state, rng);
      return;
    }
    case 'autoPickStarter': {
      const sd = state.starterDraw;
      if (!isHost) throw new GameError('Only the host can pick for others');
      if (state.phase !== 'starterDraw' || !sd || sd.winnerId) throw new GameError('Not picking a starting card now');
      for (const p of state.players) {
        if (p.id in sd.picks) continue;
        const free = sd.offered.map((_, i) => i).filter((i) => !Object.values(sd.picks).includes(i));
        sd.picks[p.id] = free[Math.floor(rng() * free.length)];
        log(state, msg('log.tookFor', { name: p.name }));
      }
      resolveStarterDraw(state, rng);
      return;
    }
    case 'dealCards': {
      const sd = state.starterDraw;
      if (!isHost) throw new GameError('Only the host can deal');
      if (state.phase !== 'starterDraw' || !sd?.winnerId) throw new GameError('Finish choosing who goes first');
      // The offered cards simply go back: startRound shuffles a complete fresh deck.
      state.startingPlayerIndex = state.players.findIndex((p) => p.id === sd.winnerId);
      state.starterDraw = null;
      startRound(state, rng);
      return;
    }
    case 'nextRound': {
      if (!isHost) throw new GameError('Only the host can start the next round');
      if (state.phase !== 'roundOver') throw new GameError('Round is not over');
      state.startingPlayerIndex = (state.startingPlayerIndex + 1) % state.players.length;
      startRound(state, rng);
      return;
    }
    case 'initialPeek': {
      if (state.phase !== 'peeking') throw new GameError('Not the peeking phase');
      if (me.ready) throw new GameError('You are already ready');
      const card = cardIn(me, action.slot);
      if (me.initialPeeks.includes(action.slot)) return;
      if (me.initialPeeks.length >= INITIAL_PEEKS) throw new GameError(`You may only peek at ${cardsWord(INITIAL_PEEKS)}`);
      me.initialPeeks.push(action.slot);
      learn(card, me.id);
      return;
    }
    case 'ready': {
      if (state.phase !== 'peeking') throw new GameError('Not the peeking phase');
      if (me.initialPeeks.length < INITIAL_PEEKS) throw new GameError(`Peek at ${cardsWord(INITIAL_PEEKS)} first`);
      me.ready = true;
      log(state, msg('log.memorised', { name: me.name }), me.id);
      if (state.players.every((p) => p.ready)) {
        state.phase = 'playing';
        log(state, msg('log.letsPlay', { name: state.players[state.currentPlayerIndex].name }));
      }
      return;
    }
    case 'snapDiscard': {
      // Snap: any player, any time during play (not while someone is mid-power),
      // drops a hand card of the same rank onto the top of the discard pile.
      if (state.phase !== 'playing') throw new GameError('You can only snap during play');
      if (state.stage.kind === 'power') throw new GameError('Wait until the current power is finished');
      const top = state.discardPile.at(-1);
      if (!top) throw new GameError('The discard pile is empty');
      if (!action.expect || !sameFace(action.expect, top)) throw new GameError('The discard pile just changed, try again');
      const target = action.target;
      const card = cardAtRef(state, target);
      const owner = mustPlayer(state, target.playerId);
      const own = owner.id === me.id;
      const slotText = msg('ref.plain', { slot: target.slot + 1 });
      makePublic(state, card); // revealed to everyone either way
      state.highlights = [];

      if (own) {
        if (card.rank === top.rank) {
          me.hand[target.slot] = null;
          trimGaps(me);
          state.discardPile.push(card);
          state.lastMatch = { seq: state.logSeq + 1, kind: 'snap', playerId: me.id, byPlayerId: me.id, slot: target.slot, faces: [faceOf(card)] };
          log(state, msg('log.snapOk', { name: me.name, card: cardLabel(card), ref: slotText, top: cardLabel(top), n: countCards(me) }), me.id);
        } else {
          state.highlights = [{ ...target }];
          const penalty = givePenaltyCard(state, me, rng);
          log(state, msg('log.snapFail', { name: me.name, top: cardLabel(top), ref: slotText, card: cardLabel(card), penalty, n: countCards(me) }), me.id);
        }
        return;
      }

      // Out-slam: an OPPONENT's card.
      if (card.rank === top.rank) {
        // Correct: their card goes on the pile and they get a replacement from the draw pile,
        // face-down in the same spot – nobody (not even the owner) has seen it.
        state.discardPile.push(card);
        owner.hand[target.slot] = null;
        let replaced = false;
        try {
          ensureDrawPile(state, rng);
          const replacement = state.drawPile.pop()!;
          replacement.knownBy = [];
          owner.hand[target.slot] = replacement;
          // The replacement flies in from the draw pile once the slammed card has landed.
          motion(state, { kind: 'toHand', from: 'deck', to: { ...target }, delayMs: 650 });
          replaced = true;
        } catch (e) {
          if (!(e instanceof GameError)) throw e;
          trimGaps(owner);
        }
        if (replaced) state.highlights = [{ ...target }];
        state.lastMatch = { seq: state.logSeq + 1, kind: 'slam', playerId: owner.id, byPlayerId: me.id, slot: target.slot, faces: [faceOf(card)] };
        log(
          state,
          msg('log.slamOk', {
            name: me.name,
            owner: owner.name,
            ref: slotText,
            card: cardLabel(card),
            top: cardLabel(top),
            after: replaced ? msg('log.slamReplaced', { owner: owner.name }) : msg('log.slamNoReplacement'),
          }),
          me.id,
        );
      } else {
        // Wrong: their card is flipped back face-down in place; the GUESSER takes the penalty.
        state.highlights = [{ ...target }];
        const penalty = givePenaltyCard(state, me, rng);
        log(
          state,
          msg('log.slamFail', { name: me.name, owner: owner.name, ref: slotText, card: cardLabel(card), rank: top.rank, penalty, n: countCards(me) }),
          me.id,
        );
      }
      return;
    }
    case 'reorder': {
      // Bluff: swap two of your own spots, face-down, any time during play.
      if (state.phase !== 'playing') throw new GameError('You can only rearrange your cards during play');
      const { from, to } = action;
      const valid = (i: unknown) => Number.isInteger(i) && (i as number) >= 0 && (i as number) < me.hand.length;
      if (!valid(from) || !valid(to) || from === to) throw new GameError('Invalid card slot');
      const moving = cardIn(me, from);
      const other = me.hand[to];
      me.hand[from] = other;
      me.hand[to] = moving;
      trimGaps(me);
      // Everyone saw the cards move but loses track of WHICH card is which: other players'
      // (and bots') memory of these cards is wiped. The owner keeps what they knew.
      for (const c of [moving, other]) if (c) c.knownBy = c.knownBy.includes(me.id) ? [me.id] : [];
      state.highlights = state.highlights.filter((h) => h.playerId !== me.id);
      motion(state, { kind: 'swap', a: { playerId: me.id, slot: from }, b: { playerId: me.id, slot: to }, by: me.id });
      // One log line per burst of rearranging, not one per drag.
      const prev = state.log.at(-1);
      if (!(prev?.msg.key === 'log.reorder' && prev.playerId === me.id)) log(state, msg('log.reorder', { name: me.name }), me.id);
      return;
    }
    case 'skipTurn': {
      if (!isHost) throw new GameError('Only the host can skip a turn');
      if (state.phase !== 'playing') throw new GameError('No turn to skip');
      const cur = state.players[state.currentPlayerIndex];
      if (cur.connected) throw new GameError(`${cur.name} is still connected`);
      if (state.stage.kind === 'decideDrawn') {
        makePublic(state, state.stage.card);
        state.discardPile.push(state.stage.card);
        motion(state, { kind: 'toPile', from: 'drawn', face: faceOf(state.stage.card), pileIndex: pileTop(state) });
      }
      log(state, msg('log.skipped', { name: me.name, other: cur.name }));
      endTurn(state);
      return;
    }
  }

  // ── Turn actions ──
  if (state.phase !== 'playing') throw new GameError('The round is not in progress');
  if (state.players[state.currentPlayerIndex].id !== playerId) throw new GameError("It's not your turn");
  const stage = state.stage;

  switch (action.type) {
    // There is deliberately no way to take a card from the discard pile:
    // a turn is always "draw from the pile" or "call Kobu".
    case 'drawDeck': {
      if (stage.kind !== 'draw') throw new GameError('You already drew');
      ensureDrawPile(state, rng);
      const card = state.drawPile.pop()!;
      learn(card, me.id);
      motion(state, { kind: 'draw', playerId: me.id });
      state.stage = { kind: 'decideDrawn', card };
      state.highlights = [];
      log(state, msg('log.drew', { name: me.name }), me.id);
      return;
    }

    case 'swapDrawn': {
      if (stage.kind !== 'decideDrawn') throw new GameError('Draw a card first');
      const old = cardIn(me, action.slot);
      me.hand[action.slot] = stage.card;
      makePublic(state, old);
      state.discardPile.push(old);
      // The old card arcs onto the pile while the drawn card slides into its spot.
      motion(state, { kind: 'toPile', from: { playerId: me.id, slot: action.slot }, face: faceOf(old), pileIndex: pileTop(state) });
      motion(state, { kind: 'toHand', from: 'drawn', to: { playerId: me.id, slot: action.slot } });
      state.highlights = [{ playerId: me.id, slot: action.slot }];
      log(state, msg('log.kept', { name: me.name, slot: action.slot + 1, card: cardLabel(old) }), me.id);
      // The hand is updated right away; the turn continues with an optional combo step.
      state.stage = { kind: 'combo', placedSlot: action.slot };
      return;
    }

    case 'comboMatch': {
      if (stage.kind !== 'combo') throw new GameError('Combos are only possible right after swapping a drawn card in');
      const slots = [...new Set(action.slots ?? [])].sort((a, b) => a - b);
      if (!slots.length) throw new GameError('Pick at least one card');
      const cards = slots.map((slot) => cardIn(me, slot));
      const top = state.discardPile.at(-1);
      const rank = cards[0].rank;
      const allSame = cards.every((c) => c.rank === rank);
      // 2+ cards match each other; a single card (or several) may also match the top discard.
      const ok = allSame && (cards.length >= 2 || top?.rank === rank);
      const labels = cards.map(cardLabel).join(' + ');
      const where = slots.map((s) => `#${s + 1}`).join(', ');
      cards.forEach((c) => makePublic(state, c)); // revealed to everyone either way
      if (ok) {
        for (const [i, slot] of slots.entries()) {
          me.hand[slot] = null;
          state.discardPile.push(cards[i]);
        }
        trimGaps(me);
        state.highlights = [];
        state.lastMatch = { seq: state.logSeq + 1, kind: 'combo', playerId: me.id, byPlayerId: me.id, slot: slots[0], slots, faces: cards.map(faceOf) };
        const onto = top?.rank === rank ? msg('log.ontoTop', { top: cardLabel(top) }) : '';
        log(state, msg('log.comboOk', { name: me.name, cards: labels, where, onto, n: countCards(me) }), me.id);
        if (countCards(me) === 0) endTurn(state); // nothing left to combo with
      } else {
        state.highlights = slots.map((slot) => ({ playerId: me.id, slot }));
        const reason = !allSame ? msg('log.reasonNotSame') : msg('log.reasonNotTop', { top: top ? cardLabel(top) : '–' });
        const penalty = givePenaltyCard(state, me, rng);
        log(state, msg('log.comboFail', { name: me.name, cards: labels, where, reason, penalty, n: countCards(me) }), me.id);
        endTurn(state);
      }
      return;
    }

    case 'finishTurn': {
      if (stage.kind !== 'combo') throw new GameError('Nothing to finish');
      endTurn(state);
      return;
    }

    case 'discardDrawn': {
      if (stage.kind !== 'decideDrawn') throw new GameError('Draw a card first');
      const card = stage.card;
      makePublic(state, card);
      state.discardPile.push(card);
      motion(state, { kind: 'toPile', from: 'drawn', face: faceOf(card), pileIndex: pileTop(state) });
      const power = cardPower(card);
      if (power) {
        state.stage = { kind: 'power', power, card, step: 0, peeked: [] };
        log(state, msg('log.discardPower', { name: me.name, card: cardLabel(card), power: msg(`power.${power}.name`) }), me.id);
        if (!settlePower(state)) log(state, msg('log.noTargets'), me.id);
      } else {
        log(state, msg('log.discarded', { name: me.name, card: cardLabel(card) }), me.id);
        endTurn(state);
      }
      return;
    }

    case 'matchDrawn': {
      // Match / Snap: claim that your card at `slot` has the same rank as the drawn card.
      if (stage.kind !== 'decideDrawn') throw new GameError('Draw a card first');
      const mine = cardIn(me, action.slot);
      const drawn = stage.card;
      makePublic(state, mine); // it's revealed to everyone either way
      makePublic(state, drawn);
      state.highlights = [];
      if (mine.rank === drawn.rank) {
        // Success: both cards go to the discard pile (no power) and the hand shrinks by one.
        me.hand[action.slot] = null;
        trimGaps(me);
        state.discardPile.push(drawn, mine);
        state.lastMatch = { seq: state.logSeq + 1, kind: 'match', playerId: me.id, byPlayerId: me.id, slot: action.slot, faces: [faceOf(drawn), faceOf(mine)] };
        log(state, msg('log.matchOk', { name: me.name, drawn: cardLabel(drawn), card: cardLabel(mine), slot: action.slot + 1, n: countCards(me) }), me.id);
      } else {
        // Miss: the revealed card goes back face-down in its place, the drawn card is
        // discarded (no power), and a face-down penalty card joins the hand.
        state.discardPile.push(drawn);
        motion(state, { kind: 'toPile', from: 'drawn', face: faceOf(drawn), pileIndex: pileTop(state) });
        state.highlights = [{ playerId: me.id, slot: action.slot }];
        const penalty = givePenaltyCard(state, me, rng);
        log(
          state,
          msg('log.matchFail', { name: me.name, drawn: cardLabel(drawn), slot: action.slot + 1, card: cardLabel(mine), penalty, n: countCards(me) }),
          me.id,
        );
      }
      endTurn(state);
      return;
    }

    case 'callKobu': {
      if (stage.kind !== 'draw') throw new GameError('You can only call Kobu instead of drawing');
      if (state.kobuCallerId) throw new GameError('Kobu has already been called');
      state.kobuCallerId = me.id;
      state.highlights = [];
      log(state, msg('log.kobu', { name: me.name }), me.id);
      endTurn(state);
      return;
    }

    case 'peek': {
      if (stage.kind !== 'power') throw new GameError('No power in use');
      const step = POWER_STEPS[stage.power][stage.step];
      if (step !== 'peekOwn' && step !== 'peekOpp') throw new GameError('This step is not a peek');
      const card = cardAtRef(state, action.target);
      const own = action.target.playerId === me.id;
      if (step === 'peekOwn' && !own) throw new GameError('Pick one of YOUR cards');
      if (step === 'peekOpp' && own) throw new GameError("Pick an opponent's card");
      learn(card, me.id);
      stage.peeked.push({ ref: { ...action.target }, cardId: card.id, face: faceOf(card) });
      state.highlights = [{ ...action.target }];
      log(state, msg('log.peeked', { name: me.name, ref: describe(state, me.id, action.target) }), me.id);
      advancePower(state);
      return;
    }

    case 'swap': {
      if (stage.kind !== 'power') throw new GameError('No power in use');
      const step = POWER_STEPS[stage.power][stage.step];
      if (step !== 'blindSwap' && step !== 'swapAny') throw new GameError('This step is not a swap');
      cardAtRef(state, action.a);
      cardAtRef(state, action.b);
      if (sameSlot(action.a, action.b)) throw new GameError('Pick two different cards');
      if (step === 'blindSwap') {
        const ownCount = [action.a, action.b].filter((r) => r.playerId === me.id).length;
        if (ownCount !== 1) throw new GameError('Blind swap: pick one of your cards and one opponent card');
      }
      swapSlots(state, action.a, action.b);
      motion(state, { kind: 'swap', a: { ...action.a }, b: { ...action.b } });
      state.highlights = [{ ...action.a }, { ...action.b }];
      log(state, msg('log.swapped', { name: me.name, a: describe(state, me.id, action.a), b: describe(state, me.id, action.b) }), me.id);
      advancePower(state);
      return;
    }

    case 'skipPower': {
      if (stage.kind !== 'power') throw new GameError('No power in use');
      const step = POWER_STEPS[stage.power][stage.step];
      log(state, msg(step === 'swapAny' ? 'log.noSwap' : 'log.skipPower', { name: me.name }), me.id);
      endTurn(state);
      return;
    }

    case 'endPeek': {
      if (stage.kind !== 'power' || POWER_STEPS[stage.power][stage.step] !== 'review') throw new GameError('Nothing to close');
      endTurn(state);
      return;
    }

    default:
      throw new GameError('Unknown action');
  }
}
