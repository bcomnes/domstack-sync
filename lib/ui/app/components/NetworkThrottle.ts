import { html } from 'htm/preact'
import type { UiState } from '../../types.ts'

export function NetworkThrottle ({ state: _state }: { state: UiState }) {
  return html`
    <div class="page">
      <h1 class="page__title">Network Throttle</h1>
      <div class="card">
        <h2 class="card__title">Bandwidth simulation</h2>
        <p class="hint">Network throttle controls are not yet implemented.</p>
      </div>
    </div>
  `
}
