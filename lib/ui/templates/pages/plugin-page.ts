import html, { raw } from 'fragtml'
import type { UiTemplateContext } from '../types.ts'
import type { HtmlResult } from 'fragtml/types.js'

export function pluginPageTemplate (context: UiTemplateContext): HtmlResult {
  const plugin = context.pluginPage
  const title = plugin?.page?.title ?? context.title

  return html`
    <div class="page">
      <div class="card__header">
        <h1 class="page__title">${title}</h1>
      </div>
      <div class="card">
        ${plugin?.markup
          ? html`<div class="plugin-markup">${raw(plugin.markup)}</div>`
          : html`<p class="empty">${plugin?.title ?? title}</p>`}
      </div>
    </div>
  `
}
