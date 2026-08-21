export type FileOffer = {
  docId: string
  keys: string[]
  title: string
  language: string
}

export function fileIdsOf(tab: { fileIds?: string[] }): string[] {
  return tab.fileIds ?? []
}

export function offerKeys(offer: FileOffer & { key?: string }): string[] {
  if (offer.keys?.length) return offer.keys
  if (offer.key) return [offer.key]
  return []
}

export function idsOverlap(a: string[] | undefined, b: string[] | undefined): boolean {
  if (!a?.length || !b?.length) return false
  const other = new Set(b)
  return a.some((id) => other.has(id))
}

export function earlierPeer(
  a: { peerId: string; startedAt: number },
  b: { peerId: string; startedAt: number }
): boolean {
  if (a.startedAt !== b.startedAt) return a.startedAt < b.startedAt
  return a.peerId < b.peerId
}

export function electFileSaver(
  me: { peerId: string; startedAt: number },
  remotes: Array<{ peerId: string; startedAt: number }>,
  keys: string[]
): { peerId: string; startedAt: number } | null {
  if (keys.length === 0 || remotes.length === 0) return null
  return remotes.reduce((best, cur) => (earlierPeer(cur, best) ? cur : best), me)
}

export function fileSessionSyncKey(syncGen: number, keys: string[], docId: string): string {
  return `${syncGen}|${[...keys].sort().join('|')}|${docId}`
}

export function shouldApplyCollabSnapshot(appliedDocIds: Set<string>, docId: string): boolean {
  return Boolean(docId) && !appliedDocIds.has(docId)
}

export function messageKeys(msg: Record<string, unknown>): string[] {
  if (Array.isArray(msg.keys) && msg.keys.every((k) => typeof k === 'string')) return msg.keys
  if (typeof msg.key === 'string') return [msg.key]
  return []
}

/** 接続できているのに同一実体が重ならないときの説明。共有中なら null。 */
export function collabSyncHint(input: {
  connected: boolean
  sharedTitles: string[]
  localTitles: string[]
  remoteTitles: string[]
}): { identityHint: string | null; remoteFileTitles: string[] } {
  const remotes = [...new Set(input.remoteTitles)]
  if (!input.connected) return { identityHint: null, remoteFileTitles: remotes }
  if (input.sharedTitles.length > 0) return { identityHint: null, remoteFileTitles: remotes }
  if (input.localTitles.length === 0 && remotes.length === 0) {
    return {
      identityHint:
        '接続はできていますが、同期できるファイルがありません。無題バッファは同期しません。ネットワーク共有上の同じファイルを双方で開いてください。',
      remoteFileTitles: remotes
    }
  }
  if (input.localTitles.length > 0 && remotes.length === 0) {
    return {
      identityHint:
        '相手は共有できるファイルを開いていません。無題バッファは同期しません。同じ実体のファイルを双方で開いてください。',
      remoteFileTitles: remotes
    }
  }
  if (input.localTitles.length === 0 && remotes.length > 0) {
    return {
      identityHint: `相手は「${remotes.join('、')}」を開いていますが、こちらに同じ実体がありません。ネットワーク共有上の同じファイルを開いてください。`,
      remoteFileTitles: remotes
    }
  }
  return {
    identityHint:
      '接続はできていますが、開いているファイルは同一実体ではありません。別PCのローカルコピー（同名でも C:\\… 同士など）は同期しません。ネットワーク共有上の同じファイルを双方で開いてください。',
    remoteFileTitles: remotes
  }
}
