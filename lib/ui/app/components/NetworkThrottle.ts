import { html } from 'htm/preact'
import { useState } from 'preact/hooks'
import type { UiState } from '../../types.ts'
import type { WsClient } from '../ws.ts'

export function NetworkThrottle ({ state, ws }: { state: UiState; ws: WsClient }) {
  const targets = [...state.networkThrottle.targets].sort((a, b) => a.order - b.order)
  const [targetId, setTargetId] = useState(targets[0]?.id ?? 'dsl')
  const [portMode, setPortMode] = useState<'auto' | 'manual'>('auto')
  const [port, setPort] = useState('')
  const servers = Object.values(state.networkThrottle.servers).sort((a, b) => a.port - b.port)

  function createServer (): void {
    ws.send({
      type: 'network-throttle:create',
      targetId,
      port: portMode === 'manual' ? port : '',
    })
  }

  return html`
    <div class="page">
      <h1 class="page__title">Network Throttle</h1>
      <div class="card">
        <h2 class="card__title">Create Server</h2>
        <div class="throttle-layout">
          <fieldset class="fieldset">
            <legend>Speed</legend>
            ${targets.map(target => html`
              <label class="radio-row" key=${target.id}>
                <input type="radio" name="speed" value=${target.id} checked=${targetId === target.id} onChange=${() => setTargetId(target.id)} />
                <span>${target.title}</span>
              </label>
            `)}
          </fieldset>
          <fieldset class="fieldset">
            <legend>Port</legend>
            <label class="radio-row">
              <input type="radio" name="port-select" value="auto" checked=${portMode === 'auto'} onChange=${() => setPortMode('auto')} />
              <span>Auto Detection</span>
            </label>
            <label class="radio-row">
              <input type="radio" name="port-select" value="manual" checked=${portMode === 'manual'} onChange=${() => setPortMode('manual')} />
              <span>User specified</span>
            </label>
            <input
              class="text-input"
              value=${port}
              placeholder="1024"
              onFocus=${() => setPortMode('manual')}
              onInput=${(event: Event) => setPort((event.currentTarget as HTMLInputElement).value)}
            />
            <button class="button" type="button" onClick=${createServer}>Create Server</button>
          </fieldset>
        </div>
      </div>

      <div class="card">
        <h2 class="card__title">Your Servers</h2>
        ${servers.length === 0
          ? html`<p class="empty">No throttle servers running.</p>`
          : html`
            <ul class="throttle-server-list">
              ${servers.map(server => html`
                <li class="throttle-server-item" key=${server.port}>
                  <div>
                    <div class="connection-item__browser">${server.speed.id.toUpperCase()}</div>
                    <div class="connection-item__meta">
                      ${server.urls.map(url => html`<a class="url-link" href=${url}>${url}</a>`)}
                    </div>
                  </div>
                  <button class="button button--icon" type="button" aria-label=${`Destroy server ${server.port}`} onClick=${() => ws.send({ type: 'network-throttle:destroy', port: server.port })}>x</button>
                </li>
              `)}
            </ul>
          `}
      </div>
    </div>
  `
}
