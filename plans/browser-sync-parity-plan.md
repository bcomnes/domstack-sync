# BrowserSync Parity Recovery Plan

This plan tracks the remaining work to bring the modern rewrite in `lib/` closer to the legacy BrowserSync behavior kept under `.legacy/`.

## Implementation Principle

The legacy implementation is the behavior reference. Prefer matching the working legacy semantics first, then modernize the implementation and remove old dependencies where that can be done without changing user-visible behavior. When this plan says "port", it means reproduce the legacy behavior with modern TypeScript and smaller dependencies where practical, not clone the old dependency graph.

## Status Legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked or needs a decision

When completing work, update both the checkbox and the "Progress notes" for the relevant section. Add links to PRs, commits, or tests when available.

## Progress Summary

| Area | Status | Owner | Progress notes |
|---|---|---|---|
| UI connection stability | `[x]` | Codex | UI WebSocket replays late state, reconnects with backoff, exposes connection status, closes clients cleanly, and has non-browser client tests. |
| Runtime options handshake | `[x]` | Codex | Server sends runtime options on browser connect, accepts live UI option patches, broadcasts browser option snapshots, and has non-browser UI/server coverage. |
| Scroll sync loop prevention | `[x]` | Codex | Legacy `scroll` and `scroll:element` payloads, element scroll, mapping, proportional scroll, suppression, throttling, and Chromium browser loop tests are implemented. |
| Click, form, and navigation sync | `[x]` | Codex | Legacy ghost event names and payloads are implemented for click, forms, and navigation, with Chromium browser behavior coverage. |
| File watcher buffering and reload decisions | `[x]` | Codex | Watcher emits buffered batches with timestamps, legacy default `watchEvents`, whole-batch classification, reload throttling, and object watcher entries. |
| Reload and stream API semantics | `[x]` | Codex | Watcher, reload(files), stream, modern HTTP reload, and legacy HTTP protocol reload share reload-vs-inject decisions where file args are supplied. |
| CSS and asset injection parity | `[x]` | Codex | Legacy `injectFileTypes`, `tagNames`, generic file reload messages, imported CSS, and image/style asset refresh are implemented and covered by Chromium browser tests. |
| UI built-in feature parity | `[x]` | Codex | Default shipped UI pages were audited against legacy plugin pages, are functional, and have Chromium rendering/action coverage. |
| Plugin system parity | `[x]` | Codex | Modern plugin manager supports configured plugins, lifecycle, active state, legacy hooks, client events, UI metadata/pages, UI events, option mutation, package resolution, and middleware/file helpers via `@fastify/middie`. |
| Parity test coverage | `[x]` | Codex | Added Node parity coverage plus Chromium Playwright coverage for asset injection, cross-window sync, UI pages/actions, remote debug DOM injection, plugins, and network throttle. |
| Fastify route typing and hypermedia UI migration | `[x]` | Codex | Production Fastify routes now use JSON Schema/type-provider coverage; the UI shell/pages moved to `@fastify/view` + Handlebars + HTMX 4 beta from npm; Preact/HTM were removed. |

## 1. UI Connection Stability

Goal: the UI should receive initial state reliably and recover from WebSocket disconnects.

- `[x]` Fix `lib/ui/app/ws.ts` so the latest `init` state is replayed when `onUpdate` is assigned after the socket message arrives.
- `[x]` Add reconnect/backoff behavior to the UI WebSocket client.
- `[x]` Track connected/disconnected UI state instead of leaving pages indefinitely on "Connecting to server...".
- `[x]` Add a non-browser unit test proving `lib/ui/app/ws.ts` replays the cached `init` state when `onUpdate` is attached after the socket message arrives.
- `[x]` Add non-browser unit tests for UI WebSocket status replay, guarded `send`, and reconnect/backoff behavior where practical.

Progress notes:

- 2026-05-26: `lib/ui/app/ws.ts` now caches the latest UI state, replays it through the `onUpdate` setter, uses `ws`/`wss` based on page protocol, guards sends by socket state, and reconnects with exponential backoff.
- 2026-05-26: UI WebSocket client now reports `connecting`, `connected`, and `disconnected` status to the app, and the UI server terminates connected UI clients during shutdown so `exit()` closes cleanly.
- 2026-05-26: Non-browser UI WebSocket client tests are feasible without jsdom by mocking `globalThis.WebSocket`, `globalThis.location`, and timers. A small injectable socket/location test seam may keep the test cleaner, but browser automation is not required.
- 2026-05-26: Added non-browser `lib/ui/app/ws.test.ts` coverage for late `init` replay, status replay, guarded sends, and reconnect/backoff.

## 2. Runtime Options Handshake

Goal: client behavior should reflect server options and live UI option changes.

- `[x]` Extend `lib/protocol.ts` with an initial options or connection message carrying runtime settings.
- `[x]` Send current options from the server when a browser client connects.
- `[x]` Handle `options` / `options:set` messages in `lib/client/index.ts`.
- `[x]` Make `ghostMode`, `notify`, `codeSync`, `injectChanges`, and scroll settings affect client behavior at runtime.
- `[x]` Make `--no-ghost-mode` and `--no-notify` actually disable browser-side behavior.
- `[x]` Wire Sync Options UI actions to server-side option mutation and client updates.

Progress notes:

- 2026-05-26: Added `ClientRuntimeOptions` and initial `options` messages. `--no-ghost-mode` and `--no-notify` now affect browser-side behavior through the runtime options handshake.
- 2026-05-26: UI `options:set` messages now mutate server runtime options, broadcast updated `options` snapshots to browser clients, and broadcast updated UI state to UI clients.
- 2026-05-26: `ghostMode.forms` now normalizes to the legacy `submit`, `inputs`, and `toggles` shape while preserving compatibility with boolean `forms` config.

## 3. Scroll Sync Loop Prevention

Goal: remote scrolls should not bounce back and forth between connected browsers.

- `[x]` Add client-side remote-scroll suppression equivalent to legacy `createTimedBooleanSwitch`.
- `[x]` Suppress outgoing scroll events briefly after applying an incoming scroll.
- `[x]` Avoid emitting when the incoming scroll position is already effectively current.
- `[x]` Add optional outgoing scroll throttling using `scrollThrottle` or `requestAnimationFrame`.
- `[x]` Add tests proving browser A scrolls browser B once and B does not echo the event back to A.
- `[x]` Replace the simplified scroll payload with the legacy payload shape: `position`, `tagName`, `index`, and `mappingIndex`.
- `[x]` Port element scroll support from the legacy client, including captured document scroll events and non-document scroll targets.
- `[x]` Port `scrollElements` and `scrollElementMapping` behavior.
- `[x]` Preserve proportional scroll behavior so different viewport heights stay aligned.

Progress notes:

- 2026-05-26: Incoming scroll messages now set a short suppression window before applying `scrollTo`, and outgoing scroll events honor `scrollThrottle`.
- 2026-05-26: Scroll messages now use the legacy payload shape and support document scroll, element scroll by tag/index, `scrollElementMapping`, `scrollElements`, and proportional application.
- 2026-05-26: Document scroll uses the legacy `scroll` event name and element scroll uses the legacy `scroll:element` event name.
- 2026-05-26: Added Chromium Playwright coverage proving document scroll mirrors once without a remote echo and mapped element scroll targets are applied in a real browser.

## 4. Click, Form, and Navigation Sync

Goal: ghost mode should cover the major legacy cross-browser interactions.

- `[x]` Implement incoming click handling. The current client sends clicks but does not apply received click messages.
- `[x]` Replace coordinate-only click messages with the legacy `tagName` plus `index` payload.
- `[x]` Simulate incoming clicks on the matching element the same way the legacy `simulate-click.effect.ts` path does.
- `[x]` Split form sync to match legacy behavior: text inputs, keyups, checkbox/radio toggles, select, submit, and reset where applicable.
- `[x]` Use legacy-style element identity for form messages instead of relying only on `id` or `name`.
- `[x]` Add loop suppression for remote form updates, matching the existing input suppression idea.
- `[x]` Port `BrowserLocation` / `browser:location` navigation sync support.
- `[x]` Fix pathname tracking by sending the path on connect/navigation or by broadcasting and filtering client-side.

Progress notes:

- 2026-05-26: The client now sends `client-info` with its pathname on connect, receives click messages, dispatches a local `MouseEvent`, sends real click coordinates, and suppresses form echoes after remote input changes.
- 2026-05-26: Click messages now use legacy `tagName + index` identity and incoming clicks dispatch against the matching element asynchronously.
- 2026-05-26: Text input sync now uses legacy `input:text` keyup messages with `tagName + index`; checkbox/radio/select sync uses legacy `input:toggles`; incoming remote form updates suppress outbound echoes.
- 2026-05-26: `browser:location` messages are relayed to other clients without pathname filtering and the client applies path/url navigation when `ghostMode.location` is enabled.
- 2026-05-26: Form submit/reset sync now emits the legacy `form:submit` and `form:reset` event names, handles incoming `form:submit` and `form:reset`, and suppresses remote reset echoes.

## 5. File Watcher Buffering And Reload Decisions

Goal: file changes should be batched and classified like legacy BrowserSync.

- `[x]` Replace the single-event debounce in `lib/watcher.ts` with a buffered debounce window.
- `[x]` Decide reload vs inject from the entire buffered batch.
- `[x]` If any file in the batch requires a full reload, send one full reload.
- `[x]` Preserve injectable files as individual file reload messages when the whole batch is injectable.
- `[x]` Add `reloadThrottle`.
- `[x]` Add `codeSync` gating to watcher-triggered reloads.
- `[x]` Add `timestamp` to emitted file-change events so UI History renders valid times.
- `[x]` Restore legacy default `watchEvents` of `["change"]` while preserving configured event lists for users who opt into add/unlink/etc.
- `[x]` Restore object watcher support with per-watch `match`, `options`, and `fn` behavior where legacy supports it.
- `[x]` Classify reload vs inject with `injectFileTypes`, not a hard-coded CSS-only check.

Progress notes:

- 2026-05-26: `BsWatcher` now emits `changes` batches after debounce and keeps legacy single `change` events for compatibility. Server reload scheduling consumes the batch as a whole.
- 2026-05-26: Reload classification now uses configurable `injectFileTypes` instead of hard-coded CSS-only decisions.
- 2026-05-26: Default `watchEvents` now matches legacy `["change"]`; configured `watchEvents` remains available for parity with legacy custom watcher options and modern opt-in use cases.
- 2026-05-26: `files` entries now support legacy object watchers with `match`, per-watch `options`, and optional `fn`; object watchers without `fn` use the default BrowserSync file-change pipeline.

## 6. Reload And Stream API Semantics

Goal: public reload APIs should make correct batch decisions and preserve stream ergonomics.

- `[x]` Fix `reload(files)` so mixed arrays like `["style.css", "index.html"]` produce a full reload.
- `[x]` Avoid returning after the first CSS file in `reload(files)`.
- `[x]` Make `.stream()` support `match`.
- `[x]` Make `.stream()` support `once`.
- `[x]` Batch stream-triggered changes where practical.
- `[x]` Apply the same reload-vs-inject decision logic to watcher, `reload(files)`, and stream paths.
- `[x]` Apply legacy `injectFileTypes` classification consistently to watcher, `reload(files)`, HTTP reload, and stream paths.

Progress notes:

- 2026-05-26: Added `lib/reload-decision.ts` and wired watcher, `reload(files)`, and stream through it.
- 2026-05-26: Watcher, `reload(files)`, stream, and HTTP reload now use `injectFileTypes` when file arguments are supplied.
- 2026-05-26: `.stream()` now supports legacy `match` and `once` options, passes chunks through, batches matched file paths until flush, emits `stream:changed`, and classifies the stream batch once.
- 2026-05-26: Ported the legacy HTTP protocol reload path: `GET /__browser_sync__?method=reload&args=...` supports no-arg full reloads, single file args, and repeated file args, and routes file args through the same reload-vs-inject decision logic as `.reload(files)`. The modern `POST /__bs/reload` also accepts `files` / `args` while preserving no-body full reload behavior.

## 7. CSS And Asset Injection Parity

Goal: CSS and static asset live injection should cover the important legacy cases.

- `[x]` Keep the current `<link rel="stylesheet">` swap as the simple path.
- `[x]` Add configurable `injectFileTypes` with the legacy default: `["css", "png", "jpg", "jpeg", "svg", "gif", "webp", "map"]`.
- `[x]` Add configurable `tagNames` with the legacy default mapping: `css`/`less`/`scss` to `link`, image types to `img`, and `js` to `script`.
- `[x]` Replace the CSS-only server message path with a generic file reload/inject message carrying extension, basename, path, event, and type metadata like legacy `fileUtils.getFileInfo`.
- `[x]` Add support for reloading imported stylesheets from both `<style>` and `<link>` stylesheets.
- `[x]` Add support for image reloads: `png`, `jpg`, `jpeg`, `gif`, `svg`, and `webp`.
- `[x]` Refresh matching `<img src>` URLs by cache-busting rather than full reloading.
- `[x]` Refresh matching inline style image URLs, including `backgroundImage`, `borderImage`, `webkitBorderImage`, and `MozBorderImage`.
- `[x]` Preserve legacy best-match path behavior for stylesheet and asset matching.
- `[x]` Fall back to full reload when no matching injectable asset is found.
- `[x]` Add browser tests for direct CSS, imported CSS, and image reload behavior.
- `[x]` Add tests proving mixed injectable batches like `["styles.css", "logo.png"]` inject instead of full reloading.
- `[x]` Add tests proving batches with any non-injectable extension still full reload.

Progress notes:

- 2026-05-26: Server now sends CSS reload only for all-CSS batches. Client falls back to full reload when CSS injection is disabled or no matching stylesheet link is found.
- 2026-05-26: Updated parity target to follow legacy `injectFileTypes`, `tagNames`, imported stylesheet reloads, image reloads, inline style URL refreshes, and legacy path matching semantics.
- 2026-05-26: Implemented generic `file-reload` messages, `injectFileTypes` classification, `tagNames`, imported stylesheet rewrites, image cache-busting, inline style URL cache-busting, and best-match path matching.
- 2026-05-26: Added Chromium Playwright coverage for direct stylesheet reloads via public API and HTTP route, imported stylesheet refreshes, `<img src>` cache-busting, inline style image URL cache-busting, and notify overlay rendering.

## 8. UI Built-In Feature Parity

Goal: UI pages should either be functional or removed until implemented.

- `[x]` Sync Options: replace read-only badges with live toggles backed by runtime option updates.
- `[x]` History: track visited URLs, not just file changes.
- `[x]` History: add send-all-to-url, remove, and clear actions.
- `[x]` Connections: add useful client metadata beyond raw user agent where practical.
- `[x]` Connections: restore highlight support through the legacy browser-client highlight overlay behavior.
- `[x]` Network Throttle: port the legacy throttle proxy server with modern dependency-free TCP throttling for current HTTP server mode.
- `[x]` Network Throttle: intentionally omit legacy proxy-mode and HTTPS throttle handling; HTTP server-mode throttling is the supported parity target.
- `[x]` Remote Debug: port legacy overlay grid, CSS outline/depth, no-cache, and latency controls unless explicitly scoped out.
- `[x]` Overlay Grid: port the adjustable CSS overlay and client element injection path.
- `[x]` CSS Outline/Depth: port the legacy pesticide and pesticide-depth style toggles.
- `[x]` Audit the legacy Overview page and port any missing URL, snippet, option, or server-mode behavior.
- `[x]` Audit the legacy Help page and port any missing content or links that shipped by default.
- `[x]` Audit all default shipped UI plugin pages against `.legacy/packages/browser-sync-ui/lib/plugins/` and record any remaining gaps before marking this section complete.
- `[x]` Plugin page: finish the legacy user plugin listing, enable/disable, enable-all, and disable-all behavior backed by the restored plugin system in Section 9.

Progress notes:

- 2026-05-26: Clarified that built-in legacy plugin behavior should be ported for parity unless intentionally removed with a documented product decision.
- 2026-05-26: Sync Options ghost-mode controls are now live toggles backed by the UI WebSocket `options:set` path, including location sync and separate form `inputs`, `toggles`, and `submit` controls.
- 2026-05-26: History now tracks visited browser URLs from client updates and supports send-all-to-url, remove, and clear actions using the legacy `browser:location` path.
- 2026-05-26: Connections now show parsed browser metadata, path, and connected age; highlight actions target a single browser client and toggle the legacy red viewport border overlay.
- 2026-05-26: Remote Debug now ports legacy client file toggles for `pesticide.css` and `pesticide-depth.css`, generic `ui:element:add/remove` browser-client handlers, adjustable overlay grid CSS, no-cache response headers, and latency middleware behavior.
- 2026-05-26: Network Throttle now creates/destroys throttle proxy servers from the UI using the legacy target presets, implemented with modern Node TCP streams instead of the old `stream-throttle` dependency.
- 2026-05-26: Product scope decision: Network Throttle does not need to support legacy proxy-mode or HTTPS throttle handling; keep current HTTP server-mode behavior and tests as the parity target.
- 2026-05-26: The Plugins page is restored as a parity surface with enable/disable message wiring, but it still needs to be backed by the full legacy plugin system behavior now tracked in Section 9.
- 2026-05-26: Overview was audited against the legacy `overview` plugin and now exposes local/external/tunnel/UI URL panels, sync-all actions, server base directories, snippet-mode markup, proxy metadata placeholders for future parity, current connections, and status. The main server now sends UI mode/snippet/base-dir metadata.
- 2026-05-26: Help was audited against the legacy `help` plugin and restored the default BrowserSync help/about topics and reference links while documenting the current rewrite's intentional proxy/HTTPS omission.
- 2026-05-26: Plugins now lists real user plugin registry state from the restored plugin manager and controls active state through the legacy-style configure path.
- 2026-05-26: Final built-in page audit compared the default legacy plugin pages in `.legacy/packages/browser-sync-ui/lib/plugins/`: Overview, Sync Options, History, Plugins, Remote Debug, Help, Network Throttle, and Connections. Non-browser implementation gaps are closed; browser rendering tests remain in Section 10.

## 9. Plugin System Parity

Goal: restore BrowserSync's plugin system behavior, including user/external plugin support, while modernizing internals and avoiding the old dependency graph where practical.

- `[x]` Audit legacy plugin loading and lifecycle behavior in `.legacy/packages/browser-sync/lib/plugins.js`, `.legacy/packages/browser-sync/lib/browser-sync.js`, `.legacy/packages/browser-sync/lib/internal-events.js`, and `.legacy/packages/browser-sync-ui/lib/plugins/plugins/`.
- `[x]` Restore configured plugin loading from BrowserSync options/config, including package/function plugins where legacy supports them.
- `[x]` Restore the user plugin registry exposed to the UI, excluding the built-in UI plugin where legacy excludes it.
- `[x]` Restore plugin activation/configuration events, including `plugins:configure` and equivalent enable/disable state updates.
- `[x]` Restore plugin hooks needed by legacy behavior: page registration, markup/templates, client JavaScript, client events, client files/elements, and server middleware hooks.
- `[x]` Restore plugin-facing server APIs that legacy plugins use, such as `serveFile`, `addMiddleware`, `removeMiddleware`, event emission/listening, and option access/mutation.
- `[x]` Restore UI namespaced event routing used by plugins, matching the legacy `Socket.uiEvent({ namespace, event, data })` pattern.
- `[x]` Back the Plugins UI page with real plugin state from the restored plugin registry.
- `[x]` Add tests with at least one fixture plugin that exercises loading, UI listing, enable/disable, server events, and middleware/file hooks.
- `[x]` Restore or explicitly document legacy `client:events` behavior for plugin-added browser-client relay events.
- `[x]` Restore or explicitly document legacy plugin-provided UI metadata/page behavior, including package `browser-sync:ui` markup/templates/client JS resolution.
- `[x]` Restore or explicitly document legacy plugin option mutation semantics, including `plugins:opts` and reflected UI registry state.
- `[x]` Restore or explicitly document package resolution edge cases: string specs, cwd-relative specs, absolute specs, query options, ESM/CJS/default exports, and package metadata discovery.
- `[x]` Restore or explicitly document legacy hook ordering differences for `files:watch`, `server:middleware`, `client:js`, and `elements`.
- `[x]` Complete deeper compatibility audit for any remaining legacy plugin API surfaces discovered while working through the items above.
- `[x]` Document any legacy plugin API surface intentionally modernized or unsupported only after confirming it is not required for shipped BrowserSync plugin parity.

Progress notes:

- 2026-05-26: External/user plugin support is now explicitly in scope again. Use the legacy implementation as the behavior reference, but modernize the internals and avoid preserving old dependencies unless required for compatibility.
- 2026-05-26: Added `lib/plugins.ts` and `lib/plugin-types.ts` to support legacy-shaped plugin modules, inline function plugins, string/package plugins with query options, `plugins` option parsing, user plugin registry state, `plugins:configure`, `plugins:opts`, namespaced UI events, plugin cleanup tasks, `files:watch`, `server:middleware`, `client:js`, `elements`, and package `browser-sync:ui` metadata. Runtime middleware and `serveFile` now use `@fastify/middie` instead of a custom Fastify request bridge.
- 2026-05-26: Added legacy `client:events` relay support for plugin-added browser-client events. Plugin client event hooks are collected at plugin init like legacy BrowserSync, de-duplicated in plugin order, and relayed to other browser clients without echoing to the sender.
- 2026-05-26: Plugin UI metadata now includes module hook `page` registration plus package `browser-sync:ui` markup, templates, `client:js`, and page metadata. Plugin pages are routed by the UI server and surfaced in the UI state/nav while preserving built-in page routes.
- 2026-05-26: `plugins:opts` now mutates plugin options and broadcasts refreshed plugin registry state to UI clients, matching the legacy `bs.setOption("userPlugins", bs.getUserPlugins())` effect. External `plugins:configure` events also refresh UI state.
- 2026-05-26: Plugin string resolution now covers cwd-relative directories, absolute files, query options, package metadata discovery, ESM/default exports, and CommonJS exports. Configured plugin options override query options as in the restored loader.
- 2026-05-26: Hook order is preserved by iterating configured plugins in registration order for `files:watch`, `server:middleware`, `client:js`, `client:events`, and `elements`; middleware ordering is covered by a server test.
- 2026-05-26: Compatibility audit found no additional default shipped BrowserSync plugin API surface that must remain unsupported. Proxy-mode and HTTPS throttle behavior remain intentionally omitted by product decision in Section 8, not by the plugin API.

## 10. Parity Test Coverage

Goal: lock down the recovered behavior with tests before broad refactors continue.

Browser test direction: standardize new browser-level coverage on Playwright. Use the existing legacy Playwright examples as the first reference, and port applicable legacy Protractor/Selenium and Karma browser-client tests to Playwright rather than carrying forward Selenium, Protractor, Karma, or Cypress. Keep the product decisions from this plan intact: proxy mode and HTTPS-specific behavior remain intentionally omitted unless that scope is reopened later.

- `[x]` Add watcher tests for buffered debounce and mixed file batches.
- `[x]` Add tests for `reloadThrottle`.
- `[x]` Add tests for object watcher `match`, per-watch `options`, `fn`, and configured `watchEvents`.
- `[x]` Add tests for `reload(files)` mixed arrays.
- `[x]` Add tests for legacy HTTP protocol reload with no args, single file args, repeated file args, and missing/unknown method errors.
- `[x]` Add unit tests for mixed injectable batches and non-injectable fallback.
- `[x]` Add stream tests for `match`, `once`, and batch classification.
- `[x]` Add socket tests for pathname sync and options updates.
- `[x]` Add client or browser tests for scroll loop suppression.
- `[x]` Add client or browser tests for element scroll sync and `scrollElementMapping`.
- `[x]` Add socket tests for `scroll:element` relay behavior.
- `[x]` Add client or browser tests for incoming click handling.
- `[x]` Add client or browser tests proving click sync uses legacy `tagName` plus `index` targeting.
- `[x]` Add socket tests for `browser:location` relay behavior.
- `[x]` Add socket tests for `form:submit` and `form:reset` relay behavior.
- `[x]` Add client or browser tests for image and inline style URL injection.
- `[x]` Add client or browser tests for imported stylesheet reloads.
- `[x]` Add UI tests for initial state replay and Sync Options updates.
- `[x]` Add non-browser unit coverage for `lib/ui/app/ws.ts` late-handler `init` replay, status replay, guarded sends, and reconnect/backoff.
- `[x]` Add UI server tests for History send/remove/clear actions.
- `[x]` Add UI server tests for Connections highlight actions.
- `[x]` Add UI server tests for Remote Debug file toggles, overlay grid CSS, no-cache, and latency actions.
- `[x]` Add UI/server tests for Network Throttle create/destroy actions and a working throttle proxy.
- `[x]` Add UI/server tests for Overview and Help built-in page parity after the audit.
- `[x]` Add plugin-system tests for configured plugin loading, plugin registry state, Plugins UI actions, namespaced UI events, middleware hooks, and served client files.
- `[x]` Add plugin-system tests for `client:events`, plugin UI page metadata/routes, `plugins:opts` UI state updates, external `plugins:configure` UI state updates, cwd-relative ESM package plugins, absolute CommonJS plugins, query option merging, and middleware ordering.
- `[x]` Add browser rendering tests for built-in UI pages and browser-client remote-debug DOM injection.
- `[x]` Add Playwright as the browser parity harness with explicit per-test timeouts and scripts that cannot hang indefinitely.
- `[x]` Add an initial Chromium smoke test proving a static HTML page receives the injected BrowserSync client and connects over the browser WebSocket.
- `[x]` Port the legacy top-level Playwright example coverage from `.legacy/tests/examples/`, including direct CSS injection, HTTP-triggered reload, imported stylesheet refresh, image refresh, remote debug CSS injection, and notify overlay visibility.
- `[x]` Port applicable legacy BrowserSync Protractor tests from `.legacy/packages/browser-sync/test/protractor/tests/` to Playwright: scroll sync, click/navigation mirroring, server interactions, snippet injection, base URL handling, and socket script behavior.
- `[x]` Exclude legacy proxy and HTTPS Protractor cases from the port because proxy/HTTPS handling is intentionally omitted in this rewrite.
- `[x]` Port applicable legacy UI Protractor tests from `.legacy/packages/browser-sync-ui/test/client/e2e/tests/` to Playwright: overview/home, history, plugins, remote debug, network throttle, and sync-options behavior.
- `[x]` Review legacy browser-client Karma/Mocha tests under `.legacy/packages/browser-sync-client/test/client-new/` and port browser-dependent behavior to Playwright where real DOM/browser behavior matters; keep pure protocol/state checks as Node tests.

Progress notes:

- 2026-05-26: Added tests in `lib/sockets.test.ts`, `lib/reload-decision.test.ts`, and `lib/watcher.test.ts`.
- 2026-05-26: Updated socket relay fixtures to use the legacy scroll payload shape. Browser-level click and scroll behavior tests are still needed.
- 2026-05-26: Added `lib/ui/server.test.ts` coverage for UI `options:set` updates and UI state broadcasts. Browser rendering tests are still needed for late init replay and visible toggles.
- 2026-05-26: Added server-level `.stream()` tests for `match`, `once`, and mixed-batch full reload classification.
- 2026-05-26: Added server-level HTTP reload tests for modern `POST /__bs/reload` file args and legacy `GET /__browser_sync__?method=reload&args=...` behavior.
- 2026-05-26: Added socket coverage proving `browser:location` relays across clients regardless of pathname, plus option parsing coverage for legacy boolean `ghostMode.forms`.
- 2026-05-26: Added UI/server coverage for Overview mode metadata: snippet-mode initial state includes the snippet, and server-mode initial state includes the served base directory. Browser/component rendering tests for Overview and Help remain skipped by request.
- 2026-05-26: Added socket coverage proving `form:submit` and `form:reset` relay with pathname scoping.
- 2026-05-26: Added socket coverage proving `scroll:element` relays with pathname scoping.
- 2026-05-26: Added server watcher coverage proving `reloadThrottle` suppresses rapid watcher-triggered reload broadcasts.
- 2026-05-26: Added watcher coverage for object watcher default handling, object watcher custom `fn`, and configured `watchEvents` opt-in for add events.
- 2026-05-26: Added UI server coverage for History actions, Connections highlight, Remote Debug file/overlay/no-cache/latency actions, plus server-level coverage for remote debug CSS assets, no-cache headers, and a working Network Throttle proxy.
- 2026-05-26: Added plugin-system fixture coverage for inline plugins, package/string plugins, query/options merging, UI registry state, Plugins UI actions, namespaced UI events, `serveFile`, `addMiddleware`, `removeMiddleware`, middleware hooks, client JS hooks, client element hooks, and cleanup tasks.
- 2026-05-26: Added plugin-system coverage for legacy `client:events` relays, plugin page metadata/routes, reflected `plugins:opts` and external `plugins:configure` UI updates, cwd-relative ESM packages, absolute CommonJS modules, and middleware registration ordering.
- 2026-05-26: Validation passed with `npm run test:lint`, `npm run build`, and `npm run test:node-test` (`--test-timeout=10000`, 111 passing).
- 2026-05-26: Browser parity testing target is now Playwright. Applicable legacy Selenium/Protractor and Karma browser-client behavior should be ported to Playwright rather than preserving old browser-test dependencies; intentionally omitted proxy/HTTPS cases stay excluded.
- 2026-05-26: Added `@playwright/test`, a Chromium-only `playwright.config.ts`, a `browser-tests/` static browser fixture, and a first Playwright smoke test for snippet injection plus browser-client WebSocket connection. The smoke test passes with `npm run test:playwright -- --project=chromium` and `--timeout=10000`. Browser tests intentionally live outside `tests/` so Node's test runner does not discover them.
- 2026-05-26: Expanded Chromium Playwright coverage to 16 browser tests for direct and HTTP-triggered stylesheet injection, imported stylesheet refreshes, image and inline-style image cache-busting, notification overlay rendering, document scroll loop suppression, mapped element scroll, click `tagName + index` targeting, link/navigation mirroring, text/toggle/select/reset/submit form sync, built-in UI page rendering, Sync Options live mutation, History send/remove/clear, Remote Debug DOM injection, Network Throttle UI create/destroy, and plugin UI/page rendering.
- 2026-05-26: Hardened browser-test cleanup by closing browser pages and forcing idle/all HTTP connection shutdown during server/UI `exit()`. Validation passed with `npm run test:playwright -- --project=chromium` (`--timeout=10000`, 16 passing).

## 11. Fastify Route Typing And Hypermedia UI Migration

Goal: strengthen server route typing and simplify the UI by moving from a Preact-first client app to server-rendered Handlebars views enhanced with HTMX 4.

Planning references:

- Fastify type providers: `@fastify/type-provider-json-schema-to-ts` infers request types from inline JSON Schema and must be applied per Fastify encapsulation scope.
- Fastify view rendering: the `point-of-view` repository now documents the `@fastify/view` package, which decorates `reply` with `view` / `viewAsync`, supports Handlebars, root templates, default context, and layouts.
- Handlebars: use escaped `{{expression}}` output by default, reserve triple-stash only for trusted HTML such as legacy plugin markup, and register reusable partials for shared layout/navigation/page fragments.
- HTMX 4 beta: install from npm with `npm install htmx.org@4.0.0-beta4`; serve or bundle the local npm asset instead of relying on a CDN.

Route typing plan:

- `[x]` Audit every `fastify.get`, `fastify.post`, and `fastify.use` integration in `lib/server.ts`, `lib/ui/server.ts`, and plugin/runtime route helpers.
- `[x]` Ensure every Fastify instance and encapsulated Fastify scope uses `.withTypeProvider<JsonSchemaToTsProvider>()`; the main server already does this, but the UI server and any future route modules must also opt in.
- `[x]` Add JSON Schema objects for all fixed Fastify routes, covering `params`, `querystring`, `body`, and `response` where applicable.
- `[x]` Use `as const` route schemas or shared readonly schema constants so `json-schema-to-ts` preserves literal types.
- `[x]` Replace request body/query/path casts in handlers with inferred types from the route schemas.
- `[x]` Add schemas for legacy HTTP reload query params, modern reload/notify bodies, UI action POST bodies, throttle requests, plugin UI event payload envelopes, and static asset response metadata where practical.
- `[x]` For runtime/plugin middleware routes with user-provided handlers, document the boundary and keep typed schemas around the fixed wrapper routes without pretending arbitrary plugin middleware has a known body/response shape.
- `[x]` Add route validation tests for representative invalid payloads and keep existing behavior tests passing.

Handlebars and `@fastify/view` plan:

- `[x]` Install `@fastify/view` and `handlebars`.
- `[x]` Register `@fastify/view` in `lib/ui/server.ts` with `engine: { handlebars }`, a dedicated `root`, a shared layout, and default context for static asset URLs, active nav, server metadata, and version info.
- `[x]` Create `lib/ui/views/` with a layout, page templates, and partials for navigation, connection status, option rows, history rows, plugin rows, remote-debug controls, and network-throttle rows.
- `[x]` Replace `htmlShell()` and hand-built UI HTML strings with `reply.view()` calls for full page routes.
- `[x]` Add partial-rendering routes for HTMX requests so controls can update only the affected page fragment.
- `[x]` Register small Handlebars helpers only where needed, such as equality checks, selected/checked attributes, JSON serialization for safe data attributes, and deterministic class composition.
- `[x]` Keep legacy plugin-provided markup support, but treat it as trusted plugin HTML and isolate it from normal escaped template data.

HTMX 4 beta UI plan:

- `[x]` Install `htmx.org@4.0.0-beta4` from npm and serve or bundle the local asset from `node_modules`; do not use CDN URLs.
- `[x]` Replace Preact-driven UI form actions with HTMX request attributes: Sync Options toggles, History send/remove/clear, Connections highlight, Remote Debug toggles/grid updates, Network Throttle create/destroy, and Plugins enable/disable.
- `[x]` Define server endpoints that return Handlebars-rendered fragments for each HTMX interaction, keeping the same server-side state mutation paths already used by the WebSocket UI.
- `[x]` Preserve live connection state updates without making Preact the default UI layer. Prefer a tiny non-framework script that receives server events and triggers HTMX refreshes, or HTMX extension-based updates if the beta API is stable enough.
- `[x]` Keep the browser-client sync WebSocket separate from UI rendering concerns; this migration only changes the Settings/UI surface.
- `[x]` Re-check HTMX 4 migration details before implementation, especially explicit attribute inheritance and response swap behavior, because the beta can still change.

Preact usage rule:

- `[x]` Treat Preact as opt-in, not the default UI shell.
- `[x]` Remove the current monolithic Preact UI app once the Handlebars/HTMX routes cover the same behavior.
- `[x]` Keep or reintroduce Preact only for a specific component that clearly benefits from functional reactive templating, complex local client state, or high-frequency UI updates that would be awkward with small HTMX fragments.
- `[x]` If such a component is retained, mount it as an isolated island on that component only and document why it is not better as a Handlebars partial plus HTMX behavior.

Migration test plan:

- `[x]` Add non-browser tests proving typed route schemas reject invalid UI/action payloads and accept valid ones.
- `[x]` Add server tests for full-page `reply.view()` routes and HTMX fragment routes.
- `[x]` Add tests proving plugin-provided UI pages and markup still render after the view migration.
- `[x]` Add build checks proving `htmx.org@4.0.0-beta4` is served from npm-managed assets.
- `[x]` Keep all tests under explicit timeouts.

Progress notes:

- 2026-05-26: Added this migration plan after checking the current Fastify type-provider docs, the `@fastify/view` / point-of-view docs, Handlebars docs, HTMX 4 docs, and npm availability for `htmx.org@4.0.0-beta4`.
- 2026-05-26: Implemented route schemas for the main server fixed routes and UI fixed/action routes, moved the UI server to `.withTypeProvider<JsonSchemaToTsProvider>()`, and documented runtime plugin middleware as the intentionally untyped user-handler boundary.
- 2026-05-26: Replaced the Preact UI shell with `@fastify/view` + Handlebars templates under `lib/ui/views/`, including full-page routes, HTMX form action endpoints, and fragment responses for UI actions.
- 2026-05-26: Installed and bundled `htmx.org@4.0.0-beta4` from npm through `lib/ui/client.ts`; removed `preact` and `htm` dependencies and deleted the monolithic Preact component tree.
- 2026-05-26: Preserved the UI WebSocket as a framework-free live update channel that triggers HTMX refresh events, while keeping browser-client sync WebSockets separate from Settings/UI rendering.
- 2026-05-26: Added non-browser coverage for Handlebars page rendering, HTMX action validation, runtime option mutation fragments, npm-bundled HTMX asset serving, and existing plugin UI page/markup behavior after the migration.
- 2026-05-26: Validation passed with `npm run test:lint`, `npm run build`, and `npm run test:node-test` (`--test-timeout=10000`, 113 passing). Browser automation was not run because the required Node REPL browser-control tool was unavailable in this session.

## Recommended Execution Order

1. UI connection stability.
2. Runtime options handshake.
3. Scroll sync loop prevention.
4. Click, form, and navigation sync.
5. File watcher buffering and reload decisions.
6. Reload and stream API semantics.
7. CSS and asset injection parity.
8. UI built-in feature parity.
9. Plugin system parity.
10. Broader parity test coverage and cleanup.
11. Fastify route typing and hypermedia UI migration.

## Key Legacy References

- File event buffering: `.legacy/packages/browser-sync/lib/file-event-handler.js`
- Watcher setup: `.legacy/packages/browser-sync/lib/file-watcher.js`
- Runtime event bridge: `.legacy/packages/browser-sync/lib/internal-events.js`
- Client scroll listener: `.legacy/packages/browser-sync-client/lib/listeners/scroll.listener.ts`
- Scroll loop suppression helper: `.legacy/packages/browser-sync-client/lib/utils.ts`
- Client reload and asset injection: `.legacy/packages/browser-sync-client/lib/vendor/Reloader.ts`
- Sync Options UI: `.legacy/packages/browser-sync-ui/lib/plugins/sync-options/`
- UI client element injection: `.legacy/packages/browser-sync-ui/lib/client-elements.js` and `.legacy/packages/browser-sync-ui/lib/client-js.js`
- Plugin loading and lifecycle: `.legacy/packages/browser-sync/lib/plugins/`
- Plugins UI: `.legacy/packages/browser-sync-ui/lib/plugins/plugins/`
- Network Throttle UI: `.legacy/packages/browser-sync-ui/lib/plugins/network-throttle/`
- Remote Debug and Overlay Grid UI: `.legacy/packages/browser-sync-ui/lib/plugins/remote-debug/`
- Overview UI: `.legacy/packages/browser-sync-ui/lib/plugins/overview/`
- Help UI: `.legacy/packages/browser-sync-ui/lib/plugins/help/`
- Legacy Playwright examples: `.legacy/tests/examples/`
- Legacy BrowserSync Protractor tests: `.legacy/packages/browser-sync/test/protractor/tests/`
- Legacy UI Protractor tests: `.legacy/packages/browser-sync-ui/test/client/e2e/tests/`
- Legacy browser-client Karma tests: `.legacy/packages/browser-sync-client/test/client-new/`
- Fastify type providers: https://fastify.dev/docs/v5.6.x/Reference/Type-Providers/
- `@fastify/view` / point-of-view: https://github.com/fastify/point-of-view
- Handlebars guide: https://handlebarsjs.com/guide/
- HTMX 4 docs: https://four.htmx.org/docs
- HTMX 4 npm install target: `htmx.org@4.0.0-beta4`
