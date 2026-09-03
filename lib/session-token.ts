import { randomBytes, timingSafeEqual } from 'node:crypto'

export function createSessionToken (): string {
  return randomBytes(24).toString('base64url')
}

export function appendSessionToken (url: string, token: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}token=${encodeURIComponent(token)}`
}

export function isAuthorizedWebSocketRequest (requestUrl: string | undefined, pathname: string, token: string): boolean {
  if (!requestUrl) return false
  const parsed = new URL(requestUrl, 'http://localhost')
  if (parsed.pathname !== pathname) return false

  const provided = parsed.searchParams.get('token')
  if (!provided) return false
  const expectedBuffer = Buffer.from(token)
  const providedBuffer = Buffer.from(provided)
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer)
}
