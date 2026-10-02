import type { ReactNode } from 'react';
import { cardLabel, type MatchEvent, type PlayerView } from '../../shared/types';
import { pileOffset, pileTilt } from '../hooks/useBoardAnimations';
import type { TurnControls } from '../hooks/useTurnControls';
import { useI18n } from '../i18n';
import { Card } from './Card';

interface Props {
  view: PlayerView;
  controls: TurnControls;
  /** Pile positions (1-based) of cards currently flying onto the pile – hidden until they land. */
  hiddenIndices?: number[];
  /** "MATCH!" / "SNAP!" burst after a card lands. */
  combo?: { kind: MatchEvent['kind']; key: number } | null;
  /** A card is flying into the "drawn" spot – keep it empty until it arrives. */
  hideDrawn?: boolean;
}

const PILE_SIZE = 'h-20 w-14 sm:h-24 sm:w-16';

export function CenterPiles({ view, controls, hiddenIndices = [], combo, hideDrawn }: Props) {
  const { t } = useI18n();
  const drawn = view.stage.kind === 'decideDrawn' ? view.stage : null;
  const power = view.stage.kind === 'power' ? view.stage : null;
  const drawer = view.players.find((p) => p.id === view.currentPlayerId);

  // Fanned discard stack: up to 3 top cards (minus any still in the air), each lower card slightly offset and tilted.
  const stack = view.discardStack
    .map((face, i) => ({ face, index: view.discardCount - (view.discardStack.length - 1 - i) }))
    .filter((c) => !hiddenIndices.includes(c.index));

  return (
    <div className="flex items-end justify-center gap-5 sm:gap-10">
      <Pile label={t('pile.draw', { n: view.drawPileCount })}>
        <div data-pile="draw">
          <Card size="md" clickable={controls.canDeck} onClick={controls.onDeck} label={t('pile.drawAria')} />
        </div>
      </Pile>

      <Pile label={drawn ? (drawn.face ? t('pile.youDrew') : t('pile.drew', { name: drawer?.name ?? '' })) : power ? t('pile.power') : ' '}>
        <div data-pile="drawn">
          {drawn ? (
            <Card size="md" face={drawn.face} highlighted label={t('pile.drawnAria')} ghost={hideDrawn} />
          ) : power ? (
            <div
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-yellow-300/60 bg-yellow-300/10 px-1 text-center text-[0.6rem] font-bold uppercase leading-tight text-yellow-200 sm:text-xs ${PILE_SIZE}`}
            >
              {t(`power.${power.power}.name`)}
              <span className="mt-1 font-normal normal-case text-yellow-100/70">
                {power.stepIndex + 1}/{power.stepCount}
              </span>
            </div>
          ) : (
            <div className={`rounded-lg border-2 border-dashed border-white/10 ${PILE_SIZE}`} />
          )}
        </div>
      </Pile>

      <Pile label={t('pile.discard', { n: view.discardCount })}>
        {/* Re-keyed on every match/slam so the pile "takes the hit" (impact shake). */}
        <div key={combo?.key ?? 'pile'} data-pile="discard" className={`relative ${PILE_SIZE} ${combo ? 'animate-impact' : ''}`}>
          {stack.length === 0 && <div className={`rounded-lg border-2 border-dashed border-white/20 ${PILE_SIZE}`} />}
          {stack.map(({ face, index }, i) => {
            const depth = stack.length - 1 - i; // 0 = top card
            const isTop = depth === 0;
            return (
              <div
                key={index}
                className="absolute inset-0"
                style={{ transform: `${pileOffset(depth)} rotate(${pileTilt(index)}deg)`, zIndex: i }}
              >
                <Card
                  size="md"
                  face={face}
                  clickable={isTop && controls.canDiscard}
                  onClick={controls.onDiscard}
                  label={isTop ? t('pile.discardAria', { card: cardLabel(face) }) : undefined}
                />
              </div>
            );
          })}
          {combo && (
            <span
              key={combo.key}
              className="animate-combo pointer-events-none absolute -top-7 left-1/2 z-20 whitespace-nowrap rounded-full bg-amber-300 px-2.5 py-0.5 text-xs font-black uppercase tracking-wide text-amber-950 shadow-lg"
            >
              {t(`burst.${combo.kind}`)}
            </span>
          )}
        </div>
      </Pile>
    </div>
  );
}

function Pile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {children}
      <span className="text-xs text-emerald-200/70">{label}</span>
    </div>
  );
}
