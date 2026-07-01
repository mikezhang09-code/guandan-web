# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Two Chinese card games (掼蛋 Guandan and 升级/拖拉机 Shengji), 1 human vs. 3 rule-based AI, played entirely
client-side. Zero dependencies, zero build step, zero backend — each game is a single self-contained HTML
file with inline `<style>` and `<script>`. There is no npm/package.json, no bundler, no test framework.

## Running / testing

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```
or just open `index.html` directly in a browser.

There is no automated test suite in the repo. Per the README, rule-engine correctness (combo detection,
comparison, follow-suit legality, card conservation, full-game flow) was validated via ad-hoc headless
AI-vs-AI simulation during development, not via a committed test file — there is nothing to `npm test`.
When changing game logic, the practical way to verify is to play it in a browser (or write a throwaway
headless script that requires the file and runs `aiMove`/`newGame` in a loop) rather than looking for an
existing test command.

Deployment is automatic: GitHub Pages serves the `main` branch root, so anything pushed to `main` goes
live at the URL in `README.md` within about a minute. There is no CI/staging gate.

## File map

| File | Role |
|---|---|
| `index.html` | Landing page, links to the two games |
| `guandan.html` | 掼蛋 (Guandan) — full game, self-contained |
| `shengji.html` | 升级/拖拉机 (Shengji/Tractor) — full game, self-contained |
| `help.html` | Illustrated rules for both games (tab-switched, `showTab('guandan'|'shengji')`) |
| `voices.js` | Generated manifest (`window.VOICE_PHRASES`, `window.VOICE_BASE`) — **do not hand-edit** |
| `voices/<seat>/<index>.mp3` | Pre-rendered TTS clips; `seat` 0-3 maps to a distinct voice, `index` is the phrase's position in `VOICE_PHRASES` |
| `tools/gen_voices.py` | Regenerates `voices/` + `voices.js` via Baidu TTS (needs `BAIDU_TTS_API_KEY`/`BAIDU_TTS_SECRET_KEY`) |

`guandan.html` and `shengji.html` do not share code — each duplicates its own copy of `makeDeck`,
`shuffle`, `sortHand`, `Sound`, etc. When fixing a bug that's conceptually present in both (e.g. deck
construction, card rendering), check whether the twin file needs the same fix.

## Architecture inside each game file

Both `guandan.html` and `shengji.html` follow the same internal layering (see the `/* ==== */` banner
comments in each file for exact line ranges):

1. **Sound synthesizer (`Sound` object)** — Web Audio API for SFX (click/deal/warn tones) plus an
   `<audio>`-based voice-line player that looks up pre-recorded clips in `voices/` by phrase index from
   `voices.js`. Muted state persists in `localStorage` (`game_sound_muted`).
2. **Card/deck primitives** — `makeDeck` (2×54, two-deck 108-card game), `shuffle`, rank/value helpers.
   Guandan's "level card" (级牌) and Shengji's "trump" (主牌) shift the ranking depending on
   `level`/`trumpSuit`, so raw `rank` is never compared directly — always through `rvCard`/`tval`-style
   helpers that fold in the current level/trump.
3. **Combo detection & comparison** — pure functions that classify a card selection (single/pair/triple,
   straights, tractors, bombs, etc.) and compare two combos to decide who wins a trick/beats a play.
4. **AI move generation** — `genMoves`/`aiMove`/`aiLead`/`aiFollow`-style functions build candidate legal
   plays and use heuristics (avoid breaking bombs/pairs, cooperate with partner) to pick one. This is
   deterministic given hand state + `Math.random()` for tie-breaks — no external model/API calls.
5. **Game state & flow control** — module-level `let` globals (`players`, `phase`, `trick`, `level`/
   `trumpSuit`, etc.) plus a step function (`step()` in Guandan, phase-driven `startTrick`/`takeTurn`/
   `commit`/`resolveTrick` in Shengji) that advances turns, alternating between human input and `aiMove`.
6. **Human input handlers** — `onPlay`/`onPass`/`onHint`/`toggleCard`, wired to the DOM at the bottom of
   the file.
7. **Rendering** — `renderSeat`/`renderHand`/`renderAll`/`cardEl`, which re-render from the global state
   after every action rather than doing incremental DOM patches.

Game-specific mechanics worth knowing before touching logic:

- **Guandan**: `level` is a single shared number (2-14); the red-suit card matching the level is wild
  (`isWild`, 百搭/逢人配). Includes tribute/anti-tribute (进贡/还贡, `runTribute`/`processReturns`/
  `autoReturn`) after each deal, based on the previous deal's finishing order.
- **Shengji**: `teamLevels` tracks each team's level independently; `trumpSuit` is chosen by the dealer
  via bidding (`declareOptions`/`setDeclaration`), and trump-ness is `isTrump` (joker, or rank===level, or
  suit===trumpSuit) — deliberately simplified vs. real rules (no draft-time bid stealing; tractors can
  only "ruff" — 将吃 — within the same suit). Dealer buries 8 kitty cards (`beginBury`/`confirmBury`)
  after seeing them.

Both files intentionally simplify some real-world rules (documented in the README) — don't "fix" those
simplifications without checking they're not deliberate scope decisions.

## Voice phrase manifest

`voices.js` is generated output. If a new spoken phrase is needed, add it in
`tools/gen_voices.py`'s `build_phrases()` — **only append to the end of the phrase list**, since existing
`voices/<seat>/<index>.mp3` files are matched by index position; inserting/reordering silently breaks
already-generated audio. Then rerun the script with valid Baidu TTS credentials to regenerate `voices.js`
and the mp3s.
