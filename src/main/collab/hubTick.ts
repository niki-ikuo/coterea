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
  /** ハブになれない相手を一時除外（peerId → 除外期限） */
  ignoredUntil?: Map<string, number>
  now?: number
  /** いまハブ化を待っている相手と、待ち始めた時刻 */
  awaitingHost?: { peerId: string; since: number } | null
}

export type HubTickDecision =
  | { action: 'idle' }
  | { action: 'demote' }
  | { action: 'join'; host: HubPeer }
  | { action: 'become-host'; ignorePeerId?: string }
  | { action: 'await-host'; peerId: string; ignorePeerId?: string }

/** 最古参がハブを名乗らないときの待機上限 */
export const HOST_ELECTION_WAIT_MS = 6000

/** ハブになれなかった peer を選挙から外す期間 */
export const STALE_SOLO_IGNORE_MS = 20_000

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

function isIgnored(peerId: string, ignoredUntil: Map<string, number> | undefined, now: number): boolean {
  if (!ignoredUntil) return false
  const until = ignoredUntil.get(peerId)
  return until != null && until > now
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

  const now = input.now ?? Date.now()
  const visible = input.others.filter((peer) => !isIgnored(peer.peerId, input.ignoredUntil, now))

  const liveHost = visible.find((peer) => peer.role === 'host' && peer.tcpPort)
  if (liveHost) return { action: 'join', host: liveHost }

  const members = [
    { peerId: input.localPeerId, startedAt: input.startedAt },
    ...visible.map((peer) => ({ peerId: peer.peerId, startedAt: peer.startedAt }))
  ]
  const elected = electHub(members)
  if (!elected) return { action: 'idle' }
  if (elected.peerId === input.localPeerId) return { action: 'become-host' }

  const waitingSame =
    input.awaitingHost?.peerId === elected.peerId ? now - input.awaitingHost.since : 0
  if (waitingSame < HOST_ELECTION_WAIT_MS) {
    return { action: 'await-host', peerId: elected.peerId }
  }

  // 最古参がハブを名乗らない → 外して再選出（自分が最古ならハブになる）
  const rest = visible.filter((peer) => peer.peerId !== elected.peerId)
  const again = electHub([
    { peerId: input.localPeerId, startedAt: input.startedAt },
    ...rest.map((peer) => ({ peerId: peer.peerId, startedAt: peer.startedAt }))
  ])
  if (!again || again.peerId === input.localPeerId) {
    return { action: 'become-host', ignorePeerId: elected.peerId }
  }
  return { action: 'await-host', peerId: again.peerId, ignorePeerId: elected.peerId }
}
