import type { TurnControls } from '../hooks/useTurnControls';

const BTN = {
  primary: 'bg-emerald-400 text-emerald-950 hover:bg-emerald-300',
  danger: 'bg-rose-500 text-white hover:bg-rose-400',
  neutral: 'bg-white/10 text-white hover:bg-white/20',
  snap: 'bg-amber-300 text-amber-950 hover:bg-amber-200',
};

const TONE = {
  idle: 'border-white/10 bg-black/25 text-emerald-100/80',
  active: 'border-yellow-300/60 bg-yellow-300/10 text-yellow-50',
  secret: 'border-violet-300/60 bg-violet-500/15 text-violet-50',
};

/** The single "what should I do now?" strip under the piles. */
export function ActionBar({ controls }: { controls: TurnControls }) {
  if (!controls.prompt && !controls.buttons.length) return null;
  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-2 text-center sm:flex-row sm:gap-3 sm:px-4 sm:py-3 sm:text-left ${TONE[controls.tone]}`}
    >
      <div className="flex-1">
        <p className="text-sm font-medium leading-snug sm:text-base">{controls.prompt}</p>
        {controls.detail && <p className="mt-0.5 text-xs leading-snug opacity-75">{controls.detail}</p>}
      </div>
      {controls.buttons.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {controls.buttons.map((b) => (
            <button
              key={b.label}
              type="button"
              disabled={b.disabled}
              onClick={b.onClick}
              className={`min-h-10 rounded-full px-3.5 py-2 text-sm font-bold shadow transition sm:px-4 disabled:cursor-not-allowed disabled:opacity-40 ${BTN[b.tone ?? 'neutral']}`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
