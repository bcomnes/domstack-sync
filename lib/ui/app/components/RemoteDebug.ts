import { html } from 'htm/preact'
import type { OverlayGridState, UiState } from '../../types.ts'
import type { WsClient } from '../ws.ts'

export function RemoteDebug ({ state, ws }: { state: UiState; ws: WsClient }) {
  const remoteDebug = state.remoteDebug

  function updateGrid<K extends keyof OverlayGridState> (key: K, value: OverlayGridState[K]): void {
    ws.send({ type: 'remote-debug:overlay-grid:update', data: { [key]: value } })
  }

  return html`
    <div class="page">
      <h1 class="page__title">Remote Debug</h1>

      <div class="card">
        <h2 class="card__title">Client Files</h2>
        <ul class="option-list">
          ${remoteDebug.clientFiles.map(file => html`
            <li class="option-item" key=${file.name}>
              <div class="option-item__text">
                <strong>${file.title}</strong>
              </div>
              <label class="toggle">
                <input
                  class="toggle__input"
                  type="checkbox"
                  checked=${file.active}
                  onChange=${(event: Event) => ws.send({
                    type: 'remote-debug:file',
                    name: file.name,
                    active: (event.currentTarget as HTMLInputElement).checked,
                  })}
                />
                <span class="toggle__track">
                  <span class="toggle__thumb"></span>
                </span>
              </label>
            </li>
          `)}
        </ul>
      </div>

      <div class="card">
        <h2 class="card__title">Overlay Grid</h2>
        <div class="option-item">
          <div class="option-item__text"><strong>Grid overlay</strong></div>
          <label class="toggle">
            <input
              class="toggle__input"
              type="checkbox"
              checked=${remoteDebug.overlayGrid.active}
              onChange=${(event: Event) => ws.send({
                type: 'remote-debug:overlay-grid',
                active: (event.currentTarget as HTMLInputElement).checked,
              })}
            />
            <span class="toggle__track">
              <span class="toggle__thumb"></span>
            </span>
          </label>
        </div>
        ${remoteDebug.overlayGrid.active && html`
          <div class="form-grid">
            <label class="field">
              <span>Grid Size</span>
              <input value=${remoteDebug.overlayGrid.size} onInput=${(event: Event) => updateGrid('size', (event.currentTarget as HTMLInputElement).value)} />
            </label>
            <label class="field">
              <span>Grid Colour</span>
              <input value=${remoteDebug.overlayGrid.color} onInput=${(event: Event) => updateGrid('color', (event.currentTarget as HTMLInputElement).value)} />
            </label>
            <label class="field">
              <span>CSS Selector</span>
              <input value=${remoteDebug.overlayGrid.selector} onInput=${(event: Event) => updateGrid('selector', (event.currentTarget as HTMLInputElement).value)} />
            </label>
            <label class="field">
              <span>Offset Top</span>
              <input value=${remoteDebug.overlayGrid.offsetY} onInput=${(event: Event) => updateGrid('offsetY', (event.currentTarget as HTMLInputElement).value)} />
            </label>
            <label class="field">
              <span>Offset Left</span>
              <input value=${remoteDebug.overlayGrid.offsetX} onInput=${(event: Event) => updateGrid('offsetX', (event.currentTarget as HTMLInputElement).value)} />
            </label>
            <label class="checkbox-row">
              <input type="checkbox" checked=${remoteDebug.overlayGrid.vertical} onChange=${(event: Event) => updateGrid('vertical', (event.currentTarget as HTMLInputElement).checked)} />
              <span>Vertical Axis</span>
            </label>
            <label class="checkbox-row">
              <input type="checkbox" checked=${remoteDebug.overlayGrid.horizontal} onChange=${(event: Event) => updateGrid('horizontal', (event.currentTarget as HTMLInputElement).checked)} />
              <span>Horizontal Axis</span>
            </label>
          </div>
        `}
      </div>

      <div class="card">
        <h2 class="card__title">Response Controls</h2>
        <ul class="option-list">
          <li class="option-item">
            <div class="option-item__text"><strong>No Cache</strong></div>
            <label class="toggle">
              <input
                class="toggle__input"
                type="checkbox"
                checked=${remoteDebug.noCache.active}
                onChange=${(event: Event) => ws.send({
                  type: 'remote-debug:no-cache',
                  active: (event.currentTarget as HTMLInputElement).checked,
                })}
              />
              <span class="toggle__track">
                <span class="toggle__thumb"></span>
              </span>
            </label>
          </li>
          <li class="option-item">
            <div class="option-item__text">
              <strong>Latency</strong>
              ${remoteDebug.latency.active && html`
                <label class="range-field">
                  <input
                    type="range"
                    max="5"
                    min="0"
                    step=".50"
                    value=${remoteDebug.latency.rate}
                    onInput=${(event: Event) => ws.send({
                      type: 'remote-debug:latency',
                      active: remoteDebug.latency.active,
                      rate: Number((event.currentTarget as HTMLInputElement).value),
                    })}
                  />
                  <span>${remoteDebug.latency.rate.toFixed(1)}s</span>
                </label>
              `}
            </div>
            <label class="toggle">
              <input
                class="toggle__input"
                type="checkbox"
                checked=${remoteDebug.latency.active}
                onChange=${(event: Event) => ws.send({
                  type: 'remote-debug:latency',
                  active: (event.currentTarget as HTMLInputElement).checked,
                  rate: remoteDebug.latency.rate,
                })}
              />
              <span class="toggle__track">
                <span class="toggle__thumb"></span>
              </span>
            </label>
          </li>
        </ul>
      </div>
    </div>
  `
}
