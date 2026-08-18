export type SettingsSection = 'general' | 'appearance' | 'ai'

const listeners = new Set<(section: SettingsSection) => void>()
let wanted: SettingsSection = 'general'
let saver: (() => Promise<boolean>) | null = null
let revert: (() => Promise<void>) | null = null

export function requestedSettingsSection(): SettingsSection {
  return wanted
}

export function requestSettingsSection(section: SettingsSection): void {
  wanted = section
  for (const fn of listeners) fn(section)
}

export function onSettingsSection(fn: (section: SettingsSection) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function setSettingsSaver(next: (() => Promise<boolean>) | null): void {
  saver = next
}

export function setSettingsReverter(next: (() => Promise<void>) | null): void {
  revert = next
}

export async function saveOpenSettings(): Promise<boolean> {
  if (!saver) return true
  return saver()
}

export async function revertOpenSettings(): Promise<void> {
  if (revert) await revert()
}
