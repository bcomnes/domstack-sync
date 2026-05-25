import { html } from 'htm/preact'
import type { UiState } from '../../types.ts'

const links = [
  { href: '/', label: 'Overview' },
  { href: '/sync-options', label: 'Sync Options' },
  { href: '/history', label: 'History' },
  { href: '/connections', label: 'Connections' },
  { href: '/remote-debug', label: 'Remote Debug' },
  { href: '/plugins', label: 'Plugins' },
  { href: '/network-throttle', label: 'Network Throttle' },
  { href: '/help', label: 'Help' },
]

export function Nav ({ state }: { state?: UiState }) {
  const current = location.pathname
  const pluginLinks = (state?.plugins ?? [])
    .map(plugin => plugin.page)
    .filter((page): page is NonNullable<UiState['plugins'][number]['page']> => Boolean(page?.path && page.title))
    .map(page => ({
      href: page.path.startsWith('/') ? page.path : `/${page.path}`,
      label: page.title,
      order: page.order ?? Number.MAX_SAFE_INTEGER,
    }))
    .filter(page => !links.some(link => link.href === page.href))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  const allLinks = [...links, ...pluginLinks]
  return html`
    <nav class="nav">
      <div class="nav__brand">domstack-sync</div>
      <ul class="nav__links">
        ${allLinks.map(({ href, label }) => html`
          <li>
            <a href=${href} class="nav__link ${current === href ? 'nav__link--active' : ''}">${label}</a>
          </li>
        `)}
      </ul>
    </nav>
  `
}
