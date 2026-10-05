<img src="https://raw.githubusercontent.com/Icelocked/adventure-land-mobile-party-console/{{TAG}}/web/public/icons/icon-192.png" width="96" height="96" align="right" alt="Party Console Companion icon">

**Requires [Adventureland Party Console](https://github.com/Ryan-Haines/adventureland-party-console)** by Ryan Haines and contributors. These apps are companions to it: set up party-console first, then connect from your phone.

## Which one do I want?

**Android phone:** download the `.apk` below and open it on your phone. After that, the app checks for updates itself (Settings → App updates), or you can follow releases with [Obtainium](https://github.com/ImranR98/Obtainium).

**Any phone (Android or iPhone), as a PWA:** install it on the PC that runs party-console, the same way you run party-console:

| party-console runs as | Download | Then |
|---|---|---|
| Windows ZIP | `party-console-companion-pwa-windows-{{TAG}}.zip` | Extract, double-click `Start.cmd` |
| Linux terminal | `party-console-companion-pwa-linux-{{TAG}}.tar.gz` | Extract, run `./party-console-pwa/start.sh` |
| Docker on Windows | `party-console-companion-pwa-docker-{{TAG}}.zip` | Extract, double-click `Install PWA.cmd` |
| Docker on Linux / Pi | | `curl -fsSL https://github.com/Icelocked/adventure-land-mobile-party-console/releases/latest/download/install-pwa-docker.sh \| bash` |

Then open it on your phone and add it to your home screen. Once installed, it updates itself from Settings. Step-by-step, including reaching it from your phone with Tailscale: [PWA install guide](https://github.com/Icelocked/adventure-land-mobile-party-console/blob/main/DEPLOYMENT.md#4-pwa-self-hosted-next-to-party-console).

Credits and licenses: [THIRD_PARTY_NOTICES.md](https://github.com/Icelocked/adventure-land-mobile-party-console/blob/{{TAG}}/THIRD_PARTY_NOTICES.md).

New to this? Start with the [README](https://github.com/Icelocked/adventure-land-mobile-party-console#install), which covers getting your phone to your PC with Tailscale.
