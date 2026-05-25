import type { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { FileWatchEntry, BsOptions } from './options.ts'
import type { UiElementDescriptor } from './protocol.ts'
import type { UserPluginState } from './ui/types.ts'

export type PluginMiddlewareNext = () => void
export type PluginMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: PluginMiddlewareNext
) => void | Promise<void>

export interface PluginMiddlewareOptions {
  id?: string
  override?: boolean
}

export interface PluginServeFileOptions {
  type: string
  content: string | Buffer
}

export interface PluginUiEvent {
  namespace: string
  event?: string
  data?: unknown
}

export type PluginUiEventHandler = (data: unknown, event: PluginUiEvent) => void
export type PluginUiEventMap = Record<string, PluginUiEventHandler> & {
  event?: (event: PluginUiEvent) => void
}

export interface BrowserSyncPluginPage {
  path: string
  title: string
  template?: string
  controller?: string
  order?: number
  icon?: string
}

export interface BrowserSyncPluginApi {
  events: EventEmitter
  options: BsOptions
  getOption: <K extends keyof BsOptions>(name: K) => BsOptions[K]
  setOption: <K extends keyof BsOptions>(name: K, value: BsOptions[K]) => BsOptions
  getUserPlugins: () => UserPluginState[]
  getUserPlugin: (name: string) => UserPluginState | undefined
  serveFile: (path: string, props: PluginServeFileOptions) => string
  addMiddleware: (route: string, handle: PluginMiddleware, opts?: PluginMiddlewareOptions) => string | undefined
  removeMiddleware: (id: string) => void
  registerCleanupTask: (fn: () => void | Promise<void>) => void
  reload: (files?: string | string[]) => void
  notify: (message: string) => void
  ui: {
    listen: (namespace: string | string[], events: PluginUiEventMap) => void
  }
}

export type BrowserSyncPluginFunction = (
  bs: BrowserSyncPluginApi,
  opts: Record<string, unknown>
) => void | Promise<void>

export interface BrowserSyncPluginHooks {
  'server:middleware'?: PluginMiddleware | PluginMiddleware[] | ((bs: BrowserSyncPluginApi) => PluginMiddleware | PluginMiddleware[] | undefined)
  'files:watch'?: FileWatchEntry | FileWatchEntry[] | ((bs: BrowserSyncPluginApi) => FileWatchEntry | FileWatchEntry[] | undefined)
  'client:js'?: string | string[] | ((bs: BrowserSyncPluginApi) => string | string[] | undefined)
  'client:events'?: string | string[] | ((bs: BrowserSyncPluginApi) => string | string[] | undefined)
  page?: BrowserSyncPluginPage | ((bs: BrowserSyncPluginApi) => BrowserSyncPluginPage | undefined)
  elements?: UiElementDescriptor[] | ((bs: BrowserSyncPluginApi) => UiElementDescriptor[] | undefined)
}

export interface BrowserSyncPluginModule {
  plugin?: BrowserSyncPluginFunction
  hooks?: BrowserSyncPluginHooks
  'plugin:name'?: string
  name?: string
  title?: string
}

export interface BrowserSyncPluginConfigObject {
  module: string | BrowserSyncPluginModule | BrowserSyncPluginFunction
  options?: Record<string, unknown>
}

export type BrowserSyncPluginEntry =
  | string
  | BrowserSyncPluginFunction
  | BrowserSyncPluginModule
  | BrowserSyncPluginConfigObject
