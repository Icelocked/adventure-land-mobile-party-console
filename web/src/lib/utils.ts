import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn/ui's standard classname helper - merges conditional Tailwind
 *  classes and resolves conflicting utility classes (e.g. two different
 *  `p-*` values) in favor of the last one, matching every generated
 *  component from the shadcn CLI. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
