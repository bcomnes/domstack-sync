import html from 'fragtml'
import { toggleTemplate } from '../components/forms.ts'
import type { PageTemplate } from '../types.ts'

export const syncOptionsPageTemplate: PageTemplate = context => {
  return html`
    <div class="page">
      <h1 class="page__title">Sync Options</h1>
      <div class="card">
        <h2 class="card__title">Ghost Mode</h2>
        <ul class="option-list">
          ${context.syncOptions.map(option => html`
            <li class="option-item">
              <div class="option-item__text">
                <strong>${option.label}</strong>
                <span class="option-item__desc">${option.description}</span>
              </div>
              <form method="post" action="/actions/options" hx-post="/actions/options" hx-target="#main" hx-swap="innerHTML">
                <input type="hidden" name="kind" value="${option.kind}">
                <input type="hidden" name="key" value="${option.key}">
                <input type="hidden" name="returnTo" value="/sync-options">
                ${toggleTemplate(option.active)}
              </form>
            </li>
          `)}
        </ul>
      </div>
    </div>
  `
}
