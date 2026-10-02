import type { PlayerView } from '../../shared/types';
import { useI18n } from '../i18n';

export function Scoreboard({ view }: { view: PlayerView }) {
  const { t } = useI18n();
  const rows = [...view.players].sort((a, b) => a.totalScore - b.totalScore);
  return (
    <div className="rounded-2xl border border-white/10 bg-black/25">
      <h2 className="flex justify-between border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-200/70">
        <span>{t('score.title', { round: view.round })}</span>
        <span>{t('score.to', { n: view.settings.targetScore })}</span>
      </h2>
      <ul className="divide-y divide-white/5 text-sm">
        {rows.map((p) => (
          <li key={p.id} className="flex items-center gap-2 px-3 py-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-stone-500'}`} />
            <span className={p.id === view.you ? 'font-semibold text-emerald-200' : ''}>
              {p.isBot && <span aria-label={t('player.ai')}>🤖 </span>}
              {p.name}
            </span>
            {p.id === view.currentPlayerId && <span className="text-yellow-300">◀</span>}
            <span className="ml-auto tabular-nums">{p.totalScore}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
