// Replays the server's card movements as "flights": a card overlay that travels from
// one spot on the board to another (Web Animations API, see FlyingCards.tsx).
//
//   draw    draw pile → "drawn" spot (face-down)
//   toPile  hand spot / drawn spot → discard pile, landing with a little tilt
//   toHand  draw pile / drawn spot → hand spot (face-down: swaps, penalties, replacements)
//   swap    two cards cross-slide between their spots
//   match / snap / slam / combo (view.lastMatch) → cards drop onto the pile with an impact pop
//
// While a card is in the air its destination is hidden (pile index / hand spot / drawn spot),
// so the board never shows a card "before it arrives".
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CardFace, MatchEvent, MotionEvent, PlayerView, SlotRef } from '../../shared/types';

export type FlightStyle = 'slide' | 'arc' | 'impact';

export interface Flight {
  key: string;
  /** Flights of one event; the combo burst plays when a match group has fully landed. */
  group: string;
  face?: CardFace; // undefined = face-down
  from: DOMRect;
  to: DOMRect;
  delay: number;
  duration: number;
  style: FlightStyle;
  /** Final transform at the destination (e.g. the pile's offset + tilt). */
  end: string;
  /** Sideways bend of the path (px) – swaps bend in opposite directions so the cards cross. */
  bend: number;
  hides: { pileIndex?: number; slot?: string; drawn?: boolean };
  combo?: { kind: MatchEvent['kind']; key: number };
}

/** Random-looking but stable tilt per pile position, −5°…+5°. */
export const pileTilt = (index: number) => ((index * 47) % 11) - 5;
export const pileOffset = (depth: number) => `translate(${-depth * 3}px, ${depth * 2}px)`;
const pileEnd = (index: number, depth = 0) => `${pileOffset(depth)} rotate(${pileTilt(index)}deg)`;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const slotKey = (r: SlotRef) => `${r.playerId}:${r.slot}`;
const rectOf = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
const slotRect = (r: SlotRef) => rectOf(`[data-slot="${slotKey(r)}"]`) ?? rectOf(`[data-player="${r.playerId}"]`);

export function useBoardAnimations(view: PlayerView) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [combo, setCombo] = useState<{ kind: MatchEvent['kind']; key: number } | null>(null);
  // Anything that already happened before this page loaded is not replayed.
  const lastMatchSeq = useRef(view.lastMatch?.seq ?? -1);
  const lastMotionSeq = useRef(view.motions.at(-1)?.seq ?? 0);
  const comboTimer = useRef<number>();

  const showCombo = useCallback((c: { kind: MatchEvent['kind']; key: number }) => {
    setCombo(c);
    window.clearTimeout(comboTimer.current);
    comboTimer.current = window.setTimeout(() => setCombo(null), 1300);
  }, []);

  // Only the newest event sequence numbers matter; other updates must not restart flights.
  const newestMotion = view.motions.at(-1)?.seq ?? 0;
  const newestMatch = view.lastMatch?.seq ?? -1;

  useLayoutEffect(() => {
    const fresh: Flight[] = [];
    const pile = rectOf('[data-pile="discard"]');
    const drawn = rectOf('[data-pile="drawn"]');
    const deck = rectOf('[data-pile="draw"]');
    const animate = !reducedMotion();

    // ── plain card movements ──
    const motions = view.motions.filter((m) => m.seq > lastMotionSeq.current);
    lastMotionSeq.current = Math.max(lastMotionSeq.current, newestMotion);
    if (animate) for (const m of motions) fresh.push(...flightsForMotion(m, { pile, drawn, deck }, view.you));

    // ── matches / snaps / slams / combos ──
    const ev = view.lastMatch;
    if (ev && ev.seq !== lastMatchSeq.current) {
      lastMatchSeq.current = ev.seq;
      const c = { kind: ev.kind, key: ev.seq };
      if (!animate || !pile) showCombo(c);
      else fresh.push(...flightsForMatch(ev, view.discardCount, { pile, drawn }, c));
    }

    if (!fresh.length) return;
    setFlights((fs) => [...fs, ...fresh]);
    // Safety net: if animations can't run (e.g. background tab), never leave cards hidden.
    const keys = new Set(fresh.map((f) => f.key));
    window.setTimeout(() => setFlights((fs) => fs.filter((f) => !keys.has(f.key))), 2500);
  }, [newestMotion, newestMatch]);

  const onLanded = useCallback(
    (key: string) => {
      setFlights((fs) => {
        const landed = fs.find((f) => f.key === key);
        const rest = fs.filter((f) => f.key !== key);
        if (landed?.combo && !rest.some((f) => f.group === landed.group)) showCombo(landed.combo);
        return rest;
      });
    },
    [showCombo],
  );

  return {
    flights,
    combo,
    onLanded,
    hiddenIndices: flights.flatMap((f) => (f.hides.pileIndex !== undefined ? [f.hides.pileIndex] : [])),
    hiddenSlots: new Set(flights.flatMap((f) => (f.hides.slot ? [f.hides.slot] : []))),
    hideDrawn: flights.some((f) => f.hides.drawn),
  };
}

type Spots = { pile?: DOMRect; drawn?: DOMRect; deck?: DOMRect };

function flightsForMotion(m: MotionEvent, { pile, drawn, deck }: Spots, viewerId: string): Flight[] {
  const base = { group: `m${m.seq}`, bend: 0 };
  switch (m.kind) {
    case 'draw':
      if (!deck || !drawn) return [];
      return [{ ...base, key: `m${m.seq}`, from: deck, to: drawn, delay: 0, duration: 380, style: 'slide', end: 'none', hides: { drawn: true } }];
    case 'toPile': {
      const from = m.from === 'drawn' ? drawn : slotRect(m.from);
      if (!from || !pile) return [];
      return [
        { ...base, key: `m${m.seq}`, face: m.face, from, to: pile, delay: 0, duration: 460, style: 'arc', end: pileEnd(m.pileIndex), hides: { pileIndex: m.pileIndex } },
      ];
    }
    case 'toHand': {
      const from = m.from === 'drawn' ? drawn : deck;
      const to = slotRect(m.to);
      if (!from || !to) return [];
      return [
        { ...base, key: `m${m.seq}`, from, to, delay: m.delayMs ?? 0, duration: 460, style: 'slide', end: 'none', hides: { slot: slotKey(m.to) } },
      ];
    }
    case 'swap': {
      // You already moved your own cards by dragging them; everyone else sees them slide.
      if (m.by && m.by === viewerId) return [];
      const a = slotRect(m.a);
      const b = slotRect(m.b);
      if (!a || !b) return [];
      // Both cards travel at the same time, bending to opposite sides so they visibly cross.
      return [
        { ...base, key: `m${m.seq}-a`, from: a, to: b, delay: 0, duration: 560, style: 'arc', end: 'none', bend: 26, hides: { slot: slotKey(m.b) } },
        { ...base, key: `m${m.seq}-b`, from: b, to: a, delay: 0, duration: 560, style: 'arc', end: 'none', bend: -26, hides: { slot: slotKey(m.a) } },
      ];
    }
  }
}

function flightsForMatch(
  ev: MatchEvent,
  pileCount: number,
  { pile, drawn }: Spots,
  combo: { kind: MatchEvent['kind']; key: number },
): Flight[] {
  if (!pile) return [];
  const source = (slot: number) => slotRect({ playerId: ev.playerId, slot }) ?? pile;
  const k = ev.faces.length;
  const group = `x${ev.seq}`;
  return ev.faces.map((face, i) => {
    const depth = k - 1 - i;
    const index = pileCount - depth;
    const from = ev.kind === 'match' && i === 0 ? (drawn ?? pile) : source(ev.kind === 'combo' ? (ev.slots ?? [ev.slot])[i] : ev.slot);
    return {
      key: `${group}-${i}`,
      group,
      face,
      from,
      to: pile,
      delay: i * 140,
      duration: 650,
      style: 'impact' as const,
      end: pileEnd(index, depth),
      bend: 0,
      hides: { pileIndex: index },
      combo,
    };
  });
}
