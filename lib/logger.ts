import pino from 'pino'
import pretty from 'pino-pretty'
import { Writable } from 'node:stream'
import type { Logger as PinoLogger } from 'pino'
import type { Writable as WritableType } from 'node:stream'

export type LogLevel = 'silent' | 'debug' | 'info' | 'warn' | 'error'
type LogMethod = Exclude<LogLevel, 'silent'>
type LogStream = Pick<WritableType, 'write'>
export type LogContext = Record<string, unknown>
export type LogFunction = {
  (message: string, ...args: unknown[]): void
  (context: LogContext, message: string, ...args: unknown[]): void
}

export interface LoggerStreams {
  stdout?: LogStream
  stderr?: LogStream
}

export interface AccessUrls {
  local?: string | null
  external?: string | null
  ui?: string | null
  uiExternal?: string | null
}

export interface LoggerOptions {
  prefix?: string | false
}

export interface Logger {
  pino: PinoLogger
  child: (bindings: LogContext, options?: LoggerOptions) => Logger
  debug: LogFunction
  info: LogFunction
  warn: LogFunction
  error: LogFunction
  unprefixed: (level: LogMethod, message: string, ...args: unknown[]) => void
  urls: (urls: AccessUrls) => void
}

const PREFIX = '[domstack-sync]'

const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 50,
} as const satisfies Record<LogLevel, number>

export function createLogger (level: LogLevel | string = 'info', streams: LoggerStreams = {}, options: LoggerOptions = {}): Logger {
  const logLevel = normalizeLogLevel(level)
  const rawStdout = streams.stdout ?? process.stdout
  const stdout = toWritableStream(rawStdout)
  const stream = pretty({
    colorize: isTty(rawStdout),
    hideObject: false,
    singleLine: true,
    ignore: 'pid,hostname,time,level,logPrefix,component,req,reqId,res,responseTime',
    messageFormat: formatPrettyMessage,
    destination: stdout,
    sync: true,
  })
  const pinoLogger = pino({
    level: logLevel,
    base: null,
    timestamp: false,
  }, stream)

  return wrapPinoLogger(pinoLogger, options)
}

export function wrapPinoLogger (pinoLogger: PinoLogger, options: LoggerOptions = {}): Logger {
  const prefix = options.prefix ?? PREFIX

  const unprefixed = (method: LogMethod, message: string, ...args: unknown[]): void => {
    emit(pinoLogger, method, { logPrefix: false }, message, args)
  }

  const log = (method: LogMethod, input: string | LogContext, ...args: unknown[]): void => {
    if (typeof input === 'string') {
      emit(pinoLogger, method, { logPrefix: prefix }, input, args)
      return
    }

    const [message, ...messageArgs] = args
    emit(pinoLogger, method, { ...input, logPrefix: prefix }, String(message ?? ''), messageArgs)
  }

  return {
    pino: pinoLogger,
    child: (bindings, childOptions) => wrapPinoLogger(pinoLogger.child(bindings), { prefix, ...childOptions }),
    debug: (input, ...args) => log('debug', input, ...args),
    info: (input, ...args) => log('info', input, ...args),
    warn: (input, ...args) => log('warn', input, ...args),
    error: (input, ...args) => log('error', input, ...args),
    unprefixed,
    urls: urls => logAccessUrls(urls, { info: (message, ...args) => log('info', message, ...args), unprefixed }),
  }
}

function emit (logger: PinoLogger, level: LogMethod, bindings: Record<string, unknown>, message: string, args: unknown[]): void {
  if (level === 'debug') logger.debug(bindings, message, ...args)
  else if (level === 'info') logger.info(bindings, message, ...args)
  else if (level === 'warn') logger.warn(bindings, message, ...args)
  else logger.error(bindings, message, ...args)
}

function normalizeLogLevel (level: LogLevel | string): LogLevel {
  return isLogLevel(level) ? level : 'info'
}

function isLogLevel (level: string): level is LogLevel {
  return level in LOG_LEVELS
}

function toWritableStream (stream: LogStream): NodeJS.WritableStream {
  return new Writable({
    write (chunk, _encoding, callback) {
      stream.write(String(chunk))
      callback()
    },
  })
}

function isTty (stream: LogStream): boolean {
  return Boolean((stream as Partial<NodeJS.WriteStream>).isTTY)
}

function formatPrettyMessage (log: Record<string, unknown>, messageKey: string): string {
  const rawMessage = log[messageKey]
  const message = typeof rawMessage === 'string' ? rawMessage : String(rawMessage ?? '')
  const formatted = log['component'] === 'fastify'
    ? formatFastifyMessage(log, message)
    : message

  if (log['logPrefix'] === false) return formatted
  const prefix = typeof log['logPrefix'] === 'string' ? log['logPrefix'] : PREFIX
  return `${prefix} ${formatted}`
}

function formatFastifyMessage (log: Record<string, unknown>, fallback: string): string {
  const req = getRecord(log['req'])
  const res = getRecord(log['res'])
  const method = typeof req?.['method'] === 'string' ? req['method'] : null
  const url = typeof req?.['url'] === 'string' ? req['url'] : null

  if (res) {
    const statusCode = typeof res['statusCode'] === 'number' ? res['statusCode'] : null
    const responseTime = typeof log['responseTime'] === 'number' ? `${Math.round(log['responseTime'])}ms` : null
    return [
      'HTTP response:',
      method,
      url,
      statusCode ? `-> ${statusCode}` : null,
      responseTime ? `(${responseTime})` : null,
    ].filter(Boolean).join(' ')
  }

  if (req) {
    return ['HTTP request:', method, url].filter(Boolean).join(' ')
  }

  return fallback
}

function getRecord (value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function logAccessUrls (
  urls: AccessUrls,
  logger: Pick<Logger, 'info' | 'unprefixed'>
): void {
  const entries = [
    ['local', urls.local],
    ['external', urls.external],
    ['ui', urls.ui],
    ['ui-external', urls.uiExternal],
  ] as const
  const filtered = entries.filter((entry): entry is [typeof entry[0], string] => typeof entry[1] === 'string' && entry[1].length > 0)
  if (filtered.length === 0) return

  const longestName = Math.max(...filtered.map(([key]) => getUrlLabel(key).length))
  const longestUrl = Math.max(...filtered.map(([, url]) => url.length))
  const underline = '-'.repeat(longestName + longestUrl + 4)
  let splitUi = false

  logger.info('Access URLs:')
  logger.unprefixed('info', ' %s', underline)

  for (const [key, url] of filtered) {
    if (!splitUi && key.startsWith('ui')) {
      splitUi = true
      logger.unprefixed('info', ' %s', underline)
    }

    logger.unprefixed('info', ' %s: %s', getUrlLabel(key).padStart(longestName), url)
  }

  logger.unprefixed('info', ' %s', underline)
}

function getUrlLabel (key: 'local' | 'external' | 'ui' | 'ui-external'): string {
  if (key === 'ui') return 'UI'
  if (key === 'ui-external') return 'UI External'
  return key.charAt(0).toUpperCase() + key.slice(1)
}
