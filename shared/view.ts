// Builds the sanitized, per-player view of the game. This is the ONLY thing the
// server ever sends to a client, so hidden cards never leave the server.
import {
  POWER_STEPS,
  type Card,
  type CardFace,
  type CardView,
  type GameState,
  type PlayerView,
  type StageView,
  type StarterDrawView,
} from './types';

const LOG_TAIL = 80;
const faceOf = (c: Card): CardFace => ({ rank: c.rank, suit: c.suit });

export function toPlayerView(state: GameState, viewerId: string): PlayerView {
  const revealAll = state.phase === 'roundOver' || state.phase === 'gameOver';
  const playing = state.phase === 'playing';
  const current = playing ? state.players[state.currentPlayerIndex] : null;
  const myTurn = current?.id === viewerId;
  const stage = state.stage;
  const nameById = new Map(state.players.map((p) => [p.id, p.name]));

  // Cards the viewer is privately looking at via the power they're using (by card, so a
  // card rearranged by its owner stays visible and nothing else becomes visible).
  const peekedByMe = new Set(myTurn && stage.kind === 'power' ? stage.peeked.map((p) => p.cardId) : []);
  const whereIs = (cardId: string) => {
    for (const p of state.players) {
      const slot = p.hand.findIndex((c) => c?.id === cardId);
      if (slot >= 0) return { playerId: p.id, slot };
    }
    return null;
  };

  const cardView = (card: Card, ownerId: string, slot: number, initialPeek: boolean): CardView => {
    const visible =
      revealAll || initialPeek || peekedByMe.has(card.id);
    return {
      face: visible ? faceOf(card) : undefined,
      knownByMe: card.knownBy.includes(viewerId),
      seenBy: card.knownBy.filter((id) => id !== viewerId).map((id) => nameById.get(id) ?? '?'),
      highlighted: state.highlights.some((h) => h.playerId === ownerId && h.slot === slot),
    };
  };

  const players = state.players.map((p) => {
    const peeking = state.phase === 'peeking' && p.id === viewerId && !p.ready;
    return {
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      connected: p.connected,
      ready: p.ready,
      totalScore: p.totalScore,
      hand: p.hand.map((c, i) => (c ? cardView(c, p.id, i, peeking && p.initialPeeks.includes(i)) : null)),
    };
  });

  let stageView: StageView;
  switch (stage.kind) {
    case 'draw':
      stageView = { kind: 'draw' };
      break;
    case 'decideDrawn':
      stageView = { kind: 'decideDrawn', face: myTurn ? faceOf(stage.card) : undefined };
      break;
    case 'combo':
      stageView = { kind: 'combo', placedSlot: stage.placedSlot };
      break;
    case 'power': {
      const steps = POWER_STEPS[stage.power];
      stageView = {
        kind: 'power',
        power: stage.power,
        face: faceOf(stage.card), // already face-up on the discard pile
        step: steps[stage.step],
        stepIndex: stage.step,
        stepCount: steps.length,
        peeked: stage.peeked.map((p) => ({ ref: whereIs(p.cardId) ?? p.ref, face: myTurn ? p.face : undefined })),
      };
      break;
    }
  }

  const sd = state.starterDraw;
  const starterDraw: StarterDrawView | null = sd
    ? {
        // Faces stay hidden until everyone has picked (winner decided).
        offered: sd.offered.map((c, i) => ({
          takenBy: Object.keys(sd.picks).find((id) => sd.picks[id] === i) ?? null,
          face: sd.winnerId ? faceOf(c) : undefined,
        })),
        redraws: sd.redraws.map((round) => round.map((r) => ({ playerId: r.playerId, face: faceOf(r.card) }))),
        winnerId: sd.winnerId,
      }
    : null;

  const top = state.discardPile.at(-1);
  return {
    roomCode: state.roomCode,
    mode: state.mode,
    you: viewerId,
    hostId: state.hostId,
    phase: state.phase,
    settings: state.settings,
    round: state.round,
    players,
    drawPileCount: state.drawPile.length,
    discardTop: top ? faceOf(top) : null,
    discardStack: state.discardPile.slice(-3).map(faceOf),
    lastMatch: state.lastMatch,
    motions: state.motions,
    discardCount: state.discardPile.length,
    currentPlayerId: current?.id ?? null,
    stage: stageView,
    kobuCallerId: state.kobuCallerId,
    log: state.log.slice(-LOG_TAIL),
    lastResult: state.lastResult,
    winnerIds: state.winnerIds,
    starterDraw,
  };
}
