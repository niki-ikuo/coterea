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
