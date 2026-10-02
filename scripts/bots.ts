// Test bots: fill a room with simple computer players so you can try the game alone.
//   npm run bots -- <ROOM_CODE> [count=2] [server=http://localhost:3001]
import { randomBytes } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { INITIAL_PEEKS, cardPoints, cardPower, type ClientToServerEvents, type GameAction, type PlayerView, type ServerToClientEvents, type SlotRef } from '../shared/types';

const [code, countArg = '2', url = 'http://localhost:3001'] = process.argv.slice(2);
if (!code) {
  console.error('Usage: npm run bots -- <ROOM_CODE> [count] [server-url]');
  process.exit(1);
}

const rnd = (n: number) => Math.floor(Math.random() * n);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function startBot(name: string) {
  const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, { transports: ['websocket'] });
  const token = randomBytes(24).toString('hex');
  let busy = false;
  let latest: PlayerView | null = null;

  const act = (a: GameAction) => new Promise<void>((r) => socket.emit('game:action', a, () => r()));

  async function think() {
    if (busy || !latest) return;
    busy = true;
    try {
      while (latest) {
        const v: PlayerView = latest;
        const me = v.players.find((p) => p.id === v.you)!;
        // Only target real cards, never the gaps left by matched cards.
        const cardSlots = (p: PlayerView['players'][number]) => p.hand.flatMap((c, i) => (c ? [i] : []));
        const randomCardOf = (p: PlayerView['players'][number]): SlotRef => {
          const slots = cardSlots(p);
          return { playerId: p.id, slot: slots[rnd(slots.length)] };
        };
        const opp = () => {
          const others = v.players.filter((p) => p.id !== v.you && cardSlots(p).length);
          return randomCardOf(others[rnd(others.length)]);
        };
        let a: GameAction | null = null;
        const mine = (): SlotRef => randomCardOf(me);
        const size = cardSlots(me).length;
        if (v.phase === 'starterDraw' && v.starterDraw && !v.starterDraw.winnerId) {
          const sd = v.starterDraw;
          const free = sd.offered.map((o, i) => (o.takenBy ? -1 : i)).filter((i) => i >= 0);
          if (!sd.offered.some((o) => o.takenBy === v.you) && free.length) a = { type: 'pickStarter', index: free[rnd(free.length)] };
        } else if (v.phase === 'peeking' && !me.ready) {
          const peeked = me.hand.filter((c) => c?.face).length;
          a = peeked < INITIAL_PEEKS ? { type: 'initialPeek', slot: peeked } : { type: 'ready' };
        } else if (v.phase === 'playing' && v.currentPlayerId === v.you) {
          const s = v.stage;
          if (s.kind === 'draw') a = !v.kobuCallerId && Math.random() < 0.08 ? { type: 'callKobu' } : { type: 'drawDeck' };
          else if (s.kind === 'decideDrawn')
            // Keep low cards; throw away high ones (using their power if they have one).
            a = size && cardPoints(s.face!, v.settings) <= 4 && !cardPower(s.face!) ? { type: 'swapDrawn', slot: mine().slot } : { type: 'discardDrawn' };
          else if (s.kind === 'combo') a = { type: 'finishTurn' };
          else if (s.kind === 'power') {
            if (s.step === 'peekOwn') a = { type: 'peek', target: mine() };
            else if (s.step === 'peekOpp') a = { type: 'peek', target: opp() };
            else if (s.step === 'review') a = { type: 'endPeek' };
            else if (s.step === 'blindSwap') a = { type: 'swap', a: mine(), b: opp() };
            else a = Math.random() < 0.5 ? { type: 'swap', a: opp(), b: mine() } : { type: 'skipPower' };
          }
        }
        if (!a) break;
        await sleep(700 + rnd(600));
        await act(a);
        await sleep(100); // let the new state arrive before deciding again
      }
    } finally {
      busy = false;
    }
  }

  socket.on('state', (v) => {
    latest = v;
    void think();
  });
  socket.on('connect', () => {
    socket.emit('room:join', { code, name, token }, (res) => {
      console.log(res.ok ? `${name} joined ${res.code}` : `${name} could not join: ${res.error}`);
      if (!res.ok) socket.disconnect();
    });
  });
}

for (let i = 1; i <= Number(countArg); i++) startBot(`Bot ${i}`);
