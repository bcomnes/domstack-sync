import html, { raw } from 'fragtml'
import { toggleTemplate } from '../components/forms.ts'
import type { UiTemplateContext } from '../types.ts'
import type { HtmlResult } from 'fragtml/types.js'

export function pluginsPageTemplate (context: UiTemplateContext): HtmlResult {
  return html`
    <div class="page">
      <div class="card__header">
        <h1 class="page__title">Plugins</h1>
        ${context.plugins.length
          ? html`
            <div class="history-item__actions">
              <form method="post" action="/actions/plugins/set-many" hx-post="/actions/plugins/set-many" hx-target="#main" hx-swap="innerHTML">
                <input type="hidden" name="active" value="true">
                <input type="hidden" name="returnTo" value="/plugins">
                <button class="button" type="submit">Enable All</button>
              </form>
              <form method="post" action="/actions/plugins/set-many" hx-post="/actions/plugins/set-many" hx-target="#main" hx-swap="innerHTML">
                <input type="hidden" name="returnTo" value="/plugins">
                <button class="button button--subtle" type="submit">Disable All</button>
              </form>
            </div>
          `
          : null}
      </div>
      <div class="card">
        ${context.plugins.length
          ? html`
            <ul class="option-list">
              ${context.plugins.map(plugin => html`
                <li class="option-item">
                  <div class="option-item__text">
                    <strong>${plugin.title}</strong>
                    ${plugin.markup ? html`<div class="plugin-markup">${raw(plugin.markup)}</div>` : null}
                  </div>
                  <form method="post" action="/actions/plugins/set" hx-post="/actions/plugins/set" hx-target="#main" hx-swap="innerHTML">
                    <input type="hidden" name="name" value="${plugin.name}">
                    <input type="hidden" name="returnTo" value="/plugins">
                    ${toggleTemplate(plugin.active)}
                  </form>
                </li>
              `)}
            </ul>
          `
          : html`
            <p class="empty">No user plugins loaded.</p>
            <p class="hint">External plugin management is ready for configured user plugins.</p>
          `}
      </div>
    </div>
  `
}
