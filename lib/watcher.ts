import { watch } from 'chokidar'
import { EventEmitter } from 'node:events'
import picomatch from 'picomatch'

export interface WatchEvent {
  event: string
  path: string
  namespace: string
}

export interface WatcherOptions {
  files: string[]
  ignored?: string[]
  cwd?: string
  debounceMs?: number
  watchOptions?: Record<string, unknown>
}

export class BsWatcher extends EventEmitter {
  private readonly watcher: ReturnType<typeof watch>
  private debounceTimer: NodeJS.Timeout | null = null
  private readonly debounceMs: number
  private readonly isIgnored: ((path: string) => boolean) | null

  constructor (opts: WatcherOptions) {
    super()
    this.debounceMs = opts.debounceMs ?? 300
    this.isIgnored = opts.ignored?.length
      ? picomatch(opts.ignored)
      : null

    const watchOpts: Record<string, unknown> = {
      ignoreInitial: true,
      ...opts.watchOptions,
    }
    if (opts.cwd) watchOpts['cwd'] = opts.cwd

    this.watcher = watch(opts.files, watchOpts)

    this.watcher.on('all', (event, filePath) => {
      if (this.isIgnored?.(filePath)) return
      this.debounce({ event, path: filePath, namespace: 'core' })
    })
  }

  private debounce (evt: WatchEvent): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      this.emit('change', evt)
    }, this.debounceMs)
  }

  close (): Promise<void> {
    return this.watcher.close()
  }
}
