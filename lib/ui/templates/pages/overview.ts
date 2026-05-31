import html from 'fragtml'
import { connectionListTemplate } from '../components/connection-list.ts'
import { syncAllFormTemplate } from '../components/forms.ts'
import type { UiTemplateContext } from '../types.ts'
import type { HtmlResult } from 'fragtml/types.js'

export function overviewPageTemplate (context: UiTemplateContext): HtmlResult {
  return html`
    <div class="page">
      <h1 class="page__title">Overview</h1>
      <div class="card">
        <h2 class="card__title">Access URLs</h2>
        <ul class="url-list">
          ${context.urls.map(url => html`
            <li class="url-item">
              <div class="url-item__body">
                <div class="url-item__title">${url.title}</div>
                <div class="url-item__tagline">${url.tagline}</div>
                <a href="${url.url}" target="_blank" class="url-link">${url.url}</a>
              </div>
              <div class="url-item__actions">
                <a class="button button--subtle" href="${url.url}" target="_blank">New tab</a>
                ${url.sync ? syncAllFormTemplate(url.path, '/') : null}
              </div>
            </li>
          `)}
        </ul>
      </div>

      ${context.serverBaseDirs.length
        ? html`
          <div class="card">
            <h2 class="card__title">Serving files from</h2>
            <ul class="basic-list">
              ${context.serverBaseDirs.map(dir => html`<li><code>${dir}</code></li>`)}
            </ul>
          </div>
        `
        : null}

      ${context.proxyTarget
        ? html`
          <div class="card">
            <h2 class="card__title">Proxying</h2>
            <a href="${context.proxyTarget}" target="_blank" class="url-link">${context.proxyTarget}</a>
          </div>
        `
        : null}

      ${context.snippet
        ? html`
          <div class="card">
            <h2 class="card__title">Snippet</h2>
            <p class="lede">Place this snippet before the closing <code>&lt;/body&gt;</code> tag in your website.</p>
            <pre class="code-block">${context.snippet}</pre>
          </div>
        `
        : null}

      <div class="card">
        <h2 class="card__title">Current Connections</h2>
        ${connectionListTemplate(context.connectionsDisplay, '/')}
      </div>

      <div class="card">
        <h2 class="card__title">Status</h2>
        <p class="status-line">
          <span class="badge badge--green">Running</span>
          ${context.connections.length} browser(s) connected
        </p>
      </div>
    </div>
  `
}
