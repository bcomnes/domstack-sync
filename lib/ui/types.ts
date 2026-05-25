import type { BsClientInfo } from '../sockets.ts'
import type { ClientRuntimeOptions, ClientRuntimeOptionsPatch } from '../protocol.ts'
import type { BrowserSyncPluginPage, PluginUiEvent } from '../plugin-types.ts'

export type { BsClientInfo }

export interface HistoryEntry {
  path: string
  key: number
}

export interface RemoteDebugClientFile {
  id: string
  name: string
  title: string
  type: 'css' | 'js' | 'dom'
  src?: string
  active: boolean
}

export interface OverlayGridState {
  active: boolean
  offsetY: string
  offsetX: string
  size: string
  selector: string
  color: string
  horizontal: boolean
  vertical: boolean
}

export interface RemoteDebugState {
  clientFiles: RemoteDebugClientFile[]
  overlayGrid: OverlayGridState
  noCache: { active: boolean }
  latency: { active: boolean; rate: number }
}

export interface NetworkThrottleTarget {
  active: boolean
  title: string
  id: string
  speed: number
  latency: number
  urls: string[]
  order: number
}

export interface NetworkThrottleServerInfo {
  port: number
  urls: string[]
  speed: NetworkThrottleTarget
}

export interface NetworkThrottleState {
  targets: NetworkThrottleTarget[]
  servers: Record<string, NetworkThrottleServerInfo>
}

export interface UserPluginState {
  name: string
  title: string
  active: boolean
  opts?: Record<string, unknown>
  markup?: string
  page?: BrowserSyncPluginPage
  templates?: Record<string, string>
  clientJs?: Record<string, string>
}

export type UiMode = 'server' | 'snippet' | 'proxy'

export interface UiState {
  serverUrl: string
  uiUrl: string
  localIp: string
  port: number
  uiPort: number
  mode: UiMode
  snippet: string | null
  serverBaseDirs: string[]
  proxyTarget: string | null
  tunnelUrl: string | null
  options: ClientRuntimeOptions
  connections: BsClientInfo[]
  history: HistoryEntry[]
  remoteDebug: RemoteDebugState
  networkThrottle: NetworkThrottleState
  plugins: UserPluginState[]
}

export type UiServerMessage =
  | { type: 'init'; data: UiState }
  | { type: 'update'; data: Partial<UiState> }

export type UiClientMessage =
  | { type: 'options:set'; data: ClientRuntimeOptionsPatch }
  | { type: 'history:send-all'; path: string }
  | { type: 'history:remove'; path: string }
  | { type: 'history:clear' }
  | { type: 'connection:highlight'; id: string }
  | { type: 'remote-debug:file'; name: string; active: boolean }
  | { type: 'remote-debug:overlay-grid'; active: boolean }
  | { type: 'remote-debug:overlay-grid:update'; data: Partial<OverlayGridState> }
  | { type: 'remote-debug:no-cache'; active: boolean }
  | { type: 'remote-debug:latency'; active: boolean; rate?: number }
  | { type: 'network-throttle:create'; targetId: string; port?: string }
  | { type: 'network-throttle:destroy'; port: number }
  | { type: 'plugins:set'; plugin: UserPluginState }
  | { type: 'plugins:set-many'; active: boolean }
  | ({ type: 'ui:event' } & PluginUiEvent)
