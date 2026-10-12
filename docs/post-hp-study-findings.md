# Post-d20 HP research findings (12 October 2026)

Source: [GitHub Actions research run](https://github.com/tpepels/rogue_cards/actions/runs/38299230247)
using commit `6e6d4d5ecabe68f55e285386e5ee7df7485b5fac`.
Three separate JSON artifacts are available in that workflow run.

## Mechanical integrity

889,016 deterministic full expeditions; no unresolved effects and no stalls.
The Item study had 371,103 eligible matched Item comparisons; the Room
study had 61,016 eligible matched legal Room-choice comparisons.
All 52 Items and all 36 regional Rooms were evaluated with revised HP.

## Average marginal Item-gift effects

One extra existing Item was moved from the deck to the starting hand.
This does **not** measure intrinsic Item power.

| Item | Win-rate difference |
|---|---:|
| Hungry Ring | +6.19 pp |
| Crown of Rehearsals | +5.79 pp |
| Notched Sword | +5.53 pp |
| Burial Mail | +4.50 pp |
| Warded Shield | +4.20 pp |
| Whispering Blade | -1.66 pp (95% CI -2.78 to -0.55) |

## Room choice 2 versus choice 1 (both legal)

| Room | Win-rate difference |
|---|---:|
| Midnight Bazaar | +7.73 pp |
| The Last Chest | +5.85 pp |
| Fungal Garden | +3.53 pp |
| Ghostly Auction | -7.77 pp |
| Warden's Threshold | -7.96 pp |
| Hall of Teeth | -13.77 pp |

Previous combat-reward buffs did not eliminate the last three gaps.

## Is it bad cards or bad simulated decisions?

Separate simulator-only PARLEY and affordable Vault Seal interventions
show the following win-rate changes. No printed rules were modified.

| Study | Seal only | PARLEY only | Both |
|---|---:|---:|---:|
| Magic solo | +12.97 pp | +3.38 pp | +17.41 pp |
| Treasure solo | +11.09 pp | +4.84 pp | +14.16 pp |
| Magic duo | +5.29 pp | +4.16 pp | +8.92 pp |
| Treasure duo | +4.43 pp | +6.24 pp | +8.63 pp |

Magic and Treasure default scripts do not attempt Monster PARLEY or
the Vault Seal, although players may do both. Their underperformance
cannot be ascribed solely to weaknesses in magic or treasure cards.

## Strong versus weak solo Hero

Knight versus Wizard, circa 600 matched tests per Item per Hero:

| Gifted Item | Knight delta | Wizard delta |
|---|---:|---:|
| Hungry Ring | +9.86 pp | +7.48 pp |
| Crown of Rehearsals | +8.75 pp | +8.92 pp |
| Notched Sword | +6.50 pp | +0.50 pp |
| Ashwood Staff | +6.00 pp | -0.17 pp |
| Whispering Blade | -4.40 pp | +2.20 pp |

These are exploratory, not definitive interaction claims.
Wizard **starts with an Ashwood Staff**; another Staff is mostly redundant.
No individual Knight-versus-Wizard Item-effect contrast survives a
5% Benjamini-Hochberg correction across the 52 Items under the
approximate independent-group uncertainty model.

## Next steps

Improve simulated Magic/Treasure decision-making before changing
their cards. Physically playtest Hall of Teeth, Ghostly Auction and
Warden's Threshold risk-reward decisions. Revisit Whispering Blade's
curse/HP cost rather than assuming another ATK boost is the answer.

Reproduce with `npm run study:items -- 200`,
`npm run study:rooms -- 200`,
and `npm run study:strategies -- 400`.

All findings are policy-dependent estimates, not proof of
balance, human desirability, or correctness in every card sequence.