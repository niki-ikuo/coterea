import { afterEach, describe, expect, it } from 'vitest'
import { COLLAB_MAGIC } from '../../shared/types'
import { LanDiscovery, type Presence } from './discovery'
import { CollabHub } from './hub'

class QuietDiscovery extends LanDiscovery {
  async start(): Promise<void> {
    /* UDP を束縛せず、seed だけで相手を見せる */
  }
}

function presenceOf(hub: CollabHub, displayName: string): Presence {
  const snap = hub.inspect()
  return {
    magic: COLLAB_MAGIC,
    type: 'presence',
    peerId: snap.localPeerId,
    displayName,
    startedAt: snap.startedAt,
    role: snap.role,
    tcpPort: snap.role === 'host' ? snap.tcpPort : null,
    hostId: snap.role === 'host' ? snap.localPeerId : null,
    hostAddress: '127.0.0.1'
  }
}

describe('CollabHub TCP', () => {
  const hubs: CollabHub[] = []

  afterEach(async () => {
    for (const hub of hubs.splice(0)) hub.dispose()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })

  it('最古参がハブになり、相手が TCP で参加する', async () => {
    const olderDiscovery = new QuietDiscovery()
    const newerDiscovery = new QuietDiscovery()
    const older = new CollabHub(olderDiscovery, 1)
    const newer = new CollabHub(newerDiscovery, 2)
    hubs.push(older, newer)
    await older.enable('old')
    await newer.enable('new')

    olderDiscovery.seed([presenceOf(newer, 'new')])
    newerDiscovery.seed([presenceOf(older, 'old')])
    await older.tickNow()
    await newer.tickNow()
    expect(older.inspect().role).toBe('host')
    expect(older.inspect().tcpPort).toBeGreaterThan(0)

    newerDiscovery.seed([presenceOf(older, 'old')])
    await newer.tickNow()
    expect(newer.inspect().role).toBe('guest')
    expect(newer.inspect().welcomed).toBe(true)
    expect(older.inspect().clientCount).toBe(1)
  })

  it('ハブが落ちたら残りの最古参が引き継ぎ、相手が参加する', async () => {
    const aDiscovery = new QuietDiscovery()
    const bDiscovery = new QuietDiscovery()
    const cDiscovery = new QuietDiscovery()
    const a = new CollabHub(aDiscovery, 1)
    const b = new CollabHub(bDiscovery, 2)
    const c = new CollabHub(cDiscovery, 3)
    hubs.push(a, b, c)
    await a.enable('a')
    await b.enable('b')
    await c.enable('c')

    aDiscovery.seed([presenceOf(b, 'b')])
    bDiscovery.seed([presenceOf(a, 'a')])
    await a.tickNow()
    await b.tickNow()
    expect(a.inspect().role).toBe('host')
    bDiscovery.seed([presenceOf(a, 'a')])
    await b.tickNow()
    expect(b.inspect().welcomed).toBe(true)

    a.dispose()
    hubs.splice(hubs.indexOf(a), 1)
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(b.inspect().role).toBe('solo')

    bDiscovery.seed([presenceOf(c, 'c')])
    cDiscovery.seed([presenceOf(b, 'b')])
    await b.tickNow()
    await c.tickNow()
    expect(b.inspect().role).toBe('host')
    expect(b.inspect().tcpPort).toBeGreaterThan(0)

    cDiscovery.seed([presenceOf(b, 'b')])
    await c.tickNow()
    expect(c.inspect().role).toBe('guest')
    expect(c.inspect().welcomed).toBe(true)
    expect(b.inspect().clientCount).toBe(1)
  })
})
