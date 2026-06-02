import type { NetworkThrottleState, NetworkThrottleTarget } from './types.ts'

export const throttleTargets: NetworkThrottleTarget[] = [
  { active: false, title: 'DSL (2Mbs, 5ms RTT)', id: 'dsl', speed: 200, latency: 5, urls: [], order: 1 },
  { active: false, title: '4G (4Mbs, 20ms RTT)', id: '4g', speed: 400, latency: 10, urls: [], order: 2 },
  { active: false, title: '3G (750kbs, 100ms RTT)', id: '3g', speed: 75, latency: 50, urls: [], order: 3 },
  { active: false, title: 'Good 2G (450kbs, 150ms RTT)', id: 'good-2g', speed: 45, latency: 75, urls: [], order: 4 },
  { active: false, title: 'Regular 2G (250kbs, 300ms RTT)', id: '2g', speed: 25, latency: 150, urls: [], order: 5 },
  { active: false, title: 'GPRS (50kbs, 500ms RTT)', id: 'gprs', speed: 5, latency: 250, urls: [], order: 6 },
]

export function cloneNetworkThrottle (state: NetworkThrottleState): NetworkThrottleState {
  return {
    targets: state.targets.map(target => ({ ...target, urls: [...target.urls] })),
    servers: Object.fromEntries(Object.entries(state.servers).map(([port, server]) => [
      port,
      {
        port: server.port,
        urls: [...server.urls],
        speed: { ...server.speed, urls: [...server.speed.urls] },
      },
    ])),
  }
}
