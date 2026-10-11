# Phase 1 — Foundation / Acceptance Review

Scope: keep the **existing six-floor vertical slice** intact; make the website stable, responsive and accurately printable. Physical gameplay rules belong to Phase 2.

## Contracts

| Component | Contract |
| --- | --- |
| Card format | 90 × 140 mm, portrait, monochrome, large line art |
| Print stock | A4 portrait, 5 mm margins |
| Print layout | Exactly 2 × 2 slots, 90 × 140 mm; 5 mm column and 4 mm row gaps |
| Print sheets | Explicit groups of up to 4; 34 specimens = 9 sheets |
| Browser | Works without dependencies/build tools; relative URLs for GitHub Pages |
| Mobile | No squeezed two-column card gallery; room and monster visible in the encounter |
| Accessibility | Semantic buttons, keyboard focus, status labels, stable contrast |
| Data | Single catalogue and shared rendering logic for play and print |
| Save | Local browser save; confirmation before intentionally overwriting a live run |

## Fixed in Phase 1

1. **Responsive cards:** cards are no longer forced into two narrow mobile columns; the play sidebar no longer competes with the encounter for width at tablet breakpoints.
2. **Print pagination:** a dedicated four-card print-sheet renderer makes sheet boundaries deterministic.
3. **Card rendering:** reusable module for numbering, HTML escaping, and printable/screen formats.
4. **Forgotten identification:** potion discoveries are now listed independently from inventory contents.
5. **Accidental restart:** living runs require an explicit confirmation before erasure.
6. **Documentation mismatch:** monsters are revealed on entry, but react after the next action.
7. **Tests:** native Node presentation tests plus optional browser layout/print geometry checks.

## How to verify

    npm test
    npm install
    npx playwright install chromium
    npm run test:visual

Manually inspect **Play**, **Cards**, and **Field Notes** at approximately 375, 768, 1024, and 1440 CSS px. On the Cards page, select **Print / Save PDF** and verify that the print preview has 9 A4 pages. Turn off browser headers/footers and use 100% scale. Confirm the printed card edges measure 90 × 140 mm with a ruler before cutting.

## Boundaries / known limitations

- Automated viewport checks use browser geometry and overflow tests, **not** a human judgement of aesthetics.
- The A4 print layout targets CSS/PDF physical dimensions; printer drivers may independently rescale output.
- The website's actual GitHub Pages publication status is not confirmed by these repository tests.
- The game still uses a linear six-floor dungeon. Physical tabletop rules, complex item interactions, and expanded dungeons are future phases.
- **No CI required for deployment:** these checks do not block updating the physical card design during prototyping.
