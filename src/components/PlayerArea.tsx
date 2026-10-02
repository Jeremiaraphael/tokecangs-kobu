import type { CSSProperties, ReactNode } from 'react';
import { cardsIn, type PlayerPublicView } from '../../shared/types';
import { useCardDrag } from '../hooks/useCardDrag';
import type { TurnControls } from '../hooks/useTurnControls';
import { useI18n } from '../i18n';
import { Card, CardGap } from './Card';

interface Props {
  player: PlayerPublicView;
  isMe: boolean;
  isTurn: boolean;
  isHost: boolean;
  calledKobu: boolean;
  controls: TurnControls;
  /** Starting hand size of this game mode (4 or 6); hands can shrink/grow from there. */
  baseSize: number;
  /** "playerId:slot" keys of cards still flying into this spot – hidden until they land. */
  hiddenSlots?: Set<string>;
  /** Your own hand only: drag a card onto another spot to swap them (bluffing). */
  onReorder?: (from: number, to: number) => void;
}

/**
 * Hand layout (hands change size through match/snap and penalty cards):
 *   your hand  → one row (4-card mode: at least 4 columns; never more than 6 per row)
 *   opponents  → 4-card mode: rows of 4; 6-card mode: rows of 3 (keeps cards tappable)
 */
function gridFor(isMe: boolean, slots: number, base: number): { className: string; style: CSSProperties } {
  const cols = isMe ? Math.min(Math.max(slots, base), 6) : base > 4 ? 3 : 4;
  const className = isMe
    ? cols > 4
      ? 'gap-1.5 sm:gap-2'
      : 'gap-2 sm:gap-3'
    : cols === 3
      ? 'mx-auto max-w-[8.5rem] gap-1 sm:max-w-[10rem] sm:gap-1.5'
      : 'gap-1 sm:gap-1.5';
  return { className, style: { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } };
}

export function PlayerArea({ player, isMe, isTurn, isHost, calledKobu, controls, baseSize, hiddenSlots, onReorder }: Props) {
  const { t } = useI18n();
  const count = cardsIn(player.hand).length;
  const grid = gridFor(isMe, player.hand.length, baseSize);
  const drag = useCardDrag(player.id, !!onReorder, (from, to) => onReorder?.(from, to));

  return (
    <section
      data-player={player.id}
      className={`min-w-0 rounded-2xl border p-2 transition-colors sm:p-3 ${
        isTurn ? 'border-yellow-300 bg-yellow-300/10 shadow-[0_0_24px_rgb(253_224_71/0.25)]' : 'border-white/10 bg-black/20'
      }`}
    >
      <header className="mb-1.5 flex min-w-0 items-center gap-1.5 text-xs sm:mb-2 sm:gap-2 sm:text-sm">
        {player.isBot ? (
          <span className="shrink-0" title={t('player.ai')} aria-label={t('player.ai')}>
            🤖
          </span>
        ) : (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${player.connected ? 'bg-emerald-400' : 'bg-stone-500'}`}
            title={t(player.connected ? 'player.online' : 'player.offline')}
          />
        )}
        <span className="min-w-0 truncate font-semibold">
          {player.name}
          {isMe && <span className="text-emerald-300"> {t('common.youParen')}</span>}
        </span>
        {isHost && (
          <span className="shrink-0" title={t('player.host')}>
            👑
          </span>
        )}
        {calledKobu && (
          <span className="shrink-0 rounded bg-rose-500 px-1 text-[0.6rem] font-bold uppercase text-white sm:px-1.5 sm:text-xs">
            {t('player.kobu')}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {count !== baseSize && (
            <span
              className={`rounded px-1 text-[0.6rem] font-bold sm:text-xs ${count < baseSize ? 'bg-emerald-500/25 text-emerald-200' : 'bg-rose-500/25 text-rose-200'}`}
            >
              {t('player.cards', { n: count })}
            </span>
          )}
          {isTurn && (
            <span className="animate-pulse text-xs font-semibold text-yellow-300">
              ●<span className="hidden sm:inline"> {t('player.turn')}</span>
            </span>
          )}
          <span className="tabular-nums text-emerald-200/70">
            {player.totalScore}
            <span className="hidden sm:inline"> {t('player.pts')}</span>
          </span>
        </span>
      </header>

      <div className={`grid justify-items-center ${grid.className}`} style={grid.style}>
        {player.hand.map((card, slot) => {
          const key = `${player.id}:${slot}`;
          // Your own cards sit in a drag handle so they can be rearranged.
          const wrap = (child: ReactNode) =>
            onReorder ? (
              <div key={slot} className="flex w-full justify-center" {...drag.bind(slot)}>
                {child}
              </div>
            ) : (
              child
            );
          if (!card) return wrap(<CardGap key={slot} size={isMe ? 'lg' : 'sm'} dataSlot={key} />);
          const ref = { playerId: player.id, slot };
          const pick = controls.pickLabel(ref);
          return wrap(
            <Card
              key={slot}
              size={isMe ? 'lg' : 'sm'}
              face={card.face}
              knownByMe={card.knownByMe}
              seenBy={card.seenBy}
              highlighted={card.highlighted || drag.overSlot === slot}
              clickable={controls.canPick(ref)}
              selected={pick !== null}
              selectedLabel={pick ?? undefined}
              label={isMe ? t('card.yours', { n: slot + 1 }) : t('card.theirs', { name: player.name, n: slot + 1 })}
              onClick={() => controls.onPick(ref)}
              dataSlot={key}
              ghost={hiddenSlots?.has(key)}
            />,
          );
        })}
      </div>
    </section>
  );
}
