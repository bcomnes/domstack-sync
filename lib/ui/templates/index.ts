import { html, render } from 'fragtml'
import { layoutTemplate } from './layout.ts'
import { connectionsPageTemplate } from './pages/connections.ts'
import { helpPageTemplate } from './pages/help.ts'
import { historyPageTemplate } from './pages/history.ts'
import { networkThrottlePageTemplate } from './pages/network-throttle.ts'
import { overviewPageTemplate } from './pages/overview.ts'
import { pluginPageTemplate } from './pages/plugin-page.ts'
import { pluginsPageTemplate } from './pages/plugins.ts'
import { remoteDebugPageTemplate } from './pages/remote-debug.ts'
import { syncOptionsPageTemplate } from './pages/sync-options.ts'
import { MAIN_FRAGMENT, type PageTemplate, type PageTemplateName, type UiTemplateContext } from './types.ts'
import type { HtmlResult } from 'fragtml/types.js'

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

export function renderUiPage (name: PageTemplateName, context: UiTemplateContext): string {
  return render(renderUiDocument(name, context))
}

export function renderUiFragment (
  name: PageTemplateName,
  context: UiTemplateContext,
  fragmentId = MAIN_FRAGMENT
): string {
  const fragmentHtml = html({ fragmentId })
  return render(fragmentHtml`${renderUiDocument(name, context)}`)
}

function renderUiDocument (name: PageTemplateName, context: UiTemplateContext): HtmlResult {
  const children = pageTemplates[name](context)
  return layoutTemplate({ context, children })
}
