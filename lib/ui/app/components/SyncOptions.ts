import { html } from 'htm/preact'
import type { UiState } from '../../types.ts'

const OPTIONS = [
  { key: 'scroll', label: 'Scroll sync', description: 'Synchronise scroll position across browsers' },
  { key: 'clicks', label: 'Click sync', description: 'Mirror clicks across browsers' },
  { key: 'forms', label: 'Form sync', description: 'Synchronise text inputs, checkboxes, and radio buttons' },
]

export function SyncOptions ({ state: _state }: { state: UiState }) {
  return html`
    <div class="page">
      <h1 class="page__title">Sync Options</h1>
      <div class="card">
        <h2 class="card__title">Ghost Mode</h2>
        <ul class="option-list">
          ${OPTIONS.map(({ key, label, description }) => html`
            <li class="option-item" key=${key}>
              <div class="option-item__text">
                <strong>${label}</strong>
                <span class="option-item__desc">${description}</span>
              </div>
              <span class="badge badge--grey">read-only</span>
            </li>
          `)}
        </ul>
        <p class="hint">Live option toggling coming in a future release.</p>
      </div>
    </div>
  `
}
