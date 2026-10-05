import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** The shared cue for "this row expands", used wherever a tap reveals more
 *  content (AutoMarksSection, BankScreen's locked-vault floors, SkillsScreen's
 *  class cards, BestiaryScreen's monster rows). */
export function ExpandChevron({ expanded, className }: { expanded: boolean; className?: string }) {
  return <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180', className)} />
}
