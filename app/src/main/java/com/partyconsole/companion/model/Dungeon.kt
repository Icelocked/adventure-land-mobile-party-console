package com.partyconsole.companion.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// Wire shapes returned by GET/POST /daily-dungeons, for the fields the UI
// reads. PWA: web/src/models/dungeon.ts.

@Serializable
data class PriestRecoveryAssignment(val id: String = "", val run: String = "", val priest: String = "", val target: String = "", val authorized: Boolean = false)

@Serializable
data class RecoveryActor(val ctype: String? = null, val hp: Double? = null, val max_hp: Double? = null, val mp: Double? = null, val max_mp: Double? = null, val c: JsonObject? = null)

@Serializable
data class PriestRecoveryObservation(
    val actor: RecoveryActor = RecoveryActor(),
    val essence: Boolean = false,
    val id: String? = null,
    val target: String? = null,
    val phase: String = "idle", // idle | healing | waiting | ready | dispatched | reviving | uncertain | failed | complete
    val reason: String? = null,
)

@Serializable
data class CavePoint(
    val room: String? = null,
    val kind: String? = null,
    val id: String,
    val label: String = "",
    val map: String = "",
    val x: Double = 0.0,
    val y: Double = 0.0,
    val locked: Boolean = false,
    val done: Boolean = false,
    val exit: Boolean = false,
    val down: Boolean = false,
    val to: String? = null,
    val required: Boolean = false,
)

@Serializable
data class CaveChoiceOption(val id: String, val label: String = "", val unavailable: String? = null, val cost: Long? = null, val amber: Long? = null)

@Serializable
data class CaveShop(val room: String = "", val name: String = "", val price: Long = 0, val sold: Boolean = false, val nearby: Boolean = false)

@Serializable
data class CaveChoice(
    val resultLabel: String? = null,
    val summary: List<String>? = null,
    val id: String,
    val title: String = "",
    val text: String = "",
    val deadline: Long = 0,
    val resolved: Boolean = false,
    val votes: Map<String, String> = emptyMap(),
    val options: List<CaveChoiceOption> = emptyList(),
    val shop: CaveShop? = null,
)

@Serializable
data class CaveResume(val server: String = "", val run: String? = null)

@Serializable
data class CaveVisit(val available: Boolean = false, val resets: Long = 0, val home: String = "", val resume: CaveResume? = null, val checkedAt: Long = 0)

@Serializable
data class CaveState(
    val run: String = "",
    val floor: Int = 0,
    val expires: Long = 0,
    val remainingMs: Long = 0,
    val paused: Boolean = false,
    val gold: Long = 0,
    val amber: Long = 0,
    val points: List<CavePoint> = emptyList(),
    val choice: CaveChoice? = null,
)

@Serializable
data class CaveObservation(
    val at: Long = 0,
    val supported: Boolean = false,
    val alive: Boolean = true,
    val ready: Boolean = false,
    val members: List<String> = emptyList(),
    val leader: String? = null,
    val visitError: String? = null,
    val visit: CaveVisit? = null,
    val cave: CaveState? = null,
    val recovery: PriestRecoveryObservation? = null,
)

@Serializable
data class DungeonCommand(val action: String = "")

@Serializable
data class DungeonTravel(val stage: String = "", val serial: Int = 0)

@Serializable
data class DungeonProgress(val enabled: Boolean = false, val target: String? = null, val floor: Int? = null, val serial: Int = 0, val message: String? = null)

@Serializable
data class DungeonState(
    val travel: DungeonTravel? = null,
    val progress: DungeonProgress? = null,
    val protectFromEvents: Boolean = true,
    val participants: List<String> = emptyList(),
    val phase: String = "idle", // idle | gathering | entering | active | exiting | held
    val run: String? = null,
    val server: String? = null,
    val commands: Map<String, DungeonCommand> = emptyMap(),
    val error: String? = null,
    val priestRecovery: PriestRecoveryAssignment? = null,
    val manualRecovery: Boolean = false,
)

@Serializable
data class DungeonMember(val name: String, val fresh: Boolean = false, val observation: CaveObservation? = null)

@Serializable
data class DungeonView(val state: DungeonState = DungeonState(), val members: List<DungeonMember> = emptyList())
