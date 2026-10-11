# Rogue Cards — Monochrome illustrations (10 images)

Drop this folder at `assets/illustrations/` in the repository. Images are original generated assets prepared for the low-detail black-and-ivory card style.

| File | Suggested card |
| --- | --- |
| `cave_delver.png` | Hero / Cave Delver |
| `floating_eye.png` | Monster / Floating Eye |
| `rusty_key.png` | Item / Rusty Key |
| `smoky_potion.png` | Item / Smoky Potion |
| `flooded_chamber.png` | Room / Flooded Chamber |
| `abandoned_storeroom.png` | Room / Abandoned Storeroom |
| `goblin_scavenger.png` | Monster / Goblin Scavenger |
| `ironbound_chest.png` | Feature / Ironbound Chest |
| `strange_feeling.png` | Event / A Strange Feeling |
| `cracked_oracle.png` | Feature / Cracked Oracle |

All images are PNG, 1024×1536 px. Individual artwork is not automatically connected to card definitions. The current `src/tabletop-view.js` renderer still uses `src/art.js` SVGs, so wire image paths explicitly in the renderer/card data before they will display on live cards.

Example web URL after pushing to main: `https://tpepels.github.io/rogue_cards/assets/illustrations/cave_delver.png`
