import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, type PlayerView } from '../../shared/types';
import type { KobuApi } from '../hooks/useKobu';
import { Brand, LanguageToggle, useI18n } from '../i18n';
import { GameSettingsPanel } from './GameSettingsPanel';
import { RulesPanel } from './RulesPanel';

export function WaitingRoom({ view, api }: { view: PlayerView; api: KobuApi }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const isHost = view.hostId === view.you;
  const ai = view.mode === 'ai';
  const full = view.players.length >= MAX_PLAYERS;
  const link = `${location.origin}/?room=${view.roomCode}`;

  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await copyText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      api.flashError(t('wait.copyFail'));
    }
  };

  const share = () =>
    navigator.share({ title: t('app.name'), text: t('wait.shareText', { code: view.roomCode }), url: link }).catch(() => {});

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 px-4 py-10">
      <div className="flex items-center justify-between">
        <Brand />
        <LanguageToggle />
      </div>
      {ai ? (
        <div className="text-center">
          <p className="text-4xl" aria-hidden>
            🤖
          </p>
          <h2 className="font-display text-3xl font-bold">{t('lobby.playAi')}</h2>
          <p className="mt-1 text-sm text-emerald-100/70">{t('wait.aiSub')}</p>
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-emerald-200/60">{t('wait.roomCode')}</p>
          <p className="font-mono text-4xl font-bold tracking-[0.25em] text-yellow-300 sm:text-5xl">{view.roomCode}</p>
          <div className="mt-3 flex justify-center gap-2">
            <button type="button" onClick={copy} className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
              {copied ? t('wait.copied') : t('wait.copy')}
            </button>
            {canShare && (
              <button type="button" onClick={share} className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
                {t('wait.share')}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/25">
        <h2 className="border-b border-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-emerald-200/70">
          {t('wait.players', { n: view.players.length, max: MAX_PLAYERS })}
        </h2>
        <ul className="divide-y divide-white/5">
          {view.players.map((p) => (
            <li key={p.id} className="flex min-h-12 items-center gap-2 px-4 py-2">
              {p.isBot ? (
                <span aria-label={t('player.ai')}>🤖</span>
              ) : (
                <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-stone-500'}`} />
              )}
              {p.name}
              {p.isBot && <span className="rounded bg-violet-500/30 px-1.5 text-[0.65rem] font-bold uppercase text-violet-100">AI</span>}
              {p.id === view.you && <span className="text-emerald-300">{t('common.youParen')}</span>}
              {p.id === view.hostId && <span className="ml-auto">👑 {t('wait.host')}</span>}
              {p.isBot && isHost && (
                <button
                  type="button"
                  onClick={() => api.act({ type: 'removeBot', playerId: p.id })}
                  aria-label={t('wait.removeAria', { name: p.name })}
                  className="ml-auto rounded-full px-3 py-1 text-sm text-rose-200 hover:bg-rose-500/20"
                >
                  {t('wait.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
        {ai && isHost && (
          <div className="border-t border-white/10 p-3">
            <button
              type="button"
              disabled={full}
              onClick={() => api.act({ type: 'addBot' })}
              className="w-full rounded-xl border border-dashed border-violet-300/50 py-2.5 text-sm font-semibold text-violet-100 hover:bg-violet-500/15 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {full ? t('wait.full', { max: MAX_PLAYERS }) : t('wait.addAi')}
            </button>
          </div>
        )}
      </div>

      <GameSettingsPanel settings={view.settings} editable={isHost} act={api.act} />

      {isHost ? (
        <button
          type="button"
          disabled={view.players.length < MIN_PLAYERS}
          onClick={() => api.act({ type: 'startGame' })}
          className="rounded-xl bg-emerald-400 py-3 text-lg font-bold text-emerald-950 shadow-lg hover:bg-emerald-300 disabled:opacity-40"
        >
          {view.players.length >= MIN_PLAYERS ? t('wait.start') : ai ? t('wait.addAiToStart') : t('wait.waitingFriends')}
        </button>
      ) : (
        <p className="text-center text-emerald-100/70">{t('wait.waitingHost')}</p>
      )}

      <RulesPanel />

      <button type="button" onClick={api.leaveRoom} className="text-sm text-white/50 hover:text-white">
        {ai ? t('wait.back') : t('wait.leave')}
      </button>
    </main>
  );
}

/** Clipboard API needs HTTPS; on a plain-http LAN address fall back to execCommand. */
async function copyText(text: string) {
  if (window.isSecureContext && navigator.clipboard) return navigator.clipboard.writeText(text);
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
}
