/**
 * Faithful TypeScript port of party-console's own
 * dashboard/features/party/live-protocol.ts (also ported to Kotlin as
 * network/LiveProtocol.kt for the Android app) - same message shape,
 * same snapshot/delta/heartbeat/epoch/sequence reconciliation rules, so
 * this client's view of a character's state can never drift from what
 * the actual web dashboard shows for the same server. vitals/items/slots
 * are kept as raw JSON objects merged key-by-key - the server can add
 * new fields over time and this keeps working without a matching app
 * update.
 *
 * If party-console's own live-protocol.ts ever changes, re-port from the
 * new source rather than guessing - this file's job is to match theirs,
 * not to reinterpret it.
 */
export interface LiveRecordWire {
  generation: string
  sample: number
  sampledAt: number
  vitals: Record<string, unknown>
  items: Record<string, unknown>
  slots: Record<string, unknown>
}

export interface LiveMessage {
  type: string // "snapshot" | "delta" | "heartbeat"
  epoch: string
  sequence: number
  characters?: Record<string, LiveRecordWire | null> | null
}

const mergeObjects = (previous: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> => ({
  ...previous,
  ...incoming,
})

export class LiveReceiver {
  private epoch = ''
  private sequence = -1
  private readonly records = new Map<string, LiveRecordWire>()
  private readonly write: (name: string, record: LiveRecordWire | null) => void

  constructor(write: (name: string, record: LiveRecordWire | null) => void) {
    this.write = write
  }

  /** Returns true if the message was a recognized, in-order protocol
   *  message (whether or not it changed anything) - false means it was
   *  malformed or stale and the caller should not treat it as a sign of a
   *  healthy connection (used to decide whether to reset the heartbeat
   *  watchdog timer). */
  accept(message: LiveMessage): boolean {
    if (message.sequence < 0) return false
    if (message.type === 'heartbeat') return message.epoch === this.epoch
    if (message.type !== 'snapshot' && message.type !== 'delta') return false
    if (message.type === 'delta' && (message.epoch !== this.epoch || message.sequence <= this.sequence)) return false

    if (message.type === 'snapshot') {
      const present = new Set(Object.keys(message.characters ?? {}))
      for (const name of Array.from(this.records.keys())) {
        if (!present.has(name)) this.write(name, null)
      }
      this.records.clear()
      this.epoch = message.epoch
    }
    this.sequence = message.sequence

    for (const [name, incoming] of Object.entries(message.characters ?? {})) {
      if (incoming == null) {
        this.records.delete(name)
        this.write(name, null)
        continue
      }
      const previous = this.records.get(name)
      const sameGeneration = previous != null && previous.generation === incoming.generation
      // Stale-sample guard: a delta that arrived out of order for the
      // SAME character generation, carrying an older sample number than
      // what's already held, is ignored rather than rolling the
      // displayed state backward.
      if (sameGeneration && incoming.sample < previous!.sample) continue

      const next: LiveRecordWire = {
        ...incoming,
        vitals: mergeObjects(sameGeneration ? previous!.vitals : {}, incoming.vitals),
        items: mergeObjects(sameGeneration ? previous!.items : {}, incoming.items),
        slots: mergeObjects(sameGeneration ? previous!.slots : {}, incoming.slots),
      }
      this.records.set(name, next)
      this.write(name, next)
    }
    return true
  }
}
