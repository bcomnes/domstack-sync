import { html } from 'htm/preact'
import type { UiState, UserPluginState } from '../../types.ts'
import type { WsClient } from '../ws.ts'

export function Plugins ({ state, ws }: { state: UiState; ws: WsClient }) {
  return html`
    <div class="page">
      <div class="card__header">
        <h1 class="page__title">Plugins</h1>
        ${state.plugins.length > 0 && html`
          <div class="history-item__actions">
            <button class="button" type="button" onClick=${() => ws.send({ type: 'plugins:set-many', active: true })}>Enable All</button>
            <button class="button button--subtle" type="button" onClick=${() => ws.send({ type: 'plugins:set-many', active: false })}>Disable All</button>
          </div>
        `}
      </div>
      <div class="card">
        ${state.plugins.length === 0
          ? html`
            <p class="empty">No user plugins loaded.</p>
            <p class="hint">External plugin management is ready for configured user plugins.</p>
          `
          : html`
            <ul class="option-list">
              ${state.plugins.map(plugin => html`
                <li class="option-item" key=${plugin.name}>
                  <div class="option-item__text">
                    <strong>${plugin.title}</strong>
                    ${plugin.markup && html`<div class="plugin-markup" dangerouslySetInnerHTML=${{ __html: plugin.markup }} />`}
                  </div>
                  <label class="toggle">
                    <input
                      class="toggle__input"
                      type="checkbox"
                      checked=${plugin.active}
                      onChange=${(event: Event) => ws.send({
                        type: 'plugins:set',
                        plugin: { ...plugin, active: (event.currentTarget as HTMLInputElement).checked },
                      })}
                    />
                    <span class="toggle__track">
                      <span class="toggle__thumb"></span>
                    </span>
                  </label>
                </li>
              `)}
            </ul>
          `}
      </div>
    </div>
  `
}

export function PluginPage ({ plugin }: { plugin: UserPluginState }) {
  return html`
    <div class="page">
      <div class="card__header">
        <h1 class="page__title">${plugin.page?.title ?? plugin.title}</h1>
      </div>
      <div class="card">
        ${plugin.markup
          ? html`<div class="plugin-markup" dangerouslySetInnerHTML=${{ __html: plugin.markup }} />`
          : html`<p class="empty">${plugin.title}</p>`}
      </div>
    </div>
  `
}
