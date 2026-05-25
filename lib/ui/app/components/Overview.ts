import { html } from 'htm/preact'
import type { UiState } from '../../types.ts'
import type { WsClient } from '../ws.ts'

interface UrlInfo {
  title: string
  tagline: string
  url: string
  sync: boolean
}

function timeAgo (ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

function getUrlPath (url: string, fallback: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

export function Overview ({ state, ws }: { state: UiState; ws: WsClient }) {
  const externalUrl = `http://${state.localIp}:${state.port}`
  const urls: UrlInfo[] = [
    {
      title: 'Local',
      tagline: 'URL for the machine running this server',
      url: state.serverUrl,
      sync: state.mode !== 'snippet',
    },
    {
      title: 'External',
      tagline: 'Other devices on the same network',
      url: externalUrl,
      sync: state.mode !== 'snippet',
    },
    ...(state.tunnelUrl
      ? [{
          title: 'Tunnel',
          tagline: 'Public URL for remote devices',
          url: state.tunnelUrl,
          sync: state.mode !== 'snippet',
        }]
      : []),
    {
      title: 'UI',
      tagline: 'Control panel for this BrowserSync instance',
      url: state.uiUrl,
      sync: false,
    },
  ]

  return html`
    <div class="page">
      <h1 class="page__title">Overview</h1>
      <div class="card">
        <h2 class="card__title">Access URLs</h2>
        <ul class="url-list">
          ${urls.map(item => html`
            <li class="url-item" key=${item.title}>
              <div class="url-item__body">
                <div class="url-item__title">${item.title}</div>
                <div class="url-item__tagline">${item.tagline}</div>
                <a href=${item.url} target="_blank" class="url-link">${item.url}</a>
              </div>
              <div class="url-item__actions">
                <a class="button button--subtle" href=${item.url} target="_blank">New tab</a>
                ${item.sync && html`
                  <button class="button button--subtle" type="button" onClick=${() => ws.send({ type: 'history:send-all', path: getUrlPath(item.url, '/') })}>Sync all</button>
                `}
              </div>
            </li>
          `)}
        </ul>
      </div>
      ${state.mode === 'server' && html`
        <div class="card">
          <h2 class="card__title">Serving files from</h2>
          ${state.serverBaseDirs.length === 0
            ? html`<p class="empty">No server base directory is configured.</p>`
            : html`
              <ul class="basic-list">
                ${state.serverBaseDirs.map(dir => html`<li key=${dir}><code>${dir}</code></li>`)}
              </ul>
            `}
        </div>
      `}
      ${state.mode === 'proxy' && state.proxyTarget && html`
        <div class="card">
          <h2 class="card__title">Proxying</h2>
          <a href=${state.proxyTarget} target="_blank" class="url-link">${state.proxyTarget}</a>
        </div>
      `}
      ${state.mode === 'snippet' && html`
        <div class="card">
          <h2 class="card__title">Snippet</h2>
          <p class="lede">Place this snippet before the closing <code>&lt;/body&gt;</code> tag in your website.</p>
          ${state.snippet
            ? html`<pre class="code-block">${state.snippet}</pre>`
            : html`<p class="empty">No snippet is available for this instance.</p>`}
        </div>
      `}
      <div class="card">
        <h2 class="card__title">Current Connections</h2>
        ${state.connections.length === 0
          ? html`<p class="empty">No browsers connected yet.</p>`
          : html`
            <ul class="connection-list">
              ${state.connections.map(c => html`
                <li class="connection-item" key=${c.id}>
                  <div class="connection-item__main">
                    <div>
                      <div class="connection-item__browser">${c.browser.name}${c.browser.version ? ` ${c.browser.version}` : ''}</div>
                      <div class="connection-item__ua">${c.ua}</div>
                    </div>
                    <button class="button button--subtle" type="button" onClick=${() => ws.send({ type: 'connection:highlight', id: c.id })}>Highlight</button>
                  </div>
                  <div class="connection-item__meta">
                    <code>${c.id}</code>
                    <code>${c.path}</code>
                    <span>${timeAgo(c.connectedAt)}</span>
                  </div>
                </li>
              `)}
            </ul>
          `}
      </div>
      <div class="card">
        <h2 class="card__title">Status</h2>
        <p class="status-line">
          <span class="badge badge--green">Running</span>
          ${state.connections.length} browser${state.connections.length === 1 ? '' : 's'} connected
        </p>
      </div>
    </div>
  `
}
