// Turns the current stage into "what can I click and what does it do".
// Board components stay dumb: for every card they ask `canPick(ref)` and call
// `onPick(ref)`; multi-card selections (swaps) are collected here.
import { useEffect, useState } from 'react';
import {
  INITIAL_PEEKS,
  cardLabel,
  cardPoints,
  cardPower,
  cardsIn,
  sameSlot,
  type CardFace,
  type GameAction,
  type PlayerView,
  type SlotRef,
} from '../../shared/types';
import { useI18n } from '../i18n';

export interface ControlButton {
  label: string;
  onClick: () => void;
  tone?: 'primary' | 'danger' | 'neutral' | 'snap';
  disabled?: boolean;
}

export interface TurnControls {
  prompt: string;
  /** Secondary line: power name + step counter, or what you peeked. */
  detail?: string;
  tone: 'idle' | 'active' | 'secret';
  buttons: ControlButton[];
  canPick: (ref: SlotRef) => boolean;
  onPick: (ref: SlotRef) => void;
  /** '1' / '2' for a card picked in a pending swap, otherwise null. */
  pickLabel: (ref: SlotRef) => string | null;
  canDeck: boolean;
  canDiscard: boolean;
  onDeck: () => void;
  onDiscard: () => void;
}

const no = () => false;
const noop = () => {};

export function useTurnControls(view: PlayerView, act: (a: GameAction) => void): TurnControls {
  const { t } = useI18n();
  // Local, not-yet-sent selections.
  const [picks, setPicks] = useState<SlotRef[]>([]);
  const [matching, setMatching] = useState(false); // choosing which own card to match the drawn card with
  const [snapping, setSnapping] = useState(false); // choosing which card to snap onto the discard pile

  // Any server update that changes the turn/step clears half-made selections.
  const stepKey = view.stage.kind === 'power' ? view.stage.stepIndex : '';
  // In the combo step, keep selections until MY hand changes (other players' snaps shouldn't clear them).
  const myHandKey = view.players.find((p) => p.id === view.you)?.hand.map((c) => (c ? 1 : 0)).join('') ?? '';
  const stageKey =
    view.stage.kind === 'combo'
      ? `${view.phase}|${view.currentPlayerId}|combo|${myHandKey}`
      : `${view.phase}|${view.currentPlayerId}|${view.stage.kind}|${stepKey}|${view.log.at(-1)?.id}`;
  useEffect(() => {
    setPicks([]);
    setMatching(false);
  }, [stageKey]);

  // Snapping is possible any time during play (not mid-power) while there's a discard and you hold cards.
  const me = view.players.find((p) => p.id === view.you)!;
  const top = view.discardTop;
  const canSnap = view.phase === 'playing' && view.stage.kind !== 'power' && !!top && cardsIn(me.hand).length > 0;
  // Snap mode survives unrelated updates (other players' moves) but ends when the pile changes.
  const pileKey = `${view.discardCount}|${top ? cardLabel(top) : ''}|${canSnap}`;
  useEffect(() => {
    setSnapping(false);
  }, [pileKey]);

  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '?';
  const current = view.currentPlayerId ? nameOf(view.currentPlayerId) : '';
  const myTurn = view.phase === 'playing' && view.currentPlayerId === view.you;
  const isMine = (ref: SlotRef) => ref.playerId === view.you;
  const pts = (f: CardFace) => t('tc.pts', { n: cardPoints(f, view.settings) });
  const describe = (ref: SlotRef) =>
    isMine(ref) ? t('tc.yourCardRef', { n: ref.slot + 1 }) : t('tc.theirCardRef', { name: nameOf(ref.playerId), n: ref.slot + 1 });
  const picked = (ref: SlotRef) => picks.some((p) => sameSlot(p, ref));
  const powerName = (p: string) => t(`power.${p}.name`);

  const base: TurnControls = {
    prompt: '',
    tone: 'idle',
    buttons: [],
    canPick: no,
    onPick: noop,
    pickLabel: (ref) => {
      const i = picks.findIndex((p) => sameSlot(p, ref));
      return i < 0 ? null : String(i + 1);
    },
    canDeck: false,
    canDiscard: false,
    onDeck: noop,
    onDiscard: noop,
  };

  // ── Snap mode (overrides the normal turn controls while choosing a card) ──
  if (snapping && canSnap && top) {
    return {
      ...base,
      tone: 'active',
      prompt: t('tc.snapPrompt', { top: cardLabel(top), rank: top.rank }),
      detail: t('tc.snapDetail'),
      canPick: () => true,
      onPick: (ref) => {
        setSnapping(false);
        act({ type: 'snapDiscard', target: ref, expect: top });
      },
      buttons: [{ label: t('common.cancel'), onClick: () => setSnapping(false), tone: 'neutral' }],
    };
  }

  const turn = ((): TurnControls => {
    // ── Initial peek ──
    if (view.phase === 'peeking') {
      if (me.ready) return { ...base, prompt: t('tc.waitPeek') };
      const peeked = me.hand.filter((c) => c?.face).length;
      const left = INITIAL_PEEKS - peeked;
      const one = INITIAL_PEEKS === 1;
      return {
        ...base,
        tone: 'active',
        prompt:
          left > 0
            ? one
              ? t('tc.peekOne')
              : t('tc.peekMany', { left, peeked, total: INITIAL_PEEKS })
            : t(one ? 'tc.memoriseOne' : 'tc.memoriseMany'),
        canPick: (ref) => isMine(ref) && left > 0 && !me.hand[ref.slot]?.face,
        onPick: (ref) => act({ type: 'initialPeek', slot: ref.slot }),
        buttons: [{ label: t(one ? 'tc.readyOne' : 'tc.readyMany'), onClick: () => act({ type: 'ready' }), tone: 'primary', disabled: left > 0 }],
      };
    }

    if (view.phase !== 'playing') return base;
    const s = view.stage;

    // ── Someone else's turn ──
    if (!myTurn) {
      let prompt = t('tc.isThinking', { name: current });
      if (s.kind === 'decideDrawn') prompt = t('tc.isDeciding', { name: current });
      if (s.kind === 'combo') prompt = t('tc.isCombo', { name: current });
      if (s.kind === 'power') {
        const what =
          s.step === 'peekOwn' ? 'tc.whatPeekOwn' : s.step === 'peekOpp' ? 'tc.whatPeekOpp' : s.step === 'review' ? 'tc.whatReview' : 'tc.whatSwap';
        prompt = t('tc.isUsing', { name: current, power: powerName(s.power), card: cardLabel(s.face), what: t(what) });
      }
      const cur = view.players.find((p) => p.id === view.currentPlayerId);
      const buttons: ControlButton[] =
        view.hostId === view.you && cur && !cur.connected
          ? [{ label: t('tc.skipTurn', { name: cur.name }), onClick: () => act({ type: 'skipTurn' }), tone: 'neutral' }]
          : [];
      return { ...base, prompt, buttons };
    }

    // ── My turn ──
    switch (s.kind) {
      case 'draw': {
        // The discard pile is look-only: a turn is "draw from the pile" or "call Kobu".
        const buttons: ControlButton[] = [{ label: t('tc.drawBtn'), onClick: () => act({ type: 'drawDeck' }), tone: 'primary' }];
        if (!view.kobuCallerId) buttons.push({ label: t('tc.kobuBtn'), onClick: () => act({ type: 'callKobu' }), tone: 'danger' });
        return {
          ...base,
          tone: 'active',
          prompt: view.kobuCallerId ? t('tc.finalTurn', { name: nameOf(view.kobuCallerId) }) : t('tc.yourTurn'),
          buttons,
          canDeck: true,
          onDeck: () => act({ type: 'drawDeck' }),
        };
      }

      case 'combo': {
        const selected = picks.filter(isMine);
        const n = selected.length;
        const placed = me.hand[s.placedSlot];
        const topText = top ? t('tc.topParen', { card: cardLabel(top) }) : '';
        return {
          ...base,
          tone: 'active',
          prompt:
            n === 0
              ? t('tc.comboPrompt', { top: topText })
              : n >= 2
                ? t('tc.comboSelectedMany', { n })
                : t('tc.comboSelectedOne', { top: topText }),
          detail: [placed ? t('tc.comboPlaced', { n: s.placedSlot + 1 }) : null, t('tc.comboWrong')].filter(Boolean).join(' '),
          canPick: (ref) => isMine(ref),
          onPick: (ref) => setPicks(picked(ref) ? picks.filter((p) => !sameSlot(p, ref)) : [...picks, ref]),
          buttons: [
            {
              label: n ? t('tc.throwN', { n }) : t('tc.throw'),
              onClick: () => act({ type: 'comboMatch', slots: selected.map((p) => p.slot) }),
              tone: 'danger',
              disabled: n === 0,
            },
            { label: t('tc.endTurn'), onClick: () => act({ type: 'finishTurn' }), tone: 'neutral' },
          ],
        };
      }

      case 'decideDrawn': {
        const face = s.face!;
        const power = cardPower(face);
        const haveCards = cardsIn(me.hand).length > 0;

        if (matching) {
          return {
            ...base,
            tone: 'active',
            prompt: t('tc.matchPrompt', { rank: face.rank }),
            detail: t('tc.matchDetail'),
            canPick: isMine,
            onPick: (ref) => act({ type: 'matchDrawn', slot: ref.slot }),
            buttons: [{ label: t('common.cancel'), onClick: () => setMatching(false), tone: 'neutral' }],
          };
        }

        const buttons: ControlButton[] = [
          {
            label: power ? t('tc.discardUse', { power: powerName(power) }) : t('tc.discardCard', { card: cardLabel(face) }),
            onClick: () => act({ type: 'discardDrawn' }),
            tone: power ? 'primary' : 'neutral',
          },
        ];
        if (haveCards) buttons.push({ label: t('tc.matchBtn', { rank: face.rank }), onClick: () => setMatching(true), tone: 'danger' });
        return {
          ...base,
          tone: 'secret',
          prompt: t('tc.drewPrompt', { card: cardLabel(face), pts: pts(face) }),
          detail: [
            power ? t('tc.drewPower', { power: powerName(power), help: t(`power.${power}.help`) }) : null,
            t('tc.drewMatch', { rank: face.rank }),
          ]
            .filter(Boolean)
            .join(' · '),
          canPick: isMine,
          onPick: (ref) => act({ type: 'swapDrawn', slot: ref.slot }),
          canDiscard: true,
          onDiscard: () => act({ type: 'discardDrawn' }),
          buttons,
        };
      }

      case 'power': {
        const stepTag =
          t('tc.stepTag', { power: powerName(s.power), card: cardLabel(s.face) }) +
          (s.stepCount > 1 ? t('tc.stepOf', { i: s.stepIndex + 1, n: s.stepCount }) : '');
        const seen = s.peeked.filter((p) => p.face).map((p) => t('tc.cardIs', { ref: describe(p.ref), card: cardLabel(p.face!), pts: pts(p.face!) }));
        const skip: ControlButton = { label: t('tc.skipPower'), onClick: () => act({ type: 'skipPower' }), tone: 'neutral' };

        switch (s.step) {
          case 'peekOwn':
            return {
              ...base,
              tone: 'active',
              prompt: t('tc.peekOwn'),
              detail: [stepTag, ...seen].join(' · '),
              canPick: isMine,
              onPick: (ref) => act({ type: 'peek', target: ref }),
              buttons: [skip],
            };

          case 'peekOpp':
            return {
              ...base,
              tone: seen.length ? 'secret' : 'active',
              prompt: seen.length ? t('tc.peekOppAfter', { seen: seen.join('. ') }) : t('tc.peekOpp'),
              detail: stepTag,
              canPick: (ref) => !isMine(ref),
              onPick: (ref) => act({ type: 'peek', target: ref }),
              buttons: [skip],
            };

          case 'review':
            return {
              ...base,
              tone: 'secret',
              prompt: t('tc.review', { seen: seen.join('. ') }),
              detail: stepTag,
              buttons: [{ label: t('tc.done'), onClick: () => act({ type: 'endPeek' }), tone: 'primary' }],
            };

          case 'blindSwap': {
            const own = picks.find(isMine);
            const opp = picks.find((p) => !isMine(p));
            return {
              ...base,
              tone: 'active',
              prompt: !own && !opp ? t('tc.blindStart') : !own ? t('tc.blindOwn') : t('tc.blindOpp'),
              detail: stepTag,
              canPick: () => true,
              onPick: (ref) => {
                if (picked(ref)) return setPicks(picks.filter((p) => !sameSlot(p, ref)));
                // One pick per side: a new own/opponent pick replaces the previous one.
                const next = [...picks.filter((p) => isMine(p) !== isMine(ref)), ref];
                setPicks(next);
                const a = next.find(isMine);
                const b = next.find((p) => !isMine(p));
                if (a && b) act({ type: 'swap', a, b });
              },
              buttons: [skip],
            };
          }

          case 'swapAny':
            return {
              ...base,
              tone: 'secret',
              prompt: picks.length === 0 ? t('tc.swapAny') : t('tc.swapSecond'),
              detail: [stepTag, ...seen.map((x) => `🤫 ${x}`)].join(' · '),
              canPick: () => true,
              onPick: (ref) => {
                if (picked(ref)) return setPicks(picks.filter((p) => !sameSlot(p, ref)));
                const next = [...picks, ref];
                if (next.length === 2) {
                  setPicks(next);
                  act({ type: 'swap', a: next[0], b: next[1] });
                } else setPicks(next);
              },
              buttons: [{ label: t('tc.dontSwap'), onClick: () => act({ type: 'skipPower' }), tone: 'neutral' }],
            };
        }
      }
    }
    return base;
  })();

  // Offer "Snap" alongside whatever else you can do right now (also on other players' turns).
  if (!canSnap) return turn;
  return { ...turn, buttons: [...turn.buttons, { label: t('tc.snapBtn'), onClick: () => setSnapping(true), tone: 'snap' }] };
}
