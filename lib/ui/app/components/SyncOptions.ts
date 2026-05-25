import { html } from 'htm/preact'
import type { UiState } from '../../types.ts'
import type { WsClient } from '../ws.ts'

const OPTIONS = [
  { kind: 'ghost', key: 'scroll', label: 'Scroll sync', description: 'Synchronise scroll position across browsers' },
  { kind: 'ghost', key: 'clicks', label: 'Click sync', description: 'Mirror clicks across browsers' },
  { kind: 'ghost', key: 'location', label: 'Location sync', description: 'Send connected browsers to the same URL' },
  { kind: 'form', key: 'inputs', label: 'Text input sync', description: 'Synchronise input and textarea key changes' },
  { kind: 'form', key: 'toggles', label: 'Toggle sync', description: 'Synchronise checkbox, radio, and select changes' },
  { kind: 'form', key: 'submit', label: 'Submit sync', description: 'Synchronise form submit and reset actions' },
] as const

export function SyncOptions ({ state, ws }: { state: UiState; ws: WsClient }) {
  function updateGhostMode (option: typeof OPTIONS[number], enabled: boolean): void {
    if (option.kind === 'form') {
      ws.send({ type: 'options:set', data: { ghostMode: { forms: { [option.key]: enabled } } } })
      return
    }
    ws.send({ type: 'options:set', data: { ghostMode: { [option.key]: enabled } } })
  }

  function isChecked (option: typeof OPTIONS[number]): boolean {
    if (option.kind === 'form') return state.options.ghostMode.forms[option.key]
    return state.options.ghostMode[option.key]
  }

  return html`
    <div class="page">
      <h1 class="page__title">Sync Options</h1>
      <div class="card">
        <h2 class="card__title">Ghost Mode</h2>
        <ul class="option-list">
          ${OPTIONS.map((option) => html`
            <li class="option-item" key=${`${option.kind}:${option.key}`}>
              <div class="option-item__text">
                <strong>${option.label}</strong>
                <span class="option-item__desc">${option.description}</span>
              </div>
              <label class="toggle">
                <input
                  class="toggle__input"
                  type="checkbox"
                  checked=${isChecked(option)}
                  onChange=${(event: Event) => updateGhostMode(option, (event.currentTarget as HTMLInputElement).checked)}
                />
                <span class="toggle__track">
                  <span class="toggle__thumb"></span>
                </span>
              </label>
            </li>
          `)}
        </ul>
      </div>
    </div>
  `
}
