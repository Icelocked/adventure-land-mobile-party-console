import { SpriteIcon } from '@/components/SpriteIcon'
import type { Sprite } from '@/models'
import { sanitizeDollHtml } from '@/lib/safeHtml'

/** The coordinator's rendered character doll (characterDollHtml), else the
 *  character sprite, else the skin name. */
export function CharacterPortrait({ html, sprite, skin, className = '' }: { html?: string | null; sprite?: unknown; skin?: string | null; className?: string }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none relative block select-none overflow-hidden [&_img]:max-w-none ${className}`}>
      {html ? (
        <span className="absolute inset-0 grid place-items-center" dangerouslySetInnerHTML={{ __html: sanitizeDollHtml(html) }} />
      ) : sprite ? (
        <span className="absolute inset-0 grid place-items-center">
          <SpriteIcon sprite={sprite as Sprite} size={48} />
        </span>
      ) : (
        <span className="grid h-full place-items-center text-[10px] text-muted-foreground">{skin || 'Character'}</span>
      )}
    </span>
  )
}
