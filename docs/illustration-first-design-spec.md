# Rogue Cards — illustration-first, flexible physical card faces

**Review draft / reference image approved as direction only.** This supersedes the rigid art heights and mechanically dense card boxes in the two previous wireframe studies. Gameplay decisions, current tabletop rules and print stock on \`main\` remain unchanged.

## Design rationale

The user-supplied reference has **a small black type rail, a pasted-on ivory title, a very large image, and a compact rules area**. Importantly, its visual hierarchy changes from card to card: Hero/Monster stats sit at the side of the illustrated scene, Item/Spell/Event cards devote much more of their surface to artwork, and Rooms can put a narrow rules column beside a map/scene instead of forcing all rules beneath it. Our previous common template gave most cards the same small image panel, several boxed section headings and verbose filler; that design must be abandoned.

**The frame is shared. The art-to-rules ratio is not.**

### Non-negotiable physical invariants

- Final trim remains **90 × 130 mm**, with 3 mm bleed available for professional print, at least 4 mm text-safe inset, pure black and ivory treatment.
- One A4 shared rules sheet; printed card faces remain authoritative for card-specific effects. Do not add reference books or UI-only mechanics.
- The title is an opaque irregular ivory **paste-on strip**, allowed to overlap only the illustration. Never put rules on top of imagery.
- Illustration is **original card-specific, high-detail monochrome engraving/scratchboard**, dramatic black areas and highlights, substantial subject variation. Reusing a generic sparse SVG is a design placeholder only.
- Black type rail at top identifies \`ROGUE CARDS\` and type (Hero/Monster/Room/Item etc.). Small type ID and optional italic flavour at bottom. Omit flavour before reducing mechanics text size.
- No universal three-part rule panel with a permanent ENTER/HERE/LEAVE box on every card. Use those markers only when multiple timings genuinely matter.
- Prefer 10–11 pt mechanical type. Avoid going below 9.5 pt at actual printed size; simplify or split a too-complex effect into a named Feature card rather than shrinking text. Use dark type on clean paper.
- Artwork crop is designed per card. **Portrait** for people/creatures, **object silhouette** for Item/Chest, **wide place/map** or **split illustration/instructions** for a Room, **dramatic scene** for Event/Spell. Never force all images into one standard crop box.

## The approved flexible design system to review

| Archetype | Example | Illustration footprint | Rules placement | Reason |
|---|---|---:|---|---|
| Dominant illustration | Rusty Key, Loyal Hound, Cracked Oracle | **86 mm (~66% of height)** | 1–2 short lines in bottom band | The item IS the visual. |
| Large illustration | Cave Delver, A Strange Feeling, Needle Lock | **72–81 mm (~55–62%)** | Short bottom text; Hero stats in inset rail over art | Keep narrative image large. |
| Monster, behaviour-heavy | Floating Eye | **62 mm (~48%)** | 4 readable d6 rows and DROP beneath; HP/ATK/DEF rail over art | More mechanical content earns more area but no tiny picture. |
| Choice-heavy Feature | Ironbound Chest | **56–59 mm (~43–45%)** | PICK/FORCE or KEY/PRAY options with outcomes; use marker | Two consequential choices need full-sized type. |
| Split Room | Flooded Chamber | **78 mm (~60%)** | Narrow right-hand text over clean paper alongside large map/scene, optional tiny bottom caption | Matches visual grammar of supplied Room example. |
| Spacious Room | Abandoned Storeroom | **72–80 mm (~55–61%)** | 2 printed instructions beneath; matching Chest separate | Room card tells what is present, Chest card explains opening. |

Measurements are flexible targets **within** the 90 × 130 mm card: we should not mechanically stretch illustrations to these exact heights or let an art block clip mandatory text. Art can be taller for a one-line key or shorter for a detailed Monster. **Visual importance determines shape, not the card-type label alone.**

### Functional compositions

**Hero / Monster:** vertical stat rail left, pasted title overlapping the illustration, artwork filling the remaining top 60–80 mm. Monster behaviour stays a four-row bottom d6 table and DROP instruction (no corpse text; separate Remains Reward card). Hero class abilities live on separate cards.

**Item / Spell / Companion / Event / simple Feature / Reward:** image-dominant face, 70–86 mm illustrated area, 1–3 mechanical lines on a clean ivory strip. The richer artwork *replaces*, rather than accompanies, generic UI ornament.

**Room:** two interchangeable artwork presentations, selected per card:
- **Illustrated scene:** large full-width image, then concise ENTER/HERE (and LEAVE only if needed).
- **Map/scene split:** ~60–65% width for visual, ~35–40% clean-paper vertical column for brief ROOM/HERE instructions. Tiny bottom text only where required. The Room always explicitly establishes its Chest, Statue, altar, NPC, etc. before corresponding subtype draws.

**Chest / complex Feature:** a medium-large illustrated object, then properly separated pick/force/pray/key choices. On a long choice card, deliberately reduce artwork space **rather than the font**. A used Chest turns sideways.

**Trap:** large illustration of a mechanism, short NOW / TEST / FAIL description. Resolve/discard without new condition counters.

### Art production and card render rules

1. Author each image for an explicit card-specific focal point, e.g. Goblin upper-right to leave left rail open; a large rusty key on diagonal; empty floor to leave space for an overlaid pasted title; a flooded chamber with a visible vaulted passage.
2. Image masters should comfortably exceed **~1063 × 1535 px at 300 DPI** for a 90 × 130 mm card. The art crop itself must also be sufficiently high-resolution after zoom/cropping. Print in grayscale/1-bit-style halftone while retaining midtone texture where it aids recognition.
3. Paper dirt, torn edges, registration mistakes, stipple and photocopy texture belong around **frame and art**; never behind critical mechanics at an opacity that impairs reading.
4. Use a data-driven \`layout\` or \`composition\` field per card in the future renderer (e.g. \`portrait-stats\`, \`illustration-dominant\`, \`room-split\`, \`room-scene\`, \`choice-heavy\`, \`monster-behaviour\`). Do NOT calculate font size by word count or hard-clip missing text.
5. The physical mockup must be read at true print size and checked for every required rule line; monitor previews alone cannot establish real-world legibility.
6. Do not put fixed frame decorations where they obscure the focal art. Text labels for ATK/DEF/WIT and d6 outcomes remain explicit; colour alone never communicates a rule.

## Approval-stage samples

- [Flexible layout comparison](illustration-first-layout-study.html) — ten HTML card faces with different art ratios and mechanical placement. **Existing schematic SVG art is temporary.**
- [Room/Chest/Trap interaction study](room-feature-layout-study.html) — previous layout, now retained for comparing information hierarchy.
- [Three-Room physical interaction script](room-feature-prototype.md) — gameplay architecture remains unchanged.
- Earlier [eleven-category study](card-layout-study.html) — useful for role vocabulary but its generic same-sized artwork has been superseded.

No live cards, active card renderer, gameplay code or \`rules.html\` have been changed. Draft PR #9 is for review; no merge should occur until layout direction and representative full-detail original illustrations are accepted.
