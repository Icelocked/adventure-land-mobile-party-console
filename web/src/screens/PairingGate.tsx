import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PartyApiClient } from '@/api/partyApi'
import { loadServerSettings } from '@/config/serverConfig'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Gates the app behind party-console's browser-pairing check
 *  (GET /setup/state: 200 once paired, 401 otherwise) before opening the live
 *  party-data connection. An unpaired browser's /party-api/* fetches just
 *  302 to /setup forever, which would otherwise look like an endless
 *  "connecting" spinner. */

type Status = 'checking' | 'paired' | 'unpaired' | 'unreachable'

function extractToken(input: string): string {
  const trimmed = input.trim()
  const hashIndex = trimmed.indexOf('#')
  return hashIndex >= 0 ? trimmed.slice(hashIndex + 1) : trimmed
}

export function PairingGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking')
  const [error, setError] = useState('')
  const [manualInput, setManualInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanUnsupported, setScanUnsupported] = useState(false)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)

  async function checkPaired() {
    setStatus('checking')
    const api = new PartyApiClient(loadServerSettings())
    const result = await api.getRoot('setup/state')
    // A real response (even a 401) means the server said "not paired":
    // show the re-pair flow. No response at all (network error, timeout,
    // blocked before reaching the server) is a different problem that
    // re-pairing can't fix, so it gets its own message.
    if (result.kind === 'success') setStatus('paired')
    else setStatus(result.status !== undefined ? 'unpaired' : 'unreachable')
  }

  useEffect(() => {
    void checkPaired()
  }, [])

  function stopScan() {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current)
      scanTimerRef.current = null
    }
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setScanning(false)
  }

  useEffect(() => stopScan, [])

  async function submitToken(raw: string) {
    const token = extractToken(raw)
    if (!token) {
      setError('Enter or scan a pairing link first')
      return
    }
    setSubmitting(true)
    setError('')
    const api = new PartyApiClient(loadServerSettings())
    const result = await api.postRoot('setup/pair', { token })
    setSubmitting(false)
    if (result.kind === 'failure') {
      setError(
        result.status !== undefined
          ? result.message
          : "Couldn't reach the server to pair - check your connection and try again",
      )
      return
    }
    stopScan()
    await checkPaired()
  }

  async function startScan() {
    setError('')
    // BarcodeDetector exists on Chrome/Android but not Safari/iOS, so the
    // manual-paste field below is always available as a fallback.
    const Detector = (window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> } }).BarcodeDetector
    if (!Detector) {
      setScanUnsupported(true)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      const detector = new Detector({ formats: ['qr_code'] })
      setScanning(true)
      let detecting = false
      let submitted = false
      scanTimerRef.current = window.setInterval(() => {
        // Guards against overlapping detect() calls (a frame slower than the
        // 350ms tick) each finding a code and firing the pairing request
        // more than once for the same scan.
        if (!videoRef.current || detecting) return
        detecting = true
        detector
          .detect(videoRef.current)
          .then((codes) => {
            const value = codes[0]?.rawValue
            if (value && !submitted) {
              submitted = true
              stopScan()
              void submitToken(value)
            }
          })
          .catch(() => {
            // Transient decode misses are normal mid-scan - keep polling.
          })
          .finally(() => {
            detecting = false
          })
      }, 350)
    } catch {
      setError('Camera access was denied - paste the invite link below instead')
      setScanUnsupported(true)
    }
  }

  if (status === 'checking') {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Connecting…</div>
  }
  if (status === 'paired') {
    return <>{children}</>
  }
  if (status === 'unreachable') {
    return (
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-semibold">Can't reach the server</h1>
        <p className="text-sm text-muted-foreground">
          This device is still paired - the app just couldn't get a response from the server on this network. Check your connection (some
          networks block this kind of traffic) and try again.
        </p>
        <Button className="w-full" onClick={() => void checkPaired()}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Pair this device</h1>
      <p className="text-sm text-muted-foreground">
        On your computer, open the party-console dashboard's Setup page, then under "Connection settings" click "Pair another
        browser". Scan the code it shows, or paste the link it gives you below.
      </p>
      {!scanning && (
        <Button className="w-full" onClick={() => void startScan()}>Scan QR code</Button>
      )}
      {scanning && (
        <div className="space-y-2">
          <video ref={videoRef} className="w-full rounded-md" muted playsInline />
          <Button variant="outline" className="w-full" onClick={stopScan}>
            Cancel scan
          </Button>
        </div>
      )}
      {scanUnsupported && !scanning && (
        <p className="text-xs text-muted-foreground">Camera scanning isn't available in this browser - paste the link below instead.</p>
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="pairing-link">
          Or paste the invite link
        </label>
        <Input
          id="pairing-link"
          placeholder="http://.../setup#..."
          value={manualInput}
          onChange={(event) => setManualInput(event.target.value)}
        />
        <Button className="w-full" disabled={submitting || !manualInput.trim()} onClick={() => void submitToken(manualInput)}>
          {submitting ? 'Pairing…' : 'Pair this device'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
