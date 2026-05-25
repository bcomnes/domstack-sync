import html from 'fragtml'
import { connectionListTemplate } from '../components/connection-list.ts'
import type { PageTemplate } from '../types.ts'

export const connectionsPageTemplate: PageTemplate = context => {
  return html`
    <div class="page">
      <h1 class="page__title">Connections</h1>
      <div class="card">
        <h2 class="card__title">${context.connectionsDisplay.length} connected</h2>
        ${connectionListTemplate(context.connectionsDisplay, '/connections')}
      </div>
    </div>
  `
}
