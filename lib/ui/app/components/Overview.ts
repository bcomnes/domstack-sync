import { html } from 'htm/preact'
import type { UiState } from '../../types.ts'

export function Overview ({ state }: { state: UiState }) {
  return html`
    <div class="page">
      <h1 class="page__title">Overview</h1>
      <div class="card">
        <h2 class="card__title">Access URLs</h2>
        <table class="url-table">
          <tbody>
            <tr>
              <td class="url-table__label">Local</td>
              <td><a href=${state.serverUrl} target="_blank" class="url-link">${state.serverUrl}</a></td>
            </tr>
            <tr>
              <td class="url-table__label">Network</td>
              <td><a href="http://${state.localIp}:${state.port}" target="_blank" class="url-link">http://${state.localIp}:${state.port}</a></td>
            </tr>
            <tr>
              <td class="url-table__label">UI</td>
              <td><a href=${state.uiUrl} target="_blank" class="url-link">${state.uiUrl}</a></td>
            </tr>
          </tbody>
        </table>
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
