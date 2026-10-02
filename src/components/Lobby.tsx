import { useState, type FormEvent } from 'react';
import type { KobuApi } from '../hooks/useKobu';
import { Brand, LanguageToggle, useI18n } from '../i18n';

const NAME_KEY = 'kobu.name';
const load = (k: string) => {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
};

export function Lobby({ api }: { api: KobuApi }) {
  const { t } = useI18n();
  const [name, setName] = useState(() => load(NAME_KEY));
  const [code, setCode] = useState(() => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '');
  const [busy, setBusy] = useState(false);

  const remember = () => {
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      /* ignore */
    }
  };

  const run = async (fn: () => Promise<boolean>) => {
    if (!name.trim()) return api.flashError(t('lobby.enterName'));
    remember();
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const onJoin = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length < 4) return api.flashError(t('lobby.enterCode'));
    run(() => api.joinRoom(code, name.trim()));
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex justify-end">
        <LanguageToggle />
      </div>
      <div className="text-center">
        <Brand size="lg" />
        <p className="mt-3 text-emerald-100/70">{t('lobby.tagline')}</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-emerald-100/80">{t('lobby.yourName')}</span>
        <input
          value={name}
          maxLength={20}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('lobby.namePlaceholder')}
          className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-lg outline-none focus:border-yellow-300"
        />
      </label>

      {/* Singleplayer */}
      <button
        type="button"
        disabled={busy}
        onClick={() => run(() => api.createRoom(name.trim(), 'ai'))}
        className="flex items-center gap-4 rounded-2xl border border-violet-300/40 bg-violet-500/20 px-5 py-4 text-left shadow-lg transition hover:bg-violet-500/30 disabled:opacity-50"
      >
        <span className="text-3xl" aria-hidden>
          🤖
        </span>
        <span>
          <span className="block text-lg font-bold">{t('lobby.playAi')}</span>
          <span className="block text-sm text-violet-100/75">{t('lobby.playAiSub')}</span>
        </span>
      </button>

      {/* Multiplayer */}
      <section className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
        <h2 className="flex items-center gap-2 font-bold">
          <span aria-hidden>👥</span> {t('lobby.friends')}
        </h2>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => api.createRoom(name.trim(), 'multiplayer'))}
          className="w-full rounded-xl bg-emerald-400 py-3 text-lg font-bold text-emerald-950 shadow-lg transition hover:bg-emerald-300 disabled:opacity-50"
        >
          {t('lobby.create')}
        </button>

        <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-white/40">
          <span className="h-px flex-1 bg-white/15" /> {t('lobby.orJoin')} <span className="h-px flex-1 bg-white/15" />
        </div>

        <form onSubmit={onJoin} className="flex gap-2">
          <input
            value={code}
            maxLength={5}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t('lobby.code')}
            className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-yellow-300"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-yellow-300 px-5 font-bold text-yellow-950 transition hover:bg-yellow-200 disabled:opacity-50"
          >
            {t('lobby.join')}
          </button>
        </form>
      </section>

      {!api.connected && <p className="text-center text-sm text-rose-300">{t('lobby.connecting')}</p>}
    </main>
  );
}
