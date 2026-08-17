import { createServer, createConnection, type Server, type Socket } from 'net'
import { randomUUID } from 'crypto'
import { networkInterfaces } from 'os'
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

function ipv4Addresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.internal) continue
      if (info.family === 'IPv4' || (info.family as unknown) === 4) out.push(info.address)
    }
  }
  return out.length > 0 ? out : ['127.0.0.1']
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
  private holdHost = false
  private filePresence = new Map<string, { docId: string | null; docTitle: string | null }>()
  private failedHosts = new Map<string, number>()
  private lastHost: { peerId: string; tcpPort: number; hostAddress: string } | null = null

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
    if (msg.type === 'presence') this.noteFilePresence(this.localPeerId, msg)
    if (this.role === 'host') {
      this.broadcast(stamped, binary, null)
    } else if (this.role === 'guest' && this.hostSocket) {
      this.hostSocket.write(encodeFrame(stamped, binary))
    }
  }

  async leave(): Promise<void> {
    this.holdHost = false
    const was = this.role
    this.role = 'solo'
    this.welcomed = false
    this.hostId = null
    this.filePresence.clear()
    this.connectError = null
    this.netHint = null
    this.stuckSince = null
    await this.tearDownTcp()
    this.publishPresence()
    if (was === 'host' || was === 'guest') {
      this.sendToRenderer({ type: 'became-solo' }, Buffer.alloc(0))
    }
    this.emitState()
  }

  async startHost(): Promise<{ ok: true; tcpPort: number } | { ok: false; error: string }> {
    if (this.role === 'guest') {
      return { ok: false, error: '参加中はハブになれません。先に切断してください。' }
    }
    this.holdHost = true
    if (this.role !== 'host') await this.becomeHost()
    if (this.role !== 'host' || this.tcpPort === 0) {
      this.holdHost = false
      return { ok: false, error: 'ハブを起動できませんでした。' }
    }
    this.emitState()
    return { ok: true, tcpPort: this.tcpPort }
  }

  async joinManual(
    host: string,
    port: number
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (this.role === 'host') {
      return { ok: false, error: 'ハブ中は他へ接続できません。先にハブを停止してください。' }
    }
    if (this.role === 'guest' || this.connecting) {
      return { ok: false, error: 'すでに接続中です。' }
    }
    const address = normalizeHost(host)
    if (!address || !Number.isInteger(port) || port < 1 || port > 65535) {
      return { ok: false, error: 'アドレスまたはポートが不正です。' }
    }
    this.holdHost = false
    await this.connectAsGuest({
      magic: '',
      type: 'presence',
      peerId: `manual:${address}:${port}`,
      displayName: address,
      startedAt: 0,
      role: 'host',
      tcpPort: port,
      hostId: null,
      hostAddress: address
    })
    if (this.welcomed && this.hostSocket) return { ok: true }
    return { ok: false, error: this.connectError ?? 'ハブへの接続に失敗しました。' }
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
    const viable = this.viableOthers(others)

    if (this.role === 'host') {
      this.updateStuckHint(viable.length, this.clients.size)
      if (this.clients.size === 0 && viable.length === 0 && !this.holdHost) {
        void this.demoteToSolo()
      }
      return
    }

    if (this.role === 'guest') {
      this.updateStuckHint(viable.length, this.hostSocket ? 1 : 0)
      return
    }

    this.clearSoloErrorIfAlone(viable.length)

    const liveHost = viable.find((p) => p.role === 'host' && p.tcpPort)
    if (liveHost) {
      void this.connectAsGuest(liveHost)
      return
    }

    this.updateStuckHint(viable.length, 0)

    const members = [
      { peerId: this.localPeerId, startedAt: this.startedAt },
      ...viable.map((p) => ({ peerId: p.peerId, startedAt: p.startedAt }))
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
    this.lastHost = {
      peerId: host.peerId,
      tcpPort: host.tcpPort as number,
      hostAddress: normalizeHost(host.hostAddress)
    }
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
                this.emitState()
                this.sendToRenderer({ type: 'became-guest', docs: this.docs }, Buffer.alloc(0))
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
      if (this.lastHost) this.markHostFailed(this.lastHost)
      const stillHavePeers = this.viableOthers(this.discovery.others()).length > 0
      if (stillHavePeers) {
        this.connectError =
          err instanceof Error && err.message === 'ホストからの応答がありません'
            ? 'ハブへの TCP 接続がタイムアウトしました。Windows ファイアウォールで Coterea を許可するか、無線 AP の端末間通信禁止（クライアント分離）を確認してください。'
            : 'ハブへの TCP 接続に失敗しました。ファイアウォール、AP の隔離、別サブネットの可能性があります。'
        this.netHint = this.connectError
      } else {
        this.connectError = null
        this.netHint = null
      }
      this.publishPresence()
      this.emitState()
    } finally {
      this.connecting = false
      this.emitState()
    }
  }

  private onHostLost(): void {
    if (this.lastHost) this.markHostFailed(this.lastHost)
    this.hostSocket = null
    this.hostReader = null
    this.hostId = null
    this.role = 'solo'
    this.welcomed = false
    this.filePresence.clear()
    this.connectError = null
    this.netHint = null
    this.stuckSince = null
    this.publishPresence()
    this.sendToRenderer({ type: 'host-lost' }, Buffer.alloc(0))
    this.emitState()
  }

  private async demoteToSolo(): Promise<void> {
    this.holdHost = false
    await this.tearDownTcp()
    this.role = 'solo'
    this.hostId = null
    this.filePresence.clear()
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
            this.broadcast({ type: 'presence-request' }, undefined, id)
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
          if (frame.msg.type === 'presence') this.noteFilePresence(tracked.id, frame.msg)
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
      this.filePresence.delete(tracked.id)
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
      udpPeerCount: this.viableOthers(others).length,
      tcpPeerCount: this.role === 'host' ? this.clients.size : this.welcomed && this.hostSocket ? 1 : 0,
      connectError: this.connectError,
      netHint: this.netHint,
      tcpPort: this.role === 'host' ? this.tcpPort : 0,
      listenAddresses: this.role === 'host' ? ipv4Addresses() : [],
      holdHost: this.holdHost
    })
    if (this.role === 'host') {
      this.broadcast({ type: 'peer-list', peers: this.collectPeers() }, undefined, null)
    }
  }

  private hostFailKey(host: { peerId: string; tcpPort: number; hostAddress: string }): string {
    return `${host.peerId}|${host.hostAddress}|${host.tcpPort}`
  }

  private markHostFailed(host: { peerId: string; tcpPort: number; hostAddress: string }): void {
    this.failedHosts.set(this.hostFailKey(host), Date.now() + 12_000)
  }

  private pruneFailedHosts(): void {
    const now = Date.now()
    for (const [key, until] of this.failedHosts) {
      if (until <= now) this.failedHosts.delete(key)
    }
  }

  private viableOthers(others: ReturnType<LanDiscovery['others']>): ReturnType<LanDiscovery['others']> {
    this.pruneFailedHosts()
    return others.filter((peer) => {
      if (!peer.tcpPort || !peer.hostAddress) return true
      return !this.failedHosts.has(
        this.hostFailKey({
          peerId: peer.peerId,
          tcpPort: peer.tcpPort,
          hostAddress: normalizeHost(peer.hostAddress)
        })
      )
    })
  }

  private clearSoloErrorIfAlone(viableCount: number): void {
    if (this.role !== 'solo' || viableCount > 0) return
    if (!this.connectError && !this.netHint) return
    this.connectError = null
    this.netHint = null
    this.stuckSince = null
    this.emitState()
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

  private noteFilePresence(peerId: string, msg: ControlMessage): void {
    this.filePresence.set(peerId, {
      docId: typeof msg.docId === 'string' ? msg.docId : null,
      docTitle: typeof msg.docTitle === 'string' ? msg.docTitle : null
    })
  }

  private withFilePresence(
    peer: Omit<PeerInfo, 'docId' | 'docTitle'>
  ): PeerInfo {
    const extra = this.filePresence.get(peer.id)
    return {
      ...peer,
      docId: extra?.docId ?? null,
      docTitle: extra?.docTitle ?? null
    }
  }

  private collectPeers(): PeerInfo[] {
    const peers: PeerInfo[] = [
      this.withFilePresence({
        id: this.localPeerId,
        displayName: this.displayName || '自分',
        color: this.localColor
      })
    ]
    if (this.role === 'host') {
      for (const c of this.clients.values()) {
        peers.push(
          this.withFilePresence({
            id: c.id,
            displayName: c.displayName,
            color: c.color
          })
        )
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
