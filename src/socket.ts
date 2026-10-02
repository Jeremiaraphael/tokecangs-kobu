import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types';

// Same origin: Vite proxies /socket.io to the game server in dev, and the game
// server serves the built client in production.
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  transports: ['websocket', 'polling'],
});

const TOKEN_KEY = 'kobu.token';
let memoryToken: string | null = null;

/** Secret per-browser token that lets a player reclaim their seat after a refresh. */
export function getToken(): string {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) return saved;
  } catch {
    /* storage unavailable */
  }
  if (!memoryToken) {
    // getRandomValues works on plain-http LAN addresses, unlike randomUUID.
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    memoryToken = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  try {
    localStorage.setItem(TOKEN_KEY, memoryToken);
  } catch {
    /* ignore */
  }
  return memoryToken;
}
