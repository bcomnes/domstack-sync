# Browser-Sync Modernization Plan

**Package name:** `@domstack/sync`
**Binary name:** `domstack-sync` (or `dss` for short)

A fork that eliminates legacy dependencies, reduces complexity, and adopts modern Node.js patterns. No monorepo — single package, flat structure following `/Users/bret/Developer/ts-template` conventions.

---

## Guiding Principles

- ESM-only, Node 20+
- Type-stripped TypeScript (`erasableSyntaxOnly`, no separate transpile step)
- Native Node.js APIs over npm deps wherever practical
- Fastify ecosystem replaces the Connect/Express ecosystem
- No reactive libraries (RxJS out, native EventEmitter/async iteration)
- No immutable-js (plain objects + TypeScript types enforce shape)
- Single package — UI and client become internal build artifacts, not published sub-packages
- `node:test` replaces Mocha/Chai/Sinon
- `releasearoni` replaces generate-changelog
- No plugin system — all included features are built-in directly
- No vinyl, no gulp, no build-tool interop beyond a plain `Transform` stream
- No browser auto-opening under any circumstances
- JSON Schema + `json-schema-to-ts` for options validation (not Zod)
- `argsclopts` wraps `node:util.parseArgs` for help text

---

## Development Approach: Legacy Reference Directory

Rather than starting a fresh repo, the existing browser-sync monorepo is the working repo. All existing code is moved into a `legacy/` directory at the repo root. New code is written fresh starting from the repo root following ts-template conventions. The `legacy/` directory is kept as a reference while porting — once a feature is fully ported and tested, the corresponding legacy code can be deleted. When the port is complete, `legacy/` is removed entirely.

```
browser-sync/               # This repo (forked)
├── legacy/                 # Original monorepo code — reference only, not built
│   ├── packages/
│   │   ├── browser-sync/
│   │   ├── browser-sync-client/
│   │   └── browser-sync-ui/
│   └── lerna.json
│
├── index.ts                # New public API surface
├── index.test.ts
├── lib/                    # New implementation
│   └── ...
├── plans/                  # This directory
├── declaration.tsconfig.json
├── tsconfig.json
├── eslint.config.js
└── package.json            # New root package.json (replaces monorepo root)
```

The legacy `packages/` and their `node_modules` are excluded from the new TypeScript compilation and linting via tsconfig `exclude` and `.eslintignore`.

---

## New Package Structure

```
lib/
├── server.ts            # Fastify instance factory
├── server.test.ts       # Integration tests for createServer()
├── watcher.ts           # Chokidar wrapper (file watching)
├── watcher.test.ts
├── sockets.ts           # WebSocket server (ws)
├── sockets.test.ts
├── injector.ts          # Script injection (Fastify onSend hook; buffers streams)
├── snippet.ts           # Snippet / script tag generation
├── cli.ts               # CLI entry (argsclopts + node:util.parseArgs)
├── cli.test.ts
├── options.ts           # Options schema (JSON Schema + json-schema-to-ts)
├── logger.ts            # Pino wrapper
├── ports.ts             # Port detection (vendored portscanner logic)
├── ports.test.ts
├── ip.ts                # Local IP detection (vendored dev-ip logic)
├── ip.test.ts
├── strip-ansi.ts        # Vendored strip-ansi (~5 lines)
├── fresh.ts             # Vendored HTTP freshness check (~20 lines)
├── protocol.ts          # Shared WS message types (server + client)
├── client/              # Browser client (replaces browser-sync-client package)
│   ├── tsconfig.json    # Browser target (ES2020, DOM lib)
│   ├── index.ts         # Client entry — bundled by esbuild
│   ├── handlers.ts      # DOM effects: reload, css inject, notify, scroll, input
│   ├── dist/
│   │   └── browser-sync-client.js  # esbuild output (checked in)
│   └── vendor/
│       └── logger.ts    # Vendored nanologger (~15 lines)
└── ui/                  # Control panel (replaces browser-sync-ui package)
    ├── server.ts         # Fastify server for the UI panel
    ├── types.ts          # Shared UiState, UiServerMessage, FileChange types
    ├── tsconfig.json     # Browser target for Preact app
    ├── app/
    │   ├── index.ts      # Preact app root, pathname-based component mount
    │   ├── ws.ts         # Native WebSocket connection to UI server, message dispatch
    │   ├── components/
    │   │   ├── Nav.ts             # Shared navigation bar
    │   │   ├── Overview.ts        # Server URLs, mode info
    │   │   ├── SyncOptions.ts     # Ghost mode toggles (read-only display)
    │   │   ├── History.ts         # Visited URL history
    │   │   ├── Connections.ts     # Connected browser list
    │   │   ├── NetworkThrottle.ts # Speed/latency placeholder
    │   │   └── Help.ts            # Help page
    │   └── styles/
    │       ├── index.css   # @import aggregator
    │       ├── base.css    # CSS custom properties, dark theme, reset
    │       └── layout.css  # All component layout styles
    └── public/           # Built UI assets (checked in, served by ui/server.ts)
        ├── .gitkeep
        ├── app.js        # esbuild output (built via npm run build:ui-js)
        └── app.css       # esbuild output (built via npm run build:ui-css)
```

---

## Dependency Replacement Map

### Removed entirely

| Old | Reason |
|---|---|
| `connect` | Replaced by Fastify |
| `serve-static` | `@fastify/static` |
| `serve-index` | `@fastify/static` directory listing |
| `server-destroy` | Not needed — Fastify `.close()` drains connections cleanly |
| `socket.io` + `socket.io-client` | Replaced by `ws` server + native browser `WebSocket` API |
| `rx` (RxJS v4 in server) | Not needed — file events use `EventEmitter` + `chokidar` callbacks |
| `rxjs` (RxJS v5 in client) | Not needed — client rewritten as plain event-driven JS |
| `webpack` + `webpack-cli` | esbuild replaces entire webpack pipeline for client bundle |
| `babel` + all babel plugins | esbuild strips TS natively; no transpilation to legacy targets |
| `ts-loader` | esbuild |
| `core-js` | Drop — no polyfills; target ES2020 browsers |
| `element-scroll-polyfill` | Drop — `scrollTo()` is baseline in all current browsers |
| `nanologger` | Vendor ~15 lines in `lib/client/vendor/logger.ts` |
| `immutable` | Plain TS types + `Object.freeze` where necessary |
| `eazy-logger` | Pino |
| `chalk` | `node:util.styleText` / Pino's built-in coloring via pino-pretty |
| `strip-ansi` | Vendor 2-line implementation in `lib/strip-ansi.ts` |
| `opn` | Dropped entirely — no browser auto-opening; print URLs for cmd-click |
| `portscanner` | Vendor ~20 lines using `server.listen(0)` in `lib/ports.ts` |
| `dev-ip` | Vendor using `os.networkInterfaces()` in `lib/ip.ts` |
| `yargs` | `node:util.parseArgs` + `argsclopts` |
| `q` | Already unused — delete |
| `request` | Native `fetch` in tests |
| `rimraf` | `fs.rmSync(..., { recursive: true })` |
| `requirejs` | Already unused — delete |
| `source-map-support` | Drop (type-stripping workflow doesn't need it) |
| `prettier` | `neostandard` handles formatting via eslint |
| `vinyl` + `vinyl-fs` | Removed entirely — `.stream()` accepts plain `{ path: string }` objects |
| `mocha` + `chai` + `sinon` | `node:test` + `node:assert` + native `mock` |
| `generate-changelog` | `releasearoni` |
| `easy-extender` | Dropped — no external plugin system; all features are built-in |
| `micromatch` | `picomatch` |
| `etag` | `node:crypto` sha1 of content |
| `fresh` | Vendored ~20 lines in `lib/fresh.ts` |
| `fs-extra` | Node 20+ `fs/promises` |
| `send` | `@fastify/static` handles file serving |
| `ua-parser-js` | Not needed — raw `user-agent` header stored as string in `BsClientInfo` |
| `http2` (test dep) | Node built-in `node:http2` |
| `source-map` | Drop entirely |
| `bs-recipes` | Drop — no recipes command |
| `connect-history-api-fallback` | Not needed — UI uses real server-side routes |
| `localtunnel` | Dropped entirely — not in scope |
| `angular` + all `angular-*` | Replaced by Preact + htm in the UI |
| `crossbow-sites` | DROPPED — no component docs/style guide needed |
| `async-each-series` | Native `async/await` sequential iteration |
| `stream-throttle` | Retained only if network-throttle feature is implemented (deferred) |
| `store` (localStorage wrapper) | Native `localStorage` API directly in Preact components |
| `parallelshell` | `npm-run-all2` |
| `uglify-js` | esbuild `--minify` |
| `object-path` | Normal property access |
| `no-abs` | Drop |
| `pretty-js` | Drop |
| `http-proxy` | Proxy mode dropped entirely |
| `zod` | Replaced by JSON Schema + `json-schema-to-ts` |

### Retained

| Dep | Why kept |
|---|---|
| `chokidar` | Still the best cross-platform file watcher; no viable native replacement |
| `picomatch` | Replaces micromatch; smaller, no deps |
| `pino` | Fastify's native logger; replaces eazy-logger/chalk |
| `@fastify/static` | Replaces serve-static + serve-index |
| `ws` | WebSocket server — Node.js 24 has a built-in `WebSocket` global but it is **client-side only** (no `WebSocketServer`); `ws` stays until a server-side built-in lands |

### Added

| Dep | Purpose |
|---|---|
| `fastify` | Core HTTP server |
| `@fastify/static` | File serving + directory listing |
| `@fastify/cors` | CORS header middleware |
| `pino` | Structured logger |
| `pino-pretty` | Dev log formatting |
| `ws` | WebSocket server (replaces socket.io) |
| `argsclopts` | CLI option definitions with help text (https://github.com/bcomnes/argsclopts) |
| `esbuild` | Client bundle compilation (devDep) |
| `htm` | Tagged template literal JSX alternative for Preact (no JSX transform needed) |
| `preact` | UI framework — ~3KB gzipped vs Angular 1's ~50KB |
| `json-schema-to-ts` | Type inference from JSON Schema objects (`FromSchema<>`) |
| `@fastify/type-provider-json-schema-to-ts` | Fastify type provider for JSON Schema |

### Dev deps following ts-template

| Dep | Purpose |
|---|---|
| `typescript` | Type checking + declaration emit |
| `@voxpelli/tsconfig` | Shared tsconfig base |
| `@types/node` | Node type defs |
| `@types/ws` | Types for `ws` package |
| `@types/picomatch` | Types for `picomatch` |
| `neostandard` | ESLint config |
| `npm-run-all2` | Script runner |
| `releasearoni` | Changelog + release |

---

## Node.js Built-in WebSocket Decision

Node.js 22+ (and 24+) has a global `WebSocket` class, but it is **client-side only** — it can connect to a WebSocket server but cannot act as one. There is no `WebSocketServer` built-in. The `ws` npm package remains necessary for the server-side WebSocket endpoint. This was verified against the Node.js 24 docs.

---

## Architecture: New Server Design

### HTTP Server (Fastify)

```
Fastify instance
  ├── Plugin: @fastify/cors          (optional, opt-in via cors: true)
  ├── Plugin: injectorPlugin         (onSend hook — buffers streams to inject <script>)
  ├── Plugin: @fastify/static        (baseDir serving + index.html)
  ├── Route: GET /__bs/client.js     → serve bundled client script
  ├── Route: POST /__bs/reload       → HTTP reload API
  └── server.on('upgrade')           → BsSockets.handleUpgrade() for /__bs paths
```

### WebSocket Protocol

**Server → Client messages** (`ServerToClientMessage`):
```
{ type: "reload" }
{ type: "css-reload", path: "styles.css" }
{ type: "notify", message: "..." }
{ type: "options", data: {...} }
{ type: "scroll", x: number, y: number }  ← ghost relay
{ type: "click",  x: number, y: number }  ← ghost relay
{ type: "input",  id: string, value: string }  ← ghost relay
```

**Client → Server messages** (`ClientToServerMessage` = `GhostMessage`):
```
{ type: "scroll", x: number, y: number }
{ type: "click",  x: number, y: number }
{ type: "input",  id: string, value: string }
```

Ghost messages sent by one client are relayed by the server to all _other_ connected clients (sender excluded).

### Client Bundle

`lib/client/index.ts` bundled by esbuild into `lib/client/dist/browser-sync-client.js`:
- Native `WebSocket` API (no socket.io-client)
- No RxJS — plain `addEventListener` + switch dispatch
- Ghost mode: scroll, click, text input, checkbox/radio listeners all inlined
- All handlers in `lib/client/handlers.ts`: `handleReload`, `handleCssReload`, `handleNotify`, `handleScroll`, `handleInput`

### Script Injection

`lib/injector.ts` — Fastify `onSend` hook:
- Checks `content-type` for `text/html`
- Handles `string`, `Buffer`, and `ReadableStream` payloads (streams are buffered)
- Updates `content-length` header after injection
- Inserts `<script>` tag before `</body>` (or appends if no `</body>`)

### Options

`lib/options.ts` — JSON Schema with `json-schema-to-ts`:
- `bsOptionsSchema` typed as `as const satisfies JSONSchema`
- `BsOptionsInput` = `FromSchema<typeof bsOptionsSchema>` (runtime input type)
- `BsOptions` = plain interface with all defaults applied (no `undefined` fields)
- `parseOptions(raw)` applies all defaults manually — no Zod, no Immutable

### UI Panel

`lib/ui/server.ts` — separate Fastify instance on an auto-detected port:
- Real server-side routes per page (no SPA hash routing)
- `WebSocketServer` for UI browser ↔ server state sync
- Listens on shared in-process `EventEmitter` for `client:connect`, `client:disconnect`, `file:change` events from the main BS server
- Builds `UiState` (connections, history, server URLs) and broadcasts `init`/`update` messages to UI WebSocket clients
- `createUiServer()` returns `UiInstance { uiUrl, uiPort, exit() }`

---

## Public API (`index.ts`)

```typescript
export { createServer }    // async (opts: BsOptions) => BsInstance
export { parseOptions }    // (raw?: BsOptionsInput) => BsOptions
export type { BsOptions }
export type { BsInstance }
export type { ServerToClientMessage, ClientToServerMessage, BsMessage }
```

`BsInstance`:
```typescript
interface BsInstance {
  url: string               // http://localhost:<port>
  uiUrl: string | null      // http://localhost:<uiPort> or null if ui: false
  localIp: string           // local network IP
  port: number
  uiPort: number | null
  events: EventEmitter      // emits: 'client:connect', 'client:disconnect', 'file:change'
  reload(files?: string[]): void
  notify(message: string): void
  stream(): Transform        // objectMode Transform; accepts { path: string } chunks
  exit(): Promise<void>
  pause(): void
  resume(): void
}
```

---

## Implementation Phases

### Phase 0 — Repository Migration ✅
- [x] Move `packages/`, `lerna.json`, monorepo root files into `legacy/`
- [x] Add `legacy/` to `.gitignore` patterns for tsc, eslint, esbuild
- [x] Write new root `package.json` (ESM, engines node>=20)
- [x] Confirm `legacy/` code doesn't interfere with new build

### Phase 1 — Scaffold & Plumbing ✅
- [x] Set up package.json (ESM, engines, scripts)
- [x] Set up tsconfig.json + declaration.tsconfig.json
- [x] Set up eslint.config.js with neostandard
- [x] Set up CI (tests.yml + release.yml)
- [x] Wire up releasearoni
- [x] Stub out `index.ts` public API

### Phase 2 — Core Server (Fastify + static serving) ✅
- [x] `lib/server.ts` — Fastify instance factory
- [x] `lib/options.ts` — JSON Schema + `json-schema-to-ts` (replaced Zod)
- [x] `lib/logger.ts` — Pino wrapper
- [x] `lib/ports.ts` — port detection
- [x] `lib/ip.ts` — local IP detection
- [x] `@fastify/static` integration
- [x] `@fastify/cors` integration

### Phase 3 — Client & WebSocket ✅
- [x] `lib/client/tsconfig.json` — browser target (ES2020, DOM lib)
- [x] `lib/client/vendor/logger.ts` — vendored nanologger (~15 lines)
- [x] `lib/client/index.ts` — message dispatch, native WebSocket, no RxJS, no polyfills
- [x] `lib/client/handlers.ts` — reload, css-inject, notify, scroll, input handlers
- [x] esbuild client bundle script (iife, minify, target=es2020)
- [x] `lib/sockets.ts` — `ws` WebSocket server attached to Fastify via `noServer: true`
- [x] `lib/protocol.ts` — unified `ServerToClientMessage` / `ClientToServerMessage` / `GhostMessage` discriminated union
- [x] `/__bs/client.js` route serving compiled bundle

### Phase 4 — Script Injection ✅
- [x] `lib/snippet.ts` — generate `<script>` tag
- [x] `lib/injector.ts` — Fastify `onSend` hook; handles string, Buffer, and ReadableStream payloads; updates content-length

### Phase 5 — File Watching ✅
- [x] `lib/watcher.ts` — chokidar + picomatch wrapper with `setTimeout`-based debounce
- [x] Wire watcher → `sockets.broadcast({ type: 'reload' })` or `{ type: 'css-reload' }`
- [x] `events.emit('file:change', evt)` for UI panel and external consumers

### Phase 6 — Proxy Mode ~~(DROPPED)~~
- Proxy mode dropped entirely — static file serving only; `http-proxy` removed

### Phase 7 — CLI ✅
- [x] `lib/cli.ts` — argsclopts + parseArgs; shared options object passed to both `printHelpText` and `parseArgs`
- [x] `start` command (default)
- [x] `init` command (writes `bs-config.js`)
- [x] `reload` command (HTTP POST to `/__bs/reload`)
- [x] `--help` / `--version` flags

### Phase 8 — Ghost Mode ✅
- [x] Scroll sync — `scroll` event listener → `send({ type: 'scroll' })` → server relay → `handleScroll()`
- [x] Click sync — `click` event listener → `send({ type: 'click' })` → server relay
- [x] Form/input sync — `input` listener for text + `change` listener for checkbox/radio → `send({ type: 'input' })` → server relay → `handleInput()`
- [x] Server-side relay in `BsSockets` — ghost messages broadcast to all clients except sender

### Phase 9 — Public API ✅
- [x] `index.ts` — `createServer()` + `parseOptions()` + type exports
- [x] `.reload(files?)` — broadcasts `css-reload` for `.css` files when `injectChanges: true`, else `reload`
- [x] `.notify(message)` — broadcasts `notify` message
- [x] `.stream()` — objectMode `Transform`; routes `.css` chunks to `css-reload`, others to `reload`
- [x] `.exit()` — graceful shutdown of watcher, UI server, sockets, Fastify
- [x] `.pause()` / `.resume()` — suppresses watcher-triggered reloads
- [x] `events: EventEmitter` — emits `client:connect` (BsClientInfo), `client:disconnect` (id), `file:change` (WatchEvent)
- [x] `POST /__bs/reload` HTTP API route

### Phase 10 — UI Panel (Preact + htm) ✅
- [x] `lib/ui/server.ts` — Fastify instance, `@fastify/static` serving `lib/ui/public/`, real server-side routes per page
- [x] `lib/ui/types.ts` — `UiState`, `UiServerMessage`, `FileChange`, `UiInstance` shared types
- [x] `lib/ui/tsconfig.json` — browser target, ES2020, DOM lib
- [x] `lib/ui/app/index.ts` — Preact app root; mounts component based on `location.pathname`
- [x] `lib/ui/app/ws.ts` — native `WebSocket` to `/ws` on UI server; dispatches `init`/`update` messages
- [x] `lib/ui/app/components/Nav.ts` — shared navigation bar
- [x] `lib/ui/app/components/Overview.ts` — server URLs, local IP, port info
- [x] `lib/ui/app/components/SyncOptions.ts` — ghost mode display (read-only; live toggling deferred)
- [x] `lib/ui/app/components/History.ts` — file change history list
- [x] `lib/ui/app/components/Connections.ts` — connected browser list with UA + timestamps
- [x] `lib/ui/app/components/NetworkThrottle.ts` — placeholder (network throttle not implemented)
- [x] `lib/ui/app/components/Help.ts` — static help text
- [x] `lib/ui/app/styles/base.css` — dark theme, CSS custom properties
- [x] `lib/ui/app/styles/layout.css` — all component layout styles
- [x] `lib/ui/app/styles/index.css` — `@import` aggregator
- [x] esbuild UI bundle scripts (`build:ui-js`, `build:ui-css`)
- [x] UI WebSocket server bridges main BS `EventEmitter` → UI clients (in-process, no inter-process sockets)
- [x] `--no-ui` / `ui: false` disables UI server entirely
### Phase 11 — Tests & Polish ✅
- [x] `lib/ports.test.ts` — port detection unit tests
- [x] `lib/ip.test.ts` — IP detection unit test
- [x] `index.test.ts` — options parsing tests
- [x] `lib/server.test.ts` — integration tests: HTTP routes, HTML injection (string + stream + Buffer), `.stream()`, `.reload()`, `.notify()`, `.pause()`, `.resume()`, `.exit()`, UI panel startup
- [x] `lib/sockets.test.ts` — WebSocket tests: connect/disconnect events, `getConnections()`, broadcast, ghost relay excluding sender, clean close
- [x] `lib/watcher.test.ts` — watcher tests: change event on file write, debounce, close
- [x] `lib/cli.test.ts` — CLI subprocess tests: `--help`, `--version`, `init`
- [x] README
- [ ] UI component smoke tests (covered by TypeScript; browser tests deferred)
- [ ] Delete `legacy/` (kept for reference; can be removed once confidence is high)

---

## What Gets Dropped (Features)

| Feature | Decision |
|---|---|
| Auto-open browser (`opn`) | Dropped entirely — no browser opening under any circumstances |
| LocalTunnel | Dropped entirely — not in scope |
| HTTP/2 mode | Dropped — not in scope |
| HTTPS / self-signed certs | Dropped entirely — no TLS, no `selfsigned` package, no cert generation |
| Recipes (`bs-recipes`) | Drop — configure directly via options |
| IE8 support middleware | Drop entirely |
| `generate-changelog` | Replaced by `releasearoni` |
| Protractor E2E tests | Drop — Playwright if E2E tests are needed later |
| AngularJS 1.x | Replaced by Preact + htm in the UI |
| Vinyl / Gulp interop | `.stream()` becomes a plain Transform stream; no vinyl objects |
| External plugin API | Dropped — `easy-extender` gone; all features are first-party and built-in |
| Crossbow-sites component docs | Dropped — no dev-only style guide needed |
| Proxy mode | Dropped entirely — static file serving only; `http-proxy` removed |
| Location sync (`browser-set-location.effect.ts`) | Dropped — out of scope |
| Scroll restore via `window.name` | Dropped — not needed |
| Live options push (`OptionsSet`) | Deferred — no mutation path implemented yet |
| SyncOptions live toggling | Deferred — UI panel shows read-only state |
| Network throttle | Deferred — placeholder component only |

---

## What Gets Kept (Features)

- Static file serving
- File watching + live reload
- CSS injection (no-refresh style update)
- Ghost mode: scroll sync, click sync, form/input sync (text + checkbox/radio)
- HTTP reload API (`POST /__bs/reload`)
- Notify overlay
- `bs.reload()` / `bs.notify()` / `bs.stream()` public API
- `bs.events` EventEmitter for external consumers
- UI panel (Preact + htm, separate port, optional)

---

## Decisions (Resolved)

| Question | Decision |
|---|---|
| Browser auto-open (`opn`) | Dropped entirely — print URLs only |
| HTTPS / self-signed certs | Dropped entirely — no TLS support |
| `bs.stream()` Vinyl compat | Break cleanly — accept plain `{ path: string }` objects only |
| Plugin system | Dropped entirely — no external plugin API |
| UA parsing | Raw `user-agent` header stored as string in `BsClientInfo`; no parsing lib |
| LocalTunnel | Dropped entirely |
| AngularJS | Replaced by Preact + htm |
| Crossbow-sites | DROPPED — no dev-only style guide needed |
| mocha/chai in UI | Replaced by `node:test` + `node:assert` |
| CSS approach (UI) | Vanilla CSS, bundled by esbuild via `@import` — no SCSS, no CSS-in-JS |
| UI routing | Real server-side routes, one route per page — no hash routing, no SPA catch-all |
| UI JS/CSS bundling | Two esbuild invocations: one for `app.js` (iife), one for `app.css` |
| Options validation | JSON Schema + `json-schema-to-ts` (not Zod); `as const satisfies JSONSchema` pattern |
| CLI help text | `argsclopts` — same options object passed to both `printHelpText` and `parseArgs` |
| Built-in Node.js WebSocket | Node 24 has `WebSocket` global (client-side only — no `WebSocketServer`); `ws` package stays |
| Proxy mode | Dropped entirely — static file serving only |

---

## Vendored Code Audit

This section compares every piece of logic we inlined from a dependency against the original source. For each item: what we captured, what we dropped, robustness gaps, missing tests, and missing documentation.

---

### 1. `strip-ansi` → `lib/strip-ansi.ts` ✅

**What we have:** Full vendor of `strip-ansi@7.2.0` + `ansi-regex@6.1.0` — the same OSC + CSI pattern, fast-path check for ESC/C1 introducers, and `TypeError` on non-string input. No external dependency.

**Tests:** `lib/strip-ansi.test.ts` — 11 tests covering SGR color sequences, OSC hyperlinks, C1 CSI, fast path, empty string, and type errors.

**Verdict:** ✅ Complete.

---

### 2. `fresh` (HTTP conditional request) ✅ Deleted

`lib/fresh.ts` was unused dead code — never wired up anywhere. `@fastify/static` handles HTTP conditional requests (`If-None-Match`, `If-Modified-Since`) natively. File deleted.

---

### 3. `resp-modifier` + `bs-snippet-injector` → `lib/injector.ts` + `lib/snippet.ts`

#### `lib/snippet.ts`

**What we have:** Hard-coded `/__bs/client.js` path wrapped in an IIFE `<script>` tag with `async = true`.

**Legacy `connect-utils.js` had:**
- Configurable `scriptPath` (function or string override)
- `script.domain` option for cross-origin hosting
- `localOnly` mode (forced `localhost` in the URL)
- `async` attribute controlled via `snippetOptions.async`
- Version cache-busting on the script URL (`?v=<version>`)
- `snippetOptions.rule` (configurable injection regex, not just `</body>`)
- `snippetOptions.ignorePaths` (skip injection on certain routes)

**Gaps:**
- No version cache-busting on `/__bs/client.js` — browsers may cache the old bundle across releases
- `snippetOptions.async` not wired up (we always inject with `async`, which is fine)
- No configurable injection rule or `ignorePaths` — these were power-user features, acceptable to drop

**Missing tests:** The legacy had integration tests verifying the snippet appears in served HTML. We now have `lib/server.test.ts` covering injection. ✅

**Missing docs:** The `</body>` requirement and the fallback (append at end if no `</body>`) should be mentioned in the README, as users of `bs.stream()` may care.

**Verdict:** ⚠️ Add a cache-busting query param to the client script URL (e.g., `?v=<pkg.version>`). Drop the rest — not needed for our use case.

#### `lib/injector.ts`

**What we have:** Fastify `onSend` hook that handles `string`, `Buffer`, and `ReadableStream` payloads; updates `content-length`.

**Legacy `resp-modifier`:** Was a Connect middleware that buffered streaming responses, decoded gzip/deflate, replaced patterns, and re-encoded. It also handled chunked transfer encoding.

**Gaps:**
- We do not handle gzip/deflate-compressed responses (but Fastify doesn't compress before `onSend`, so this is fine)
- We do not handle `transfer-encoding: chunked` specially (Fastify normalizes this)
- We replace only the _first_ `</body>` occurrence — correct, but should be documented

**Tests:** `lib/injector.test.ts` — 6 tests: string payload, Buffer payload, null pass-through, non-HTML pass-through, no-`</body>` append, content-length accuracy. `ReadableStream` path covered by `lib/server.test.ts` static file integration test.

**Verdict:** ✅ Complete.

---

### 4. `portscanner` → `lib/ports.ts` ✅

**What we have:** Two-step strategy — try `start` first, fall back to `listen(0)` which lets the OS assign a guaranteed-free ephemeral port. No recursion, no unbounded loops.

```typescript
async function tryBind(port: number): Promise<number | null>
export async function findFreePort(start: number): Promise<number>
```

**Tests:** `lib/ports.test.ts` — 3 tests: preferred port returned when free, OS-assigned fallback when preferred is taken (held open by a real server), and that the returned port is actually bindable.

---

### 5. `dev-ip` → `lib/ip.ts`

**What we have:**
```typescript
export function getLocalIp(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}
```

**Legacy `dev-ip`:** Returned an array of all non-internal IPv4 addresses, sorted with preferred interfaces (e.g., `en0`, `eth0`) first. It skipped VPN tun/tap interfaces. It also cached the result. The browser-sync server let users pick via `--host`.

**Gaps:**
- We return only the _first_ non-internal IPv4 — on machines with multiple interfaces (VPN + LAN), the wrong one may be selected
- No VPN interface filtering (tun0, utun0, etc.)
- No caching (called every server startup — fine, `networkInterfaces()` is cheap)

**Missing tests:** We have `lib/ip.test.ts` verifying the return is a valid IPv4 string. No test for multi-interface machines or VPN filtering. ✅ Adequate for the use case.

**Verdict:** ✅ Acceptable. Potential improvement: skip interfaces matching `/^(tun|utun|tap|vpn)/i` to avoid returning VPN addresses.

---

### 6. Nanologger → `lib/client/vendor/logger.ts`

**What we have:**
```typescript
const PREFIX = '[BS]'
export const log = {
  debug: (...args) => console.debug(PREFIX, ...args),
  info:  (...args) => console.info(PREFIX, ...args),
  warn:  (...args) => console.warn(PREFIX, ...args),
  error: (...args) => console.error(PREFIX, ...args),
}
```

**Legacy Nanologger had:**
- Emoji per log level (🐛 debug, ✨ info, ⚠️ warn, 🚨 error)
- CSS color-coded output in browser DevTools (`%c` format strings)
- Log level filtering controlled by `localStorage.getItem('logLevel')` — users could suppress debug output
- Named logger instances (e.g., `new Nanologger('BrowserSync')`)
- Timestamp support
- Graceful degradation for IE/Edge (which didn't inherit from `Function.prototype`)

**Gaps:**
- No log-level filtering — all levels always print
- No color-coded DevTools output — slightly less useful for debugging
- No `localStorage` level control — power users can't quiet the client

**Missing tests:** None in legacy either — it's a browser logger, untestable in Node. ✅ N/A.

**Missing docs:** The `localStorage` trick for controlling log level was useful and documented in the legacy README. Worth a sentence in the README.

**Verdict:** ✅ Acceptable for a dev tool. Optional improvement: add log-level filtering via `localStorage.getItem('bs-log-level')`.

---

### 7. LiveReload `Reloader.ts` → `lib/client/handlers.ts` (`handleCssReload`)

This is the most significant robustness gap in the entire vendored set.

**What we have:**
```typescript
export function handleCssReload(path: string): void {
  const fileName = path.split('/').pop() ?? path
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
  const target = links.find(l => l.href.includes(fileName))
  if (target) {
    const url = new URL(target.href)
    url.searchParams.set('_bs', String(Date.now()))
    target.href = url.toString()
  } else {
    handleReload()
  }
}
```

**Legacy `Reloader.ts`** (originally from LiveReload) had:

1. **Smart path matching** (`pickBestMatch` / `numberOfMatchingSegments`): Scored stylesheet URLs by counting matching path segments from the right. A simple `href.includes(filename)` check fails for:
   - Stylesheets with the same filename in different directories
   - Versioned/hashed filenames (e.g., `main.abc123.css`)
   - CDN-hosted stylesheets
   - The `*` wildcard that reloads all stylesheets

2. **`@import` rule traversal**: Walked `document.styleSheets[n].cssRules` to find `CSSImportRule` entries. If a nested `@import`-ed file changed, the containing `<link>` was reloaded. Our implementation doesn't traverse `@import` at all.

3. **Clone + `onload` swap**: Instead of mutating `href` in place, the legacy cloned the `<link>` element, set `href` on the clone, inserted it before the old one, waited for the clone's `onload` event, then removed the old element. This prevents a flash of unstyled content (FOUC) between old and new styles. Our `href` mutation causes a brief FOUC.

4. **WebKit timing workaround**: Added a 5ms delay on WebKit (vs 200ms elsewhere) before removing the old element.

5. **`@import`-in-style-tag reload** (`reattachImportedRule`): Re-inserted `@import` rules as new CSS text to force a re-fetch. Required a temp `<link>` pre-cache workaround for a WebKit bug.

6. **Cache-busting parameter cleanup**: The legacy replaced an existing `browsersync=...` query param rather than appending a new one — so the URL didn't accumulate params across multiple reloads.

7. **Image reload** (`reloadImages`, `reloadStyleImages`): Handled `background-image: url(...)` in inline styles and stylesheet rules. **Intentionally dropped** — out of scope.

**Gaps summary:**

| Feature | Legacy | Ours | Priority |
|---|---|---|---|
| Filename match (simple) | ✅ | ✅ | — |
| Best-path segment matching | ✅ | ❌ | Medium |
| `*` wildcard reload all | ✅ | ❌ | Low |
| `@import` traversal | ✅ | ❌ | Medium |
| Clone + onload swap (no FOUC) | ✅ | ❌ | High |
| Cache param deduplication | ✅ | ❌ | Low |
| WebKit timing workaround | ✅ | ❌ | Low |
| Image reload | ✅ | ❌ (dropped) | N/A |

**Missing tests:** The legacy had Playwright E2E tests verifying CSS injection. We have no browser-level CSS injection tests.

**Missing docs:** The FOUC behavior difference is undocumented. The fallback-to-full-reload behavior (when no matching `<link>` found) is undocumented.

**Verdict:** ⚠️ **Medium priority gap.** For typical single-stylesheet sites, our implementation works. It breaks for sites with:
- Multiple stylesheets sharing a filename in different directories
- `@import`-heavy CSS architectures (e.g., PostCSS, Sass)
- Users who notice the brief FOUC on CSS hot reload

**Recommended fix:** Port the clone + `onload` swap logic (~30 lines, no deps) and the segment-based `pickBestMatch` (~20 lines). Leave out image reload and `@import` traversal as acceptable simplifications.

---

### 8. `bs-snippet-injector` template → `lib/snippet.ts` (IIFE wrapper)

The legacy used HTML templates on disk (`templates/script-tags.html`):
```html
<script id="__bs_script__">//<![CDATA[
    document.write("<script async src='%script%'><\/scr"+"ipt>");
//]]></script>
```
And a simple variant without the `document.write`.

**What we have:** IIFE that creates a `<script>` element and appends it to `<head>`.

**Legacy approach problems:**
- Used `document.write` — blocked by browsers in async/deferred contexts, deprecated, not allowed in ES modules
- CDATA wrapper was XML compatibility for XHTML — not needed for HTML5

**Our approach advantages:**
- Dynamic element creation is the correct modern approach
- No `document.write`

**Gaps:**
- We always append to `<head>` — if `<head>` is absent, this silently fails. Should fall back to `document.documentElement`.
- No `nonce` attribute support for Content Security Policy. Sites with strict CSP will have the injected script blocked.

**Missing tests:** Covered by `lib/server.test.ts` (verifies `__bs_script__` appears in response). ✅

**Verdict:** ✅ Better than legacy. Add CSP `nonce` support as a future option.

---

### Summary Table

| Vendored item | Robustness vs original | Critical gaps | Action |
|---|---|---|---|
| `strip-ansi` | ✅ 100% — full ansi-regex OSC+CSI pattern vendored, fast path, type check | — | ✅ 11 tests added (`lib/strip-ansi.test.ts`) |
| `fresh` | ✅ Deleted — was unused dead code | — | — |
| `injector.ts` | ✅ 100% line coverage | ReadableStream branch tested via server integration | ✅ 6 tests added (`lib/injector.test.ts`): string, Buffer, null, non-HTML, no-body-tag, content-length |
| `snippet.ts` | 85% — drops complex config rightly | No script cache-busting, no CSP nonce | Add `?v=<version>` to script src |
| `ports.ts` | ✅ 100% — OS port-0 fallback replaces unbounded recursion | — | ✅ 3 tests: preferred port, fallback when taken, usable after returned |
| `ip.ts` | 80% — no VPN filtering | May return VPN IP on some machines | Skip tun/utun interfaces |
| `client/vendor/logger.ts` | 70% — no level filtering, no color | Debug noise always visible | Acceptable; log-level opt-in later |
| `handleCssReload` (Reloader) | 50% — misses @import, FOUC, best-match | FOUC on CSS reload; @import not reloaded | Port clone+onload swap + pickBestMatch |

---

### Remaining Follow-up Work (prioritized)

1. **Fix CSS reload FOUC** — port clone + `onload` swap from `Reloader.ts` (~30 lines)
2. **Add `pickBestMatch`** — port segment-based stylesheet matching from legacy `utils.ts` (~20 lines)
3. **Script cache-bust** — append `?v=<pkg.version>` to `/__bs/client.js` in snippet
4. **VPN IP filtering** — skip `tun`, `utun`, `tap` interfaces in `lib/ip.ts`
