import { log } from './vendor/logger.ts'

export function handleReload (): void {
  log.info('Reloading...')
  location.reload()
}

export function handleCssReload (path: string): void {
  const fileName = path.split('/').pop() ?? path
  const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
  const target = links.find(l => l.href.includes(fileName))

  if (target) {
    const url = new URL(target.href)
    url.searchParams.set('_bs', String(Date.now()))
    target.href = url.toString()
    log.info(`CSS injected: ${fileName}`)
  } else {
    handleReload()
  }
}

export function handleNotify (message: string): void {
  let overlay = document.getElementById('__bs-notify__')
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = '__bs-notify__'
    overlay.style.cssText = [
      'position:fixed', 'top:10px', 'right:10px', 'z-index:99999',
      'background:#1B2032', 'color:#fff', 'padding:8px 14px',
      'border-radius:4px', 'font-family:sans-serif', 'font-size:13px',
      'pointer-events:none', 'transition:opacity 0.3s',
    ].join(';')
    document.body.appendChild(overlay)
  }
  overlay.textContent = message
  overlay.style.opacity = '1'
  setTimeout(() => { if (overlay) overlay.style.opacity = '0' }, 2000)
}

export function handleScroll (x: number, y: number): void {
  window.scrollTo(x, y)
}

export function handleInput (id: string, value: string): void {
  const el = (document.getElementById(id) ?? document.querySelector<HTMLInputElement>(`[name="${id}"]`)) as HTMLInputElement | null
  if (!el) return
  if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = value === 'true'
  } else {
    el.value = value
  }
}
