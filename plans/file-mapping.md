# Legacy → New File Mapping

Maps every source file in `legacy/packages/` to its equivalent in the new implementation, or a disposition tag.

**Disposition tags:**
- `VENDORED` — logic inlined into a new file
- `DROPPED` — feature deliberately removed

---

## `browser-sync` (server package)

| Legacy file | New file / Disposition | Notes |
|---|---|---|
| `browser-sync/lib/index.js` | `index.ts` | Singleton registry + public API entry |
| `browser-sync/lib/browser-sync.js` | `lib/server.ts` | Constructor → `createServer()` factory |
| `browser-sync/lib/async-tasks.js` | `VENDORED` → `lib/server.ts` | Startup task list; inlined into `createServer()` |
| `browser-sync/lib/async.js` | `VENDORED` → `lib/server.ts` | Sequential startup steps; merged into `createServer()` |
| `browser-sync/lib/args.js` | `DROPPED` | Back-compat argument normaliser; new API is strictly typed |
| `browser-sync/lib/bin.ts` | `lib/cli.ts` | CLI entry; yargs → `parseArgs` + argsclopts |
| `browser-sync/lib/config.js` | `DROPPED` | Internal path constants for socket.io script; no longer needed |
| `browser-sync/lib/connect-utils.js` | `VENDORED` → `lib/snippet.ts`, `lib/server.ts` | Script-tag generator + URL helpers; split across snippet/server |
| `browser-sync/lib/default-config.js` | `lib/options.ts` | Default values; replaced by typed `parseOptions()` defaults |
| `browser-sync/lib/file-event-handler.js` | `lib/watcher.ts` | RxJS debounce/throttle of file events → `BsWatcher` debounce |
| `browser-sync/lib/file-utils.js` | `VENDORED` → `lib/watcher.ts` | `changedFile` helper; folded into watcher event routing |
| `browser-sync/lib/file-watcher.js` | `lib/watcher.ts` | Chokidar plugin; direct predecessor of `BsWatcher` |
| `browser-sync/lib/hooks.js` | `DROPPED` | Plugin hook aggregation (easy-extender); plugin system removed |
| `browser-sync/lib/http-protocol.js` | `VENDORED` → `lib/server.ts` | HTTP remote reload → `POST /__bs/reload` Fastify route |
| `browser-sync/lib/internal-events.js` | `VENDORED` → `lib/server.ts` | EventEmitter→socket bridge; replaced by `BsSockets.broadcast()` |
| `browser-sync/lib/lodash.custom.js` | `DROPPED` | Bundled lodash subset; native ES/TS replaces it |
| `browser-sync/lib/logger.js` | `lib/logger.ts` | eazy-logger wrapper → Pino wrapper |
| `browser-sync/lib/options.ts` | `lib/options.ts` | Immutable + transform pipeline → JSON Schema + `parseOptions()` |
| `browser-sync/lib/plugins.js` | `DROPPED` | Immutable.Record plugin loader; plugin system removed |
| `browser-sync/lib/snippet.js` | `lib/injector.ts`, `lib/snippet.ts` | resp-modifier injection + script-tag utils; split across two files |
| `browser-sync/lib/sockets.ts` | `lib/sockets.ts` | socket.io server → `ws` + `BsSockets` |
| `browser-sync/lib/tunnel.js` | `DROPPED` | localtunnel; deliberately removed |
| `browser-sync/lib/types.ts` | `lib/options.ts`, `lib/protocol.ts` | Shared interfaces; split into options schema + protocol types |
| `browser-sync/lib/utils.ts` | `lib/ip.ts`, `lib/ports.ts` | `getHostIp`/`getPorts`/URL helpers; split into focused modules |
| `browser-sync/lib/cli/cli-options.ts` | `lib/options.ts`, `lib/cli.ts` | Immutable merge pipeline; replaced by `parseOptions()` + `parseArgs` |
| `browser-sync/lib/cli/command.init.js` | `lib/cli.ts` | `init` command; ported (writes `bs-config.js`) |
| `browser-sync/lib/cli/command.recipe.js` | `DROPPED` | Recipe command; dropped |
| `browser-sync/lib/cli/command.reload.js` | `lib/cli.ts` | `reload` command; ported as HTTP POST |
| `browser-sync/lib/cli/command.start.ts` | `lib/cli.ts` | `start` command; reimplemented |
| `browser-sync/lib/cli/transforms/addCwdToWatchOptions.ts` | `VENDORED` → `lib/options.ts` | Merges cwd into watchOptions |
| `browser-sync/lib/cli/transforms/addDefaultIgnorePatterns.ts` | `VENDORED` → `lib/watcher.ts` | node_modules/.git ignores; in `BsWatcher` defaults |
| `browser-sync/lib/cli/transforms/addToFilesOption.ts` | `DROPPED` | `--watch` flag not ported |
| `browser-sync/lib/cli/transforms/appendServerDirectoryOption.ts` | `DROPPED` | `server.directory`; `@fastify/static` handles directory listing |
| `browser-sync/lib/cli/transforms/appendServerIndexOption.ts` | `VENDORED` → `lib/server.ts` | `server.index`; handled by `@fastify/static` `index` option |
| `browser-sync/lib/cli/transforms/copyCLIIgnoreToWatchOptions.ts` | `VENDORED` → `lib/options.ts` | `--ignore` → watchOptions |
| `browser-sync/lib/cli/transforms/handleExtensionsOption.ts` | `DROPPED` | `--extensions`; not ported |
| `browser-sync/lib/cli/transforms/handleFilesOption.ts` | `VENDORED` → `lib/options.ts` | Normalises file globs into namespaced map |
| `browser-sync/lib/cli/transforms/handleGhostModeOption.ts` | `VENDORED` → `lib/options.ts` | `ghostMode: true/false` → object; in `parseOptions()` |
| `browser-sync/lib/cli/transforms/handleHostOption.ts` | `DROPPED` | Host/listen conflict validation; always binds `0.0.0.0` |
| `browser-sync/lib/cli/transforms/handlePortsOption.ts` | `VENDORED` → `lib/ports.ts` | Port range; `findFreePort` starts from `opts.port` |
| `browser-sync/lib/cli/transforms/handleProxyOption.ts` | `DROPPED` | Proxy URL parsing; proxy mode dropped |
| `browser-sync/lib/cli/transforms/handleServerOption.ts` | `VENDORED` → `lib/options.ts`, `lib/server.ts` | Normalises `server: string\|true\|obj` |
| `browser-sync/lib/public/exit.js` | `VENDORED` → `lib/server.ts` | `exit()`; `BsInstance.exit()` |
| `browser-sync/lib/public/init.ts` | `index.ts`, `lib/server.ts` | `init()` → exported `createServer()` |
| `browser-sync/lib/public/notify.js` | `VENDORED` → `lib/server.ts` | `notify()`; `BsInstance.notify()` |
| `browser-sync/lib/public/pause.js` | `VENDORED` → `lib/server.ts` | `pause()`; `BsInstance.pause()` |
| `browser-sync/lib/public/public-utils.js` | `DROPPED` | Internal emit helpers; no longer needed |
| `browser-sync/lib/public/reload.js` | `VENDORED` → `lib/server.ts` | `reload()`; `BsInstance.reload()` |
| `browser-sync/lib/public/resume.js` | `VENDORED` → `lib/server.ts` | `resume()`; `BsInstance.resume()` |
| `browser-sync/lib/public/stream.js` | `VENDORED` → `lib/server.ts` | `.stream()` Gulp Transform → plain `Transform` accepting `{ path }` objects |
| `browser-sync/lib/server/index.js` | `lib/server.ts` | Connect plugin dispatcher → Fastify `createServer()` |
| `browser-sync/lib/server/proxy-server.js` | `DROPPED` | http-proxy proxy mode; proxy mode dropped |
| `browser-sync/lib/server/proxy-utils.js` | `DROPPED` | Proxy link-rewriting regex; proxy mode dropped |
| `browser-sync/lib/server/serve-static-wrapper.ts` | `DROPPED` | WASM MIME type patch; Fastify-static handles MIME natively |
| `browser-sync/lib/server/snippet-server.js` | `lib/server.ts` | Snippet-mode Connect server → Fastify `onSend` injector |
| `browser-sync/lib/server/static-server.js` | `lib/server.ts` | Static-file Connect server → `@fastify/static` |
| `browser-sync/lib/server/utils.js` | `lib/server.ts` | Connect base-app + HTTPS cert factory; Fastify handles internally |
| `browser-sync/cli-options/opts.start.json` | `lib/cli.ts` | yargs option defs → argsclopts inline config |
| `browser-sync/cli-options/opts.reload.json` | `DROPPED` | yargs options for `reload`; not applicable |
| `browser-sync/cli-options/opts.recipe.json` | `DROPPED` | Recipe command; dropped |
| `browser-sync/cli-options/opts.init.json` | `DROPPED` | Init command options; consolidated into `cli.ts` |
| `browser-sync/templates/script-tags.html` | `VENDORED` → `lib/snippet.ts` | Script-tag template; inlined in `buildSnippet()` |
| `browser-sync/templates/script-tags-simple.html` | `DROPPED` | Alternate script tag; consolidated |
| `browser-sync/templates/connector.tmpl` | `DROPPED` | socket.io config bootstrap; socket.io removed |
| `browser-sync/templates/cli-template.js` | `lib/cli.ts` | `bs-config.js` template; inlined in `init` command |

---

## `browser-sync-client`

| Legacy file | New file / Disposition | Notes |
|---|---|---|
| `browser-sync-client/index.js` | `lib/client/index.ts` | Client bundle entry; served via Fastify static route at `/__bs/client.js` |
| `browser-sync-client/lib/index.ts` | `lib/client/index.ts` | RxJS bootstrap → plain native WS client |
| `browser-sync-client/lib/socket.ts` | `lib/client/index.ts` | socket.io-client → native `WebSocket` |
| `browser-sync-client/lib/socket-messages.ts` | `lib/protocol.ts`, `lib/client/index.ts` | Event enum + dispatch → `protocol.ts` types + switch in `index.ts` |
| `browser-sync-client/lib/effects.ts` | `lib/client/handlers.ts` | RxJS BehaviorSubject effect registry → plain function dispatch |
| `browser-sync-client/lib/effects/browser-reload.effect.ts` | `lib/client/handlers.ts` | `location.reload()` → `handleReload()` |
| `browser-sync-client/lib/effects/browser-set-location.effect.ts` | `DROPPED` | Ghost-mode `location.assign()`; omitted — location sync not in scope |
| `browser-sync-client/lib/effects/file-reload.effect.ts` | `lib/client/handlers.ts` | CSS inject / full reload → `handleCssReload()` / `handleReload()` |
| `browser-sync-client/lib/effects/set-element-toggle-value.effect.ts` | `lib/client/handlers.ts` | Ghost-mode checkbox/radio sync → `handleInput()` |
| `browser-sync-client/lib/effects/set-element-value.effect.ts` | `lib/client/handlers.ts` | Ghost-mode text input sync → `handleInput()` |
| `browser-sync-client/lib/effects/set-options.effect.ts` | `DROPPED` | Live options push from server; deferred — no live mutation path |
| `browser-sync-client/lib/effects/set-scroll.ts` | `lib/client/handlers.ts` | `window.scrollTo()` → `handleScroll()` |
| `browser-sync-client/lib/effects/simulate-click.effect.ts` | `VENDORED` → `lib/client/index.ts` | Ghost-mode click relay; inlined as `click` event listener + `send()` |
| `browser-sync-client/lib/dom-effects.ts` | `lib/client/handlers.ts` | DOM effect BehaviorSubject → collapsed into `handlers.ts` |
| `browser-sync-client/lib/dom-effects/link-replace.dom-effect.ts` | `VENDORED` → `lib/client/handlers.ts` | Stylesheet `href` swap + cache-bust → `handleCssReload()` |
| `browser-sync-client/lib/dom-effects/prop-set.dom-effect.ts` | `DROPPED` | Set arbitrary DOM property; not needed |
| `browser-sync-client/lib/dom-effects/set-scroll.dom-effect.ts` | `VENDORED` → `lib/client/handlers.ts` | `element.scrollTo()` → `handleScroll()` |
| `browser-sync-client/lib/dom-effects/set-window-name.dom-effect.ts` | `DROPPED` | Scroll position encoded in `window.name`; not needed |
| `browser-sync-client/lib/dom-effects/style-set.dom-effect.ts` | `DROPPED` | Set inline styles; not needed |
| `browser-sync-client/lib/listeners.ts` | `lib/client/index.ts` | Outgoing ghost-mode event stream aggregator; listeners inlined |
| `browser-sync-client/lib/listeners/clicks.listener.ts` | `lib/client/index.ts` | DOM click → WS send; inlined as `click` event listener |
| `browser-sync-client/lib/listeners/form-inputs.listener.ts` | `lib/client/index.ts` | keyup → `input:text` WS event; ported as `input` event listener |
| `browser-sync-client/lib/listeners/form-toggles.listener.ts` | `lib/client/index.ts` | checkbox change → WS event; ported as `change` event listener |
| `browser-sync-client/lib/listeners/scroll.listener.ts` | `lib/client/index.ts` | scroll → WS send; inlined as `scroll` event listener |
| `browser-sync-client/lib/log.ts` | `lib/client/vendor/logger.ts` | nanologger → lightweight `console`-based `log` object |
| `browser-sync-client/lib/notify.ts` | `lib/client/handlers.ts` | Notification overlay → `handleNotify()` |
| `browser-sync-client/lib/scroll-restore.ts` | `DROPPED` | Stores/restores scroll via `window.name`; not needed |
| `browser-sync-client/lib/browser.utils.ts` | `DROPPED` | DOM/scroll position helpers; native APIs used directly |
| `browser-sync-client/lib/utils.ts` | `DROPPED` | URL parsing, `splitUrl`, timer switch; not needed |
| `browser-sync-client/lib/messages/BrowserLocation.ts` | `DROPPED` | Location message; location sync dropped |
| `browser-sync-client/lib/messages/BrowserNotify.ts` | `lib/protocol.ts` | Notify message → `{ type: 'notify'; message }` |
| `browser-sync-client/lib/messages/BrowserReload.ts` | `lib/protocol.ts` | Reload message → `{ type: 'reload' }` |
| `browser-sync-client/lib/messages/ClickEvent.ts` | `lib/protocol.ts` | Click ghost message → `{ type: 'click'; x; y }` |
| `browser-sync-client/lib/messages/Connection.ts` | `DROPPED` | Handshake message; WS `open` event used directly |
| `browser-sync-client/lib/messages/Disconnect.ts` | `DROPPED` | Disconnect message; WS `close` event used directly |
| `browser-sync-client/lib/messages/FileReload.ts` | `lib/protocol.ts` | File reload message → `{ type: 'css-reload'; path }` |
| `browser-sync-client/lib/messages/FormToggleEvent.ts` | `lib/protocol.ts` | Toggle ghost message → `{ type: 'input'; id; value }` |
| `browser-sync-client/lib/messages/KeyupEvent.ts` | `lib/protocol.ts` | Text input ghost message → `{ type: 'input'; id; value }` |
| `browser-sync-client/lib/messages/OptionsSet.ts` | `DROPPED` | Live options message; deferred — no live mutation path |
| `browser-sync-client/lib/messages/ScrollEvent.ts` | `lib/protocol.ts` | Scroll ghost message → `{ type: 'scroll'; x; y }` |
| `browser-sync-client/lib/types.ts` | `lib/options.ts` | `IBrowserSyncOptions` client interface → `BsOptions` |
| `browser-sync-client/lib/types/socket.ts` | `lib/protocol.ts` | `FileReloadEventPayload` → protocol union |
| `browser-sync-client/lib/types/types.d.ts` | `lib/options.ts` | Global ambient type → exported `BsOptions` |
| `browser-sync-client/lib/vendor/logger.ts` | `lib/client/vendor/logger.ts` | nanologger → simple `log` object |
| `browser-sync-client/lib/vendor/Reloader.ts` | `VENDORED` → `lib/client/handlers.ts` | LiveReload-inspired CSS injector; core in `handleCssReload()` |
| `browser-sync-client/lib/vendor/Timer.ts` | `DROPPED` | Debounce timer class for Reloader; not needed |

---

## `browser-sync-ui`

| Legacy file | New file / Disposition | Notes |
|---|---|---|
| `browser-sync-ui/lib/server.js` | `lib/ui/server.ts` | Connect UI server → Fastify with real server-side routes |
| `browser-sync-ui/lib/UI.js` | `lib/ui/server.ts` | UI class constructor + plugin runner → `createUiServer()` factory |
| `browser-sync-ui/lib/async-tasks.js` | `lib/ui/server.ts` | UI startup task list; inlined into `createUiServer()` |
| `browser-sync-ui/lib/async.js` | `lib/ui/server.ts` | UI async startup steps; inlined |
| `browser-sync-ui/lib/client-elements.js` | `lib/ui/server.ts` | Injects CSS/JS into connected clients; handled by Fastify static + HTML shell |
| `browser-sync-ui/lib/client-js.js` | `lib/ui/app/ws.ts` | Client socket bootstrap → native `WebSocket` in `createWsClient()` |
| `browser-sync-ui/lib/config.js` | `DROPPED` | UI path constants; no longer needed |
| `browser-sync-ui/lib/directive-stripper.js` | `DROPPED` | Strips Angular directives from HTML; Angular removed |
| `browser-sync-ui/lib/hooks.js` | `DROPPED` | Template rendering hooks for plugin panels; plugin system removed |
| `browser-sync-ui/lib/opts.js` | `lib/ui/server.ts` | UI options merge (Immutable defaults) → `UiServerOptions` interface |
| `browser-sync-ui/lib/resolve-plugins.js` | `DROPPED` | Resolves user BS plugins with UI panels; plugin system removed |
| `browser-sync-ui/lib/transform.options.js` | `lib/ui/app/components/Overview.ts` | Transforms BS options for UI display |
| `browser-sync-ui/lib/transforms.js` | `lib/ui/app/components/Overview.ts` | Maps mode/options to display labels |
| `browser-sync-ui/lib/urls.js` | `lib/ui/server.ts` | URL helpers for UI HTTP requests |
| `browser-sync-ui/lib/utils.js` | `DROPPED` | HTTP request utility; native `fetch` used directly |
| `browser-sync-ui/lib/plugins/connections/**` | `lib/ui/app/components/Connections.ts` | Connected browser list panel |
| `browser-sync-ui/lib/plugins/help/**` | `lib/ui/app/components/Help.ts` | Help panel |
| `browser-sync-ui/lib/plugins/history/**` | `lib/ui/app/components/History.ts` | URL history panel |
| `browser-sync-ui/lib/plugins/network-throttle/**` | `lib/ui/app/components/NetworkThrottle.ts` | Speed/latency panel (placeholder — not yet implemented) |
| `browser-sync-ui/lib/plugins/overview/**` | `lib/ui/app/components/Overview.ts` | Server URLs, mode info panel |
| `browser-sync-ui/lib/plugins/plugins/**` | `DROPPED` | Plugin panel; plugin system removed |
| `browser-sync-ui/lib/plugins/remote-debug/**` | `DROPPED` | Overlay grid, no-cache, pesticide CSS; out of scope |
| `browser-sync-ui/lib/plugins/sync-options/**` | `lib/ui/app/components/SyncOptions.ts` | Ghost-mode toggles panel (read-only display) |
| `browser-sync-ui/src/scripts/**` | `lib/ui/app/index.ts` + components | AngularJS app → Preact + htm |
| `browser-sync-ui/src/crossbow/**` | `lib/ui/server.ts` | Handlebars templates → server-side Fastify HTML routes |
| `browser-sync-ui/public/**` | `lib/ui/public/` | Pre-built assets → esbuild output |

---

## New files with no legacy equivalent

| New file | Purpose |
|---|---|
| `lib/protocol.ts` | Unified `ServerToClientMessage` / `ClientToServerMessage` / `GhostMessage` discriminated union types |
| `lib/strip-ansi.ts` | Full vendor of `strip-ansi@7.2.0` + `ansi-regex@6.1.0` — OSC + CSI regex, fast path, type check; 11 unit tests |
| `lib/client/tsconfig.json` | Browser-target tsconfig for esbuild type-checking |
| `lib/client/vendor/logger.ts` | Lightweight `console`-based logger (replaces nanologger) |
| `lib/ui/types.ts` | Shared `UiState`, `UiServerMessage`, `FileChange` types for UI server ↔ browser |
| `lib/ui/tsconfig.json` | Browser-target tsconfig for UI esbuild type-checking |
| `lib/ui/app/index.ts` | Preact app root; pathname-based component mount |
| `lib/ui/app/ws.ts` | Native `WebSocket` connection from UI browser to UI server |
| `lib/ui/app/components/Nav.ts` | Shared navigation bar component |
| `lib/ui/app/styles/base.css` | CSS custom properties, dark theme, reset |
| `lib/ui/app/styles/layout.css` | All component layout styles |
| `lib/ui/app/styles/index.css` | `@import` aggregator for esbuild CSS bundle |
| `lib/server.test.ts` | Integration tests for `createServer()` — HTTP routes, injection, stream, UI, exit |
| `lib/sockets.test.ts` | Unit tests for `BsSockets` — connect/disconnect, broadcast, ghost relay |
| `lib/watcher.test.ts` | Unit tests for `BsWatcher` — change event, debounce, close |
| `lib/cli.test.ts` | CLI subprocess tests — `--help`, `--version`, `init` |
| `lib/injector.test.ts` | Unit tests for script injection hook — string, Buffer, null, non-HTML, content-length |
| `lib/strip-ansi.test.ts` | Unit tests for ANSI stripping — SGR, OSC, C1 CSI, fast path, type errors |
