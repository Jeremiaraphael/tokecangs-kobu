import { useEffect, useRef } from 'react';
import type { LogEntry } from '../../shared/types';
import { useI18n } from '../i18n';

export function ActivityLog({ entries, you }: { entries: LogEntry[]; you: string }) {
  const { t, tm, locale } = useI18n();
  const list = useRef<HTMLOListElement>(null);
  // Scroll only the log box itself. scrollIntoView would also scroll the page,
  // which on phones (log below the board) would yank the screen down every move.
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-black/25">
      <h2 className="border-b border-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-200/70">
        {t('log.title')}
      </h2>
      <ol ref={list} className="max-h-72 flex-1 space-y-1 overflow-y-auto px-3 py-2 text-sm lg:max-h-none">
        {entries.map((e) => (
          <li key={e.id} className={e.playerId === you ? 'text-emerald-200' : 'text-emerald-50/85'}>
            <time className="mr-1.5 text-[0.65rem] tabular-nums text-white/35">
              {new Date(e.ts).toLocaleTimeString(locale === 'id' ? 'id-ID' : [], { hour: '2-digit', minute: '2-digit' })}
            </time>
            {e.msg ? tm(e.msg) : e.text}
          </li>
        ))}
      </ol>
    </div>
  );
}
