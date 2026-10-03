import { useEffect, useRef, useState } from 'react'
import { usePartyApi } from '@/data/PartyDataProvider'
import { Button } from '@/components/ui/button'

interface SourceInfo {
  filename: string
  canonicalPath: string
  localPath: string
  dockerPath: string
  maxBytes: number
}
interface Preview {
  fields: string[]
  characters: string[]
  digest: string
  skippedCharacters?: Record<string, string[]>
}
const label = (field: string) =>
  ({
    marked: 'Bank collection marks',
    merchantMarked: 'Merchant collection marks',
    compounds: 'Compound groups',
    autoCompounds: 'Automatic compound rules',
    upgrades: 'Upgrade marks',
    upgradeOfferingRules: 'Upgrade offering rules',
    autoUpgradeMarks: 'Automatic upgrade rules',
    autoItemMarks: 'Automatic collection rules',
  })[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())

interface SaveHandle {
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}

/** dashboard-state-import.tsx with state-export-button.tsx and
 *  settings-export.ts: export to a save picker (or download), and import a
 *  settings or legacy caraGarage.jsonl file through preview and digest. */
export function DashboardStateImport() {
  const api = usePartyApi()
  const [info, setInfo] = useState<SourceInfo | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [filename, setFilename] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errorContext, setErrorContext] = useState('Could not load import/export settings')
  const [backup, setBackup] = useState('')
  const [skipped, setSkipped] = useState<string[]>([])
  const [exportError, setExportError] = useState('')
  const [exporting, setExporting] = useState(false)
  const content = useRef('')
  const picker = useRef<HTMLInputElement>(null)
  const selection = useRef(0)
  useEffect(() => {
    let alive = true
    const currentSelection = selection
    void api.dashboardStateInfo().then((result) => {
      if (!alive) return
      if (result.kind === 'failure') return setError(result.message)
      try {
        setInfo(JSON.parse(result.value) as SourceInfo)
      } catch {
        setError('Invalid response')
      }
    })
    return () => {
      alive = false
      currentSelection.current++
    }
  }, [api])

  async function request(action: 'preview' | 'import', source: string, digest?: string) {
    const result = await api.dashboardStateRequest(action, source, digest)
    if (result.kind === 'failure') throw new Error(result.message || `Import request failed (${result.status ?? ''})`)
    let parsed: unknown
    try {
      parsed = JSON.parse(result.value)
    } catch {
      throw new Error(result.value || 'Import request failed')
    }
    const data = parsed as (Preview & { error?: string; backupPath?: string }) | null
    if (!data) throw new Error('Import request failed')
    if (!Array.isArray(data.fields) || !Array.isArray(data.characters) || typeof data.digest !== 'string') throw new Error('Invalid import response')
    return data
  }
  async function choose(file?: File) {
    if (!file) return
    const revision = ++selection.current
    setError('')
    setBackup('')
    setPreview(null)
    content.current = ''
    setFilename(file.name)
    setErrorContext('Error reading state file')
    if (file.size > (info?.maxBytes || 128 * 1024 * 1024)) {
      setError('Choose a state file smaller than 128 MB.')
      return
    }
    setBusy(true)
    try {
      const source = await file.text()
      const result = await request('preview', source)
      if (revision !== selection.current) return
      content.current = source
      setPreview(result)
    } catch (problem) {
      if (revision === selection.current) setError(problem instanceof Error ? problem.message : 'Could not read this file')
    } finally {
      if (revision === selection.current) setBusy(false)
    }
  }
  async function apply() {
    if (!preview || busy) return
    setBusy(true)
    setError('')
    setErrorContext('Error importing state file')
    try {
      const result = await request('import', content.current, preview.digest)
      setSkipped(Object.keys(result.skippedCharacters || {}))
      setBackup(result.backupPath || 'Saved beside caraGarage.jsonl')
      setPreview(null)
      content.current = ''
      if (picker.current) picker.current.value = ''
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }
  // settings-export.ts exportSettings.
  async function exportSettings() {
    const name = `party_console_settings_${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')}.json`
    const savePicker = (window as unknown as { showSaveFilePicker?: (options: unknown) => Promise<SaveHandle> }).showSaveFilePicker
    const handle = savePicker ? await savePicker.call(window, { suggestedName: name, types: [{ description: 'JSON settings', accept: { 'application/json': ['.json'] } }] }) : null
    const result = await api.dashboardStateExport()
    if (result.kind === 'failure') throw new Error(result.message)
    const text = JSON.stringify(JSON.parse(result.value), null, 2)
    if (handle) {
      const writer = await handle.createWritable()
      await writer.write(text)
      await writer.close()
    } else {
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
  }
  return (
    <section aria-label="Dashboard state import/export" className="min-w-0 rounded-md border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">Dashboard state import/export</h3>
      <p className="mt-1 text-xs text-slate-200">
        Choose an exported settings JSON file or a legacy <code>caraGarage.jsonl</code> file. Import saved marks, automation rules, farming and event preferences.
      </p>
      <dl className="mt-3 space-y-2 text-xs text-slate-200">
        <div>
          <dt className="font-semibold text-emerald-100">This server’s canonical path</dt>
          <dd className="break-all font-mono">{info?.canonicalPath || 'Loading…'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-emerald-100">Local installation</dt>
          <dd className="break-all font-mono">{info?.localPath || '<installation>/.caracal/localStorage/caraGarage.jsonl'}</dd>
        </div>
        <div>
          <dt className="font-semibold text-emerald-100">Docker volume</dt>
          <dd className="break-all font-mono">/data/localStorage/caraGarage.jsonl</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-slate-300">Use a copy taken while the old service was stopped. Credentials, logins, queued work and travel state stay as they are. Full migration instructions are in the README.</p>
      <input
        ref={picker}
        type="file"
        accept=".json,application/json,.jsonl,application/x-ndjson,text/plain"
        aria-label="Import state file"
        className="sr-only"
        disabled={busy}
        onChange={(event) => void choose(event.target.files?.[0])}
      />
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <Button
          disabled={exporting}
          variant="outline"
          className="border-cyan-600"
          onClick={async () => {
            setExporting(true)
            setExportError('')
            try {
              await exportSettings()
            } catch (problem) {
              if (!(problem instanceof DOMException && problem.name === 'AbortError')) setExportError(problem instanceof Error ? problem.message : String(problem))
            } finally {
              setExporting(false)
            }
          }}
        >
          {exporting ? 'Exporting…' : 'Export state file'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className="border-cyan-600"
          onClick={() => {
            if (picker.current) {
              picker.current.value = ''
              picker.current.click()
            }
          }}
        >
          {busy ? 'Working…' : 'Import state file'}
        </Button>
      </div>
      {exportError && (
        <p role="alert" className="mt-2 break-words text-sm text-rose-200">
          Error exporting state file: {exportError}
        </p>
      )}
      {preview && (
        <div role="group" aria-label={`Review ${filename}`} className="mt-3 rounded border border-amber-600 bg-[#241e10] p-3 text-sm text-amber-100">
          <p className="break-all font-semibold">Review {filename}</p>
          <p className="mt-1">These saved settings will replace the corresponding settings here, including empty lists. Missing settings are kept.</p>
          <p className="mt-2">Characters: {preview.characters.join(', ') || 'Shared settings only'}</p>
          {Object.entries(preview.skippedCharacters || {}).map(([name, fields]) => (
            <p key={name} className="mt-2">
              Skipping {name} (not in this account): {fields.map(label).join(', ')}.
            </p>
          ))}
          <ul className="mt-2 max-h-40 list-inside list-disc overflow-y-auto">
            {preview.fields.map((field) => (
              <li key={field}>{label(field)}</li>
            ))}
          </ul>
          <p className="mt-2">{preview.fields.length ? 'A backup is saved on this server before importing. Imported automation rules take effect immediately.' : 'Nothing to import: all saved characters were skipped.'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy || !preview.fields.length} onClick={() => void apply()} className="border border-emerald-500">
              Import dashboard state
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setPreview(null)
                content.current = ''
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 break-words text-sm text-rose-200">
          {errorContext}: {error}
        </p>
      )}
      {backup && (
        <output className="mt-3 block break-all text-sm text-emerald-200">
          Dashboard state imported. {skipped.length > 0 && `Skipped: ${skipped.join(', ')}. `}Backup: <span className="font-mono">{backup}</span>
        </output>
      )}
    </section>
  )
}
