export { createServer } from './lib/server.ts'
export { createLogger, wrapPinoLogger } from './lib/logger.ts'
export { parseOptions } from './lib/options.ts'
export type { BsOptions, BsOptionsInput } from './lib/options.ts'
export type { Logger, LoggerOptions, LogContext, LogFunction, LogLevel } from './lib/logger.ts'
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
