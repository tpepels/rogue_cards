# ROGUE CARDS

**A black-and-white photocopied dungeon. One life. Many bad ideas.**

[Play on GitHub Pages](https://tpepels.github.io/rogue_cards/)

A solo-first card roguelike with oversized **90 × 140 mm** printable specimens, minimal pen-and-ink vector art, a deliberately rough 1980s zine layout and a playable browser prototype.

## What's in issue 001

- **Play**: Choose one of four heroes; explore six dungeon floors; fight monsters; eat, pray and find supplies; defeat the Amulet Warden; then return alive with the Amulet of Yendor.
- **Unknown potions**: Five appearances are mapped to five identities at the start of every run. Discover their effects by drinking or throwing them. The same appearance remains consistent throughout a run.
- **A few systemic effects**: Water amplifies frost; keys open locked doors and jam traps; the Floating Eye punishes melee; a Rust Monster damages defence; invisibility and blindness prevent attacks.
- **Cards**: 34 large-format printable prototypes across heroes, monsters, items, potions, rooms and events. All drawings are original small SVG illustrations rendered in the browser, not raster art.
- **Field notes**: A short playable manual and an honest description of missing mechanics.
- **No framework / no runtime dependency / no build step**. Browser persistence uses localStorage; no account is needed.

## GitHub Pages

Pages should be configured to deploy **from main / root**. The website is index.html at the repository root, uses relative paths throughout, and works under /rogue_cards/. No Actions deployment workflow is needed.

Open https://tpepels.github.io/rogue_cards/ after GitHub Pages publishes the branch. If Pages is configured to publish a different branch or docs folder, adjust the Pages source.

## Run locally

Use any static file server; JavaScript modules cannot be opened directly as file URLs in most browsers.

    python3 -m http.server 8000
    # open http://localhost:8000

## Tests

Node.js 20+:

    npm test

Optional **browser geometry tests** using Playwright + Chromium (development only):

    npm install
    npx playwright install chromium
    npm run test:visual

Browser checks cover 375–1440px widths, horizontal overflow, clipped card regions,
mobile gameplay controls, and the physical dimensions and sheet count in print mode.
These tests are not required for GitHub Pages deployment; the site has no runtime dependencies.

Tests cover run initialization, deterministic appearance mappings, catalogue integrity, legal actions, exploration, potion discovery, win condition and death. The tests are intentionally **not a deployment gate** during rapid prototyping.

## Printing

Open **Cards** and select **Print / Save PDF**. The browser's print layout uses A4 sheets, **four 90 × 140 mm cards per page**, arranged 2 × 2. Disable browser-generated headers and footers, select scale 100%, and avoid “fit to page”. Cards use only black ink and white paper and do not require downloaded fonts.

## Files

- src/data.js — single source of truth for cards, monsters, rooms, heroes and potion effects
- src/art.js — spare, hand-drawn-style SVG linework for every card
- src/card-view.js — shared, HTML-escaped renderer and explicit print-sheet pagination
- styles/phase1.css — adaptive large-card layout and 90 × 140 mm A4 print contracts
- tests/presentation.test.mjs — lightweight markup and print-sheet tests
- tests/visual.spec.mjs — optional headless Chromium visual geometry tests
- src/engine.js — isolated, deterministic seeded run engine
- src/app.js — DOM-based interface, catalogue, game and field notes
- styles.css — responsive layout, 1980s xerox zine style and print rules
- tests/ — native Node tests

## Scope and limitations

This release is a **vertical slice**, not a complete NetHack adaptation or final print-and-play game. The dungeon is a linear six-floor path, not a spatial dungeon with branches. Shops, equipment slots, real curses/blessings, corpse eating, prayer reputation, pets as independent agents, procedural map connections and a full physical tabletop ruleset are **not yet implemented**. Cards in the gallery are design specimens; some describe future systems not available in this playable slice.

**Design direction:** Large readable typography; few marks per illustration; black ink; photocopy textures kept away from text; consistent top strips and action language; interesting interactions with very little rules overhead.

This is an original roguelike card-game prototype and not an official NetHack product.

## Phase 1 changes

- Cards now retain a readable width across desktop/tablet/phone breakpoints instead of squeezing into narrow columns.
- The mobile play screen shows health, hunger, floor, encounter, and available actions before the long session log.
- Potion identifications remain visible in a notebook even after the last bottle of that type is consumed.
- Starting another run asks for confirmation before deleting a living run.
- Field Notes match the engine: newly revealed monsters attack after the player's **next** action.
- Browsers print explicit four-card sheets rather than relying on CSS grid auto-pagination.
- Screen and print modes share a pure, separately testable card renderer.

See [the Phase 1 acceptance checklist](docs/phase-1-audit.md) for verification and known limitations.
