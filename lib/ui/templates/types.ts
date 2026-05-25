import type { BsClientInfo } from '../../sockets.ts'
import type {
  HistoryEntry,
  NetworkThrottleServerInfo,
  NetworkThrottleState,
  NetworkThrottleTarget,
  RemoteDebugState,
  UserPluginState,
} from '../types.ts'
import type { FragtmlTemplate } from 'fastify-fragtml'

export const MAIN_FRAGMENT = 'main'

export type PageTemplateName =
  | 'overview'
  | 'sync-options'
  | 'history'
  | 'connections'
  | 'remote-debug'
  | 'plugins'
  | 'network-throttle'
  | 'help'
  | 'plugin-page'

export interface NavLink {
  href: string
  label: string
  active: boolean
  order: number
}

export interface UrlInfo {
  title: string
  tagline: string
  url: string
  sync: boolean
  path: string
}

export interface SyncOption {
  kind: 'ghost' | 'form'
  key: string
  label: string
  description: string
  active: boolean
}

export interface ConnectionDisplay extends BsClientInfo {
  browserLabel: string
  connectedAgo: string
}

export interface HistoryDisplay extends HistoryEntry {
  url: string
}

export interface UiTemplateContext {
  title: string
  path: string
  navLinks: NavLink[]
  urls: UrlInfo[]
  serverBaseDirs: string[]
  proxyTarget: string | null
  snippet: string | null
  connections: BsClientInfo[]
  connectionsDisplay: ConnectionDisplay[]
  historyDisplay: HistoryDisplay[]
  syncOptions: SyncOption[]
  throttleTargets: NetworkThrottleTarget[]
  throttleServers: NetworkThrottleServerInfo[]
  pluginPage: UserPluginState | undefined
  plugins: UserPluginState[]
  remoteDebug: RemoteDebugState
  networkThrottle: NetworkThrottleState
}

export type PageTemplate = FragtmlTemplate<UiTemplateContext, string, typeof MAIN_FRAGMENT>
