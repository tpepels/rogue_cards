# Generate missing Rogue Cards illustrations

The generator reads **every printable card design** from the JavaScript sources:

- The original 139 engine cards from `src/tabletop-data.js`, with artwork in `CARD_ART` in `src/tabletop-view.js`.
- The 24 print-only expansion cards from `src/print-expansion.js`, with their current temporary assignments in `PRINT_ONLY_ART` in the same file.

The generator now includes **163 designs**. The original 139 PNGs are not regenerated. The 24 expansion cards still have provisional artwork-map entries for planning, but these aliases are **never displayed**: their illustration areas stay blank until they have their own PNGs. All 24 are therefore correctly treated as **missing unique illustrations**. New files begin at `140_...` if the original 139 files are present.

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
# Expected before generating the expansion:
# Catalogue: 163 cards; existing: 139; missing: 24.
```

The dry run lists the 24 new filenames in print-catalogue order. It does not make API requests or update mappings.

## Generate gradually or all at once

```sh
python3 scripts/generate-illustrations.py --limit 3
python3 scripts/generate-illustrations.py --dry-run
python3 scripts/generate-illustrations.py
```

`npm run art:check`, `npm run art:missing`, and `npm run art:missing -- --limit 3` are equivalent shortcuts.

Each generated PNG is placed into `assets/illustrations/`, and the corresponding assignment is updated in **the right source file**. For print-only cards, the script replaces their individual entry in `PRINT_ONLY_ART`. The renderer only accepts filenames matching the card title, so `cards.html` and `decks.html` automatically show the new images without engine changes or modifications to the canonical `CARD_ART` map.

**Prompt:** just the card title plus the literal contents of `scripts/illustration-style.txt`. No card mechanics, extra description or image-selection instructions are inserted.

**Reference:** `scripts/reference.jpg` is the first image if present (the previously selected mushroom/skeleton style reference). Override with `--reference path/to/reference.png`. Later images use the immediately previous newly generated image; after an interrupted run, a new run again starts from the supplied/default reference.

**Model:** `gemini-3.1-flash-image`, 1K output, converted to PNG. Calls are billable. No image generation runs in CI or on push. Generation stops at an error; rerunning continues with ungenerated cards.

After reviewing, commit the generated PNGs and the updated `src/print-expansion.js`. Existing images, unrelated mappings and executable gameplay remain unchanged.
