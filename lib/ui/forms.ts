export type FormBody = Record<string, string | string[] | undefined>

export function formBoolean (body: { active?: string } | FormBody, key = 'active'): boolean {
  const value = (body as FormBody)[key]
  return Array.isArray(value) ? value.includes('true') : value === 'true'
}

export function formString (value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export function parseNumber (value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function removeUndefined<T extends Record<string, unknown>> (input: T): Partial<T> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Partial<T>
}
