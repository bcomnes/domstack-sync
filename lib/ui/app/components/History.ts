import { html } from 'htm/preact'
import type { UiState } from '../../types.ts'
import type { WsClient } from '../ws.ts'

export function History ({ state, ws }: { state: UiState; ws: WsClient }) {
  function localUrl (path: string): string {
    return new URL(path, state.serverUrl).href
  }

  return html`
    <div class="page">
      <h1 class="page__title">History</h1>
      <div class="card">
        <div class="card__header">
          <h2 class="card__title">Visited URLs</h2>
          ${state.history.length > 0 && html`
            <button class="button button--subtle" type="button" onClick=${() => ws.send({ type: 'history:clear' })}>Clear all</button>
          `}
        </div>
        ${state.history.length === 0
          ? html`<p class="empty">Pages opened in connected browsers will appear here.</p>`
          : html`
            <ul class="history-list">
              ${state.history.map((entry) => html`
                <li class="history-item" key=${entry.key}>
                  <a class="history-item__path" href=${localUrl(entry.path)} target="_blank">${entry.path}</a>
                  <span class="history-item__actions">
                    <button class="button button--subtle" type="button" onClick=${() => ws.send({ type: 'history:send-all', path: entry.path })}>Sync all</button>
                    <button class="button button--icon" type="button" title="Remove" onClick=${() => ws.send({ type: 'history:remove', path: entry.path })}>x</button>
                  </span>
                </li>
              `)}
            </ul>
          `}
      </div>
    </div>
  `
}
