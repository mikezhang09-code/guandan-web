# Handoff: Mobile 掼蛋 (Guandan) & 升级·拖拉机 (Shengji) Card Games

## Overview
Two playable, single-player-vs-3-AI Chinese card games designed for mobile (iPhone), each with a landing/game-select screen and a full in-game board. Both games are rendered inside an iPhone bezel and support **portrait and landscape**. All copy is in Chinese. Two visual **directions** are provided side-by-side for comparison:

- **Direction A — 毡影 / "Feltwork"**: warm felt table (emerald for Guandan, teal for Shengji), ivory serif cards, gold accents.
- **Direction B — 墨玉 / "Ink & Jade"**: dark charcoal surfaces, geometric bold type, single accent color (jade `#2BD4A8` for Guandan, cobalt `#5B9CFF` for Shengji), tidy card rows.

The two directions are **skins over one shared game engine** — same rules, AI, and interactions; only theme values differ. Pick one direction to ship (or make it a user setting).

## About the Design Files
The files in this bundle are **design references implemented in HTML/JS** — a working prototype showing the intended look, rules, and behavior. They are **not** production code to paste directly into a shipping app. The task is to **recreate these designs in the target codebase's environment** (React Native / Flutter / Swift / a web stack, etc.), using its established patterns, component library, and state management.

That said, the **game logic is genuinely reusable**: `guandan-engine.js` and `shengji-engine.js` are plain, DOM-free ES5 classes with a clean `view()` snapshot + action API. They can be ported almost verbatim (or wrapped) as the game core; only the rendering/theming layer needs to be rebuilt natively.

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, card sizing, and interactions are all defined. Recreate the UI closely using the codebase's libraries. The two directions are both hifi; the developer implements the chosen one.

## Architecture (how the prototype is structured)
- **`guandan-engine.js`** / **`shengji-engine.js`** — headless game engines. No DOM, no framework. Each is instantiated with callbacks and exposes a render-ready snapshot.
- **`Mobile Card Games.dc.html`** — the view layer: a component that instantiates the engines, renders the iPhone frame, landing screen, and boards, and wires taps → engine actions. It renders **both directions** (`#1a`, `#1b`) on one canvas.

### Engine API (both engines)
Construct:
```js
const g = new GuandanGame({
  onUpdate: () => rerender(),      // called whenever state changes — re-read g.view()
  onEvent: (kind) => playSound(kind), // 'deal','play','pass','declare','tribute','win','victory','defeat','warn','click','tick'
  aiDelay: 620                     // ms between AI actions (Guandan only)
});
g.newGame();
const v = g.view();                // immutable render snapshot (see below)
```
Human actions (call, then the engine fires `onUpdate`):
- Both: `toggle(cardId)` select/deselect a card · `play()` · `hint()` · `sort()` · `overlayContinue()` (dismiss end-of-round overlay)
- Guandan: `pass()`
- Shengji: `humanDeclare(suit, strength)` · `confirmDeclare()` · `skipDeal()` · `confirmBury()` (or `play()` during bury)

`view()` returns flat, display-ready data — never reach into engine internals. Key fields:
- Common: `players[]` (`name`, `count`, `isTurn`, `lastShown` = array of card metas or `'pass'`), `hand[]` (card metas with `sel`), `overlay` (`{title, body, btn}` or null), `logs[]`, `canPlay`, `gameOver`.
- Card meta: `{ id, rank, suitSym, suit, red, joker, trump, point, wild, sel }`.
- Guandan extra: `level`, `teamLevels[2]`, `needBeat`, `returnMode`, `canPass`.
- Shengji extra: `phase` (`'deal'|'declare'|'bury'|'play'`), `trumpName`, `levelText`, `dealerName`, `defPoints`, `suitPalette[]`, `declarerSeatIdx`, `declSuitSym`, `declFlash`, `leading` (per player), `lastTrickPts`, `dealt`/`dealTotal`.

## Screens / Views

### 1. Landing / Game Select
- **Purpose**: Choose 掼蛋 or 升级·拖拉机.
- **Layout**: Vertical column (portrait) / row (landscape). Kicker + big title 「扑克牌桌」, then two large tappable game cards stacked, then a footer hint.
- **Game card**: title (掼蛋 / 升级·拖拉机), tagline, one-line rule summary, and a call-to-action (「进入牌局 ›」 / 「开始 →」).
  - Direction A: felt-gradient card with a faint suit glyph watermark, gold CTA pill.
  - Direction B: dark panel with a colored left border, numeric index (01/02), accent-colored CTA.
- **Interaction**: tap a card → `enter(dir, game)` creates a fresh engine and switches to the board.

### 2. Game Board (shared skeleton, both games)
Top → bottom:
- **Status bar** (fake 9:41 / signal) — cosmetic.
- **Header**: back (‹ → home), rotate (⟳ → toggle portrait/landscape), mute (🔊/🔇), centered title, and 2 stat chips on the right (Guandan: 你方/对方 levels; Shengji: 主牌/打).
- **Info line**: one line of live status (whose turn, what must be beaten, current phase).
- **Table** (flex-1, position:relative): three opponent seats (左家 left, 对家 top, 右家 right); each seat is a name chip (highlighted when it's their turn) + remaining-count. Played cards ("piles") are absolutely positioned near each seat. A center element shows contextual info.
- **Hand section** (bottom): the player's fanned hand (horizontal scroll, or wrapped rows in Direction B portrait) + a control bar of buttons.
- **Overlay**: end-of-round / event modal with title, multi-line body, and a continue button.

## Interactions & Behavior

### Card selection
Tap a card to select; selected cards **lift up ~16px** with an accent glow + ring (`translateY(-16px)`, `box-shadow: 0 12px 22px accent, 0 0 0 2px accent`). Transition `.12s`.

### Guandan (掼蛋) flow
Two decks, 4 players in 2 teams (你+对家 vs 左家+右家). Play combos to beat the last play; first team to empty both hands wins the deal; teams climb 2→…→A ("过A" wins the game).
- **进贡 / 还贡 (tribute)**: after a deal with a previous ranking, losers pay their highest card; if you're the receiver, you're prompted to return a card ≤10 (`returnMode` true → the play button becomes 「还贡」, pick one card ≤10, press it). Handled via an overlay + info line.
- **Controls**: 出牌 (play, primary) · 不出 (pass, disabled unless there's something to beat) · 提示 (hint auto-selects a legal play) · 理牌 (sort).
- **红桃级牌 = 百搭 (wildcard)**: such cards render with a small 「百搭」 tag.

### Shengji (升级·拖拉机) flow — this is the nuanced part
Two decks, 100 cards dealt, last 8 = kitty (底牌). Declarer's team must keep the defenders under 80 points.
1. **Deal (`phase:'deal'`)**: cards are dealt **progressively, animated** (2 cards / ~130ms), NOT all at once. The player's hand grows live; opponent counts climb; a center ring shows a 发牌 N/100 progress bar. A 「跳过发牌 »」 button fast-forwards.
2. **抢主 (declaring trump) happens DURING the deal**: a **suit palette sits directly above the hand** — five tiles: ♠ ♥ ♣ ♦ + 无主(王). A tile lights up (glows, becomes tappable, shown as a level-card e.g. "2♦") the moment the player holds a qualifying card (a level card of that suit → single/pair; a joker pair → 无主). Tap to declare. **AI opponents also grab trump mid-deal** and can 反主 (override) with a stronger declaration.
   - **AI declaration heuristic** (see `aiMaybeDeclare` in `shengji-engine.js`): strength-3/4 (王对/无主) grab ~0.75; strength-2 (level pair) ~0.55; a single level card grabs based on **suit concentration relative to hand size** — `share = suitLen / handLen`, `base = 0.10 + (len-4)*0.05 + max(0, share-0.26)*1.6`. So 4 cards of a suit early (small hand) is eager; 4 cards late (large hand) is passive.
   - When an AI declares, a **flash banner appears at that seat** (名字 · 亮主/反主 · 花色) and a persistent **「主 <suit>」 badge** shows under their seat chip; the header trump readout and center ring update.
3. **抢主收官 (grab window, `phase:'declare'`)**: a short ~4s window after the last card for final grabs/counters, then locks.
4. **埋底 (bury, `phase:'bury'`)**: the dealer takes the 8-card kitty into hand and must bury 8 cards back. If the human is dealer, they select exactly 8 (button shows 「埋底 N/8」, enabled at 8); 提示 auto-picks 8 low non-trump non-point cards. AI dealers bury automatically.
5. **出牌 (play, `phase:'play'`)**: standard trick play — lead a single/pair/tractor(拖拉机)/throw(甩牌); others must follow suit and match combo shape when able.
   - **Dynamic trick comparison (important behavior)**: as each seat plays, the **currently-winning pile is highlighted** with an accent glow + 「当前最大」 badge, recomputed after the 2nd, 3rd, and 4th plays. When all four are down, the winner shows **「赢墩 +N分」** for ~1.6s before the next trick leads. Pacing is deliberately ~980ms/play so each comparison reads.
   - Center shows the running **闲家得分 / 80** with a progress bar.
   - **Controls**: 出牌 · 提示 · 理牌.
- **Point cards**: 5 / 10 / K carry 5 / 10 / 10 points; marked with a small accent dot in the corner.
- **Trump cards** (`trump:true`): Direction A tints the card face + edge gold; Direction B adds an accent left-bar.

### Orientation
⟳ toggles portrait (398×812) ↔ landscape (812×398). Layout reflows: in landscape the hand collapses to a single scrolling row; in Direction B portrait the hand wraps into rows. The left seat is nudged inward in landscape to clear the dynamic island.

### Sound
Lightweight WebAudio blips synthesized per event (`onEvent`), globally mutable. Purely optional; reimplement with the platform's audio or drop it.

## State Management
- One engine instance per active game; `onUpdate` → re-render from `view()`. The view is the single source of truth for the UI — do not duplicate game state in the view layer.
- View-layer-only state: which direction, current screen (`home` | `guandan` | `shengji`), orientation, mute. Everything else lives in the engine.
- AI turns and the animated deal are driven by `setTimeout` inside the engine; on teardown call `engine.destroy()` to clear timers.

## Design Tokens

### Direction A — 毡影 / Feltwork
- Felt (Guandan): `radial-gradient(125% 92% at 50% 20%, #2f875d, #17603e 46%, #0a3623)`
- Felt (Shengji): `radial-gradient(125% 92% at 50% 20%, #327089, #1c455c 46%, #0b2637)`
- Accent (gold): `#E7C77E` · deep `#C9A65A` · soft `rgba(231,199,126,.16)`
- Ink `#FBF5E8` · sub `rgba(251,245,232,.68)`
- Card face `#FBF6EA` · trump face `#FCF3D3` · red `#BE3B2E` · black `#2C353D` · radius 12px
- Point dot `#0E9C7E`
- Fonts: display/serif `'Noto Serif SC'`; body `'Noto Sans SC'`; ranks `'Noto Serif SC'`
- Button radius 22px (pill)

### Direction B — 墨玉 / Ink & Jade
- Screen bg (Guandan): `radial-gradient(130% 80% at 50% 0%, #131c19, #0f1216 60%)`
- Screen bg (Shengji): `radial-gradient(130% 80% at 50% 0%, #141a24, #0f1216 60%)`
- Accent: jade `#2BD4A8` (Guandan) / cobalt `#5B9CFF` (Shengji)
- Ink `#EDEFF3` · sub `rgba(237,239,243,.5)`
- Panel `#181B21` · edge `rgba(255,255,255,.09)`
- Card face `#F5F6F8` · red `#E5484D` · black `#181C24` · radius 9px
- Fonts: display/body `'Noto Sans SC'` (900 for titles); ranks `'Space Grotesk','Sora'`
- Button radius 12px

### Shared
- Google Fonts: `Noto Sans SC` (400/500/700/900), `Noto Serif SC` (500/700/900), `Sora` (500–800), `Space Grotesk` (500–700).
- Card sizes: hand card 44×64 (portrait) / 40×58 (landscape); pile card 26×37 (mini); palette tile 46×58.
- iPhone frame: 398×812 portrait, bezel 13px, radius 54px, screen radius 42px, dynamic island 116×30.
- Selected-card lift: `translateY(-16px)`; transition `.12s`.
- Turn highlight: seat chip → accent background + `0 0 12px accent` glow.

## Assets
No external images. Suits are Unicode glyphs (♠♥♣♦). Card faces, table, and all chrome are pure CSS. Fonts load from Google Fonts. No icon library — the few glyphs (‹ ⟳ 🔊) are text.

## Files
- `Mobile Card Games.dc.html` — the design/view layer (both directions, landing + both boards, iPhone frame). Note: this is a "Design Component" HTML file; the top is a small template, the bulk is a JS class rendering via `React.createElement`. Read it for exact layout/spacing/theme application.
- `guandan-engine.js` — Guandan rules + AI (headless, reusable).
- `shengji-engine.js` — Shengji rules + AI incl. progressive deal, 抢主/反主, 埋底, dynamic trick comparison (headless, reusable).

## Suggested implementation path
1. Port the two engine files as the game core (they're framework-agnostic; keep the `view()` + action contract).
2. Rebuild the view layer natively: subscribe to `onUpdate`, render from `view()`, map taps to the action methods.
3. Implement one theme direction as tokens; optionally expose the other as a theme toggle.
4. Recreate the two nuanced Shengji behaviors carefully (animated deal + live 抢主 palette; per-play 「当前最大」 → 「赢墩」 comparison) — these are the heart of the feel.
