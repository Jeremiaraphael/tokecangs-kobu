# Tokecang's Kobu 🃏 (Kobu Tokecang)

**Tokecang's Kobu** in English, **Kobu Tokecang** in Bahasa Indonesia. Real-time Kobu for 2–6 players: play with friends (room codes) or alone against AI players. React + Tailwind front-end, Node + Socket.io game server, and a shared TypeScript rules engine.

## Run it

Requires Node.js 18+.

```bash
npm install
npm run dev        # server on :3001 + Vite client on :5173 (proxied)
```

Open http://localhost:5173, create a room, and share the code or invite link. Friends on the same Wi-Fi can join via `http://<your-LAN-IP>:5173`.

Production (one process, one port):

```bash
npm run build
npm start          # serves dist/ + websockets on $PORT (default 3001)
```

Deploy to any host that keeps a long-running Node process with WebSockets (Render, Railway, Fly.io, a VPS). Vercel/Netlify serverless functions **can't** host the Socket.io server.

Tests: `npm test` (cards & points, every power, 4/6-card modes, scoring & tie-breaks, hidden-information checks).

### Play with AI (singleplayer)

On the main menu choose **Play with AI**. You're the host: add or remove computer players (1–5 of them, so 2–6 seats in total), pick 4- or 6-card mode, and start. AI rooms are private, so nobody can join them by code. Leaving ends the game.

The AI (`shared/ai.ts`) uses simple heuristics and **plays fair**: it only uses cards it has actually seen (its own peeks, cards it drew, face-up discards). Cards it hasn't seen count as the deck average (~5 points).
- **Swapping**: it keeps any drawn Joker or black J/Q/K (≤ 0). Otherwise it swaps a card in only if that's at least 2 points better than its worst card.
- **Powers**: 7 peeks at an unseen own card, and 8 peeks at an unseen opponent card. J, Q and K give away its highest card for a known-lower opponent card, or blind-swap a known high card for an unseen one. Otherwise it skips.
- **Combo**: after a swap it throws away its biggest known same-rank group (never Jokers), or known cards matching the top discard, then ends its turn.
- **Match & Snap**: it matches or snaps (even out of turn) only with a card it has *seen* that has the same rank and is worth points, so it never takes a penalty. It keeps Jokers and black faces instead.
- **Out-slam**: it slams an opponent's card only when it *knows* the card has the top discard's rank **and** is low, because the random replacement will probably be worse for that opponent. It never slams an opponent's high card.
- **Kobu**: it calls when its estimated hand total is **≤ 5** (4-card mode) or **≤ 8** (6-card mode).
- **Pacing**: the server plays each AI step after a 1–2 s pause so you can follow the activity log.

### Test multiplayer alone with bots

Create a room in the browser, then fill it with computer players:

```bash
npm run bots -- ROOMCODE 3     # adds Bot 1..3 (up to 5)
```

### Phones (Android / iOS)

The layout is mobile-first and was checked at 320px, 360px, landscape, tablet and desktop widths:
- Your hand and the action prompt stay docked at the bottom of the screen. Opponents sit in a compact 2-column grid.
- Cards scale with the screen width. Taps have no grey flash or double-tap-zoom delay, and pull-to-refresh is disabled so a swipe can't reload mid-game. A refresh only reconnects you to your seat anyway.
- The waiting room has a native **Share…** button (on HTTPS, e.g. once deployed) and a copy-link fallback that works on plain-`http` Wi-Fi addresses.
- Phones join over Wi-Fi at `http://<your-PC-IP>:3001`. Allow Node.js through Windows Firewall for private networks.

### Languages (English / Bahasa Indonesia)

Every screen has an **EN | ID** switch. The choice is remembered per device, and the first visit follows the phone's language. The title bar, all buttons and prompts, power descriptions, the rules sheet, and error messages are translated.

The **activity log** is translated on each player's own device: the server sends every log line as a message key plus values (`LogEntry.msg`), so an English and an Indonesian player can share a room and each reads the log in their own language. All strings live in `shared/i18n.ts`. A test checks that every English string has an Indonesian version with the same placeholders.

### Bluffing: rearrange your cards

Any time during play, on anyone's turn, you can **drag one of your face-down cards onto another of your spots** to swap them. This works by touch on phones and with a mouse. A short tap is still a normal tap.
- Every other player sees the two face-down cards slide past each other in real time.
- Opponents and AI players **lose track** of the moved cards: their "seen" markers on those cards are cleared, so they must follow the slide with their own eyes. You keep what you knew.
- It isn't allowed during the initial peek, so nobody can shuffle the peek to see extra cards. A card someone is currently peeking at stays visible to them when it moves, and no other card is revealed.

### Card animations

Every card movement is animated for everyone at the table, like real cards on a table:

| Action | Animation |
|---|---|
| Draw | a face-down card slides from the draw pile to the "drawn" spot |
| Discard / swap-in | the thrown card arcs onto the discard pile and lands with a random −5°…+5° tilt (fanned stack); on a swap, the drawn card slides face-down into the hand spot at the same time |
| J / Q / K swaps | both cards cross-slide between their spots, bending past each other |
| Peek / reveal | a 3D flip face-up (initial peek, 7/8/K peeks, round-end reveal), then flips back face-down |
| Penalty / replacement | a face-down card flies from the draw pile into the hand spot |
| Match / snap / slam / combo | the card slides up and **drops** onto the pile with a scale-pop, the pile "takes the hit", plus a 🎯/⚡/💥/🔥 burst |

How it works: the server records each movement as a small public event (`motions`, never including hidden faces). Each client replays new events as "flights": a card overlay animated with the Web Animations API from the source spot to the destination. The destination stays hidden until the card lands. *Reduced motion* settings skip the flights.

## Rules

**Deck**: a standard 52-card deck plus **4 Jokers** (56 cards).

| Card | Points if still in your hand at the end | Power when **drawn from the pile and discarded** |
|---|---|---|
| A | 1 (or 0, set by the host) | – |
| 2–6, 9, 10 | face value | – |
| 7 | 7 | **Peek**: look at one of your cards |
| 8 | 8 | **Spy**: look at one opponent card |
| J | ♠♣ black = **0**, ♥♦ red = **13** | **Blind swap**: swap one of yours with an opponent's, unseen |
| Q | ♠♣ black = **0**, ♥♦ red = **13** | **Queen**: spy on an opponent card, then optionally swap **any two cards** on the table |
| K | ♠♣ black = **0**, ♥♦ red = **13** | **King**: peek one of yours + one opponent card, then optionally swap **any two cards** |
| Joker | **−1** (four Jokers = −4) | – |

- **Who goes first**: at the start of a game, one face-down card per player is offered and everyone takes one. The **lowest card by points** starts (Joker −1 < black J/Q/K 0 < A < 2 … 10 < red J/Q/K 13). Players tied for lowest automatically get new cards until exactly one is lowest. The offered cards then go back into the deck, which is shuffled before dealing. The **discard pile starts empty**, so the draw pile holds 56 − players × hand size (e.g. 48 for 2 players with 4 cards). Later rounds pass the start to the next player.
- **Modes**: the host picks **4-card** or **6-card** hands before the game. Either way, everyone peeks at just **1** of their cards at the start (`INITIAL_PEEKS` in `shared/types.ts`).
- **Turn**: draw from the pile, then **swap** it into your hand, **discard** it (and use its power), or **match** it (see below). Or call **Kobu** instead of drawing, and everyone else gets one final turn. The face-up discard pile can **never** be taken into your hand.
- **Match / Snap** 🎯: if you drew a card and remember a card of the **same rank** in your hand (any suit or colour, Joker = Joker), tap **Match** and pick that card.
  - ✅ **Right**: both cards go to the discard pile (no power fires), and your hand shrinks by one. The spot stays as an **empty gap**, so your other cards keep their positions.
  - ❌ **Wrong**: the revealed card goes back face-down in its spot, but everyone has now seen it. The drawn card is discarded without its power, and you get a **face-down penalty card** from the draw pile. It fills your first gap, or goes at the end if there's none.
- **Swap & match combo** 🔥: after you **swap** the drawn card into your hand, your hand updates immediately and the turn continues with a **combo step**. You may throw away, in one go:
  - **2 or more of your cards that share a rank** (they match each other), e.g. [4, K♠, A, J♣] → draw an Ace, swap out the 4 → throw both Aces away → [K♠, J♣] = 0 points with 2 cards; **or**
  - **one or more cards matching the top discard** (often the card you just swapped out).
  - Repeat as often as you like, then press **End turn**. A wrong combo reveals the cards (they stay), gives **+1 penalty card**, and ends the turn. The combo step exists only after a swap. Other players can still snap during it.
- **Snap onto the discard pile** ⚡: at **any time** during play, on anyone's turn, any player can tap **⚡ Snap** and drop a hand card of the **same rank as the top discard** onto the pile. The only exception is while someone is in the middle of a power.
  - ✅ **Right**: the card lands on the pile and your hand shrinks by one. Snaps can stack (Q♥ ← Q♠ ← Q♦).
  - ❌ **Wrong**: the card is revealed and stays, and you get a penalty card. The turn order never changes.
- **Out-slam an opponent's card** 💥: in snap mode you can also tap an **opponent's** card that you know matches the top discard's rank.
  - ✅ **Right**: their card goes onto the pile (with the flying-card animation and a "💥 SLAM!" burst). They immediately get a **replacement** from the draw pile, face-down in the same spot. **Nobody** has seen the replacement, not even its owner. Your own hand doesn't change.
  - ❌ **Wrong**: their card is flipped back face-down in place (everyone saw it), and **you**, the guesser, get the +1 penalty card.
  - The activity log names both players, e.g. "Alice correctly matched Bob's card #2…" or "Alice incorrectly guessed Bob's card #2… and received a penalty card".
  - **Fair timing**: a snap includes the top card you saw. If the pile changed a split second before your tap, the snap is rejected **without** a penalty.
  - **Animation**: see *Card animations* below.
  - Hand sizes now vary, so the fewer-cards tie-breaker really matters. A badge shows anyone with more or fewer cards than the mode's normal count. Powers skip steps that are impossible with empty hands.
- **Scoring**: the standing is hand points first, then **fewer cards** to break a tie.
  - If the caller is strictly best, they score **their hand total** (e.g. −2) with no penalty.
  - Otherwise the caller scores hand **+10**. The best-standing other player scores 0, or their hand if it's negative.
  - Everyone else scores their hand. The game ends when someone reaches 100, and the lowest total wins.
- **Empty draw pile**: the discard pile (minus its top card) is reshuffled into a new draw pile.
- **Memory aids**: the 👁 badge marks cards *you* have seen, and lettered dots show who else has seen a card. The badges never show values.
- **Reconnects**: a secret token in `localStorage` reclaims your seat after a refresh, and joining with the same name takes back a disconnected seat. The host can skip a disconnected player's turn.

## Architecture

```
├─ shared/                 ← imported by BOTH server and client
│  ├─ cards.ts             card model: Suit/Rank/CardFace, cardPoints, cardPower, POWER_STEPS, deck
│  ├─ i18n.ts              English + Indonesian strings, translate(), log messages, error translations
│  ├─ types.ts             GameState, PlayerView, GameAction, socket event contracts
│  ├─ engine.ts            the rules: deal, turn reducer, power steps, Kobu, scoring, add/remove AI
│  ├─ ai.ts                AI controller: nextBotMove() / decideBotAction() heuristics
│  └─ view.ts              toPlayerView(): per-player sanitised snapshot
├─ server/
│  ├─ index.ts             Express + Socket.io, broadcasts a private view to each player
│  └─ rooms.ts             RoomManager: room codes, sessions/tokens, reconnects, cleanup, AI move scheduler
├─ scripts/bots.ts         external test bots that join a multiplayer room (npm run bots)
├─ src/                    React client
│  ├─ socket.ts            socket.io-client + per-browser secret token
│  ├─ i18n.tsx             language provider, useI18n(), EN|ID toggle, localized brand
│  ├─ hooks/useCardDrag.ts drag your own cards to rearrange them (pointer events → touch + mouse)
│  ├─ hooks/useKobu.ts     connection, server view, create/join/leave/act
│  ├─ hooks/useTurnControls.ts   stage/step → prompt, buttons, which cards can be picked, swap/match/snap selection
│  ├─ hooks/useBoardAnimations.ts motions + lastMatch events → flights, hidden destinations, combo burst
│  ├─ App.tsx              Lobby → WaitingRoom → GameBoard
│  └─ components/
│     ├─ Lobby.tsx         main menu: Play with AI · Play with friends (create / join by code)
│     ├─ WaitingRoom.tsx   player list, invite link (multiplayer) or add/remove AI (singleplayer), game mode, Start
│     ├─ StarterDrawScreen.tsx  "who goes first?": pick a face-down card, reveal, tie redraws, deal
│     ├─ GameSettingsPanel.tsx  4/6-card mode + Ace value (host edits, others see)
│     ├─ GameBoard.tsx     layout: opponents / piles / docked action bar + your hand / sidebar
│     ├─ PlayerArea.tsx    one player's hand (4 → 1×4; 6 → 3×2 for opponents, 1×6 for you)
│     ├─ Card.tsx          two-sided 3D-flip card: rank + suit (red/black), Joker, point chip, power label, badges
│     ├─ CenterPiles.tsx   draw pile, drawn card / power-in-progress, fanned discard stack + MATCH/SNAP burst
│     ├─ FlyingCards.tsx   cards travelling across the board (slide / arc / impact, Web Animations API)
│     ├─ ActionBar.tsx     prompt + detail line (step x of y, what you peeked) + buttons
│     ├─ ActivityLog.tsx   live game log
│     ├─ Scoreboard.tsx    running totals
│     ├─ ResultsModal.tsx  revealed hands, points, penalty / best hand / winner
│     └─ RulesPanel.tsx    rules cheat-sheet
└─ tests/                engine.test.ts (rules) · ai.test.ts (AI decisions, fairness, full bot-only games)
```

### Why server-authoritative

The whole game is about hidden information, so the full `GameState` (every card, the draw pile) lives **only on the server**. Clients send intents (`GameAction`) and receive `PlayerView`s built by `toPlayerView(state, playerId)`, which strips every card face that player isn't entitled to see at that moment. Even a player reading the network traffic can't cheat.

Each action is applied to a `structuredClone` of the state and only committed if the engine doesn't throw a `GameError`. An illegal move can't leave a half-applied turn behind.

### Game state (server)

```ts
CardFace { rank: 'A'|'2'…'10'|'J'|'Q'|'K'|'JOKER', suit: 'S'|'C'|'H'|'D'|null }
Card extends CardFace { id, knownBy: playerId[] }      // knowledge travels with the card

GameState {
  roomCode, mode: 'multiplayer' | 'ai', hostId, phase: 'lobby' | 'starterDraw' | 'peeking' | 'playing' | 'roundOver' | 'gameOver',
  settings: { handSize: 4 | 6, aceValue: 0 | 1, targetScore },
  round, players: Player[],
  drawPile: Card[], discardPile: Card[],   // last element = top
  currentPlayerIndex, startingPlayerIndex, // starter rotates each round
  stage: TurnStage,
  kobuCallerId, highlights: SlotRef[], log: LogEntry[], lastResult, winnerIds,
  starterDraw: { offered: Card[], picks: {playerId: index}, redraws: [...][], pool, winnerId } | null
}
Player { id, name, isBot, connected, hand: (Card | null)[], initialPeeks: number[], ready, totalScore }
//      hand starts with handSize cards; null = gap left by a matched card (positions never shift)

TurnStage =
  | { kind: 'draw' }                                         // draw / take discard / call Kobu
  | { kind: 'decideDrawn', card }                            // swap it in, or discard it
  | { kind: 'power', power, card, step, peeked: Peek[] }     // walking through POWER_STEPS[power]

POWER_STEPS = {
  peekOwn:   ['peekOwn', 'review'],               // 7
  spy:       ['peekOpp', 'review'],               // 8
  blindSwap: ['blindSwap'],                       // J
  queen:     ['peekOpp', 'swapAny'],              // Q
  king:      ['peekOwn', 'peekOpp', 'swapAny'],   // K
}
```

### Turn flow (state machine)

```
lobby ─startGame─▶ starterDraw ─pickStarter × N (or host autoPickStarter)─▶ reveal, auto-redraw ties
      ─host dealCards─▶ peeking ─initialPeek + ready (everyone)─▶ playing
  │──callKobu──────────────────────────────────────────▶ end turn   (others get 1 turn each)
  └─drawDeck─▶ decideDrawn ──swapDrawn(slot)─▶ combo ──comboMatch(slots)* ─ finishTurn ─▶ end turn   (no power)
                    │                                    └─ wrong combo ─▶ +1 penalty, end turn
                    │──matchDrawn(slot)── same rank ─────▶ both discarded, hand −1, end turn
                    │                  └─ different ─────▶ card stays (now public), +1 penalty card, end turn
                    └──discardDrawn── A–6, 9, 10, Joker ▶ end turn
                                   └─ 7, 8, J, Q, K ──▶ power, step by step:
                                        peekOwn / peekOpp  ── peek(target) ──▶ next step
                                        blindSwap          ── swap(own, opp) ─▶ next step
                                        swapAny            ── swap(any, any) ─▶ next step
                                        review             ── endPeek ───────▶ next step
                                        any step           ── skipPower ─────▶ end turn
                                      after the last step ─────────────────▶ end turn
end turn: if the next player is the Kobu caller ─▶ reveal & score
```

Ideas for later: turn timer, lock the Kobu caller's cards from swaps (a common house rule), a "match the discard" snap rule (would make the fewer-cards tie-breaker matter), animations, and Redis-backed rooms for multi-instance hosting.
