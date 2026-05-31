import html from 'fragtml'
import type { NavLink } from '../types.ts'
import type { HtmlResult } from 'fragtml/types.js'

export function navTemplate (links: NavLink[]): HtmlResult {
  return html`
    <nav class="nav">
      <div class="nav__brand">domstack-sync</div>
      <div id="connection-status" class="connection-status connection-status--connected" data-status="connected">Connected</div>
      <ul class="nav__links">
        ${links.map(link => html`
          <li>
            <a href="${link.href}" class="nav__link ${link.active ? 'nav__link--active' : ''}">${link.label}</a>
          </li>
        `)}
      </ul>
    </nav>
  `
}
