# Rogue Cards V2 — Phase 2 Item and Potion ecology

**Status:** implemented and printable for design review, but **not** a complete V2 game. V1 remains canonical, including its rules and print quantities.

[Browse and print V2 Items and Potions](../v2-objects.html) · [Browse 36 V2 Rooms](../v2-rooms.html) · [V2 one-page playtest rules](../rules-v2.html)

## Catalogue

| Family | Unique cards | What differs between them |
| --- | ---: | --- |
| TOOL | 8 | Keys, Rope, Torch, Crowbar, Chalk, Spore Jar, Coin, Needle; reliable and risky alternatives |
| EQUIPMENT | 6 | Weapons/armour with meaningful defence, attack and curse trade-offs |
| COMPANION | 4 | Hound, Raven, Moth and Pocket Goblin; each changes a class of decisions |
| RELIC | 4 | Rare one-copy artifacts with exceptional effects and costs |
| SCROLL | 8 | Single-use fire, frost, lightning, revelation, banishment, unlocking, chaos and last-resort magic |
| RING | 7 | One equipped at a time; often roll once per Room; some cursed |
| WAND | 7 | Distinct d6 misfires, damage and utilities; exhaust sideways until recharged |
| POTION | 8 | First-use identification that applies to every Potion of the same name |
| **Total** | **52** | **44 unique Items plus 8 mystery Potions** |

The physical print quantity deck has **84 copies (21 A4 sheets)**, with duplicates concentrated in mundane and consumable objects. All 52 unique card faces also print as a 13-sheet one-each gallery. Card dimensions stay **90 × 130 mm, four per A4 sheet**. Use category filters and the quantities toggle for proofing.

## Why the effects are on cards

- **Opposed d20 combat** is unchanged. Items can alter ATK, DEF, WIT, damage, initiative of a response or specific card interactions. The Scroll of Banishment cannot defeat the fixed Warden.
- **Three-outcome d6 records** handle common risk/reward effects. Four-outcome records (1–2, 3–4, 5, 6) appear on high-variance Scrolls, Wands and Potions.
- **Wands** are powerful but scarce: each can be used while upright, then lies sideways until a SHRINE card lets you forego its Room choice to straighten that Wand; the rare Lantern Heart can also be discarded to straighten one. A low roll can misfire, or in one Wand's case destroy it. A Wand cannot generate unlimited resources in a Room.
- **Rings** occupy a single equipment slot, usually providing one printed risk/reward activation per Room. Cursed Rings can only be removed after a printed cleansing interaction.
- **Scrolls** are discarded after activation, even on a failed or disastrous roll.
- **Potions** are identified by their first-use d6 result. Keep one spent copy face-up; matching names use that same result later. No reference table or written identification log.
- **Reliable mundane tools** remain valuable. Rusty Key chooses the highest printed outcome at named locks, Knotted Rope affects falls/bridges, Pitch Torch helps with darkness and fungi. These are not all forced to roll just to justify a die.
- **Card placement** is the tracking mechanism. Turn once-per-Room ability cards sideways, while passive equipped bonuses still apply; exhausted Wands do not reset automatically. Kept relics or once-use Room rewards are actual cards.

## Cross-card interaction matrix

These are real printed conditions/effects, not merely notes in the source code:

| Connection | Room side | Item side |
| --- | --- | --- |
| Named lock tools | Rusty Gate, Buried Lockbox, The Talking Door, The Last Chest | Rusty Key or Wand of Almost Doors; Scroll of Unsealing for some locks |
| Fall/terrain | Collapsing Stairs, Flooded Chamber, Bridge of Whispering Rope, Broken Bridge | Knotted Rope; Scroll of Hush; Wand of Cold Shoulders |
| FIRE property | Lamp-Eater, Fungal Garden, Choir of Mushrooms | Pitch Torch, Ring of Embers, Lantern Heart, Scroll of Cinder |
| MAGIC property | Ghostly Auction, Lost Reliquary, Mirror of Regrets | Scrolls, Wands, Rings and magical Relics |
| METAL property | Beetle Caravan | Rusty Key, Crowbar, armour, swords, Ghost Coin |
| ALCHEMY property | Laughing Fountain | Spore Jar, all mystery Potions, Antidote |
| SHRINE and CURSED | Abandoned Shrine, Candle Altar, Crown of the Unking | Whispering Blade, Burial Mail, Hungry Ring, magical Wands |
| Merchant and bargain | Merchant in a Sack, Ghostly Auction, Beetle Caravan, Midnight Bazaar | Ghost Coin, Pocket Goblin, Ring of Small Deals, Wand of Bad Trades |
| Lore and foresight | Bookcase of Teeth, Broken Oracle, Clockwork Confessional | Tunnel Raven, Mirror Shard, Third Sight, Ring of the Sideways Eye |
| Poison and fungus | Fungal Garden, Buried Lockbox, Choir of Mushrooms | Antidote, Coffin Moth, Bone Needle, Ring of the Mold King |
| Negotiating with lairs | Rat Nest, Opened Crypt, Warden's Threshold | Loyal Hound, Pitch Torch, Scroll of Go Away |

The tags FIRE, MAGIC, METAL, ALCHEMY and CURSED have consequences in Room choices or explicit Item effects. When one specific Room explicitly names an Item, the name must match a printed V2 card. Other tags (ICE, BONE, KNOWLEDGE, BARGAIN, etc.) are printed labels that later Monster or Room redesigns can explicitly reference.

## Consistency constraints and remaining gaps

- **V1 stays untouched.** The old \`src/tabletop-data.js\`, printed V1 deck, current \`rules.html\` and \`index.html\` mechanics are unchanged. The new data is in \`src/v2-objects.js\`. Both V2 galleries reuse the shared *presentation* renderer.
- **V2 is not balanced or fully migrated yet.** Existing Monster behaviour, health, damage curves, Hero abilities and final Vault still use V1 definitions. Phase 4 will adapt them; Phase 5 will test full campaigns, Item distribution and emergent combinations.
- **No automatic Item drops from generic tags.** Shared properties do not have effects by themselves; only printed Room/Item text can consume or inspect a tag.
- **No additional trackers.** One Ring and sideways Wands are already covered by the revised V2 one-A4 rules. A card can modify the current Room or next d20, but should not require a cross-run log.
- **Some V1 items were retired or transformed.** Quick Dagger, Moth-Eaten Cloak and Bandages are absent from this draft; renamed spell Scrolls replace the old flat spell effects. Do not treat old card quantities as silently included in V2.
- **Illustration assignments:** existing committed illustrated titles (e.g. Rusty Key and Smoky Potion) still reuse those images; all other V2 cards use the same deterministic monochrome placeholders as the existing print renderer. Newly generated but uncommitted user illustrations are not claimed as installed.

## Verification

The active Node tests validate counts, printed identifiers, full 1–6 coverage of **every** d6 result table, three- and four-result partitioning, nonoverlap, wand exhaustion and shrine recharge, scroll consumption, Potion first-use labels, named V2 Item compatibility, Room target references, mechanical use of FIRE/MAGIC/METAL/ALCHEMY, no V1 integration and printed card geometry.

Playwright verifies all 52 preview and all 52 print faces for content clipping, title/paper collisions and A4 size, plus family filtering and full print-quantity behaviour. This protects mechanical text, but does **not** replace ink-and-paper print proofing or full solo/co-op game balance tests.

**Next:** Phase 3 - audit the interaction graph, detect isolated or redundant cards, and build deliberate combinations before Phase 4 migrates Monsters/Heroes.
