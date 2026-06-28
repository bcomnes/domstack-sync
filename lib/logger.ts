import pino from 'pino'
import pretty from 'pino-pretty'
import { Writable } from 'node:stream'
import type { LevelWithSilentOrString, Logger as PinoLogger } from 'pino'
import type { PrettyOptions } from 'pino-pretty'
import type { Writable as WritableType } from 'node:stream'

type LogMethod = 'debug' | 'info' | 'warn' | 'error'
type LogStream = Pick<WritableType, 'write'>
type PrettyMessageFormat = Exclude<NonNullable<PrettyOptions['messageFormat']>, string | false>

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

const PREFIX = '[domstack-sync]'

export function createLogger (level: LevelWithSilentOrString = 'info', streams: LoggerStreams = {}, options: LoggerOptions = {}): PinoLogger {
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
  const logger = pino({
    level,
    base: null,
    timestamp: false,
  }, stream)

  return logger.child({ logPrefix: options.prefix ?? PREFIX })
}

export function logAccessUrls (logger: PinoLogger, urls: AccessUrls): void {
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
  logUnprefixed(logger, 'info', ' %s', underline)

  for (const [key, url] of filtered) {
    if (!splitUi && key.startsWith('ui')) {
      splitUi = true
      logUnprefixed(logger, 'info', ' %s', underline)
    }

    logUnprefixed(logger, 'info', ' %s: %s', getUrlLabel(key).padStart(longestName), url)
  }

  logUnprefixed(logger, 'info', ' %s', underline)
}

function logUnprefixed (logger: PinoLogger, level: LogMethod, message: string, ...args: unknown[]): void {
  if (level === 'debug') logger.debug({ logPrefix: false }, message, ...args)
  else if (level === 'info') logger.info({ logPrefix: false }, message, ...args)
  else if (level === 'warn') logger.warn({ logPrefix: false }, message, ...args)
  else logger.error({ logPrefix: false }, message, ...args)
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

const formatPrettyMessage: PrettyMessageFormat = (log, messageKey) => {
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

function getUrlLabel (key: 'local' | 'external' | 'ui' | 'ui-external'): string {
  if (key === 'ui') return 'UI'
  if (key === 'ui-external') return 'UI External'
  return key.charAt(0).toUpperCase() + key.slice(1)
}
