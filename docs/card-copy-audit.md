# Rogue Cards - rulebook-only player usability audit

Scope: **111/111 unique printable cards** reviewed against the canonical one-A4 `rules.html`.
Evaluation asks whether a reader can choose an action, identify when to roll, resolve
the correct result and find the terms necessary **on the card or that one rulebook**.
This is a source-level usability assessment, not a substitute for observing new players.

## Shared vocabulary now explained by the one-page rulebook

- `WITH an Item` means someone carries it; `EQUIPPED` requires a slot.
- `EAT` means use the defeated Monster's printed remains once, where applicable.
- `KEEP this Room` overrides the usual discard-at-descent procedure.
- `TRAP` applies only to Room outcome bands explicitly marked TRAP.
- Existing `d6`, `d20`, `ADV`, `DIS`, `POISONED`, `PARLEY`, `SEAL`, `OVERCHARGE`,
  turn actions and once-per-Room triggers remain on that same one-page sheet.

## Specific ambiguities checked

- **Marsh Witch**: Clarified: HEX BREW triggers after the Potion or Scroll resolves.
- **Forgotten Supplies**: Clarified: discard the unwanted Item, rather than 'return' without a destination.
- **Lost Reliquary**: Clarified: TRAP is a printed Room-result keyword, matching protected bands.
- **Cave Bat Swarm**: Clarified: DIS affects the next Hero d20, not a non-d20 action.
- **Floating Eye**: Clarified: DIS affects the next Hero d20, not a non-d20 action.
- **Bridge Troll**: Clarified: FIRE damage prevents the next Regenerate behaviour.
- **Pitch Torch**: Clarified: all three qualifying dark locations are named.
- **Wand of Almost Doors**: Clarified: all four qualifying locked locations are named.
- **Ashwood Staff**: Still unresolved: no currently printed spell attacks using d20+WIT; the conditional +1 damage has no apparent trigger.

## Unresolved design decision

**Ashwood Staff:** The text now specifies exactly what would activate its
`+1 damage` bonus: a spell that makes a `d20+WIT` attack. However, the current
111-card set does not appear to contain such an attack. This is an *inert
conditional benefit*, not a missing explanation in the one-page rulebook.
Making it useful would require deciding a replacement trigger and updating
the simulation engine; it has not been silently redesigned in this edit.

## Per-card result

All cards below have a readable trigger/choice and printed outcomes by this
static audit. `Check mechanic` indicates the remaining unsupported trigger.
Word counts exclude titles, card numbering, tags and flavour text.

| # | Card | Family | Rule words | Finding |
|---:|---|---|---:|---|
| 1 | Veteran Warrior | HERO | 28 | Readable |
| 2 | Wandering Knight | HERO | 33 | Readable |
| 3 | Hedge Wizard | HERO | 28 | Readable |
| 4 | Marsh Witch | HERO | 31 | Readable |
| 5 | Cutpurse | HERO | 36 | Readable |
| 6 | Tunnel Thief | HERO | 29 | Readable |
| 7 | Ash Priest | HERO | 31 | Readable |
| 8 | Roadless Monk | HERO | 31 | Readable |
| 9 | Dripping Passage | MYSTERY | 41 | Readable |
| 10 | Rusty Gate | HAZARD | 42 | Readable |
| 11 | Forgotten Supplies | TREASURE | 42 | Readable |
| 12 | Rat Nest | LAIR | 41 | Readable |
| 13 | Abandoned Shrine | SHRINE | 44 | Readable |
| 14 | Collapsing Stairs | HAZARD | 41 | Readable |
| 15 | Laughing Fountain | MYSTERY | 51 | Readable |
| 16 | Merchant in a Sack | ENCOUNTER | 37 | Readable |
| 17 | Lamp-Eater | LAIR | 46 | Readable |
| 18 | The Puppet Judge | ENCOUNTER | 42 | Readable |
| 19 | Bookcase of Teeth | MYSTERY | 46 | Readable |
| 20 | Chest with a Pulse | TREASURE | 31 | Readable |
| 21 | Flooded Chamber | HAZARD | 46 | Readable |
| 22 | Stone Watcher | SHRINE | 39 | Readable |
| 23 | Buried Lockbox | TREASURE | 31 | Readable |
| 24 | Opened Crypt | LAIR | 42 | Readable |
| 25 | Fungal Garden | HAZARD | 38 | Readable |
| 26 | Candle Altar | SHRINE | 32 | Readable |
| 27 | Bridge of Whispering Rope | HAZARD | 46 | Readable |
| 28 | The Bottomless Well | MYSTERY | 47 | Readable |
| 29 | Ghostly Auction | ENCOUNTER | 38 | Readable |
| 30 | Clockwork Confessional | MYSTERY | 50 | Readable |
| 31 | Beetle Caravan | ENCOUNTER | 53 | Readable |
| 32 | Treasure That Sings | TREASURE | 45 | Readable |
| 33 | Lightless Hall | HAZARD | 45 | Readable |
| 34 | Broken Bridge | HAZARD | 34 | Readable |
| 35 | Lost Reliquary | TREASURE | 47 | Readable |
| 36 | Hall of Teeth | LAIR | 34 | Readable |
| 37 | Broken Oracle | MYSTERY | 57 | Readable |
| 38 | Warden's Threshold | LAIR | 40 | Readable |
| 39 | Mirror of Regrets | SHRINE | 46 | Readable |
| 40 | The Talking Door | ENCOUNTER | 52 | Readable |
| 41 | Choir of Mushrooms | MYSTERY | 41 | Readable |
| 42 | Midnight Bazaar | ENCOUNTER | 47 | Readable |
| 43 | Crown of the Unking | SHRINE | 47 | Readable |
| 44 | The Last Chest | TREASURE | 48 | Readable |
| 45 | The Amulet Vault | FINAL | 61 | Readable |
| 46 | Giant Rat | MONSTER | 49 | Readable |
| 47 | Goblin Raider | MONSTER | 55 | Readable |
| 48 | Sewer Crawler | MONSTER | 50 | Readable |
| 49 | Cave Bat Swarm | MONSTER | 53 | Readable |
| 50 | Bridge Troll | MONSTER | 52 | Readable |
| 51 | Will-o'-Wisp | MONSTER | 62 | Readable |
| 52 | Floating Eye | MONSTER | 54 | Readable |
| 53 | Living Mold | MONSTER | 50 | Readable |
| 54 | Restless Shade | MONSTER | 57 | Readable |
| 55 | Rust Monster | MONSTER | 53 | Readable |
| 56 | Forgotten Acolyte | MONSTER | 58 | Readable |
| 57 | Iron Sentinel | MONSTER | 42 | Readable |
| 58 | Amulet Warden | WARDEN | 54 | Readable |
| 59 | Warden Unbound | WARDEN | 63 | Readable |
| 60 | Rusty Key | TOOL | 14 | Readable |
| 61 | Knotted Rope | TOOL | 13 | Readable |
| 62 | Pitch Torch | TOOL | 25 | Readable |
| 63 | Dented Crowbar | TOOL | 37 | Readable |
| 64 | Chalk of Detours | TOOL | 35 | Readable |
| 65 | Spore Jar | TOOL | 32 | Readable |
| 66 | Ghost Coin | TOOL | 27 | Readable |
| 67 | Bone Needle | TOOL | 29 | Readable |
| 68 | Notched Sword | EQUIPMENT | 43 | Readable |
| 69 | Ashwood Staff | EQUIPMENT | 27 | Check mechanic |
| 70 | Whispering Blade | EQUIPMENT | 19 | Readable |
| 71 | Patchwork Mail | EQUIPMENT | 22 | Readable |
| 72 | Warded Shield | EQUIPMENT | 28 | Readable |
| 73 | Burial Mail | EQUIPMENT | 23 | Readable |
| 74 | Loyal Hound | COMPANION | 39 | Readable |
| 75 | Tunnel Raven | COMPANION | 38 | Readable |
| 76 | Coffin Moth | COMPANION | 34 | Readable |
| 77 | Pocket Goblin | COMPANION | 39 | Readable |
| 78 | Mirror Shard of Yesterday | RELIC | 46 | Readable |
| 79 | Very Helpful Skull | RELIC | 39 | Readable |
| 80 | Lantern Heart | RELIC | 21 | Readable |
| 81 | Crown of Rehearsals | RELIC | 30 | Readable |
| 82 | Scroll of Cinder | SCROLL | 49 | Readable |
| 83 | Scroll of Hush | SCROLL | 38 | Readable |
| 84 | Scroll of Storm Teeth | SCROLL | 39 | Readable |
| 85 | Scroll of Unsealing | SCROLL | 45 | Readable |
| 86 | Scroll of Third Sight | SCROLL | 44 | Readable |
| 87 | Scroll of Go Away | SCROLL | 42 | Readable |
| 88 | Scroll of Misprint | SCROLL | 52 | Readable |
| 89 | Scroll of the Last Word | SCROLL | 38 | Readable |
| 90 | Ring of Crooked Luck | RING | 39 | Readable |
| 91 | Ring of Small Deals | RING | 40 | Readable |
| 92 | Ring of the Sideways Eye | RING | 43 | Readable |
| 93 | Ring of the Mold King | RING | 34 | Readable |
| 94 | Hungry Ring | RING | 51 | Readable |
| 95 | Ring of Embers | RING | 46 | Readable |
| 96 | Ring of Echoes | RING | 49 | Readable |
| 97 | Wand of Impolite Sparks | WAND | 43 | Readable |
| 98 | Wand of Undoing | WAND | 48 | Readable |
| 99 | Wand of Questionable Shapes | WAND | 51 | Readable |
| 100 | Wand of Turning | WAND | 40 | Readable |
| 101 | Wand of Bad Trades | WAND | 43 | Readable |
| 102 | Wand of Cold Shoulders | WAND | 48 | Readable |
| 103 | Wand of Almost Doors | WAND | 53 | Readable |
| 104 | Smoky Potion | POTION | 34 | Readable |
| 105 | Milky Potion | POTION | 30 | Readable |
| 106 | Amber Potion | POTION | 37 | Readable |
| 107 | Fizzy Potion | POTION | 40 | Readable |
| 108 | Mushroom Tea | POTION | 38 | Readable |
| 109 | Midnight Ink | POTION | 40 | Readable |
| 110 | Antidote | POTION | 34 | Readable |
| 111 | Laughing Water | POTION | 36 | Readable |

## Automated safeguards

- All 111 cards render their complete canonical mechanical text.
- Every printed Room, Item, Hero and Monster preserves its dice-result bands.
- TRAP labels correspond to the same outcomes handled by the existing simulator.
- The first rule clipping is positioned in the north-east; additional text is
  kept in a separate south-west clipping. Dungeon depth appears in the footer.
- Browser checks verify the note geometry, titles, footer depth badges and
  clipping in the gallery and printable A4 sheets.

Do not interpret a passing static audit as proof that untrained human players
will make no mistakes. A blind physical playtest is still the decisive test.
