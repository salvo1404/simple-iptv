# simple-iptv

A calm, minimal IPTV app for Samsung (Tizen) TVs. Supports Xtream Codes playlists (server + username + password).

## Test in the browser

```sh
npm run dev
# open http://127.0.0.1:8080
```

The dev server proxies requests to your IPTV provider, so CORS isn't a problem in the browser.
Use the arrow keys, Enter, and Esc/Backspace (acts as Back) to move around the way a TV remote would. The mouse works too.

## Layout

- `app/`: the TV app itself (plain ES2017 JS, no build step, runs on older Tizen Chromium)
  - `js/api.js`: Xtream Codes API client
  - `js/nav.js`: remote-control spatial navigation
  - `js/player.js`: playback (native HLS on TV, hls.js on desktop)
  - `js/app.js`: screens and behaviour
  - `config.xml`: Tizen widget manifest
- `server.js`: dev server + CORS/HLS proxy (browser testing only)

## Run on the TV

The TV must be in Developer Mode. The script reuses the Tizen SDK, certificate profile and TV address from `../CleanFrame/.local`. Override them in `.local/tv.env` (git-ignored) with `SDK=`, `PROFILE=` or `TV_HOST=`.

```sh
npm run tv            # package + sign + install + launch
npm run tv:launch     # just relaunch
```

If `app/config.local.js` exists, it is bundled so the TV signs in automatically. Don't share that `.wgt`.
