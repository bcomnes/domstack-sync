import { html } from 'htm/preact'

const links = [
  { href: '/', label: 'Overview' },
  { href: '/sync-options', label: 'Sync Options' },
  { href: '/history', label: 'History' },
  { href: '/connections', label: 'Connections' },
  { href: '/network-throttle', label: 'Network Throttle' },
  { href: '/help', label: 'Help' },
]

export function Nav () {
  const current = location.pathname
  return html`
    <nav class="nav">
      <div class="nav__brand">domstack-sync</div>
      <ul class="nav__links">
        ${links.map(({ href, label }) => html`
          <li>
            <a href=${href} class="nav__link ${current === href ? 'nav__link--active' : ''}">${label}</a>
          </li>
        `)}
      </ul>
    </nav>
  `
}
