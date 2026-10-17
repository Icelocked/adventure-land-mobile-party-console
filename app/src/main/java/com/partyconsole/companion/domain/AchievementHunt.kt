package com.partyconsole.companion.domain

import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.MonsterChoice
import kotlinx.serialization.json.JsonPrimitive

// Console Achievement Hunt (upstream PR #131; Ryan's v1.4.0 has none):
// runtime/hunt/achievement-policy.ts (achievementMonsters, nextStep).
// PWA: web/src/lib/achievementHunt.ts.

data class AchievementMonster(
    val id: String,
    val name: String,
    val ladder: List<Double>,
    val xp: Long,
    val threat: Double,
    val hp: Long,
    val special: Boolean,
    // A random respawn or one of passive hunting's rares: the console fights
    // it when seen and never makes it the target.
    val rare: Boolean,
    val monster: BestiaryMonster,
)

// Passive hunting's own rares (console runtime/coordinator/navigation/passive-settings.ts legacyPriorities).
private val PASSIVE_RARES = setOf("tinyp", "phoenix", "goldenbat", "cutebee", "hen", "rooster")
// Boss-like monsters the game does not flag (console docs/achievement-hunt.md § 23).
private const val BOSS_SPAWNS = 2
private const val BOSS_HP = 50_000

/** G.maps marks a spawn that moves between places `stype: "randomrespawn"` (Dracul, Phoenix). */
private fun randomRespawn(choice: MonsterChoice?) = choice?.spawnRecords.orEmpty().any { it.stype == "randomrespawn" }

/** Spawns in the world from the spawn records, leaving out those the game marks "ignore". */
private fun worldSpawns(choice: MonsterChoice?) = choice?.spawnRecords.orEmpty().sumOf { if ("ignore" in it.restrictions) 0 else it.count ?: 0 }

private fun truthy(value: kotlinx.serialization.json.JsonElement?): Boolean {
    val primitive = value as? JsonPrimitive ?: return value != null && value !is kotlinx.serialization.json.JsonNull
    if (primitive is kotlinx.serialization.json.JsonNull) return false
    if (primitive.isString) return primitive.content.isNotEmpty()
    return primitive.content != "false" && primitive.content != "0" && primitive.content != "0.0"
}

/** Every monster with achievements, weakest first: by XP (the game scales it
 *  with HP, damage and defenses), then threat, HP and name. Threat alone
 *  misranks: a Vampire Rat hits harder than a Fire Spirit but has a ninth of
 *  its HP. Special: unlisted (training dummies, Cave of Many Dreams), bosses,
 *  event, cooperative and random-respawn monsters, and any without a regular spawn. */
fun achievementMonsters(catalog: List<BestiaryMonster>, choices: List<MonsterChoice>): List<AchievementMonster> {
    val routable = choices.filter { it.locations.isNotEmpty() }.map { it.id }.toSet()
    // Never respawns, or is a big single spawn: Stompy, Skeletor, the crypt bosses.
    fun bossLike(monster: BestiaryMonster): Boolean {
        val respawn = (monster.definition?.get("respawn") as? JsonPrimitive)?.content?.toDoubleOrNull()
        if (respawn != null && respawn.isFinite() && respawn < 0) return true
        val spawns = worldSpawns(choices.find { it.id == monster.id })
        return spawns in 1..BOSS_SPAWNS && monster.hp >= BOSS_HP
    }
    val monsters = catalog.map { monster ->
        val definition = monster.definition
        val rare = monster.id in PASSIVE_RARES || randomRespawn(choices.find { it.id == monster.id })
        AchievementMonster(
            id = monster.id,
            name = monster.name.ifEmpty { monster.id },
            ladder = achievementMilestones(monster),
            xp = monster.xp,
            threat = monster.threat,
            hp = monster.hp,
            special = truthy(definition?.get("special")) || truthy(definition?.get("cooperative")) || truthy(definition?.get("unlist")) || rare || monster.id !in routable || bossLike(monster),
            rare = rare,
            monster = monster,
        )
    }
        .filter { it.ladder.isNotEmpty() }
        .sortedWith(compareBy<AchievementMonster> { it.xp }.thenBy { it.threat }.thenBy { it.hp }.thenBy(java.text.Collator.getInstance()) { it.name })
    // The game names both `snake` and `osnake` "Snake"; a shared name shows the id.
    val counts = monsters.groupingBy { it.name }.eachCount()
    return monsters.map { if ((counts[it.name] ?: 0) > 1) it.copy(name = "${it.name} (${it.id})") else it }
}

/** Index of the first milestone not yet reached, or -1 once the ladder is complete. */
fun nextStep(ladder: List<Double>, kills: Double): Int = ladder.indexOfFirst { kills < it }
