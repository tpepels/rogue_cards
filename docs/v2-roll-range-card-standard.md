# Rogue Cards V2 — roll-range card design standard

**Status:** V2 content specification. This is for redesigning the physical cards; it is not an additional playbook or a change to the existing V1 deck. The complete common rules live on the single printable \`rules-v2.html\` page.

## Design intent

Dice are the toy. Simplify what players must remember, **not the rolling**. Players roll opposed d20s when fighting, d20+WIT to overcome dangers, and d6s to discover consequences on printed cards. Each roll should create a story, choice, risk, or new interaction—not just another +1.

A card is complete by itself. It must tell the player **when to roll, which die to roll, and what each range does**. No hidden encounter tables, trackers or phone lookups. Do not add universal procedures for an effect that can live directly on one card.

## Printed notation

Use these compact, consistent forms:

- **OPEN — ROLL d6:** 1–2 ..., 3–4 ..., 5–6 ...
- **SEARCH — ROLL d6:** 1–2 ..., 3–4 ..., 5 ..., 6 ...
- **TEST WIT DC 13:** Success ... / Failure ...
- **ATTACK:** Opposed d20+ATK against d20+DEF, as in the one-page rules.
- **MONSTER — ROLL d6 after each Hero turn:** 1–2 ..., 3–4 ..., 5 ..., 6 ...
- **EAT — ROLL d6:** ... (only on edible Monster cards)
- **FIRST USE — ROLL d6:** ... (the first consumed Potion identifies matching ones).

A card may use other d6 partitions if its ranges are complete and do not overlap. Prefer 1–2 / 3–4 / 5–6 for simple three-result discoveries and 1–2 / 3–4 / 5 / 6 for four-result creatures. Print **all** outcomes on the card; do not ask players to remember an outcome table.

## Small V2 specimen cards (proposed text, not canonical V1)

### Room — The Suspicious Chest

**OPEN — ROLL d6 (once):**
- 1–2: It's a Mimic. Draw a Monster.
- 3–4: Draw 1 Item.
- 5–6: Draw 2 Items.

**LEAVE:** Nothing happens.

*Core decision:* Risk the chest or walk away.

### Room — The Hungry Altar

**PRAY — ROLL d6 (once):**
- 1–2: Suffer d6 damage.
- 3–4: Heal d6 HP.
- 5–6: Heal d6 HP and draw 1 Item.

**STEAL:** Take 1 Item, then draw a Monster.

*Core decision:* Prayer or theft; no general Altar subsystem.

### Monster — Floating Eye

**BEHAVIOUR — ROLL d6 after each Hero turn:**
- 1–2: Stare. No attack.
- 3–4: Gaze. ATTACK.
- 5: Freeze. The next Hero attack has DIS.
- 6: Gaze. ATTACK with ADV.

**EAT — ROLL d6:**
- 1–2: Become POISONED.
- 3–4: Heal d6 HP.
- 5–6: Look at the next Room.

*Identity:* Its eye alters attacks, and its corpse grants information.

### Item — Untrustworthy Boots

**DASH — ROLL d6 (once per Room):**
- 1–2: Trip. Suffer 1 damage.
- 3–4: Dodge the next Monster attack.
- 5–6: Dodge the next Monster attack and draw 1 Item.

*Identity:* A risky tool, not another +1 DEF.

### Potion — Cloudy Tonic

**FIRST USE — ROLL d6:**
- 1–2: Suffer d6 damage.
- 3–4: Heal d6 HP.
- 5–6: Heal 2d6 HP.

Keep the spent card face up to identify later Cloudy Tonics. No writing.

### Companion — Lantern Beetle

**ONCE PER ROOM — ROLL d6 when entering a dark Room:**
- 1–2: It hides.
- 3–4: Ignore the Room's darkness penalty.
- 5–6: Ignore the darkness penalty and peek at the next Room.

*Identity:* A helper with unreliable personality.

## Deck cohesion guidelines

1. **Different reasons to roll.** Mix temptation, bargains, danger, discovery, surprise, and strange discoveries; not every roll should produce a generic Item.
2. **Cross-card interactions.** A Torch can matter to dark Rooms, certain Monsters and hidden writing. A Rope matters to pits and bridges. Let the relevant card explicitly name such exceptions.
3. **Only print a roll where the outcome matters.** Automatic effects are fine when they are shorter and more interesting. “Roll ranges everywhere” means throughout every card family, not mandatory dice on every single card.
4. **No repeated generic Rooms.** A Room should be more than “draw Monster, receive Item.” Give it one recognizable story or choice.
5. **No rules creep.** Shared combat, timing, equipment slots, and basic saving rolls stay on one A4. All unusual timing, limits, rolling ranges, costs, triggers and results belong on the card.
6. **No new counters.** HP and visible card placement/orientation are the only state. A card that needs a round timer, hunger counter or handwritten charge log should be redesigned.

## Transition from V1

The current printed V1 cards still contain **a five-Item carry limit in the rules**, **a fixed post-combat safe-action allowance**, **POISONED −2 until cured**, and some multi-Room counters. The V2 rules replace these. Before the draft can become the playable rules, audit **every Room, Hero, Monster, Item and Potion** for contradictions, then replace any effect that requires an unprinted procedure or extra state. The 90 × 130 mm physical collage card format and four-up A4 printing remain unchanged.
