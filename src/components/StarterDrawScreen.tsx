import { cardPoints, type PlayerView } from '../../shared/types';
import type { KobuApi } from '../hooks/useKobu';
import { Brand, LanguageToggle, useI18n } from '../i18n';
import { Card } from './Card';

/** "Who goes first?" – everyone takes one face-down card; the lowest card starts. */
export function StarterDrawScreen({ view, api }: { view: PlayerView; api: KobuApi }) {
  const { t } = useI18n();
  const sd = view.starterDraw;
  if (!sd) return null;
  const isHost = view.hostId === view.you;
  const nameOf = (id: string | null) => view.players.find((p) => p.id === id)?.name ?? '';
  const myPick = sd.offered.findIndex((o) => o.takenBy === view.you);
  const decided = !!sd.winnerId;
  const waitingFor = view.players.filter((p) => !sd.offered.some((o) => o.takenBy === p.id));
  const someoneOffline = waitingFor.some((p) => !p.connected);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-4 py-8">
      <header className="flex items-center gap-2 text-sm">
        <Brand />
        <span className="rounded-full bg-black/30 px-2.5 py-0.5 font-mono text-xs tracking-widest">
          {view.mode === 'ai' ? t('board.vsAi') : view.roomCode}
        </span>
        {!api.connected && <span className="text-xs text-rose-300">{t('board.reconnecting')}</span>}
        <LanguageToggle className="ml-auto" />
      </header>

      <div className="text-center">
        <h2 className="font-display text-3xl font-bold">{t('starter.title')}</h2>
        <p className="mt-1 text-sm text-emerald-100/75">
          {decided ? t('starter.revealed') : myPick < 0 ? t('starter.take') : t('starter.gotIt')}
        </p>
        <p className="mt-1 text-xs text-emerald-100/50">{t('starter.order')}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {sd.offered.map((o, i) => {
          const mine = o.takenBy === view.you;
          const won = decided && o.takenBy === sd.winnerId && sd.redraws.length === 0;
          return (
            <div key={i} className="flex w-16 flex-col items-center gap-1.5">
              <Card
                size="md"
                face={o.face}
                clickable={!decided && myPick < 0 && !o.takenBy}
                selected={mine && !decided}
                highlighted={won}
                label={o.takenBy ? t('starter.takenBy', { name: nameOf(o.takenBy) }) : t('starter.faceDown', { n: i + 1 })}
                onClick={() => api.act({ type: 'pickStarter', index: i })}
              />
              <span className={`max-w-full truncate text-xs ${mine ? 'font-semibold text-emerald-300' : 'text-emerald-100/70'}`}>
                {o.takenBy ? (mine ? t('common.you') : nameOf(o.takenBy)) : '—'}
              </span>
              {o.face && <span className="text-[0.65rem] text-white/50">{t('starter.pts', { n: cardPoints(o.face, view.settings) })}</span>}
            </div>
          );
        })}
      </div>

      {sd.redraws.map((round, r) => (
        <div key={r} className="rounded-2xl border border-yellow-300/30 bg-yellow-300/5 p-3">
          <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-yellow-200">
            {t('starter.tie')}{sd.redraws.length > 1 ? ` #${r + 1}` : ''}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {round.map((x) => (
              <div key={x.playerId} className="flex w-16 flex-col items-center gap-1.5">
                <Card size="md" face={x.face} highlighted={r === sd.redraws.length - 1 && x.playerId === sd.winnerId} />
                <span className="max-w-full truncate text-xs text-emerald-100/70">{x.playerId === view.you ? t('common.you') : nameOf(x.playerId)}</span>
                <span className="text-[0.65rem] text-white/50">{t('starter.pts', { n: cardPoints(x.face, view.settings) })}</span>
              </div>
            ))}
          </div>
        </div>
      ))}

      {decided ? (
        <div className="animate-pop space-y-3 text-center">
          <p className="font-display text-2xl font-bold text-yellow-300">
            {sd.winnerId === view.you ? t('starter.youFirst') : t('starter.otherFirst', { name: nameOf(sd.winnerId) })}
          </p>
          {isHost ? (
            <button
              type="button"
              onClick={() => api.act({ type: 'dealCards' })}
              className="w-full rounded-xl bg-emerald-400 py-3 text-lg font-bold text-emerald-950 shadow-lg hover:bg-emerald-300"
            >
              {t('starter.deal')}
            </button>
          ) : (
            <p className="text-sm text-emerald-100/70">{t('starter.waitDeal')}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3 text-center">
          {waitingFor.length > 0 && (
            <p className="text-sm text-emerald-100/70">
              {t('starter.waitingFor', {
                names: waitingFor.map((p) => `${p.id === view.you ? t('common.you') : p.name}${p.connected ? '' : ` ${t('common.offline')}`}`).join(', '),
              })}
            </p>
          )}
          {isHost && someoneOffline && (
            <button
              type="button"
              onClick={() => api.act({ type: 'autoPickStarter' })}
              className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
            >
              {t('starter.pickOffline')}
            </button>
          )}
        </div>
      )}
    </main>
  );
}
