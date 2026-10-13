# Generate only missing Rogue Cards illustrations

The source of truth is the JavaScript `CATALOGUE` in `src/tabletop-data.js` and its
`CARD_ART` mapping in `src/tabletop-view.js`. Do not maintain a separate
CSV or fixed-size list for art generation. New Rooms can provisionally reuse existing
artwork; the generator treats these shared assignments as **missing unique art**.
This is currently the case for 18 of the 129 cards.

## Setup (once)

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r scripts/illustration-requirements.txt
```

Export `GEMINI_API_KEY` in the current shell. The generator also accepts the
previous spelling `GEMENI_API_KEY`.

## Usage

```sh
npm run art:check              # no API calls; list missing art
npm run art:missing            # generate only missing art, at 1K
npm run art:missing -- --limit 3  # spend at most three image calls
```

After adding a card to the real card catalogue, run `npm run art:missing`.
New cards and cards borrowing another card's PNG get the next unused numeric PNG
filename. The generator automatically adds or replaces their `CARD_ART` entries.
Original images and their own mappings are never regenerated or renumbered.
The generated PNGs are written directly into
`assets/illustrations/` so the website and print layout use them immediately.

**Prompt:** the individual card title followed by the literal contents of
`scripts/illustration-style.txt`. No subject descriptions, visual hooks, batch
lists, per-card accent colors or injected instructions are sent.

**Reference chaining:** the highest-numbered completed illustration is the
initial reference, including when resuming a partial run. From then on, each
newly generated illustration is the sole reference for the next generation.
If none exists, supply `--reference /path/to/image.jpg`.
No image generation is run by CI or automatically on git push.

**Model:** `gemini-3.1-flash-image`, `1K`, JPEG API response, saved as PNG. This
is a billable Google API call only for a missing file. The script stops at the
first failure, and rerunning it continues with the remaining missing images.
Review the generated images, then commit the new PNGs and the updated art map.

Limitations: the script is for newly added cards and missing images, not for
renaming old cards or bulk regenerating existing illustrations. Adding cards
may also require separate updates to the game's fixed-size tests and rules.
