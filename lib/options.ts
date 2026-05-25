import type { FromSchema, JSONSchema } from 'json-schema-to-ts'

export const ghostModeSchema = {
  type: 'object',
  properties: {
    scroll: { type: 'boolean' },
    clicks: { type: 'boolean' },
    forms: { type: 'boolean' },
  },
  additionalProperties: false,
} as const satisfies JSONSchema

export const bsOptionsSchema = {
  type: 'object',
  properties: {
    port: { type: 'integer', minimum: 1, maximum: 65535 },
    files: { type: 'array', items: { type: 'string' } },
    server: { oneOf: [{ type: 'string' }, { const: false }] },
    ghostMode: ghostModeSchema,
    logLevel: { type: 'string', enum: ['silent', 'info', 'debug'] as const },
    ui: {
      oneOf: [
        { type: 'boolean' },
        { type: 'object', properties: { port: { type: 'integer' } }, required: ['port'], additionalProperties: false },
      ],
    },
    notify: { type: 'boolean' },
    cors: { type: 'boolean' },
    reloadDelay: { type: 'number' },
    reloadDebounce: { type: 'number' },
    injectChanges: { type: 'boolean' },
    watchOptions: { type: 'object', additionalProperties: {} },
    cwd: { type: 'string' },
  },
  additionalProperties: false,
} as const satisfies JSONSchema

export type BsOptionsInput = FromSchema<typeof bsOptionsSchema>

export interface BsOptions {
  port: number
  files: string[]
  server: string | false
  ghostMode: { scroll: boolean; clicks: boolean; forms: boolean }
  logLevel: 'silent' | 'info' | 'debug'
  ui: boolean | { port: number }
  notify: boolean
  cors: boolean
  reloadDelay: number
  reloadDebounce: number
  injectChanges: boolean
  watchOptions: Record<string, unknown>
  cwd: string
}

export function parseOptions (raw: BsOptionsInput = {}): BsOptions {
  const ghost = raw.ghostMode ?? {}
  return {
    port: raw.port ?? 3000,
    files: raw.files ?? [],
    server: raw.server ?? false,
    ghostMode: {
      scroll: ghost.scroll ?? true,
      clicks: ghost.clicks ?? true,
      forms: ghost.forms ?? true,
    },
    logLevel: raw.logLevel ?? 'info',
    ui: raw.ui ?? true,
    notify: raw.notify ?? true,
    cors: raw.cors ?? false,
    reloadDelay: raw.reloadDelay ?? 0,
    reloadDebounce: raw.reloadDebounce ?? 500,
    injectChanges: raw.injectChanges ?? true,
    watchOptions: (raw.watchOptions as Record<string, unknown>) ?? {},
    cwd: raw.cwd ?? process.cwd(),
  }
}
