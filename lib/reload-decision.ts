import { basename, extname } from 'node:path'
import type { FileReloadInfo } from './protocol.ts'

export type ReloadDecision =
  | { type: 'reload' }
  | { type: 'file-reload'; files: FileReloadInfo[] }

/** Source maps are debugging metadata and never require a browser update. */
export function filterReloadFiles (files: string[]): string[] {
  return files.filter(file => extname(file).toLowerCase() !== '.map')
}

export function getReloadDecision (
  files: string[] | undefined,
  injectChanges: boolean,
  injectFileTypes: string[],
  event = 'change'
): ReloadDecision {
  if (!injectChanges || !files?.length) return { type: 'reload' }

  const normalizedInjectTypes = new Set(injectFileTypes.map(ext => ext.toLowerCase()))
  const fileInfos = files.map(file => getFileReloadInfo(file, normalizedInjectTypes, event))

  if (fileInfos.some(file => file.type === 'reload')) {
    return { type: 'reload' }
  }

  return { type: 'file-reload', files: fileInfos }
}

export function getFileReloadInfo (file: string, injectFileTypes: Set<string> | string[], event = 'change'): FileReloadInfo {
  const ext = extname(file).replace(/^\./, '').toLowerCase()
  const type = injectFileTypes instanceof Set
    ? injectFileTypes.has(ext)
    : injectFileTypes.map(item => item.toLowerCase()).includes(ext)

  const info: FileReloadInfo = {
    ext,
    path: file,
    basename: basename(file),
    event,
    type: type ? 'inject' : 'reload',
  }

  if (info.type === 'reload') info.url = file
  return info
}
