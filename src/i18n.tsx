// Client-side language: provider, hook, the EN/ID toggle and the localized brand.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { translate, translateError, translateMsg, type Locale, type Msg, type MsgParam } from '../shared/types';

const STORAGE_KEY = 'kobu.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'id') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('id') ? 'id' : 'en';
}

interface I18n {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, MsgParam>) => string;
  tm: (m: Msg) => string;
  te: (serverError: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
  }, []);

  // Title bar + <html lang> follow the language.
  useEffect(() => {
    document.title = translate(locale, 'app.name');
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      tm: (m) => translateMsg(locale, m),
      te: (e) => translateError(locale, e),
    }),
    [locale, setLocale],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n must be used inside <I18nProvider>');
  return v;
}

/** Small EN | ID switch. */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('lang.label')} className={`flex shrink-0 rounded-full bg-black/30 p-0.5 text-[0.65rem] font-bold ${className}`}>
      {(['en', 'id'] as const).map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          onClick={() => setLocale(l)}
          className={`rounded-full px-2 py-1 uppercase transition ${locale === l ? 'bg-emerald-400 text-emerald-950' : 'text-emerald-100/70 hover:text-white'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** "Tokecang's Kobu" (EN) / "Kobu Tokecang" (ID), with the yellow "o" logo mark. */
export function Brand({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const { locale } = useI18n();
  const kobu = (
    <span>
      K<span className="text-yellow-300">o</span>bu
    </span>
  );
  const tokecang = <span className={size === 'lg' ? 'text-emerald-200' : 'text-emerald-200/90'}>{locale === 'en' ? "Tokecang's" : 'Tokecang'}</span>;
  if (size === 'lg') {
    return (
      <h1 className="font-display font-bold leading-none tracking-tight">
        {locale === 'en' ? (
          <>
            <span className="block text-2xl">{tokecang}</span>
            <span className="block text-6xl">{kobu}</span>
          </>
        ) : (
          <>
            <span className="block text-6xl">{kobu}</span>
            <span className="block text-2xl">{tokecang}</span>
          </>
        )}
      </h1>
    );
  }
  return (
    <h1 className="flex shrink-0 items-baseline gap-1 whitespace-nowrap font-display font-bold leading-none">
      {locale === 'en' ? (
        <>
          <span className="text-sm">{tokecang}</span>
          <span className="text-xl sm:text-2xl">{kobu}</span>
        </>
      ) : (
        <>
          <span className="text-xl sm:text-2xl">{kobu}</span>
          <span className="text-sm">{tokecang}</span>
        </>
      )}
    </h1>
  );
}
