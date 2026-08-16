import { createSocket, type Socket as UdpSocket } from 'dgram'
import { COLLAB_MAGIC, COLLAB_UDP_PORT } from '../../shared/types'

export type Advertisement = {
  magic: string
  type: 'advertise' | 'probe-reply'
  roomId: string
  sessionName: string
  tcpPort: number
  hostId: string
  hostAddress?: string
}

export type Probe = {
  magic: string
  type: 'probe'
  roomId: string
}

export class LanDiscovery {
  private socket: UdpSocket | null = null
  private advertiseTimer: NodeJS.Timeout | null = null
  private ad: Advertisement | null = null

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
        const data = JSON.parse(msg.toString('utf8')) as Probe | Advertisement
        if (data.magic !== COLLAB_MAGIC) return
        if (data.type === 'probe' && this.ad && data.roomId === this.ad.roomId) {
          const reply = Buffer.from(JSON.stringify({ ...this.ad, type: 'probe-reply' }), 'utf8')
          socket.send(reply, rinfo.port, rinfo.address)
        }
      } catch {
        /* ignore */
      }
    })
  }

  advertise(ad: Omit<Advertisement, 'magic' | 'type'>): void {
    this.ad = { ...ad, magic: COLLAB_MAGIC, type: 'advertise' }
    this.stopAdvertiseTimer()
    const send = (): void => {
      if (!this.socket || !this.ad) return
      const buf = Buffer.from(JSON.stringify(this.ad), 'utf8')
      this.socket.send(buf, COLLAB_UDP_PORT, '255.255.255.255')
      this.socket.send(buf, COLLAB_UDP_PORT, '127.0.0.1')
    }
    send()
    this.advertiseTimer = setInterval(send, 1500)
  }

  stopAdvertising(): void {
    this.ad = null
    this.stopAdvertiseTimer()
  }

  async findRoom(roomId: string, timeoutMs = 3500): Promise<Advertisement | null> {
    await this.start()
    const socket = this.socket
    if (!socket) return null

    return new Promise((resolve) => {
      const onMessage = (msg: Buffer, rinfo: { address: string }): void => {
        try {
          const data = JSON.parse(msg.toString('utf8')) as Advertisement
          if (data.magic !== COLLAB_MAGIC) return
          if ((data.type === 'advertise' || data.type === 'probe-reply') && data.roomId === roomId) {
            cleanup()
            resolve({ ...data, hostAddress: rinfo.address })
          }
        } catch {
          /* ignore */
        }
      }
      const cleanup = (): void => {
        socket.off('message', onMessage)
        clearTimeout(timer)
      }
      socket.on('message', onMessage)
      const probe: Probe = { magic: COLLAB_MAGIC, type: 'probe', roomId }
      const buf = Buffer.from(JSON.stringify(probe), 'utf8')
      socket.send(buf, COLLAB_UDP_PORT, '255.255.255.255')
      socket.send(buf, COLLAB_UDP_PORT, '127.0.0.1')
      const timer = setTimeout(() => {
        cleanup()
        resolve(null)
      }, timeoutMs)
    })
  }

  close(): void {
    this.stopAdvertising()
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
