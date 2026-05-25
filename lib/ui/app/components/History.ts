import { html } from 'htm/preact'
import type { UiState } from '../../types.ts'

function formatTime (ts: number): string {
  return new Date(ts).toLocaleTimeString()
}

export function History ({ state }: { state: UiState }) {
  return html`
    <div class="page">
      <h1 class="page__title">History</h1>
      <div class="card">
        <h2 class="card__title">File changes</h2>
        ${state.history.length === 0
          ? html`<p class="empty">No file changes detected yet.</p>`
          : html`
            <ul class="history-list">
              ${state.history.map((entry, i) => html`
                <li class="history-item" key=${i}>
                  <code class="history-item__path">${entry.path}</code>
                  <span class="history-item__meta">
                    <span class="badge badge--grey">${entry.event}</span>
                    ${formatTime(entry.timestamp)}
                  </span>
                </li>
              `)}
            </ul>
          `}
      </div>
    </div>
  `
}
