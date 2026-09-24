# Connecting your phone to party-console via Tailscale

The setup this project has actually been built and used against: party-
console running on your own gaming PC, reached from your phone anywhere
via [Tailscale](https://tailscale.com). This is the one path documented
here because it's the one that's actually been run, end to end, not just
read about.

This guide does **not** cover installing party-console itself - that's
[Ryan-Haines/adventureland-party-console](https://github.com/Ryan-Haines/adventureland-party-console)'s
own job to document, and duplicating it here risks drifting out of sync
with it. Install and set up party-console on your PC first, following
its own README, until its web dashboard works normally in a browser on
that same PC. Then come back here for the "reach it from my phone" part.

## 1. Install Tailscale on both devices

- On your PC: [download Tailscale](https://tailscale.com/download) and
  sign in (a free personal account is enough).
- On your phone: install the Tailscale app from the Play Store and sign
  into the **same** account.

Both devices now show up in your [Tailscale admin
console](https://login.tailscale.com/admin/machines) and can reach each
other directly, wherever they actually are - your phone doesn't need to
be on the same WiFi as your PC anymore.

## 2. Find your PC's Tailscale address

Run `tailscale ip` on your PC (or open the Tailscale app and look at "This
device") - it's an address starting with `100.`. That's what your phone
will use instead of your PC's normal LAN address.

## 3. Enter it in the mobile app

On the app's connection screen, enter:

```
<your-pc's-tailscale-ip>:3010
```

(`3010` is party-console's default port - check what port your own setup
actually uses if you changed it). Choose the **Plain HTTP (Cleartext)**
trust mode - Tailscale's own tunnel is already encrypted, so there's no
need for a second layer of TLS on top of it.

## Why not a domain or a public IP?

Those are real options in general (any self-hosted app can be put behind
a domain+reverse-proxy, or exposed on a raw port), and the mobile app's
connection screen supports them (see the README's "Connection security
model"). They're just not documented step-by-step here, because doing so
correctly - the right reverse-proxy config, the right firewall rules, an
actual authentication layer in front of an API that has none of its own -
is real, easy-to-get-subtly-wrong work that hasn't actually been done and
verified for this project. Tailscale sidesteps all of it: nothing is ever
publicly reachable, so there's no exposure to get wrong.

If you set one of those paths up yourself and want to contribute a
verified, tested guide for it, a PR is welcome.
