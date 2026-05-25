# @domstack/sync

A modern, minimal live-reload dev server. A love letter to browser-sync, rewritten from scratch: ESM-only, Fastify, native WebSocket, Preact UI panel.

## Install

```sh
npm install @domstack/sync
```

## CLI

```sh
# Serve current directory, watch CSS and HTML
domstack-sync --server . --files '**/*.css' '**/*.html'

# Watch files without serving (snippet-injection mode)
domstack-sync --files '**/*.css'

# Short alias
dss --server . --files '**/*'

# Disable the UI panel
domstack-sync --server . --no-ui

# Write a starter config file
domstack-sync init

# Trigger a reload from another terminal
domstack-sync reload --port 3000
```

### CLI flags

| Flag | Default | Description |
|---|---|---|
| `--server`, `-s` | — | Directory to serve |
| `--files`, `-f` | — | Glob patterns to watch (repeatable) |
| `--port` | `3000` | Port to listen on |
| `--no-ui` | — | Disable the UI panel |
| `--no-notify` | — | Disable the notification overlay |
| `--no-ghost-mode` | — | Disable scroll/click/form sync |
| `--cors` | — | Enable CORS headers |
| `--log-level` | `info` | `silent` \| `info` \| `debug` |
| `--help`, `-h` | — | Show help text |
| `--version`, `-v` | — | Show version |

## API

```js
import { createServer, parseOptions } from '@domstack/sync'

const bs = await createServer({
  server: './public',
  files: ['public/**/*.css', 'public/**/*.html'],
  port: 3000,
})

console.log(bs.url)    // http://localhost:3000
console.log(bs.uiUrl)  // http://localhost:3001

// Trigger a full reload
bs.reload()

// CSS-inject a specific file (falls back to full reload if not matched)
bs.reload(['styles/main.css'])

// Show a notification overlay in connected browsers
bs.notify('Build complete')

// Stream integration — pipe any { path } objects through to trigger reloads
someReadableStream.pipe(bs.stream())

// Listen for server-side events
bs.events.on('client:connect', (info) => console.log('connected', info.ua))
bs.events.on('client:disconnect', (id) => console.log('disconnected', id))
bs.events.on('file:change', (evt) => console.log('changed', evt.path))

// Pause / resume watcher-triggered reloads (e.g. during a build)
bs.pause()
bs.resume()

// Graceful shutdown
await bs.exit()
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `port` | `number` | `3000` | Port to listen on (falls back to OS-assigned if taken) |
| `server` | `string \| false` | `false` | Directory to serve statically |
| `files` | `string[]` | `[]` | Glob patterns to watch for changes |
| `ghostMode` | `{ scroll, clicks, forms }` | all `true` | Sync interactions across connected browsers |
| `logLevel` | `'silent' \| 'info' \| 'debug'` | `'info'` | Log verbosity |
| `ui` | `boolean \| { port: number }` | `true` | UI panel — `false` disables, `{ port }` pins the port |
| `notify` | `boolean` | `true` | Show notification overlay in connected browsers |
| `cors` | `boolean` | `false` | Add CORS headers to all responses |
| `injectChanges` | `boolean` | `true` | CSS-inject `.css` changes instead of full reload |
| `reloadDebounce` | `number` | `500` | Milliseconds to debounce file-change reloads |
| `reloadDelay` | `number` | `0` | Milliseconds to delay reload after a change |
| `watchOptions` | `object` | `{}` | Options passed through to chokidar |
| `cwd` | `string` | `process.cwd()` | Working directory for resolving `server` and `files` |

## TypeScript

All types are exported:

```ts
import type { BsInstance, BsOptions, BsOptionsInput } from '@domstack/sync'
import type { ServerToClientMessage, ClientToServerMessage } from '@domstack/sync'
```

## How it works

- **Script injection** — an IIFE `<script>` tag is injected before `</body>` (or appended if there is no `</body>`) in every HTML response. The injected script connects to the WebSocket server.
- **CSS injection** — when a watched `.css` file changes and `injectChanges: true`, the matching `<link rel="stylesheet">` has its `href` cache-busted in place without a full page reload. Falls back to a full reload if no matching stylesheet is found.
- **Ghost mode** — scroll position, clicks, and form input changes in one browser are relayed to all other connected browsers via the WebSocket server. Disable with `ghostMode: false` or `--no-ghost-mode`.
- **UI panel** — a separate Fastify server on an auto-detected port shows connected browsers, file-change history, and server URLs. Disable with `ui: false` or `--no-ui`.
- **Port selection** — the requested port is tried first. If it is already in use, the OS assigns a free ephemeral port automatically.

## License

MIT
