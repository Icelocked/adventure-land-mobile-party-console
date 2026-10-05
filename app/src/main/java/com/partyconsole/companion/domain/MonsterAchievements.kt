package com.partyconsole.companion.domain

import com.partyconsole.companion.model.BestiaryMonster
import com.partyconsole.companion.model.CharacterDiagnostics
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.math.max

data class MonsterAchievement(val score: Double, val owner: String?)

/** monster-achievements.ts, verbatim: the best score (and its owner) per
 *  monster across every character's diagnostics. */
fun aggregateMonsterAchievements(diagnostics: Map<String, CharacterDiagnostics>): Map<String, MonsterAchievement> {
    val result = linkedMapOf<String, MonsterAchievement>()
    for ((name, detail) in diagnostics) {
        val achievements = detail.monsterAchievements as? JsonObject ?: continue
        for ((monsterId, progress) in achievements) {
            val fields = progress as? JsonObject ?: continue
            val score = (fields["score"] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0
            val existing = result[monsterId]
            if (existing != null && score <= existing.score) continue
            val owner = (fields["owner"] as? JsonPrimitive)?.takeIf { it.isString }?.content?.ifEmpty { null }
            result[monsterId] = MonsterAchievement(max(0.0, score), owner ?: name)
        }
    }
    return result
}

/** bestiary-dialog.tsx achievementMilestones, verbatim. */
fun achievementMilestones(monster: BestiaryMonster): List<Double> =
    (monster.definition?.get("achievements") as? JsonArray)?.map { entry -> ((entry as? JsonArray)?.firstOrNull() as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0 }
        ?.filter { it.isFinite() && it > 0 }?.sorted().orEmpty()
