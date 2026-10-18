package com.partyconsole.companion.model

/** The stable console fork's features (party-console branch `stable`:
 *  Ryan's v1.4.0 plus Thefonze74065's features) that Ryan's v1.4.0
 *  (b4443e47) lacks. The console has no capabilities route, so each flag
 *  reads a state field only a console with that feature sends. Achievement
 *  Hunt has its own check, consoleHasAchievementHunt in State.kt.
 *  PWA: web/src/models/consoleFeatures.ts. */
data class ConsoleFeatures(
    /** POST /formation {tank}. initial-core.ts always sets `designatedTank`,
     *  to null when no tank is picked, and public-state.ts configFields sends it. */
    val designatedTank: Boolean,
    /** POST /gear-sets (save, equip, clear). initial-core.ts always sets `gearSets`. */
    val gearSets: Boolean,
    /** POST /encounter-mode. hunt/scopes.ts gives every farming profile an
     *  `encounterRoutines` object. */
    val frankyRoutine: Boolean,
    /** POST /realm/boss-chase. initial-core.ts always sets `bossChase`. */
    val bossChase: Boolean,
    /** POST /realm/hop-blacklist. initial-core.ts always sets `realmHopBlacklist`. */
    val realmHopBlacklist: Boolean,
    /** merchant/bank-sort {layout}. merchant/bank-sort.ts always sets `bankSortLayout`. */
    val gappedBankSort: Boolean,
    /** POST /prim-stack. merchant/initial-settings.ts adds the "prim stack"
     *  routine to merchantRoutinePriorities. */
    val primStack: Boolean,
    /** ALData Check (check: true), owned WTB offers first, resolving an
     *  unconfirmed WTB purchase, a typed giveaway host and NPC-sale Keep. No
     *  state field marks these, and v1.4.0 drops `keep` and `check` without an
     *  error, so they gate on the fork's gearSets and bossChase fields both
     *  being present: those ship in the same stable build. */
    val forkCommerce: Boolean,
)

val PartyStateDynamic.consoleFeatures: ConsoleFeatures get() {
    val gearSets = "gearSets" in stateKeys
    val bossChase = bossChase != null
    return ConsoleFeatures(
        designatedTank = "designatedTank" in stateKeys,
        gearSets = gearSets,
        frankyRoutine = "encounterRoutines" in stateKeys || farmingProfiles.values.any { it.encounterRoutines != null },
        bossChase = bossChase,
        realmHopBlacklist = "realmHopBlacklist" in stateKeys,
        gappedBankSort = bankSortLayout != null,
        primStack = "prim stack" in merchantRoutinePriorities,
        forkCommerce = gearSets && bossChase,
    )
}
