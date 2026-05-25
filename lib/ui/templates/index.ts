import { connectionsPageTemplate } from './pages/connections.ts'
import { helpPageTemplate } from './pages/help.ts'
import { historyPageTemplate } from './pages/history.ts'
import { networkThrottlePageTemplate } from './pages/network-throttle.ts'
import { overviewPageTemplate } from './pages/overview.ts'
import { pluginPageTemplate } from './pages/plugin-page.ts'
import { pluginsPageTemplate } from './pages/plugins.ts'
import { remoteDebugPageTemplate } from './pages/remote-debug.ts'
import { syncOptionsPageTemplate } from './pages/sync-options.ts'
import { MAIN_FRAGMENT, type PageTemplate, type PageTemplateName } from './types.ts'

const pageTemplates: Record<PageTemplateName, PageTemplate> = {
  overview: overviewPageTemplate,
  'sync-options': syncOptionsPageTemplate,
  history: historyPageTemplate,
  connections: connectionsPageTemplate,
  'remote-debug': remoteDebugPageTemplate,
  plugins: pluginsPageTemplate,
  'network-throttle': networkThrottlePageTemplate,
  help: helpPageTemplate,
  'plugin-page': pluginPageTemplate,
}

export { MAIN_FRAGMENT }
export type { NavLink, PageTemplateName, SyncOption, UiTemplateContext, UrlInfo } from './types.ts'

export function getUiPageTemplate (name: PageTemplateName): PageTemplate {
  return pageTemplates[name]
}
