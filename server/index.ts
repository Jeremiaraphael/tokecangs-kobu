import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import { Server, type Socket } from 'socket.io';
import { GameError } from '../shared/engine';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types';
import { toPlayerView } from '../shared/view';
import { RoomManager, type Session } from './rooms';

type SocketData = { token?: string };
type KobuSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const PORT = Number(process.env.PORT ?? 3001);
const app = express();
const http = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(http, {
  cors: { origin: process.env.CORS_ORIGIN ?? '*' },
});
const rooms = new RoomManager((code) => broadcast(code));

// Serve the built client in production (`npm run build && npm start`).
const dist = path.resolve(process.cwd(), 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const playerChannel = (playerId: string) => `player:${playerId}`;

/** Send every player in the room their own sanitized view, then let any AI player take its turn. */
function broadcast(code: string | null) {
  if (!code) return;
  const state = rooms.getState(code);
  if (!state) return;
  for (const p of state.players) if (!p.isBot) io.to(playerChannel(p.id)).emit('state', toPlayerView(state, p.id));
  rooms.scheduleBots(code);
}

function attach(socket: KobuSocket, session: Session) {
  for (const ch of socket.rooms) if (ch.startsWith('player:')) socket.leave(ch);
  socket.data.token = session.token;
  socket.join(playerChannel(session.playerId));
  rooms.setConnected(session, true);
}

function cleanName(name: unknown) {
  const n = String(name ?? '').trim().slice(0, 20);
  if (!n) throw new GameError('Please enter a name');
  return n;
}

function cleanToken(token: unknown) {
  if (typeof token !== 'string' || token.length < 16 || token.length > 128) throw new GameError('Bad session token');
  return token;
}

function errorMessage(e: unknown) {
  if (e instanceof GameError) return e.message;
  console.error(e);
  return 'Server error';
}

io.on('connection', (socket: KobuSocket) => {
  socket.on('room:create', ({ name, token, mode }, ack) => {
    try {
      const prev = rooms.getSession(cleanToken(token))?.code ?? null;
      const session = rooms.create(token, cleanName(name), mode === 'ai' ? 'ai' : 'multiplayer');
      attach(socket, session);
      ack({ ok: true, code: session.code });
      broadcast(prev);
      broadcast(session.code);
    } catch (e) {
      ack({ ok: false, error: errorMessage(e) });
    }
  });

  socket.on('room:join', ({ code, name, token }, ack) => {
    try {
      const prev = rooms.getSession(cleanToken(token))?.code ?? null;
      const session = rooms.join(token, String(code ?? ''), cleanName(name));
      attach(socket, session);
      ack({ ok: true, code: session.code });
      if (prev && prev !== session.code) broadcast(prev);
      broadcast(session.code);
    } catch (e) {
      ack({ ok: false, error: errorMessage(e) });
    }
  });

  socket.on('room:resume', ({ token }, ack) => {
    try {
      const session = rooms.getSession(cleanToken(token));
      if (!session || !rooms.getState(session.code)) throw new GameError('No room to resume');
      attach(socket, session);
      ack({ ok: true, code: session.code });
      broadcast(session.code);
    } catch (e) {
      ack({ ok: false, error: errorMessage(e) });
    }
  });

  socket.on('room:leave', () => {
    const token = socket.data.token;
    if (!token) return;
    const session = rooms.getSession(token);
    if (session) socket.leave(playerChannel(session.playerId));
    socket.data.token = undefined;
    broadcast(rooms.leave(token));
  });

  socket.on('game:action', (action, ack) => {
    try {
      const session = socket.data.token ? rooms.getSession(socket.data.token) : undefined;
      if (!session) throw new GameError('You are not in a room');
      rooms.act(session, action);
      ack({ ok: true });
      broadcast(session.code);
    } catch (e) {
      ack({ ok: false, error: errorMessage(e) });
    }
  });

  socket.on('disconnect', async () => {
    const token = socket.data.token;
    const session = token ? rooms.getSession(token) : undefined;
    if (!session) return;
    // Another tab of the same player may still be connected.
    const stillHere = await io.in(playerChannel(session.playerId)).fetchSockets();
    if (stillHere.length) return;
    rooms.setConnected(session, false);
    broadcast(session.code);
  });
});

setInterval(() => rooms.sweep(), 60_000).unref();

http.listen(PORT, () => console.log(`Kobu server listening on http://localhost:${PORT}`));
