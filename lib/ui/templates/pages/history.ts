import html from 'fragtml'
import { syncAllFormTemplate } from '../components/forms.ts'
import type { UiTemplateContext } from '../types.ts'
import type { HtmlResult } from 'fragtml/types.js'

export function historyPageTemplate (context: UiTemplateContext): HtmlResult {
  return html`
    <div class="page">
      <h1 class="page__title">History</h1>
      <div class="card">
        <div class="card__header">
          <h2 class="card__title">Visited URLs</h2>
          ${context.historyDisplay.length
            ? html`
              <form method="post" action="/actions/history/clear" hx-post="/actions/history/clear" hx-target="#main" hx-swap="innerHTML">
                <input type="hidden" name="returnTo" value="/history">
                <button class="button button--subtle" type="submit">Clear all</button>
              </form>
            `
            : null}
        </div>
        ${context.historyDisplay.length
          ? html`
            <ul class="history-list">
              ${context.historyDisplay.map(entry => html`
                <li class="history-item">
                  <a class="history-item__path" href="${entry.url}" target="_blank">${entry.path}</a>
                  <span class="history-item__actions">
                    ${syncAllFormTemplate(entry.path, '/history')}
                    <form method="post" action="/actions/history/remove" hx-post="/actions/history/remove" hx-target="#main" hx-swap="innerHTML">
                      <input type="hidden" name="path" value="${entry.path}">
                      <input type="hidden" name="returnTo" value="/history">
                      <button class="button button--icon" type="submit" title="Remove">x</button>
                    </form>
                  </span>
                </li>
              `)}
            </ul>
          `
          : html`<p class="empty">Pages opened in connected browsers will appear here.</p>`}
      </div>
    </div>
  `
}
