import { useState } from 'react'
import { Coins } from 'lucide-react'
import { useCharacters, useDynamicState } from '@/data/PartyDataProvider'
import { abbreviatedGold, goldTotals, partyGoldNames } from '@/lib/gold'

/** Bank gold (abbreviated) and "(X total)" with what the active party
 *  carries; "—" while any balance is unknown. Tap for the exact figures. */
export function PartyGold() {
  const state = useDynamicState()
  const characters = useCharacters()
  const [exactShown, setExactShown] = useState(false)
  const bankGold = state.bankGold
  const { carried, total } = goldTotals(
    bankGold,
    partyGoldNames(state).map((name) => characters[name]?.vitals?.gold),
  )
  const exact = (value: number | null | undefined) => (value == null ? 'unknown' : value.toLocaleString())
  return (
    <button type="button" className="text-right font-mono text-xs text-amber-500" onClick={() => setExactShown((v) => !v)} aria-label="Party gold">
      <span className="flex items-center justify-end gap-1">
        <Coins className="size-3.5" />
        {bankGold == null ? '—' : abbreviatedGold(bankGold)}
      </span>
      <span className="block">({total == null ? '—' : abbreviatedGold(total)} total)</span>
      {exactShown && (
        <span className="block text-[10px] text-muted-foreground">
          Bank: {exact(bankGold)}; carried: {exact(carried)}; combined: {exact(total)} gold
        </span>
      )}
    </button>
  )
}
