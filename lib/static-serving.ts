interface DirectoryListItem {
  href: string
  name: string
}

export function normalizeStaticPrefix (route: string): string {
  const prefixed = route.startsWith('/') ? route : `/${route}`
  if (prefixed === '/') return '/'
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`
}

export function renderDirectoryList (dirs: DirectoryListItem[], files: DirectoryListItem[]): string {
  const items = [...dirs, ...files]
    .map(item => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.name)}</a></li>`)
    .join('\n')

  return `<!doctype html><html><body><ul>${items}</ul></body></html>`
}

function escapeHtml (value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
