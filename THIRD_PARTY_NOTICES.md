# Third-party notices

Party Console Companion's own code is distributed under the [MIT License](LICENSE).
It builds on the following work.

## Adventureland Party Console

Party Console Companion is a companion to
[Adventureland Party Console](https://github.com/Ryan-Haines/adventureland-party-console)
by Ryan Haines and contributors. It needs a running party-console to work: the
Android app and the PWA are clients of party-console's API and do nothing on
their own.

Parts of both apps are adapted from party-console's dashboard
(`dashboard/features/party/` and related runtime code) so they behave the same
way: the live-update protocol, item and upgrade formulas, automatic-rule keys,
log filters, labels and similar client-side logic. Those portions are used under
party-console's MIT License:

```
MIT License

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
SOFTWARE.
```

## Game log filter categories

The log filter categories follow Crowns3bc's
[Game Log Filter](https://github.com/Crowns3bc/AdventureLand/blob/main/Gui/Game%20Log%20Filter.js),
as party-console's do.

## Adventure Land

[Adventure Land](https://adventure.land) is a game by Kaan Soral. This project is
not affiliated with or endorsed by Adventure Land. Game names, item and monster
art and game data shown in the apps are loaded at runtime from the game and your
party-console; they are not part of this repository.

## Dependencies

Libraries used by the apps (npm and Gradle dependencies) keep their own licenses,
listed in `web/package-lock.json` and `app/build.gradle.kts`.
