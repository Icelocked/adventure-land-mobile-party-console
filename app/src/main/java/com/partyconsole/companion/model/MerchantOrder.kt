package com.partyconsole.companion.model

import kotlinx.serialization.Serializable

/** Cart lines for POST /party-api/merchant/order and /merchant/exchange-order.
 *  A buy line's `level` is the target upgrade level; the server recomputes
 *  the attempt budget itself. */
@Serializable
data class MerchantOrderBuyLine(val id: String, val quantity: Int, val level: Int? = null, val budget: Double? = null, val maxAttempts: Long? = null)

@Serializable
data class MerchantOrderCraftLine(val id: String, val quantity: Int)

@Serializable
data class MerchantExchangeLine(val id: String, val quantity: Int, val level: Int? = null, val reward: String? = null)
