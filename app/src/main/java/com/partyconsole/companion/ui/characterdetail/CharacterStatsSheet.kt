package com.partyconsole.companion.ui.characterdetail

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.CharacterDiagnostics
import com.partyconsole.companion.model.CharacterVitals
import com.partyconsole.companion.model.EquippedEntry
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToLong

/** Number.prototype.toLocaleString() (en-US): grouping, up to 3 decimals. */
internal fun localeNumber(value: Double): String = DecimalFormat("#,##0.###", DecimalFormatSymbols(Locale.US)).format(value)

/** Run speed as the dashboard displays it. */
fun displayRunSpeed(ctype: String, speed: Double?, unrestrictedSpeed: Double?, standOpen: Boolean?): Double? {
    if (ctype == "merchant") {
        if (unrestrictedSpeed != null && unrestrictedSpeed.isFinite()) return unrestrictedSpeed
        if (standOpen == true) return null
    }
    return speed
}

/** The damage multiplier for a defense value. */
internal fun damageMultiplier(defense: Double): Double {
    fun band(from: Double, rate: Double) = max(0.0, min(100.0, defense - from)) * rate
    val reduction = band(0.0, 0.001) + band(100.0, 0.001) + band(200.0, 0.00095) + band(300.0, 0.0009) + band(400.0, 0.00082) +
        band(500.0, 0.0007) + band(600.0, 0.0006) + band(700.0, 0.0005) + max(0.0, defense - 800) * 0.0004
    return min(1.32, max(0.05, 1 - reduction))
}

/** The stats sheet's rows, label to value. */
internal fun characterStats(vitals: CharacterVitals, diagnostics: CharacterDiagnostics?, slots: Map<String, EquippedEntry?>): List<Pair<String, String>> {
    val raw = diagnostics?.raw ?: JsonObject(emptyMap())
    fun num(key: String) = (raw[key] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0
    val combat = raw["combatStats"] as? JsonObject ?: JsonObject(emptyMap())
    fun c(key: String) = (combat[key] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0
    val ctype = vitals.ctype.ifEmpty { diagnostics?.ctype.orEmpty() }
    val level = (vitals.level.takeIf { it != 0 } ?: diagnostics?.level ?: 0).toDouble()
    val primary = (vitals.primaryStat ?: diagnostics?.primaryStat).orEmpty().lowercase()
    val weaponAttack = slots.filterKeys { it == "mainhand" || it == "offhand" }.values.sumOf { (it?.meta?.properties?.get("attack") as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0 }
    fun attributeEffect(stat: String, value: Double): String {
        val effects = mutableListOf<String>()
        val paladinInt = ctype == "paladin" && stat == "int"
        if (paladinInt || primary == stat) {
            val divisor = if (paladinInt) 40 else 20
            effects += "+${"%.1f".format(weaponAttack * value / divisor)} attack total · +${"%.2f".format(weaponAttack / divisor)} per point"
        }
        when (stat) {
            "str" -> {
                effects += "+${localeNumber((value * 21).roundToLong().toDouble())} max HP · +21 per point"
                effects += "+${localeNumber(min(value, 160.0) + max(0.0, value - 160) * 0.25)} armor · +${if (value < 160) "1" else "0.25"} per next point"
                effects += "+${"%.2f".format(min(value, 256.0) / 64)} run speed · +${if (value < 256) "0.0156" else "0"} per next point"
            }
            "int" -> {
                effects += "+${localeNumber((value * 15).roundToLong().toDouble())} max MP · +15 per point"
                effects += "+${localeNumber(min(value, 180.0) + max(0.0, value - 180) * 0.25)} resistance · +${if (value < 180) "1" else "0.25"} per next point"
                effects += "+${"%.3f".format(value / 1575)} attacks/sec · +0.000635 per point"
            }
            else -> {
                effects += "+${"%.2f".format(min(value, 256.0) / 32)} run speed · +${if (value < 256) "0.0313" else "0"} per next point"
                effects += "+${"%.3f".format(min(160.0, value) / 640 + max(value - 160, 0.0) / 925)} attacks/sec · +${if (value < 160) "0.00156" else "0.00108"} per next point"
            }
        }
        return "${localeNumber(value)}${if (primary == stat) " · PRIMARY" else ""}\n${effects.joinToString(" · ")}"
    }
    val vitality = num("vit")
    val fortitude = num("fortitude")
    val fortitudeMultiplier = damageMultiplier(fortitude * 5)
    val armorMultiplier = damageMultiplier(num("armor"))
    val resistanceMultiplier = damageMultiplier(num("resistance"))
    val runSpeed = displayRunSpeed(ctype, (raw["speed"] as? JsonPrimitive)?.content?.toDoubleOrNull(), (raw["unrestrictedSpeed"] as? JsonPrimitive)?.content?.toDoubleOrNull(), vitals.standOpen ?: (raw["standOpen"] as? JsonPrimitive)?.content?.toBooleanStrictOrNull())
    fun pct(value: Double) = "${localeNumber(value)}%"
    return listOf(
        "Level" to localeNumber(level),
        "HP" to "${localeNumber(vitals.hp.toDouble())} / ${localeNumber(vitals.maxHp.toDouble())}",
        "MP" to "${localeNumber(vitals.mp.toDouble())} / ${localeNumber(vitals.maxMp.toDouble())}",
        "Attack" to localeNumber(num("attack")),
        "Attack speed" to "%.2f".format(num("frequency")),
        "Range" to localeNumber(num("range")),
        "Run speed" to (runSpeed?.let { "%.2f".format(it) + if (ctype == "merchant") " · before movement restrictions" else "" } ?: "Waiting for speed data"),
        "Armor" to "${localeNumber(num("armor"))}\n${"%.2f".format((1 - armorMultiplier) * 100)}% physical damage reduction · a 100-damage physical hit becomes ${"%.1f".format(100 * armorMultiplier)}",
        "Resistance" to "${localeNumber(num("resistance"))}\n${"%.2f".format((1 - resistanceMultiplier) * 100)}% magical damage reduction · a 100-damage magical hit becomes ${"%.1f".format(100 * resistanceMultiplier)}",
        "Strength" to attributeEffect("str", num("str")),
        "Intelligence" to attributeEffect("int", num("int")),
        "Dexterity" to attributeEffect("dex", num("dex")),
        "Vitality" to "${localeNumber(vitality)}\n+${localeNumber((vitality * (48 + level / 3)).roundToLong().toDouble())} max HP · ${"%.2f".format(48 + level / 3)} HP per VIT at level ${localeNumber(level)}",
        "Fortitude" to "${localeNumber(fortitude)}\n${"%.2f".format((1 - fortitudeMultiplier) * 100)}% less incoming PvP damage · no PvE reduction",
        "Luck" to pct(num("luck").takeIf { it != 0.0 } ?: 100.0),
        "Armor piercing" to localeNumber(c("armorPiercing")),
        "Resistance piercing" to localeNumber(c("resistancePiercing")),
        "Poison resistance" to localeNumber(c("poisonResistance")),
        "Fire resistance" to localeNumber(c("fireResistance")),
        "Freeze resistance" to localeNumber(c("freezeResistance")),
        "Physical resistance" to localeNumber(c("physicalResistance")),
        "Status resistance" to localeNumber(c("statusResistance")),
        "Blast resistance" to localeNumber(c("blastResistance")),
        "Critical chance" to pct(c("crit")),
        "Critical damage" to pct(200 + c("critDamage")),
        "Evasion" to pct(c("evasion")),
        "Miss chance" to pct(c("miss")),
        "Lifesteal" to pct(c("lifesteal")),
        "Manasteal" to pct(c("manasteal")),
        "Damage return" to pct(c("damageReturn")),
        "Reflection" to pct(c("reflection")),
        "MP cost" to localeNumber(c("mpCost")),
        "Heal" to localeNumber(c("heal")),
        "Output" to pct(c("output")),
    )
}

private val SMALL = setOf("Strength", "Intelligence", "Dexterity", "Vitality", "Fortitude")

/** Character stats: level, HP/MP, attack, speeds, armor and resistance with
 *  their damage reduction, STR/INT/DEX/VIT/FOR effects (primary stat marked),
 *  luck, and the combat stats. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CharacterStatsSheet(name: String, vitals: CharacterVitals, diagnostics: CharacterDiagnostics?, slots: Map<String, EquippedEntry?>, onClose: () -> Unit) {
    val stats = characterStats(vitals, diagnostics, slots)
    val level = vitals.level.takeIf { it != 0 } ?: diagnostics?.level ?: 0
    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).semantics { contentDescription = "$name stats" }) {
            Text(name, fontWeight = FontWeight.SemiBold)
            Text(
                "Level $level ${vitals.ctype.ifEmpty { diagnostics?.ctype.orEmpty() }} ${(vitals.primaryStat ?: diagnostics?.primaryStat).orEmpty()}".uppercase(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            for (row in stats.chunked(2)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                    for ((label, value) in row) {
                        Column(modifier = Modifier.weight(1f).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(10.dp).semantics { contentDescription = label }) {
                            Text(label.uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(value, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.SemiBold, style = if (label in SMALL) MaterialTheme.typography.labelSmall else MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(top = 4.dp))
                        }
                    }
                    if (row.size == 1) Box(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}
