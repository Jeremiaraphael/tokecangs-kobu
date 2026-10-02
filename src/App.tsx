import { GameBoard } from './components/GameBoard';
import { Lobby } from './components/Lobby';
import { StarterDrawScreen } from './components/StarterDrawScreen';
import { WaitingRoom } from './components/WaitingRoom';
import { useKobu } from './hooks/useKobu';
import { useI18n } from './i18n';

export default function App() {
  const api = useKobu();
  const { view, resuming, error } = api;
  const { te } = useI18n();

  let screen;
  if (!view) screen = resuming && api.connected ? null : <Lobby api={api} />;
  else if (view.phase === 'lobby') screen = <WaitingRoom view={view} api={api} />;
  else if (view.phase === 'starterDraw') screen = <StarterDrawScreen view={view} api={api} />;
  else screen = <GameBoard view={view} api={api} />;

  return (
    <>
      {screen}
      {error && (
        <div
          role="alert"
          className="animate-pop fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold shadow-xl"
        >
          {te(error)}
        </div>
      )}
    </>
  );
}
