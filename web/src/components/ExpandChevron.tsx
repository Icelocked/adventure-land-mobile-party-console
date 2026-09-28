import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The one visual cue for "this row expands" - used consistently wherever a
 *  tap reveals more content (AutoMarksSection, BankScreen's locked-vault
 *  floors, SkillsScreen's class cards, BestiaryScreen's monster rows). Before
 *  this existed, the same interaction was styled three different ways
 *  (plain muted text, a small underlined link, or no cue at all) with no
 *  icon anywhere in the app to tie them together. */
export function ExpandChevron({ expanded, className }: { expanded: boolean; className?: string }) {
  return <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180', className)} />
}
