import { useLayoutEffect, useRef } from 'react';
import type { Flight } from '../hooks/useBoardAnimations';
import { Card } from './Card';

/** Cards travelling across the board (fixed overlay, Web Animations API). */
export function FlyingCards({ flights, onLanded }: { flights: Flight[]; onLanded: (key: string) => void }) {
  return (
    <>
      {flights.map((f) => (
        <FlyingCard key={f.key} flight={f} onLanded={onLanded} />
      ))}
    </>
  );
}

function keyframesFor(f: Flight): Keyframe[] {
  const { from, to, end } = f;
  // The overlay sits on the destination; start it over the source, scaled to the source's size.
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = Math.max(0.4, Math.min(1.8, from.width / to.width));
  const start = `translate(${dx}px, ${dy}px) scale(${scale})`;
  const fin = end === 'none' ? '' : end;
  // A point along the path, pushed sideways by `bend` and lifted a little.
  const mid = (t: number, lift: number, extra = '') => {
    const nx = -dy;
    const ny = dx; // perpendicular to the path
    const len = Math.hypot(nx, ny) || 1;
    const bx = (nx / len) * f.bend;
    const by = (ny / len) * f.bend;
    return `translate(${dx * (1 - t) + bx}px, ${dy * (1 - t) + by - lift}px) scale(${scale + (1 - scale) * t}) ${extra}`;
  };
  switch (f.style) {
    case 'slide':
      return [{ transform: start }, { transform: `${fin} scale(1)` }];
    case 'arc':
      return [{ transform: start }, { transform: mid(0.5, 22, 'rotate(-6deg)'), offset: 0.5 }, { transform: `${fin} scale(1)` }];
    case 'impact':
      // Quick slide up and over, then "drop" onto the pile with a pop.
      return [
        { transform: start, opacity: 0.9 },
        { transform: mid(0.55, 48, 'scale(1.15) rotate(-10deg)'), opacity: 1, offset: 0.5 },
        { transform: `${fin} scale(1.18)`, offset: 0.72 },
        { transform: `${fin} scale(0.92)`, offset: 0.86 },
        { transform: `${fin} scale(1)` },
      ];
  }
}

function FlyingCard({ flight, onLanded }: { flight: Flight; onLanded: (key: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const landed = useRef(onLanded);
  landed.current = onLanded;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const anim = el.animate(keyframesFor(flight), {
      duration: flight.duration,
      delay: flight.delay,
      easing: flight.style === 'slide' ? 'cubic-bezier(.25,.8,.25,1)' : 'cubic-bezier(.2,.8,.2,1)',
      fill: 'both',
    });
    anim.onfinish = () => landed.current(flight.key);
    return () => anim.cancel();
    // A flight is animated once, from mount; re-renders must not restart it.
  }, [flight.key]);

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed z-[70] drop-shadow-2xl"
      style={{ left: flight.to.left, top: flight.to.top, width: flight.to.width, height: flight.to.height }}
    >
      <Card size="fill" face={flight.face} />
    </div>
  );
}
