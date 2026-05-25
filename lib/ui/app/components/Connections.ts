import { html } from 'htm/preact'
import type { UiState } from '../../types.ts'
import type { WsClient } from '../ws.ts'

function timeAgo (ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}

export function Connections ({ state, ws }: { state: UiState; ws: WsClient }) {
  return html`
    <div class="page">
      <h1 class="page__title">Connections</h1>
      <div class="card">
        <h2 class="card__title">${state.connections.length} connected</h2>
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
    </div>
  `
}
