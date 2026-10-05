/**
 * Client side of the dashboard live stream: snapshot/delta/heartbeat
 * messages reconciled by epoch and sequence. Keep in step with the
 * console's dashboard/features/party/live-protocol.ts.
 *
 * vitals/items/slots stay raw JSON merged key-by-key, so new server
 * fields pass through without an app update.
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

  /** True for a recognized, in-order message, whether or not it changed
   *  anything. False (malformed or stale) must not count as a sign of a
   *  healthy connection. */
  accept(message: LiveMessage): boolean {
    if (!message || !Number.isSafeInteger(message.sequence) || typeof message.epoch !== 'string') return false
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
      // Ignore an older sample from the same generation rather than
      // rolling the displayed state backward.
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
