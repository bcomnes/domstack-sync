import { watch } from 'chokidar'
import { EventEmitter } from 'node:events'
import picomatch from 'picomatch'
import type { FileWatchEntry, FileWatchObject } from './options.ts'

export interface WatchEvent {
  event: string
  path: string
  namespace: string
  timestamp: number
}

export interface WatcherOptions {
  files: FileWatchEntry[]
  ignored?: string[]
  cwd?: string
  debounceMs?: number
  watchOptions?: Record<string, unknown>
  watchEvents?: string[]
}

export class BsWatcher extends EventEmitter {
  private readonly watchers: Array<ReturnType<typeof watch>> = []
  private debounceTimer: NodeJS.Timeout | null = null
  private pendingEvents: WatchEvent[] = []
  private readonly debounceMs: number
  private readonly isIgnored: ((path: string) => boolean) | null
  private readonly watchEvents: string[]

  constructor (opts: WatcherOptions) {
    super()
    this.debounceMs = opts.debounceMs ?? 300
    this.watchEvents = opts.watchEvents ?? ['change']
    this.isIgnored = opts.ignored?.length
      ? picomatch(opts.ignored)
      : null

    const defaultWatchOpts: Record<string, unknown> = {
      ignoreInitial: true,
      ...opts.watchOptions,
    }
    if (opts.cwd) defaultWatchOpts['cwd'] = opts.cwd

    const globEntries = opts.files.filter((entry): entry is string => typeof entry === 'string')
    if (globEntries.length > 0) {
      this.watchers.push(this.createWatcher(globEntries, defaultWatchOpts, this.handleDefaultWatchEvent))
    }

    for (const entry of opts.files.filter(isWatchObject)) {
      const watchOpts = entry.options ?? defaultWatchOpts
      const handler = typeof entry.fn === 'function'
        ? entry.fn
        : this.handleDefaultWatchEvent
      this.watchers.push(this.createWatcher(entry.match, watchOpts, handler))
    }
  }

  private createWatcher (
    match: string | string[],
    options: Record<string, unknown>,
    handler: (event: string, path: string) => void
  ): ReturnType<typeof watch> {
    const watcher = watch(match, options)
    watcher.on('all', handler)
    return watcher
  }

  private handleDefaultWatchEvent = (event: string, filePath: string): void => {
    if (this.isIgnored?.(filePath)) return
    if (!this.watchEvents.includes(event)) return
    this.debounce({ event, path: filePath, namespace: 'core', timestamp: Date.now() })
  }

  private debounce (evt: WatchEvent): void {
    this.pendingEvents.push(evt)
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      const batch = this.pendingEvents
      this.pendingEvents = []
      this.emit('changes', batch)
      for (const event of batch) {
        this.emit('change', event)
      }
    }, this.debounceMs)
  }

  close (): Promise<void> {
    return Promise.all(this.watchers.map(watcher => watcher.close())).then(() => undefined)
  }
}

function isWatchObject (entry: FileWatchEntry): entry is FileWatchObject {
  return typeof entry === 'object' && entry !== null && 'match' in entry
}
