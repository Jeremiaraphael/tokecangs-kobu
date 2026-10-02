import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameAction, GameMode, PlayerView } from '../../shared/types';
import { getToken, socket } from '../socket';

type Result = { ok: true; code?: string } | { ok: false; error: string };

/** Single source of truth for the client: the server-sent view + action senders. */
export function useKobu() {
  const [view, setView] = useState<PlayerView | null>(null);
  const [connected, setConnected] = useState(socket.connected);
  const [resuming, setResuming] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const errorTimer = useRef<number>();

  const flashError = useCallback((msg: string) => {
    setError(msg);
    window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(null), 3500);
  }, []);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      // Reclaim our seat if this browser was already in a room.
      socket.emit('room:resume', { token: getToken() }, (res) => {
        if (!res.ok) setView(null);
        setResuming(false);
      });
    };
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('state', setView);
    if (socket.connected) onConnect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('state', setView);
    };
  }, []);

  const handle = useCallback(
    (res: Result) => {
      if (!res.ok) flashError(res.error);
      return res.ok;
    },
    [flashError],
  );

  const createRoom = useCallback(
    (name: string, mode: GameMode = 'multiplayer') =>
      new Promise<boolean>((resolve) =>
        socket.emit('room:create', { name, token: getToken(), mode }, (res) => resolve(handle(res))),
      ),
    [handle],
  );

  const joinRoom = useCallback(
    (code: string, name: string) =>
      new Promise<boolean>((resolve) =>
        socket.emit('room:join', { code, name, token: getToken() }, (res) => resolve(handle(res))),
      ),
    [handle],
  );

  const leaveRoom = useCallback(() => {
    socket.emit('room:leave');
    setView(null);
  }, []);

  const act = useCallback(
    (action: GameAction) => socket.emit('game:action', action, (res) => handle(res)),
    [handle],
  );

  return { view, connected, resuming, error, flashError, createRoom, joinRoom, leaveRoom, act };
}

export type KobuApi = ReturnType<typeof useKobu>;
