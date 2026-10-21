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
npm run typecheck
npm run build
node --experimental-strip-types --test tests/telegram-markdown.test.ts tests/index.test.ts tests/notifications.test.ts tests/notifications-runtime.test.ts
```

`dist/` is committed and is the entry point declared by this package. Reuse installed dependencies; run `npm ci` only when dependencies are missing or need reconciliation with the lockfile. Run the notification tests with native Windows Node on the mini host so drive-letter, UNC, Unicode, relative-path rejection, and mocked direct-notification delivery are exercised. Tests use fixtures, not the paired bot.

## Load and restart

Pi local packages load from their resolved path without copying to the npm package store. Before configuring another host, inspect `pi list`; with its bridge stopped, use `pi remove <configured-source>` followed by `pi install <absolute-checkout-path>` to replace only its configured Pitgram source. Do not load npm and local copies together or copy credentials into the repository.

The Windows host's configured source, pending acceptance, and authoritative maintenance procedure are maintained in `D:\Pi\background\README.md`. Follow its authorization, independent executor, recovery, and validation requirements for Telegram-initiated maintenance; do not stop or restart the serving process directly from its own agent turn. On Debian, use that host's service manager and retain its working directory and session settings.

A new compiled build requires a full Pi process restart; `/reload` can retain cached native modules. Rebuilding or pushing Git commits does not update the running bridge.

After restart, check `/pitgram-status` and verify a normal Telegram request/reply. For notification changes, obtain permission for a one-off test notification and verify its delivery to the paired chat through the existing bridge. Markdown changes also require a formatted reply and one longer than 4096 characters; the first preview should be edited and later chunks should continue in order.

## Sync the VPS from the fork

Once the local-path package is configured on Debian, update the fixed checkout and rebuild there:

```sh
cd "$HOME/src/pitgram"
git fetch origin
git pull --ff-only origin main
```

Follow **Build and validate** and the host restart procedure above. Do not run a second Pi/Pitgram poller for the same bot while the Windows host is still connected; coordinate a disconnect/reconnect window so only one process calls Telegram `getUpdates`.

## Upstream maintenance

Review upstream changes before incorporating them; do not fast-forward over the fork's local commits:

```sh
git fetch upstream
git log --oneline --left-right main...upstream/main
```

Merge or cherry-pick reviewed changes, run the targeted tests, and push the resulting commits to `origin`.
