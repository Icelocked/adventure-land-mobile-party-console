package com.partyconsole.companion.ui.itempanel

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.partyconsole.companion.model.EquippedEntry
import com.partyconsole.companion.model.Item
import com.partyconsole.companion.model.ItemMeta
import com.partyconsole.companion.model.ItemSetInfo
import com.partyconsole.companion.ui.PartyViewModel
import com.partyconsole.companion.ui.components.CharacterPortrait
import com.partyconsole.companion.ui.components.statBadgeColors
import com.partyconsole.companion.ui.itemdetail.STAT_SCROLLS
import com.partyconsole.companion.ui.itemdetail.comparisonSlotsFor
import com.partyconsole.companion.ui.itemdetail.detailMeta
import com.partyconsole.companion.ui.itemdetail.itemMaximumLevel
import com.partyconsole.companion.ui.itemdetail.propertiesAtLevel
import com.partyconsole.companion.ui.itemicon.rememberCatalogLookup
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private val Lime = Color(0xFFA3E635)
private val Rose = Color(0xFFFB7185)
private val Violet = Color(0xFFA78BFA)

/** One comparison row: label, the projected stat it reads and its format. */
private class StatRow(val label: String, val key: String, val format: (Double) -> String)

private fun fixed(digits: Int, suffix: String = ""): (Double) -> String = { "%.${digits}f".format(it) + suffix }

private val ROWS = listOf(
    StatRow("HP", "max_hp") { "%,d".format(it.roundToInt()) },
    StatRow("MP", "max_mp") { "%,d".format(it.roundToInt()) },
    StatRow("Attack", "attack", fixed(1)),
    StatRow("Attack speed", "frequency", fixed(3)),
    StatRow("Range", "range", fixed(1)),
    StatRow("Run speed", "speed") { if (it.isFinite()) "%.2f".format(it) else "Unavailable" },
    StatRow("Armor", "armor", fixed(1)),
    StatRow("Resistance", "resistance", fixed(1)),
    StatRow("STR", "str", fixed(0)),
    StatRow("INT", "int", fixed(0)),
    StatRow("DEX", "dex", fixed(0)),
    StatRow("VIT", "vit", fixed(0)),
    StatRow("Fortitude", "fortitude", fixed(1)),
    StatRow("Luck", "luck", fixed(1, "%")),
    StatRow("Gold", "goldBonus", fixed(2, "%")),
    StatRow("XP", "xpBonus", fixed(2, "%")),
    StatRow("Evasion", "evasion", fixed(3, "%")),
    StatRow("Reflection", "reflection", fixed(3, "%")),
    StatRow("Lifesteal", "lifesteal", fixed(3, "%")),
    StatRow("Manasteal", "manasteal", fixed(3, "%")),
    StatRow("Armor piercing", "apiercing", fixed(2)),
    StatRow("Resistance piercing", "rpiercing", fixed(2)),
    StatRow("Critical hit", "crit", fixed(3, "%")),
    StatRow("Damage return", "dreturn", fixed(2, "%")),
    StatRow("MP cost reduction", "mp_cost", fixed(2, "%")),
    StatRow("Output", "output", fixed(3, "%")),
)

private class SetState(val totals: Map<String, Double>, val counts: Map<String, Int>)

private fun numberOf(map: Map<String, JsonElement>, key: String) = (map[key] as? JsonPrimitive)?.doubleOrNull ?: 0.0

/** Gear comparison: the character's projected totals (HP, MP, attack, speeds,
 *  armor, resistance, attributes, combat stats) with the current item and
 *  with this one, each side's level and stat-scroll preview, the character
 *  doll, and set changes (GAINED / LOST). The base stats are the character's
 *  diagnostics from the core fetch. [slot] is the slot picked in the options
 *  list, if any. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GearComparisonSheet(
    item: Item,
    meta: ItemMeta?,
    characterName: String,
    viewModel: PartyViewModel,
    slot: String? = null,
    onClose: () -> Unit,
) {
    val characters by viewModel.characters.collectAsState()
    val diagnosticsMap by viewModel.characterDetails.collectAsState()
    val state by viewModel.dynamicState.collectAsState()
    val catalogFor = rememberCatalogLookup(state.merchantCatalog)
    val diagnostics = diagnosticsMap[characterName]
    val vitals = characters[characterName]?.vitals
    val slots = characters[characterName]?.inventory?.slots.orEmpty()
    fun metaOf(entry: EquippedEntry) = detailMeta(catalogFor(entry.item.name)?.meta, entry.meta)
    val entryMeta = detailMeta(catalogFor(item.name)?.meta, meta)
    val ctype = vitals?.ctype?.takeIf { it.isNotEmpty() } ?: diagnostics?.ctype.orEmpty()

    val candidates = comparisonSlotsFor(entryMeta, ctype).ifEmpty { listOf((entryMeta?.definition?.get("type") as? JsonPrimitive)?.content.orEmpty()) }
    val replacementSlot = slot ?: candidates.find { slots[it]?.item?.name == item.name } ?: candidates.find { slots[it] == null } ?: candidates[0]
    val equipped = slots[replacementSlot]
    val equippedMeta = equipped?.let { metaOf(it) }

    var leftLevel by remember { mutableStateOf(max(0, equipped?.item?.level ?: 0)) }
    var rightLevel by remember { mutableStateOf(max(0, item.level ?: 0)) }
    var leftStatType by remember { mutableStateOf(equipped?.item?.statType ?: "none") }
    var rightStatType by remember { mutableStateOf(item.statType ?: "none") }

    val actualOldProps = equippedMeta?.properties.orEmpty().mapValues { (it.value as? JsonPrimitive)?.doubleOrNull ?: 0.0 }
    val oldProps = if (equipped != null) propertiesAtLevel(equippedMeta, equipped.item, leftLevel, leftStatType.takeIf { it != "none" }) else emptyMap()
    val newProps = propertiesAtLevel(entryMeta, item, rightLevel, rightStatType.takeIf { it != "none" })

    // The equipped gear (not the stand) with resolved meta; each side swaps
    // the replacement slot for its preview.
    val actualEquipment = slots.filter { (name, value) -> !name.startsWith("trade") && value != null }.map { (name, value) -> name to value!!.copy(meta = metaOf(value)) }
    val currentEquipment = actualEquipment.map { (name, value) -> if (name == replacementSlot) name to value.copy(item = value.item.copy(level = leftLevel)) else name to value }
    val proposedEquipment = actualEquipment.filter { it.first != replacementSlot } + (replacementSlot to EquippedEntry(item = item.copy(level = rightLevel), meta = entryMeta))
    val setDefinitions = linkedMapOf<String, ItemSetInfo>()
    (currentEquipment.map { it.second.meta } + entryMeta).forEach { m -> m?.world?.set?.let { setDefinitions[it.id] = it } }
    fun setState(equipment: List<Pair<String, EquippedEntry>>): SetState {
        val totals = mutableMapOf<String, Double>()
        val counts = mutableMapOf<String, Int>()
        for ((setId, set) in setDefinitions) {
            val allowed = set.items.map { it.id }.toSet()
            val count = equipment.count { it.second.item.name in allowed }
            counts[setId] = count
            set.bonuses.filter { count >= it.pieces }.forEach { bonus ->
                bonus.stats.forEach { (key, value) -> (value as? JsonPrimitive)?.takeIf { !it.isString }?.doubleOrNull?.let { totals[key] = (totals[key] ?: 0.0) + it } }
            }
        }
        return SetState(totals, counts)
    }
    val currentSets = setState(currentEquipment)
    val proposedSets = setState(proposedEquipment)

    val characterLevel = (vitals?.level?.takeIf { it > 0 } ?: diagnostics?.level ?: 0).toDouble()
    val maxHp = (vitals?.maxHp ?: 0).toDouble()
    val maxMp = (vitals?.maxMp ?: 0).toDouble()
    val base = diagnostics?.raw ?: JsonObject(emptyMap())
    fun num(key: String) = numberOf(base, key)
    fun strArmor(value: Double) = min(value, 160.0) + max(0.0, value - 160) * 0.25
    fun intRes(value: Double) = min(value, 180.0) + max(0.0, value - 180) * 0.25
    fun statSpeed(str: Double, dex: Double) = min(str, 256.0) / 64 + min(dex, 256.0) / 32
    fun statFrequency(intelligence: Double, dexterity: Double) = intelligence / 1575 + min(160.0, dexterity) / 640 + max(0.0, dexterity - 160) / 925
    val oldWeaponAttack = actualEquipment.filter { it.first == "mainhand" || it.first == "offhand" }.sumOf { numberOf(it.second.meta?.properties.orEmpty(), "attack") }
    val primary = diagnostics?.primaryStat.orEmpty().lowercase()
    val divisor = if (ctype == "paladin" && primary == "int") 40 else 20
    val oldPrimary = num(primary)
    val combat = (base["combatStats"] as? JsonObject) ?: JsonObject(emptyMap())
    fun combatNum(key: String) = numberOf(combat, key)
    fun project(replacement: Map<String, Double>, setTotals: Map<String, Double>): Map<String, Double> {
        fun delta(key: String) = (replacement[key] ?: 0.0) - (actualOldProps[key] ?: 0.0) + (setTotals[key] ?: 0.0) - (currentSets.totals[key] ?: 0.0)
        val result = mutableMapOf<String, Double>()
        result["str"] = num("str") + delta("str")
        result["int"] = num("int") + delta("int")
        result["dex"] = num("dex") + delta("dex")
        result["vit"] = num("vit") + delta("vit")
        result["luck"] = num("luck") + delta("luck")
        result["fortitude"] = num("fortitude") + delta("for")
        result["goldBonus"] = num("goldBonus") + delta("gold")
        result["xpBonus"] = num("xpBonus") + delta("xp")
        result["max_hp"] = maxHp + delta("hp") + delta("str") * 21 + delta("vit") * (48 + characterLevel / 3)
        result["max_mp"] = maxMp + delta("mp") + delta("int") * 15
        result["armor"] = num("armor") + delta("armor") + strArmor(result.getValue("str")) - strArmor(num("str"))
        result["resistance"] = num("resistance") + delta("resistance") + intRes(result.getValue("int")) - intRes(num("int"))
        val baseSpeed = if (ctype == "merchant") {
            (base["unrestrictedSpeed"] as? JsonPrimitive)?.doubleOrNull ?: if ((base["standOpen"] as? JsonPrimitive)?.content == "true") Double.NaN else num("speed")
        } else num("speed")
        result["speed"] = baseSpeed + delta("speed") + statSpeed(result.getValue("str"), result.getValue("dex")) - statSpeed(num("str"), num("dex"))
        // Equipment and set frequency use hundredths of an attack per second.
        result["frequency"] = num("frequency") + delta("frequency") / 100 + statFrequency(result.getValue("int"), result.getValue("dex")) - statFrequency(num("int"), num("dex"))
        result["range"] = num("range") + delta("range")
        val weaponAttack = max(0.0, oldWeaponAttack + delta("attack"))
        val newPrimary = result[primary] ?: 0.0
        result["attack"] = num("attack") + weaponAttack * (1 + newPrimary / divisor) - oldWeaponAttack * (1 + oldPrimary / divisor)
        result["evasion"] = combatNum("evasion") + delta("evasion")
        result["reflection"] = combatNum("reflection") + delta("reflection")
        result["lifesteal"] = combatNum("lifesteal") + delta("lifesteal")
        result["manasteal"] = combatNum("manasteal") + delta("manasteal")
        result["rpiercing"] = combatNum("resistancePiercing") + delta("rpiercing")
        result["apiercing"] = combatNum("armorPiercing") + delta("apiercing")
        result["crit"] = combatNum("crit") + delta("crit")
        result["dreturn"] = combatNum("damageReturn") + delta("dreturn")
        result["mp_cost"] = combatNum("mpCost") + delta("mp_cost")
        result["output"] = combatNum("output") + delta("output")
        return result
    }
    val currentPreview = project(oldProps, currentSets.totals)
    val projected = project(newProps, proposedSets.totals)
    val changedSets = setDefinitions.values.filter { currentSets.counts[it.id] != proposedSets.counts[it.id] }
    fun nameOf(value: Item, m: ItemMeta?) = (m?.definition?.get("name") as? JsonPrimitive)?.content ?: catalogFor(value.name)?.name ?: value.name

    ModalBottomSheet(onDismissRequest = onClose, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text("Equipment comparison", style = MaterialTheme.typography.titleSmall)
            Text(
                "Move either slider independently. Green improves the left preview; red reduces it. Nothing in inventory is changed.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            ComparisonPanel(
                sectionLabel = "Currently equipped",
                title = if (equipped != null) "${nameOf(equipped.item, equippedMeta)} +$leftLevel" else "Empty slot",
                detail = characterName,
                dollHtml = diagnostics?.characterDollHtml,
                meta = equippedMeta,
                level = leftLevel,
                onLevel = { leftLevel = it },
                statType = leftStatType,
                onStatType = { leftStatType = it },
                candidate = currentPreview,
                original = currentPreview,
                proposed = false,
            )
            ComparisonPanel(
                sectionLabel = "With this item",
                title = "${nameOf(item, entryMeta)} +$rightLevel",
                detail = "Replaces $replacementSlot" + if (equipped != null) " · ${nameOf(equipped.item, equippedMeta)}" else " · empty slot",
                dollHtml = diagnostics?.characterDollHtml,
                meta = entryMeta,
                level = rightLevel,
                onLevel = { rightLevel = it },
                statType = rightStatType,
                onStatType = { rightStatType = it },
                candidate = projected,
                original = currentPreview,
                proposed = true,
            )
            if (changedSets.isNotEmpty()) {
                Column(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp).border(1.dp, Color(0xFF5B21B6), RoundedCornerShape(6.dp)).padding(12.dp)
                        .semantics { contentDescription = "Set changes" },
                ) {
                    Text("SET CHANGES", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Violet)
                    for (set in changedSets) {
                        val before = currentSets.counts[set.id] ?: 0
                        val after = proposedSets.counts[set.id] ?: 0
                        Column(modifier = Modifier.fillMaxWidth().padding(top = 8.dp).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(8.dp)) {
                            Row {
                                Text("${set.name}: $before/${set.items.size} → ", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold)
                                Text("$after/${set.items.size}", style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, color = if (after > before) Color(0xFF34D399) else Rose)
                            }
                            Text(
                                set.bonuses.joinToString(" · ") { bonus ->
                                    val was = before >= bonus.pieces
                                    val becomes = after >= bonus.pieces
                                    val stats = bonus.stats.entries.joinToString(", ") { (key, value) -> "${key.uppercase()} +${(value as? JsonPrimitive)?.content ?: value}" }
                                    "${bonus.pieces} pieces: $stats" + when {
                                        !was && becomes -> " · GAINED"
                                        was && !becomes -> " · LOST"
                                        else -> ""
                                    }
                                },
                                fontFamily = FontFamily.Monospace,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ComparisonPanel(
    sectionLabel: String,
    title: String,
    detail: String,
    dollHtml: String?,
    meta: ItemMeta?,
    level: Int,
    onLevel: (Int) -> Unit,
    statType: String,
    onStatType: (String) -> Unit,
    candidate: Map<String, Double>,
    original: Map<String, Double>,
    proposed: Boolean,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp)
            .border(1.dp, if (proposed) Color(0xFF155E75) else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp))
            .padding(12.dp),
    ) {
        Text(sectionLabel, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The game's own character doll markup.
            if (dollHtml != null) CharacterPortrait(dollHtml, null, null, modifier = Modifier.size(width = 64.dp, height = 80.dp))
            Column(modifier = Modifier.padding(start = if (dollHtml != null) 12.dp else 0.dp)) {
                Text(title, fontWeight = FontWeight.SemiBold)
                Text(detail, fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        if (meta?.definition?.get("stat") != null) StatPreviewButtons(statType, onStatType)
        if (meta?.upgradeable == true || meta?.compoundable == true) {
            val maxLevel = itemMaximumLevel(meta)
            Column(modifier = Modifier.fillMaxWidth().padding(top = 12.dp).border(1.dp, Color(0xB34C1D95), RoundedCornerShape(4.dp)).padding(12.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("PREVIEW LEVEL", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Violet)
                    Text("+$level", fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = Violet)
                }
                Slider(
                    value = level.toFloat(),
                    onValueChange = { onLevel(it.roundToInt()) },
                    valueRange = 0f..maxOf(1, maxLevel).toFloat(),
                    steps = (maxLevel - 1).coerceAtLeast(0),
                    modifier = Modifier.semantics { contentDescription = "$sectionLabel preview level" },
                )
            }
        }
        FlowRow(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), maxItemsInEachRow = 2, horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (row in ROWS) {
                val value = candidate[row.key] ?: 0.0
                val before = original[row.key] ?: 0.0
                val change = value - before
                val changed = proposed && abs(change) > 0.0001
                val percentChange = if (before == 0.0) null else change / abs(before) * 100
                Column(modifier = Modifier.weight(1f).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp)).padding(8.dp)) {
                    Text(row.label.uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(
                        row.format(value) + if (changed) " (${if (change > 0) "+" else "-"}${row.format(abs(change))} · ${percentChange?.let { "${if (it > 0) "+" else ""}${"%.1f".format(it)}%" } ?: "new"})" else "",
                        fontFamily = FontFamily.Monospace,
                        fontWeight = if (changed && change > 0) FontWeight.Bold else FontWeight.SemiBold,
                        style = MaterialTheme.typography.bodySmall,
                        color = when {
                            changed && change > 0 -> Lime
                            changed && change < 0 -> Rose
                            else -> Color.Unspecified
                        },
                    )
                }
            }
        }
    }
}

/** The "Preview with stat scroll" row: No stat / STR / INT / DEX / VIT, then
 *  an exotic-stat menu for the scrolls that can't be bought. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun StatPreviewButtons(selected: String, onSelect: (String) -> Unit) {
    val primaryStats = listOf("str", "int", "dex", "vit")
    val exoticSelected = if (selected != "none" && selected !in primaryStats) selected else "none"
    var menu by remember { mutableStateOf(false) }
    FlowRow(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (statType in listOf("none") + primaryStats) {
            val (background, text) = if (statType == "none") Color(0xFF1E293B) to Color.White else statBadgeColors(statType)
            OutlinedButton(
                onClick = { onSelect(statType) },
                colors = if (selected == statType) ButtonDefaults.outlinedButtonColors(containerColor = background, contentColor = text) else ButtonDefaults.outlinedButtonColors(),
                contentPadding = PaddingValues(horizontal = 8.dp),
            ) { Text(if (statType == "none") "NO STAT" else statType.uppercase(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.labelSmall) }
        }
        Box {
            OutlinedButton(onClick = { menu = true }, contentPadding = PaddingValues(horizontal = 8.dp)) {
                Text(STAT_SCROLLS.find { it.stat == exoticSelected }?.label ?: "Exotic stat…", style = MaterialTheme.typography.labelSmall)
            }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text("Exotic stat…") }, onClick = { menu = false; if (exoticSelected != "none") onSelect("none") })
                for (choice in STAT_SCROLLS.filter { !it.purchasable }) {
                    DropdownMenuItem(text = { Text(choice.label) }, onClick = { menu = false; onSelect(choice.stat) })
                }
            }
        }
    }
}
