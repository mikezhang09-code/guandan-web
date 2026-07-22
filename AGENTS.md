# Repository Guidelines

## Project Structure & Module Organization

This is a dependency-free static web app. `index.html` is the game selector; `guandan.html` and
`shengji.html` contain the complete Guandan and Shengji games, including inline CSS and JavaScript;
`help.html` contains illustrated rules. Shared presentation assets are in `theme.css` and `theme.js`.
Audio is stored under `voices/<seat>/`, with its generated manifest in `voices.js`. Tooling for
regenerating voice assets lives in `tools/` (when present). Keep the two game files conceptually in
sync when changing duplicated card, sound, or rendering behavior.

## Build, Test, and Development Commands

There is no build step, package manager, or backend. Run a local server with:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` and test through `index.html`. Opening the HTML files directly also
works, but a local server better matches deployment on GitHub Pages.

## Coding Style & Naming Conventions

Use four-space indentation for JavaScript and consistent existing HTML/CSS formatting. Preserve the
self-contained structure and existing section banners in each game file. Use descriptive camelCase
for JavaScript functions and variables, PascalCase only for constructor-like values, and kebab-case
for CSS classes. Avoid adding dependencies or extracting shared code unless the change clearly
justifies the added complexity.

Do not hand-edit `voices.js`. Add new phrases at the end of `build_phrases()` in
`tools/gen_voices.py`, then regenerate audio with the required Baidu TTS credentials.

## Testing Guidelines

No automated test suite or coverage requirement is committed. After logic changes, play both games in
a browser and exercise deal, bidding/tribute, legal-follow, scoring, and end-of-game flows. For
engine changes, use an ad-hoc headless AI-vs-AI simulation to check card conservation and complete
rounds; do not commit throwaway scripts unless they become maintained tests.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects such as `Fix Shengji follow-suit validation` or `Add rules example`.
Pull requests should explain the behavior change, identify affected game pages, mention manual tests,
and include screenshots or a short recording for visible UI changes. Link the relevant issue when one
exists. Changes pushed to `main` deploy automatically through GitHub Pages, so verify locally first.
