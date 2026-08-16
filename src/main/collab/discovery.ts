import { createSocket, type Socket as UdpSocket } from 'dgram'
import { COLLAB_MAGIC, COLLAB_UDP_PORT } from '../../shared/types'

export type PresenceRole = 'solo' | 'host' | 'guest'

export type Presence = {
  magic: string
  type: 'presence'
  peerId: string
  displayName: string
  startedAt: number
  role: PresenceRole
  tcpPort: number | null
  hostId: string | null
  hostAddress?: string
}

const PEER_TTL_MS = 4000

export class LanDiscovery {
  private socket: UdpSocket | null = null
  private advertiseTimer: NodeJS.Timeout | null = null
  private presence: Omit<Presence, 'magic' | 'type' | 'hostAddress'> | null = null
  private peers = new Map<string, Presence & { lastSeen: number }>()
  onChange: (() => void) | null = null

  async start(): Promise<void> {
    if (this.socket) return
    const socket = createSocket({ type: 'udp4', reuseAddr: true })
    this.socket = socket
    await new Promise<void>((resolve, reject) => {
      socket.once('error', reject)
      socket.bind(COLLAB_UDP_PORT, () => {
        socket.setBroadcast(true)
        socket.removeListener('error', reject)
        resolve()
      })
    })
    socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString('utf8')) as Presence
        if (data.magic !== COLLAB_MAGIC || data.type !== 'presence') return
        if (!this.presence || data.peerId === this.presence.peerId) return
        this.peers.set(data.peerId, {
          ...data,
          hostAddress: rinfo.address,
          lastSeen: Date.now()
        })
        this.onChange?.()
      } catch {
        /* ignore */
      }
    })
  }

  setPresence(next: Omit<Presence, 'magic' | 'type' | 'hostAddress'>): void {
    this.presence = next
    this.stopAdvertiseTimer()
    const send = (): void => {
      if (!this.socket || !this.presence) return
      const payload: Presence = { ...this.presence, magic: COLLAB_MAGIC, type: 'presence' }
      const buf = Buffer.from(JSON.stringify(payload), 'utf8')
      this.socket.send(buf, COLLAB_UDP_PORT, '255.255.255.255')
      this.socket.send(buf, COLLAB_UDP_PORT, '127.0.0.1')
    }
    send()
    this.advertiseTimer = setInterval(send, 1500)
  }

  others(): Array<Presence & { lastSeen: number }> {
    const now = Date.now()
    for (const [id, peer] of this.peers) {
      if (now - peer.lastSeen > PEER_TTL_MS) this.peers.delete(id)
    }
    return [...this.peers.values()]
  }

  close(): void {
    this.stopAdvertiseTimer()
    this.presence = null
    this.peers.clear()
    this.socket?.close()
    this.socket = null
  }

  private stopAdvertiseTimer(): void {
    if (this.advertiseTimer) {
      clearInterval(this.advertiseTimer)
      this.advertiseTimer = null
    }
  }
}

export function electHub(
  members: Array<{ peerId: string; startedAt: number }>
): { peerId: string; startedAt: number } | null {
  if (members.length < 2) return null
  return [...members].sort((a, b) => {
    if (a.startedAt !== b.startedAt) return a.startedAt - b.startedAt
    return a.peerId < b.peerId ? -1 : 1
  })[0]
}
