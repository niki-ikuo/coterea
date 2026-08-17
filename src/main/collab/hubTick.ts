import { electHub, type PresenceRole } from './discovery'

export type HubRole = PresenceRole

export type HubPeer = {
  peerId: string
  startedAt: number
  role: HubRole
  tcpPort: number | null
  hostAddress?: string
}

export type HubTickInput = {
  enabled: boolean
  leaving: boolean
  connecting: boolean
  role: HubRole
  localPeerId: string
  startedAt: number
  holdHost: boolean
  clientCount: number
  others: HubPeer[]
}

export type HubTickDecision =
  | { action: 'idle' }
  | { action: 'demote' }
  | { action: 'join'; host: HubPeer }
  | { action: 'become-host' }

export function failedHostKey(peer: { peerId: string; tcpPort: number; hostAddress: string }): string {
  const address = peer.hostAddress.startsWith('::ffff:') ? peer.hostAddress.slice(7) : peer.hostAddress
  return `${peer.peerId}|${address}|${peer.tcpPort}`
}

export function filterViablePeers(
  others: HubPeer[],
  failedUntil: Map<string, number>,
  now: number
): HubPeer[] {
  return others.filter((peer) => {
    if (!peer.tcpPort || !peer.hostAddress) return true
    const until = failedUntil.get(
      failedHostKey({ peerId: peer.peerId, tcpPort: peer.tcpPort, hostAddress: peer.hostAddress })
    )
    return until == null || until <= now
  })
}

export function decideHubTick(input: HubTickInput): HubTickDecision {
  if (!input.enabled || input.leaving || input.connecting) return { action: 'idle' }

  if (input.role === 'host') {
    if (input.clientCount === 0 && input.others.length === 0 && !input.holdHost) {
      return { action: 'demote' }
    }
    return { action: 'idle' }
  }

  if (input.role === 'guest') return { action: 'idle' }

  const liveHost = input.others.find((peer) => peer.role === 'host' && peer.tcpPort)
  if (liveHost) return { action: 'join', host: liveHost }

  const elected = electHub([
    { peerId: input.localPeerId, startedAt: input.startedAt },
    ...input.others.map((peer) => ({ peerId: peer.peerId, startedAt: peer.startedAt }))
  ])
  if (elected?.peerId === input.localPeerId) return { action: 'become-host' }
  return { action: 'idle' }
}
