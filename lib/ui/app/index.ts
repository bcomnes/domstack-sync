import { render } from 'preact'
import { useState, useEffect } from 'preact/hooks'
import { html } from 'htm/preact'
import { createWsClient } from './ws.ts'
import { Nav } from './components/Nav.ts'
import { Overview } from './components/Overview.ts'
import { SyncOptions } from './components/SyncOptions.ts'
import { Connections } from './components/Connections.ts'
import { History } from './components/History.ts'
import { NetworkThrottle } from './components/NetworkThrottle.ts'
import { Help } from './components/Help.ts'
import type { UiState } from '../types.ts'

const ws = createWsClient()

function App () {
  const [state, setState] = useState<UiState | null>(null)

  useEffect(() => {
    ws.onUpdate = setState
  }, [])

  const path = location.pathname

  if (!state) {
    return html`
      <${Nav} />
      <main class="main"><p class="loading">Connecting to server…</p></main>
    `
  }

  let Page
  if (path === '/sync-options') Page = SyncOptions
  else if (path === '/history') Page = History
  else if (path === '/connections') Page = Connections
  else if (path === '/network-throttle') Page = NetworkThrottle
  else if (path === '/help') Page = Help
  else Page = Overview

  return html`
    <${Nav} />
    <main class="main">
      <${Page} state=${state} ws=${ws} />
    </main>
  `
}

render(html`<${App} />`, document.getElementById('app')!)
