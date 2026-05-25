import test from 'node:test'
import assert from 'node:assert'
import { getLocalIp } from './ip.ts'

test('getLocalIp returns a valid IPv4 address', () => {
  const ip = getLocalIp()
  assert.match(ip, /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)
})
