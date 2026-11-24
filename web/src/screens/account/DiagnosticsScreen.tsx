import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCharacters, usePartyApi } from '@/data/PartyDataProvider'
import { useAddons } from '@/data/useAddons'
import { readRing, useDiagnosticsAlerts, useDiagnosticsReport, type DiagnosticsAlerts } from '@/data/useDiagnostics'
import {
  ALERT_LABELS, DIAGNOSTICS_RINGS, isLeasedRing, ringReadFailures,
  type DiagnosticsAlert, type DiagnosticsLeadUp, type DiagnosticsRecordsReply,
} from '@/models'
import { AccountScreenScaffold } from './AccountScreenScaffold'

// The Diagnostics screen (console diagnostics-dialog.tsx), a page of its own as the PWA's other
// party views are. /diagnostics lists the alerts, /diagnostics/record/<id> shows one alert and
// /diagnostics/<ring> that ring's whole log.
// - The alerts are the errors only, every saved snapshot. Only they count toward the button's
//   badge, show as unread or appear in the list.
// - Opening the screen marks nothing read. Each alert has "Mark as read" and the screen has "Mark
//   all as read".
// - "Show all records", off when the screen opens, shows each ring's whole live log, read through
//   the diagnostics lease while it shows.

const time = (at: number) => new Date(at).toLocaleString()
const seconds = (ms?: number) => (typeof ms === 'number' ? `${Math.round(ms / 1000)} s without progress` : null)
// The character's report period (console lifecycle/fields.ts lifecycleReportMs). A lease lasts two
// report periods, so one read per period keeps it.
const REPORT_PERIOD_MS = 1_000

export function DiagnosticsScreen() {
  const { id, ring: ringParam } = useParams()
  const characters = Object.keys(useCharacters())
  const alerts = useDiagnosticsAlerts()
  const ring = ringParam && isLeasedRing(ringParam) ? ringParam : null
  // "Show all records" starts off each time the screen opens, unless the address names a ring.
  const routeKey = `${id ?? ''}/${ring ?? ''}`
  const [showAll, setShowAll] = useState(ring !== null)
  const [shownRoute, setShownRoute] = useState(routeKey)
  if (shownRoute !== routeKey) {
    setShownRoute(routeKey)
    setShowAll(ring !== null)
  }
  const shown = id ? alerts.alerts.filter((alert) => alert.id === id) : alerts.alerts
  return (
    <AccountScreenScaffold title="Diagnostics">
      <div data-area="diagnostics" className="flex flex-col gap-3 p-3 text-sm">
        <p className="text-muted-foreground">
          Deaths, stuck moments, caught errors, refusals, failed walks and tasks, churn, safe-point fallbacks and call-limit disconnects, each with the records that led up to it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!alerts.unread.length}
            onClick={() => alerts.markRead(alerts.unread.map((alert) => alert.id))}
            className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-50"
          >
            Mark all as read
          </button>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-cyan-500" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
            Show all records
          </label>
          <span className="text-muted-foreground">
            {alerts.unread.length} unread of {alerts.alerts.length}
          </span>
        </div>
        {alerts.error && (
          <p role="alert" className="text-rose-300">
            {alerts.error}
          </p>
        )}
        {showAll ? (
          <RingLogs characters={characters} ring={ring ?? 'movement'} />
        ) : (
          <>
            {id && (
              <Link className="text-cyan-300 underline" to="/diagnostics">
                All records
              </Link>
            )}
            {!shown.length && <p className="text-muted-foreground">{id ? `No record ${id}.` : 'No errors recorded.'}</p>}
            <div className="flex flex-col gap-3">
              {shown.map((alert) => (
                <AlertRow key={alert.id} alert={alert} alerts={alerts} single={!!id} />
              ))}
            </div>
          </>
        )}
      </div>
    </AccountScreenScaffold>
  )
}

/** One alert: what happened, to whom and when, and its report on demand. */
function AlertRow({ alert, alerts, single }: { alert: DiagnosticsAlert; alerts: DiagnosticsAlerts; single: boolean }) {
  const [open, setOpen] = useState(single)
  const unread = !alerts.read.has(alert.id)
  const severe = alert.trigger === 'caught-error' || alert.trigger === 'death'
  return (
    <article
      data-area="diagnostics-alert"
      aria-label={alert.id}
      data-unread={unread || undefined}
      className={'rounded border bg-black/40 p-3 ' + (unread ? 'border-amber-600' : 'border-border')}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {unread && <span title="Unread" className="size-2 self-center rounded-full bg-amber-400" />}
        <span className={severe ? 'font-semibold text-red-300' : 'font-semibold text-amber-300'}>{ALERT_LABELS[alert.trigger] ?? alert.trigger}</span>
        <span className="font-semibold">{alert.subject}</span>
        <span className="text-muted-foreground">{time(alert.at)}</span>
        <Link className="break-all font-mono text-xs text-cyan-300 underline" to={`/diagnostics/record/${encodeURIComponent(alert.id)}`}>
          {alert.id}
        </Link>
        {unread && (
          <button type="button" onClick={() => alerts.markRead([alert.id])} className="ml-auto rounded border border-border px-2 py-0.5 text-xs hover:bg-muted">
            Mark as read
          </button>
        )}
      </header>
      <details className="mt-2" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer text-muted-foreground">Report</summary>
        {open && <AlertReport alert={alert} />}
      </details>
    </article>
  )
}

/** An alert's report: each record's facts, then the routine records that led up to it. */
function AlertReport({ alert }: { alert: DiagnosticsAlert }) {
  const query = useDiagnosticsReport(alert)
  if (query.error)
    return (
      <p role="alert" className="mt-1 text-rose-300">
        The report could not be read ({query.error.message}).
      </p>
    )
  if (!query.data) return <p className="mt-1 text-muted-foreground">Loading...</p>
  const report = query.data
  return (
    <div className="mt-2 flex flex-col gap-3">
      {report.incidents.map((incident) => (
        <div key={incident.id} className="flex flex-col gap-1">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
            <dt className="text-muted-foreground">Record</dt>
            <dd className="break-all font-mono text-xs">{incident.id}</dd>
            {incident.activity && (
              <>
                <dt className="text-muted-foreground">Activity</dt>
                <dd>{incident.activity}</dd>
              </>
            )}
            {incident.rung && (
              <>
                <dt className="text-muted-foreground">Rung</dt>
                <dd>
                  {incident.rung}
                  {incident.trying ? ` - ${incident.trying}` : ''}
                </dd>
              </>
            )}
            {seconds(incident.noProgressMs) && (
              <>
                <dt className="text-muted-foreground">Progress</dt>
                <dd>{seconds(incident.noProgressMs)}</dd>
              </>
            )}
            {incident.position && (
              <>
                <dt className="text-muted-foreground">Where</dt>
                <dd>
                  {incident.position.map} [{Math.round(Number(incident.position.x))}, {Math.round(Number(incident.position.y))}]
                </dd>
              </>
            )}
            {incident.blocked && (
              <>
                <dt className="text-muted-foreground">Blocked by</dt>
                <dd>
                  {incident.blocked.code}
                  {incident.blocked.by?.kind ? ` from ${incident.blocked.by.kind}${incident.blocked.by.owner ? ' ' + incident.blocked.by.owner : ''}` : ''}
                </dd>
              </>
            )}
            {incident.error && (
              <>
                <dt className="text-muted-foreground">Error</dt>
                <dd className="text-red-200">{incident.error}</dd>
              </>
            )}
          </dl>
          {incident.leadUp?.length ? <RecordTable caption={`Lead-up (${incident.leadUp.length} records)`} records={incident.leadUp} /> : null}
        </div>
      ))}
      {report.records.length ? (
        <RecordTable caption={`Records before it (${report.records.length})`} records={report.records} />
      ) : (
        <p className="text-muted-foreground">No records before it.</p>
      )}
    </div>
  )
}

// The table scrolls sideways on a phone; its seven columns do not fit a narrow screen.
function RecordTable({ caption, records }: { caption: string; records: readonly DiagnosticsLeadUp[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full font-mono text-xs">
        <caption className="text-left text-muted-foreground">{caption}</caption>
        <thead className="text-left text-muted-foreground">
          <tr>
            <th>seq</th>
            <th>time</th>
            <th>decision</th>
            <th>kind</th>
            <th>owner</th>
            <th>code</th>
            <th>by</th>
          </tr>
        </thead>
        <tbody>
          {records.map((entry, index) => (
            <tr key={`${entry.seq}-${index}`} className="border-t border-border">
              <td>{entry.seq ?? ''}</td>
              <td>{typeof entry.at === 'number' ? new Date(entry.at).toLocaleTimeString() : ''}</td>
              <td>
                {entry.part ? entry.part + ' ' : ''}
                {entry.decision}
              </td>
              <td>{entry.kind ?? entry.skill ?? ''}</td>
              <td>{entry.owner ?? ''}</td>
              <td>{entry.code ?? entry.cause ?? entry.reason ?? ''}</td>
              <td>{entry.by ? [entry.by.kind, entry.by.owner ?? entry.by.site].filter(Boolean).join(' ') : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** "Show all records": each ring's whole live log, read through the diagnostics lease while it shows. */
function RingLogs({ characters, ring }: { characters: string[]; ring: string }) {
  const api = usePartyApi()
  const addonRings = useAddons().rings
  const label = addonRings.find((entry) => entry.ring === ring)?.label ?? DIAGNOSTICS_RINGS.find((row) => row.ring === ring)?.label ?? ring
  const [replies, setReplies] = useState<Record<string, DiagnosticsRecordsReply>>({})
  // The last failed read per character, shown in place of its records until a later read answers.
  const [failures, setFailures] = useState<Record<string, string>>({})
  // The roster as one string, so a new array with the same names keeps the reads running.
  const roster = [...characters].sort().join(',')
  const names = useMemo(() => (roster ? roster.split(',') : []), [roster])
  useEffect(() => {
    if (!names.length) return
    let stopped = false
    const read = async () => {
      const next: Record<string, DiagnosticsRecordsReply> = {}
      const failed: Record<string, string> = {}
      for (const name of names) {
        try {
          next[name] = await readRing(api, name, ring)
        } catch (error) {
          failed[name] = error instanceof Error ? error.message : String(error)
        }
      }
      if (!stopped) {
        setReplies(next)
        setFailures(failed)
      }
    }
    void read()
    const timer = window.setInterval(read, REPORT_PERIOD_MS)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [api, ring, names])
  const ringFailures = Object.entries(replies).flatMap(([name, reply]) => ringReadFailures(reply.live?.[ring]?.incidents).map((error) => ({ name, error })))
  const posts = Object.entries(replies).flatMap(([name, reply]) => (reply.live?.[ring] ? [{ name, post: reply.live[ring]! }] : []))
  const tabs = [...DIAGNOSTICS_RINGS.map((row) => ({ ring: row.ring as string, label: row.label })), ...addonRings]
  return (
    <section data-area="diagnostics-rings" className="flex flex-col gap-3">
      {Object.entries(failures).map(([name, message]) => (
        <p key={name} role="alert" className="text-rose-300">
          {name}: the {label.toLowerCase()} records could not be read ({message}).
        </p>
      ))}
      {ringFailures.map(({ name, error }) => (
        <p key={'ring-' + name} role="alert" className="text-rose-300">
          {name}: the character could not read its {label.toLowerCase()} ring ({error}).
        </p>
      ))}
      <nav role="tablist" aria-label="Rings" className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.ring}
            role="tab"
            aria-selected={ring === tab.ring}
            to={`/diagnostics/${tab.ring}`}
            replace
            className={'rounded border px-2 py-1 ' + (ring === tab.ring ? 'border-cyan-300 bg-cyan-950' : 'border-border')}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {posts.length ? (
        posts.map(({ name, post }) => (
          <article key={name} aria-label={name} className="rounded border border-border bg-black/40 p-3">
            <header className="font-semibold">
              {name} <span className="font-normal text-muted-foreground">{new Date(post.at).toLocaleTimeString()}</span>
            </header>
            {Array.isArray(post.records) ? (
              <RecordTable caption={`${label} records (${post.records.length})`} records={post.records as DiagnosticsLeadUp[]} />
            ) : (
              <pre className="mt-2 max-h-96 overflow-auto font-mono text-xs">{JSON.stringify(post.records, null, 1)}</pre>
            )}
          </article>
        ))
      ) : Object.keys(failures).length ? null : (
        <p className="text-muted-foreground">No {label.toLowerCase()} records yet; each character posts its ring after its next report.</p>
      )}
    </section>
  )
}
