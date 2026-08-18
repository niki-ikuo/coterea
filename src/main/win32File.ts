import { address, inout, load, out, pointer, struct } from 'koffi'
import { applyDosDeviceToDrivePath, parseDosDeviceTarget, stripExtended } from '../shared/fileIdentityCore'

export { parseDosDeviceTarget, stripExtended }

const GENERIC_NONE = 0
const FILE_SHARE_ALL = 0x00000007
const OPEN_EXISTING = 3
const FILE_FLAG_BACKUP_SEMANTICS = 0x02000000
const VOLUME_NAME_DOS = 0
const FILE_NAME_NORMALIZED = 0
const DRIVE_REMOTE = 4
const INVALID_HANDLE = 0xffffffffffffffffn

const kernel32 = load('kernel32.dll')

const CreateFileW = kernel32.func(
  'void * __stdcall CreateFileW(str16 lpFileName, uint32 dwDesiredAccess, uint32 dwShareMode, void *lpSecurityAttributes, uint32 dwCreationDisposition, uint32 dwFlagsAndAttributes, void *hTemplateFile)'
)
const CloseHandle = kernel32.func('int __stdcall CloseHandle(void *hObject)')
const GetFinalPathNameByHandleW = kernel32.func(
  'uint32 __stdcall GetFinalPathNameByHandleW(void *hFile, uint8 *lpszFilePath, uint32 cchFilePath, uint32 dwFlags)'
)
const FILETIME = struct('FILETIME', {
  dwLowDateTime: 'uint32',
  dwHighDateTime: 'uint32'
})
const BY_HANDLE_FILE_INFORMATION = struct('BY_HANDLE_FILE_INFORMATION', {
  dwFileAttributes: 'uint32',
  ftCreationTime: FILETIME,
  ftLastAccessTime: FILETIME,
  ftLastWriteTime: FILETIME,
  dwVolumeSerialNumber: 'uint32',
  nFileSizeHigh: 'uint32',
  nFileSizeLow: 'uint32',
  nNumberOfLinks: 'uint32',
  nFileIndexHigh: 'uint32',
  nFileIndexLow: 'uint32'
})

const GetFileInformationByHandle = kernel32.func('__stdcall', 'GetFileInformationByHandle', 'int', [
  'void *',
  out(pointer(BY_HANDLE_FILE_INFORMATION))
])
const QueryDosDeviceW = kernel32.func(
  'uint32 __stdcall QueryDosDeviceW(str16 lpDeviceName, uint8 *lpTargetPath, uint32 ucchMax)'
)
const GetDriveTypeW = kernel32.func('uint32 __stdcall GetDriveTypeW(str16 lpRootPathName)')

const UNIVERSAL_NAME_INFO_LEVEL = 1
const mpr = load('mpr.dll')
const WNetGetUniversalNameW = mpr.func('__stdcall', 'WNetGetUniversalNameW', 'uint32', [
  'str16',
  'uint32',
  'uint8 *',
  inout(pointer('uint32'))
])

export type HandleInfo = {
  finalPath: string
  remote: boolean
  volumeSerial: number
  fileIndex: bigint
}

function handleAddress(handle: unknown): bigint {
  try {
    return BigInt(address(handle))
  } catch {
    return 0n
  }
}

function readUtf16(buf: Buffer, charCount: number): string {
  if (charCount <= 0) return ''
  return buf.toString('utf16le', 0, charCount * 2).replace(/\0+$/g, '')
}

function toLongPath(filePath: string): string {
  const normalized = filePath.replace(/\//g, '\\')
  if (normalized.startsWith('\\\\?\\')) return normalized
  if (normalized.startsWith('\\\\')) return `\\\\?\\UNC\\${normalized.slice(2)}`
  return `\\\\?\\${normalized}`
}

function queryDosDevice(letter: string): string {
  const buf = Buffer.alloc(4096)
  const n = QueryDosDeviceW(`${letter.toUpperCase()}:`, buf, buf.length / 2)
  return n > 0 ? readUtf16(buf, n) : ''
}

function wnetUniversalName(localPath: string): string {
  try {
    const buf = Buffer.alloc(4096)
    const size = [buf.length]
    const err = WNetGetUniversalNameW(localPath, UNIVERSAL_NAME_INFO_LEVEL, buf, size)
    if (err !== 0) return ''
    const text = buf.toString('utf16le')
    const idx = text.indexOf('\\\\')
    if (idx < 0) return ''
    const end = text.indexOf('\0', idx)
    const unc = text.slice(idx, end >= 0 ? end : undefined).trim()
    return unc.startsWith('\\\\') ? unc : ''
  } catch {
    return ''
  }
}

function expandDrivePath(winPath: string, depth = 0): string {
  if (depth > 6) return winPath
  const match = winPath.match(/^([A-Za-z]):\\(.*)$/)
  if (!match) return winPath
  if (GetDriveTypeW(`${match[1].toUpperCase()}:\\`) === DRIVE_REMOTE) {
    const universal = wnetUniversalName(winPath)
    if (universal) return stripExtended(universal.replace(/\//g, '\\'))
  }
  const parsed = applyDosDeviceToDrivePath(winPath, queryDosDevice(match[1]))
  if (!parsed) return winPath
  if (parsed !== winPath && /^[A-Za-z]:\\/.test(parsed)) return expandDrivePath(parsed, depth + 1)
  return parsed
}

export function isRemotePath(winPath: string): boolean {
  if (winPath.startsWith('\\\\')) return true
  const match = winPath.match(/^([A-Za-z]):\\/)
  if (!match) return false
  return GetDriveTypeW(`${match[1].toUpperCase()}:\\`) === DRIVE_REMOTE
}

export function inspectFileHandle(filePath: string): HandleInfo | null {
  const handle = CreateFileW(
    toLongPath(filePath),
    GENERIC_NONE,
    FILE_SHARE_ALL,
    null,
    OPEN_EXISTING,
    FILE_FLAG_BACKUP_SEMANTICS,
    null
  )
  if (!handle || handleAddress(handle) === INVALID_HANDLE) return null
  try {
    const pathBuf = Buffer.alloc(32768 * 2)
    const chars = GetFinalPathNameByHandleW(
      handle,
      pathBuf,
      32768,
      VOLUME_NAME_DOS | FILE_NAME_NORMALIZED
    )
    if (chars === 0) return null
    let finalPath = stripExtended(readUtf16(pathBuf, chars).replace(/\//g, '\\'))
    finalPath = expandDrivePath(finalPath)
    if (/^[A-Za-z]:\\/.test(finalPath) && isRemotePath(finalPath)) {
      const fromOpened = expandDrivePath(stripExtended(filePath.replace(/\//g, '\\')))
      if (fromOpened.startsWith('\\\\')) finalPath = fromOpened
    }

    const info = {
      dwFileAttributes: 0,
      ftCreationTime: { dwLowDateTime: 0, dwHighDateTime: 0 },
      ftLastAccessTime: { dwLowDateTime: 0, dwHighDateTime: 0 },
      ftLastWriteTime: { dwLowDateTime: 0, dwHighDateTime: 0 },
      dwVolumeSerialNumber: 0,
      nFileSizeHigh: 0,
      nFileSizeLow: 0,
      nNumberOfLinks: 0,
      nFileIndexHigh: 0,
      nFileIndexLow: 0
    }
    const ok = GetFileInformationByHandle(handle, info)
    if (!ok) return null
    const volumeSerial = info.dwVolumeSerialNumber >>> 0
    const fileIndex = (BigInt(info.nFileIndexHigh >>> 0) << 32n) | BigInt(info.nFileIndexLow >>> 0)
    return {
      finalPath,
      remote: isRemotePath(finalPath),
      volumeSerial,
      fileIndex
    }
  } finally {
    CloseHandle(handle)
  }
}
