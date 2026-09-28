import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PartyApiClient } from '@/api/partyApi'
import { loadServerSettings } from '@/config/serverConfig'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Gates the whole app behind party-console's own browser-pairing check
 *  (GET /setup/state - 200 once paired, 401 otherwise; confirmed against
 *  a live server) before anything tries to open the live party-data
 *  connection. Without this, an unpaired browser's fetches to /party-api/*
 *  just keep 302-redirecting to /setup forever, and every screen that
 *  depends on live data sits on an unexplained "connecting" spinner with
 *  no indication that pairing - not the network - is what's blocking it. */

type Status = 'checking' | 'paired' | 'unpaired'

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
    setStatus(result.kind === 'success' ? 'paired' : 'unpaired')
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
      setError("That pairing link didn't work - generate a new one from an already-paired browser and try again")
      return
    }
    stopScan()
    await checkPaired()
  }

  async function startScan() {
    setError('')
    // BarcodeDetector: supported on Chrome/Android (this project's proven
    // path per DEPLOYMENT.md); not on Safari/iOS, so this always falls
    // back to the manual-paste field below rather than being the only way in.
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
      scanTimerRef.current = window.setInterval(() => {
        if (!videoRef.current) return
        detector
          .detect(videoRef.current)
          .then((codes) => {
            const value = codes[0]?.rawValue
            if (value) {
              stopScan()
              void submitToken(value)
            }
          })
          .catch(() => {
            // Transient decode misses are normal mid-scan - keep polling.
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
