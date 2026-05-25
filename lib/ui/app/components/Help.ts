import { html } from 'htm/preact'

export function Help () {
  return html`
    <div class="page">
      <h1 class="page__title">Help</h1>
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
        <pre class="code-block">${`import { createServer } from '@domstack/sync'

const bs = await createServer({
  server: './public',
  files: ['**/*.css', '**/*.html'],
})

bs.reload()           // trigger full reload
bs.reload(['a.css'])  // CSS inject
bs.notify('Updated')  // overlay message
await bs.exit()       // shutdown`}</pre>
      </div>
    </div>
  `
}
