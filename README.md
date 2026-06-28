# @domstack/sync

[![latest version](https://img.shields.io/npm/v/@domstack/sync.svg)](https://www.npmjs.com/package/@domstack/sync)
[![Actions Status](https://github.com/bcomnes/domstack-sync/workflows/tests/badge.svg)](https://github.com/bcomnes/domstack-sync/actions)
[![downloads](https://img.shields.io/npm/dm/@domstack/sync.svg)](https://npmtrends.com/@domstack/sync)
[![neostandard javascript style](https://img.shields.io/badge/code_style-neostandard-7fffff?style=flat&labelColor=ff80ff)](https://github.com/neostandard/neostandard)
[![Socket Badge](https://socket.dev/api/badge/npm/package/@domstack/sync)](https://socket.dev/npm/package/@domstack/sync)

A modern, dependency-minimized live-reload dev server. A love letter to browser-sync: ESM-only, Fastify, native WebSocket, and a server-rendered HTMX UI panel.

## Install

```sh
npm install @domstack/sync
```

## CLI

```sh
# Serve current directory, watch CSS and HTML
domstack-sync --server . --files '**/*.css' '**/*.html'

# Serve current directory and watch the served root
domstack-sync --server . --watch

# Watch files without serving (snippet-injection mode)
domstack-sync --files '**/*.css'

# Short alias
dss --server . --files '**/*'

# Disable the UI panel
domstack-sync --server . --no-ui

# Write a starter ESM config file
domstack-sync init

# Trigger a reload from another terminal
domstack-sync reload --port 3000
```

### CLI flags

| Flag | Default | Description |
|---|---|---|
| `--server`, `-s` | — | Directory to serve |
| `--files`, `-f` | — | Glob patterns to watch (repeatable) |
| `--watch`, `-w` | — | Watch server roots in addition to `--files` |
| `--ignore` | — | Ignore patterns for file watchers (repeatable) |
| `--port` | `3000` | Port to listen on |
| `--no-ui` | — | Disable the UI panel |
| `--no-notify` | — | Disable the notification overlay |
| `--no-ghost-mode` | — | Disable scroll/click/location/form sync |
| `--cors` | — | Enable CORS headers |
| `--log-level` | `info` | Pino log level, for example `silent`, `trace`, `debug`, `info`, `warn`, `error`, or `fatal` |
| `--log-connections` | — | Log browser connection events at info level |
| `--help`, `-h` | — | Show help text |
| `--version`, `-v` | — | Show version |

`domstack-sync init` writes `domstack-sync.config.mjs` using `export default`. On startup, the CLI loads the first config file it finds in this order: `domstack-sync.config.mjs`, `.mts`, `.js`, then `.ts`. TypeScript config files rely on Node's built-in type stripping.

## API

```js
import { createServer, parseOptions } from '@domstack/sync'

const sync = await createServer({
  server: './public',
  files: ['public/**/*.css', 'public/**/*.html'],
  port: 3000,
})

console.log(sync.url)    // http://localhost:3000
console.log(sync.uiUrl)  // http://localhost:3001

// Trigger a full reload
sync.reload()

// CSS-inject a specific file (falls back to full reload if not matched)
sync.reload(['styles/main.css'])

// Show a notification overlay in connected browsers
sync.notify('Build complete')

// Stream integration — pipe any { path } objects through to trigger reloads
someReadableStream.pipe(sync.stream())

// Listen for server-side events
sync.events.on('client:connect', (info) => console.log('connected', info.ua))
sync.events.on('client:disconnect', (id) => console.log('disconnected', id))
sync.events.on('file:change', (evt) => console.log('changed', evt.path))

// Pause / resume watcher-triggered reloads (e.g. during a build)
sync.pause()
sync.resume()

// Graceful shutdown
await sync.exit()
```

### Logging

Standalone usage creates a pretty Pino logger automatically. When embedding `@domstack/sync` in another tool, pass a raw Pino logger and keep formatting ownership in the parent process:

```js
import pino from 'pino'
import { createLogger, createServer, logAccessUrls } from '@domstack/sync'

// Standalone helper: returns a regular pino.Logger with domstack-sync's pretty formatter.
const standaloneLogger = createLogger('info')

// Embedded/library usage: pass your own raw pino.Logger.
const ownerLogger = pino({ level: 'info' })
const sync = await createServer({
  server: './public',
  files: ['public/**/*.css', 'public/**/*.html'],
  logger: ownerLogger.child({ component: 'sync', logPrefix: '[domstack-sync]' }),
})

logAccessUrls(standaloneLogger, {
  local: sync.url,
  ui: sync.uiUrl,
})
```

`logAccessUrls(logger, urls)` is exported for callers that want the same access-URL table with their own Pino logger.

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `port` | `number` | `3000` | Port to listen on (falls back to OS-assigned if taken) |
| `server` | `string \| boolean \| string[] \| object` | `false` | Directory or directories to serve statically |
| `files` | `string \| string[] \| object[]` | `[]` | Glob patterns or chokidar watch objects to watch for changes |
| `ghostMode` | `boolean \| { scroll, clicks, location, forms }` | all `true` | Sync interactions across connected browsers |
| `logger` | `pino.Logger` | — | Raw Pino logger supplied by an embedding owner; when omitted, sync creates its own standalone pretty logger |
| `logLevel` | Pino log level string | `'info'` | Log verbosity used by the standalone logger when `logger` is omitted |
| `logConnections` | `boolean` | `false` | Log browser connection events at info level |
| `ui` | `boolean \| { port: number }` | `true` | UI panel — `false` disables, `{ port }` pins the port |
| `notify` | `boolean` | `true` | Show notification overlay in connected browsers |
| `cors` | `boolean` | `false` | Add CORS headers to all responses |
| `injectChanges` | `boolean` | `true` | Inject matching file changes instead of full reload |
| `injectFileTypes` | `string[]` | `['css', 'png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'map']` | Extensions eligible for file injection |
| `tagNames` | `Record<string, string>` | built-in asset tag map | Element tag names used for non-CSS file injection |
| `codeSync` | `boolean` | `true` | Broadcast reload and file-injection messages |
| `reloadDebounce` | `number` | `500` | Milliseconds to debounce file-change reloads |
| `reloadDelay` | `number` | `0` | Milliseconds to delay reload after a change |
| `reloadThrottle` | `number` | `0` | Minimum milliseconds between reload broadcasts |
| `scrollThrottle` | `number` | `0` | Minimum milliseconds between scroll sync messages |
| `scrollElements` | `string[]` | `[]` | CSS selectors eligible for element scroll sync |
| `scrollElementMapping` | `string[]` | `[]` | Selector mapping for scroll sync between different layouts |
| `scrollProportionally` | `boolean` | `true` | Sync scroll position proportionally instead of raw pixels |
| `watch` | `boolean` | `false` | Add server roots and routes to watched files |
| `ignore` | `string \| string[]` | — | Ignore patterns merged into watcher options |
| `watchOptions` | `object` | `{}` | Options passed through to chokidar |
| `watchEvents` | `string[]` | `['change']` | Chokidar event names that trigger reloads |
| `snippet` | `boolean` | `true` | Inject the browser client snippet into HTML responses |
| `snippetOptions` | `object` | `{}` | Whitelist, blacklist, ignore paths, or custom injection rule |
| `rewriteRules` | `object[]` | `[]` | HTML rewrite rules applied before snippet injection |
| `plugins` | `array` | `[]` | BrowserSync-compatible plugin entries |
| `cwd` | `string` | `process.cwd()` | Working directory for resolving `server` and `files` |

## TypeScript

All types are exported:

```ts
import type { AccessUrls, BsInstance, BsOptions, BsOptionsInput, LoggerOptions, LoggerStreams } from '@domstack/sync'
import type { ServerToClientMessage, ClientToServerMessage } from '@domstack/sync'
```

## How it works

- **Script injection** — an IIFE `<script>` tag is injected immediately after the opening `<body>` tag (or appended if there is no `<body>`) in every HTML response. The injected script connects to the WebSocket server.
- **File injection** — when a watched injectable file changes and `injectChanges: true`, matching DOM assets are cache-busted in place without a full page reload. CSS stylesheets, imported stylesheets, images, inline image URLs, and configured asset tags are supported. Falls back to a full reload if no matching asset is found.
- **Ghost mode** — scroll position, clicks, location changes, and form input changes in one browser are relayed to all other connected browsers via the WebSocket server. Disable with `ghostMode: false` or `--no-ghost-mode`.
- **UI panel** — a separate Fastify server on an auto-detected port shows connected browsers, file-change history, and server URLs. Disable with `ui: false` or `--no-ui`.
- **Port selection** — the requested port is tried first. If it is already in use, the OS assigns a free ephemeral port automatically.

## License

MIT
