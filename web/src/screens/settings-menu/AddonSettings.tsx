import { useState } from 'react'
import { useAddons, useAddonWrites } from '@/data/useAddons'
import { addonTitle, type AddonListing, type AddonSettingListing } from '@/models'

// The add-on manager (console runtime/hooks/dashboard/settings-page.tsx): the installed add-ons,
// each with its title, author, summary, switch and declared settings, read from GET /addons. A
// change posts POST /addons and takes effect on each character's next status reply.

const FIELD = 'rounded border border-border bg-background px-2 py-1'
const NUMBER = 'w-24 ' + FIELD
type RecordField = NonNullable<AddonSettingListing['fields']>[string]

/** The Addons tab shows one add-on per section (`only`); with none named it lists every one. */
export function AddonSettings({ only }: { only?: string }) {
  const list = useAddons()
  const writes = useAddonWrites()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const save = async (name: string, body: { enabled?: boolean; settings?: Record<string, unknown> }) => {
    setBusy(true)
    setError('')
    try {
      await writes.save(name, body)
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }
  // One setting's control, by the settings owner's add-on kinds (console runtime/settings/api.ts
  // ADDON_KINDS). A list of ids (`monsters`, `items`) is typed comma-separated.
  const control = (addon: AddonListing, key: string, setting: AddonSettingListing) => {
    const label = `${addon.name} ${setting.label}`
    const put = (value: unknown) => void save(addon.name, { settings: { [key]: value } })
    switch (setting.kind) {
      case 'boolean':
        return <input type="checkbox" className="size-4" checked={setting.value === true} disabled={busy} aria-label={label} onChange={(event) => put(event.target.checked)} />
      case 'number':
        return (
          <input
            type="number"
            className={NUMBER}
            disabled={busy}
            min={setting.min}
            max={setting.max}
            aria-label={label}
            defaultValue={Number(setting.value)}
            onBlur={(event) => {
              const value = Number(event.target.value)
              if (Number.isFinite(value) && value !== setting.value) put(value)
            }}
          />
        )
      case 'text':
        return (
          <input
            type="text"
            className={FIELD}
            disabled={busy}
            aria-label={label}
            defaultValue={String(setting.value ?? '')}
            onBlur={(event) => {
              if (event.target.value !== setting.value) put(event.target.value)
            }}
          />
        )
      case 'monsters':
      case 'items':
        return (
          <input
            type="text"
            className={FIELD}
            disabled={busy}
            aria-label={label}
            defaultValue={((setting.value ?? []) as string[]).join(', ')}
            onBlur={(event) => put(event.target.value.split(',').map((id) => id.trim()).filter(Boolean))}
          />
        )
      case 'choice':
        return (
          <select className={FIELD} value={String(setting.value ?? '')} disabled={busy} aria-label={label} onChange={(event) => put(event.target.value)}>
            {(setting.choices ?? []).map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        )
      case 'character':
        return (
          <select className={FIELD} value={String(setting.value ?? '')} disabled={busy} aria-label={label} onChange={(event) => put(event.target.value || null)}>
            <option value="">None</option>
            {(setting.choices ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )
      case 'per-character':
        // A character with no saved choice shows None, so the screen shows only what the console holds.
        return (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-muted-foreground">{setting.label}</legend>
            {(setting.characters ?? []).map((name) => (
              <label key={name} className="flex items-center gap-3">
                <span className="w-28 text-muted-foreground">{name}</span>
                <select
                  className={FIELD}
                  disabled={busy}
                  aria-label={`${label} ${name}`}
                  value={String((setting.value as Record<string, string> | null)?.[name] ?? '')}
                  onChange={(event) => {
                    if (event.target.value) put({ [name]: event.target.value })
                  }}
                >
                  <option value="">None</option>
                  {(setting.choices ?? []).map((choice) => (
                    <option key={choice} value={choice}>
                      {choice}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </fieldset>
        )
      case 'records':
        return <RecordsTable label={label} setting={setting} busy={busy} put={put} />
    }
    return <span className="text-muted-foreground">{String(setting.kind)} settings show on the console's own page.</span>
  }
  const shown = error || list.error
  return (
    <section data-area="addon-manager" aria-label="Add-ons" className="flex flex-col gap-3 p-3 text-sm">
      {list.refusals.map((refusal) => (
        <p key={refusal.name} role="alert" className="text-amber-200">
          Not loaded, {refusal.name}: {refusal.message}.
        </p>
      ))}
      {list.loaded && !list.error && !list.addons.length && <p className="text-muted-foreground">No add-ons are installed.</p>}
      {list.addons
        .filter((addon) => !only || addon.name === only)
        .map((addon) => (
          <div key={addon.name} data-addon={addon.name} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <label className="flex flex-wrap items-center gap-x-3 gap-y-1 font-semibold">
              <input type="checkbox" className="size-4" checked={addon.enabled} disabled={busy} aria-label={`${addon.name} on`} onChange={(event) => void save(addon.name, { enabled: event.target.checked })} />
              {addonTitle(addon.name)}
              <span className="font-normal text-muted-foreground">by {addon.author}</span>
            </label>
            <p className="text-muted-foreground">{addon.summary}</p>
            {Object.entries(addon.settings).map(([key, setting]) =>
              setting.kind === 'per-character' || setting.kind === 'records' ? (
                <div key={key}>{control(addon, key, setting)}</div>
              ) : (
                <label key={key} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-28 flex-1 text-muted-foreground">{setting.label}</span>
                  {control(addon, key, setting)}
                </label>
              ),
            )}
          </div>
        ))}
      {shown && (
        <p role="alert" className="text-rose-300">
          {shown}
        </p>
      )}
    </section>
  )
}

type Row = Record<string, unknown>
// A new record's value for each field: the field's first choice, its least number, or empty.
function blank(field: RecordField): unknown {
  switch (field.kind) {
    case 'boolean': return false
    case 'number': return field.min ?? 0
    case 'choice': return field.choices?.[0] ?? ''
    case 'character': return null
    case 'monsters':
    case 'items': return []
    default: return ''
  }
}

// A `records` setting as a table: a row per record and a column per field, with add, remove and an
// edit of each cell. Every change saves the whole list, which the settings writer checks record by
// record. The table scrolls sideways on a phone.
function RecordsTable({ label, setting, busy, put }: { label: string; setting: AddonSettingListing; busy: boolean; put: (value: unknown) => void }) {
  const fields = Object.entries(setting.fields ?? {})
  const rows = Array.isArray(setting.value) ? (setting.value as Row[]) : []
  const edit = (index: number, key: string, value: unknown) => put(rows.map((row, at) => (at === index ? { ...row, [key]: value } : row)))
  const cell = (row: Row, index: number, key: string, field: RecordField) => {
    const name = `${label} ${index + 1} ${field.label}`
    const value = row[key]
    switch (field.kind) {
      case 'boolean':
        return <input type="checkbox" className="size-4" checked={value === true} disabled={busy} aria-label={name} onChange={(event) => edit(index, key, event.target.checked)} />
      case 'number':
        return (
          <input
            type="number"
            className={NUMBER}
            disabled={busy}
            min={field.min}
            max={field.max}
            aria-label={name}
            defaultValue={Number(value ?? blank(field))}
            onBlur={(event) => {
              const next = Number(event.target.value)
              if (Number.isFinite(next) && next !== value) edit(index, key, next)
            }}
          />
        )
      case 'choice':
      case 'character': {
        const choices = field.kind === 'choice' ? (field.choices ?? []) : setting.characters
        if (!choices)
          return (
            <input
              type="text"
              className={FIELD}
              disabled={busy}
              aria-label={name}
              defaultValue={String(value ?? '')}
              onBlur={(event) => {
                if (event.target.value !== (value ?? '')) edit(index, key, event.target.value || null)
              }}
            />
          )
        return (
          <select className={FIELD} value={String(value ?? '')} disabled={busy} aria-label={name} onChange={(event) => edit(index, key, event.target.value || null)}>
            {field.kind === 'character' && <option value="">None</option>}
            {choices.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        )
      }
      case 'monsters':
      case 'items':
        return (
          <input
            type="text"
            className={FIELD}
            disabled={busy}
            aria-label={name}
            defaultValue={((value ?? []) as string[]).join(', ')}
            onBlur={(event) => edit(index, key, event.target.value.split(',').map((id) => id.trim()).filter(Boolean))}
          />
        )
      default:
        return (
          <input
            type="text"
            className={FIELD}
            disabled={busy}
            aria-label={name}
            defaultValue={String(value ?? '')}
            onBlur={(event) => {
              if (event.target.value !== value) edit(index, key, event.target.value)
            }}
          />
        )
    }
  }
  // A row's key carries its values, so an uncontrolled cell redraws with the saved value after a remove.
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-muted-foreground">{setting.label}</legend>
      <div className="overflow-x-auto">
        <table className="text-left">
          <thead>
            <tr>
              {fields.map(([key, field]) => (
                <th key={key} className="pr-3 font-normal text-muted-foreground">
                  {field.label}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index + ' ' + JSON.stringify(row)}>
                {fields.map(([key, field]) => (
                  <td key={key} className="py-0.5 pr-3">
                    {cell(row, index, key, field)}
                  </td>
                ))}
                <td>
                  <button type="button" className={FIELD} disabled={busy} aria-label={`${label} ${index + 1} remove`} onClick={() => put(rows.filter((_, at) => at !== index))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className={FIELD + ' self-start'}
        disabled={busy}
        aria-label={`${label} add`}
        onClick={() => put([...rows, Object.fromEntries(fields.map(([key, field]) => [key, blank(field)]))])}
      >
        Add
      </button>
    </fieldset>
  )
}
