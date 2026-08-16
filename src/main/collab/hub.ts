import { createServer, createConnection, type Server, type Socket } from 'net'
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { FrameReader, encodeFrame, type ControlMessage } from './frame'
import { LanDiscovery, electHub, type Presence } from './discovery'
import { PEER_COLORS, type DocMeta, type PeerInfo } from '../../shared/types'

type Role = 'solo' | 'host' | 'guest'

type TrackedSocket = {
  id: string
  socket: Socket
  reader: FrameReader
  displayName: string
  color: string
}

function colorFor(id: string, used: Set<string>): string {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const preferred = PEER_COLORS[Math.abs(hash) % PEER_COLORS.length]
  if (!used.has(preferred)) return preferred
  return PEER_COLORS.find((c) => !used.has(c)) ?? preferred
}

function normalizeHost(address?: string): string {
  if (!address) return '127.0.0.1'
  if (address.startsWith('::ffff:')) return address.slice(7)
  return address
}

export class CollabHub {
  readonly localPeerId = randomUUID()
  private role: Role = 'solo'
  private displayName = ''
  private startedAt = Date.now()
  private localColor = PEER_COLORS[0]
  private server: Server | null = null
  private tcpPort = 0
  private hostSocket: Socket | null = null
  private hostReader: FrameReader | null = null
  private hostId: string | null = null
  private clients = new Map<string, TrackedSocket>()
  private discovery = new LanDiscovery()
  private docs: DocMeta[] = []
  private win: BrowserWindow | null = null
  private leaving = false
  private connecting = false
  private welcomed = false
  private tickTimer: NodeJS.Timeout | null = null
  private enabled = false
  private connectError: string | null = null
  private netHint: string | null = null
  private stuckSince: number | null = null

  attachWindow(win: BrowserWindow): void {
    this.win = win
    win.on('closed', () => {
      if (this.win === win) this.win = null
      this.leaving = true
    })
  }

  async enable(displayName: string): Promise<{ localPeerId: string }> {
    this.displayName = displayName
    if (this.enabled) {
      this.publishPresence()
      this.emitState()
      return { localPeerId: this.localPeerId }
    }
    this.enabled = true
    this.role = 'solo'
    this.discovery.onChange = () => this.tick()
    await this.discovery.start()
    this.publishPresence()
    this.tickTimer = setInterval(() => this.tick(), 800)
    this.emitState()
    return { localPeerId: this.localPeerId }
  }

  setDisplayName(displayName: string): void {
    this.displayName = displayName
    this.publishPresence()
    this.emitState()
  }

  setSharedDocs(docs: DocMeta[]): void {
    this.docs = docs
    if (this.role === 'host') {
      this.broadcast({ type: 'docs', docs }, undefined, null)
    }
  }

  sendFromRenderer(msg: ControlMessage, binary?: Buffer): void {
    const stamped = { ...msg, peerId: this.localPeerId }
    if (this.role === 'host') {
      this.broadcast(stamped, binary, null)
    } else if (this.role === 'guest' && this.hostSocket) {
      this.hostSocket.write(encodeFrame(stamped, binary))
    }
  }

  async leave(): Promise<void> {
    await this.tearDownTcp()
    this.role = 'solo'
    this.publishPresence()
    this.emitState()
  }

  dispose(): void {
    this.leaving = true
    this.enabled = false
    this.win = null
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    void this.tearDownTcp()
    this.discovery.close()
  }

  private tick(): void {
    if (!this.enabled || this.leaving || this.connecting) return
    const others = this.discovery.others()

    if (this.role === 'host') {
      this.updateStuckHint(others.length, this.clients.size)
      if (this.clients.size === 0 && others.length === 0) {
        void this.demoteToSolo()
      }
      return
    }

    if (this.role === 'guest') {
      this.updateStuckHint(others.length, this.hostSocket ? 1 : 0)
      return
    }

    const liveHost = others.find((p) => p.role === 'host' && p.tcpPort)
    if (liveHost) {
      void this.connectAsGuest(liveHost)
      return
    }

    this.updateStuckHint(others.length, 0)

    const members = [
      { peerId: this.localPeerId, startedAt: this.startedAt },
      ...others.map((p) => ({ peerId: p.peerId, startedAt: p.startedAt }))
    ]
    const elected = electHub(members)
    if (elected?.peerId === this.localPeerId) {
      void this.becomeHost()
    }
  }

  private async becomeHost(): Promise<void> {
    if (this.role === 'host' || this.connecting) return
    this.connecting = true
    try {
      await this.startTcpServer()
      this.role = 'host'
      this.hostId = this.localPeerId
      this.connectError = null
      this.netHint = null
      this.stuckSince = null
      this.publishPresence()
      this.emitState()
      this.sendToRenderer({ type: 'became-host' }, Buffer.alloc(0))
    } finally {
      this.connecting = false
    }
  }

  private async startTcpServer(): Promise<void> {
    if (this.server) return
    this.server = createServer((socket) => this.onGuestSocket(socket))
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '0.0.0.0', () => {
        const addr = this.server!.address()
        if (addr && typeof addr === 'object') this.tcpPort = addr.port
        resolve()
      })
    })
  }

  private async connectAsGuest(host: Presence): Promise<void> {
    if (this.connecting || this.role === 'guest') return
    this.connecting = true
    this.welcomed = false
    this.role = 'guest'
    this.hostId = host.peerId
    this.connectError = null
    this.netHint = null
    this.publishPresence()
    this.emitState()
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('ホストからの応答がありません')), 4000)
        const socket = createConnection(
          { host: normalizeHost(host.hostAddress), port: host.tcpPort as number },
          () => {
            socket.write(
              encodeFrame({
                type: 'hello',
                peerId: this.localPeerId,
                displayName: this.displayName,
                color: this.localColor,
                startedAt: this.startedAt
              })
            )
          }
        )
        this.hostSocket = socket
        this.hostReader = new FrameReader()
        socket.on('data', (chunk) => {
          try {
            const frames = this.hostReader!.push(chunk)
            for (const frame of frames) {
              if (frame.msg.type === 'welcome' && !this.welcomed) {
                this.welcomed = true
                clearTimeout(timer)
                this.docs = (frame.msg.docs as DocMeta[]) ?? this.docs
                if (typeof frame.msg.color === 'string') this.localColor = frame.msg.color
                this.connectError = null
                this.netHint = null
                this.stuckSince = null
                this.sendToRenderer({ type: 'became-guest', docs: this.docs }, Buffer.alloc(0))
                this.emitState()
                resolve()
              } else {
                this.sendToRenderer(frame.msg, frame.binary)
              }
            }
          } catch (err) {
            clearTimeout(timer)
            reject(err)
          }
        })
        socket.on('error', (err) => {
          clearTimeout(timer)
          reject(err)
        })
        socket.on('close', () => {
          if (this.welcomed && this.role === 'guest' && !this.leaving) {
            this.onHostLost()
          }
        })
      })
    } catch (err) {
      this.hostSocket?.destroy()
      this.hostSocket = null
      this.hostReader = null
      this.role = 'solo'
      this.hostId = null
      this.welcomed = false
      this.connectError =
        err instanceof Error && err.message === 'ホストからの応答がありません'
          ? 'ハブへの TCP 接続がタイムアウトしました。Windows ファイアウォールで Coterea を許可するか、無線 AP の端末間通信禁止（クライアント分離）を確認してください。'
          : 'ハブへの TCP 接続に失敗しました。ファイアウォール、AP の隔離、別サブネットの可能性があります。'
      this.netHint = this.connectError
      this.publishPresence()
      this.emitState()
    } finally {
      this.connecting = false
      this.emitState()
    }
  }

  private onHostLost(): void {
    this.hostSocket = null
    this.hostReader = null
    this.hostId = null
    this.role = 'solo'
    this.welcomed = false
    this.connectError = null
    this.netHint = 'ハブが切断されました。残りの最古参が引き継ぎ、文書を再同期します。'
    this.publishPresence()
    this.sendToRenderer({ type: 'host-lost' }, Buffer.alloc(0))
    this.emitState()
  }

  private async demoteToSolo(): Promise<void> {
    await this.tearDownTcp()
    this.role = 'solo'
    this.hostId = null
    this.connectError = null
    this.netHint = null
    this.stuckSince = null
    this.publishPresence()
    this.sendToRenderer({ type: 'became-solo' }, Buffer.alloc(0))
    this.emitState()
  }

  private async tearDownTcp(): Promise<void> {
    for (const client of this.clients.values()) client.socket.destroy()
    this.clients.clear()
    this.hostSocket?.destroy()
    this.hostSocket = null
    this.hostReader = null
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
    })
    this.server = null
    this.tcpPort = 0
  }

  private onGuestSocket(socket: Socket): void {
    const reader = new FrameReader()
    let tracked: TrackedSocket | null = null
    socket.on('data', (chunk) => {
      try {
        const frames = reader.push(chunk)
        for (const frame of frames) {
          if (!tracked) {
            if (frame.msg.type !== 'hello') {
              socket.destroy()
              return
            }
            const id = String(frame.msg.peerId ?? randomUUID())
            const used = new Set([...this.clients.values()].map((c) => c.color))
            used.add(this.localColor)
            const color =
              typeof frame.msg.color === 'string' && !used.has(frame.msg.color)
                ? frame.msg.color
                : colorFor(id, used)
            tracked = {
              id,
              socket,
              reader,
              displayName: String(frame.msg.displayName ?? 'Guest'),
              color
            }
            this.clients.set(id, tracked)
            socket.write(
              encodeFrame({
                type: 'welcome',
                color,
                docs: this.docs,
                hostId: this.localPeerId
              })
            )
            this.emitState()
            this.sendToRenderer(
              {
                type: 'peer-joined',
                peerId: id,
                displayName: tracked.displayName,
                color
              },
              Buffer.alloc(0)
            )
            continue
          }
          const stamped = { ...frame.msg, peerId: tracked.id }
          this.sendToRenderer(stamped, frame.binary)
          this.broadcast(stamped, frame.binary, tracked.id)
        }
      } catch {
        socket.destroy()
      }
    })
    socket.on('close', () => {
      if (!tracked) return
      this.clients.delete(tracked.id)
      if (this.leaving) return
      this.emitState()
      this.sendToRenderer({ type: 'peer-left', peerId: tracked.id }, Buffer.alloc(0))
    })
    socket.on('error', () => socket.destroy())
  }

  private broadcast(msg: ControlMessage, binary: Buffer | undefined, exceptId: string | null): void {
    const buf = encodeFrame(msg, binary)
    for (const client of this.clients.values()) {
      if (client.id === exceptId) continue
      client.socket.write(buf)
    }
  }

  private publishPresence(): void {
    this.discovery.setPresence({
      peerId: this.localPeerId,
      displayName: this.displayName,
      startedAt: this.startedAt,
      role: this.role,
      tcpPort: this.role === 'host' ? this.tcpPort : null,
      hostId: this.hostId
    })
  }

  private rendererAlive(): boolean {
    return Boolean(this.win && !this.win.isDestroyed() && !this.win.webContents.isDestroyed())
  }

  private emitState(): void {
    if (this.leaving || !this.rendererAlive()) return
    const others = this.discovery.others()
    const status =
      this.connecting && !this.welcomed
        ? 'connecting'
        : this.role === 'host'
          ? 'hosting'
          : this.role === 'guest' && this.welcomed
            ? 'joined'
            : this.role === 'guest'
              ? 'connecting'
              : 'solo'
    const peers = this.role === 'guest' ? undefined : this.collectPeers()
    this.win!.webContents.send('collab:state', {
      status,
      role: this.role,
      localPeerId: this.localPeerId,
      localColor: this.localColor,
      startedAt: this.startedAt,
      peers,
      udpPeerCount: others.length,
      tcpPeerCount: this.role === 'host' ? this.clients.size : this.welcomed && this.hostSocket ? 1 : 0,
      connectError: this.connectError,
      netHint: this.netHint
    })
    if (this.role === 'host') {
      this.broadcast({ type: 'peer-list', peers: this.collectPeers() }, undefined, null)
    }
  }

  private updateStuckHint(udpOthers: number, tcpPeers: number): void {
    const stuck = udpOthers > 0 && tcpPeers === 0 && !this.connecting
    if (!stuck) {
      this.stuckSince = null
      return
    }
    if (!this.stuckSince) this.stuckSince = Date.now()
    if (Date.now() - this.stuckSince < 5000) return
    const next =
      this.role === 'host'
        ? 'こちらはハブですが、相手からの TCP が5秒以上届いていません。Windows ファイアウォールの受信許可、または無線 AP の端末間通信禁止（クライアント分離）を確認してください。'
        : 'LAN上の相手を検出していますが、TCP でつながっていません。ファイアウォール、AP の隔離、別サブネットの可能性があります。'
    if (this.netHint !== next) {
      this.netHint = next
      this.emitState()
    }
  }

  private collectPeers(): PeerInfo[] {
    const peers: PeerInfo[] = [
      {
        id: this.localPeerId,
        displayName: this.displayName || '自分',
        color: this.localColor,
        docId: null,
        docTitle: null
      }
    ]
    if (this.role === 'host') {
      for (const c of this.clients.values()) {
        peers.push({
          id: c.id,
          displayName: c.displayName,
          color: c.color,
          docId: null,
          docTitle: null
        })
      }
    } else if (this.role === 'solo') {
      for (const p of this.discovery.others()) {
        peers.push({
          id: p.peerId,
          displayName: p.displayName,
          color: colorFor(p.peerId, new Set()),
          docId: null,
          docTitle: null
        })
      }
    }
    return peers
  }

  private sendToRenderer(msg: ControlMessage, binary: Buffer): void {
    if (this.leaving || !this.rendererAlive()) return
    const copy = Buffer.from(binary)
    this.win!.webContents.send('collab:frame', {
      msg,
      binary: copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)
    })
  }
}
