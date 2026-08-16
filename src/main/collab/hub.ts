import { createServer, createConnection, type Server, type Socket } from 'net'
import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { FrameReader, encodeFrame, type ControlMessage } from './frame'
import { LanDiscovery } from './discovery'
import { PEER_COLORS, type DocMeta, type PeerInfo } from '../../shared/types'

type Role = 'idle' | 'host' | 'guest'

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
  private role: Role = 'idle'
  private roomId = ''
  private sessionName = ''
  private displayName = ''
  private localColor = PEER_COLORS[0]
  private server: Server | null = null
  private tcpPort = 0
  private hostSocket: Socket | null = null
  private hostReader: FrameReader | null = null
  private clients = new Map<string, TrackedSocket>()
  private discovery = new LanDiscovery()
  private docs: DocMeta[] = []
  private win: BrowserWindow | null = null
  private leaving = false

  attachWindow(win: BrowserWindow): void {
    this.win = win
  }

  getLocalPeer(): PeerInfo {
    return {
      id: this.localPeerId,
      displayName: this.displayName,
      color: this.localColor,
      docId: null,
      docTitle: null
    }
  }

  async startHost(displayName: string, sessionName: string): Promise<{ roomId: string; sessionName: string }> {
    await this.leave()
    this.displayName = displayName
    this.sessionName = sessionName
    this.role = 'host'
    this.roomId = this.makeRoomId()
    this.localColor = PEER_COLORS[0]
    this.docs = []

    await this.discovery.start()
    this.server = createServer((socket) => this.onGuestSocket(socket))
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject)
      this.server!.listen(0, '0.0.0.0', () => {
        const addr = this.server!.address()
        if (addr && typeof addr === 'object') this.tcpPort = addr.port
        resolve()
      })
    })
    this.discovery.advertise({
      roomId: this.roomId,
      sessionName: this.sessionName,
      tcpPort: this.tcpPort,
      hostId: this.localPeerId
    })
    this.emitPeers()
    return { roomId: this.roomId, sessionName: this.sessionName }
  }

  async join(roomId: string, displayName: string): Promise<{
    roomId: string
    sessionName: string
    docs: DocMeta[]
    color: string
  }> {
    await this.leave()
    this.displayName = displayName
    this.role = 'guest'
    this.roomId = roomId.toUpperCase().trim()
    await this.discovery.start()
    const ad = await this.discovery.findRoom(this.roomId)
    if (!ad) {
      this.role = 'idle'
      throw new Error('同一LAN上にその招待コードのセッションが見つかりませんでした')
    }
    this.sessionName = ad.sessionName
    this.localColor = colorFor(this.localPeerId, new Set([PEER_COLORS[0]]))

    let welcomed = false
    const docs = await new Promise<DocMeta[]>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('ホストからの応答がありません')), 4000)
        const socket = createConnection(
          { host: normalizeHost(ad.hostAddress), port: ad.tcpPort },
          () => {
        socket.write(
          encodeFrame({
            type: 'hello',
            roomId: this.roomId,
            peerId: this.localPeerId,
            displayName: this.displayName,
            color: this.localColor
          })
        )
      })
      this.hostSocket = socket
      this.hostReader = new FrameReader()
      socket.on('data', (chunk) => {
        try {
          const frames = this.hostReader!.push(chunk)
          for (const frame of frames) {
            if (frame.msg.type === 'welcome' && !welcomed) {
              welcomed = true
              clearTimeout(timer)
              const welcomeDocs = (frame.msg.docs as DocMeta[]) ?? []
              this.docs = welcomeDocs
              if (typeof frame.msg.color === 'string') this.localColor = frame.msg.color
              resolve(welcomeDocs)
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
        if (this.role === 'guest' && !this.leaving) {
          this.emitEnded('ホストとの接続が切れました。フェーズ1ではホスト切断でセッションが終了します。')
          void this.leave()
        }
      })
    })

    this.emitPeers()
    return { roomId: this.roomId, sessionName: this.sessionName, docs, color: this.localColor }
  }

  setSharedDocs(docs: DocMeta[]): void {
    this.docs = docs
    this.broadcast(
      { type: 'docs', docs },
      undefined,
      null
    )
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
    this.leaving = true
    this.discovery.stopAdvertising()
    for (const client of this.clients.values()) {
      client.socket.destroy()
    }
    this.clients.clear()
    this.hostSocket?.destroy()
    this.hostSocket = null
    this.hostReader = null
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve()
      this.server.close(() => resolve())
    })
    this.server = null
    this.role = 'idle'
    this.roomId = ''
    this.docs = []
    this.leaving = false
  }

  dispose(): void {
    void this.leave()
    this.discovery.close()
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
            if (frame.msg.roomId !== this.roomId) {
              socket.write(encodeFrame({ type: 'error', error: '招待コードが一致しません' }))
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
                sessionName: this.sessionName,
                color,
                docs: this.docs,
                hostId: this.localPeerId
              })
            )
            this.emitPeers()
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
      this.emitPeers()
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

  private emitPeers(): void {
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
      this.broadcast({ type: 'peer-list', peers }, undefined, null)
    }
    this.win?.webContents.send('collab:peer-update', { peers })
  }

  private sendToRenderer(msg: ControlMessage, binary: Buffer): void {
    const copy = Buffer.from(binary)
    this.win?.webContents.send('collab:frame', {
      msg,
      binary: copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength)
    })
  }

  private emitEnded(reason: string): void {
    this.win?.webContents.send('collab:ended', { reason })
  }

  private makeRoomId(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let id = ''
    for (let i = 0; i < 6; i++) {
      id += alphabet[Math.floor(Math.random() * alphabet.length)]
    }
    return id
  }
}
