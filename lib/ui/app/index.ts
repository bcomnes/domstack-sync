import { render } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { html } from 'htm/preact'
import { createWsClient } from './ws.ts'
import { Nav } from './components/Nav.ts'
import { Overview } from './components/Overview.ts'
import { SyncOptions } from './components/SyncOptions.ts'
import { Connections } from './components/Connections.ts'
import { History } from './components/History.ts'
import { RemoteDebug } from './components/RemoteDebug.ts'
import { NetworkThrottle } from './components/NetworkThrottle.ts'
import { PluginPage, Plugins } from './components/Plugins.ts'
import { Help } from './components/Help.ts'
import type { UiState } from '../types.ts'
import type { WsStatus } from './ws.ts'

const ws = createWsClient()

function App () {
  const [state, setState] = useState<UiState | null>(null)
  const [status, setStatus] = useState<WsStatus>('connecting')

  useEffect(() => {
    ws.onUpdate = setState
    ws.onStatus = setStatus
  }, [])

  const path = location.pathname

  if (!state) {
    return html`
      <${Nav} />
      <main class="main"><p class="loading">Connecting to server…</p></main>
    `
  }

  let Page
  const pluginPage = state.plugins.find(plugin => {
    const pagePath = plugin.page?.path
    if (!pagePath) return false
    const normalized = pagePath.startsWith('/') ? pagePath : `/${pagePath}`
    return normalized === path
  })
  if (path === '/sync-options') Page = SyncOptions
  else if (path === '/history') Page = History
  else if (path === '/connections') Page = Connections
  else if (path === '/remote-debug') Page = RemoteDebug
  else if (path === '/plugins') Page = Plugins
  else if (path === '/network-throttle') Page = NetworkThrottle
  else if (path === '/help') Page = Help
  else if (pluginPage) Page = () => html`<${PluginPage} plugin=${pluginPage} />`
  else Page = Overview

  return html`
    <${Nav} state=${state} />
    <main class="main">
      ${status !== 'connected' && html`<p class="connection-status connection-status--${status}">${status === 'connecting' ? 'Connecting to server...' : 'Disconnected. Reconnecting...'}</p>`}
      <${Page} state=${state} ws=${ws} />
    </main>
  `
}

render(html`<${App} />`, document.getElementById('app')!)
