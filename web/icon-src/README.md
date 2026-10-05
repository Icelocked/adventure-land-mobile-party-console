# App icons

`icon.py` draws the icon (a warrior, mage and ranger on a night hill) and
writes the SVGs in this folder; `render.cjs` turns them into every PNG both
apps use:

```
python icon.py        # regenerate the SVGs (run from this folder)
node render.cjs       # PWA icons, apple-touch-icon, push badge, Android mipmaps
```

- `rounded.svg`: PWA icons and favicon. `maskable.svg`: the PWA maskable icon.
  `apple.svg`: iOS home screen (no transparency).
- `android-bg.svg`, `android-fg.svg`, `android-mono.svg`: the adaptive icon's
  layers; `android-fg-dev.svg` is the debug build's foreground with a DEV tag.
- `badge-white.svg`: the white silhouette for notification badges and the
  Android notification icon.
