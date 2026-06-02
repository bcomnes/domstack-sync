import type { BrowserLocationMessage } from '../protocol.ts'
import type { ClientRuntimeOptions } from '../protocol.ts'
import type { BrowserSyncPluginPage } from '../plugin-types.ts'
import type { HistoryEntry, UiMode, UiState, UserPluginState } from './types.ts'
import type {
  NavLink,
  SyncOption,
  UiTemplateContext,
  UrlInfo,
} from './templates/index.ts'

export interface PageDescriptor {
  path: string
  title: string
  template: 'overview' | 'sync-options' | 'history' | 'connections' | 'remote-debug' | 'plugins' | 'network-throttle' | 'help' | 'plugin-page'
  order: number
}

export const PAGES: PageDescriptor[] = [
  { path: '/', title: 'Overview', template: 'overview', order: 1 },
  { path: '/sync-options', title: 'Sync Options', template: 'sync-options', order: 2 },
  { path: '/history', title: 'History', template: 'history', order: 3 },
  { path: '/connections', title: 'Connections', template: 'connections', order: 4 },
  { path: '/remote-debug', title: 'Remote Debug', template: 'remote-debug', order: 5 },
  { path: '/plugins', title: 'Plugins', template: 'plugins', order: 6 },
  { path: '/network-throttle', title: 'Network Throttle', template: 'network-throttle', order: 7 },
  { path: '/help', title: 'Help', template: 'help', order: 8 },
]

export function getPluginPages (plugins: UserPluginState[]): BrowserSyncPluginPage[] {
  return plugins
    .map(plugin => plugin.page)
    .filter((page): page is BrowserSyncPluginPage => Boolean(page?.path && page.title))
    .map(page => ({
      ...page,
      path: page.path.startsWith('/') ? page.path : `/${page.path}`,
    }))
    .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.title.localeCompare(b.title))
}

export function getPage (path: string, plugins: UserPluginState[]): PageDescriptor {
  const normalized = normalizePagePath(path) ?? '/'
  const builtIn = PAGES.find(page => page.path === normalized)
  if (builtIn) return builtIn
  const plugin = plugins.find(item => normalizePagePath(item.page?.path) === normalized)
  if (plugin?.page) {
    return {
      path: normalized,
      title: plugin.page.title,
      template: 'plugin-page',
      order: plugin.page.order ?? Number.MAX_SAFE_INTEGER,
    }
  }
  return PAGES[0]!
}

export function buildPageContext (path: string, state: UiState): UiTemplateContext {
  const page = getPage(path, state.plugins)
  const pluginPage = state.plugins.find(plugin => normalizePagePath(plugin.page?.path) === path)
  return {
    ...state,
    title: page.title,
    path,
    navLinks: getNavLinks(path, state.plugins),
    urls: getUrlInfos(state),
    connectionsDisplay: state.connections.map(client => ({
      ...client,
      browserLabel: `${client.browser.name}${client.browser.version ? ` ${client.browser.version}` : ''}`,
      connectedAgo: timeAgo(client.connectedAt),
    })),
    historyDisplay: state.history.map(entry => ({
      ...entry,
      url: new URL(entry.path, state.serverUrl).href,
    })),
    syncOptions: getSyncOptions(state.options),
    throttleTargets: [...state.networkThrottle.targets].sort((a, b) => a.order - b.order),
    throttleServers: Object.values(state.networkThrottle.servers).sort((a, b) => a.port - b.port),
    pluginPage,
    remoteDebug: state.remoteDebug,
    networkThrottle: state.networkThrottle,
  }
}

export function getNavLinks (path: string, plugins: UserPluginState[]): NavLink[] {
  const builtIn = PAGES.map(page => ({
    href: page.path,
    label: page.title,
    active: page.path === path,
    order: page.order,
  }))
  const pluginLinks = getPluginPages(plugins)
    .filter(page => !PAGES.some(builtInPage => builtInPage.path === page.path))
    .map(page => ({
      href: page.path,
      label: page.title,
      active: page.path === path,
      order: page.order ?? Number.MAX_SAFE_INTEGER,
    }))
  return [...builtIn, ...pluginLinks].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
}

export function getUrlInfos (state: UiState): UrlInfo[] {
  const externalUrl = `http://${state.localIp}:${state.port}`
  return [
    {
      title: 'Local',
      tagline: 'URL for the machine running this server',
      url: state.serverUrl,
      sync: state.mode !== 'snippet',
      path: getUrlPath(state.serverUrl, '/'),
    },
    {
      title: 'External',
      tagline: 'Other devices on the same network',
      url: externalUrl,
      sync: state.mode !== 'snippet',
      path: getUrlPath(externalUrl, '/'),
    },
    ...(state.tunnelUrl
      ? [{
          title: 'Tunnel',
          tagline: 'Public URL for remote devices',
          url: state.tunnelUrl,
          sync: state.mode !== 'snippet',
          path: getUrlPath(state.tunnelUrl, '/'),
        }]
      : []),
    {
      title: 'UI',
      tagline: 'Control panel for this domstack-sync instance',
      url: state.uiUrl,
      sync: false,
      path: getUrlPath(state.uiUrl, '/'),
    },
  ]
}

export function getSyncOptions (options: ClientRuntimeOptions): SyncOption[] {
  return [
    { kind: 'ghost', key: 'scroll', label: 'Scroll sync', description: 'Synchronise scroll position across browsers', active: options.ghostMode.scroll },
    { kind: 'ghost', key: 'clicks', label: 'Click sync', description: 'Mirror clicks across browsers', active: options.ghostMode.clicks },
    { kind: 'ghost', key: 'location', label: 'Location sync', description: 'Send connected browsers to the same URL', active: options.ghostMode.location },
    { kind: 'form', key: 'inputs', label: 'Text input sync', description: 'Synchronise input and textarea key changes', active: options.ghostMode.forms.inputs },
    { kind: 'form', key: 'toggles', label: 'Toggle sync', description: 'Synchronise checkbox, radio, and select changes', active: options.ghostMode.forms.toggles },
    { kind: 'form', key: 'submit', label: 'Submit sync', description: 'Synchronise form submit and reset actions', active: options.ghostMode.forms.submit },
  ]
}

export function cloneUserPlugins (plugins: UserPluginState[]): UserPluginState[] {
  return plugins.map(plugin => {
    const clone: UserPluginState = { ...plugin }
    if (plugin.opts) clone.opts = { ...plugin.opts }
    if (plugin.page) clone.page = { ...plugin.page }
    if (plugin.templates) clone.templates = { ...plugin.templates }
    if (plugin.clientJs) clone.clientJs = { ...plugin.clientJs }
    return clone
  })
}

export function decorateHistory (paths: string[]): HistoryEntry[] {
  return paths
    .map((path, index) => ({ path, key: index + 1 }))
    .reverse()
}

export function normalizeHistoryPath (path: string, serverUrl: string, mode: UiMode): string {
  try {
    const parsed = new URL(path, serverUrl)
    if (mode === 'snippet') return parsed.href
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return ''
  }
}

export function normalizeReturnPath (path: string): string {
  const normalized = normalizePagePath(path)
  return normalized ?? '/'
}

export function normalizePagePath (path: string | undefined): string | null {
  if (!path) return null
  const normalized = path.startsWith('/') ? path : `/${path}`
  return normalized.split('?')[0] || '/'
}

export function makeBrowserLocationMessage (path: string, serverUrl: string, mode: UiMode): BrowserLocationMessage {
  const parsed = new URL(path, serverUrl)
  if (mode === 'snippet') {
    return {
      type: 'browser:location',
      override: true,
      url: parsed.href,
    }
  }
  return {
    type: 'browser:location',
    override: true,
    path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
    url: parsed.href,
  }
}

function getUrlPath (url: string, fallback: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

function timeAgo (ts: number): string {
  const secs = Math.floor((Date.now() - ts) / 1000)
  if (secs < 60) return `${secs}s ago`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  return `${Math.floor(secs / 3600)}h ago`
}
