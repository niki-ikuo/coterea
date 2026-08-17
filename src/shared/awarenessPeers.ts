export type AwarenessUser = {
  name?: string
  color?: string
  peerId?: string
}

export type AwarenessState = {
  user?: AwarenessUser
}

export function clientIdsForPeer(
  states: Iterable<[number, AwarenessState]>,
  peerId: string,
  localClientId?: number
): number[] {
  const ids: number[] = []
  for (const [clientId, state] of states) {
    if (localClientId !== undefined && clientId === localClientId) continue
    if (state.user?.peerId === peerId) ids.push(clientId)
  }
  return ids
}

export class AwarenessPeerIndex {
  private byPeer = new Map<string, Set<number>>()

  note(peerId: string, clientIds: Iterable<number>): void {
    if (!peerId) return
    let set = this.byPeer.get(peerId)
    if (!set) {
      set = new Set()
      this.byPeer.set(peerId, set)
    }
    for (const id of clientIds) set.add(id)
  }

  idsOf(peerId: string): number[] {
    return [...(this.byPeer.get(peerId) ?? [])]
  }

  forgetPeer(peerId: string): number[] {
    const ids = this.idsOf(peerId)
    this.byPeer.delete(peerId)
    for (const set of this.byPeer.values()) {
      for (const id of ids) set.delete(id)
    }
    return ids
  }

  clear(): void {
    this.byPeer.clear()
  }
}

export function collectAwarenessClientIds(
  states: Iterable<[number, AwarenessState]>,
  fromPeerId: string | undefined,
  previousIds: ReadonlySet<number>,
  localClientId: number
): number[] {
  const ids: number[] = []
  for (const [clientId, state] of states) {
    if (clientId === localClientId) continue
    if (fromPeerId && state.user?.peerId === fromPeerId) {
      ids.push(clientId)
      continue
    }
    if (fromPeerId && !previousIds.has(clientId) && !state.user?.peerId) {
      ids.push(clientId)
    }
  }
  return ids
}
