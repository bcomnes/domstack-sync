import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

const sessionIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const defaultLeaseMs = 30_000

export type SessionKind = 'domstack-sync' | 'domstack-watch'
export type SessionState = 'starting' | 'watching' | 'stopping'

export interface SessionDetails {
  kind: SessionKind
  state: SessionState
  cwd: string
  source?: string
  destination?: string
  roots?: string[]
  port?: number | null
  uiPort?: number | null
}

export interface SessionInfo extends SessionDetails {
  version: 1
  id: string
  pid: number
  startedAt: number
  port: number | null
  uiPort: number | null
  url: string | null
  uiUrl: string | null
}

export interface SessionRegistration {
  id: string
  update (patch: Partial<Omit<SessionDetails, 'kind'>>): Promise<SessionInfo>
  dispose (): Promise<void>
}

export interface SessionRegistryOptions {
  directory?: string
  leaseMs?: number
  onRefreshError?: (error: unknown) => void
}

export interface SessionRegistry {
  register (details: SessionDetails): Promise<SessionRegistration>
  list (): Promise<SessionInfo[]>
  get (id: string): Promise<SessionInfo | null>
}

function defaultDirectory (): string {
  if (process.platform === 'win32') {
    return join(process.env['LOCALAPPDATA'] || join(homedir(), 'AppData', 'Local'), 'domstack', 'sessions')
  }
  const runtimeDir = process.env['XDG_RUNTIME_DIR']
  return runtimeDir && isAbsolute(runtimeDir)
    ? join(runtimeDir, 'domstack-sessions')
    : join(tmpdir(), `domstack-sessions-${process.getuid?.()}`)
}

function isErrno (error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === code
}

function isProcessAlive (pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (isErrno(error, 'ESRCH')) return false
    if (isErrno(error, 'EPERM')) return true
    throw error
  }
}

function validPort (value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65535
}

function absolutePath (value: unknown): value is string {
  return typeof value === 'string' && isAbsolute(value)
}

function sessionInfo (record: Record<string, unknown>): SessionInfo | null {
  const { version, id, pid, startedAt, kind, state, cwd, source, destination, roots } = record
  if (version !== 1 || typeof id !== 'string' || !sessionIdPattern.test(id)) return null
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid < 1 || pid > 0x7fffffff) return null
  if (typeof startedAt !== 'number' || !Number.isSafeInteger(startedAt) || startedAt < 0) return null
  if (kind !== 'domstack-sync' && kind !== 'domstack-watch') return null
  if (state !== 'starting' && state !== 'watching' && state !== 'stopping') return null
  if (!absolutePath(cwd)) return null
  const port = validPort(record['port']) ? record['port'] : null
  const uiPort = validPort(record['uiPort']) ? record['uiPort'] : null
  return {
    version,
    id,
    pid,
    startedAt,
    kind,
    state,
    cwd,
    ...(absolutePath(source) ? { source } : {}),
    ...(absolutePath(destination) ? { destination } : {}),
    ...(Array.isArray(roots) && roots.every(absolutePath) ? { roots: [...roots] } : {}),
    port,
    uiPort,
    url: port === null ? null : `http://localhost:${port}`,
    uiUrl: uiPort === null ? null : `http://127.0.0.1:${uiPort}`,
  }
}

export function createSessionRegistry (options: SessionRegistryOptions = {}): SessionRegistry {
  const directory = resolve(options.directory ?? (process.env['DOMSTACK_SESSION_DIR'] || defaultDirectory()))
  const leaseMs = options.leaseMs ?? defaultLeaseMs
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 30 || leaseMs > 0x7fffffff) {
    throw new RangeError('Session lease must be between 30 and 2147483647 milliseconds')
  }

  async function checkDirectory (create: boolean): Promise<boolean> {
    if (create) await mkdir(directory, { recursive: true, mode: 0o700 })
    try {
      const stat = await lstat(directory)
      const uid = process.getuid?.()
      if (!stat.isDirectory() || (uid !== undefined && (stat.uid !== uid || (stat.mode & 0o077) !== 0))) {
        throw new Error(`Session registry must be an owner-only directory: ${directory}`)
      }
      return true
    } catch (error) {
      if (!create && isErrno(error, 'ENOENT')) return false
      throw error
    }
  }

  function filename (id: string): string {
    return join(directory, `${id}.json`)
  }

  async function publish (info: SessionInfo): Promise<void> {
    const temp = join(directory, `.${info.id}.${randomUUID()}.tmp`)
    try {
      await writeFile(temp, JSON.stringify({ ...info, expiresAt: Date.now() + leaseMs }), { flag: 'wx', mode: 0o600 })
      await rename(temp, filename(info.id))
    } finally {
      await rm(temp, { force: true })
    }
  }

  async function read (id: string): Promise<SessionInfo | null> {
    const path = filename(id)
    try {
      const stat = await lstat(path)
      if (!stat.isFile()) return null
      const record: unknown = JSON.parse(await readFile(path, 'utf8'))
      if (typeof record !== 'object' || record === null) return null
      const data = record as Record<string, unknown>
      const info = sessionInfo(data)
      if (!info || info.id !== id) return null
      // Never unlink based on a lease: a paused writer may refresh it just as
      // a reader notices expiry. A dead PID cannot publish another update.
      if (!isProcessAlive(info.pid)) {
        await rm(path, { force: true }).catch(() => {})
        return null
      }
      const expiresAt = data['expiresAt']
      return typeof expiresAt === 'number' && Number.isSafeInteger(expiresAt) && expiresAt > Date.now() ? info : null
    } catch (error) {
      if (error instanceof SyntaxError || isErrno(error, 'ENOENT')) return null
      throw error
    }
  }

  return {
    async register (details) {
      const id = randomUUID()
      const initial = sessionInfo({ ...details, version: 1, id, pid: process.pid, startedAt: Date.now() })
      if (!initial) throw new TypeError('Invalid session details')
      await checkDirectory(true)
      let current = initial
      await publish(current)
      let tail = Promise.resolve()
      let disposal: Promise<void> | undefined
      function enqueue<T> (task: () => Promise<T>): Promise<T> {
        const result = tail.then(task)
        tail = result.then(() => {}, () => {})
        return result
      }
      let refreshPending = false
      const timer = setInterval(() => {
        if (refreshPending || disposal) return
        refreshPending = true
        enqueue(() => publish(current)).then(
          () => { refreshPending = false },
          error => {
            refreshPending = false
            options.onRefreshError?.(error)
          }
        )
      }, Math.floor(leaseMs / 3)).unref()
      return {
        id,
        async update (patch) {
          if (disposal) throw new Error('Session has been disposed')
          return enqueue(async () => {
            const next = sessionInfo({
              state: patch.state ?? current.state,
              cwd: patch.cwd ?? current.cwd,
              source: patch.source ?? current.source,
              destination: patch.destination ?? current.destination,
              roots: patch.roots ?? current.roots,
              port: patch.port === undefined ? current.port : patch.port,
              uiPort: patch.uiPort === undefined ? current.uiPort : patch.uiPort,
              version: 1,
              id,
              pid: current.pid,
              startedAt: current.startedAt,
              kind: current.kind
            })
            if (!next) throw new TypeError('Invalid session details')
            await publish(next)
            current = next
            return structuredClone(next)
          })
        },
        dispose () {
          if (disposal) return disposal
          clearInterval(timer)
          disposal = enqueue(() => rm(filename(id), { force: true }))
          return disposal
        },
      }
    },
    async list () {
      if (!await checkDirectory(false)) return []
      const files = await readdir(directory)
      const ids = files.filter(name => name.endsWith('.json')).map(name => name.slice(0, -5)).filter(id => sessionIdPattern.test(id))
      const records = await Promise.all(ids.map(read))
      return records.filter(info => info !== null).sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
    },
    async get (id) {
      if (!sessionIdPattern.test(id) || !await checkDirectory(false)) return null
      return read(id)
    },
  }
}
