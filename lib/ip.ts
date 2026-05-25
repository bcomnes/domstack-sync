import { networkInterfaces } from 'node:os'

export function getLocalIp (): string {
  for (const [name, ifaces] of Object.entries(networkInterfaces())) {
    if (/^(tun|utun|tap|vpn)/i.test(name)) continue
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address
    }
  }
  return '127.0.0.1'
}
