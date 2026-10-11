# Rogue Cards: Card architecture proposal (review only)

**LATEST VISUAL DIRECTION:** The uploaded reference favours much larger images and layout flexibility. [Illustration-first study](illustration-first-layout-study.html) and [design specification](illustration-first-design-spec.md) now supersede fixed-height illustrations and generic boxed text. This does not alter the prototype gameplay.


> **Updated design decision (2026-10-11):** The later [Room, Feature & Chest prototype](room-feature-prototype.md) supersedes the seven-pile assumption and the earlier eleven-role count below. The revised design has **twelve roles** (adding Feature; Chest is a Feature subtype), printed Room fixtures, matching Chest/Feature draws, optional objects accessible **only after combat**, and a separate Event/Trap trigger. Existing eleven-role study is archived here as a comparison, not the current proposed architecture. See [the focused, actual-size layout study](room-feature-layout-study.html).



**Status:** design proposal; no changes to the current deck, rulebook or renderer until approved.

## Locked constraints

Solo or co-op 1–2 Heroes; one A4 of universal rules; all special rules physically on cards. Reveal nine Rooms sequentially (three UPPER, three MIDDLE, three DEEP) and then the fixed Amulet Vault. No spatial map or return journey. Each Hero takes one meaningful action; opposed d20+ATK vs d20+DEF, d6 damage and per-Monster d6 behaviour, plus d20+WIT saves. Preserve companions, eating corpses, prayer/altars, spells/status effects, curses/equipment and traps. No hunger and no cross-run bones. Only HP counters and card orientation/presence for tracking. 90 x 130 mm portrait cards, detailed black-ink woodcut/scratchboard illustration with vintage photocopied paper; original art, not copied from the example reference image. Target of 90–120 minutes remains unverified.

## Card taxonomy (11 actual physical roles)

| Card | Represents | Location and lifecycle | Card-specific content |
|---|---|---|---|
| HERO | Persistent adventurer | Hero zone throughout game | HP, ATK, DEF, WIT, class portrait, ability slots |
| ABILITY | Hero-specific power | Two beside matching Hero; turn sideways when used; ready again next Room | Ownership, ACTION/REACTION, effect |
| COMBAT ACTION | Universal tactical choice | Three reusable face-up choices beside each Hero; rotate exhausted once-per-Room cards | STRIKE, GUARD, PRESS; clear risk/consequence |
| ROOM | Current place or complete scene | Exactly one in table centre; discard after resolving | Region, ENTER, HERE/CHOOSE, CLEAR |
| MONSTER | Live combatant, not corpse reward | On Room until slain, then Monster discard | HP, ATK, DEF, four-line d6 AI, simple DROP line |
| EVENT | Unexpected narrative choice | From regional Threat pile; discard after resolving | NOW/CHOOSE, immediate outcome |
| TRAP | Physical environmental hazard | From regional Threat pile; resolve or attach if persistent | WIT/DC, disarm, pass/fail |
| ITEM | Weapon, armour, consumable, unknown potion subtype | Finds deck into inventory/equipment/discovery area | Slot, modifiers, USE, three d6 outcomes if unknown |
| SPELL | Reusable or consumable magic | Finds deck or starting abilities; turn sideways or discard after casting | CAST, target, effect, reset/discard |
| COMPANION | Pet or follower | Finds deck into one Hero companion slot; rotate after activation | PASSIVE, ONCE PER ROOM, no pet HP |
| REWARD | Treasure, relic or edible Remains subtype | Finds deck; claimed, eaten, attached or discarded | CLAIM/EAT or PERMANENT, local d6 result if needed |

Potion is a subtype of Item; Remains is a subtype of Reward. There is no separate Corpse gameplay type, nor a separate status resource pile.

## Seven shuffled piles, not eleven decks

- Three regional **Room** stacks: UPPER, MIDDLE, DEEP. Reveal three from each, then fixed final Vault.
- Three regional **Threat** stacks: Monster, Event and Trap cards mixed by their region. A Room specifies whether to reveal a Threat; all effects come from that card. The final Warden is set aside.
- One **Finds** stack: Items, Spells, Companions and Rewards (including edible Remains and unique Relics). The printed Room or Monster DROP triggers draws.
- Heroes and their Ability/Combat Action kits are selected face-up during setup, not randomly drawn.

The number of *types* does not determine the number of piles. This is a proposal: the encounter distribution and whether named Remains require guaranteed delivery must be physically tested.

## The on-table loop

1. REVEAL: put next Room face-up in centre. Resolve ENTER; reveal a regional Threat if instructed. Keep any live Monster on that Room.
2. CONFRONT: each Hero in order chooses ONE Action, Hero Ability, Item, Spell or printed Room action. Resolve opposing d20 rolls and d6 damage. If Monster survives, it rolls its OWN d6 AI and resolves against the active Hero. Repeat until clear or all Heroes are down.
3. CLEAR: resolve Room CLEAR and Monster DROP; draw from Finds as instructed. Every conscious Hero may take one safe action (equip, exchange, eat Remains, pray, choose a Room option). Discard resolved cards, straighten rotated action/ability/spell/companion cards and reveal the next Room automatically.

No room travel action and no map. A special Room can represent either environment or a complete event/choice.

## Starter Combat Action kit proposal

Every Hero has three **visible reusable** cards, not a shuffled tactical hand. STRIKE stays ready; GUARD and PRESS are turned sideways after being played and straighten at the next Room.

- STRIKE: opposed d20+ATK vs d20+DEF; a hit deals d6. Always available.
- GUARD: instead of attacking, defend with ADV if Monster attacks during its immediate d6 response; if its attack misses, deal 1 damage. Once per Room.
- PRESS: attack with DIS; a hit deals 2d6 instead of d6. Once per Room.

Class differences belong on two separate Hero Ability cards. Monster behaviour remains a d6 table on the Monster, NOT a shared AI deck. All these effects are proposed and need playtesting before locking.

## Separate rewards and corpse eating

Monster card contains only combat and a small DROP line. A defeated edible monster may generate a named or generic **Remains Reward card**. The Remains card itself prints its EAT d6 risk/benefit table; consuming it is one safe action. Relics, consumables and treasure also occupy the Finds pile. This keeps corpses distinct from Monster mechanics without introducing a separate lookup chart. We must verify the Remains stock can satisfy printed drops, or explicitly offer an alternate reward.

## Identifying potions with no writing

Each mystery Item prints all three d6 bands: 1–2 / 3–4 / 5–6. First time an appearance is used, roll d6. Keep that consumed card in a public DISCOVERED area; orient it UPRIGHT for 1–2, RIGHT-SIDEWAYS for 3–4, or UPSIDE-DOWN for 5–6. All later copies of that appearance use the displayed result. Print the orientation key on each mystery card (not on another sheet). This is a design candidate that must be checked for confusion with sideways-exhausted cards.

## Persistent effects without token clutter

Use face-up = ready; sideways = exhausted; tucked under Hero = currently attached / ongoing. Source cards carry their own expiration/removal condition. A lasting status with no physical card to show it violates the no-extra-bookkeeping constraint; replace it with an immediate effect or a card that can remain attached. HP may use counters. Never require separate poison, cooldown, pet hunger, spell charges or paper records.

## Common visual frame, specialised interiors

Trim: **90 x 130 mm**, with 3 mm bleed when available and at least 4 mm text-safe inset from trim. Front metadata rail about 7 mm; title 10 mm; dominant original illustration panel 35–52 mm depending on type; effect panel 35–58 mm; footer 6–8 mm. Card title at least 16 pt, mechanical text target 10–11 pt with 9.5 pt practical lower bound. Exclude scratches/grunge from rule boxes.

| Type | Illustration emphasis | Distinct mechanical presentation |
|---|---|---|
| Hero | 46 mm portrait, stat edge | HP/ATK/DEF/WIT + slots for two separate Ability cards |
| Ability | 48 mm gesture | ACTION or REACTION + named skill, sideways exhaustion |
| Combat Action | 48 mm manoeuvre | d20 move text + risk/reward + upright/sideways state |
| Room | 43 mm place scene | ENTER / HERE OR CHOOSE / CLEAR |
| Monster | 34 mm creature image | HP/ATK/DEF, d6 1–2 / 3–4 / 5 / 6 four-row table, DROP |
| Event | 50 mm scene | NOW / CHOOSE two concise outcomes |
| Trap | 43 mm mechanism | WIT DC, SUCCESS / FAILURE, disarm alternative |
| Item | 52 mm object | Slot, EQUIP/USE, risk/curse; mystery uses three printed d6 bands |
| Spell | 47 mm magical action | CAST, target/WIT if needed, outcome and RESET/DISCARD |
| Companion | 50 mm creature | PASSIVE + ONCE PER ROOM activation; no pet HP |
| Reward | 55 mm treasure/remains | CLAIM / EAT / PERMANENT effect, if needed d6 test |

Visual direction: scratched printing plates, severe black-and-ivory contrasts, hand-set/typewriter titles, halftone/woodcut art, strong clean mechanical boxes, variable subjects and scenes. All illustration art should be new; the current sparse recycled SVG line sketches are placeholders. Never trade effect legibility for a distressed aesthetic. Rules panels must be readable in hand.

## Audit of current main

- **56 unique designs, 97 printed cards, only 5 recorded types:** hero, room, monster, item, potion. Missing standalone Event, Trap, Spell, Companion, Reward, Ability and Combat Action cards.
- Hero powers remain on Hero cards. Monster four-line AI AND edible corpse tables currently share the same card, contrary to the newly chosen Monster/reward separation.
- Spells and pets are currently Item records, and a few Room effects emulate Events and Traps instead of giving those cards distinct physical identities.
- Three Potions require a written discovery result; violates HP+orientation-only bookkeeping.
- The renderer uses one generic template with sparse icon-like reused SVG drawings. No specialised role hierarchy or requested original engravings.
- One-A4 rules still include ongoing POISONED and related effects without a universally visible carrier; older rules are not yet consistent with the new physical tracking discipline.
- Current unit tests mostly validate type coverage and unclipped bounding boxes; they do not establish player understanding, on-card action economy or true tabletop session length.
- Nine Rooms and the Vault exist, but no tactical hand or physical Action mechanism presently implements meaningful card-based choices.

## Next implementation stages — NOT APPROVED YET

1. **Review sample of all 11 card face layouts** at actual size and on-paper typography. Confirm corner icon meanings and photo-style art samples.
2. **Paper prototype** with two Heroes, three shared Combat Actions, two class Abilities, two Rooms, two Monsters, one Event, one Trap, one Spell, one Companion, one Remains reward and one mystery Item. Dry-run solo and co-op loops; resolve timing/conflicts.
3. **Only then** rebuild card definitions and print renderer in batches; test stock/legibility, 1p/2p combat, finite Remains supply, player usability and real playtime.
4. Finally rewrite the ONE A4 shared rules and retire the old schema. No browser gameplay simulation.

### Items needing an explicit design decision later

- Threat stack mix and how often a Room actually produces a Monster.
- Guaranteed/remains drops without a separate corpse pile.
- How co-op damage scales when a Monster responds after every Hero action.
- Whether three-way identification via card rotation is sufficiently intuitive.
- Whether 90–120 minutes is realistic with ten sequential Rooms.

**Do not begin the large refactor or merge this proposal into production rules without design approval.**
