import { Crosshair, Flame, HeartPulse, Shield, Sparkles, Store, User, type LucideIcon } from 'lucide-react'

/** Class icon + color, ported from ui/characterdetail/sections/
 *  VitalsHeader.kt's classLook - falls back to a generic person icon for
 *  any ctype not in this list rather than failing. Shared by the
 *  character list and detail header so both agree on the same look. */
export function classLook(ctype: string): { Icon: LucideIcon; color: string } {
  switch (ctype.toLowerCase()) {
    case 'warrior':
      return { Icon: Shield, color: '#CC5555' }
    case 'mage':
      return { Icon: Sparkles, color: '#66CCFF' }
    case 'priest':
      return { Icon: HeartPulse, color: '#7CFC00' }
    case 'merchant':
      return { Icon: Store, color: '#FFC966' }
    case 'ranger':
      return { Icon: Crosshair, color: '#66FFB2' }
    case 'rogue':
      return { Icon: Flame, color: '#9E7BFF' }
    case 'paladin':
      return { Icon: Shield, color: '#FFE066' }
    default:
      return { Icon: User, color: '#AAAAAA' }
  }
}
