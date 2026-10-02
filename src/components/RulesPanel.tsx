import { useI18n } from '../i18n';

export function RulesPanel() {
  const { t } = useI18n();
  const list = (keys: string[]) => (
    <ul className="list-inside list-disc space-y-0.5">
      {keys.map((k) => (
        <li key={k}>{t(k)}</li>
      ))}
    </ul>
  );
  return (
    <details className="rounded-2xl border border-white/10 bg-black/25 text-sm">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-200/70">{t('rules.title')}</summary>
      <div className="space-y-2 px-3 pb-3 text-emerald-50/85">
        <p className="font-semibold text-emerald-100">{t('rules.lowest')}</p>
        {list(['rules.points1', 'rules.points2', 'rules.points3'])}
        <p className="font-semibold text-emerald-100">{t('rules.startsH')}</p>
        <p>{t('rules.starts')}</p>
        <p className="font-semibold text-emerald-100">{t('rules.turnH')}</p>
        {list(['rules.turn1', 'rules.turn2', 'rules.turn3', 'rules.turn4', 'rules.turn5', 'rules.turn6', 'rules.turn7', 'rules.turn8'])}
        <p className="font-semibold text-emerald-100">{t('rules.powersH')}</p>
        {list(['rules.p7', 'rules.p8', 'rules.p910', 'rules.pJ', 'rules.pQ', 'rules.pK'])}
        <p>{t('rules.scoring')}</p>
      </div>
    </details>
  );
}
