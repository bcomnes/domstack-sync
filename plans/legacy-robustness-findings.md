# Legacy Robustness Findings

Goal: track the robustness gaps found while comparing the modernized implementation against the legacy BrowserSync codebase. These are ordered by severity and should be fixed with regression tests that exercise legacy/public API shapes, not only already-normalized internal options.

Progress key:

- `[x]` Finding documented
- `[ ]` Reproduce with a failing test
- `[ ]` Implement fix
- `[ ]` Validate fix

## Critical

### Public `createServer()` Accepts Unnormalized Options

- Severity: Critical
- Finding: `createServer` is exported as the public API but expects already-normalized `BsOptions`. README/UI examples call `createServer({ server, files, port })`, which can crash because defaults like `plugins` and `cwd` are missing.
- Modern references: `index.ts`, `lib/server.ts`, `lib/plugins.ts`, `README.md`
- Status:
  - `[x]` Finding documented
  - `[x]` Add a failing test for README-style `createServer({ server, files, port })`
  - `[x]` Normalize public API options before server startup
  - `[x]` Validate README/programmatic API examples

### Legacy Option Normalization Is Incomplete

- Severity: Critical
- Finding: legacy option shapes are not normalized correctly. `ghostMode: false` becomes all-true, `server: true` survives until `path.resolve()` throws, and `files: 'src/**/*.css'` stays a string instead of an array.
- Modern reference: `lib/options.ts`
- Legacy references: `.legacy/packages/browser-sync/lib/cli/transforms/handleGhostModeOption.ts`, `.legacy/packages/browser-sync/lib/cli/transforms/handleServerOption.ts`, `.legacy/packages/browser-sync/lib/cli/cli-options.ts`
- Status:
  - `[x]` Finding documented
  - `[x]` Add failing tests for `ghostMode: false`, `server: true`, and string `files`
  - `[x]` Port or reimplement the missing normalization behavior
  - `[x]` Validate CLI and programmatic option paths use the same normalization

### Snippet Mode Uses Relative Client URLs

- Severity: Critical
- Finding: snippet mode is broken for external pages. The generated snippet loads `/__bs/client.js` relative to the page origin, and the client connects to `location.host`, so pasted snippets on another app attempt to contact that app's server instead of domstack-sync.
- Modern references: `lib/snippet.ts`, `lib/client/index.ts`
- Legacy references: `.legacy/packages/browser-sync/lib/connect-utils.js`, `.legacy/packages/browser-sync/templates/connector.tmpl`
- Status:
  - `[x]` Finding documented
  - `[x]` Add a failing test for snippet HTML pasted into a different origin
  - `[x]` Generate absolute script/socket configuration for snippet mode
  - `[x]` Validate server mode still works with relative/injected client defaults

## High

### `bs.reload('style.css')` Crashes

- Severity: High
- Finding: modern `reload` only handles `string[]`, while legacy accepts a single string.
- Modern references: `lib/server.ts`, `lib/reload-decision.ts`
- Legacy reference: `.legacy/packages/browser-sync/lib/public/reload.js`
- Status:
  - `[x]` Finding documented
  - `[x]` Add a failing public API test for `bs.reload('style.css')`
  - `[x]` Normalize single-string reload input to an array
  - `[x]` Validate CSS inject and full reload decisions for string and array inputs

### Server Mode Parity Is Narrow

- Severity: High
- Finding: modern `server` is effectively a single string root. Legacy supported `server: true`, `baseDir` arrays, `routes`, `directory`, `index`, middleware, and SPA fallback.
- Modern references: `lib/options.ts`, `lib/server.ts`
- Legacy reference: `.legacy/packages/browser-sync/lib/server/static-server.js`
- Status:
  - `[x]` Finding documented
  - `[ ]` Decide which legacy server shapes are in-scope for this modernization
  - `[ ]` Add failing tests for selected in-scope shapes
  - `[ ]` Implement selected server option support incrementally
  - `[ ]` Document intentionally omitted legacy server features

### Ghost Path Filtering Is Less Robust

- Severity: High
- Finding: modern sockets filter ghost events server-side using cached client pathnames, but clients only send path info on connect. Legacy broadcasted ghost events and let each browser compare against its live `window.location.pathname`, which is more robust for SPA/history navigation.
- Modern references: `lib/sockets.ts`, `lib/client/index.ts`
- Legacy references: `.legacy/packages/browser-sync/lib/sockets.ts`, `.legacy/packages/browser-sync-client/lib/messages/ClickEvent.ts`
- Status:
  - `[x]` Finding documented
  - `[x]` Add a browser test for SPA/history navigation before a ghost event
  - `[x]` Choose server broadcast/client filter or more frequent client path updates
  - `[x]` Implement the chosen path-scope behavior
  - `[x]` Validate scroll, click, form, and location sync remain scoped correctly

## Medium

### Watcher Parity Regressions

- Severity: Medium
- Finding: `watchOptions.cwd` is always overwritten by top-level `cwd`; legacy only filled it when missing. Also object watcher `fn` is not bound to the public instance, while legacy bound it.
- Modern reference: `lib/watcher.ts`
- Legacy references: `.legacy/packages/browser-sync/lib/cli/transforms/addCwdToWatchOptions.ts`, `.legacy/packages/browser-sync/lib/file-watcher.js`
- Status:
  - `[x]` Finding documented
  - `[x]` Add failing tests for explicit `watchOptions.cwd`
  - `[x]` Add failing tests for object watcher `fn` `this` binding
  - `[x]` Preserve explicit watcher cwd and bind callbacks to the public instance where expected
  - `[x]` Validate existing watcher debounce/batch behavior still passes

### Generated Config Is ESM But Named `.js`

- Severity: Medium
- Finding: `domstack-sync init` writes ESM `export default` to `bs-config.js`, then the loader swallows all import errors as "no config file". In non-ESM projects, the generated config is silently ignored.
- Modern references: `lib/cli.ts`
- Legacy reference: `.legacy/packages/browser-sync/templates/cli-template.js`
- Status:
  - `[x]` Finding documented
  - `[x]` Add a failing test for generated CommonJS-compatible `bs-config.js`
  - `[x]` Decide whether generated config should be CommonJS, `.mjs`, or loaded with clearer error handling
  - `[x]` Stop swallowing config import errors that are not "file missing"
  - `[x]` Validate `init` followed by CLI startup uses the generated config

### CLI File Handling Is Weaker Than Documented

- Severity: Medium
- Finding: README-style `--files a b` only captures `a`; `b` becomes a positional. `reload --files a.css` is parsed but ignored.
- Modern references: `lib/cli.ts`
- Legacy reference: `.legacy/packages/browser-sync/lib/cli/command.reload.js`
- Status:
  - `[x]` Finding documented
  - `[x]` Add failing CLI parse tests for repeated/trailing `--files` values
  - `[x]` Add failing CLI reload test for `reload --files a.css`
  - `[x]` Fix file argument parsing and reload command plumbing
  - `[x]` Validate README CLI examples

## Low/Medium

### Click Sync Uses Bubble Phase

- Severity: Low/Medium
- Finding: click sync listens in the bubble phase, so app code that stops propagation prevents sync. Legacy used capture.
- Modern reference: `lib/client/index.ts`
- Legacy reference: `.legacy/packages/browser-sync-client/lib/listeners/clicks.listener.ts`
- Status:
  - `[x]` Finding documented
  - `[x]` Add a browser test where page code stops click propagation
  - `[x]` Move click listener to capture phase if parity is desired
  - `[x]` Validate existing click mirroring still passes

## Cross-Cutting Test Gap

- `[x]` Current `npm run test:tsc` and `npm run test:node-test` passed when these findings were recorded.
- `[x]` Existing tests mostly cover already-normalized happy paths.
- `[x]` Add a focused legacy-shape regression suite for public API, CLI, snippet mode, watcher options, and browser sync edge cases.
- `[x]` Run `npm run test:tsc`, `npm run test:node-test`, and targeted Playwright tests after each fix batch.

## Recommended Fix Order

1. Public `createServer()` normalization.
2. Legacy option normalization.
3. Snippet mode absolute client/socket configuration.
4. `bs.reload('style.css')` input normalization.
5. CLI file/reload argument handling.
6. Generated config format and config-loader errors.
7. Watcher cwd/callback parity.
8. Ghost path filtering robustness.
9. Broader server-mode shapes.
10. Click capture listener parity.
