package com.partyconsole.companion.model

import kotlinx.serialization.Serializable

/** Wire shapes for POST /party-api/merchant/order and /merchant/exchange-
 *  order (merchant-commerce-dialog.tsx's buy/craft/exchange cart lines).
 *  `level` on a buy line is the desired target upgrade level for an
 *  upgradeable item - the server recomputes the actual scroll-attempt
 *  budget itself (runtime/coordinator/http/merchant-order.ts's estimate())
 *  before queuing, so nothing else needs to be sent from here. */
@Serializable
data class MerchantOrderBuyLine(val id: String, val quantity: Int, val level: Int? = null)

@Serializable
data class MerchantOrderCraftLine(val id: String, val quantity: Int)

@Serializable
data class MerchantExchangeLine(val id: String, val quantity: Int, val level: Int? = null, val reward: String? = null)
