# Game-style stat cards

The app's raw stat grids become the game's own card style, ported from the PWA
(`web/src/lib/itemCardLines.ts`, `skillCardLines.ts`, `statColors.ts` and the
components beside them), which mirrors the console's cards
(`dashboard/features/party/item-card-lines.ts`, `stat-colors.ts` and the
`docs/*-card.md` specs on the console's `bestiary-card` branch).

Every card is two boxes: the game box on the left (black, a 5px `#808080`
border, monospace lines colored per stat) and an extras box on the right with
the fields the game's card has no line for. On a narrow screen the extras box
moves below the game box. Only the raw grids change; each screen keeps its
header, buttons, sliders and sections.

- **Item card** (item details, Overview): `render_item` stat lines with the
  game's labels, order and colors, abilities, the granted skill as a link,
  grade, stat scroll folding, lock state and the `[i]` line. The extras box
  holds quantity, the stat scroll and every other stats-table field.
- **Character card** (character stats sheet): the game's panel beside the
  attributes, defenses and combat stats, each attribute with a collapsible
  breakdown.
- **Equipment comparison**: each side's stat tiles become one game box, with
  changes in the game's success and failure colors.
- **Skill card** (Class skills and an item's skill link): `render_skill` lines
  colored by meaning.
- **Monster card** (Bestiary, Hunt settings and a monster opened from an
  item's drops): the item card in monster mode with a level preview slider.

The line builders are pure Kotlin in `domain/GameCards.kt`,
`domain/SkillCardLines.kt` and `domain/CharacterCard.kt`, with the palette in
`domain/StatColors.kt`; `GameCardsTest`, `SkillCardLinesTest` and
`CharacterCardTest` hold the PWA's e2e expectations as JVM tests.

## Failure inventory

Written before the implementation. Each line names the test that checks it.

### Shared palette and layout

1. A stat changes color between cards. Attack, MP, Armor, Resistance,
   Lifesteal and Range must use the same hex everywhere, copied from the PWA's
   `statColors.ts` (`GameCardsTest.paletteMatchesThePwa`,
   `GameCardsTest.aStatReadsTheSameColorOnEveryCard`).
2. A dark game color stays unreadable. Armor `#A3A9B0`, Resistance `#8B74C9`,
   Fortitude `#9A6BC9`, Lifesteal `#C8323E` and Manasteal `#5C66D9` use the
   brighter shades (`GameCardsTest.paletteMatchesThePwa`).
3. A named CSS color ("gold", "gray", "orange") reaches Compose as black or
   crashes `Color(...)` parsing (`GameCardsTest.namedColorsResolve`).
4. The layout breaks. On a wide sheet the boxes sit side by side with aligned
   tops; on a phone the extras box sits below the game box and nothing is
   wider than the screen (`GameCardsUiTest.itemCardStacksTheExtrasBelowOnAPhone`,
   `itemCardSitsBesideItsExtrasOnAWideScreen`,
   `characterCardSitsBesideItsExtrasOnAWideScreen`).

### Item card

5. Stats render in one color under raw keys. Each stat uses the game's label,
   color and order: "Damage" in `#DB2900`, "Crit Damage" after "Crit"
   (`GameCardsTest.fireStaffKeepsTheGameOrderLabelsAndColors`).
6. A `render_item` stat lands in the extras box. Freeze Res., Explosion and
   Lifesteal stay on the card
   (`GameCardsTest.vampiricGlovesFoldTheStatIntoTheScrolledStatAndKeepEveryGameStat`,
   `GameCardsTest.lolipopMaceShowsExplosionAndSugarRushAsGameLines`).
7. A built-in ability prints its id and `attr0`. Burn and Sugar Rush show their
   name, color and effect text with the chance filled in
   (`GameCardsTest.fireStaffKeepsTheGameOrderLabelsAndColors`,
   `GameCardsTest.lolipopMaceShowsExplosionAndSugarRushAsGameLines`).
8. A granted skill shows its id. The Zapper's `zapperzap` reads "Ability: Zap"
   as a link that opens the skill card, and Back returns to the item
   (`GameCardsTest.zapperLinksItsSkillAndKeepsTheClassBonusStats`,
   `GameCardsUiTest.skillLinkOpensTheSkillCardAndBackReturns`).
9. Nested bonuses vanish. `meta.bonuses` render as "Bonus: Cave of Darkness
   [Only] Evasion +35% · Speed +20"
   (`GameCardsTest.mothstepsShowGameLinesAndTheMapBonus`).
10. Grade ignores the preview level or shows on a booster
    (`GameCardsTest.gradeFollowsTheGradesAtThePreviewLevel`,
    `GameCardsTest.nonEquipmentShowsOnlyTheGameLinesAndTheQuantityInTheExtras`).
11. A field from the old stats table disappears. Every row lands on the card or
    in the extras box, `extra_stat` included, and booleans read Yes and No
    (`GameCardsTest.mothstepsExtrasHoldEveryOtherTableFieldReadable`).
12. A scrolled stat shows twice. A copy with `stat_type` shows no "Stat" line;
    Winged Boots +7 read "Intelligence: 9" or "Dexterity: 9"
    (`GameCardsTest.wingedBootsWithAStatScrollReadLikeTheGamesCard`).
13. Non-equipment loses its game lines: "HP: +400" on a potion, "Hours: 12" on
    an elixir, no grade on a booster, and the `[i]` phrase Exchangeable,
    Upgradeable, Compoundable, Collectable, Usable or Information
    (`GameCardsTest.nonEquipmentShowsOnlyTheGameLinesAndTheQuantityInTheExtras`).
14. Copy state lands in the wrong box. Sealed, Locked (`#8C8C8C`), Account
    Bound and Expires show on the card; Quantity and Stat Scroll show in the
    extras box
    (`GameCardsTest.lockAccountBindingAndExpiryOnTheCardQuantityAndScrollInTheExtras`).
    The screens pass the inspected copy through, or the lock and quantity
    never arrive.
15. The level slider stops moving the card's stats and grade
    (`GameCardsUiTest.previewSliderMovesTheCardsStatsAndGrade`,
    `GameCardsTest.theLevelPreviewMovesStatsAndGradeAndKeepsUncoveredStats`).

### Character card

16. The panel drifts from `render_character`: NAME, LEVEL, HP, MP, HEAL only
    when heal is above zero, ATT, ATTSPD (frequency × 100), RANGE, RUNSPD (live
    speed, a merchant with an open stand reads 10), ARMOR, RESIST., CODE, with
    "[C]" while cursed and "[P]" while poisoned (`CharacterCardTest`).
17. An entry of the old 34-tile grid disappears, or an effect loses its stat
    color ("+483 Max HP" in the HP color, "+23 Armor" in the armor color)
    (`CharacterCardTest.everyExtraAndEffectIsNamedAndColoredByItsStat`).
18. A collapse is forgotten. Each breakdown starts open; collapsing Strength
    hides its effects, stays collapsed for another character and after the
    sheet reopens (SharedPreferences, one key per attribute)
    (`GameCardsUiTest.collapseIsRememberedAcrossCharactersAndReopening`).
19. A missing run speed reads 0 instead of "Waiting for speed data"
    (`CharacterCardTest.aMissingRunSpeedStillSaysSo`).

### Equipment comparison

20. A row disappears or changes format. All 26 rows stay in order with their
    formats (`GearComparisonTest.eachSideIsOneGameBoxWithEveryRowInPaletteColors`).
21. Changes lose their direction: "(+x · +y%)" in `#85C76B`, "(-x · -y%)" in
    `#E13758`, nothing on the equipped side
    (`GearComparisonTest.aTwoHandedWeaponDropsTheOffhandAndTheCurrentSideCanLeaveItOut`).
22. Set changes lose GAINED and LOST, or their colors
    (`GearComparisonTest.setBonusesApplyAtTheExactPieceCountNotCumulatively`).
23. The two stat boxes drift out of line on a wide sheet. The offhand checkbox
    on one side or the two-handed note on the other must not push one box
    lower (`GearComparisonTest.wideSheetKeepsTheStatBoxesAligned`).
24. The level sliders or the offhand checkbox disappear
    (`GearComparisonTest.eachSideIsOneGameBoxWithEveryRowInPaletteColors`,
    `GearComparisonTest.wideSheetKeepsTheStatBoxesAligned`).

### Skill card

25. Lines drift from `render_skill`: Supershot reads "MP: 400", "Cooldown: 30
    seconds", "Range: Character Range", "Range: 3X + 20", "Weapon Requirement:
    "Bow", "Crossbow"", "Damage Type: Physical"
    (`SkillCardLinesTest.supershotReadsLineForLineWithMeaningColors`).
26. Party Heal's levelled outputs collapse into one line, or 3-Shot's shared
    cooldown loses the skill name ("Cooldown: 1× Attack")
    (`SkillCardLinesTest.partyHealShowsOneOutputLinePerLevel`,
    `SkillCardLinesTest.aSharedCooldownNamesTheSharedSkill`).
27. A definition field disappears instead of reaching the extras box, or the
    Class skills screen and the item link show different cards. Both screens
    call the one `SkillCards` composable
    (`SkillCardLinesTest.zapReadsTheSameCardAndKeepsEveryOtherFieldInTheExtras`).
28. The card reads as a wall of gray: cooldowns `#4EB7DE`, Range `#93A6A2`,
    weapon requirements `#56A244`, Hostile `#E13758`
    (`SkillCardLinesTest.supershotReadsLineForLineWithMeaningColors`,
    `SkillCardLinesTest.requiredStatsTakeTheirStatColors`).

### Monster card

29. Monster mode drifts: Goo reads "XP: 100", "Damage: 5", "Type: Physical",
    "Range: 15", "HP: 100", "MP: 2", "Speed: 6", "A.Speed: 40"
    (`GameCardsTest.gooAtLevelOneReadsTheGamesMonsterMode`).
30. Mr. Green loses "Impact Res.: 100", "A.Piercing: 320", "Cooperative" or
    its three "Spawns: Green Jr." lines, and a spawn stops opening that
    monster (`GameCardsTest.mrGreenKeepsGameNamesFlagsAndSpawns`,
    `GameCardsUiTest.monsterLevelPreviewAndSpawnLinks`).
31. A skill aura reads as a plain ability, or an ability that isn't a skill
    disappears instead of moving to the extras ("Abilities: warp_on_hit")
    (`GameCardsTest.aSkillAuraReadsAsAnAuraAndOtherAbilitiesMoveToTheExtras`).
32. The level preview drifts from `level_monster` and
    `calculate_monster_stats`: level 9 Goo reads XP 900, Damage 10, HP 500,
    Speed 8.16, A.Speed 70.6; level 15 reads XP 1500, Damage 12, HP 800, Speed
    8.88, A.Speed 80.8, and the note names "Gold and drop chance ×L"
    (`GameCardsTest.gooLevelPreviewFollowsLevelMonsterAndCalculateMonsterStats`,
    `GameCardsUiTest.monsterLevelPreviewAndSpawnLinks`).
33. Float error leaks into the card: 6 + 12 × 0.24 prints as 8.87, or 0.706 ×
    100 as 70.59 (`GameCardsTest.prettyNumbersFollowTheGamesFormatting`).
