package com.partyconsole.companion.model

import kotlinx.serialization.Serializable

/** Cart lines for POST /party-api/merchant/order and /merchant/exchange-order.
 *  A buy line's `level` is the target upgrade level; the server recomputes
 *  the attempt budget itself. */
@Serializable
/** One buy line. Console 1.4 recomputes the upgrade budget from [level]; a
 *  line it can't estimate needs [acknowledgeUnavailable] and a positive
 *  [goldCap], or the order gets a 400. */
data class MerchantOrderBuyLine(val id: String, val quantity: Int, val level: Int? = null, val goldCap: Long? = null, val acknowledgeUnavailable: Boolean? = null)

@Serializable
data class MerchantOrderCraftLine(val id: String, val quantity: Int)

@Serializable
data class MerchantExchangeLine(val id: String, val quantity: Int, val level: Int? = null, val reward: String? = null)
