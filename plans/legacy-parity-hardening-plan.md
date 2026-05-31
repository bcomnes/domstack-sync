# Legacy Parity Hardening Plan

Goal: close the remaining robustness gaps found by comparing the modern TypeScript implementation against `.legacy`, while preserving the intentionally dropped proxy/tunnel/HTTPS scope unless a task explicitly says otherwise.

Execution rule for every fix:

- `[ ]` Add a focused regression test that describes the legacy behavior.
- `[ ]` Run the targeted test and verify it fails for the expected reason.
- `[ ]` Implement the fix.
- `[ ]` Rerun the targeted test and verify it passes.
- `[ ]` Rerun the relevant broader suite.

Status legend:

- `[ ]` Not started
- `[~]` In progress
- `[x]` Done
- `[!]` Blocked or intentionally deferred

## Progress Summary

| Area | Status | Notes |
|---|---:|---|
| Legacy server option shapes | `[x]` | Object/list server options now normalize and serve baseDir arrays, routes, custom index, and single-root directory listing. |
| Snippet injection controls | `[x]` | `snippet:false`, custom rules, whitelist/blacklist/ignorePaths, duplicate prevention, and rewrite rules are wired through options, injector, and server delivery. |
| Snippet-mode client asset origins | `[x]` | Client-added root-relative CSS/JS now resolve against the BrowserSync script origin while page-relative assets still resolve against the page. |
| Public reload operators and stream arg | `[x]` | Public reload paths now honor delay/throttle/debounce, aggregate debounced file args, and support `reload({ stream: true })`. |
| Runtime middleware route semantics | `[x]` | `override:true` middleware keeps prefix matching; exact matching is limited to internal single-file routes. |
| Snippet-mode history URLs | `[x]` | Snippet-mode history stores full client `href` values and sends URL-only browser location messages. |
| CLI/watch convenience parity | `[x]` | Bare `--server`, `--watch`, `--ignore`, server-root watch expansion, and legacy default ignore patterns are restored. |
| `fragtml@0.0.4` upgrade | `[x]` | Dependency updated to exact `0.0.4`; changelog breaking type-export move handled by using `fragtml/types.js`. |
| Incremental port fallback | `[!]` | Intentionally deferred; current ephemeral fallback is acceptable. |

## 1. Legacy Server Option Shapes

- Severity: High
- Modern references: `lib/options.ts`, `lib/server.ts`
- Legacy references: `.legacy/packages/browser-sync/lib/cli/transforms/handleServerOption.ts`, `.legacy/packages/browser-sync/lib/server/static-server.js`
- Target behavior:
  - Accept `server: true`, string, string array, and object forms.
  - Object `server.baseDir` may be string or string array.
  - `server.routes` mounts extra static directories at URL prefixes.
  - `server.index` controls static index lookup.
  - `server.directory` provides directory listing behavior or a practical modern equivalent.
- TDD progress:
  - `[x]` Failing test added
  - `[x]` Failure verified
  - `[x]` Fix implemented
  - `[x]` Targeted test passing
  - `[x]` Broader suite passing

## 2. Snippet Injection Controls

- Severity: High
- Modern reference: `lib/injector.ts`
- Legacy references: `.legacy/packages/browser-sync/lib/snippet.js`, `.legacy/packages/browser-sync/lib/server/utils.js`
- Target behavior:
  - `snippet: false` disables injection.
  - `snippetOptions.rule.match` and `snippetOptions.rule.fn` control placement.
  - `snippetOptions.whitelist` / `blacklist` filter URLs.
  - Injection happens once per response.
  - `rewriteRules` are applied in addition to snippet injection where practical.
- TDD progress:
  - `[x]` Failing test added
  - `[x]` Failure verified
  - `[x]` Fix implemented
  - `[x]` Targeted test passing
  - `[x]` Broader suite passing

## 3. Snippet-Mode Client Asset Origins

- Severity: High
- Modern references: `lib/client/handlers.ts`, `lib/protocol.ts`, `lib/server.ts`
- Legacy reference: `.legacy/packages/browser-sync-ui/lib/client-js.js`
- Target behavior:
  - Browser clients know the sync server origin.
  - `ui:element:add` CSS/JS elements with root-relative `src` resolve against the sync server origin.
  - Server mode continues to work with page-relative/root-relative behavior.
- TDD progress:
  - `[x]` Failing test added
  - `[x]` Failure verified
  - `[x]` Fix implemented
  - `[x]` Targeted test passing
  - `[x]` Broader suite passing

## 4. Public Reload Operators And Stream Arg

- Severity: High
- Modern reference: `lib/server.ts`
- Legacy references: `.legacy/packages/browser-sync/lib/public/reload.js`, `.legacy/packages/browser-sync/lib/file-event-handler.js`
- Target behavior:
  - Public `reload()` honors `reloadDelay`, `reloadThrottle`, and `reloadDebounce`.
  - `reload({ stream: true, ...opts })` returns a stream.
  - Existing file reload classification remains shared with watcher and stream paths.
- TDD progress:
  - `[x]` Failing test added
  - `[x]` Failure verified
  - `[x]` Fix implemented
  - `[x]` Targeted test passing
  - `[x]` Broader suite passing

## 5. Runtime Middleware Route Semantics

- Severity: Medium
- Modern reference: `lib/server.ts`
- Legacy reference: `.legacy/packages/browser-sync/lib/browser-sync.js`
- Target behavior:
  - `override` should not make a mounted route exact-only.
  - Middleware registered at `/prefix` should still handle `/prefix/child` unless the underlying framework route match would not.
- TDD progress:
  - `[x]` Failing test added
  - `[x]` Failure verified
  - `[x]` Fix implemented
  - `[x]` Targeted test passing
  - `[x]` Broader suite passing

## 6. Snippet-Mode History URLs

- Severity: Medium
- Modern reference: `lib/ui/server.ts`
- Legacy reference: `.legacy/packages/browser-sync-ui/lib/plugins/history/history.js`
- Target behavior:
  - Server/proxy-style modes store path-only history.
  - Snippet mode stores full external `href` values.
  - History send-all still generates the correct `browser:location` payload.
- TDD progress:
  - `[x]` Failing test added
  - `[x]` Failure verified
  - `[x]` Fix implemented
  - `[x]` Targeted test passing
  - `[x]` Broader suite passing

## 7. CLI/Watch Convenience Parity

- Severity: Medium
- Modern references: `lib/cli.ts`, `lib/options.ts`, `lib/watcher.ts`, `lib/server.ts`
- Legacy references: `.legacy/packages/browser-sync/cli-options/opts.start.json`, `.legacy/packages/browser-sync/lib/cli/transforms/addToFilesOption.ts`, `.legacy/packages/browser-sync/lib/cli/transforms/addDefaultIgnorePatterns.ts`
- Target behavior:
  - Bare `--server` serves cwd.
  - `watch: true` watches server/static roots.
  - `ignore` appends to watcher ignored patterns.
  - Watch mode applies legacy default ignore patterns for common dependency/editor folders.
- TDD progress:
  - `[x]` Failing test added
  - `[x]` Failure verified
  - `[x]` Fix implemented
  - `[x]` Targeted test passing
  - `[x]` Broader suite passing

## 8. `fragtml@0.0.4` Upgrade

- Severity: Maintenance
- Modern references: `package.json`, `package-lock.json`, `lib/ui/templates/*`
- Target behavior:
  - Read the `0.0.4` changelog before updating.
  - Use `fragtml` version `0.0.4`.
  - Move type imports to the public `fragtml/types.js` export.
  - TypeScript passes with the updated `fragtml` types.
  - Existing UI rendering tests continue to pass.
- TDD progress:
  - `[x]` Upgrade dependency
  - `[x]` Changelog reviewed
  - `[x]` Type compatibility verified with `npm run test:tsc`
  - `[x]` Type fixes implemented
  - `[x]` Typecheck passing
  - `[x]` Relevant tests passing

## 9. Incremental Port Fallback

- Severity: Low/Medium
- Modern reference: `lib/ports.ts`
- Legacy reference: `.legacy/packages/browser-sync/lib/utils.ts`
- Status: intentionally deferred per product decision.
- Target behavior:
  - Try requested port first.
  - If busy, scan upward for a bounded range.
  - Only fall back to an OS-assigned ephemeral port after the scan fails.
- TDD progress:
  - `[!]` Failing test added
  - `[!]` Failure verified
  - `[!]` Fix implemented
  - `[!]` Targeted test passing
  - `[!]` Broader suite passing
