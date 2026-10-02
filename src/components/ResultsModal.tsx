import { KOBU_PENALTY, type GameAction, type PlayerView } from '../../shared/types';
import { Card } from './Card';
import { GameSettingsPanel } from './GameSettingsPanel';
import { useI18n } from '../i18n';

interface Props {
  view: PlayerView;
  act: (a: GameAction) => void;
  onHide: () => void;
}

export function ResultsModal({ view, act, onHide }: Props) {
  const { t } = useI18n();
  const result = view.lastResult;
  if (!result) return null;
  const isHost = view.hostId === view.you;
  const gameOver = view.phase === 'gameOver';
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const caller = result.kobuCallerId ? nameOf(result.kobuCallerId) : null;
  const callerRow = result.rows.find((r) => r.playerId === result.kobuCallerId);
  const lowestOthers = result.rows.filter((r) => r.lowest && r.playerId !== result.kobuCallerId);
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

  const headline = gameOver
    ? t('res.win', { names: view.winnerIds.map(nameOf).join(' & ') })
    : t('res.round', { round: result.round });
  const verdict = !caller
    ? t('res.noCaller')
    : result.callerSucceeded
      ? t('res.callerOk', { name: caller, total: callerRow?.handTotal ?? 0 })
      : t('res.callerFail', {
          name: caller,
          penalty: KOBU_PENALTY,
          lowest: lowestOthers.map((r) => r.name).join(' & '),
          total: lowestOthers[0]?.handTotal ?? 0,
          outcome: t((lowestOthers[0]?.handTotal ?? 0) < 0 ? 'res.keepsNegative' : 'res.zero'),
        });

  const rows = [...result.rows].sort((a, b) => a.roundScore - b.roundScore);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="animate-pop max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/15 bg-emerald-950 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:p-7">
        <h2 className="font-display text-xl font-bold sm:text-3xl">{headline}</h2>
        <p
          className={`mt-2 rounded-xl px-3 py-2 text-sm ${
            result.callerSucceeded ? 'bg-emerald-400/15 text-emerald-100' : 'bg-rose-500/15 text-rose-100'
          }`}
        >
          {verdict}
        </p>

        <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-3">
          {rows.map((r) => (
            <div
              key={r.playerId}
              className={`flex items-center gap-3 rounded-2xl border p-2.5 sm:p-3 ${
                r.playerId === view.you ? 'border-emerald-400/50 bg-emerald-400/5' : 'border-white/10 bg-black/20'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1 text-[0.65rem] font-bold uppercase">
                  <span className="mr-1 truncate text-sm normal-case">{r.name}</span>
                  {r.playerId === result.kobuCallerId && <span className="rounded bg-rose-500 px-1">Kobu</span>}
                  {r.penalty && <span className="rounded bg-rose-700 px-1">+{KOBU_PENALTY}</span>}
                  {r.lowest && <span className="rounded bg-emerald-500 px-1 text-emerald-950">{t('res.best')}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1 sm:gap-1.5">
                  {r.cards.map((face, i) => (
                    <Card key={i} size="xs" face={face} />
                  ))}
                </div>
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums">
                <div className="text-emerald-200/70">
                  {t('res.hand', { n: r.handTotal })}
                  <span className="text-white/40"> · {t('res.cards', { n: r.cards.length })}</span>
                </div>
                <div className="text-lg font-bold">{signed(r.roundScore)}</div>
                <div className="text-xs text-emerald-200/70">{t('res.total', { n: r.totalScore })}</div>
              </div>
            </div>
          ))}
        </div>

        {gameOver && isHost && (
          <div className="mt-5">
            <GameSettingsPanel settings={view.settings} editable act={act} />
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 sm:mt-6">
          <button type="button" onClick={onHide} className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
            {t('res.viewTable')}
          </button>
          {isHost ? (
            <button
              type="button"
              onClick={() => act({ type: gameOver ? 'startGame' : 'nextRound' })}
              className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-bold text-emerald-950 hover:bg-emerald-300"
            >
              {gameOver ? t('res.newGame') : t('res.nextRound')}
            </button>
          ) : (
            <span className="text-sm text-emerald-200/70">{t('res.waitHost')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
