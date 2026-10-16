# Generate missing Rogue Cards illustrations

The generator reads **every printable card design** from the JavaScript sources:

- The original 139 engine cards from `src/tabletop-data.js`, with artwork in `CARD_ART` in `src/tabletop-view.js`.
- The 24 additional Rooms and Items from `src/print-expansion.js`, whose PNGs and `PRINT_ONLY_ART` assignments are already present.
- The twelve new Monsters from `src/monster-expansion.js`, whose artwork remains blank until generated.

The generator now includes **175 designs**. The first **163 PNGs already exist** (139 original cards and 24 expansion cards). The twelve new regional Monsters need images, assigned stable filenames numbered **164–175**, even if generated in a different order.

## Setup (once)

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/illustration-requirements.txt
```

Export `GEMINI_API_KEY` in the current terminal. `GEMENI_API_KEY` is also supported for backward compatibility.

## Preview without spending credits

```sh
git pull --ff-only
python3 scripts/generate-illustrations.py --dry-run
# Expected before generating the new regional Monsters:
# Catalogue: 175 cards; existing: 163; missing: 12.
```

The dry run lists the twelve new Monster filenames in print-catalogue order. It does not make API requests or update mappings.

## Generate gradually or all at once

```sh
python3 scripts/generate-illustrations.py --limit 3
python3 scripts/generate-illustrations.py --dry-run
python3 scripts/generate-illustrations.py
```

`npm run art:check`, `npm run art:missing`, and `npm run art:missing -- --limit 3` are equivalent shortcuts.

Each generated PNG is placed into `assets/illustrations/`, and the corresponding assignment is updated in **the right source file**. For new Monsters, the script adds their entries to `PRINT_ONLY_ART` only after each PNG has been generated. The renderer only accepts filenames matching the card title, so `cards.html` and `decks.html` automatically show the new images without engine changes or modifications to the canonical `CARD_ART` map.

**Prompt:** just the card title plus the literal contents of `scripts/illustration-style.txt`. No card mechanics, extra description or image-selection instructions are inserted.

**Reference:** `scripts/reference.jpg` is the first image if present (the previously selected mushroom/skeleton style reference). Override with `--reference path/to/reference.png`. Later images use the immediately previous newly generated image; after an interrupted run, a new run again starts from the supplied/default reference.

**Model:** `gemini-3.1-flash-image`, 1K output, converted to PNG. Calls are billable. No image generation runs in CI or on push. Generation stops at an error; rerunning continues with ungenerated cards.

After reviewing, commit the generated PNGs and the updated `src/print-expansion.js`. Existing images, unrelated mappings and executable gameplay remain unchanged.
