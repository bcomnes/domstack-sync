import html from 'fragtml'
import type { ConnectionDisplay } from '../types.ts'
import type { HtmlResult } from 'fragtml/types.js'

export function connectionListTemplate (connections: ConnectionDisplay[], returnTo: string): HtmlResult {
  if (!connections.length) return html`<p class="empty">No browsers connected yet.</p>`

  return html`
    <ul class="connection-list">
      ${connections.map(client => html`
        <li class="connection-item">
          <div class="connection-item__main">
            <div>
              <div class="connection-item__browser">${client.browserLabel}</div>
              <div class="connection-item__ua">${client.ua}</div>
            </div>
            <form method="post" action="/actions/connections/highlight" hx-post="/actions/connections/highlight" hx-target="#main" hx-swap="innerHTML">
              <input type="hidden" name="id" value="${client.id}">
              <input type="hidden" name="returnTo" value="${returnTo}">
              <button class="button button--subtle" type="submit">Highlight</button>
            </form>
          </div>
          <div class="connection-item__meta">
            <code>${client.id}</code>
            <code>${client.path}</code>
            <span>${client.connectedAgo}</span>
          </div>
        </li>
      `)}
    </ul>
  `
}
