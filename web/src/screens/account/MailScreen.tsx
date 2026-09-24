import { useState } from 'react'
import { usePartyApi, useDynamicState, useMail, useRefreshDynamicStateNow } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AccountScreenScaffold, EmptyState } from './AccountScreenScaffold'
import type { CatalogItem, ReceivedMail } from '@/models'

/** Mail inbox plus compose and attachment collection - ported from
 *  ui/account/MailScreen.kt. No item/gold attachment on send yet: that
 *  needs a "which character's inventory" picker this screen has no
 *  natural context for, called out as its own remaining gap. */
export function MailScreen() {
  const mail = useMail()
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)
  const [composing, setComposing] = useState(false)
  const [recipient, setRecipient] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <AccountScreenScaffold title={`Mail (${mail.count})`} onRefresh={() => void refreshNow()}>
      <div className="p-3">
        <Button onClick={() => setComposing((v) => !v)}>{composing ? 'Cancel' : 'Compose'}</Button>
      </div>
      {composing && (
        <div className="flex flex-col gap-2 px-3">
          <Input placeholder="To (character name)" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <Textarea placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            className="w-fit"
            onClick={async () => {
              const result = await api.sendMail(recipient.trim(), subject.trim(), body)
              if (result.kind === 'failure') {
                setError(result.message)
              } else {
                setComposing(false)
                setRecipient('')
                setSubject('')
                setBody('')
                setError(null)
                await refreshNow()
              }
            }}
          >
            Send
          </Button>
        </div>
      )}
      {mail.messages.length === 0 ? (
        <EmptyState message="No mail." />
      ) : (
        <div className="flex flex-col gap-1.5 p-3">
          {mail.messages.map((message, index) => (
            <MailRow key={message.id ?? index} mail={message} catalogFor={catalogFor} />
          ))}
        </div>
      )}
    </AccountScreenScaffold>
  )
}

function MailRow({ mail, catalogFor }: { mail: ReceivedMail; catalogFor: (id: string) => CatalogItem | undefined }) {
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const taken = typeof mail.taken === 'boolean' ? mail.taken : mail.taken === 'pending'

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-sm font-medium">
        {mail.subject || '(no subject)'} — from {mail.from ?? 'unknown'}
      </div>
      {mail.message && <p className="text-sm">{mail.message}</p>}
      {mail.item && (
        <div className="mt-1 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Attached: {displayName(mail.item.name, catalogFor)}</span>
          {!taken && mail.id ? (
            <button
              className="text-xs text-primary underline"
              onClick={async () => {
                await api.collectMail(mail.id!)
                await refreshNow()
              }}
            >
              Collect
            </button>
          ) : taken ? (
            <span className="text-xs text-muted-foreground">(collected)</span>
          ) : null}
        </div>
      )}
      {mail.sent && <p className="mt-1 text-xs text-muted-foreground">{mail.sent}</p>}
    </div>
  )
}
