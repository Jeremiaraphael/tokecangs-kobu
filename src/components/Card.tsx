import { useEffect, useState } from 'react';
import { SUIT_SYMBOL, cardLabel, cardPoints, cardPower, isFaceCard, isRed, type CardFace } from '../../shared/types';
import { useI18n } from '../i18n';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'fill';

// `sm` and `lg` are fluid: they fill their grid cell (up to a cap), so hands
// shrink to fit narrow phone screens instead of overflowing. `fill` = size of the parent
// (used by cards flying across the board).
const SIZE: Record<Size, string> = {
  xs: 'w-8 h-[2.8rem] text-sm rounded-md sm:w-9 sm:h-[3.15rem]',
  sm: 'w-full max-w-12 aspect-[5/7] text-sm rounded-md sm:text-lg',
  md: 'w-14 h-20 text-xl rounded-lg sm:w-16 sm:h-24 sm:text-2xl',
  lg: 'w-full max-w-[4.5rem] aspect-[5/7] text-2xl rounded-lg sm:max-w-20 sm:text-3xl',
  fill: 'w-full h-full text-xl rounded-lg sm:text-2xl',
};

const FLIP_MS = 450;

/** Background tint hints at the card's power; text colour follows the suit. */
function faceStyle(f: CardFace) {
  if (f.rank === 'JOKER') return 'bg-violet-100 text-violet-700';
  const ink = isRed(f) ? 'text-rose-600' : 'text-stone-900';
  const power = cardPower(f);
  const bg = !power ? 'bg-stone-50' : f.rank === '7' ? 'bg-sky-50' : f.rank === '8' ? 'bg-violet-50' : 'bg-amber-50';
  return `${bg} ${ink}`;
}

/** Empty spot left in a hand by a matched card (keeps the other cards in place). */
export function CardGap({ size = 'md', dataSlot }: { size?: Size; dataSlot?: string }) {
  const { t } = useI18n();
  return (
    <div
      data-slot={dataSlot}
      aria-label={t('card.empty')}
      className={`shrink-0 border-2 border-dashed border-white/10 bg-black/10 ${SIZE[size]}`}
    />
  );
}

export interface CardProps {
  face?: CardFace | null;
  size?: Size;
  clickable?: boolean;
  selected?: boolean;
  /** Small number shown on a selected card (e.g. 1st / 2nd pick of a swap). */
  selectedLabel?: string;
  highlighted?: boolean;
  knownByMe?: boolean;
  seenBy?: string[];
  label?: string;
  onClick?: () => void;
  /** "playerId:slot" – lets animations find where a card sits on screen. */
  dataSlot?: string;
  /** Keep the space but hide the card (it is currently flying in from somewhere else). */
  ghost?: boolean;
}

/**
 * A two-sided card. When its face appears (peek, reveal) it flips over in 3D, and when
 * the face goes away it flips back – the last face stays on the hidden side until the
 * flip has finished. A card that is face-up from the start does not flip.
 */
export function Card({
  face,
  size = 'md',
  clickable,
  selected,
  selectedLabel,
  highlighted,
  knownByMe,
  seenBy = [],
  label,
  onClick,
  dataSlot,
  ghost,
}: CardProps) {
  const { t } = useI18n();
  const faceUp = !!face;
  const big = size === 'md' || size === 'lg' || size === 'fill';
  const [shown, setShown] = useState<CardFace | null>(face ?? null);
  const faceKey = face ? `${face.rank}${face.suit}` : '';
  useEffect(() => {
    if (face) {
      setShown(face);
      return;
    }
    const t = window.setTimeout(() => setShown(null), FLIP_MS); // keep it during the flip back
    return () => window.clearTimeout(t);
  }, [faceKey]);

  const ring = selected
    ? 'ring-4 ring-emerald-300 -translate-y-2'
    : highlighted
      ? 'ring-4 ring-yellow-300/90'
      : clickable
        ? 'ring-2 ring-white/60 hover:ring-yellow-200 hover:-translate-y-1'
        : 'ring-1 ring-black/30';

  return (
    <button
      type="button"
      data-slot={dataSlot}
      disabled={!clickable}
      onClick={onClick}
      aria-label={label ? `${label}${face ? `: ${cardLabel(face)}` : ''}` : face ? cardLabel(face) : t('card.faceDown')}
      title={seenBy.length ? t('card.seenBy', { names: seenBy.join(', ') }) : undefined}
      className={`card-3d relative shrink-0 select-none font-display font-bold shadow-lg transition-[box-shadow,transform] duration-150 ${SIZE[size]} ${ring} ${
        clickable ? 'cursor-pointer' : 'cursor-default'
      } ${ghost ? 'invisible' : ''}`}
    >
      <span
        className="card-3d-inner absolute inset-0 rounded-[inherit]"
        style={{ transform: faceUp ? 'rotateY(180deg)' : 'rotateY(0deg)', transitionDuration: `${FLIP_MS}ms` }}
      >
        {/* back */}
        <span className="card-side card-back flex items-center justify-center rounded-[inherit] text-white/25">K</span>
        {/* front */}
        <span className={`card-side card-front rounded-[inherit] ${shown ? faceStyle(shown) : 'bg-stone-50'}`}>
          {shown && <Face face={shown} big={big} />}
        </span>
      </span>

      {selected && selectedLabel && (
        <span className="absolute -left-1.5 -top-1.5 z-10 h-4 w-4 rounded-full bg-emerald-300 text-[0.6rem] leading-4 text-emerald-950 shadow">
          {selectedLabel}
        </span>
      )}

      {/* Memory hint: you've seen this card before (value NOT shown). */}
      {!faceUp && knownByMe && (
        <span className="absolute -right-1.5 -top-1.5 z-10 rounded-full bg-emerald-400 px-1 text-[0.6rem] leading-4 text-emerald-950 shadow">
          👁
        </span>
      )}
      {/* Other players who have seen this card. */}
      {!faceUp && seenBy.length > 0 && (
        <span className="absolute -bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-px">
          {seenBy.slice(0, 2).map((n, i) => (
            <span
              key={i}
              className="h-3.5 w-3.5 rounded-full bg-yellow-300 text-[0.5rem] leading-[0.875rem] text-yellow-950 shadow"
            >
              {n[0]?.toUpperCase()}
            </span>
          ))}
          {seenBy.length > 2 && (
            <span className="h-3.5 rounded-full bg-yellow-300 px-0.5 text-[0.5rem] leading-[0.875rem] text-yellow-950 shadow">
              +{seenBy.length - 2}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

function Face({ face, big }: { face: CardFace; big: boolean }) {
  const { t } = useI18n();
  if (face.rank === 'JOKER') {
    return (
      <span className="flex h-full flex-col items-center justify-center leading-none">
        <span>★</span>
        <span className="mt-0.5 text-[0.55em] font-semibold">{big ? t('card.jokerBig') : '−1'}</span>
      </span>
    );
  }
  const power = cardPower(face);
  const faceCard = isFaceCard(face);
  return (
    <span className="flex h-full flex-col items-center justify-center leading-none">
      {/* Points chip for J/Q/K, whose value depends on colour. */}
      {faceCard && (
        <span
          className={`absolute right-0.5 top-0.5 rounded px-0.5 text-[0.5rem] leading-3 sm:text-[0.55rem] ${
            isRed(face) ? 'bg-rose-600 text-white' : 'bg-stone-800 text-white'
          }`}
        >
          {cardPoints(face)}
        </span>
      )}
      <span>{face.rank}</span>
      <span className="text-[0.7em]">{SUIT_SYMBOL[face.suit!]}</span>
      {power && big && (
        <span className="mt-0.5 max-w-full truncate px-0.5 text-[0.45rem] font-semibold uppercase tracking-tight opacity-70 sm:text-[0.5rem]">
          {t(`power.${power}.short`)}
        </span>
      )}
    </span>
  );
}
