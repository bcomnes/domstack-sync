export { createServer } from './lib/server.ts'
export { parseOptions } from './lib/options.ts'
export type { BsOptions } from './lib/options.ts'
export type { BsInstance } from './lib/server.ts'
export type { ServerToClientMessage, ClientToServerMessage, BsMessage } from './lib/protocol.ts'
export type {
  BrowserSyncPluginApi,
  BrowserSyncPluginEntry,
  BrowserSyncPluginFunction,
  BrowserSyncPluginHooks,
  BrowserSyncPluginModule,
  BrowserSyncPluginPage,
  PluginMiddleware,
  PluginMiddlewareOptions,
  PluginServeFileOptions,
  PluginUiEvent,
  PluginUiEventMap,
} from './lib/plugin-types.ts'
