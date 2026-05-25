import pino from 'pino'

export type LogLevel = 'silent' | 'info' | 'debug' | 'warn' | 'error'

export function createLogger (level: LogLevel = 'info') {
  const isDev = process.stdout.isTTY

  const opts = isDev
    ? { level, transport: { target: 'pino-pretty', options: { colorize: true } } }
    : { level }

  return pino(opts)
}

export type Logger = ReturnType<typeof createLogger>
