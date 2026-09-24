package com.partyconsole.companion.ui.itemicon

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.partyconsole.companion.model.BankMark

/** What (if anything) to overlay on one inventory slot's icon, mirroring
 *  inventory-panel.tsx's status banners: an "Auto X" pill for a rule-
 *  generated mark, "Mark for X" for a manual one-off mark. Merchant marks
 *  take visual priority when a slot somehow has both, since a merchant
 *  hold is the more specific/urgent state. */
data class MarkBadgeInfo(val label: String, val color: Color)

private val BANK_COLOR = Color(0xFFD9A441)
private val MERCHANT_COLOR = Color(0xFF9E7BFF)

fun markBadgeFor(slot: Int, merchantMarks: List<BankMark>, bankMarks: List<BankMark>): MarkBadgeInfo? {
    merchantMarks.find { it.slot == slot }?.let {
        return MarkBadgeInfo(if (it.auto) "Auto merchant" else "Mark for merchant", MERCHANT_COLOR)
    }
    bankMarks.find { it.slot == slot }?.let {
        return MarkBadgeInfo(if (it.auto) "Auto bank" else "Mark for bank", BANK_COLOR)
    }
    return null
}

@Composable
fun MarkBadgeOverlay(badge: MarkBadgeInfo, modifier: Modifier = Modifier) {
    Text(
        badge.label,
        modifier = modifier
            .fillMaxWidth()
            .background(badge.color.copy(alpha = 0.85f))
            .padding(vertical = 1.dp),
        color = Color.Black,
        fontSize = 8.sp,
        textAlign = TextAlign.Center,
        maxLines = 1,
    )
}
