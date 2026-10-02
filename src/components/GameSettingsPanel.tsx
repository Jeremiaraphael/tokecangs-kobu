import { INITIAL_PEEKS, type GameAction, type GameSettings } from '../../shared/types';
import { useI18n } from '../i18n';

interface Props {
  settings: GameSettings;
  editable: boolean;
  act: (a: GameAction) => void;
}

/** Host picks the variant before a game; everyone else sees what was chosen. */
export function GameSettingsPanel({ settings, editable, act }: Props) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 rounded-2xl border border-white/10 bg-black/25 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-200/70">
        {t('settings.title')} {!editable && <span className="normal-case tracking-normal text-white/40">{t('settings.hostDecides')}</span>}
      </h2>
      <Segmented
        label={t('settings.cards')}
        value={settings.handSize}
        options={[
          { value: 4, label: t('settings.n4') },
          { value: 6, label: t('settings.n6') },
        ]}
        editable={editable}
        onChange={(handSize) => act({ type: 'configure', settings: { handSize } })}
      />
      <Segmented
        label={t('settings.ace')}
        value={settings.aceValue}
        options={[
          { value: 1, label: t('settings.ace1') },
          { value: 0, label: t('settings.ace0') },
        ]}
        editable={editable}
        onChange={(aceValue) => act({ type: 'configure', settings: { aceValue } })}
      />
      <p className="text-xs text-emerald-100/60">
        {t('settings.peekNote', { n: INITIAL_PEEKS })}
      </p>
    </div>
  );
}

function Segmented<T extends number>({
  label,
  value,
  options,
  editable,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  editable: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <div className="flex rounded-full bg-black/30 p-0.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            disabled={!editable}
            onClick={() => o.value !== value && onChange(o.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
              o.value === value ? 'bg-emerald-400 text-emerald-950' : 'text-emerald-100/70 enabled:hover:text-white'
            } disabled:cursor-default`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
