import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui's classname helper: merges conditional Tailwind classes; the
 *  last of two conflicting utilities wins. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
