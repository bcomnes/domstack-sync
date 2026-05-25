import html from 'fragtml'
import type { HtmlResult } from 'fragtml/types.js'

export function syncAllFormTemplate (path: string, returnTo: string): HtmlResult {
  return html`
    <form method="post" action="/actions/history/send" hx-post="/actions/history/send" hx-target="#main" hx-swap="innerHTML">
      <input type="hidden" name="path" value="${path}">
      <input type="hidden" name="returnTo" value="${returnTo}">
      <button class="button button--subtle" type="submit">Sync all</button>
    </form>
  `
}

export function toggleTemplate (active: boolean): HtmlResult {
  return html`
    <label class="toggle">
      <input class="toggle__input" type="checkbox" name="active" value="true" ?checked=${active} onchange="this.form.requestSubmit()">
      <span class="toggle__track"><span class="toggle__thumb"></span></span>
    </label>
  `
}
