import { useEffect, useState } from 'react';
import type { PlayerView } from '../../shared/types';
import type { KobuApi } from '../hooks/useKobu';
import { useBoardAnimations } from '../hooks/useBoardAnimations';
import { useTurnControls } from '../hooks/useTurnControls';
import { Brand, LanguageToggle, useI18n } from '../i18n';
import { ActionBar } from './ActionBar';
import { ActivityLog } from './ActivityLog';
import { CenterPiles } from './CenterPiles';
import { FlyingCards } from './FlyingCards';
import { PlayerArea } from './PlayerArea';
import { ResultsModal } from './ResultsModal';
import { RulesPanel } from './RulesPanel';
import { Scoreboard } from './Scoreboard';

export function GameBoard({ view, api }: { view: PlayerView; api: KobuApi }) {
  const { t, tm } = useI18n();
  const controls = useTurnControls(view, api.act);
  const anim = useBoardAnimations(view);
  const [hideResults, setHideResults] = useState(false);
  const roundEnded = view.phase === 'roundOver' || view.phase === 'gameOver';
  useEffect(() => {
    setHideResults(false);
  }, [view.round, view.phase]);

  // Seat order starting from me, so opponents read clockwise.
  const myIndex = view.players.findIndex((p) => p.id === view.you);
  const seats = view.players.map((_, i) => view.players[(myIndex + i) % view.players.length]);
  const [me, ...opponents] = seats;

  const area = (p: (typeof seats)[number]) => (
    <PlayerArea
      key={p.id}
      player={p}
      isMe={p.id === view.you}
      isTurn={p.id === view.currentPlayerId}
      isHost={p.id === view.hostId}
      calledKobu={p.id === view.kobuCallerId}
      controls={controls}
      baseSize={view.settings.handSize}
      hiddenSlots={anim.hiddenSlots}
      onReorder={canReorder && p.id === view.you ? (from, to) => api.act({ type: 'reorder', from, to }) : undefined}
    />
  );

  const lastEvent = view.log.at(-1);
  // Bluff: rearrange your own face-down cards by dragging, any time during play.
  const canReorder = view.phase === 'playing';

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col gap-3 p-3 sm:gap-4 sm:p-5 lg:h-dvh lg:flex-row">
      <main className="flex min-w-0 flex-1 flex-col gap-3 sm:gap-4 lg:overflow-y-auto">
        <header className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
          <Brand />
          <span className="rounded-full bg-black/30 px-2.5 py-0.5 font-mono text-xs tracking-widest sm:px-3 sm:py-1 sm:text-sm">
            {view.mode === 'ai' ? t('board.vsAi') : view.roomCode}
          </span>
          {!api.connected && <span className="text-xs text-rose-300 sm:text-sm">{t('board.reconnecting')}</span>}
          {view.kobuCallerId && view.phase === 'playing' && (
            <span className="animate-pulse rounded-full bg-rose-500 px-2 py-0.5 text-[0.65rem] font-bold uppercase sm:px-3 sm:py-1 sm:text-xs">
              {t('board.finalRound')}
            </span>
          )}
          <LanguageToggle className="ml-auto" />
          <button
            type="button"
            onClick={() => confirm(t(view.mode === 'ai' ? 'board.quitAi' : 'board.leaveMp')) && api.leaveRoom()}
            className="px-1 py-1 text-white/50 hover:text-white"
          >
            {t('board.leave')}
          </button>
        </header>

        {/* Opponents: 2 columns even on phones, so 5 opponents fit above the fold. */}
        <div
          className={`grid gap-2 sm:gap-3 ${
            opponents.length === 1 ? 'mx-auto w-full max-w-sm' : 'grid-cols-2 xl:grid-cols-3'
          }`}
        >
          {opponents.map(area)}
        </div>

        {/* Table centre */}
        <div className="flex flex-1 flex-col justify-center py-1 sm:py-2">
          <CenterPiles view={view} controls={controls} hiddenIndices={anim.hiddenIndices} combo={anim.combo} hideDrawn={anim.hideDrawn} />
        </div>

        {/* My controls + hand: docked to the bottom on phones/tablets (not in short landscape screens). */}
        <div className="sticky bottom-0 z-20 -mx-3 space-y-2 border-t border-white/10 bg-emerald-950/90 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md sm:-mx-5 sm:space-y-3 sm:px-5 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none [@media(max-height:500px)]:static">
          {lastEvent && (
            <p key={lastEvent.id} className="animate-pop truncate text-center text-xs text-emerald-200/70 lg:hidden">
              {lastEvent.msg ? tm(lastEvent.msg) : lastEvent.text}
            </p>
          )}
          <ActionBar controls={controls} />
          {canReorder && view.round === 1 && <p className="text-center text-[0.65rem] text-emerald-200/50">{t('board.dragHint')}</p>}
          <div className={`mx-auto w-full ${me.hand.length > 4 ? 'max-w-xl' : 'max-w-md'}`}>{area(me)}</div>
          {roundEnded && hideResults && (
            <button
              type="button"
              onClick={() => setHideResults(false)}
              className="mx-auto block rounded-full bg-yellow-300 px-5 py-2 text-sm font-bold text-yellow-950"
            >
              {t('board.showResults')}
            </button>
          )}
        </div>
      </main>

      <aside className="flex flex-col gap-3 lg:w-80">
        <Scoreboard view={view} />
        <ActivityLog entries={view.log} you={view.you} />
        <RulesPanel />
      </aside>

      <FlyingCards flights={anim.flights} onLanded={anim.onLanded} />

      {roundEnded && !hideResults && <ResultsModal view={view} act={api.act} onHide={() => setHideResults(true)} />}
    </div>
  );
}
