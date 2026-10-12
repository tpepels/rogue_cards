# Rogue Cards illustration catalogue

The site renders the generated PNG artwork at `assets/illustrations/` using the explicit `CARD_ART` table in `src/tabletop-view.js`. At present **all 40 uploaded PNGs** are connected to a canonical card; remaining cards retain temporary SVG fallback artwork until generated PNGs are added.

The uploaded full-card illustrations use black ink, off-white paper and one spot accent color. The website must **not apply a grayscale CSS filter** to these PNGs. The same files are used in the screen catalogue and printable cards.

| Canonical card key | Image file |
| --- | --- |
| `hero:warrior` | `cave_delver.png` |
| `hero:knight` | `wandering_knight.png` |
| `hero:wizard` | `hedge_wizard.png` |
| `hero:witch` | `marsh_witch.png` |
| `hero:rogue` | `cutpurse.png` |
| `hero:thief` | `tunnel_thief.png` |
| `hero:priest` | `ash_priest.png` |
| `hero:monk` | `roadless_monk.png` |
| `monster:rat` | `giant_rat.png` |
| `monster:goblin` | `goblin_scavenger.png` |
| `monster:crawler` | `sewer_crawler.png` |
| `monster:bat` | `cave_bat_swarm.png` |
| `monster:troll` | `bridge_troll.png` |
| `monster:wisp` | `will_o_wisp.png` |
| `monster:eye` | `floating_eye.png` |
| `monster:mold` | `living_mold.png` |
| `monster:wraith` | `restless_shade.png` |
| `monster:sentinel` | `iron_sentinel.png` |
| `room:u-passage` | `dripping_passage.png` |
| `room:u-gate` | `rusty_gate.png` |
| `room:u-supply` | `abandoned_storeroom.png` |
| `room:u-nest` | `rat_nest.png` |
| `room:u-shrine` | `abandoned_shrine.png` |
| `room:u-fall` | `collapsing_stairs.png` |
| `room:u-fountain` | `laughing_fountain.png` |
| `room:u-merchant` | `merchant_in_a_sack.png` |
| `room:u-lamp` | `lamp_eater.png` |
| `room:u-puppet` | `the_puppet_judge.png` |
| `room:u-bookcase` | `bookcase_of_teeth.png` |
| `room:u-mimic` | `chest_with_a_pulse.png` |
| `room:m-flood` | `flooded_chamber.png` |
| `room:m-statue` | `cracked_oracle.png` |
| `room:m-vault` | `ironbound_chest.png` |
| `room:m-crypt` | `opened_crypt.png` |
| `room:m-altar` | `candle_altar.png` |
| `room:d-oracle` | `strange_feeling.png` |
| `item:key` | `rusty_key.png` |
| `item:rope` | `knotted_rope.png` |
| `item:torch` | `pitch_torch.png` |
| `potion:smoky` | `smoky_potion.png` |

To add an illustration, save its PNG here, add its `type:id` mapping in `CARD_ART`, and run `npm test`. The tabletop test enforces a one-to-one mapping between the folder's PNG files and the card catalogue. Only map an illustration after its asset has actually been committed. Adding a filename without the corresponding PNG would create a broken image on the site.
