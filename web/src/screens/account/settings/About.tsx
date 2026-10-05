import { useState } from 'react'

const PARTY_CONSOLE = 'https://github.com/Ryan-Haines/adventureland-party-console'

/** party-console's MIT notice: parts of this app are adapted from its
 *  dashboard, so the notice ships with the app (see THIRD_PARTY_NOTICES.md). */
export const PARTY_CONSOLE_LICENSE = `MIT License

Copyright (c) 2026 Adventure Land Party Console contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

export function About() {
  const [showLicense, setShowLicense] = useState(false)
  return (
    <section aria-label="About" className="space-y-2 rounded-md border border-border bg-card p-4 text-sm">
      <h3 className="font-semibold">About</h3>
      <p>
        Party Console Companion is a phone companion for{' '}
        <a href={PARTY_CONSOLE} target="_blank" rel="noreferrer" className="underline">
          Adventureland Party Console
        </a>{' '}
        by Ryan Haines and contributors. It needs a running party-console: this app connects to it and does nothing on its own.
      </p>
      <p className="text-xs text-muted-foreground">
        Parts of this app are adapted from party-console's dashboard under its MIT License. Game log filter categories follow Crowns3bc's Game Log Filter. Not
        affiliated with or endorsed by Adventure Land; game art and data are loaded from the game.
      </p>
      <button type="button" className="text-xs underline" aria-expanded={showLicense} onClick={() => setShowLicense((value) => !value)}>
        {showLicense ? 'Hide party-console license' : 'Show party-console license'}
      </button>
      {showLicense && <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-border p-2 font-mono text-[10px] text-muted-foreground">{PARTY_CONSOLE_LICENSE}</pre>}
    </section>
  )
}
