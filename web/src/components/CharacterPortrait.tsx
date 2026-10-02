/** character-portrait.tsx: the coordinator's own rendered character doll
 *  (characterDollHtml), or the skin name while none has been seen. */
export function CharacterPortrait({ html, skin, className = '' }: { html?: string | null; skin?: string | null; className?: string }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none relative block select-none overflow-hidden [&_img]:max-w-none ${className}`}>
      {html ? (
        <span className="absolute inset-0 grid place-items-center" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span className="grid h-full place-items-center text-[10px] text-muted-foreground">{skin || 'Character'}</span>
      )}
    </span>
  )
}
