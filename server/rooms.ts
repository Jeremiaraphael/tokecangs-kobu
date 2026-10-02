// In-memory room + session registry. One GameState per room; one session per
// browser (identified by a secret token kept in localStorage, so a refresh or
// dropped connection lets the player reclaim their seat).
// AI players are seats in the same GameState; this module schedules their moves.
import { randomInt, randomUUID } from 'node:crypto';
import { nextBotMove } from '../shared/ai';
import { GameError, addPlayer, applyAction, createGame, removePlayer, setConnected } from '../shared/engine';
import type { GameAction, GameMode, GameState } from '../shared/types';

export interface Session {
  token: string;
  playerId: string;
  code: string;
}

interface Room {
  state: GameState;
  emptySince: number | null;
  botTimer: ReturnType<typeof setTimeout> | null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 30 * 60 * 1000;
const rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** Bots "think" for a moment so humans can follow the log: 1–2 s on turns, quicker for setup steps. */
function botDelay(state: GameState) {
  return state.phase === 'playing' ? 1000 + randomInt(1000) : 400 + randomInt(400);
}

/** If a bot's chosen move is rejected (shouldn't happen), these always-safe moves keep the game going. */
const FALLBACK_MOVES: GameAction[] = [{ type: 'endPeek' }, { type: 'skipPower' }, { type: 'discardDrawn' }, { type: 'drawDeck' }, { type: 'ready' }];

export class RoomManager {
  private rooms = new Map<string, Room>();
  private sessions = new Map<string, Session>();

  /** `onChange` is called after a bot moves, so the server can broadcast the new state. */
  constructor(private onChange: (code: string) => void = () => {}) {}

  getState(code: string): GameState | undefined {
    return this.rooms.get(code)?.state;
  }

  getSession(token: string): Session | undefined {
    return this.sessions.get(token);
  }

  create(token: string, name: string, mode: GameMode = 'multiplayer'): Session {
    this.leave(token);
    let code: string;
    do {
      code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const playerId = randomUUID();
    const state = createGame(code, { id: playerId, name }, {}, mode);
    if (mode === 'ai') applyAction(state, playerId, { type: 'addBot' }, rng); // start with one opponent
    this.rooms.set(code, { state, emptySince: null, botTimer: null });
    return this.track({ token, playerId, code });
  }

  join(token: string, rawCode: string, name: string): Session {
    const code = rawCode.trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new GameError('Room not found');
    const existing = this.sessions.get(token);
    if (existing?.code === code) return existing; // same browser re-joining: just resume
    if (room.state.mode === 'ai') throw new GameError('That is a single-player game against AI');
    const sameName = room.state.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (sameName) {
      if (sameName.connected) throw new GameError('That name is taken in this room');
      // Reclaim the seat of a disconnected player (e.g. lost phone / cleared storage).
      for (const [t, s] of this.sessions) if (s.playerId === sameName.id) this.sessions.delete(t);
      this.leave(token);
      return this.track({ token, playerId: sameName.id, code });
    }
    const playerId = randomUUID();
    addPlayer(room.state, playerId, name); // throws if full / in progress
    this.leave(token);
    return this.track({ token, playerId, code });
  }

  leave(token: string): string | null {
    const s = this.sessions.get(token);
    if (!s) return null;
    this.sessions.delete(token);
    const room = this.rooms.get(s.code);
    if (!room) return null;
    if (room.state.phase === 'lobby') removePlayer(room.state, s.playerId);
    else setConnected(room.state, s.playerId, false);
    // An empty room, or an AI game whose human left, is closed straight away.
    // (Multiplayer seats stay reserved for reconnecting friends until the sweep.)
    const humanStillHere = room.state.players.some((p) => !p.isBot && (room.state.phase === 'lobby' || p.connected));
    if (!room.state.players.length || (room.state.mode === 'ai' && !humanStillHere)) {
      this.deleteRoom(s.code);
      return null;
    }
    return s.code;
  }

  setConnected(session: Session, connected: boolean) {
    const room = this.rooms.get(session.code);
    if (!room) return;
    setConnected(room.state, session.playerId, connected);
    room.emptySince = room.state.players.some((p) => p.connected && !p.isBot) ? null : Date.now();
  }

  /** Apply on a clone so an invalid move can never corrupt the real state. */
  act(session: Session, action: GameAction) {
    const room = this.rooms.get(session.code);
    if (!room) throw new GameError('Room no longer exists');
    const next = structuredClone(room.state);
    applyAction(next, session.playerId, action, rng);
    room.state = next;
  }

  /**
   * Make sure the next bot move (if any) is queued. Call after every state change.
   * One pending bot move per room; the move is re-decided against the latest
   * state when the timer fires.
   */
  scheduleBots(code: string) {
    const room = this.rooms.get(code);
    if (!room || room.botTimer || !nextBotMove(room.state, rng)) return;
    room.botTimer = setTimeout(() => {
      room.botTimer = null;
      if (this.rooms.get(code) !== room) return; // room was closed meanwhile
      const move = nextBotMove(room.state, rng);
      if (!move) return;
      if (!this.tryBotMove(room, move.botId, move.action)) {
        console.error(`[bot] ${move.botId} could not play ${JSON.stringify(move.action)}; using a fallback`);
        FALLBACK_MOVES.some((a) => this.tryBotMove(room, move.botId, a));
      }
      this.onChange(code); // broadcasts, which schedules the following bot move
    }, botDelay(room.state));
  }

  private tryBotMove(room: Room, botId: string, action: GameAction): boolean {
    try {
      const next = structuredClone(room.state);
      applyAction(next, botId, action, rng);
      room.state = next;
      return true;
    } catch {
      return false;
    }
  }

  sweep() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.emptySince && now - room.emptySince > ROOM_TTL_MS) this.deleteRoom(code);
    }
  }

  private deleteRoom(code: string) {
    const room = this.rooms.get(code);
    if (room?.botTimer) clearTimeout(room.botTimer);
    this.rooms.delete(code);
    for (const [t, s] of this.sessions) if (s.code === code) this.sessions.delete(t);
  }

  private track(s: Session): Session {
    this.sessions.set(s.token, s);
    return s;
  }
}
