import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { QK } from '@/data/queryKeys'
import { usePartyApi, useCharacters, useDynamicState, useMail, useRefreshDynamicStateNow, useDomainInterest } from '@/data/PartyDataProvider'
import { useCatalogLookup, displayName } from '@/lib/catalogLookup'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { SpriteIcon } from '@/components/SpriteIcon'
import { ItemDetailBrowser } from '@/screens/itemdetail/ItemDetailBrowser'
import { AccountScreenScaffold } from './AccountScreenScaffold'
import type { CatalogItem, InventoryEntry, Item, ReceivedMail } from '@/models'

type CatalogFor = (id: string) => CatalogItem | undefined
/** use-party-console.tsx mailDraft - e.g. ALData's "Prepare mail". */
export interface MailDraft {
  recipient: string
  subject: string
  message: string
}

/** send-mail-dialog.tsx attachmentLevel: " +N" for anything that has levels. */
function attachmentLevel(item: Item, info?: CatalogItem) {
  const definition = info?.meta?.definition
  return item.level != null || info?.upgradeable || info?.compoundable || definition?.upgrade || definition?.compound ? ` +${Number(item.level) || 0}` : ''
}

const sentAt = (sent?: string) => (sent ? new Date(sent).toLocaleString() : '')

/** send-mail-dialog.tsx, in this app's layout: the received-mail list
 *  (Refresh / Write message), a message's detail sheet (attachment collect,
 *  two-step delete, reply), and the compose form - attachments from the
 *  merchant's inventory, every bank pack and each bankboi, postage, and a
 *  two-step send. */
export function MailScreen() {
  useDomainInterest('mail')
  const mail = useMail()
  const dynamicState = useDynamicState()
  const api = usePartyApi()
  const refreshNow = useRefreshDynamicStateNow()
  const catalogFor = useCatalogLookup(dynamicState.merchantCatalog)
  const initialDraft = (useLocation().state as { draft?: MailDraft } | null)?.draft ?? null
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [composing, setComposing] = useState(!!initialDraft)
  const [draft, setDraft] = useState<(MailDraft & { key: number }) | null>(initialDraft ? { ...initialDraft, key: 1 } : null)
  const [mailBusy, setMailBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selected = mail.messages.find((message) => message.id === selectedId)

  const mailAction = async (action: 'refresh' | 'collect' | 'delete', id?: string) => {
    setMailBusy(true)
    setError(null)
    const result = await api.mailAction(action, id)
    setMailBusy(false)
    if (result.kind === 'failure') return setError(result.message || 'Mail action failed')
    if (action === 'delete') setSelectedId(null)
    await refreshNow()
  }

  return (
    <AccountScreenScaffold title={`Mail (${mail.count})`} onRefresh={() => void refreshNow()}>
      <div className="flex gap-2 p-3">
        <Button variant="outline" disabled={mailBusy} onClick={() => void mailAction('refresh')}>
          Refresh
        </Button>
        <Button
          onClick={() => {
            setSelectedId(null)
            setComposing(true)
          }}
        >
          Write message
        </Button>
      </div>
      {error && !selected && (
        <p role="alert" className="mx-3 mb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {composing && (
        <ComposeSection
          key={draft?.key ?? 0}
          draft={draft}
          catalogFor={catalogFor}
          onClose={() => {
            setComposing(false)
            setDraft(null)
          }}
        />
      )}
      {mail.error && <p className="mx-3 mb-2 text-sm text-amber-500">Mail may be out of date: {mail.error}</p>}
      {!mail.messages.length ? (
        <p className="p-6 text-center text-sm text-muted-foreground">{mail.updatedAt ? 'No received mail.' : 'Loading mail…'}</p>
      ) : (
        <div className="flex flex-col gap-1.5 p-3">
          {mail.messages.map((message, index) => (
            <button
              key={message.id ?? index}
              type="button"
              onClick={() => {
                setError(null)
                setSelectedId(message.id ?? null)
              }}
              className="rounded-md border border-border bg-card p-3 text-left"
            >
              <p className="break-words text-sm font-medium">{message.subject || '(No subject)'}</p>
              <p className="text-xs text-muted-foreground">From {message.from}</p>
              <p className="text-xs text-muted-foreground">{sentAt(message.sent)}</p>
              {message.item && (
                <p className="mt-1 text-xs text-amber-500">{message.taken === true ? 'Attachment collected' : String(message.collection || '') || 'Attachment available'}</p>
              )}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <MailDetailSheet
          mail={selected}
          catalogFor={catalogFor}
          busy={mailBusy}
          error={error}
          onAction={mailAction}
          onReply={() => {
            setSelectedId(null)
            setDraft({ recipient: selected.from ?? '', subject: '', message: '', key: Date.now() })
            setComposing(true)
          }}
          onClose={() => {
            setSelectedId(null)
            setError(null)
          }}
        />
      )}
    </AccountScreenScaffold>
  )
}

function MailDetailSheet({
  mail,
  catalogFor,
  busy,
  error,
  onAction,
  onReply,
  onClose,
}: {
  mail: ReceivedMail
  catalogFor: CatalogFor
  busy: boolean
  error: string | null
  onAction: (action: 'collect' | 'delete', id?: string) => Promise<void>
  onReply: () => void
  onClose: () => void
}) {
  const dynamicState = useDynamicState()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const info = mail.item ? catalogFor(mail.item.name) : undefined
  const collection = String(mail.collection || '')
  const collectionActive = ['queued', 'collecting'].includes(collection)

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
          <section aria-label="Mail message" className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">{mail.subject}</h3>
            <p className="text-xs text-muted-foreground">
              {mail.from} → {mail.to} · {sentAt(mail.sent)}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">{mail.message}</p>
            {mail.item && (
              <div className="rounded-md border border-amber-700 p-3">
                <button type="button" title="View attachment details" onClick={() => setInspecting(true)} className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left">
                  <SpriteIcon sprite={info?.sprite ?? info?.meta?.sprite} size={40} />
                  <span className="text-sm">
                    {info?.name || mail.item.name || 'Unknown attachment'}
                    {attachmentLevel(mail.item, info)} × {mail.item.q || 1}
                  </span>
                </button>
                <p className="mt-2 text-sm">
                  {mail.taken === true ? 'Collected' : mail.taken === 'pending' ? 'Game is processing collection' : collection || 'Unclaimed'}
                  {mail.collectionError ? `: ${mail.collectionError}` : ''}
                </p>
                <Button size="sm" className="mt-2" disabled={busy || mail.taken !== false || collectionActive} onClick={() => void onAction('collect', mail.id)}>
                  Collect attachment
                </Button>
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={confirmingDelete ? 'destructive' : 'outline'}
                disabled={busy || !!(mail.item && mail.taken !== true) || collectionActive}
                onClick={() => (confirmingDelete ? void onAction('delete', mail.id) : setConfirmingDelete(true))}
              >
                {confirmingDelete ? 'Confirm permanent deletion' : 'Delete message'}
              </Button>
              {confirmingDelete && (
                <Button size="sm" variant="outline" onClick={() => setConfirmingDelete(false)}>
                  Cancel deletion
                </Button>
              )}
              <Button size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={onReply}>
                Reply
              </Button>
            </div>
          </section>
        </SheetContent>
      </Sheet>
      {inspecting && mail.item && (
        <Sheet open onOpenChange={(open) => !open && setInspecting(false)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
            <ItemDetailBrowser
              rootItemId={mail.item.name}
              rootLevel={mail.item.level ?? 0}
              rootStatType={mail.item.stat_type}
              catalog={dynamicState.merchantCatalog}
              monsters={dynamicState.bestiaryCatalog}
            />
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}

interface Attachment {
  pack: string
  label: string
  entry: InventoryEntry
}

function ComposeSection({ draft, catalogFor, onClose }: { draft: MailDraft | null; catalogFor: CatalogFor; onClose: () => void }) {
  // The attachment sources include every bank pack and bankboi.
  useDomainInterest('bank')
  const api = usePartyApi()
  const queryClient = useQueryClient()
  const [inspectingAttachment, setInspectingAttachment] = useState(false)
  const refreshNow = useRefreshDynamicStateNow()
  const state = useDynamicState()
  const characters = useCharacters()
  const merchant = state.merchantCharacter ?? null
  const [recipient, setRecipient] = useState(draft?.recipient ?? '')
  const [subject, setSubject] = useState(draft?.subject ?? '')
  const [message, setMessage] = useState(draft?.message ?? '')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [quantity, setQuantity] = useState('')
  const [search, setSearch] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [postage, setPostage] = useState<number | null>(null)

  // GET /mail/postage (send-mail-dialog.tsx postageQuery).
  useEffect(() => {
    let cancelled = false
    void api.getJson<{ gold?: number }>('mail/postage').then((result) => {
      if (!cancelled && result.kind === 'success' && typeof result.value.gold === 'number') setPostage(result.value.gold)
    })
    return () => {
      cancelled = true
    }
  }, [api])

  const sources = useMemo(() => {
    const rows: { label: string; pack: string; items: (InventoryEntry | null)[] }[] = []
    if (merchant) rows.push({ label: `${merchant} inventory`, pack: 'merchant', items: characters[merchant]?.inventory?.items ?? [] })
    Object.entries(state.bank?.packs ?? {}).forEach(([pack, items]) => rows.push({ label: `Bank · ${pack}`, pack, items }))
    state.bankbois.forEach((bankboi) => rows.push({ label: `Bankboi · ${bankboi.name}`, pack: `bankboi:${bankboi.name}`, items: bankboi.items ?? [] }))
    return rows
  }, [merchant, characters, state.bank, state.bankbois])
  const query = search.trim().toLowerCase()
  const filteredSources = sources
    .map((source) => ({
      ...source,
      items: source.items.filter((entry): entry is InventoryEntry => !!entry && `${entry.item.name} ${catalogFor(entry.item.name)?.name || ''}`.toLowerCase().includes(query)),
    }))
    .filter((source) => source.items.length)

  const attachmentInfo = attachment ? catalogFor(attachment.entry.item.name) : undefined
  const available = Math.max(1, Number(attachment?.entry.item.q) || 1)
  const stackable = available > 1 || Number(attachmentInfo?.meta?.definition?.s || 1) > 1
  const validQuantity = !stackable || (Number.isSafeInteger(Number(quantity)) && Number(quantity) >= 1 && Number(quantity) <= available)
  const resetConfirmation = () => {
    setConfirming(false)
    setError(null)
  }

  const send = async () => {
    if (!confirming) return setConfirming(true)
    setBusy(true)
    setError(null)
    const result = await api.sendMail({
      recipient: recipient.trim(),
      subject: subject.trim(),
      message,
      quantity: stackable ? Number(quantity) : 1,
      source: attachment ? { pack: attachment.pack, slot: attachment.entry.slot, item: attachment.entry.item } : undefined,
    })
    setBusy(false)
    if (result.kind === 'failure') {
      setError(result.message || 'Mail could not be queued')
      setConfirming(false)
      return
    }
    if (recipient.trim() === 'earthiverse' && subject.trim() === 'aldata_auth') queryClient.setQueryData(QK.aldataAuthPending, true)
    await refreshNow()
    onClose()
  }

  return (
    <section aria-label="Write message" className="mx-3 mb-3 flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <p className="text-sm font-medium">Write message</p>
      {attachment && (
        <Button
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={() => {
            setAttachment(null)
            resetConfirmation()
          }}
        >
          Remove attachment
        </Button>
      )}
      <label className="grid gap-1 text-xs text-muted-foreground">
        Character name
        <Input
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value)
            resetConfirmation()
          }}
        />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Subject
        <Input
          value={subject}
          maxLength={74}
          onChange={(e) => {
            setSubject(e.target.value)
            resetConfirmation()
          }}
        />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Message
        <Textarea
          value={message}
          maxLength={1000}
          rows={6}
          onChange={(e) => {
            setMessage(e.target.value)
            resetConfirmation()
          }}
        />
      </label>

      {attachment ? (
        <div className="rounded-md border border-amber-700 p-2.5">
          <div className="flex items-center gap-2">
            {/* send-mail-dialog.tsx: the selected attachment opens its item details. */}
            <button type="button" title="View attachment details" aria-label="View attachment details" onClick={() => setInspectingAttachment(true)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
              <SpriteIcon sprite={attachmentInfo?.sprite ?? attachmentInfo?.meta?.sprite} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {displayName(attachment.entry.item.name, catalogFor)}
                  {attachmentLevel(attachment.entry.item, attachmentInfo)}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {attachment.label} · slot {attachment.entry.slot}
                </p>
              </div>
            </button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setAttachment(null)
                setQuantity('')
                resetConfirmation()
              }}
            >
              Clear attachment
            </Button>
          </div>
          {inspectingAttachment && (
            <Sheet open onOpenChange={(open) => !open && setInspectingAttachment(false)}>
              <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto p-4">
                <ItemDetailBrowser
                  rootItemId={attachment.entry.item.name}
                  rootLevel={attachment.entry.item.level ?? 0}
                  rootStatType={attachment.entry.item.stat_type}
                  catalog={state.merchantCatalog}
                  monsters={state.bestiaryCatalog}
                />
              </SheetContent>
            </Sheet>
          )}
          {stackable && (
            <label className="mt-2 grid gap-1 text-xs text-muted-foreground">
              Quantity (1–{available})
              <Input
                inputMode="numeric"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value.replace(/[^0-9]/g, ''))
                  resetConfirmation()
                }}
              />
            </label>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border p-2.5 text-xs text-muted-foreground">Optional: select an attachment below.</p>
      )}

      <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto rounded-md border border-border p-2">
        <Input type="search" aria-label="Search attachments" placeholder="Search items to attach…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {!filteredSources.length && <p className="text-xs text-muted-foreground">No matching items.</p>}
        {filteredSources.map((source) => (
          <div key={source.pack} role="group" aria-label={source.label}>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{source.label}</p>
            <div className="flex flex-col gap-1">
              {source.items.map((entry) => {
                const info = catalogFor(entry.item.name)
                const chosen = attachment?.pack === source.pack && attachment.entry.slot === entry.slot
                return (
                  <button
                    key={entry.slot}
                    type="button"
                    onClick={() => {
                      setAttachment({ pack: source.pack, label: source.label, entry })
                      setQuantity('')
                      resetConfirmation()
                    }}
                    className={`flex items-center gap-2 rounded-md border p-1.5 text-left text-sm ${chosen ? 'border-amber-400' : 'border-border'}`}
                  >
                    <SpriteIcon sprite={info?.sprite} size={28} />
                    <span className="min-w-0 flex-1">
                      {displayName(entry.item.name, catalogFor)}
                      {attachmentLevel(entry.item, info)}
                      {Number(entry.item.q) > 1 ? ` x${entry.item.q}` : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="rounded-md border border-amber-700 p-2.5 text-xs text-amber-500">
        {postage === null ? 'Postage estimate unavailable. Sending mail spends your character’s gold.' : `Postage: ${postage.toLocaleString()} gold per message, charged by Adventure Land.`}
        {attachment ? ' The attached items also leave your inventory.' : ''}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={confirming ? 'destructive' : 'default'}
          disabled={busy || !recipient.trim() || !subject.trim() || (!!attachment && !validQuantity)}
          onClick={() => void send()}
        >
          {busy ? 'Queuing…' : confirming ? 'Really send mail?' : 'Send mail'}
        </Button>
      </div>
    </section>
  )
}
