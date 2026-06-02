import html from 'fragtml'
import type { PageTemplate } from '../types.ts'

export const helpPageTemplate: PageTemplate = () => {
  return html`
    <div class="page">
      <h1 class="page__title">Help</h1>
      <div class="card">
        <h2 class="card__title">Help / About</h2>
        <div class="help-section">
          <p class="lede">
            domstack-sync is a dependency-minimized live-reload server for static sites and local development workflows.
          </p>
          <p class="hint">Use this panel to inspect connected browsers, file changes, sync options, and debugging tools for the current server.</p>
        </div>
      </div>
      <div class="card">
        <h2 class="card__title">Common questions</h2>
        <dl class="definition-list">
          <dt>Why is it not connecting?</dt>
          <dd>Most connection issues happen when the page does not have a <code>body</code> tag. domstack-sync injects its client script near the closing body tag.</dd>
          <dt>Which mode should I use?</dt>
          <dd>
            <ul>
              <li>Use server mode for simple HTML, CSS, and JavaScript files.</li>
              <li>Use snippet mode when another local server owns the response path and you want to paste the client script into a page manually.</li>
            </ul>
          </dd>
          <dt>Where can I report an issue?</dt>
          <dd>Use the project issue tracker for bugs, feature requests, and documentation gaps.</dd>
        </dl>
        <p class="hint">
          Project reference:
          <a href="https://github.com/bcomnes/domstack-sync" target="_blank">repository</a>,
          <a href="https://github.com/bcomnes/domstack-sync/issues" target="_blank">issues</a>.
        </p>
      </div>
      <div class="card">
        <h2 class="card__title">Quick start</h2>
        <pre class="code-block">npx domstack-sync --server . --files '**/*.css' '**/*.html'</pre>
      </div>
      <div class="card">
        <h2 class="card__title">CLI options</h2>
        <dl class="definition-list">
          <dt><code>--server &lt;dir&gt;</code></dt>
          <dd>Serve a directory of static files</dd>
          <dt><code>--files &lt;glob&gt;</code></dt>
          <dd>Glob patterns to watch for changes (repeatable)</dd>
          <dt><code>--port &lt;n&gt;</code></dt>
          <dd>Port to listen on (default: 3000)</dd>
          <dt><code>--no-ui</code></dt>
          <dd>Disable this control panel</dd>
          <dt><code>--no-notify</code></dt>
          <dd>Disable the browser notification overlay</dd>
          <dt><code>--no-ghost-mode</code></dt>
          <dd>Disable scroll/click/form synchronisation</dd>
          <dt><code>--cors</code></dt>
          <dd>Enable CORS headers</dd>
        </dl>
      </div>
      <div class="card">
        <h2 class="card__title">Programmatic API</h2>
        <pre class="code-block">import { createServer } from '@domstack/sync'

const sync = await createServer({
  server: './public',
  files: ['**/*.css', '**/*.html'],
})

sync.reload()           // trigger full reload
sync.reload(['a.css'])  // CSS inject
sync.notify('Updated')  // overlay message
await sync.exit()       // shutdown</pre>
      </div>
    </div>
  `
}
