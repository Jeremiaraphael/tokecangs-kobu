// Drag your own face-down cards onto another of your spots to swap them (bluffing).
// Pointer events (not HTML5 drag & drop), so it works with touch on Android/iOS as well
// as with a mouse. A short tap is still a normal tap; only a real drag (> 10 px) moves.
import { useCallback, useRef, useState, type CSSProperties, type PointerEvent, type MouseEvent } from 'react';

const DRAG_THRESHOLD = 10;

interface DragState {
  slot: number;
  dx: number;
  dy: number;
  over: number | null;
}

/** Which of `playerId`'s spots (other than `exclude`) is under the pointer? */
function slotUnder(x: number, y: number, playerId: string, exclude: number): number | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const key = el.getAttribute('data-slot');
    if (!key?.startsWith(`${playerId}:`)) continue;
    const slot = Number(key.slice(playerId.length + 1));
    if (slot !== exclude) return slot;
  }
  return null;
}

export function useCardDrag(playerId: string, enabled: boolean, onSwap: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const start = useRef<{ slot: number; x: number; y: number; id: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);

  const finish = useCallback(() => {
    start.current = null;
    setDrag(null);
  }, []);

  /** Props for the wrapper around the card in `slot`. */
  const bind = (slot: number) => {
    if (!enabled) return {};
    const dragging = drag?.slot === slot;
    const style: CSSProperties = dragging
      ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.1) rotate(4deg)`, zIndex: 40, position: 'relative', cursor: 'grabbing' }
      : drag?.over === slot
        ? { transform: 'scale(0.92)', transition: 'transform 120ms', filter: 'brightness(1.25)' }
        : { transition: 'transform 120ms' };
    return {
      style: { ...style, touchAction: 'none' } as CSSProperties,
      onPointerDown: (e: PointerEvent) => {
        if (e.button !== 0) return;
        start.current = { slot, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
      },
      onPointerMove: (e: PointerEvent) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (!s.moved) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
          s.moved = true;
          try {
            (e.currentTarget as Element).setPointerCapture(e.pointerId); // keep receiving moves outside the card
          } catch {
            /* some browsers refuse capture for certain pointers – dragging still works */
          }
        }
        setDrag({ slot: s.slot, dx, dy, over: slotUnder(e.clientX, e.clientY, playerId, s.slot) });
      },
      onPointerUp: (e: PointerEvent) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return finish();
        if (s.moved) {
          // The browser may still fire a click after a drag; don't let it count as a tap.
          swallowClick.current = true;
          window.setTimeout(() => (swallowClick.current = false), 0);
          const target = slotUnder(e.clientX, e.clientY, playerId, s.slot);
          if (target !== null) onSwap(s.slot, target);
        }
        finish();
      },
      onPointerCancel: finish,
      onClickCapture: (e: MouseEvent) => {
        if (swallowClick.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      },
    };
  };

  return { bind, dragging: drag !== null, overSlot: drag?.over ?? null };
}
