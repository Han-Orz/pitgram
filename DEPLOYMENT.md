# Fork development and deployment

The fork is the source of truth. Keep the Git checkout on a deliberate development path, separate from Pi's user data and its installed package directory.

## Canonical checkouts

- Windows mini host: `D:\Pi\workspace\pitgram`
- Debian VPS: choose one fixed path, for example `~/src/pitgram`

Both checkouts use the same remotes:

```text
origin   https://github.com/Han-Orz/pitgram.git
upstream https://github.com/raghavbali/pitgram.git
```

Do not copy `.pi/agent`, `telegram.json`, queue files, session data, logs, or other runtime state into either checkout.

## Build and validate

From the checkout on either OS:

```sh
git status --short --branch
npm ci
npm run typecheck
npm run build
node --experimental-strip-types --test tests/telegram-markdown.test.ts tests/index.test.ts
```

`dist/` is committed and is the entry point declared by this package. `npm ci` installs declared dependencies (including the Markdown parser) in the checkout; it does not need Pi's private data.

## Load this checkout in Pi

Pi local packages load from their resolved path instead of being copied to the npm package store. First inspect configured packages with `pi list`. Stop the Pi service locally before changing its package declaration so an active process never loses files it may still load. If the old `npm:pitgram` package is configured, remove that package declaration before adding the local checkout so one bot is not polled by two Pitgram instances:

Windows PowerShell:

```powershell
pi remove npm:pitgram
pi install 'D:\Pi\workspace\pitgram'
```

Debian:

```sh
pi remove npm:pitgram
pi install "$HOME/src/pitgram"
```

Only remove the old declaration if `pi list` shows that exact source; if the configured source differs, remove that Pitgram source instead. These commands change Pi's package declaration in its normal user settings, not the source checkout. Afterward, start the existing Pi service locally. Do not edit or copy credentials into the repository.

The Windows `PiPitgramAgent` task currently starts Pi RPC with `--continue` and no explicit extension argument; Pitgram is discovered from the configured Pi package. The active 1.6.0 files were found under `%USERPROFILE%\.pi\agent\npm\node_modules\pitgram`. Switching that host to the D: checkout therefore requires the package declaration change above and a full Pi process restart. Do not restart the Telegram-serving instance from Telegram; perform maintenance locally using `D:\Pi\background\control.ps1` after confirming its status. On Debian, update the service/process that runs Pi locally; retain its existing working directory and session settings.

After restart, check `/pitgram-status`, then send a normal test turn containing a heading, list, link, bold text, inline code and fenced code block. Check a reply longer than 4096 characters separately; the first preview message should be edited and later chunks should continue in order.

## Sync the VPS from the fork

Once the local-path package is configured on Debian, update the fixed checkout and rebuild there:

```sh
cd "$HOME/src/pitgram"
git fetch origin
git pull --ff-only origin main
npm ci
npm run typecheck
npm run build
```

Then restart that VPS's Pi service locally and verify `/pitgram-status`. Do not run a second Pi/Pitgram poller for the same bot while the Windows host is still connected; coordinate a disconnect/reconnect window so only one process calls Telegram `getUpdates`.

## Upstream maintenance

Review upstream changes before incorporating them; do not fast-forward over the fork's local commits:

```sh
git fetch upstream
git log --oneline --left-right main...upstream/main
```

Merge or cherry-pick reviewed changes, run the targeted tests, and push the resulting commits to `origin`.
